# LordBastian Signal Generator — walk-forward research

Generated 2026-09-27T22:47:12.477Z · 3y of 4h candles via FMP · train = first 70% of each market's history, validate = last 30% (out-of-sample).

A variant only counts as an improvement if it beats its comparator in **both** periods — train-only wins are fitted noise.

Enrichment coverage: funding 4/4 · fng 3157 · econ 849 · usd ok · btc ok

## BTC / USD

6638 candles, 2023-09-18 → 2026-09-27, split at 2025-10-31

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 12 · 25% fav · avg -0.49% · PF 0.53 | 4 · 0% fav · avg -0.70% · PF 0.00 |
| Unfiltered baseline | 74 · 38% fav · avg -0.18% · PF 0.81 | 39 · 28% fav · avg -0.17% · PF 0.74 |
| Filtered + trailing exit | 12 · 42% fav · avg +0.14% · PF 1.12 | 4 · 0% fav · avg -0.90% · PF 0.00 |

## XAU / USD · Gold

4650 candles, 2023-09-18 → 2026-09-25, split at 2025-10-31

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 19 · 26% fav · avg +0.08% · PF 1.39 | 5 · 40% fav · avg -0.83% · PF 0.40 |
| Unfiltered baseline | 62 · 40% fav · avg +0.13% · PF 1.57 | 26 · 31% fav · avg -0.38% · PF 0.54 |
| Filtered + trailing exit | 19 · 32% fav · avg +0.06% · PF 1.16 | 5 · 20% fav · avg -1.43% · PF 0.04 |

## US30 · Dow (DIA proxy)

1511 candles, 2023-09-18 → 2026-09-25, split at 2025-10-29

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 3 · 67% fav · avg +0.17% · PF 1.38 | 0 signals |
| Unfiltered baseline | 8 · 63% fav · avg +0.23% · PF 1.77 | 5 · 60% fav · avg +0.42% · PF 2.72 |
| Filtered + trailing exit | 3 · 67% fav · avg +0.63% · PF 2.13 | 0 signals |

## NAS100 · Nasdaq (QQQ proxy)

1511 candles, 2023-09-18 → 2026-09-25, split at 2025-10-29

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 1 · 100% fav · avg +0.88% · PF ∞ | 1 · 100% fav · avg +0.58% · PF ∞ |
| Unfiltered baseline | 10 · 70% fav · avg +1.05% · PF 44.12 | 12 · 58% fav · avg +0.35% · PF 1.69 |
| Filtered + trailing exit | 1 · 100% fav · avg +3.55% · PF ∞ | 1 · 0% fav · avg -0.68% · PF 0.00 |

## SPX500 · S&P (SPY proxy)

1511 candles, 2023-09-18 → 2026-09-25, split at 2025-10-29

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 1 · 0% fav · avg -1.22% · PF 0.00 | 3 · 100% fav · avg +1.18% · PF ∞ |
| Unfiltered baseline | 8 · 50% fav · avg +0.18% · PF 1.50 | 12 · 50% fav · avg +0.22% · PF 1.75 |
| Filtered + trailing exit | 1 · 0% fav · avg -1.02% · PF 0.00 | 3 · 100% fav · avg +2.54% · PF ∞ |

## GBP / USD · Cable

4725 candles, 2023-09-18 → 2026-09-25, split at 2025-10-30

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 10 · 50% fav · avg +0.14% · PF 3.07 | 1 · 100% fav · avg +0.09% · PF ∞ |
| Unfiltered baseline | 56 · 32% fav · avg -0.02% · PF 0.88 | 25 · 32% fav · avg -0.07% · PF 0.60 |
| Filtered + trailing exit | 10 · 20% fav · avg -0.13% · PF 0.17 | 1 · 100% fav · avg +0.12% · PF ∞ |

## EUR / USD

