"""Execution desk: Trader, Risk Manager, Fund Manager.

The Risk Manager is deliberately hybrid: deterministic Python guardrails run
FIRST and always (they cannot be argued out of), then the LLM adds regime and
correlation judgement on top. A ticket must clear both to be approved.
"""

from __future__ import annotations

import json

from ..config import RiskLimits, get_settings
from ..orchestration.schemas import (
    Direction,
    RiskAssessment,
    RiskViolation,
    TradeTicket,
    ValuationResult,
    Verdict,
)
from ..prompts.execution import FUND_MANAGER_PROMPT, RISK_MANAGER_PROMPT, TRADER_PROMPT
from .base import Agent


class Trader(Agent):
    name = "trader"

    def run(self, ticker: str, debate, market: dict, portfolio: dict) -> TradeTicket:
        s = get_settings()
        ticket = self.llm.complete_json(
            TRADER_PROMPT.format(
                ticker=ticker,
                debate=debate.synthesis if hasattr(debate, "synthesis") else str(debate),
                market=json.dumps(market, default=str),
                portfolio=json.dumps(portfolio, default=str),
                max_position_pct=s.risk.max_position_pct,
                min_rr=s.risk.min_reward_to_risk,
            ),
            TradeTicket,
            context={
                "ticker": ticker, "market": market,
                "debate_winner": getattr(debate, "winner", "TOSS-UP"),
            },
        )
        ticket.ticker = ticker
        return ticket


class RiskManager(Agent):
    name = "risk_manager"

    def __init__(self, llm=None, limits: RiskLimits | None = None) -> None:
        super().__init__(llm)
        self.limits = limits or get_settings().risk

    # ---- deterministic layer: arithmetic that must never be hallucinated ----
    def _mechanical_checks(
        self, ticket: TradeTicket, portfolio: dict
    ) -> list[RiskViolation]:
        v: list[RiskViolation] = []
        lim = self.limits

        if ticket.size_pct > lim.max_position_pct:
            v.append(RiskViolation(
                rule="max_position_pct",
                detail=f"size {ticket.size_pct:.1%} > cap {lim.max_position_pct:.1%}",
                severity="BLOCK",
            ))

        # reward-to-risk from the levels, if present
        if ticket.direction != Direction.FLAT and None not in (
            ticket.entry, ticket.stop, ticket.target
        ):
            risk = abs(ticket.entry - ticket.stop)
            reward = abs(ticket.target - ticket.entry)
            rr = reward / risk if risk else 0.0
            ticket.reward_to_risk = round(rr, 2)
            if rr < lim.min_reward_to_risk:
                v.append(RiskViolation(
                    rule="min_reward_to_risk",
                    detail=f"R:R {rr:.2f} < required {lim.min_reward_to_risk}",
                    severity="BLOCK",
                ))

        # sector concentration against the existing book
        sector = portfolio.get("sector_exposure", {}) if portfolio else {}
        tkr_sector = portfolio.get("ticker_sector", {}).get(ticket.ticker) if portfolio else None
        if tkr_sector:
            projected = sector.get(tkr_sector, 0.0) + ticket.size_pct
            if projected > lim.max_sector_pct:
                v.append(RiskViolation(
                    rule="max_sector_pct",
                    detail=f"{tkr_sector} would reach {projected:.1%} > {lim.max_sector_pct:.1%}",
                    severity="BLOCK",
                ))

        # gross exposure
        gross = portfolio.get("gross_exposure", 0.0) if portfolio else 0.0
        if gross + ticket.size_pct > lim.max_gross_exposure:
            v.append(RiskViolation(
                rule="max_gross_exposure",
                detail=f"gross would reach {gross + ticket.size_pct:.2f}x > {lim.max_gross_exposure}x",
                severity="BLOCK",
            ))

        # drawdown circuit-breaker
        if portfolio and portfolio.get("daily_drawdown_pct", 0.0) >= lim.max_daily_drawdown_pct:
            v.append(RiskViolation(
                rule="max_daily_drawdown",
                detail="daily drawdown limit hit — no new risk today",
                severity="BLOCK",
            ))
        return v

    def run(self, ticket: TradeTicket, portfolio: dict, regime: dict) -> RiskAssessment:
        mechanical = self._mechanical_checks(ticket, portfolio)

        # LLM judgement layer (correlation, liquidity, path, regime).
        lim = self.limits
        judged = self.llm.complete_json(
            RISK_MANAGER_PROMPT.format(
                ticker=ticket.ticker,
                ticket=ticket.model_dump_json(indent=2),
                portfolio=json.dumps(portfolio, default=str),
                regime=json.dumps(regime, default=str),
                max_position_pct=lim.max_position_pct,
                max_sector_pct=lim.max_sector_pct,
                max_gross=lim.max_gross_exposure,
                max_net=lim.max_net_exposure,
                min_rr=lim.min_reward_to_risk,
                max_dd=lim.max_daily_drawdown_pct,
            ),
            RiskAssessment,
            context={"ticker": ticket.ticker},
        )

        # Merge: mechanical BLOCKs are authoritative and cannot be overridden.
        judged.ticker = ticket.ticker
        judged.violations = mechanical + list(judged.violations)
        if any(x.severity == "BLOCK" for x in judged.violations):
            judged.approved = False
        return judged


class FundManager(Agent):
    name = "fund_manager"

    def run(
        self,
        ticker: str,
        debate,
        ticket: TradeTicket,
        risk: RiskAssessment,
        valuation: ValuationResult | None,
        reports: list | None = None,
    ) -> Verdict:
        avg_conv = (
            sum(r.conviction for r in reports) / len(reports)
            if reports else 0.5
        )
        verdict = self.llm.complete_json(
            FUND_MANAGER_PROMPT.format(
                ticker=ticker,
                debate_synthesis=getattr(debate, "synthesis", str(debate)),
                ticket=ticket.model_dump_json(indent=2),
                risk=risk.model_dump_json(indent=2),
                valuation=valuation.model_dump_json(indent=2) if valuation else "n/a",
            ),
            Verdict,
            context={
                "ticker": ticker,
                "debate_winner": getattr(debate, "winner", "TOSS-UP"),
                "risk_approved": risk.approved,
                "avg_conviction": avg_conv,
            },
        )
        verdict.ticker = ticker
        verdict.ticket = risk.adjusted_ticket or ticket
        verdict.risk = risk
        return verdict
