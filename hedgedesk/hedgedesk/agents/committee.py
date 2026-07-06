"""Investment committee: Bull, Bear, and the Moderator that runs the debate."""

from __future__ import annotations

import json

from ..orchestration.schemas import AnalystReport, DebateResult, DebateTurn
from ..prompts.committee import (
    BEAR_PROMPT,
    BULL_PROMPT,
    DEBATE_JUDGE_PROMPT,
    opponent_block,
)
from .base import Agent


def _dossier(reports: list[AnalystReport]) -> str:
    """Render the 7 analyst reports into the compact brief both sides debate."""
    lines = []
    for r in reports:
        pts = "; ".join(r.key_points) or "—"
        lines.append(
            f"[{r.agent}] {r.signal.value} (conv {r.conviction:.2f}) — {pts}"
        )
    return "\n".join(lines)


class _Researcher(Agent):
    prompt = ""  # overridden

    def argue(
        self,
        ticker: str,
        dossier: str,
        round_idx: int,
        total_rounds: int,
        prior_argument: str | None,
    ) -> str:
        round_label = f"round {round_idx + 1} of {total_rounds}"
        rebut_hint = "" if prior_argument is None else " (quoted above)"
        return self.llm.complete(
            self.prompt.format(
                ticker=ticker,
                dossier=dossier,
                opponent_block=opponent_block(prior_argument),
                round_label=round_label,
                rebut_hint=rebut_hint,
            )
        )


class BullResearcher(_Researcher):
    name = "bull_researcher"
    prompt = BULL_PROMPT


class BearResearcher(_Researcher):
    name = "bear_researcher"
    prompt = BEAR_PROMPT


class DebateModerator(Agent):
    """Runs the alternating debate loop and adjudicates the transcript.

    Bull opens, Bear responds, then they rebut for ``rounds`` exchanges. Each
    side always sees the opponent's most recent argument, so this is a genuine
    back-and-forth, not two monologues.
    """

    name = "debate_moderator"

    def __init__(self, llm=None, rounds: int = 2) -> None:
        super().__init__(llm)
        self.rounds = rounds
        self.bull = BullResearcher(self.llm)
        self.bear = BearResearcher(self.llm)

    def run(self, ticker: str, reports: list[AnalystReport]) -> DebateResult:
        dossier = _dossier(reports)
        turns: list[DebateTurn] = []
        last_bull: str | None = None
        last_bear: str | None = None

        for i in range(self.rounds):
            bull_arg = self.bull.argue(ticker, dossier, i, self.rounds, last_bear)
            turns.append(DebateTurn(side="BULL", round=i + 1, argument=bull_arg))
            last_bull = bull_arg

            bear_arg = self.bear.argue(ticker, dossier, i, self.rounds, last_bull)
            turns.append(DebateTurn(side="BEAR", round=i + 1, argument=bear_arg))
            last_bear = bear_arg

        transcript = "\n\n".join(f"[{t.side} r{t.round}]\n{t.argument}" for t in turns)
        result = self.llm.complete_json(
            DEBATE_JUDGE_PROMPT.format(ticker=ticker, transcript=transcript),
            DebateResult,
            context={"ticker": ticker, "reports": reports},
        )
        result.ticker = ticker
        result.turns = turns
        return result