4722 candles, 2023-09-18 → 2026-09-25, split at 2025-10-29

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 8 · 25% fav · avg -0.05% · PF 0.67 | 2 · 50% fav · avg -0.15% · PF 0.02 |
| Unfiltered baseline | 41 · 37% fav · avg +0.03% · PF 1.29 | 31 · 39% fav · avg +0.02% · PF 1.18 |
| Filtered + trailing exit | 8 · 38% fav · avg +0.14% · PF 1.69 | 2 · 0% fav · avg -0.28% · PF 0.00 |

## WTI Crude Oil

4575 candles, 2023-10-01 → 2026-09-25, split at 2025-11-05

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 13 · 31% fav · avg -0.07% · PF 0.88 | 5 · 60% fav · avg -0.19% · PF 0.76 |
| Unfiltered baseline | 65 · 38% fav · avg +0.23% · PF 1.59 | 29 · 41% fav · avg -0.41% · PF 0.59 |
| Filtered + trailing exit | 13 · 31% fav · avg -0.09% · PF 0.88 | 5 · 40% fav · avg +0.17% · PF 1.14 |

## Alternative entry families (pooled)

| Strategy | Train | Validate | Verdict |
|---|---|---|---|
| Donchian-55 breakout, fixed exits | 610 · 40% fav · avg +0.05% · PF 1.11 | 228 · 38% fav · avg +0.12% · PF 1.24 | ✅ positive in BOTH periods |
| Donchian-55 breakout, trailing exits | 610 · 36% fav · avg +0.01% · PF 1.01 | 228 · 37% fav · avg +0.44% · PF 1.73 | ✅ positive in BOTH periods |
| Funding-extreme mean reversion, fixed | 0 signals | 14 · 50% fav · avg -0.11% · PF 0.81 | ❌ no out-of-sample edge |
| Funding-extreme mean reversion, trailing | 0 signals | 13 · 38% fav · avg -0.36% · PF 0.58 | ❌ no out-of-sample edge |
| **Breakout trailing, NET of per-market costs** | 610 · 35% fav · avg -0.04% · PF 0.93 | 228 · 36% fav · avg +0.40% · PF 1.62 | ❌ costs eat the edge |

## Breakout + trailing, per market (net of that market's cost)

| Market | Cost | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|
| BTC / USD | 0.10% | 115 · 30% fav · avg -0.18% · PF 0.84 | 47 · 32% fav · avg +0.18% · PF 1.19 | ❌ no net edge |
| XAU / USD · Gold | 0.05% | 107 · 44% fav · avg +0.13% · PF 1.35 | 32 · 56% fav · avg +0.86% · PF 2.84 | ✅ net edge |
| US30 · Dow (DIA proxy) | 0.02% | 36 · 39% fav · avg +0.27% · PF 1.55 | 14 · 7% fav · avg -0.63% · PF 0.23 | ❌ no net edge |
| NAS100 · Nasdaq (QQQ proxy) | 0.02% | 38 · 47% fav · avg +0.29% · PF 1.51 | 13 · 38% fav · avg +0.90% · PF 2.54 | ✅ net edge |
| SPX500 · S&P (SPY proxy) | 0.02% | 43 · 44% fav · avg +0.29% · PF 1.74 | 14 · 29% fav · avg +0.02% · PF 1.03 | ✅ net edge |
| GBP / USD · Cable | 0.03% | 91 · 33% fav · avg -0.06% · PF 0.71 | 36 · 31% fav · avg -0.02% · PF 0.88 | ❌ no net edge |
| EUR / USD | 0.03% | 87 · 30% fav · avg -0.04% · PF 0.79 | 34 · 41% fav · avg +0.01% · PF 1.07 | ❌ no net edge |
| WTI Crude Oil | 0.05% | 93 · 25% fav · avg -0.45% · PF 0.53 | 38 · 37% fav · avg +1.35% · PF 2.11 | ❌ no net edge |

Per-market edge status published to edge-status.json — alerts for ❌ markets carry an informational-only warning.

## Donchian lookback grid (breakout + trailing, net of costs)

