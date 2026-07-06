"""OpenBB provider — the full terminal, when installed and authenticated.

OpenBB aggregates many premium/free providers behind one SDK. When a PAT is
configured it is the richest source (insider data, deep options flow, macro).
It is optional and heavy, so it is imported lazily and only used if present; the
gateway falls through to yfinance/crypto otherwise. The slice adapters mirror the
same dict shapes the other providers emit, so downstream agents are indifferent
to which provider answered.
"""

from __future__ import annotations

import os
from typing import Any

from ..indicators import snapshot_from_candles


class OpenBBProvider:
    name = "openbb"

    def __init__(self, pat: str | None = None) -> None:
        self.pat = pat or os.getenv("OPENBB_PAT")
        self._obb = None

    def _lib(self):
        if self._obb is None:
            try:
                from openbb import obb  # type: ignore
                if self.pat:
                    obb.account.login(pat=self.pat)
                self._obb = obb
            except Exception:
                self._obb = False
        return self._obb

    def supports(self, ticker: str) -> bool:
        return self._lib() is not False and "_" not in ticker

    def fetch(self, ticker: str, slice_: str) -> dict[str, Any] | None:
        obb = self._lib()
        if not obb:
            return None
        try:
            return getattr(self, f"_{slice_}")(obb, ticker)
        except AttributeError:
            return None
        except Exception:
            return None

    def _technical(self, obb, t) -> dict:
        hist = obb.equity.price.historical(t, provider="yfinance").to_df()
        snap = snapshot_from_candles(
            hist["open"].tolist(), hist["high"].tolist(),
            hist["low"].tolist(), hist["close"].tolist(), periods_per_year=252,
        )
        snap["_source"] = self.name
        return snap

    def _fundamentals(self, obb, t) -> dict:
        m = obb.equity.fundamental.metrics(t, provider="yfinance").to_df().iloc[-1]
        return {
            "pe": _f(m.get("pe_ratio")), "eps": _f(m.get("eps")),
            "gross_margin": _f(m.get("gross_profit_margin")),
            "net_margin": _f(m.get("net_profit_margin")),
            "revenue_growth": _f(m.get("revenue_growth")), "_source": self.name,
        }

    def _estimates(self, obb, t) -> dict:
        pt = obb.equity.estimates.price_target(t).to_df()
        return {
            "consensus_target": _f(pt["price_target"].mean()) if len(pt) else None,
            "analyst_count": int(len(pt)), "_source": self.name,
        }

    def _news(self, obb, t) -> dict:
        n = obb.news.company(t, limit=25).to_df()
        return {"headlines": n["title"].tolist()[:25] if "title" in n else [],
                "_source": self.name}

    def _flow(self, obb, t) -> dict:
        short = obb.equity.shorts.short_interest(t).to_df()
        return {
            "short_interest_pct": _f(short["short_interest_ratio"].iloc[-1]) if len(short) else None,
            "days_to_cover": _f(short["days_to_cover"].iloc[-1]) if "days_to_cover" in short else None,
            "_source": self.name,
        }

    def _options(self, obb, t) -> dict:
        chain = obb.derivatives.options.chains(t).to_df()
        calls = chain[chain["option_type"] == "call"]
        puts = chain[chain["option_type"] == "put"]
        return {
            "put_call_ratio": _f(len(puts) / max(len(calls), 1)),
            "atm_iv": _f(chain["implied_volatility"].median()) if "implied_volatility" in chain else None,
            "_source": self.name,
        }

    def _macro(self, obb, t) -> dict:
        y = obb.fixedincome.government.treasury_rates().to_df()
        return {"ust_10y": _f(y["year_10"].iloc[-1]) if "year_10" in y else None,
                "_source": self.name}


def _f(x) -> float | None:
    try:
        return None if x is None else float(x)
    except (TypeError, ValueError):
        return None
