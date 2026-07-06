"""Live equities provider — Yahoo Finance via the ``yfinance`` package.

Serves all seven slices for stocks/ETFs with no API key. This is the default
live source for equities and the reference implementation for the slice shapes.
Indicators are computed by the shared engine, so an equity's ``technical`` slice
is directly comparable to a crypto pair's.

``yfinance`` is imported lazily; if it is absent the provider reports it serves
nothing and the gateway falls through to the next provider. Requires outbound
access to Yahoo's hosts (open on a normal deploy; blocked in restricted CI).
"""

from __future__ import annotations

from typing import Any

from ..indicators import snapshot_from_candles

# Bars/year for daily equity data (trading days).
EQUITY_PERIODS_PER_YEAR = 252

_MACRO_TICKERS = {"ust_10y": "^TNX", "vix": "^VIX"}


class YFinanceProvider:
    name = "yfinance"

    def __init__(self) -> None:
        self._yf = None

    def _lib(self):
        if self._yf is None:
            try:
                import yfinance as yf  # noqa
                self._yf = yf
            except ImportError:
                self._yf = False
        return self._yf

    def supports(self, ticker: str) -> bool:
        # Equities/ETFs: no pair underscore. (Crypto pairs go to CryptoComProvider.)
        return self._lib() is not False and "_" not in ticker

    def fetch(self, ticker: str, slice_: str) -> dict[str, Any] | None:
        yf = self._lib()
        if not yf:
            return None
        try:
            return getattr(self, f"_{slice_}")(yf, ticker)
        except AttributeError:
            return None
        except Exception:
            return None  # a provider miss is not fatal; gateway falls through

    # ------------------------------------------------------------- slices
    def _technical(self, yf, ticker) -> dict:
        hist = yf.Ticker(ticker).history(period="1y", interval="1d")
        if hist.empty:
            return None
        snap = snapshot_from_candles(
            hist["Open"].tolist(), hist["High"].tolist(),
            hist["Low"].tolist(), hist["Close"].tolist(),
            periods_per_year=EQUITY_PERIODS_PER_YEAR,
        )
        snap["_source"] = self.name
        return snap

    def _fundamentals(self, yf, ticker) -> dict:
        info = yf.Ticker(ticker).info
        return {
            "pe": info.get("trailingPE"),
            "eps": info.get("trailingEps"),
            "gross_margin": info.get("grossMargins"),
            "net_margin": info.get("profitMargins"),
            "revenue_growth": info.get("revenueGrowth"),
            "market_cap": info.get("marketCap"),
            "_source": self.name,
        }

    def _estimates(self, yf, ticker) -> dict:
        info = yf.Ticker(ticker).info
        return {
            "consensus_target": info.get("targetMeanPrice"),
            "target_high": info.get("targetHighPrice"),
            "target_low": info.get("targetLowPrice"),
            "analyst_count": info.get("numberOfAnalystOpinions"),
            "recommendation": info.get("recommendationKey"),
            "_source": self.name,
        }

    def _news(self, yf, ticker) -> dict:
        items = yf.Ticker(ticker).news or []
        heads = [i.get("title") for i in items if i.get("title")][:25]
        return {"headlines": heads, "_source": self.name}

    def _flow(self, yf, ticker) -> dict:
        info = yf.Ticker(ticker).info
        return {
            "institutional_pct": info.get("heldPercentInstitutions"),
            "short_interest_pct": info.get("shortPercentOfFloat"),
            "shares_short": info.get("sharesShort"),
            "short_ratio": info.get("shortRatio"),  # days to cover
            "_source": self.name,
        }

    def _options(self, yf, ticker) -> dict:
        tk = yf.Ticker(ticker)
        exps = tk.options
        if not exps:
            return None
        chain = tk.option_chain(exps[0])
        calls, puts = chain.calls, chain.puts
        pcr = (puts["openInterest"].sum() / max(calls["openInterest"].sum(), 1))
        iv = None
        if "impliedVolatility" in calls:
            iv = float(calls["impliedVolatility"].median())
        return {"put_call_ratio": float(pcr), "atm_iv": iv,
                "expiry": exps[0], "_source": self.name}

    def _macro(self, yf, ticker) -> dict:
        out: dict[str, Any] = {"_source": self.name}
        for key, sym in _MACRO_TICKERS.items():
            try:
                h = yf.Ticker(sym).history(period="5d")
                out[key] = float(h["Close"].iloc[-1]) if not h.empty else None
            except Exception:
                out[key] = None
        return out
