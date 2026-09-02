# LordBastian Signal Generator — walk-forward research

Generated 2026-09-02T21:10:53.714Z · 3y of 4h candles via FMP · train = first 70% of each market's history, validate = last 30% (out-of-sample).

A variant only counts as an improvement if it beats its comparator in **both** periods — train-only wins are fitted noise.

Enrichment coverage: funding 4/4 · fng 3132 · econ 1027 · usd ok · btc ok

## BTC / USD

6638 candles, 2023-08-24 → 2026-09-02, split at 2025-10-06

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 13 · 23% fav · avg -0.58% · PF 0.46 | 4 · 0% fav · avg -0.70% · PF 0.00 |
| Unfiltered baseline | 74 · 36% fav · avg -0.20% · PF 0.79 | 39 · 28% fav · avg -0.21% · PF 0.67 |
| Filtered + trailing exit | 13 · 38% fav · avg +0.00% · PF 1.00 | 4 · 0% fav · avg -0.90% · PF 0.00 |

## XAU / USD · Gold

4650 candles, 2023-08-24 → 2026-09-02, split at 2025-10-08

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 19 · 26% fav · avg +0.08% · PF 1.39 | 5 · 40% fav · avg -0.83% · PF 0.40 |
| Unfiltered baseline | 61 · 39% fav · avg +0.13% · PF 1.54 | 27 · 33% fav · avg -0.35% · PF 0.56 |
| Filtered + trailing exit | 19 · 32% fav · avg +0.06% · PF 1.16 | 5 · 20% fav · avg -1.43% · PF 0.04 |

## US30 · Dow (DIA proxy)

1511 candles, 2023-08-24 → 2026-09-02, split at 2025-10-07

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 3 · 67% fav · avg +0.17% · PF 1.38 | 0 signals |
| Unfiltered baseline | 8 · 63% fav · avg +0.23% · PF 1.77 | 4 · 75% fav · avg +0.52% · PF 2.72 |
| Filtered + trailing exit | 3 · 67% fav · avg +0.63% · PF 2.13 | 0 signals |

## NAS100 · Nasdaq (QQQ proxy)

1511 candles, 2023-08-24 → 2026-09-02, split at 2025-10-07

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 1 · 100% fav · avg +0.88% · PF ∞ | 1 · 100% fav · avg +0.58% · PF ∞ |
| Unfiltered baseline | 10 · 70% fav · avg +1.05% · PF 44.12 | 10 · 60% fav · avg +0.37% · PF 1.76 |
| Filtered + trailing exit | 1 · 100% fav · avg +3.55% · PF ∞ | 1 · 0% fav · avg -0.68% · PF 0.00 |

## SPX500 · S&P (SPY proxy)

1511 candles, 2023-08-24 → 2026-09-02, split at 2025-10-07

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 1 · 0% fav · avg -1.22% · PF 0.00 | 3 · 100% fav · avg +1.18% · PF ∞ |
| Unfiltered baseline | 8 · 50% fav · avg +0.18% · PF 1.50 | 10 · 60% fav · avg +0.35% · PF 2.35 |
| Filtered + trailing exit | 1 · 0% fav · avg -1.02% · PF 0.00 | 3 · 100% fav · avg +2.54% · PF ∞ |

## GBP / USD · Cable

4725 candles, 2023-08-24 → 2026-09-02, split at 2025-10-07

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 11 · 45% fav · avg +0.08% · PF 1.68 | 1 · 100% fav · avg +0.09% · PF ∞ |
| Unfiltered baseline | 56 · 32% fav · avg -0.01% · PF 0.91 | 26 · 35% fav · avg -0.07% · PF 0.59 |
| Filtered + trailing exit | 11 · 18% fav · avg -0.18% · PF 0.13 | 1 · 100% fav · avg +0.12% · PF ∞ |

## EUR / USD

4722 candles, 2023-08-24 → 2026-09-02, split at 2025-10-06

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 8 · 25% fav · avg -0.11% · PF 0.48 | 3 · 33% fav · avg -0.10% · PF 0.02 |
| Unfiltered baseline | 46 · 37% fav · avg +0.00% · PF 1.02 | 30 · 40% fav · avg +0.01% · PF 1.16 |
| Filtered + trailing exit | 8 · 38% fav · avg +0.10% · PF 1.44 | 3 · 0% fav · avg -0.25% · PF 0.00 |

## WTI Crude Oil

