"""Heuristic reasoning engine — runs the whole desk with NO API key.

Drop-in replacement for ``ClaudeClient``: same ``complete`` / ``complete_json``
interface, but every decision is made by transparent deterministic rules over
the real data instead of an LLM. This exists so the desk is *usable immediately*
— clone, run, get verdicts on live data, no secrets — and so it keeps working if
the LLM is unavailable.

It is deliberately simple and auditable (you can read exactly why it said what
it said). When ``ANTHROPIC_API_KEY`` is set the desk uses Claude Fable instead
(see ``build_reasoner``); this is the floor, not the ceiling.

Agents pass their structured inputs via ``context=`` so this engine never has to
parse data back out of prompt text.
"""

from __future__ import annotations

import logging
from typing import Type, TypeVar

from pydantic import BaseModel

from ..orchestration.schemas import (
    AnalystReport,
    DebateResult,
    Direction,
    RiskAssessment,
    Signal,
    TradeTicket,
    ValuationResult,
    Verdict,
    VerdictType,
)

log = logging.getLogger("hedgedesk.llm.heuristic")
T = TypeVar("T", bound=BaseModel)


class HeuristicEngine:
    """Rule-based stand-in for the LLM. No network, no key."""

    mode = "heuristic"

    def complete(self, prompt: str, *, system: str | None = None) -> str:
        # Free-text calls are the debate turns; return a short honest note.
        side = "bullish" if "Bull Researcher" in prompt else \
               "bearish" if "Bear Researcher" in prompt else "balanced"
        return (f"[heuristic mode] Rule-based {side} read from the analyst dossier; "
                "no LLM narrative available. Set ANTHROPIC_API_KEY for full debate.")

    def complete_json(self, prompt: str, schema: Type[T], *, system: str | None = None,
                      context: dict | None = None) -> T:
        ctx = context or {}
        if schema is AnalystReport:
            return self._analyst(ctx)          # type: ignore[return-value]
        if schema is DebateResult:
            return self._debate(ctx)           # type: ignore[return-value]
        if schema is TradeTicket:
            return self._ticket(ctx)           # type: ignore[return-value]
        if schema is RiskAssessment:
            return self._risk(ctx)             # type: ignore[return-value]
        if schema is Verdict:
            return self._verdict(ctx)          # type: ignore[return-value]
        raise ValueError(f"heuristic engine has no rule for {schema.__name__}")

    # ------------------------------------------------------------- analysts
    def _analyst(self, ctx: dict) -> AnalystReport:
        key = ctx.get("spec_key", "")
        ticker = ctx.get("ticker", "?")
        d = ctx.get("data", {}) or {}
        degraded = bool(d.get("_synthetic") or d.get("_degraded"))
        signal, conv, pts = _analyst_rule(key, d)
        if degraded:                            # honesty: unknown data caps edge
            conv = min(conv, 0.5)
            pts = pts or ["data unavailable — neutral by default"]
        return AnalystReport(
            agent=key, ticker=ticker, signal=signal, conviction=round(conv, 2),
            key_points=pts[:4],
            metrics={k: d[k] for k in list(d)[:4] if not k.startswith("_")},
            risks=["heuristic mode: rule-based, not a full analyst read"],
        )

    # -------------------------------------------------------------- debate
    def _debate(self, ctx: dict) -> DebateResult:
        reports: list[AnalystReport] = ctx.get("reports", []) or []
        score = sum((1 if r.signal == Signal.BULLISH else
                     -1 if r.signal == Signal.BEARISH else 0) * r.conviction
                    for r in reports)
        winner = "BULL" if score > 0.4 else "BEAR" if score < -0.4 else "TOSS-UP"
        bulls = [r.agent for r in reports if r.signal == Signal.BULLISH]
        bears = [r.agent for r in reports if r.signal == Signal.BEARISH]
        return DebateResult(
            ticker=ctx.get("ticker", "?"),
            bull_case=f"Net-positive signals from: {', '.join(bulls) or 'none'}.",
            bear_case=f"Net-negative signals from: {', '.join(bears) or 'none'}.",
            winner=winner,
            structural_ceiling=None,
            synthesis=(f"Weighted desk score {score:+.2f} → {winner}. "
                       "Heuristic aggregate of the 7 analyst signals."),
        )

    # -------------------------------------------------------------- ticket
    def _ticket(self, ctx: dict) -> TradeTicket:
        ticker = ctx.get("ticker", "?")
        market = ctx.get("market", {}) or {}
        winner = ctx.get("debate_winner", "TOSS-UP")
        last = _f(market.get("last")) or 100.0
        atr = _f(market.get("atr_14")) or last * 0.03
        if winner == "BULL":
            return TradeTicket(
                ticker=ticker, direction=Direction.LONG, entry=round(last, 2),
                stop=round(last - 1.5 * atr, 2), target=round(last + 3.0 * atr, 2),
                size_pct=0.03, thesis="Heuristic: desk net-bullish; ATR-scaled 2:1 long.")
        if winner == "BEAR":
            return TradeTicket(
                ticker=ticker, direction=Direction.SHORT, entry=round(last, 2),
                stop=round(last + 1.5 * atr, 2), target=round(last - 3.0 * atr, 2),
                size_pct=0.03, thesis="Heuristic: desk net-bearish; ATR-scaled 2:1 short.")
        return TradeTicket(ticker=ticker, direction=Direction.FLAT, size_pct=0.0,
                           thesis="Heuristic: signals balanced; stand aside.")

    # ---------------------------------------------------------------- risk
    def _risk(self, ctx: dict) -> RiskAssessment:
        # Mechanical limit checks run in RiskManager and are merged over this.
        return RiskAssessment(
            ticker=ctx.get("ticker", "?"), approved=True,
            notes="Heuristic sign-off; deterministic portfolio limits enforced separately.")

    # ------------------------------------------------------------- verdict
    def _verdict(self, ctx: dict) -> Verdict:
        winner = ctx.get("debate_winner", "TOSS-UP")
        risk_ok = ctx.get("risk_approved", True)
        conv_avg = ctx.get("avg_conviction", 0.5)
        score = int(round(min(10, max(0, conv_avg * 10))))
        if not risk_ok:
            verdict, score = VerdictType.HOLD, min(score, 4)
        elif winner == "BULL" and score >= 6:
            verdict = VerdictType.ACCUMULATE
        elif winner == "BEAR":
            verdict = VerdictType.AVOID
        else:
            verdict = VerdictType.HOLD
        return Verdict(
            ticker=ctx.get("ticker", "?"), verdict=verdict, conviction_score=score,
            rationale=(f"Heuristic: debate winner {winner}, risk "
                       f"{'approved' if risk_ok else 'blocked'}, avg conviction "
                       f"{conv_avg:.2f}. Set ANTHROPIC_API_KEY for the full committee."))


