"""Claude Fable client wrapper — the shared reasoning engine for every agent.

Two responsibilities:

1. Hold a single Anthropic client and inject the desk-wide system framing.
2. Coerce model output into a validated Pydantic schema. Agents ask for a
   ``schema`` and get back a typed object, never a raw string they must parse.
   We use tool-calling to force structured output, with one plain-JSON retry
   fallback for robustness.
"""

from __future__ import annotations

import json
import logging
from typing import Type, TypeVar

from pydantic import BaseModel, ValidationError

from ..config import Settings, get_settings

log = logging.getLogger("hedgedesk.llm")

T = TypeVar("T", bound=BaseModel)

DESK_SYSTEM = (
    "You are a senior member of a systematic hedge-fund investment desk. You "
    "reason like an institutional fiduciary: evidence over narrative, base "
    "rates over stories, and explicit about what would change your mind. You "
    "never fabricate data — if a metric is missing you say so and lower your "
    "conviction. You are terse and quantitative."
)


class ClaudeClient:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._client = None  # lazy: don't require the SDK/key just to import

    def _ensure(self):
        if self._client is None:
            try:
                import anthropic
            except ImportError as exc:  # pragma: no cover
                raise RuntimeError(
                    "anthropic SDK not installed — `pip install anthropic`"
                ) from exc
            self._client = anthropic.Anthropic(api_key=self.settings.anthropic_api_key)
        return self._client

    def complete(self, prompt: str, *, system: str | None = None) -> str:
        """Free-text completion (used for debate turns and narrative synthesis)."""
        client = self._ensure()
        resp = client.messages.create(
            model=self.settings.model,
            max_tokens=self.settings.max_tokens,
            temperature=self.settings.temperature,
            system=system or DESK_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        )
        return "".join(block.text for block in resp.content if block.type == "text")

    def complete_json(
        self,
        prompt: str,
        schema: Type[T],
        *,
        system: str | None = None,
        context: dict | None = None,   # ignored by the LLM; used by HeuristicEngine
    ) -> T:
        """Force the model to return an instance of ``schema``.

        Implemented with a single-tool constraint so the model must emit a JSON
        object matching the schema. Validates with Pydantic; on a validation or
        transport hiccup, retries once asking for raw JSON.
        """
        client = self._ensure()
        tool = {
            "name": "record",
            "description": f"Return the analysis as a {schema.__name__} object.",
            "input_schema": schema.model_json_schema(),
        }
        try:
            resp = client.messages.create(
                model=self.settings.model,
                max_tokens=self.settings.max_tokens,
                temperature=self.settings.temperature,
                system=system or DESK_SYSTEM,
                tools=[tool],
                tool_choice={"type": "tool", "name": "record"},
                messages=[{"role": "user", "content": prompt}],
            )
            for block in resp.content:
                if block.type == "tool_use":
                    return schema.model_validate(block.input)
            raise ValueError("model did not call the record tool")
        except (ValidationError, ValueError) as exc:
            log.warning("structured call failed (%s); retrying as raw JSON", exc)
            raw = self.complete(
                prompt
                + "\n\nReturn ONLY a JSON object matching this schema, no prose:\n"
                + json.dumps(schema.model_json_schema()),
                system=system,
            )
            return schema.model_validate_json(_extract_json(raw))


def _extract_json(text: str) -> str:
    """Pull the first balanced JSON object out of a possibly chatty reply."""
    start = text.find("{")
    if start == -1:
        raise ValueError(f"no JSON object in model reply: {text[:200]!r}")
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    raise ValueError("unbalanced JSON in model reply")
