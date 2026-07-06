"""Hermes memory — turns resolved audit runs into a learned prior.

This is the "learning brain": it reads the append-only ledger of past runs whose
outcomes are now known and distils calibration stats the orchestrator injects
into the NEXT run's context. Concretely it answers:

  * Which analyst seats have been right when they were confident? (seat reliability)
  * Does the Bull or Bear winner predict realized P&L? (debate calibration)
  * Are we systematically over/under-confident at each conviction score?

The output is a compact ``DeskPrior`` — small enough to prepend to a prompt — so
the desk gets sharper theses over time without retraining anything.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from .audit import AuditLog


@dataclass
class SeatStat:
    n: int = 0
    hits: float = 0.0            # conviction-weighted correct calls
    weight: float = 0.0

    @property
    def reliability(self) -> float:
        return self.hits / self.weight if self.weight else 0.5


@dataclass
class DeskPrior:
    seat_reliability: dict[str, float] = field(default_factory=dict)
    debate_win_edge: float = 0.0        # avg realized return when debate winner traded
    conviction_calibration: dict[int, float] = field(default_factory=dict)
    sample_size: int = 0

    def as_prompt_note(self) -> str:
        if not self.sample_size:
            return "No resolved history yet — treat all seats at base rate."
        seats = ", ".join(
            f"{k}={v:.0%}" for k, v in sorted(self.seat_reliability.items(), key=lambda x: -x[1])
        )
        return (
            f"LEARNED PRIOR (from {self.sample_size} resolved trades): "
            f"seat hit-rates — {seats}. "
            f"Debate-winner realized edge {self.debate_win_edge:+.1%}. "
            "Weight the more reliable seats more heavily and discount seats that "
            "have historically been confidently wrong."
        )


def build_prior(audit: AuditLog | None = None) -> DeskPrior:
    audit = audit or AuditLog()
    seats: dict[str, SeatStat] = defaultdict(SeatStat)
    conv_bucket: dict[int, list[float]] = defaultdict(list)
    win_returns: list[float] = []
    n_resolved = 0

    for run in audit.iter_runs():
        if not run.outcome or "return_pct" not in run.outcome:
            continue
        n_resolved += 1
        realized = run.outcome["return_pct"]           # e.g. +0.06 for +6%
        won = realized > 0

        # seat reliability: did the seat's directional call agree with the outcome?
        for rep in run.analyst_reports:
            bullish = rep.signal.value == "BULLISH"
            correct = (bullish and won) or (not bullish and not won)
            st = seats[rep.agent]
            st.n += 1
            st.weight += rep.conviction
            st.hits += rep.conviction * (1.0 if correct else 0.0)

        if run.debate:
            traded_long = run.debate.winner == "BULL"
            aligned = realized if traded_long else -realized
            win_returns.append(aligned)

        if run.verdict:
            conv_bucket[run.verdict.conviction_score].append(1.0 if won else 0.0)

    return DeskPrior(
        seat_reliability={k: v.reliability for k, v in seats.items()},
        debate_win_edge=sum(win_returns) / len(win_returns) if win_returns else 0.0,
        conviction_calibration={
            k: sum(v) / len(v) for k, v in conv_bucket.items() if v
        },
        sample_size=n_resolved,
    )