| Lookback | All markets: train | validate | Non-crypto only: train | validate |
|---|---|---|---|---|
| 20 | 982 · 39% fav · avg +0.04% · PF 1.08 | 406 · 36% fav · avg +0.12% · PF 1.17 | 793 · 38% fav · avg +0.04% · PF 1.10 | 317 · 39% fav · avg +0.25% · PF 1.45 |
| 55 | 610 · 35% fav · avg -0.04% · PF 0.93 | 228 · 36% fav · avg +0.40% · PF 1.62 | 495 · 36% fav · avg -0.01% · PF 0.98 | 181 · 37% fav · avg +0.45% · PF 1.82 |
| 100 | 441 · 36% fav · avg +0.00% · PF 1.00 | 176 · 39% fav · avg +0.50% · PF 1.89 | 356 · 37% fav · avg +0.01% · PF 1.03 | 140 · 41% fav · avg +0.56% · PF 2.23 |

## Candidate markets (4h breakout + trailing, net of own cost)

New markets audition with the exact live rule set — a candidate is added to the app only if net-positive in both periods.

| Candidate | Cost | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|
| XAG / USD · Silver | 0.05% | 95 · 35% fav · avg -0.03% · PF 0.96 | 42 · 38% fav · avg -0.10% · PF 0.94 | ❌ no net edge |
| USD / JPY | 0.03% | 92 · 42% fav · avg +0.07% · PF 1.29 | 39 · 28% fav · avg -0.04% · PF 0.72 | ❌ no net edge |
| AUD / USD | 0.03% | 90 · 24% fav · avg -0.17% · PF 0.51 | 40 · 33% fav · avg -0.02% · PF 0.90 | ❌ no net edge |
| USD / CAD | 0.03% | 87 · 29% fav · avg -0.01% · PF 0.96 | 46 · 52% fav · avg +0.07% · PF 1.88 | ❌ no net edge |
| EUR / GBP | 0.03% | 70 · 33% fav · avg -0.05% · PF 0.79 | 36 · 22% fav · avg -0.09% · PF 0.32 | ❌ no net edge |
| Natural Gas | 0.08% | 103 · 38% fav · avg +0.27% · PF 1.17 | 39 · 26% fav · avg -0.46% · PF 0.76 | ❌ no net edge |

## Scalp feasibility: Donchian breakout on 1-hour candles

Same strategy, 4× faster timeframe, 7 markets over up to 2 years. The question is not accuracy — it is whether the per-trade move survives realistic per-market round-trip costs. Faster timeframes shrink the move; costs stay constant.

| Variant | Train (gross) | Validate (gross) | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|---|
| 1h breakout, fixed exits | 1262 · 38% fav · avg +0.03% · PF 1.17 | 535 · 34% fav · avg -0.02% · PF 0.93 | 1262 · 35% fav · avg -0.02% · PF 0.91 | 535 · 32% fav · avg -0.07% · PF 0.75 | ❌ not viable net of costs |
| 1h breakout, trailing exits | 1262 · 39% fav · avg +0.04% · PF 1.18 | 535 · 36% fav · avg -0.00% · PF 0.98 | 1262 · 36% fav · avg -0.00% · PF 0.98 | 535 · 33% fav · avg -0.05% · PF 0.82 | ❌ not viable net of costs |

### Scalp rescue filters (1h breakout + trailing, net of costs)

Each filter attacks the reason scalping failed: too-small moves against fixed costs. A filter only counts if it turns the NET result positive in both periods.

| Filter | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| Session only (07–16 UTC) | 736 · 37% fav · avg +0.01% · PF 1.05 | 325 · 34% fav · avg -0.06% · PF 0.81 | ❌ not viable net of costs |
| High volatility only (ATR% > trailing avg) | 645 · 36% fav · avg +0.01% · PF 1.04 | 269 · 34% fav · avg -0.07% · PF 0.79 | ❌ not viable net of costs |
| 4h-edge markets only (GOLD, NAS100, SPX500) | 408 · 40% fav · avg +0.06% · PF 1.23 | 164 · 39% fav · avg +0.05% · PF 1.14 | ✅ survives costs on 1h |
| All three combined | 127 · 40% fav · avg +0.16% · PF 1.50 | 49 · 45% fav · avg +0.07% · PF 1.21 | ✅ survives costs on 1h |
| Combo at HALF costs (best-case raw spreads) | 127 · 40% fav · avg +0.18% · PF 1.57 | 49 · 47% fav · avg +0.09% · PF 1.27 | ✅ viable IF costs halve |

