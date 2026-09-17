# LordBastian Signal Generator — walk-forward research

Generated 2026-09-17T08:18:38.345Z · 3y of 4h candles via FMP · train = first 70% of each market's history, validate = last 30% (out-of-sample).

A variant only counts as an improvement if it beats its comparator in **both** periods — train-only wins are fitted noise.

Enrichment coverage: funding 4/4 · fng 3147 · econ 840 · usd ok · btc ok

## BTC / USD

6635 candles, 2023-09-08 → 2026-09-17, split at 2025-10-20

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 12 · 25% fav · avg -0.49% · PF 0.53 | 4 · 0% fav · avg -0.70% · PF 0.00 |
| Unfiltered baseline | 73 · 37% fav · avg -0.18% · PF 0.81 | 40 · 30% fav · avg -0.16% · PF 0.75 |
| Filtered + trailing exit | 12 · 42% fav · avg +0.14% · PF 1.12 | 4 · 0% fav · avg -0.90% · PF 0.00 |

## XAU / USD · Gold

4647 candles, 2023-09-08 → 2026-09-17, split at 2025-10-22

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 19 · 26% fav · avg +0.08% · PF 1.39 | 5 · 40% fav · avg -0.83% · PF 0.40 |
| Unfiltered baseline | 61 · 39% fav · avg +0.13% · PF 1.54 | 27 · 33% fav · avg -0.35% · PF 0.56 |
| Filtered + trailing exit | 19 · 32% fav · avg +0.06% · PF 1.16 | 5 · 20% fav · avg -1.43% · PF 0.04 |

## US30 · Dow (DIA proxy)

1509 candles, 2023-09-08 → 2026-09-16, split at 2025-10-20

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 3 · 67% fav · avg +0.17% · PF 1.38 | 0 signals |
| Unfiltered baseline | 8 · 63% fav · avg +0.23% · PF 1.77 | 5 · 60% fav · avg +0.42% · PF 2.72 |
| Filtered + trailing exit | 3 · 67% fav · avg +0.63% · PF 2.13 | 0 signals |

## NAS100 · Nasdaq (QQQ proxy)

1509 candles, 2023-09-08 → 2026-09-16, split at 2025-10-20

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 1 · 100% fav · avg +0.88% · PF ∞ | 1 · 100% fav · avg +0.58% · PF ∞ |
| Unfiltered baseline | 10 · 70% fav · avg +1.05% · PF 44.12 | 10 · 60% fav · avg +0.37% · PF 1.76 |
| Filtered + trailing exit | 1 · 100% fav · avg +3.55% · PF ∞ | 1 · 0% fav · avg -0.68% · PF 0.00 |

## SPX500 · S&P (SPY proxy)

1509 candles, 2023-09-08 → 2026-09-16, split at 2025-10-20

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 1 · 0% fav · avg -1.22% · PF 0.00 | 3 · 100% fav · avg +1.18% · PF ∞ |
| Unfiltered baseline | 8 · 50% fav · avg +0.18% · PF 1.50 | 10 · 60% fav · avg +0.35% · PF 2.35 |
| Filtered + trailing exit | 1 · 0% fav · avg -1.02% · PF 0.00 | 3 · 100% fav · avg +2.54% · PF ∞ |

## GBP / USD · Cable

4722 candles, 2023-09-08 → 2026-09-17, split at 2025-10-21

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 10 · 50% fav · avg +0.14% · PF 3.07 | 1 · 100% fav · avg +0.09% · PF ∞ |
| Unfiltered baseline | 56 · 32% fav · avg -0.01% · PF 0.93 | 26 · 31% fav · avg -0.08% · PF 0.55 |
| Filtered + trailing exit | 10 · 20% fav · avg -0.13% · PF 0.17 | 1 · 100% fav · avg +0.12% · PF ∞ |

## EUR / USD

4719 candles, 2023-09-08 → 2026-09-17, split at 2025-10-21

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 8 · 25% fav · avg -0.05% · PF 0.67 | 2 · 50% fav · avg -0.15% · PF 0.02 |
| Unfiltered baseline | 43 · 37% fav · avg +0.03% · PF 1.27 | 33 · 36% fav · avg +0.01% · PF 1.08 |
| Filtered + trailing exit | 8 · 38% fav · avg +0.14% · PF 1.69 | 2 · 0% fav · avg -0.28% · PF 0.00 |

