"""Live data self-check — prove the desk is pulling and computing real numbers.

On a normal deploy (open egress) this hits the live Crypto.com REST endpoint and
prints computed indicators for a crypto pair. Inside restricted CI (external
hosts blocked) pass --fixture to run the identical parse+indicator path over the
captured live sample.

    python scripts/live_check.py BTC_USDT              # live network
    python scripts/live_check.py BTC_USDT --fixture    # captured live sample
    python scripts/live_check.py AAPL                  # equities via yfinance
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from hedgedesk.data.gateway import DataGateway
from hedgedesk.data.providers.cryptocom import CryptoComProvider
from hedgedesk.data.providers.synthetic import SyntheticProvider


def build_gateway(ticker: str, use_fixture: bool) -> DataGateway:
    if use_fixture:
        payload = json.loads(
            (Path(__file__).parent.parent / "tests" / "fixtures" / "btc_usdt_4h.json").read_text()
        )
        crypto = CryptoComProvider(http_get=lambda url, params: payload)
        return DataGateway(providers=[crypto, SyntheticProvider()])
    return DataGateway()  # default chain: openbb -> yfinance -> cryptocom -> synthetic


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("ticker", nargs="?", default="BTC_USDT")
    ap.add_argument("--fixture", action="store_true",
                    help="use the captured live sample instead of the network")
    args = ap.parse_args()

    gw = build_gateway(args.ticker, args.fixture)
    tech = gw.snapshot(args.ticker, "technical")

    src = tech.get("_source", "?")
    print(f"\n=== {args.ticker} · technical · source={src} ===")
    for k in ("last", "sma_50", "sma_200", "ema_20", "ema_50", "rsi_14",
              "atr_14", "ret_1w", "ret_1m", "realized_vol", "bars"):
        v = tech.get(k)
        if isinstance(v, float):
            print(f"  {k:14} {v:,.4f}")
        else:
            print(f"  {k:14} {v}")

    # Momentum read a real analyst would make from these live numbers.
    last, e20, e50 = tech.get("last"), tech.get("ema_20"), tech.get("ema_50")
    if None not in (last, e20, e50):
        posture = "BULLISH" if e20 > e50 and last > e20 else \
                  "BEARISH" if e20 < e50 and last < e20 else "NEUTRAL"
        print(f"\n  momentum posture (EMA20 vs EMA50, price): {posture}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