4473 candles, 2023-10-01 → 2026-09-02, split at 2025-10-20

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 13 · 31% fav · avg -0.07% · PF 0.88 | 5 · 60% fav · avg -0.19% · PF 0.76 |
| Unfiltered baseline | 65 · 38% fav · avg +0.23% · PF 1.59 | 28 · 39% fav · avg -0.46% · PF 0.56 |
| Filtered + trailing exit | 13 · 31% fav · avg -0.09% · PF 0.88 | 5 · 40% fav · avg +0.16% · PF 1.12 |

## Alternative entry families (pooled)

| Strategy | Train | Validate | Verdict |
|---|---|---|---|
| Donchian-55 breakout, fixed exits | 610 · 40% fav · avg +0.04% · PF 1.09 | 225 · 40% fav · avg +0.18% · PF 1.41 | ✅ positive in BOTH periods |
| Donchian-55 breakout, trailing exits | 610 · 36% fav · avg +0.01% · PF 1.02 | 224 · 38% fav · avg +0.45% · PF 1.77 | ✅ positive in BOTH periods |
| Funding-extreme mean reversion, fixed | 0 signals | 14 · 21% fav · avg -0.74% · PF 0.31 | ❌ no out-of-sample edge |
| Funding-extreme mean reversion, trailing | 0 signals | 14 · 29% fav · avg -0.79% · PF 0.31 | ❌ no out-of-sample edge |
| **Breakout trailing, NET of per-market costs** | 610 · 35% fav · avg -0.04% · PF 0.93 | 224 · 37% fav · avg +0.40% · PF 1.65 | ❌ costs eat the edge |

## Breakout + trailing, per market (net of that market's cost)

| Market | Cost | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|
| BTC / USD | 0.10% | 114 · 31% fav · avg -0.16% · PF 0.86 | 48 · 27% fav · avg -0.05% · PF 0.95 | ❌ no net edge |
| XAU / USD · Gold | 0.05% | 108 · 44% fav · avg +0.11% · PF 1.30 | 36 · 56% fav · avg +0.82% · PF 2.81 | ✅ net edge |
| US30 · Dow (DIA proxy) | 0.02% | 35 · 37% fav · avg +0.27% · PF 1.54 | 14 · 14% fav · avg -0.56% · PF 0.26 | ❌ no net edge |
| NAS100 · Nasdaq (QQQ proxy) | 0.02% | 37 · 46% fav · avg +0.31% · PF 1.59 | 13 · 46% fav · avg +1.03% · PF 2.90 | ✅ net edge |
| SPX500 · S&P (SPY proxy) | 0.02% | 42 · 45% fav · avg +0.33% · PF 1.88 | 14 · 36% fav · avg +0.09% · PF 1.17 | ✅ net edge |
| GBP / USD · Cable | 0.03% | 93 · 33% fav · avg -0.07% · PF 0.70 | 34 · 29% fav · avg -0.03% · PF 0.82 | ❌ no net edge |
| EUR / USD | 0.03% | 89 · 29% fav · avg -0.04% · PF 0.79 | 31 · 42% fav · avg +0.02% · PF 1.13 | ❌ no net edge |
| WTI Crude Oil | 0.05% | 92 · 25% fav · avg -0.45% · PF 0.54 | 34 · 38% fav · avg +1.66% · PF 2.51 | ❌ no net edge |

Per-market edge status published to edge-status.json — alerts for ❌ markets carry an informational-only warning.

## Donchian lookback grid (breakout + trailing, net of costs)

| Lookback | All markets: train | validate | Non-crypto only: train | validate |
|---|---|---|---|---|
| 20 | 978 · 38% fav · avg +0.04% · PF 1.07 | 405 · 38% fav · avg +0.14% · PF 1.21 | 789 · 38% fav · avg +0.05% · PF 1.12 | 316 · 41% fav · avg +0.26% · PF 1.50 |
| 55 | 610 · 35% fav · avg -0.04% · PF 0.93 | 224 · 37% fav · avg +0.40% · PF 1.65 | 496 · 36% fav · avg -0.01% · PF 0.98 | 176 · 39% fav · avg +0.53% · PF 2.03 |
| 100 | 446 · 36% fav · avg +0.00% · PF 1.01 | 172 · 41% fav · avg +0.56% · PF 2.03 | 359 · 37% fav · avg +0.02% · PF 1.04 | 137 · 43% fav · avg +0.63% · PF 2.50 |

## Candidate markets (4h breakout + trailing, net of own cost)

