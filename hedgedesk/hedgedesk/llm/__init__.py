"""LLM / reasoning layer.

``build_reasoner`` picks the engine automatically:
  * ANTHROPIC_API_KEY set  -> ClaudeClient (full Claude Fable committee)
  * no key                 -> HeuristicEngine (deterministic, runs with no secret)

So the desk is usable out of the box and upgrades itself the moment a key exists.
"""

from __future__ import annotations

import logging

from ..config import Settings, get_settings
from .client import ClaudeClient
from .heuristic import HeuristicEngine

log = logging.getLogger("hedgedesk.llm")


def build_reasoner(settings: Settings | None = None):
    settings = settings or get_settings()
    if settings.anthropic_api_key:
        log.info("reasoning engine: Claude Fable (%s)", settings.model)
        return ClaudeClient(settings)
    log.warning(
        "no ANTHROPIC_API_KEY — running in HEURISTIC mode: verdicts are rule-based, "
        "not full LLM analysis. Live data is unaffected. Set the key for the full committee."
    )
    return HeuristicEngine()


__all__ = ["ClaudeClient", "HeuristicEngine", "build_reasoner"]