## WTI Crude Oil

4536 candles, 2023-10-01 → 2026-09-17, split at 2025-10-30

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 13 · 31% fav · avg -0.07% · PF 0.88 | 5 · 60% fav · avg -0.19% · PF 0.76 |
| Unfiltered baseline | 65 · 38% fav · avg +0.23% · PF 1.59 | 28 · 39% fav · avg -0.46% · PF 0.56 |
| Filtered + trailing exit | 13 · 31% fav · avg -0.09% · PF 0.88 | 5 · 40% fav · avg +0.17% · PF 1.14 |

## Alternative entry families (pooled)

| Strategy | Train | Validate | Verdict |
|---|---|---|---|
| Donchian-55 breakout, fixed exits | 610 · 40% fav · avg +0.05% · PF 1.11 | 225 · 39% fav · avg +0.13% · PF 1.26 | ✅ positive in BOTH periods |
| Donchian-55 breakout, trailing exits | 610 · 36% fav · avg +0.01% · PF 1.02 | 224 · 37% fav · avg +0.43% · PF 1.71 | ✅ positive in BOTH periods |
| Funding-extreme mean reversion, fixed | 0 signals | 11 · 36% fav · avg -0.29% · PF 0.61 | ❌ no out-of-sample edge |
| Funding-extreme mean reversion, trailing | 0 signals | 11 · 36% fav · avg -0.46% · PF 0.50 | ❌ no out-of-sample edge |
| **Breakout trailing, NET of per-market costs** | 610 · 35% fav · avg -0.04% · PF 0.93 | 224 · 36% fav · avg +0.38% · PF 1.59 | ❌ costs eat the edge |

## Breakout + trailing, per market (net of that market's cost)

| Market | Cost | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|
| BTC / USD | 0.10% | 115 · 30% fav · avg -0.17% · PF 0.85 | 47 · 28% fav · avg -0.03% · PF 0.97 | ❌ no net edge |
| XAU / USD · Gold | 0.05% | 108 · 44% fav · avg +0.13% · PF 1.35 | 33 · 55% fav · avg +0.83% · PF 2.83 | ✅ net edge |
| US30 · Dow (DIA proxy) | 0.02% | 35 · 37% fav · avg +0.27% · PF 1.54 | 15 · 13% fav · avg -0.58% · PF 0.24 | ❌ no net edge |
| NAS100 · Nasdaq (QQQ proxy) | 0.02% | 37 · 46% fav · avg +0.31% · PF 1.59 | 13 · 46% fav · avg +1.03% · PF 2.90 | ✅ net edge |
| SPX500 · S&P (SPY proxy) | 0.02% | 42 · 45% fav · avg +0.33% · PF 1.88 | 14 · 36% fav · avg +0.09% · PF 1.17 | ✅ net edge |
| GBP / USD · Cable | 0.03% | 91 · 33% fav · avg -0.07% · PF 0.70 | 34 · 29% fav · avg -0.03% · PF 0.85 | ❌ no net edge |
| EUR / USD | 0.03% | 89 · 30% fav · avg -0.04% · PF 0.81 | 31 · 39% fav · avg +0.00% · PF 1.03 | ❌ no net edge |
| WTI Crude Oil | 0.05% | 93 · 25% fav · avg -0.45% · PF 0.53 | 37 · 38% fav · avg +1.46% · PF 2.24 | ❌ no net edge |

Per-market edge status published to edge-status.json — alerts for ❌ markets carry an informational-only warning.

## Donchian lookback grid (breakout + trailing, net of costs)

| Lookback | All markets: train | validate | Non-crypto only: train | validate |
|---|---|---|---|---|
| 20 | 985 · 38% fav · avg +0.04% · PF 1.07 | 400 · 36% fav · avg +0.09% · PF 1.14 | 796 · 38% fav · avg +0.04% · PF 1.10 | 311 · 39% fav · avg +0.24% · PF 1.45 |
| 55 | 610 · 35% fav · avg -0.04% · PF 0.93 | 224 · 36% fav · avg +0.38% · PF 1.59 | 495 · 36% fav · avg -0.01% · PF 0.99 | 177 · 38% fav · avg +0.49% · PF 1.91 |
| 100 | 444 · 36% fav · avg +0.00% · PF 1.00 | 172 · 40% fav · avg +0.52% · PF 1.91 | 358 · 36% fav · avg +0.01% · PF 1.03 | 137 · 42% fav · avg +0.59% · PF 2.27 |