New markets audition with the exact live rule set — a candidate is added to the app only if net-positive in both periods.

| Candidate | Cost | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|
| XAG / USD · Silver | 0.05% | 94 · 34% fav · avg -0.02% · PF 0.97 | 43 · 42% fav · avg +0.01% · PF 1.00 | ❌ no net edge |
| USD / JPY | 0.03% | 93 · 41% fav · avg +0.06% · PF 1.25 | 37 · 30% fav · avg -0.07% · PF 0.60 | ❌ no net edge |
| AUD / USD | 0.03% | 88 · 23% fav · avg -0.19% · PF 0.47 | 40 · 35% fav · avg +0.01% · PF 1.03 | ❌ no net edge |
| USD / CAD | 0.03% | 85 · 29% fav · avg -0.01% · PF 0.94 | 46 · 46% fav · avg +0.04% · PF 1.43 | ❌ no net edge |
| EUR / GBP | 0.03% | 71 · 32% fav · avg -0.05% · PF 0.76 | 35 · 23% fav · avg -0.09% · PF 0.38 | ❌ no net edge |
| Natural Gas | 0.08% | 100 · 39% fav · avg +0.39% · PF 1.27 | 38 · 26% fav · avg -0.61% · PF 0.72 | ❌ no net edge |

## Scalp feasibility: Donchian breakout on 1-hour candles

Same strategy, 4× faster timeframe, 7 markets over up to 2 years. The question is not accuracy — it is whether the per-trade move survives realistic per-market round-trip costs. Faster timeframes shrink the move; costs stay constant.

| Variant | Train (gross) | Validate (gross) | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|---|
| 1h breakout, fixed exits | 1273 · 38% fav · avg +0.03% · PF 1.14 | 538 · 36% fav · avg +0.02% · PF 1.08 | 1273 · 35% fav · avg -0.02% · PF 0.89 | 538 · 33% fav · avg -0.03% · PF 0.87 | ❌ not viable net of costs |
| 1h breakout, trailing exits | 1273 · 38% fav · avg +0.03% · PF 1.14 | 538 · 38% fav · avg +0.02% · PF 1.09 | 1273 · 35% fav · avg -0.02% · PF 0.94 | 538 · 35% fav · avg -0.03% · PF 0.92 | ❌ not viable net of costs |

### Scalp rescue filters (1h breakout + trailing, net of costs)

Each filter attacks the reason scalping failed: too-small moves against fixed costs. A filter only counts if it turns the NET result positive in both periods.

| Filter | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| Session only (07–16 UTC) | 739 · 35% fav · avg -0.00% · PF 0.99 | 327 · 37% fav · avg -0.01% · PF 0.96 | ❌ not viable net of costs |
| High volatility only (ATR% > trailing avg) | 645 · 35% fav · avg -0.01% · PF 0.98 | 272 · 38% fav · avg +0.01% · PF 1.02 | ❌ not viable net of costs |
| 4h-edge markets only (GOLD, NAS100, SPX500) | 408 · 39% fav · avg +0.05% · PF 1.21 | 165 · 42% fav · avg +0.09% · PF 1.25 | ✅ survives costs on 1h |
| All three combined | 132 · 39% fav · avg +0.10% · PF 1.30 | 51 · 51% fav · avg +0.24% · PF 1.80 | ✅ survives costs on 1h |
| Combo at HALF costs (best-case raw spreads) | 132 · 39% fav · avg +0.12% · PF 1.36 | 51 · 53% fav · avg +0.25% · PF 1.88 | ✅ viable IF costs halve |

## Daily-candle breakout (slower, not faster)

Daily candles aggregated from the same history. Fewer, bigger trades — the direction where cost drag shrinks instead of grows.

| Lookback | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| 20 | 257 · 37% fav · avg -0.02% · PF 0.98 | 104 · 41% fav · avg +0.95% · PF 1.74 | ❌ no net edge on daily |
| 55 | 158 · 42% fav · avg +0.23% · PF 1.22 | 64 · 39% fav · avg +1.51% · PF 2.63 | ✅ survives costs on daily |

## Exit grid — 4h breakout (edge markets: GOLD, NAS100, SPX500)

