"""Technical indicators — pure functions over OHLCV series.

No dependencies beyond the stdlib+numpy, no I/O. Every live provider that
returns candles runs them through here, so the math is written once and unit
tested against known values. Conventions match what practitioners expect:

  * EMA: standard 2/(n+1) smoothing, seeded with the SMA of the first n bars.
  * RSI: Wilder's smoothing (the TradingView / classic definition), not the
    naive rolling-mean version — they diverge and Wilder's is the reference.
  * ATR: Wilder's true-range average.

All functions take a list/array of floats (oldest→newest) and return the latest
value (or the full series where noted). They return ``None`` when there is not
enough history rather than raising — a short series should lower conviction, not
crash the desk.
"""

from __future__ import annotations

from typing import Sequence

import numpy as np


def _arr(xs: Sequence[float]) -> np.ndarray:
    return np.asarray(xs, dtype=float)


def sma(closes: Sequence[float], length: int) -> float | None:
    c = _arr(closes)
    if len(c) < length:
        return None
    return float(c[-length:].mean())


def ema_series(closes: Sequence[float], length: int) -> np.ndarray | None:
    """Full EMA series, seeded with the SMA of the first `length` bars."""
    c = _arr(closes)
    if len(c) < length:
        return None
    k = 2.0 / (length + 1)
    out = np.empty(len(c))
    out[: length - 1] = np.nan
    out[length - 1] = c[:length].mean()
    for i in range(length, len(c)):
        out[i] = c[i] * k + out[i - 1] * (1 - k)
    return out


def ema(closes: Sequence[float], length: int) -> float | None:
    s = ema_series(closes, length)
    return None if s is None else float(s[-1])


def rsi(closes: Sequence[float], length: int = 14) -> float | None:
    """Wilder's RSI (the canonical definition)."""
    c = _arr(closes)
    if len(c) <= length:
        return None
    delta = np.diff(c)
    gains = np.clip(delta, 0, None)
    losses = -np.clip(delta, None, 0)
    # Wilder seed: simple average of the first `length` changes.
    avg_gain = gains[:length].mean()
    avg_loss = losses[:length].mean()
    for i in range(length, len(delta)):
        avg_gain = (avg_gain * (length - 1) + gains[i]) / length
        avg_loss = (avg_loss * (length - 1) + losses[i]) / length
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return float(100 - 100 / (1 + rs))


def atr(highs: Sequence[float], lows: Sequence[float], closes: Sequence[float],
        length: int = 14) -> float | None:
    """Wilder's Average True Range."""
    h, l, c = _arr(highs), _arr(lows), _arr(closes)
    if len(c) <= length:
        return None
    prev_close = c[:-1]
    tr = np.maximum.reduce([
        h[1:] - l[1:],
        np.abs(h[1:] - prev_close),
        np.abs(l[1:] - prev_close),
    ])
    a = tr[:length].mean()
    for i in range(length, len(tr)):
        a = (a * (length - 1) + tr[i]) / length
    return float(a)


def pct_return(closes: Sequence[float], bars: int) -> float | None:
    c = _arr(closes)
    if len(c) <= bars:
        return None
    return float(c[-1] / c[-1 - bars] - 1)


def realized_vol(closes: Sequence[float], periods_per_year: int = 2190) -> float | None:
    """Annualized realized vol from log returns.

    Default periods_per_year=2190 = 6 four-hour bars/day * 365 (crypto trades
    24/7). Pass 252 for daily equity bars.
    """
    c = _arr(closes)
    if len(c) < 3:
        return None
    rets = np.diff(np.log(c))
    return float(rets.std(ddof=1) * np.sqrt(periods_per_year))


def snapshot_from_candles(
    opens, highs, lows, closes, *, periods_per_year: int = 2190
) -> dict:
    """Build the `technical` data slice from a candle series (oldest→newest)."""
    last = float(closes[-1]) if len(closes) else None
    return {
        "last": last,
        "sma_50": sma(closes, 50),
        "sma_200": sma(closes, 200),
        "ema_20": ema(closes, 20),
        "ema_50": ema(closes, 50),
        "rsi_14": rsi(closes, 14),
        "atr_14": atr(highs, lows, closes, 14),
        "ret_1w": pct_return(closes, 42),      # ~1wk of 4h bars
        "ret_1m": pct_return(closes, 180),     # ~1mo of 4h bars
        "realized_vol": realized_vol(closes, periods_per_year),
        "bars": len(closes),
    }