## Candidate markets (4h breakout + trailing, net of own cost)

New markets audition with the exact live rule set — a candidate is added to the app only if net-positive in both periods.

| Candidate | Cost | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|
| XAG / USD · Silver | 0.05% | 95 · 34% fav · avg -0.05% · PF 0.94 | 43 · 40% fav · avg -0.08% · PF 0.95 | ❌ no net edge |
| USD / JPY | 0.03% | 93 · 42% fav · avg +0.06% · PF 1.27 | 38 · 32% fav · avg -0.03% · PF 0.81 | ❌ no net edge |
| AUD / USD | 0.03% | 88 · 24% fav · avg -0.18% · PF 0.49 | 40 · 33% fav · avg -0.01% · PF 0.95 | ❌ no net edge |
| USD / CAD | 0.03% | 86 · 29% fav · avg -0.01% · PF 0.96 | 44 · 48% fav · avg +0.04% · PF 1.50 | ❌ no net edge |
| EUR / GBP | 0.03% | 69 · 32% fav · avg -0.06% · PF 0.76 | 37 · 24% fav · avg -0.09% · PF 0.38 | ❌ no net edge |
| Natural Gas | 0.08% | 102 · 38% fav · avg +0.31% · PF 1.21 | 38 · 26% fav · avg -0.50% · PF 0.75 | ❌ no net edge |

## Scalp feasibility: Donchian breakout on 1-hour candles

Same strategy, 4× faster timeframe, 7 markets over up to 2 years. The question is not accuracy — it is whether the per-trade move survives realistic per-market round-trip costs. Faster timeframes shrink the move; costs stay constant.

| Variant | Train (gross) | Validate (gross) | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|---|
| 1h breakout, fixed exits | 1272 · 38% fav · avg +0.02% · PF 1.13 | 529 · 34% fav · avg +0.00% · PF 1.00 | 1272 · 35% fav · avg -0.03% · PF 0.88 | 529 · 32% fav · avg -0.05% · PF 0.80 | ❌ not viable net of costs |
| 1h breakout, trailing exits | 1272 · 39% fav · avg +0.04% · PF 1.15 | 529 · 36% fav · avg +0.00% · PF 1.00 | 1272 · 35% fav · avg -0.01% · PF 0.96 | 529 · 33% fav · avg -0.05% · PF 0.83 | ❌ not viable net of costs |

### Scalp rescue filters (1h breakout + trailing, net of costs)

Each filter attacks the reason scalping failed: too-small moves against fixed costs. A filter only counts if it turns the NET result positive in both periods.

| Filter | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| Session only (07–16 UTC) | 743 · 36% fav · avg +0.01% · PF 1.03 | 318 · 34% fav · avg -0.05% · PF 0.83 | ❌ not viable net of costs |
| High volatility only (ATR% > trailing avg) | 649 · 36% fav · avg +0.00% · PF 1.00 | 261 · 35% fav · avg -0.03% · PF 0.91 | ❌ not viable net of costs |
| 4h-edge markets only (GOLD, NAS100, SPX500) | 411 · 39% fav · avg +0.06% · PF 1.22 | 158 · 39% fav · avg +0.04% · PF 1.13 | ✅ survives costs on 1h |
| All three combined | 130 · 39% fav · avg +0.14% · PF 1.42 | 45 · 47% fav · avg +0.12% · PF 1.38 | ✅ survives costs on 1h |
| Combo at HALF costs (best-case raw spreads) | 130 · 39% fav · avg +0.16% · PF 1.49 | 45 · 49% fav · avg +0.13% · PF 1.45 | ✅ viable IF costs halve |

## Daily-candle breakout (slower, not faster)

Daily candles aggregated from the same history. Fewer, bigger trades — the direction where cost drag shrinks instead of grows.

