"""Offline smoke tests — exercise the whole pipeline with the LLM stubbed.

No network, no API keys: we inject a fake ClaudeClient that returns schema-valid
objects, and let the OpenBB gateway fall back to its synthetic data. This proves
the wiring (fan-out, debate loop, risk merge, audit capture) end to end.
"""

from __future__ import annotations

import pytest

from hedgedesk.agents.execution import RiskManager
from hedgedesk.config import RiskLimits
from hedgedesk.orchestration.schemas import (
    AnalystReport,
    DebateResult,
    Direction,
    RiskAssessment,
    Signal,
    TradeTicket,
    Verdict,
    VerdictType,
)
from hedgedesk.portfolio.exit_engine import Position, evaluate_position
from hedgedesk.portfolio.valuation import blended_valuation


class FakeLLM:
    """Returns a canned, schema-valid object for any structured call."""

    def complete(self, prompt, system=None):
        return "Fake argument citing the dossier."

    def complete_json(self, prompt, schema, system=None):
        if schema is AnalystReport:
            return AnalystReport(agent="x", ticker="TEST", signal=Signal.BULLISH, conviction=0.6)
        if schema is DebateResult:
            return DebateResult(ticker="TEST", bull_case="b", bear_case="r",
                                winner="BULL", synthesis="lean long")
        if schema is TradeTicket:
            return TradeTicket(ticker="TEST", direction=Direction.LONG, entry=100,
                               stop=95, target=115, size_pct=0.05, thesis="t")
        if schema is RiskAssessment:
            return RiskAssessment(ticker="TEST", approved=True)
        if schema is Verdict:
            return Verdict(ticker="TEST", verdict=VerdictType.ACCUMULATE,
                           conviction_score=7, rationale="ok")
        raise AssertionError(schema)


def test_full_pipeline_offline():
    from hedgedesk.orchestration.pipeline import DeskPipeline

    pipe = DeskPipeline(llm=FakeLLM())
    run = pipe.run("TEST")
    assert run.verdict is not None
    assert len(run.analyst_reports) == 7          # all seats reported
    assert run.debate.winner == "BULL"
    assert run.verdict.conviction_score == 7
    assert run.valuation is not None              # phase 4 produced a range


def test_risk_manager_blocks_oversized_ticket():
    rm = RiskManager(llm=FakeLLM(), limits=RiskLimits())
    ticket = TradeTicket(ticker="TEST", direction=Direction.LONG, entry=100,
                         stop=95, target=115, size_pct=0.50, thesis="huge")
    assessment = rm.run(ticket, portfolio={}, regime={})
    assert assessment.approved is False           # mechanical BLOCK overrides LLM
    assert any(v.rule == "max_position_pct" for v in assessment.violations)


def test_risk_manager_blocks_poor_reward_to_risk():
    rm = RiskManager(llm=FakeLLM(), limits=RiskLimits())
    ticket = TradeTicket(ticker="TEST", direction=Direction.LONG, entry=100,
                         stop=90, target=103, size_pct=0.05, thesis="bad rr")
    assessment = rm.run(ticket, portfolio={}, regime={})
    assert assessment.approved is False
    assert any(v.rule == "min_reward_to_risk" for v in assessment.violations)


def test_trailing_stop_ratchets_and_exits():
    pos = Position(ticker="TEST", direction=Direction.LONG, entry=100, stop=95,
                   target=None, size_pct=0.05, trail_pct=0.05)
    # price rises -> trailing stop tightens up
    sig = evaluate_position(pos, 120)
    assert sig.action == "TIGHTEN"
    assert pos.stop > 95
    # price falls back into the tightened stop -> exit
    sig = evaluate_position(pos, pos.stop - 1)
    assert sig.action == "EXIT"


def test_valuation_ranges_are_ordered():
    v = blended_valuation("TEST", spot=100, fcf_per_share=4, eps=5, growth=0.1, vol=0.3)
    assert v.monte_carlo_p10 <= v.monte_carlo_p50 <= v.monte_carlo_p90
    assert v.blended_low <= v.blended_high


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-v"]))