## Daily-candle breakout (slower, not faster)

Daily candles aggregated from the same history. Fewer, bigger trades — the direction where cost drag shrinks instead of grows.

| Lookback | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| 20 | 257 · 37% fav · avg -0.01% · PF 0.99 | 101 · 43% fav · avg +1.02% · PF 1.75 | ❌ no net edge on daily |
| 55 | 157 · 40% fav · avg +0.12% · PF 1.11 | 60 · 40% fav · avg +1.71% · PF 2.78 | ✅ survives costs on daily |

## Exit grid — 4h breakout (edge markets: GOLD, NAS100, SPX500)

| stop / trail / window | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| **1.5 / 2 / 18 (live)** | 188 · 45% fav · avg +0.20% · PF 1.48 | 59 · 46% fav · avg +0.67% · PF 2.26 | baseline |
| 1.5 / 1.5 / 12 | 188 · 46% fav · avg +0.20% · PF 1.61 | 59 · 49% fav · avg +0.41% · PF 1.93 | · no improvement |
| 1.5 / 1.5 / 18 | 188 · 46% fav · avg +0.20% · PF 1.61 | 59 · 49% fav · avg +0.39% · PF 1.89 | · no improvement |
| 1.5 / 1.5 / 24 | 188 · 46% fav · avg +0.20% · PF 1.59 | 59 · 49% fav · avg +0.38% · PF 1.86 | · no improvement |
| 1.5 / 2 / 12 | 188 · 47% fav · avg +0.23% · PF 1.58 | 59 · 46% fav · avg +0.56% · PF 2.05 | · no improvement |
| 1.5 / 2 / 24 | 188 · 44% fav · avg +0.18% · PF 1.44 | 59 · 46% fav · avg +0.71% · PF 2.35 | · no improvement |
| 1.5 / 3 / 12 | 188 · 43% fav · avg +0.18% · PF 1.40 | 58 · 48% fav · avg +0.52% · PF 1.78 | · no improvement |
| 1.5 / 3 / 18 | 188 · 38% fav · avg +0.10% · PF 1.19 | 58 · 47% fav · avg +0.63% · PF 1.94 | · no improvement |
| 1.5 / 3 / 24 | 188 · 35% fav · avg +0.04% · PF 1.08 | 58 · 45% fav · avg +0.73% · PF 2.09 | · no improvement |
| 2 / 1.5 / 12 | 188 · 46% fav · avg +0.21% · PF 1.61 | 59 · 49% fav · avg +0.41% · PF 1.92 | · no improvement |
| 2 / 1.5 / 18 | 188 · 46% fav · avg +0.21% · PF 1.61 | 59 · 49% fav · avg +0.39% · PF 1.88 | · no improvement |
| 2 / 1.5 / 24 | 188 · 46% fav · avg +0.20% · PF 1.59 | 59 · 49% fav · avg +0.38% · PF 1.85 | · no improvement |
| 2 / 2 / 12 | 188 · 49% fav · avg +0.24% · PF 1.58 | 59 · 46% fav · avg +0.50% · PF 1.85 | · no improvement |
| 2 / 2 / 18 | 188 · 47% fav · avg +0.21% · PF 1.50 | 59 · 46% fav · avg +0.60% · PF 2.02 | · no improvement |
| 2 / 2 / 24 | 188 · 46% fav · avg +0.19% · PF 1.45 | 59 · 46% fav · avg +0.65% · PF 2.09 | · no improvement |
| 2 / 3 / 12 | 188 · 46% fav · avg +0.16% · PF 1.33 | 58 · 50% fav · avg +0.43% · PF 1.54 | · no improvement |
| 2 / 3 / 18 | 188 · 41% fav · avg +0.07% · PF 1.12 | 58 · 48% fav · avg +0.53% · PF 1.64 | · no improvement |
| 2 / 3 / 24 | 188 · 39% fav · avg +0.01% · PF 1.02 | 58 · 47% fav · avg +0.63% · PF 1.77 | · no improvement |

