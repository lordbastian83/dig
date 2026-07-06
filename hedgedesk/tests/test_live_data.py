"""Live-data verification.

External market hosts are policy-blocked inside CI, so we verify the *live path*
(provider parse → indicator engine → gateway slice) against a real BTC_USDT 4h
sample captured from the Crypto.com feed (tests/fixtures/btc_usdt_4h.json). The
transport is injected, so this exercises exactly the code that runs against the
live REST endpoint on deploy — only the socket is swapped for the captured JSON.

It also unit-tests the indicator math against hand-computable references so the
numbers are trustworthy, not just self-consistent.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from hedgedesk.data import indicators as ind
from hedgedesk.data.gateway import DataGateway
from hedgedesk.data.providers.cryptocom import CryptoComProvider
from hedgedesk.data.providers.synthetic import SyntheticProvider

FIXTURE = Path(__file__).parent / "fixtures" / "btc_usdt_4h.json"


def _fixture_payload() -> dict:
    return json.loads(FIXTURE.read_text())


def _injected_provider() -> CryptoComProvider:
    payload = _fixture_payload()
    # Inject transport: return the captured live JSON regardless of URL/params.
    return CryptoComProvider(timeframe="4h", http_get=lambda url, params: payload)


# --------------------------------------------------------------- indicator math
def test_sma_matches_hand_computation():
    xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    assert ind.sma(xs, 5) == pytest.approx(8.0)  # mean(6..10)


def test_ema_reduces_to_seed_on_flat_series():
    flat = [100.0] * 30
    assert ind.ema(flat, 10) == pytest.approx(100.0)


def test_rsi_all_gains_is_100():
    rising = list(range(1, 40))
    assert ind.rsi(rising, 14) == pytest.approx(100.0)


def test_rsi_in_range_on_mixed_series():
    xs = [44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42,
          45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28]
    r = ind.rsi(xs, 14)
    assert 60 < r < 80  # classic Wilder worked example lands ~70


def test_atr_positive_and_sane():
    highs = [10, 11, 12, 11, 13, 14, 13, 15, 16, 15, 17, 16, 18, 19, 18, 20]
    lows = [9, 10, 11, 10, 12, 13, 12, 14, 15, 14, 16, 15, 17, 18, 17, 19]
    closes = [9.5, 10.5, 11.5, 10.5, 12.5, 13.5, 12.5, 14.5, 15.5, 14.5,
              16.5, 15.5, 17.5, 18.5, 17.5, 19.5]
    a = ind.atr(highs, lows, closes, 14)
    assert a is not None and 0.5 < a < 3.0


# ------------------------------------------------------- live crypto provider path
def test_crypto_provider_parses_real_candles():
    prov = _injected_provider()
    tech = prov.fetch("BTC_USDT", "technical")
    # Newest bar in the captured sample closed at 62671.30.
    assert tech["last"] == pytest.approx(62671.30, abs=0.01)
    assert tech["_source"] == "cryptocom"
    assert tech["bars"] == len(_fixture_payload()["data"])
    # 50 bars present -> SMA50 computable; RSI/ATR/EMA all populated.
    assert tech["sma_50"] is not None
    assert 0 <= tech["rsi_14"] <= 100
    assert tech["atr_14"] > 0
    assert tech["realized_vol"] > 0
    # 200-bar SMA needs more history than the 50-bar sample -> honestly None.
    assert tech["sma_200"] is None


def test_crypto_provider_orders_oldest_to_newest():
    # The feed returns newest-first; the snapshot's "last" must be the newest bar,
    # proving the provider re-sorts before computing indicators.
    prov = _injected_provider()
    tech = prov.fetch("BTC_USDT", "technical")
    data = _fixture_payload()["data"]
    newest = max(data, key=lambda c: c["timestamp"])
    assert tech["last"] == pytest.approx(float(newest["close"]), abs=0.01)


def test_gateway_routes_crypto_to_live_provider():
    # Chain: live crypto (injected) then synthetic floor. Crypto pair must be
    # served live, not by synthetic.
    gw = DataGateway(providers=[_injected_provider(), SyntheticProvider()])
    tech = gw.snapshot("BTC_USDT", "technical")
    assert tech["_source"] == "cryptocom"
    assert tech["last"] == pytest.approx(62671.30, abs=0.01)
    # A slice crypto doesn't serve (fundamentals) falls through to synthetic.
    fund = gw.snapshot("BTC_USDT", "fundamentals")
    assert fund["_source"] == "synthetic"


def test_gateway_falls_back_to_synthetic_for_unreachable_equity():
    # No live equity provider in the chain -> synthetic floor answers (offline-safe).
    gw = DataGateway(providers=[SyntheticProvider()])
    tech = gw.snapshot("AAPL", "technical")
    assert tech["_synthetic"] is True


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-v"]))
