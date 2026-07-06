"""Live crypto provider — Crypto.com Exchange public REST v1.

Serves the ``technical`` slice for crypto instruments (e.g. ``BTC_USDT``) from
real candles, plus a lightweight ``flow`` read from the order book. No API key
required — these are public market-data endpoints. Candles run through the
shared indicator engine so the numbers match the rest of the desk.

Transport is injectable (``http_get``) so tests can drive the exact parser +
indicator path against a captured live sample without touching the network. In
production the default transport uses ``requests`` with the environment CA
bundle already configured.
"""

from __future__ import annotations

import os
from typing import Any, Callable

from ..indicators import realized_vol, snapshot_from_candles

BASE = "https://api.crypto.com/exchange/v1"
# 6 four-hour bars/day * 365 — crypto trades 24/7, so vol is annualized on that.
CRYPTO_PERIODS_PER_YEAR = 2190

# Default quote currencies we treat as crypto pairs when the user passes a bare base.
_QUOTES = ("_USDT", "_USD", "_USDC", "_PERP")


def _default_get(url: str, params: dict) -> dict:
    import requests  # imported lazily so the package imports without it

    ca = os.getenv("REQUESTS_CA_BUNDLE") or "/root/.ccr/ca-bundle.crt"
    verify = ca if os.path.exists(ca) else True
    r = requests.get(url, params=params, timeout=15, verify=verify,
                     headers={"User-Agent": "hedgedesk/0.1"})
    r.raise_for_status()
    return r.json()


class CryptoComProvider:
    name = "cryptocom"

    def __init__(
        self,
        timeframe: str = "4h",
        http_get: Callable[[str, dict], dict] | None = None,
        instruments: set[str] | None = None,
    ) -> None:
        self.timeframe = timeframe
        self._get = http_get or _default_get
        # Optional explicit allowlist; otherwise infer from the pair suffix.
        self.instruments = instruments

    # -------------------------------------------------------------- routing
    def supports(self, ticker: str) -> bool:
        if self.instruments is not None:
            return ticker in self.instruments
        return any(ticker.endswith(q) for q in _QUOTES) or "_" in ticker

    # ---------------------------------------------------------------- fetch
    def fetch(self, ticker: str, slice_: str) -> dict[str, Any] | None:
        if slice_ == "technical":
            return self._technical(ticker)
        if slice_ == "flow":
            return self._flow(ticker)
        return None  # crypto exchange has no P/E, sell-side estimates, etc.

    def _technical(self, ticker: str) -> dict[str, Any]:
        payload = self._get(
            f"{BASE}/public/get-candlestick",
            {"instrument_name": ticker, "timeframe": self.timeframe},
        )
        candles = _rows(payload)
        # API returns newest→oldest; indicators expect oldest→newest.
        candles = sorted(candles, key=_ts)
        o = [_num(c, "open", "o") for c in candles]
        h = [_num(c, "high", "h") for c in candles]
        l = [_num(c, "low", "l") for c in candles]
        c = [_num(c_, "close", "c") for c_ in candles]
        snap = snapshot_from_candles(o, h, l, c, periods_per_year=CRYPTO_PERIODS_PER_YEAR)
        snap["_source"] = self.name
        snap["timeframe"] = self.timeframe
        return snap

    def _flow(self, ticker: str) -> dict[str, Any] | None:
        try:
            book = self._get(f"{BASE}/public/get-book",
                             {"instrument_name": ticker, "depth": 50})
            rows = _rows(book)
            data = rows[0] if rows else book.get("result", {}).get("data", [{}])[0]
            bids = data.get("bids", [])
            asks = data.get("asks", [])
            bid_qty = sum(float(x[1]) for x in bids)
            ask_qty = sum(float(x[1]) for x in asks)
            total = bid_qty + ask_qty
            return {
                "book_imbalance": (bid_qty - ask_qty) / total if total else None,
                "bid_depth": bid_qty,
                "ask_depth": ask_qty,
                "_source": self.name,
            }
        except Exception:
            return None


# --------------------------------------------------------------------- parsing
def _rows(payload: dict) -> list:
    """Crypto.com wraps rows under result.data (REST) or top-level data (MCP)."""
    if "result" in payload and isinstance(payload["result"], dict):
        return payload["result"].get("data", [])
    return payload.get("data", [])


def _ts(row: dict):
    return row.get("timestamp") or row.get("t") or 0


def _num(row: dict, *keys: str) -> float:
    for k in keys:
        if k in row and row[k] is not None:
            return float(row[k])
    raise KeyError(keys)