## Side split — 4h breakout (edge markets: GOLD, NAS100, SPX500) (live exits)

| Side | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| long | 148 · 49% fav · avg +0.29% · PF 1.81 | 40 · 55% fav · avg +0.87% · PF 2.91 | ✅ carries its weight |
| short | 40 · 30% fav · avg -0.14% · PF 0.78 | 19 · 26% fav · avg +0.25% · PF 1.36 | ❌ loses net in at least one period |

## Exit grid — daily swing-55 (pooled)

| stop / trail / window | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| **2 / 3 / 24 (live)** | 157 · 41% fav · avg +0.40% · PF 1.29 | 60 · 37% fav · avg +2.21% · PF 2.53 | baseline |
| 1.5 / 1.5 / 12 | 157 · 41% fav · avg -0.00% · PF 0.99 | 61 · 39% fav · avg +1.28% · PF 2.65 | ❌ not net-positive both periods |
| 1.5 / 1.5 / 18 | 157 · 41% fav · avg +0.01% · PF 1.01 | 61 · 39% fav · avg +1.37% · PF 2.76 | · no improvement |
| 1.5 / 1.5 / 24 | 157 · 41% fav · avg +0.02% · PF 1.03 | 61 · 39% fav · avg +1.28% · PF 2.65 | · no improvement |
| 1.5 / 2 / 12 | 157 · 40% fav · avg -0.01% · PF 0.99 | 60 · 40% fav · avg +1.41% · PF 2.44 | ❌ not net-positive both periods |
| 1.5 / 2 / 18 | 157 · 40% fav · avg +0.12% · PF 1.11 | 60 · 40% fav · avg +1.71% · PF 2.78 | · no improvement |
| 1.5 / 2 / 24 | 157 · 39% fav · avg +0.20% · PF 1.19 | 60 · 38% fav · avg +1.52% · PF 2.48 | · no improvement |
| 1.5 / 3 / 12 | 157 · 39% fav · avg -0.03% · PF 0.98 | 60 · 38% fav · avg +1.11% · PF 1.95 | ❌ not net-positive both periods |
| 1.5 / 3 / 18 | 157 · 36% fav · avg +0.09% · PF 1.07 | 60 · 35% fav · avg +1.43% · PF 2.20 | · no improvement |
| 1.5 / 3 / 24 | 157 · 34% fav · avg +0.18% · PF 1.14 | 60 · 33% fav · avg +1.14% · PF 1.86 | · no improvement |
| 2 / 1.5 / 12 | 157 · 41% fav · avg -0.03% · PF 0.97 | 61 · 39% fav · avg +1.28% · PF 2.65 | ❌ not net-positive both periods |
| 2 / 1.5 / 18 | 157 · 41% fav · avg -0.01% · PF 0.99 | 61 · 39% fav · avg +1.37% · PF 2.76 | ❌ not net-positive both periods |
| 2 / 1.5 / 24 | 157 · 41% fav · avg +0.00% · PF 1.00 | 61 · 39% fav · avg +1.28% · PF 2.65 | · no improvement |
| 2 / 2 / 12 | 157 · 41% fav · avg -0.08% · PF 0.93 | 60 · 42% fav · avg +1.38% · PF 2.34 | ❌ not net-positive both periods |
| 2 / 2 / 18 | 157 · 41% fav · avg +0.05% · PF 1.04 | 60 · 40% fav · avg +1.63% · PF 2.57 | · no improvement |
| 2 / 2 / 24 | 157 · 41% fav · avg +0.13% · PF 1.12 | 60 · 38% fav · avg +1.44% · PF 2.31 | · no improvement |
| 2 / 3 / 12 | 157 · 44% fav · avg -0.03% · PF 0.98 | 60 · 42% fav · avg +1.41% · PF 2.16 | ❌ not net-positive both periods |
| 2 / 3 / 18 | 157 · 43% fav · avg +0.17% · PF 1.12 | 60 · 38% fav · avg +2.54% · PF 3.00 | · no improvement |

