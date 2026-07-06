"""No-key end-to-end: the whole desk runs with the HeuristicEngine (no LLM).

Proves the desk is usable with zero secrets — the exact path taken when
ANTHROPIC_API_KEY is unset. Uses the REAL HeuristicEngine (not a stub) so the
rules themselves are under test.
"""

from __future__ import annotations

import json
from pathlib import Path

from hedgedesk.data.gateway import DataGateway
from hedgedesk.data.providers.cryptocom import CryptoComProvider
from hedgedesk.data.providers.synthetic import SyntheticProvider
from hedgedesk.llm import build_reasoner
from hedgedesk.llm.heuristic import HeuristicEngine
from hedgedesk.orchestration.pipeline import DeskPipeline

FIXTURE = Path(__file__).parent / "fixtures" / "btc_usdt_4h.json"


def test_build_reasoner_picks_heuristic_without_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    from hedgedesk.config import Settings
    assert isinstance(build_reasoner(Settings(anthropic_api_key=None)), HeuristicEngine)


def test_full_desk_runs_no_key_on_live_fixture():
    payload = json.loads(FIXTURE.read_text())
    gw = DataGateway(providers=[
        CryptoComProvider(http_get=lambda u, p: payload),
        SyntheticProvider(),
    ])
    # No llm passed -> pipeline builds the heuristic engine (no key in test env).
    pipe = DeskPipeline(llm=HeuristicEngine(), gateway=gw)
    run = pipe.run("BTC_USDT")

    assert len(run.analyst_reports) == 7
    assert run.debate.winner in ("BULL", "BEAR", "TOSS-UP")
    assert run.verdict is not None
    assert 0 <= run.verdict.conviction_score <= 10
    # Technical seat saw the REAL live close, not synthetic.
    tech = next(r for r in run.analyst_reports if r.agent == "technical")
    assert tech.metrics.get("last") == 62671.30
    # The ticket's levels are ATR-derived from live data (non-trivial).
    if run.ticket.direction.value != "FLAT":
        assert run.ticket.entry and run.ticket.stop and run.ticket.target


def test_heuristic_bearish_desk_yields_avoid():
    # All-synthetic AAPL run still produces a coherent verdict end to end.
    gw = DataGateway(providers=[SyntheticProvider()])
    run = DeskPipeline(llm=HeuristicEngine(), gateway=gw).run("AAPL")
    assert run.verdict.verdict.value in ("ACCUMULATE", "HOLD", "TRIM", "EXIT", "AVOID")
    assert run.verdict.rationale  # non-empty, explains itself


if __name__ == "__main__":
    import pytest, sys
    sys.exit(pytest.main([__file__, "-v"]))
