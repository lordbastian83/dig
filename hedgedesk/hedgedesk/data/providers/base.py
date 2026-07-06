"""Data provider protocol.

A provider knows how to return one or more of the 7 named slices for a ticker.
The gateway chains providers (live → live → synthetic) and merges their slices,
so a provider only needs to implement the slices it actually serves — a crypto
exchange serves ``technical`` but not ``estimates``; an equity source serves all.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

# The canonical slice vocabulary (kept here so every provider agrees on it).
SLICES: tuple[str, ...] = (
    "technical",
    "fundamentals",
    "estimates",
    "news",
    "flow",
    "options",
    "macro",
)


@runtime_checkable
class DataProvider(Protocol):
    name: str

    def supports(self, ticker: str) -> bool:
        """Whether this provider can serve the given ticker (asset-class match)."""
        ...

    def fetch(self, ticker: str, slice_: str) -> dict[str, Any] | None:
        """Return the slice, or None if this provider does not serve it."""
        ...