## Side split — daily swing-55 (pooled) (live exits)

| Side | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| long | 126 · 44% fav · avg +0.77% · PF 1.66 | 38 · 45% fav · avg +3.95% · PF 4.69 | ✅ carries its weight |
| short | 31 · 32% fav · avg -1.10% · PF 0.48 | 22 · 23% fav · avg -0.78% · PF 0.63 | ❌ loses net in at least one period |

## Pyramiding the daily swing-55 (add to winners?)

Pre-registered refinement of the validated swing stream: add-on units fill at the close that first reaches the trigger, share the trail, and exit together. Returns are net % on total deployed notional under one simulator (the baseline row is re-simulated the same way, so rows are directly comparable). Adoption rule: a variant becomes an execution rule ONLY if it beats the no-adds baseline in BOTH periods with ≥30 validate trades. Honest caveat: adds raise open risk precisely when a trade is winning — the % edge must beat the baseline to justify that.

| Variant | Side | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|
| no adds (live baseline, re-simulated) | both | 157 · 45% fav · avg +0.70% · PF 1.44 | 63 · 35% fav · avg +0.91% · PF 1.51 | baseline |
| add ½ unit at +1×ATR | both | 157 · 43% fav · avg +0.19% · PF 1.11 | 63 · 33% fav · avg +0.27% · PF 1.13 | ❌ no improvement |
| add 1 unit at +1×ATR | both | 157 · 42% fav · avg -0.06% · PF 0.97 | 63 · 33% fav · avg -0.04% · PF 0.98 | ❌ no improvement |
| add ½ + ½ at +1 and +2×ATR | both | 157 · 41% fav · avg -0.20% · PF 0.90 | 63 · 33% fav · avg -0.13% · PF 0.94 | ❌ no improvement |
| no adds (live baseline, re-simulated) | ▲ longs | 126 · 51% fav · avg +1.49% · PF 2.19 | 40 · 43% fav · avg +1.92% · PF 2.56 | baseline |
| add ½ unit at +1×ATR | ▲ longs | 126 · 48% fav · avg +1.00% · PF 1.74 | 40 · 40% fav · avg +1.26% · PF 1.91 | ❌ no improvement |
| add 1 unit at +1×ATR | ▲ longs | 126 · 48% fav · avg +0.76% · PF 1.54 | 40 · 40% fav · avg +0.94% · PF 1.63 | ❌ no improvement |
| add ½ + ½ at +1 and +2×ATR | ▲ longs | 126 · 47% fav · avg +0.64% · PF 1.45 | 40 · 40% fav · avg +0.87% · PF 1.59 | ❌ no improvement |

## Trend-quality gate on the daily swing-55 (regime filter?)

Pre-registered refinement: entries only when the signal candle sits in a trend regime (EMA200 side and/or an ADX floor), scored under the live swing exit and net of modeled cost. Adoption rule: a gate becomes an execution rule ONLY if it beats the no-gate baseline in BOTH periods with ≥30 validate trades. Honest caveat: a filter only removes trades — a better average on far fewer trades can still earn less in total, so weigh n as well as avg.