| Lookback | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| 20 | 257 · 36% fav · avg -0.04% · PF 0.97 | 100 · 42% fav · avg +0.97% · PF 1.73 | ❌ no net edge on daily |
| 55 | 156 · 40% fav · avg +0.14% · PF 1.13 | 63 · 40% fav · avg +1.63% · PF 2.75 | ✅ survives costs on daily |

## Exit grid — 4h breakout (edge markets: GOLD, NAS100, SPX500)

| stop / trail / window | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| **1.5 / 2 / 18 (live)** | 187 · 45% fav · avg +0.21% · PF 1.52 | 60 · 48% fav · avg +0.70% · PF 2.41 | baseline |
| 1.5 / 1.5 / 12 | 187 · 46% fav · avg +0.21% · PF 1.66 | 60 · 53% fav · avg +0.47% · PF 2.12 | · no improvement |
| 1.5 / 1.5 / 18 | 187 · 46% fav · avg +0.21% · PF 1.66 | 60 · 53% fav · avg +0.45% · PF 2.08 | · no improvement |
| 1.5 / 1.5 / 24 | 187 · 46% fav · avg +0.21% · PF 1.63 | 60 · 53% fav · avg +0.44% · PF 2.04 | · no improvement |
| 1.5 / 2 / 12 | 187 · 47% fav · avg +0.24% · PF 1.62 | 60 · 48% fav · avg +0.61% · PF 2.23 | · no improvement |
| 1.5 / 2 / 24 | 187 · 44% fav · avg +0.19% · PF 1.48 | 60 · 48% fav · avg +0.75% · PF 2.50 | · no improvement |
| 1.5 / 3 / 12 | 187 · 42% fav · avg +0.18% · PF 1.38 | 60 · 50% fav · avg +0.57% · PF 1.90 | · no improvement |
| 1.5 / 3 / 18 | 187 · 38% fav · avg +0.11% · PF 1.21 | 60 · 47% fav · avg +0.61% · PF 1.94 | · no improvement |
| 1.5 / 3 / 24 | 187 · 35% fav · avg +0.06% · PF 1.11 | 60 · 45% fav · avg +0.70% · PF 2.04 | · no improvement |
| 2 / 1.5 / 12 | 187 · 46% fav · avg +0.21% · PF 1.66 | 60 · 53% fav · avg +0.47% · PF 2.13 | · no improvement |
| 2 / 1.5 / 18 | 187 · 46% fav · avg +0.21% · PF 1.66 | 60 · 53% fav · avg +0.45% · PF 2.09 | · no improvement |
| 2 / 1.5 / 24 | 187 · 46% fav · avg +0.21% · PF 1.64 | 60 · 53% fav · avg +0.44% · PF 2.05 | · no improvement |
| 2 / 2 / 12 | 187 · 49% fav · avg +0.25% · PF 1.63 | 60 · 48% fav · avg +0.56% · PF 2.02 | · no improvement |
| 2 / 2 / 18 | 187 · 47% fav · avg +0.23% · PF 1.56 | 60 · 48% fav · avg +0.64% · PF 2.15 | · no improvement |
| 2 / 2 / 24 | 187 · 46% fav · avg +0.21% · PF 1.51 | 60 · 48% fav · avg +0.69% · PF 2.23 | · no improvement |
| 2 / 3 / 12 | 187 · 46% fav · avg +0.16% · PF 1.33 | 60 · 52% fav · avg +0.48% · PF 1.65 | · no improvement |
| 2 / 3 / 18 | 187 · 41% fav · avg +0.08% · PF 1.14 | 60 · 48% fav · avg +0.52% · PF 1.66 | · no improvement |
| 2 / 3 / 24 | 187 · 39% fav · avg +0.03% · PF 1.05 | 60 · 47% fav · avg +0.60% · PF 1.75 | · no improvement |

## Side split — 4h breakout (edge markets: GOLD, NAS100, SPX500) (live exits)

| Side | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| long | 146 · 48% fav · avg +0.28% · PF 1.79 | 41 · 59% fav · avg +0.90% · PF 3.08 | ✅ carries its weight |
| short | 41 · 34% fav · avg -0.05% · PF 0.90 | 19 · 26% fav · avg +0.29% · PF 1.45 | ❌ loses net in at least one period |

