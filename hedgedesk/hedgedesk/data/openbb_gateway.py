"""OpenBB gateway — the desk's open-source Bloomberg terminal.

This is the *single* place the desk touches market data. Each analyst asks for
the slice it needs (``technical``, ``fundamentals``, ``options`` …) and gets a
plain dict back. Centralising it means:

  * one login / PAT,
  * one in-memory TTL cache (analysts run in parallel and would otherwise
    hammer the same endpoints for the same ticker),
  * one place to swap providers or add fallbacks.

OpenBB's Python SDK is imported lazily. If it (or a data key) is missing, the
gateway degrades to a clearly-labelled synthetic snapshot so the whole pipeline
is still runnable end-to-end offline — the same philosophy as budsignal's demo
data. Never let missing data crash the committee; let it *lower conviction*.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Callable

from ..config import Settings, get_settings

log = logging.getLogger("hedgedesk.data")

# The named data slices each analyst consumes. Keeping the vocabulary here (not
# scattered across agents) is what lets the orchestrator fan out cleanly.
SLICES = (
    "technical",
    "fundamentals",
    "estimates",
    "news",
    "flow",
    "options",
    "macro",
)


class OpenBBGateway:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._obb = None
        self._cache: dict[str, tuple[float, Any]] = {}

    # ------------------------------------------------------------------ setup
    def _ensure(self):
        if self._obb is None:
            try:
                from openbb import obb  # type: ignore

                if self.settings.openbb_pat:
                    obb.account.login(pat=self.settings.openbb_pat)
                self._obb = obb
            except Exception as exc:  # pragma: no cover - offline / no SDK
                log.warning("OpenBB unavailable (%s); using synthetic data", exc)
                self._obb = False  # sentinel: fall back to synthetic
        return self._obb

    def _cached(self, key: str, fetch: Callable[[], Any]) -> Any:
        now = time.time()
        hit = self._cache.get(key)
        if hit and now - hit[0] < self.settings.data_cache_ttl_seconds:
            return hit[1]
        value = fetch()
        self._cache[key] = (now, value)
        return value

    # -------------------------------------------------------------- public API
    def snapshot(self, ticker: str, slice_: str) -> dict[str, Any]:
        """Return the named data slice for a ticker (cached)."""
        if slice_ not in SLICES:
            raise ValueError(f"unknown slice {slice_!r}; expected one of {SLICES}")
        return self._cached(f"{ticker}:{slice_}", lambda: self._fetch(ticker, slice_))

    def full(self, ticker: str) -> dict[str, dict[str, Any]]:
        """All slices for a ticker (what the orchestrator hands the analysts)."""
        return {s: self.snapshot(ticker, s) for s in SLICES}

    # ------------------------------------------------------------- fetch logic
    def _fetch(self, ticker: str, slice_: str) -> dict[str, Any]:
        obb = self._ensure()
        if not obb:
            return _synthetic(ticker, slice_)
        try:
            return _OPENBB_ADAPTERS[slice_](obb, ticker)
        except Exception as exc:  # a single provider hiccup shouldn't halt the desk
            log.warning("OpenBB %s/%s failed (%s); synthetic fallback", ticker, slice_, exc)
            return _synthetic(ticker, slice_) | {"_degraded": True}


# ---------------------------------------------------------------------------
# OpenBB adapters — thin translations from obb.* endpoints into flat dicts.
# These are the exact integration seams; wire real columns/providers here.
# Signatures deliberately return {} on empty so analysts see "missing", not junk.
# ---------------------------------------------------------------------------
def _tech(obb, t):  # noqa: ANN001
    hist = obb.equity.price.historical(t, provider="yfinance").to_df()
    close = hist["close"]
    return {
        "last": float(close.iloc[-1]),
        "sma_50": float(close.rolling(50).mean().iloc[-1]),
        "sma_200": float(close.rolling(200).mean().iloc[-1]),
        "rsi_14": float(obb.technical.rsi(data=hist, length=14).to_df().iloc[-1, -1]),
        "ret_1m": float(close.iloc[-1] / close.iloc[-21] - 1),
        "ret_3m": float(close.iloc[-1] / close.iloc[-63] - 1),
    }


def _fund(obb, t):  # noqa: ANN001
    m = obb.equity.fundamental.metrics(t, provider="yfinance").to_df().iloc[-1]
    return {
        "pe": _f(m.get("pe_ratio")),
        "eps": _f(m.get("eps")),
        "gross_margin": _f(m.get("gross_profit_margin")),
        "net_margin": _f(m.get("net_profit_margin")),
        "revenue_growth": _f(m.get("revenue_growth")),
    }


def _est(obb, t):  # noqa: ANN001
    pt = obb.equity.estimates.price_target(t).to_df()
    return {
        "consensus_target": _f(pt["price_target"].mean()) if len(pt) else None,
        "analyst_count": int(len(pt)),
        "rating_buy_pct": _f((pt.get("rating") == "Buy").mean()) if "rating" in pt else None,
    }


def _news(obb, t):  # noqa: ANN001
    news = obb.news.company(t, limit=25).to_df()
    return {"headlines": news["title"].tolist()[:25] if "title" in news else []}


def _flow(obb, t):  # noqa: ANN001
    own = obb.equity.ownership.institutional(t).to_df()
    short = obb.equity.shorts.short_interest(t).to_df()
    return {
        "institutional_holders": int(len(own)),
        "short_interest_pct": _f(short["short_interest_ratio"].iloc[-1]) if len(short) else None,
        "days_to_cover": _f(short["days_to_cover"].iloc[-1]) if "days_to_cover" in short else None,
    }


def _opts(obb, t):  # noqa: ANN001
    chain = obb.derivatives.options.chains(t).to_df()
    calls = chain[chain["option_type"] == "call"]
    puts = chain[chain["option_type"] == "put"]
    pcr = len(puts) / max(len(calls), 1)
    return {
        "put_call_ratio": _f(pcr),
        "atm_iv": _f(chain["implied_volatility"].median()) if "implied_volatility" in chain else None,
    }


def _macro(obb, t):  # noqa: ANN001
    y10 = obb.fixedincome.government.treasury_rates().to_df()
    vix = obb.index.price.historical("^VIX", provider="yfinance").to_df()
    return {
        "ust_10y": _f(y10["year_10"].iloc[-1]) if "year_10" in y10 else None,
        "vix": _f(vix["close"].iloc[-1]) if len(vix) else None,
    }


_OPENBB_ADAPTERS: dict[str, Callable] = {
    "technical": _tech,
    "fundamentals": _fund,
    "estimates": _est,
    "news": _news,
    "flow": _flow,
    "options": _opts,
    "macro": _macro,
}


def _f(x) -> float | None:
    try:
        return None if x is None else float(x)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Synthetic fallback — deterministic per ticker so runs are reproducible offline.
# ---------------------------------------------------------------------------
def _synthetic(ticker: str, slice_: str) -> dict[str, Any]:
    seed = sum(ord(c) for c in ticker)
    base = 50 + (seed % 250)
    data = {
        "technical": {
            "last": base, "sma_50": base * 0.98, "sma_200": base * 0.94,
            "rsi_14": 45 + seed % 30, "ret_1m": (seed % 20 - 8) / 100,
            "ret_3m": (seed % 40 - 15) / 100,
        },
        "fundamentals": {
            "pe": 12 + seed % 30, "eps": 2 + seed % 8,
            "gross_margin": 0.3 + (seed % 40) / 100, "net_margin": 0.05 + (seed % 20) / 100,
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
        "options": {"put_call_ratio": 0.6 + (seed % 80) / 100, "atm_iv": 0.25 + (seed % 40) / 100},
        "macro": {"ust_10y": 4.2, "vix": 14 + seed % 12},
    }[slice_]
    return data | {"_synthetic": True}