| Gate | Side | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|
| no gate (live baseline, re-simulated) | both | 157 · 45% fav · avg +0.70% · PF 1.44 | 63 · 35% fav · avg +0.91% · PF 1.51 | baseline |
| EMA200-aligned (with-trend only) | both | 106 · 42% fav · avg +0.52% · PF 1.35 | 55 · 36% fav · avg +1.15% · PF 1.70 | ❌ no improvement |
| ADX ≥ 20 (trend regime) | both | 109 · 41% fav · avg +0.05% · PF 1.02 | 47 · 32% fav · avg +1.16% · PF 1.56 | ❌ no improvement |
| ADX ≥ 25 (strong trend) | both | 78 · 41% fav · avg +0.10% · PF 1.05 | 30 · 33% fav · avg +1.02% · PF 1.48 | ❌ no improvement |
| EMA200-aligned AND ADX ≥ 20 | both | 72 · 38% fav · avg -0.28% · PF 0.84 | 41 · 34% fav · avg +1.73% · PF 1.94 | ❌ no improvement |
| no gate (live baseline, re-simulated) | ▲ longs | 126 · 51% fav · avg +1.49% · PF 2.19 | 40 · 43% fav · avg +1.92% · PF 2.56 | baseline |
| EMA200-aligned (with-trend only) | ▲ longs | 87 · 45% fav · avg +1.00% · PF 1.75 | 36 · 42% fav · avg +2.01% · PF 2.97 | ❌ no improvement |
| ADX ≥ 20 (trend regime) | ▲ longs | 87 · 44% fav · avg +0.74% · PF 1.48 | 27 · 37% fav · avg +2.59% · PF 2.89 | ⚠️ too few trades |
| ADX ≥ 25 (strong trend) | ▲ longs | 59 · 44% fav · avg +0.87% · PF 1.58 | 17 · 41% fav · avg +3.33% · PF 3.21 | ⚠️ too few trades |
| EMA200-aligned AND ADX ≥ 20 | ▲ longs | 58 · 36% fav · avg -0.01% · PF 0.99 | 24 · 38% fav · avg +3.21% · PF 4.13 | ⚠️ too few trades |

## WTI deep-dive

4575 4h candles (2023-10-01 → 2026-09-25), 928 daily. Three-way split (tune / select / confirm); a candidate must be net-positive in ALL segments with ≥15 confirm trades. 14 variants tested — with this many looks at one market, treat even a triple pass as a paper candidate, not a funded stream.

| Variant | Tune (net) | Select (net) | Confirm (net) | Verdict |
|---|---|---|---|---|
| 4h breakout-20 | 117 · 31% fav · avg -0.22% · PF 0.74 | 57 · 32% fav · avg -0.21% · PF 0.78 | 52 · 38% fav · avg +1.05% · PF 1.79 | ❌ fails at least one segment |
| 4h breakout-20 longs | 63 · 27% fav · avg -0.32% · PF 0.62 | 30 · 30% fav · avg -0.26% · PF 0.75 | 34 · 41% fav · avg +1.60% · PF 2.35 | ❌ fails at least one segment |
| 4h breakout-55 | 71 · 24% fav · avg -0.54% · PF 0.46 | 27 · 26% fav · avg -0.29% · PF 0.68 | 33 · 39% fav · avg +1.68% · PF 2.36 | ❌ fails at least one segment |
| 4h breakout-55 longs | 35 · 23% fav · avg -0.45% · PF 0.50 | 12 · 17% fav · avg +0.09% · PF 1.13 | 23 · 39% fav · avg +2.24% · PF 3.32 | ❌ fails at least one segment |
| 4h breakout-55 shorts | 36 · 25% fav · avg -0.64% · PF 0.42 | 15 · 33% fav · avg -0.60% · PF 0.44 | 10 · 40% fav · avg +0.38% · PF 1.20 | ❌ fails at least one segment |
| 4h breakout-100 | 46 · 26% fav · avg -0.53% · PF 0.44 | 15 · 40% fav · avg +0.44% · PF 1.69 | 23 · 39% fav · avg +2.35% · PF 3.32 | ❌ fails at least one segment |
| 4h breakout-100 longs | 21 · 24% fav · avg -0.28% · PF 0.61 | 6 · 33% fav · avg +0.95% · PF 2.41 | 18 · 33% fav · avg +2.61% · PF 3.87 | ❌ fails at least one segment |
| 4h breakout-55 NY session (12-20 UTC) | 8 · 13% fav · avg -1.26% · PF 0.02 | 7 · 57% fav · avg +1.75% · PF 6.74 | 7 · 57% fav · avg +1.40% · PF 2.77 | ❌ fails at least one segment |
| 4h filtered cross | 11 · 18% fav · avg -0.38% · PF 0.51 | 3 · 100% fav · avg +0.91% · PF ∞ | 4 · 50% fav · avg -0.32% · PF 0.67 | ❌ fails at least one segment |
| daily breakout-20 | 20 · 35% fav · avg -0.91% · PF 0.50 | 10 · 20% fav · avg -0.57% · PF 0.76 | 10 · 60% fav · avg +4.55% · PF 2.25 | ❌ fails at least one segment |
| daily breakout-20 longs | 11 · 27% fav · avg -0.68% · PF 0.58 | 4 · 25% fav · avg +1.14% · PF 1.45 | 7 · 71% fav · avg +7.02% · PF 4.55 | ❌ fails at least one segment |
| daily breakout-55 (swing exits) | 9 · 44% fav · avg -0.04% · PF 0.98 | 4 · 50% fav · avg +0.19% · PF 1.13 | 6 · 50% fav · avg +15.72% · PF 6.07 | ❌ fails at least one segment |
| daily breakout-55 longs (swing exits) | 5 · 80% fav · avg +3.18% · PF 14.91 | 1 · 100% fav · avg +5.99% · PF ∞ | 4 · 75% fav · avg +27.85% · PF 75.84 | ❌ fails at least one segment |
| daily breakout-100 | 5 · 40% fav · avg -1.01% · PF 0.16 | 4 · 25% fav · avg -1.90% · PF 0.29 | 4 · 25% fav · avg +7.15% · PF 3.13 | ❌ fails at least one segment |