## Exit grid — daily swing-55 (pooled)

| stop / trail / window | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| **2 / 3 / 24 (live)** | 156 · 42% fav · avg +0.47% · PF 1.35 | 62 · 34% fav · avg +2.03% · PF 2.39 | baseline |
| 1.5 / 1.5 / 12 | 156 · 39% fav · avg -0.01% · PF 0.99 | 63 · 43% fav · avg +1.31% · PF 2.83 | ❌ not net-positive both periods |
| 1.5 / 1.5 / 18 | 156 · 39% fav · avg +0.00% · PF 1.00 | 63 · 43% fav · avg +1.40% · PF 2.96 | · no improvement |
| 1.5 / 1.5 / 24 | 156 · 39% fav · avg +0.01% · PF 1.02 | 63 · 43% fav · avg +1.31% · PF 2.83 | · no improvement |
| 1.5 / 2 / 12 | 156 · 41% fav · avg -0.01% · PF 0.99 | 63 · 40% fav · avg +1.34% · PF 2.42 | ❌ not net-positive both periods |
| 1.5 / 2 / 18 | 156 · 40% fav · avg +0.14% · PF 1.13 | 63 · 40% fav · avg +1.63% · PF 2.75 | · no improvement |
| 1.5 / 2 / 24 | 156 · 40% fav · avg +0.20% · PF 1.19 | 63 · 38% fav · avg +1.44% · PF 2.46 | · no improvement |
| 1.5 / 3 / 12 | 156 · 40% fav · avg -0.02% · PF 0.98 | 62 · 35% fav · avg +0.96% · PF 1.80 | ❌ not net-positive both periods |
| 1.5 / 3 / 18 | 156 · 36% fav · avg +0.10% · PF 1.08 | 62 · 32% fav · avg +1.26% · PF 2.05 | · no improvement |
| 1.5 / 3 / 24 | 156 · 34% fav · avg +0.18% · PF 1.14 | 62 · 31% fav · avg +0.98% · PF 1.73 | · no improvement |
| 2 / 1.5 / 12 | 156 · 39% fav · avg -0.03% · PF 0.97 | 63 · 43% fav · avg +1.31% · PF 2.84 | ❌ not net-positive both periods |
| 2 / 1.5 / 18 | 156 · 39% fav · avg -0.02% · PF 0.98 | 63 · 43% fav · avg +1.40% · PF 2.96 | ❌ not net-positive both periods |
| 2 / 1.5 / 24 | 156 · 39% fav · avg -0.00% · PF 1.00 | 63 · 43% fav · avg +1.31% · PF 2.84 | ❌ not net-positive both periods |
| 2 / 2 / 12 | 156 · 42% fav · avg -0.08% · PF 0.93 | 63 · 41% fav · avg +1.31% · PF 2.33 | ❌ not net-positive both periods |
| 2 / 2 / 18 | 156 · 42% fav · avg +0.07% · PF 1.06 | 63 · 40% fav · avg +1.55% · PF 2.55 | · no improvement |
| 2 / 2 / 24 | 156 · 41% fav · avg +0.14% · PF 1.12 | 63 · 38% fav · avg +1.37% · PF 2.29 | · no improvement |
| 2 / 3 / 12 | 156 · 47% fav · avg +0.03% · PF 1.02 | 62 · 39% fav · avg +1.25% · PF 2.01 | · no improvement |
| 2 / 3 / 18 | 156 · 43% fav · avg +0.21% · PF 1.15 | 62 · 35% fav · avg +2.34% · PF 2.82 | · no improvement |

## Side split — daily swing-55 (pooled) (live exits)

| Side | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| long | 125 · 45% fav · avg +0.86% · PF 1.75 | 40 · 40% fav · avg +3.57% · PF 4.23 | ✅ carries its weight |
| short | 31 · 32% fav · avg -1.10% · PF 0.48 | 22 · 23% fav · avg -0.78% · PF 0.63 | ❌ loses net in at least one period |

## Pyramiding the daily swing-55 (add to winners?)

