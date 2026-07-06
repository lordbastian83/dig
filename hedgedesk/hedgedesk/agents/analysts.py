"""The analyst desk — 7 seats, one class, data-driven by ``ANALYST_SPECS``.

Rather than seven near-identical files, each seat is the same ``AnalystAgent``
parameterised by its spec (seat name, OpenBB slice, mandate). This keeps the
seven lenses genuinely distinct in prompt + data while sharing one tested code
path. ``build_analyst_desk()`` returns the full roster the orchestrator fans out.
"""

from __future__ import annotations

from ..orchestration.schemas import AnalystReport
from ..prompts.analysts import ANALYST_SPECS, ANALYST_SYSTEM, AnalystSpec, analyst_prompt
from .base import Agent


class AnalystAgent(Agent):
    def __init__(self, spec: AnalystSpec, llm=None) -> None:
        super().__init__(llm)
        self.spec = spec
        self.name = spec.key

    def run(self, ticker: str, data: dict) -> AnalystReport:
        report = self.llm.complete_json(
            analyst_prompt(self.spec, ticker, data),
            AnalystReport,
            system=ANALYST_SYSTEM.format(seat=self.spec.seat),
            context={"spec_key": self.spec.key, "ticker": ticker, "data": data},
        )
        # Trust the seat identity from the registry, not the model's echo.
        report.agent = self.spec.key
        report.ticker = ticker
        return report


def build_analyst_desk(llm=None) -> list[AnalystAgent]:
    """Instantiate all seven analyst seats."""
    return [AnalystAgent(spec, llm) for spec in ANALYST_SPECS]