| stop / trail / window | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| **1.5 / 2 / 18 (live)** | 187 · 45% fav · avg +0.20% · PF 1.50 | 63 · 49% fav · avg +0.70% · PF 2.42 | baseline |
| 1.5 / 1.5 / 12 | 187 · 45% fav · avg +0.19% · PF 1.61 | 63 · 54% fav · avg +0.49% · PF 2.17 | · no improvement |
| 1.5 / 1.5 / 18 | 187 · 45% fav · avg +0.19% · PF 1.61 | 63 · 54% fav · avg +0.48% · PF 2.13 | · no improvement |
| 1.5 / 1.5 / 24 | 187 · 45% fav · avg +0.19% · PF 1.58 | 63 · 54% fav · avg +0.46% · PF 2.10 | · no improvement |
| 1.5 / 2 / 12 | 187 · 47% fav · avg +0.23% · PF 1.60 | 63 · 49% fav · avg +0.62% · PF 2.24 | · no improvement |
| 1.5 / 2 / 24 | 187 · 44% fav · avg +0.18% · PF 1.46 | 63 · 49% fav · avg +0.75% · PF 2.50 | · no improvement |
| 1.5 / 3 / 12 | 187 · 42% fav · avg +0.14% · PF 1.31 | 63 · 51% fav · avg +0.64% · PF 2.03 | · no improvement |
| 1.5 / 3 / 18 | 187 · 37% fav · avg +0.08% · PF 1.16 | 63 · 48% fav · avg +0.65% · PF 2.02 | · no improvement |
| 1.5 / 3 / 24 | 187 · 34% fav · avg +0.02% · PF 1.04 | 63 · 46% fav · avg +0.75% · PF 2.14 | · no improvement |
| 2 / 1.5 / 12 | 187 · 45% fav · avg +0.20% · PF 1.62 | 63 · 54% fav · avg +0.49% · PF 2.15 | · no improvement |
| 2 / 1.5 / 18 | 187 · 45% fav · avg +0.20% · PF 1.62 | 63 · 54% fav · avg +0.47% · PF 2.11 | · no improvement |
| 2 / 1.5 / 24 | 187 · 45% fav · avg +0.19% · PF 1.60 | 63 · 54% fav · avg +0.46% · PF 2.08 | · no improvement |
| 2 / 2 / 12 | 187 · 49% fav · avg +0.24% · PF 1.62 | 63 · 49% fav · avg +0.56% · PF 2.02 | · no improvement |
| 2 / 2 / 18 | 187 · 47% fav · avg +0.22% · PF 1.55 | 63 · 49% fav · avg +0.64% · PF 2.14 | · no improvement |
| 2 / 2 / 24 | 187 · 46% fav · avg +0.20% · PF 1.49 | 63 · 49% fav · avg +0.68% · PF 2.22 | · no improvement |
| 2 / 3 / 12 | 187 · 45% fav · avg +0.13% · PF 1.26 | 63 · 52% fav · avg +0.55% · PF 1.75 | · no improvement |
| 2 / 3 / 18 | 187 · 40% fav · avg +0.06% · PF 1.10 | 63 · 49% fav · avg +0.56% · PF 1.72 | · no improvement |
| 2 / 3 / 24 | 187 · 38% fav · avg -0.00% · PF 0.99 | 63 · 48% fav · avg +0.66% · PF 1.83 | ❌ not net-positive both periods |

## Side split — 4h breakout (edge markets: GOLD, NAS100, SPX500) (live exits)

| Side | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| long | 144 · 48% fav · avg +0.27% · PF 1.77 | 44 · 59% fav · avg +0.88% · PF 3.04 | ✅ carries its weight |
| short | 43 · 35% fav · avg -0.06% · PF 0.89 | 19 · 26% fav · avg +0.29% · PF 1.45 | ❌ loses net in at least one period |

## Exit grid — daily swing-55 (pooled)

