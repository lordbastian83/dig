"""Synthetic provider — deterministic offline fallback.

The last link in every provider chain. Produces plausible, clearly-labelled data
(``_synthetic: True``) so the whole desk runs end-to-end with no keys and no
network. Deterministic per ticker so offline runs are reproducible. Analysts are
told to cap conviction at 0.5 on synthetic data, so a desk running on this never
pretends to have an edge it doesn't.
"""

from __future__ import annotations

from typing import Any


class SyntheticProvider:
    name = "synthetic"

    def supports(self, ticker: str) -> bool:
        return True  # always available as the floor

    def fetch(self, ticker: str, slice_: str) -> dict[str, Any]:
        seed = sum(ord(c) for c in ticker)
        base = 50 + (seed % 250)
        data = {
            "technical": {
                "last": base, "sma_50": base * 0.98, "sma_200": base * 0.94,
                "ema_20": base * 0.99, "ema_50": base * 0.97,
                "rsi_14": 45 + seed % 30, "atr_14": base * 0.03,
                "ret_1w": (seed % 20 - 8) / 100, "ret_1m": (seed % 40 - 15) / 100,
                "realized_vol": 0.3 + (seed % 40) / 100, "bars": 0,
            },
            "fundamentals": {
                "pe": 12 + seed % 30, "eps": 2 + seed % 8,
                "gross_margin": 0.3 + (seed % 40) / 100,
                "net_margin": 0.05 + (seed % 20) / 100,
                "revenue_growth": (seed % 30 - 5) / 100,
            },
            "estimates": {
                "consensus_target": base * 1.12, "analyst_count": 8 + seed % 20,
                "rating_buy_pct": 0.4 + (seed % 50) / 100,
            },
            "news": {"headlines": [f"{ticker}: synthetic headline {i}" for i in range(3)]},
            "flow": {
                "institutional_holders": 200 + seed % 800,
                "short_interest_pct": (seed % 15) / 100, "days_to_cover": 1 + seed % 6,
            },
            "options": {
                "put_call_ratio": 0.6 + (seed % 80) / 100,
                "atm_iv": 0.25 + (seed % 40) / 100,
            },
            "macro": {"ust_10y": 4.2, "vix": 14 + seed % 12},
        }[slice_]
        return data | {"_synthetic": True}
