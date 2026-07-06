"""Base agent: the common shell every seat inherits."""

from __future__ import annotations

from ..llm.client import ClaudeClient


class Agent:
    """Thin base — holds the shared LLM client and a stable name for auditing.

    Concrete agents implement ``run(...)`` with their own typed signature. The
    base intentionally does *not* impose a single run signature: an analyst
    consumes a data slice, the Risk Manager consumes a ticket. Uniformity lives
    in the return types (schemas), not the call shapes.
    """

    name: str = "agent"

    def __init__(self, llm: ClaudeClient | None = None) -> None:
        self.llm = llm or ClaudeClient()
