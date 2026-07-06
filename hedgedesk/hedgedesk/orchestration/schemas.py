"""Typed contracts that flow between phases.

Every agent returns one of these. Because they are Pydantic models the LLM
outputs are validated at the boundary — a malformed verdict raises instead of
silently poisoning the audit log downstream. These schemas are also what the
LLM is shown as the required JSON shape (see ``llm/client.py``).
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Signal(str, Enum):
    BULLISH = "BULLISH"
    BEARISH = "BEARISH"
    NEUTRAL = "NEUTRAL"


class Direction(str, Enum):
    LONG = "LONG"
    SHORT = "SHORT"
    FLAT = "FLAT"


class VerdictType(str, Enum):
    ACCUMULATE = "ACCUMULATE"
    HOLD = "HOLD"
    TRIM = "TRIM"
    EXIT = "EXIT"
    AVOID = "AVOID"


class AnalystReport(BaseModel):
    """One analyst's read on a single ticker."""

    agent: str
    ticker: str
    signal: Signal
    conviction: float = Field(ge=0.0, le=1.0, description="0=no edge, 1=max edge")
    key_points: list[str] = Field(default_factory=list, max_length=6)
    metrics: dict[str, Any] = Field(default_factory=dict)
    risks: list[str] = Field(default_factory=list, max_length=4)


class DebateTurn(BaseModel):
    side: str  # "BULL" or "BEAR"
    round: int
    argument: str


class DebateResult(BaseModel):
    ticker: str
    bull_case: str
    bear_case: str
    turns: list[DebateTurn] = Field(default_factory=list)
    winner: str  # "BULL" | "BEAR" | "TOSS-UP"
    structural_ceiling: str | None = None
    synthesis: str


class TradeTicket(BaseModel):
    ticker: str
    direction: Direction
    entry: float | None = None
    stop: float | None = None
    target: float | None = None
    size_pct: float = Field(ge=0.0, le=1.0, description="fraction of NAV")
    time_horizon: str = "swing"
    thesis: str
    reward_to_risk: float | None = None


class RiskViolation(BaseModel):
    rule: str
    detail: str
    severity: str  # "BLOCK" | "WARN"


class RiskAssessment(BaseModel):
    ticker: str
    approved: bool
    violations: list[RiskViolation] = Field(default_factory=list)
    adjusted_ticket: TradeTicket | None = None
    notes: str = ""


class Verdict(BaseModel):
    ticker: str
    verdict: VerdictType
    conviction_score: int = Field(ge=0, le=10)
    rationale: str
    ticket: TradeTicket | None = None
    risk: RiskAssessment | None = None
    audit_id: str = ""
    created_at: str = Field(default_factory=_now)


class ValuationResult(BaseModel):
    ticker: str
    dcf_target: float | None = None
    exit_multiple_target: float | None = None
    monte_carlo_p10: float | None = None
    monte_carlo_p50: float | None = None
    monte_carlo_p90: float | None = None
    blended_low: float | None = None
    blended_high: float | None = None
    horizon_years: int = 5
    notes: str = ""


class DeskRun(BaseModel):
    """The full audit record for one ticker passing through all four phases.

    This is the atom Hermes learns from: the inputs, every agent's output, the
    final verdict, and (later, once resolved) the realized P&L.
    """

    run_id: str
    ticker: str
    started_at: str = Field(default_factory=_now)
    finished_at: str | None = None
    analyst_reports: list[AnalystReport] = Field(default_factory=list)
    debate: DebateResult | None = None
    ticket: TradeTicket | None = None
    risk: RiskAssessment | None = None
    verdict: Verdict | None = None
    valuation: ValuationResult | None = None
    # Filled in later by the track/exit engine when the position resolves:
    outcome: dict[str, Any] | None = None