## WTI intraday scalp + EIA conditioning

Insufficient 1h history (0 candles) — skipped. When the count is 0 this is usually a data-plan limit, not a market gap: FMP answers 1-hour CLUSD requests with HTTP 402/403 on plans without intraday commodity history (the job log shows the per-chunk errors). The study runs automatically on the next research pass once 1h WTI data is available.

## AI meta-label experiment

A logistic model trained on the 324 train-period baseline signals (features: side, RSI, ADX, volume ratio, trend distance, ATR%) predicts the probability a signal ends favorable. Judged on the 179 untouched validate-period signals.

| Threshold | Train (kept signals) | Validate (kept signals) |
|---|---|---|
| p ≥ 0.5 | 43 · 44% fav · avg +0.16% · PF 1.31 | 32 · 38% fav · avg -0.47% · PF 0.58 |
| p ≥ 0.55 | 18 · 33% fav · avg -0.37% · PF 0.46 | 22 · 32% fav · avg -0.62% · PF 0.49 |
| p ≥ 0.6 | 4 · 50% fav · avg -0.45% · PF 0.37 | 17 · 24% fav · avg -0.97% · PF 0.25 |
| p ≥ 0.65 | 1 · 0% fav · avg +0.00% · PF ∞ | 12 · 25% fav · avg -0.75% · PF 0.33 |

**Verdict: ❌ does not pass out-of-sample** — the model is NOT published or used. Train-period fit did not survive on unseen data.

## Overall (all markets pooled)

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 67 · 33% fav · avg -0.06% · PF 0.86 | 21 · 52% fav · avg -0.19% · PF 0.71 |
| Unfiltered baseline | 324 · 39% fav · avg +0.07% · PF 1.19 | 179 · 37% fav · avg -0.12% · PF 0.78 |
| Filtered + trailing exit | 67 · 34% fav · avg +0.09% · PF 1.15 | 21 · 33% fav · avg -0.16% · PF 0.82 |

### Verdicts (by average move per signal)

- **Filters vs baseline**: train worse, validate worse → ❌ does NOT hold up out-of-sample
- **Trailing exit vs fixed exit**: train better, validate better → ✅ holds up out-of-sample

_Educational research, not financial advice. Past performance does not predict future results._