# ---------------------------------------------------------------- lens rules
def _analyst_rule(key: str, d: dict) -> tuple[Signal, float, list[str]]:
    last, s50, s200 = _f(d.get("last")), _f(d.get("sma_50")), _f(d.get("sma_200"))
    rsi = _f(d.get("rsi_14"))
    if key == "technical":
        if last and s50 and last > s50 and (not s200 or s50 > s200) and (not rsi or rsi < 72):
            return Signal.BULLISH, 0.62, [f"price {last:.2f} > SMA50 {s50:.2f}; uptrend"]
        if last and s50 and last < s50:
            return Signal.BEARISH, 0.6, [f"price {last:.2f} < SMA50 {s50:.2f}; downtrend"]
        return Signal.NEUTRAL, 0.5, ["trend mixed"]
    if key == "fundamentals":
        pe, gm, gr = _f(d.get("pe")), _f(d.get("gross_margin")), _f(d.get("revenue_growth"))
        if gr and gr > 0 and (gm or 0) > 0.3 and (pe is None or pe < 35):
            return Signal.BULLISH, 0.6, [f"growth {gr:+.1%}, gross margin {gm:.0%}"]
        if gr is not None and gr < 0:
            return Signal.BEARISH, 0.55, [f"revenue contracting {gr:+.1%}"]
        return Signal.NEUTRAL, 0.5, ["fundamentals mixed/unknown"]
    if key == "estimates":
        tgt, buy = _f(d.get("consensus_target")), _f(d.get("rating_buy_pct"))
        if tgt and last and tgt > last * 1.05:
            return Signal.BULLISH, 0.58, [f"consensus {tgt:.0f} > spot {last:.0f}"]
        if buy is not None and buy < 0.35:
            return Signal.BEARISH, 0.55, [f"only {buy:.0%} buy ratings"]
        return Signal.NEUTRAL, 0.5, ["street roughly at spot"]
    if key == "news_sentiment":
        return Signal.NEUTRAL, 0.5, [f"{len(d.get('headlines', []))} headlines; no sentiment model in heuristic mode"]
    if key == "flow_ownership":
        imb = _f(d.get("book_imbalance"))          # live crypto order-book (bids vs asks)
        if imb is not None and imb > 0.15:
            return Signal.BULLISH, 0.56, [f"order book bid-heavy ({imb:+.0%})"]
        if imb is not None and imb < -0.15:
            return Signal.BEARISH, 0.56, [f"order book ask-heavy ({imb:+.0%})"]
        si = _f(d.get("short_interest_pct"))        # equities
        if si is not None and si > 0.1:
            return Signal.BEARISH, 0.55, [f"elevated short interest {si:.0%}"]
        return Signal.NEUTRAL, 0.5, ["ownership/flow unremarkable"]
    if key == "options":
        pcr, iv = _f(d.get("put_call_ratio")), _f(d.get("atm_iv"))
        if pcr is not None and pcr > 1.2:
            return Signal.BEARISH, 0.55, [f"put/call {pcr:.2f} skewed to puts"]
        if pcr is not None and pcr < 0.7:
            return Signal.BULLISH, 0.55, [f"put/call {pcr:.2f} call-heavy"]
        return Signal.NEUTRAL, 0.5, ["options positioning neutral"]
    if key == "macro":
        vix = _f(d.get("vix"))
        if vix is not None and vix > 25:
            return Signal.BEARISH, 0.55, [f"VIX {vix:.0f}: risk-off backdrop"]
        return Signal.NEUTRAL, 0.5, ["macro neutral"]
    return Signal.NEUTRAL, 0.5, ["no rule for this lens"]


def _f(x) -> float | None:
    try:
        return None if x is None else float(x)
    except (TypeError, ValueError):
        return None