Pre-registered refinement of the validated swing stream: add-on units fill at the close that first reaches the trigger, share the trail, and exit together. Returns are net % on total deployed notional under one simulator (the baseline row is re-simulated the same way, so rows are directly comparable). Adoption rule: a variant becomes an execution rule ONLY if it beats the no-adds baseline in BOTH periods with ≥30 validate trades. Honest caveat: adds raise open risk precisely when a trade is winning — the % edge must beat the baseline to justify that.

| Variant | Side | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|
| no adds (live baseline, re-simulated) | both | 156 · 47% fav · avg +0.81% · PF 1.51 | 63 · 35% fav · avg +0.99% · PF 1.54 | baseline |
| add ½ unit at +1×ATR | both | 156 · 45% fav · avg +0.30% · PF 1.17 | 63 · 33% fav · avg +0.33% · PF 1.16 | ❌ no improvement |
| add 1 unit at +1×ATR | both | 156 · 44% fav · avg +0.04% · PF 1.02 | 63 · 33% fav · avg -0.00% · PF 1.00 | ❌ no improvement |
| add ½ + ½ at +1 and +2×ATR | both | 156 · 42% fav · avg -0.10% · PF 0.95 | 63 · 33% fav · avg -0.09% · PF 0.96 | ❌ no improvement |
| no adds (live baseline, re-simulated) | ▲ longs | 125 · 53% fav · avg +1.63% · PF 2.33 | 41 · 41% fav · avg +1.99% · PF 2.58 | baseline |
| add ½ unit at +1×ATR | ▲ longs | 125 · 50% fav · avg +1.14% · PF 1.86 | 41 · 39% fav · avg +1.31% · PF 1.95 | ❌ no improvement |
| add 1 unit at +1×ATR | ▲ longs | 125 · 50% fav · avg +0.89% · PF 1.65 | 41 · 39% fav · avg +0.97% · PF 1.67 | ❌ no improvement |
| add ½ + ½ at +1 and +2×ATR | ▲ longs | 125 · 49% fav · avg +0.77% · PF 1.56 | 41 · 39% fav · avg +0.90% · PF 1.62 | ❌ no improvement |

## WTI deep-dive

4536 4h candles (2023-10-01 → 2026-09-17), 921 daily. Three-way split (tune / select / confirm); a candidate must be net-positive in ALL segments with ≥15 confirm trades. 14 variants tested — with this many looks at one market, treat even a triple pass as a paper candidate, not a funded stream.

