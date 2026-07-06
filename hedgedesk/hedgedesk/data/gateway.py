"""DataGateway — the desk's single data terminal, now provider-chained.

One gateway, many providers. For each (ticker, slice) it walks an ordered chain
and takes the first provider that both *supports* the ticker and *returns* the
slice; a synthetic provider anchors the chain so there is always an answer. This
is what lets the same desk cover equities (yfinance / OpenBB) and crypto
(Crypto.com) transparently — an analyst asks for ``technical`` and neither knows
nor cares which venue answered.

Kept: the TTL cache (analysts run in parallel and would otherwise stampede the
same endpoints) and a stable public API. ``OpenBBGateway`` remains as an alias.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from ..config import Settings, get_settings
from .providers.base import SLICES, DataProvider
from .providers.cryptocom import CryptoComProvider
from .providers.openbb import OpenBBProvider
from .providers.synthetic import SyntheticProvider
from .providers.yfinance_provider import YFinanceProvider

log = logging.getLogger("hedgedesk.data")

# Provider order: richest live source first, synthetic floor last. The gateway
# skips providers that don't support a ticker, so crypto pairs route to
# Crypto.com and equities to OpenBB/yfinance automatically.
_REGISTRY = {
    "openbb": lambda s: OpenBBProvider(pat=s.openbb_pat),
    "yfinance": lambda s: YFinanceProvider(),
    "cryptocom": lambda s: CryptoComProvider(timeframe=getattr(s, "crypto_timeframe", "4h")),
    "synthetic": lambda s: SyntheticProvider(),
}
DEFAULT_CHAIN = ("openbb", "yfinance", "cryptocom", "synthetic")


class DataGateway:
    def __init__(
        self,
        settings: Settings | None = None,
        providers: list[DataProvider] | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self._cache: dict[str, tuple[float, Any]] = {}
        if providers is not None:
            self.providers = providers
        else:
            names = getattr(self.settings, "providers", None) or DEFAULT_CHAIN
            self.providers = [_REGISTRY[n](self.settings) for n in names if n in _REGISTRY]
        # Guarantee a synthetic floor even if config omits it.
        if not any(isinstance(p, SyntheticProvider) for p in self.providers):
            self.providers.append(SyntheticProvider())

    # ------------------------------------------------------------- public API
    def snapshot(self, ticker: str, slice_: str) -> dict[str, Any]:
        if slice_ not in SLICES:
            raise ValueError(f"unknown slice {slice_!r}; expected one of {SLICES}")
        return self._cached(f"{ticker}:{slice_}", ticker, slice_)

    def full(self, ticker: str) -> dict[str, dict[str, Any]]:
        return {s: self.snapshot(ticker, s) for s in SLICES}

    def provider_for(self, ticker: str, slice_: str) -> str:
        """Which provider actually answered (useful for the audit log)."""
        return self.snapshot(ticker, slice_).get("_source", "synthetic")

    # ---------------------------------------------------------------- internal
    def _cached(self, key: str, ticker: str, slice_: str) -> dict[str, Any]:
        now = time.time()
        hit = self._cache.get(key)
        if hit and now - hit[0] < self.settings.data_cache_ttl_seconds:
            return hit[1]
        value = self._resolve(ticker, slice_)
        self._cache[key] = (now, value)
        return value

    def _resolve(self, ticker: str, slice_: str) -> dict[str, Any]:
        for provider in self.providers:
            try:
                if not provider.supports(ticker):
                    continue
                result = provider.fetch(ticker, slice_)
            except Exception as exc:
                log.warning("provider %s failed on %s/%s: %s",
                            provider.name, ticker, slice_, exc)
                continue
            if result:
                result.setdefault("_source", provider.name)
                return result
        # SyntheticProvider serves everything, so this is effectively unreachable.
        return SyntheticProvider().fetch(ticker, slice_)


# Back-compat: the pipeline and older code import OpenBBGateway.
OpenBBGateway = DataGateway