| stop / trail / window | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| **1.5 / 2 / 18 (live)** | 158 · 42% fav · avg +0.23% · PF 1.22 | 64 · 39% fav · avg +1.51% · PF 2.63 | baseline |
| 1.5 / 1.5 / 12 | 158 · 41% fav · avg +0.06% · PF 1.07 | 64 · 42% fav · avg +1.22% · PF 2.71 | · no improvement |
| 1.5 / 1.5 / 18 | 158 · 41% fav · avg +0.11% · PF 1.13 | 64 · 42% fav · avg +1.31% · PF 2.83 | · no improvement |
| 1.5 / 1.5 / 24 | 158 · 41% fav · avg +0.12% · PF 1.15 | 64 · 42% fav · avg +1.22% · PF 2.71 | · no improvement |
| 1.5 / 2 / 12 | 158 · 42% fav · avg +0.07% · PF 1.07 | 64 · 39% fav · avg +1.24% · PF 2.30 | · no improvement |
| 1.5 / 2 / 24 | 158 · 41% fav · avg +0.34% · PF 1.32 | 64 · 38% fav · avg +1.33% · PF 2.35 | · no improvement |
| 1.5 / 3 / 12 | 158 · 42% fav · avg +0.09% · PF 1.08 | 64 · 36% fav · avg +0.93% · PF 1.79 | · no improvement |
| 1.5 / 3 / 18 | 158 · 37% fav · avg +0.27% · PF 1.22 | 64 · 33% fav · avg +1.22% · PF 2.03 | · no improvement |
| 1.5 / 3 / 24 | 158 · 35% fav · avg +0.38% · PF 1.30 | 63 · 32% fav · avg +0.97% · PF 1.74 | · no improvement |
| 2 / 1.5 / 12 | 158 · 41% fav · avg +0.04% · PF 1.05 | 64 · 42% fav · avg +1.22% · PF 2.71 | · no improvement |
| 2 / 1.5 / 18 | 158 · 41% fav · avg +0.08% · PF 1.10 | 64 · 42% fav · avg +1.31% · PF 2.83 | · no improvement |
| 2 / 1.5 / 24 | 158 · 41% fav · avg +0.10% · PF 1.12 | 64 · 42% fav · avg +1.22% · PF 2.71 | · no improvement |
| 2 / 2 / 12 | 158 · 43% fav · avg -0.00% · PF 1.00 | 64 · 41% fav · avg +1.20% · PF 2.21 | ❌ not net-positive both periods |
| 2 / 2 / 18 | 158 · 43% fav · avg +0.16% · PF 1.14 | 64 · 39% fav · avg +1.44% · PF 2.43 | · no improvement |
| 2 / 2 / 24 | 158 · 42% fav · avg +0.28% · PF 1.25 | 64 · 38% fav · avg +1.25% · PF 2.18 | · no improvement |
| 2 / 3 / 12 | 158 · 47% fav · avg +0.14% · PF 1.11 | 64 · 39% fav · avg +1.20% · PF 1.99 | · no improvement |
| 2 / 3 / 18 | 158 · 45% fav · avg +0.39% · PF 1.30 | 64 · 36% fav · avg +2.26% · PF 2.78 | ✅ beats live config both periods |
| 2 / 3 / 24 | 158 · 44% fav · avg +0.67% · PF 1.51 | 63 · 35% fav · avg +2.00% · PF 2.38 | ✅ beats live config both periods |

## Side split — daily swing-55 (pooled) (live exits)

| Side | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| long | 128 · 43% fav · avg +0.45% · PF 1.49 | 41 · 44% fav · avg +2.28% · PF 4.31 | ✅ carries its weight |
| short | 30 · 37% fav · avg -0.72% · PF 0.56 | 23 · 30% fav · avg +0.14% · PF 1.10 | ❌ loses net in at least one period |

## WTI deep-dive

4473 4h candles (2023-10-01 → 2026-09-02), 908 daily. Three-way split (tune / select / confirm); a candidate must be net-positive in ALL segments with ≥15 confirm trades. 14 variants tested — with this many looks at one market, treat even a triple pass as a paper candidate, not a funded stream.