| Variant | Tune (net) | Select (net) | Confirm (net) | Verdict |
|---|---|---|---|---|
| 4h breakout-20 | 116 · 30% fav · avg -0.29% · PF 0.67 | 57 · 33% fav · avg -0.06% · PF 0.94 | 50 · 36% fav · avg +0.90% · PF 1.66 | ❌ fails at least one segment |
| 4h breakout-20 longs | 63 · 27% fav · avg -0.32% · PF 0.62 | 30 · 30% fav · avg -0.26% · PF 0.75 | 33 · 42% fav · avg +1.74% · PF 2.53 | ❌ fails at least one segment |
| 4h breakout-55 | 70 · 23% fav · avg -0.65% · PF 0.35 | 28 · 29% fav · avg -0.02% · PF 0.97 | 32 · 41% fav · avg +1.81% · PF 2.52 | ❌ fails at least one segment |
| 4h breakout-55 longs | 35 · 23% fav · avg -0.45% · PF 0.50 | 12 · 17% fav · avg +0.09% · PF 1.13 | 23 · 39% fav · avg +2.24% · PF 3.32 | ❌ fails at least one segment |
| 4h breakout-55 shorts | 35 · 23% fav · avg -0.86% · PF 0.24 | 16 · 38% fav · avg -0.11% · PF 0.89 | 9 · 44% fav · avg +0.72% · PF 1.41 | ❌ fails at least one segment |
| 4h breakout-100 | 46 · 26% fav · avg -0.53% · PF 0.44 | 15 · 40% fav · avg +0.44% · PF 1.69 | 23 · 39% fav · avg +2.35% · PF 3.32 | ❌ fails at least one segment |
| 4h breakout-100 longs | 21 · 24% fav · avg -0.28% · PF 0.61 | 6 · 33% fav · avg +0.95% · PF 2.41 | 18 · 33% fav · avg +2.61% · PF 3.87 | ❌ fails at least one segment |
| 4h breakout-55 NY session (12-20 UTC) | 8 · 13% fav · avg -1.26% · PF 0.02 | 7 · 57% fav · avg +1.75% · PF 6.74 | 7 · 57% fav · avg +1.40% · PF 2.77 | ❌ fails at least one segment |
| 4h filtered cross | 11 · 18% fav · avg -0.38% · PF 0.51 | 3 · 100% fav · avg +0.91% · PF ∞ | 4 · 50% fav · avg -0.32% · PF 0.67 | ❌ fails at least one segment |
| daily breakout-20 | 19 · 37% fav · avg -0.80% · PF 0.55 | 11 · 18% fav · avg -0.79% · PF 0.67 | 9 · 56% fav · avg +3.89% · PF 1.96 | ❌ fails at least one segment |
| daily breakout-20 longs | 10 · 30% fav · avg -0.45% · PF 0.69 | 5 · 20% fav · avg +0.31% · PF 1.12 | 6 · 67% fav · avg +6.43% · PF 3.79 | ❌ fails at least one segment |
| daily breakout-55 (swing exits) | 9 · 44% fav · avg -0.04% · PF 0.98 | 4 · 50% fav · avg +0.19% · PF 1.13 | 5 · 40% fav · avg +18.12% · PF 5.87 | ❌ fails at least one segment |
| daily breakout-55 longs (swing exits) | 5 · 80% fav · avg +3.18% · PF 14.91 | 1 · 100% fav · avg +5.99% · PF ∞ | 3 · 67% fav · avg +35.90% · PF 73.35 | ❌ fails at least one segment |
| daily breakout-100 | 5 · 40% fav · avg -1.01% · PF 0.16 | 4 · 25% fav · avg -1.90% · PF 0.29 | 4 · 25% fav · avg +7.15% · PF 3.13 | ❌ fails at least one segment |

## WTI intraday scalp + EIA conditioning

Insufficient 1h history (0 candles) — skipped. When the count is 0 this is usually a data-plan limit, not a market gap: FMP answers 1-hour CLUSD requests with HTTP 402/403 on plans without intraday commodity history (the job log shows the per-chunk errors). The study runs automatically on the next research pass once 1h WTI data is available.

## AI meta-label experiment

A logistic model trained on the 324 train-period baseline signals (features: side, RSI, ADX, volume ratio, trend distance, ATR%) predicts the probability a signal ends favorable. Judged on the 179 untouched validate-period signals.

| Threshold | Train (kept signals) | Validate (kept signals) |
|---|---|---|
| p ≥ 0.5 | 36 · 42% fav · avg +0.15% · PF 1.30 | 26 · 31% fav · avg -0.76% · PF 0.41 |
| p ≥ 0.55 | 15 · 33% fav · avg -0.40% · PF 0.46 | 20 · 30% fav · avg -0.65% · PF 0.49 |
| p ≥ 0.6 | 2 · 0% fav · avg -1.44% · PF 0.00 | 16 · 25% fav · avg -0.97% · PF 0.24 |
| p ≥ 0.65 | 1 · 0% fav · avg +0.00% · PF ∞ | 8 · 38% fav · avg -0.13% · PF 0.81 |

**Verdict: ❌ does not pass out-of-sample** — the model is NOT published or used. Train-period fit did not survive on unseen data.

## Overall (all markets pooled)

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 67 · 33% fav · avg -0.06% · PF 0.86 | 21 · 52% fav · avg -0.19% · PF 0.71 |
| Unfiltered baseline | 324 · 39% fav · avg +0.07% · PF 1.19 | 179 · 37% fav · avg -0.12% · PF 0.77 |
| Filtered + trailing exit | 67 · 34% fav · avg +0.09% · PF 1.15 | 21 · 33% fav · avg -0.16% · PF 0.82 |

### Verdicts (by average move per signal)

- **Filters vs baseline**: train worse, validate worse → ❌ does NOT hold up out-of-sample
- **Trailing exit vs fixed exit**: train better, validate better → ✅ holds up out-of-sample

_Educational research, not financial advice. Past performance does not predict future results._