| Variant | Tune (net) | Select (net) | Confirm (net) | Verdict |
|---|---|---|---|---|
| 4h breakout-20 | 114 · 31% fav · avg -0.27% · PF 0.69 | 56 · 30% fav · avg -0.14% · PF 0.85 | 50 · 38% fav · avg +0.97% · PF 1.75 | ❌ fails at least one segment |
| 4h breakout-20 longs | 61 · 28% fav · avg -0.29% · PF 0.65 | 31 · 26% fav · avg -0.40% · PF 0.62 | 31 · 45% fav · avg +1.97% · PF 2.86 | ❌ fails at least one segment |
| 4h breakout-55 | 68 · 24% fav · avg -0.64% · PF 0.37 | 28 · 25% fav · avg -0.09% · PF 0.90 | 30 · 43% fav · avg +2.05% · PF 2.89 | ❌ fails at least one segment |
| 4h breakout-55 longs | 33 · 24% fav · avg -0.41% · PF 0.54 | 14 · 14% fav · avg -0.08% · PF 0.90 | 19 · 42% fav · avg +2.91% · PF 4.63 | ❌ fails at least one segment |
| 4h breakout-55 shorts | 35 · 23% fav · avg -0.86% · PF 0.24 | 14 · 36% fav · avg -0.11% · PF 0.89 | 11 · 45% fav · avg +0.57% · PF 1.36 | ❌ fails at least one segment |
| 4h breakout-100 | 44 · 27% fav · avg -0.50% · PF 0.46 | 16 · 31% fav · avg +0.20% · PF 1.27 | 20 · 45% fav · avg +2.95% · PF 4.62 | ❌ fails at least one segment |
| 4h breakout-100 longs | 19 · 26% fav · avg -0.19% · PF 0.72 | 8 · 25% fav · avg +0.44% · PF 1.56 | 14 · 36% fav · avg +3.63% · PF 6.41 | ❌ fails at least one segment |
| 4h breakout-55 NY session (12-20 UTC) | 8 · 13% fav · avg -1.26% · PF 0.02 | 7 · 57% fav · avg +1.75% · PF 6.74 | 6 · 67% fav · avg +2.08% · PF 5.46 | ❌ fails at least one segment |
| 4h filtered cross | 11 · 18% fav · avg -0.38% · PF 0.51 | 3 · 100% fav · avg +0.91% · PF ∞ | 4 · 50% fav · avg -0.32% · PF 0.67 | ❌ fails at least one segment |
| daily breakout-20 | 19 · 37% fav · avg -0.80% · PF 0.55 | 10 · 20% fav · avg -0.73% · PF 0.71 | 10 · 50% fav · avg +3.36% · PF 1.89 | ❌ fails at least one segment |
| daily breakout-20 longs | 10 · 30% fav · avg -0.45% · PF 0.69 | 5 · 20% fav · avg +0.31% · PF 1.12 | 6 · 67% fav · avg +6.43% · PF 3.79 | ❌ fails at least one segment |
| daily breakout-55 (swing exits) | 9 · 44% fav · avg -0.04% · PF 0.98 | 4 · 50% fav · avg +0.19% · PF 1.13 | 5 · 40% fav · avg +18.12% · PF 5.87 | ❌ fails at least one segment |
| daily breakout-55 longs (swing exits) | 5 · 80% fav · avg +3.18% · PF 14.91 | 1 · 100% fav · avg +5.99% · PF ∞ | 3 · 67% fav · avg +35.90% · PF 73.35 | ❌ fails at least one segment |
| daily breakout-100 | 5 · 40% fav · avg -1.01% · PF 0.16 | 4 · 25% fav · avg -1.90% · PF 0.29 | 4 · 25% fav · avg +7.15% · PF 3.13 | ❌ fails at least one segment |

## AI meta-label experiment

A logistic model trained on the 328 train-period baseline signals (features: side, RSI, ADX, volume ratio, trend distance, ATR%) predicts the probability a signal ends favorable. Judged on the 174 untouched validate-period signals.

| Threshold | Train (kept signals) | Validate (kept signals) |
|---|---|---|
| p ≥ 0.5 | 40 · 43% fav · avg +0.11% · PF 1.21 | 27 · 30% fav · avg -0.74% · PF 0.40 |
| p ≥ 0.55 | 15 · 27% fav · avg -0.52% · PF 0.37 | 20 · 25% fav · avg -0.76% · PF 0.42 |
| p ≥ 0.6 | 3 · 0% fav · avg -1.09% · PF 0.00 | 15 · 13% fav · avg -0.95% · PF 0.14 |
| p ≥ 0.65 | 1 · 0% fav · avg +0.00% · PF ∞ | 9 · 22% fav · avg -0.53% · PF 0.34 |

**Verdict: ❌ does not pass out-of-sample** — the model is NOT published or used. Train-period fit did not survive on unseen data.

## Overall (all markets pooled)

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 69 · 32% fav · avg -0.10% · PF 0.79 | 22 · 50% fav · avg -0.18% · PF 0.71 |
| Unfiltered baseline | 328 · 39% fav · avg +0.06% · PF 1.16 | 174 · 39% fav · avg -0.13% · PF 0.75 |
| Filtered + trailing exit | 69 · 33% fav · avg +0.05% · PF 1.08 | 22 · 32% fav · avg -0.16% · PF 0.81 |

### Verdicts (by average move per signal)

- **Filters vs baseline**: train worse, validate worse → ❌ does NOT hold up out-of-sample
- **Trailing exit vs fixed exit**: train better, validate better → ✅ holds up out-of-sample

_Educational research, not financial advice. Past performance does not predict future results._
