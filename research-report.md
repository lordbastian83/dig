# LordBastian Signal Generator — walk-forward research

Generated 2026-11-01T07:36:34.436Z · 3y of 4h candles via FMP · train = first 70% of each market's history, validate = last 30% (out-of-sample).

A variant only counts as an improvement if it beats its comparator in **both** periods — train-only wins are fitted noise.

Enrichment coverage: funding 4/4 · fng 3192 · econ 936 · usd ok · btc ok

## BTC / USD

6631 candles, 2023-10-23 → 2026-11-01, split at 2025-12-04

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 12 · 25% fav · avg -0.49% · PF 0.53 | 5 · 20% fav · avg -0.50% · PF 0.10 |
| Unfiltered baseline | 77 · 39% fav · avg -0.13% · PF 0.86 | 39 · 28% fav · avg -0.20% · PF 0.69 |
| Filtered + trailing exit | 12 · 42% fav · avg +0.14% · PF 1.12 | 5 · 20% fav · avg -0.47% · PF 0.22 |

## XAU / USD · Gold

4647 candles, 2023-10-23 → 2026-10-30, split at 2025-12-05

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 18 · 28% fav · avg +0.08% · PF 1.39 | 5 · 40% fav · avg -0.83% · PF 0.40 |
| Unfiltered baseline | 63 · 41% fav · avg +0.11% · PF 1.45 | 26 · 31% fav · avg -0.33% · PF 0.59 |
| Filtered + trailing exit | 18 · 33% fav · avg +0.08% · PF 1.20 | 5 · 20% fav · avg -1.43% · PF 0.04 |

## US30 · Dow (DIA proxy)

1511 candles, 2023-10-23 → 2026-10-30, split at 2025-12-04

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 3 · 67% fav · avg +0.17% · PF 1.38 | 1 · 0% fav · avg +0.00% · PF ∞ |
| Unfiltered baseline | 10 · 60% fav · avg +0.11% · PF 1.30 | 4 · 50% fav · avg +0.72% · PF ∞ |
| Filtered + trailing exit | 3 · 67% fav · avg +0.63% · PF 2.13 | 1 · 0% fav · avg -0.51% · PF 0.00 |

## NAS100 · Nasdaq (QQQ proxy)

1511 candles, 2023-10-23 → 2026-10-30, split at 2025-12-04

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 1 · 100% fav · avg +0.88% · PF ∞ | 1 · 100% fav · avg +0.58% · PF ∞ |
| Unfiltered baseline | 12 · 67% fav · avg +0.78% · PF 5.46 | 11 · 55% fav · avg +0.48% · PF 2.27 |
| Filtered + trailing exit | 1 · 100% fav · avg +3.55% · PF ∞ | 1 · 0% fav · avg -0.68% · PF 0.00 |

## SPX500 · S&P (SPY proxy)

1511 candles, 2023-10-23 → 2026-10-30, split at 2025-12-04

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 2 · 50% fav · avg -0.56% · PF 0.08 | 2 · 100% fav · avg +1.73% · PF ∞ |
| Unfiltered baseline | 10 · 50% fav · avg +0.02% · PF 1.05 | 11 · 45% fav · avg +0.26% · PF 1.90 |
| Filtered + trailing exit | 2 · 50% fav · avg -0.07% · PF 0.86 | 2 · 100% fav · avg +3.37% · PF ∞ |

## GBP / USD · Cable

4722 candles, 2023-10-23 → 2026-10-30, split at 2025-12-04

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 9 · 56% fav · avg +0.16% · PF 3.07 | 1 · 100% fav · avg +0.09% · PF ∞ |
| Unfiltered baseline | 58 · 33% fav · avg -0.01% · PF 0.90 | 26 · 38% fav · avg -0.02% · PF 0.86 |
| Filtered + trailing exit | 9 · 22% fav · avg -0.13% · PF 0.19 | 1 · 100% fav · avg +0.12% · PF ∞ |

## EUR / USD

4719 candles, 2023-10-23 → 2026-10-30, split at 2025-12-03

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 9 · 33% fav · avg -0.04% · PF 0.67 | 1 · 0% fav · avg -0.31% · PF 0.00 |
| Unfiltered baseline | 43 · 37% fav · avg +0.03% · PF 1.24 | 30 · 37% fav · avg +0.00% · PF 1.05 |
| Filtered + trailing exit | 9 · 33% fav · avg +0.09% · PF 1.45 | 1 · 0% fav · avg -0.31% · PF 0.00 |

## WTI Crude Oil

4631 candles, 2023-10-23 → 2026-10-30, split at 2025-12-08

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 13 · 31% fav · avg -0.07% · PF 0.88 | 5 · 60% fav · avg -0.19% · PF 0.76 |
| Unfiltered baseline | 69 · 39% fav · avg +0.13% · PF 1.29 | 24 · 46% fav · avg -0.29% · PF 0.72 |
| Filtered + trailing exit | 13 · 31% fav · avg -0.09% · PF 0.88 | 5 · 40% fav · avg +0.17% · PF 1.14 |

## Alternative entry families (pooled)

| Strategy | Train | Validate | Verdict |
|---|---|---|---|
| Donchian-55 breakout, fixed exits | 610 · 39% fav · avg +0.05% · PF 1.11 | 226 · 36% fav · avg +0.06% · PF 1.11 | ✅ positive in BOTH periods |
| Donchian-55 breakout, trailing exits | 610 · 36% fav · avg -0.03% · PF 0.95 | 225 · 36% fav · avg +0.40% · PF 1.64 | ❌ no out-of-sample edge |
| Funding-extreme mean reversion, fixed | 0 signals | 13 · 54% fav · avg +0.06% · PF 1.17 | ❌ no out-of-sample edge |
| Funding-extreme mean reversion, trailing | 0 signals | 12 · 25% fav · avg -0.59% · PF 0.28 | ❌ no out-of-sample edge |
| **Breakout trailing, NET of per-market costs** | 610 · 34% fav · avg -0.07% · PF 0.87 | 225 · 36% fav · avg +0.35% · PF 1.54 | ❌ costs eat the edge |

## Breakout + trailing, per market (net of that market's cost)

| Market | Cost | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|
| BTC / USD | 0.10% | 117 · 31% fav · avg -0.22% · PF 0.81 | 45 · 29% fav · avg +0.01% · PF 1.01 | ❌ no net edge |
| XAU / USD · Gold | 0.05% | 105 · 45% fav · avg +0.16% · PF 1.45 | 31 · 58% fav · avg +0.79% · PF 2.68 | ✅ net edge |
| US30 · Dow (DIA proxy) | 0.02% | 33 · 33% fav · avg -0.01% · PF 0.98 | 15 · 7% fav · avg -0.62% · PF 0.22 | ❌ no net edge |
| NAS100 · Nasdaq (QQQ proxy) | 0.02% | 36 · 47% fav · avg +0.22% · PF 1.38 | 13 · 38% fav · avg +1.03% · PF 3.25 | ✅ net edge |
| SPX500 · S&P (SPY proxy) | 0.02% | 40 · 43% fav · avg +0.22% · PF 1.53 | 14 · 29% fav · avg +0.07% · PF 1.13 | ✅ net edge |
| GBP / USD · Cable | 0.03% | 95 · 34% fav · avg -0.06% · PF 0.70 | 33 · 30% fav · avg -0.01% · PF 0.91 | ❌ no net edge |
| EUR / USD | 0.03% | 90 · 29% fav · avg -0.04% · PF 0.80 | 34 · 41% fav · avg -0.01% · PF 0.93 | ❌ no net edge |
| WTI Crude Oil | 0.05% | 94 · 24% fav · avg -0.46% · PF 0.52 | 40 · 38% fav · avg +1.25% · PF 1.97 | ❌ no net edge |

Per-market edge status published to edge-status.json — alerts for ❌ markets carry an informational-only warning.

## Donchian lookback grid (breakout + trailing, net of costs)

| Lookback | All markets: train | validate | Non-crypto only: train | validate |
|---|---|---|---|---|
| 20 | 983 · 38% fav · avg +0.01% · PF 1.02 | 405 · 35% fav · avg +0.07% · PF 1.10 | 792 · 38% fav · avg +0.02% · PF 1.05 | 316 · 38% fav · avg +0.22% · PF 1.39 |
| 55 | 610 · 34% fav · avg -0.07% · PF 0.87 | 225 · 36% fav · avg +0.35% · PF 1.54 | 493 · 35% fav · avg -0.04% · PF 0.91 | 180 · 37% fav · avg +0.44% · PF 1.77 |
| 100 | 431 · 36% fav · avg -0.02% · PF 0.97 | 180 · 37% fav · avg +0.40% · PF 1.66 | 344 · 37% fav · avg -0.01% · PF 0.98 | 146 · 39% fav · avg +0.50% · PF 2.03 |

## Candidate markets (4h breakout + trailing, net of own cost)

New markets audition with the exact live rule set — a candidate is added to the app only if net-positive in both periods.

| Candidate | Cost | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|
| XAG / USD · Silver | 0.05% | 95 · 36% fav · avg +0.08% · PF 1.12 | 45 · 31% fav · avg -0.62% · PF 0.64 | ❌ no net edge |
| USD / JPY | 0.03% | 93 · 43% fav · avg +0.08% · PF 1.36 | 38 · 26% fav · avg -0.09% · PF 0.42 | ❌ no net edge |
| AUD / USD | 0.03% | 94 · 24% fav · avg -0.16% · PF 0.52 | 41 · 29% fav · avg -0.06% · PF 0.75 | ❌ no net edge |
| USD / CAD | 0.03% | 86 · 30% fav · avg -0.00% · PF 1.00 | 49 · 53% fav · avg +0.10% · PF 2.25 | ❌ no net edge |
| EUR / GBP | 0.03% | 71 · 34% fav · avg -0.05% · PF 0.80 | 42 · 24% fav · avg -0.08% · PF 0.37 | ❌ no net edge |
| Natural Gas | 0.08% | 105 · 40% fav · avg +0.31% · PF 1.21 | 38 · 29% fav · avg +0.03% · PF 1.02 | ✅ net edge — add |

## Scalp feasibility: Donchian breakout on 1-hour candles

Same strategy, 4× faster timeframe, 7 markets over up to 2 years. The question is not accuracy — it is whether the per-trade move survives realistic per-market round-trip costs. Faster timeframes shrink the move; costs stay constant.

| Variant | Train (gross) | Validate (gross) | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|---|
| 1h breakout, fixed exits | 1271 · 39% fav · avg +0.03% · PF 1.16 | 525 · 34% fav · avg -0.00% · PF 0.99 | 1271 · 36% fav · avg -0.02% · PF 0.91 | 525 · 32% fav · avg -0.05% · PF 0.78 | ❌ not viable net of costs |
| 1h breakout, trailing exits | 1271 · 39% fav · avg +0.04% · PF 1.18 | 522 · 36% fav · avg -0.01% · PF 0.96 | 1271 · 36% fav · avg -0.01% · PF 0.98 | 522 · 32% fav · avg -0.06% · PF 0.78 | ❌ not viable net of costs |

### Scalp rescue filters (1h breakout + trailing, net of costs)

Each filter attacks the reason scalping failed: too-small moves against fixed costs. A filter only counts if it turns the NET result positive in both periods.

| Filter | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| Session only (07–16 UTC) | 737 · 37% fav · avg +0.01% · PF 1.05 | 318 · 32% fav · avg -0.06% · PF 0.79 | ❌ not viable net of costs |
| High volatility only (ATR% > trailing avg) | 647 · 36% fav · avg +0.01% · PF 1.03 | 268 · 33% fav · avg -0.09% · PF 0.72 | ❌ not viable net of costs |
| 4h-edge markets only (GOLD, NAS100, SPX500) | 403 · 39% fav · avg +0.07% · PF 1.23 | 166 · 39% fav · avg +0.04% · PF 1.14 | ✅ survives costs on 1h |
| All three combined | 125 · 40% fav · avg +0.16% · PF 1.47 | 56 · 43% fav · avg +0.02% · PF 1.07 | ✅ survives costs on 1h |
| Combo at HALF costs (best-case raw spreads) | 125 · 40% fav · avg +0.18% · PF 1.53 | 56 · 45% fav · avg +0.04% · PF 1.13 | ✅ viable IF costs halve |
| Combo at 2× modeled costs (widened spreads) | 125 · 40% fav · avg +0.12% · PF 1.34 | 56 · 39% fav · avg -0.01% · PF 0.96 | ❌ edge gone — skip trades when spreads look like this |
| Combo at 3× modeled costs (widened spreads) | 125 · 37% fav · avg +0.09% · PF 1.23 | 56 · 39% fav · avg -0.05% · PF 0.87 | ❌ edge gone — skip trades when spreads look like this |
| _Break-even cost multiple (validate)_ | — | — | gross edge ≈ 1.6× the modeled cost |

## Daily-candle breakout (slower, not faster)

Daily candles aggregated from the same history. Fewer, bigger trades — the direction where cost drag shrinks instead of grows.

| Lookback | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| 20 | 256 · 36% fav · avg -0.09% · PF 0.92 | 101 · 44% fav · avg +1.05% · PF 1.80 | ❌ no net edge on daily |
| 55 | 151 · 39% fav · avg +0.03% · PF 1.02 | 61 · 41% fav · avg +1.68% · PF 2.79 | ✅ survives costs on daily |

## Exit grid — 4h breakout (edge markets: GOLD, NAS100, SPX500)

| stop / trail / window | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| **1.5 / 2 / 18 (live)** | 181 · 45% fav · avg +0.18% · PF 1.45 | 58 · 47% fav · avg +0.67% · PF 2.36 | baseline |
| 1.5 / 1.5 / 12 | 181 · 45% fav · avg +0.18% · PF 1.55 | 58 · 50% fav · avg +0.47% · PF 2.15 | · no improvement |
| 1.5 / 1.5 / 18 | 181 · 45% fav · avg +0.18% · PF 1.55 | 58 · 50% fav · avg +0.45% · PF 2.11 | · no improvement |
| 1.5 / 1.5 / 24 | 181 · 45% fav · avg +0.18% · PF 1.53 | 58 · 50% fav · avg +0.44% · PF 2.07 | · no improvement |
| 1.5 / 2 / 12 | 181 · 47% fav · avg +0.21% · PF 1.52 | 58 · 47% fav · avg +0.60% · PF 2.22 | · no improvement |
| 1.5 / 2 / 24 | 181 · 44% fav · avg +0.16% · PF 1.40 | 58 · 47% fav · avg +0.72% · PF 2.47 | · no improvement |
| 1.5 / 3 / 12 | 181 · 43% fav · avg +0.15% · PF 1.33 | 58 · 48% fav · avg +0.55% · PF 1.90 | · no improvement |
| 1.5 / 3 / 18 | 181 · 38% fav · avg +0.08% · PF 1.15 | 58 · 47% fav · avg +0.64% · PF 2.02 | · no improvement |
| 1.5 / 3 / 24 | 181 · 35% fav · avg +0.01% · PF 1.02 | 58 · 45% fav · avg +0.77% · PF 2.22 | · no improvement |
| 2 / 1.5 / 12 | 181 · 45% fav · avg +0.18% · PF 1.55 | 58 · 50% fav · avg +0.46% · PF 2.14 | · no improvement |
| 2 / 1.5 / 18 | 181 · 45% fav · avg +0.18% · PF 1.55 | 58 · 50% fav · avg +0.45% · PF 2.09 | · no improvement |
| 2 / 1.5 / 24 | 181 · 45% fav · avg +0.18% · PF 1.53 | 58 · 50% fav · avg +0.43% · PF 2.06 | · no improvement |
| 2 / 2 / 12 | 181 · 49% fav · avg +0.22% · PF 1.53 | 58 · 47% fav · avg +0.55% · PF 1.99 | · no improvement |
| 2 / 2 / 18 | 181 · 46% fav · avg +0.19% · PF 1.45 | 58 · 47% fav · avg +0.60% · PF 2.09 | · no improvement |
| 2 / 2 / 24 | 181 · 45% fav · avg +0.17% · PF 1.39 | 58 · 47% fav · avg +0.66% · PF 2.18 | · no improvement |
| 2 / 3 / 12 | 181 · 46% fav · avg +0.13% · PF 1.25 | 58 · 50% fav · avg +0.48% · PF 1.66 | · no improvement |
| 2 / 3 / 18 | 181 · 40% fav · avg +0.03% · PF 1.05 | 58 · 48% fav · avg +0.55% · PF 1.73 | · no improvement |
| 2 / 3 / 24 | 181 · 38% fav · avg -0.04% · PF 0.93 | 58 · 47% fav · avg +0.69% · PF 1.90 | ❌ not net-positive both periods |

## Side split — 4h breakout (edge markets: GOLD, NAS100, SPX500) (live exits)

| Side | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| long | 142 · 49% fav · avg +0.29% · PF 1.83 | 39 · 51% fav · avg +0.75% · PF 2.51 | ✅ carries its weight |
| short | 39 · 28% fav · avg -0.19% · PF 0.71 | 19 · 37% fav · avg +0.50% · PF 2.04 | ❌ loses net in at least one period |

## Exit grid — daily swing-55 (pooled)

| stop / trail / window | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| **2 / 3 / 24 (live)** | 151 · 39% fav · avg +0.38% · PF 1.27 | 61 · 36% fav · avg +1.95% · PF 2.30 | baseline |
| 1.5 / 1.5 / 12 | 151 · 39% fav · avg -0.11% · PF 0.87 | 62 · 39% fav · avg +1.21% · PF 2.58 | ❌ not net-positive both periods |
| 1.5 / 1.5 / 18 | 151 · 39% fav · avg -0.08% · PF 0.90 | 62 · 39% fav · avg +1.30% · PF 2.69 | ❌ not net-positive both periods |
| 1.5 / 1.5 / 24 | 151 · 39% fav · avg -0.07% · PF 0.92 | 62 · 39% fav · avg +1.21% · PF 2.58 | ❌ not net-positive both periods |
| 1.5 / 2 / 12 | 151 · 39% fav · avg -0.14% · PF 0.87 | 61 · 43% fav · avg +1.48% · PF 2.63 | ❌ not net-positive both periods |
| 1.5 / 2 / 18 | 151 · 39% fav · avg +0.03% · PF 1.02 | 61 · 41% fav · avg +1.68% · PF 2.79 | · no improvement |
| 1.5 / 2 / 24 | 151 · 38% fav · avg +0.11% · PF 1.10 | 61 · 39% fav · avg +1.49% · PF 2.49 | · no improvement |
| 1.5 / 3 / 12 | 151 · 38% fav · avg -0.09% · PF 0.93 | 61 · 41% fav · avg +1.07% · PF 1.95 | ❌ not net-positive both periods |
| 1.5 / 3 / 18 | 151 · 34% fav · avg +0.11% · PF 1.09 | 61 · 34% fav · avg +1.12% · PF 1.92 | · no improvement |
| 1.5 / 3 / 24 | 151 · 32% fav · avg +0.17% · PF 1.13 | 61 · 33% fav · avg +0.91% · PF 1.67 | · no improvement |
| 2 / 1.5 / 12 | 151 · 39% fav · avg -0.13% · PF 0.85 | 62 · 39% fav · avg +1.21% · PF 2.58 | ❌ not net-positive both periods |
| 2 / 1.5 / 18 | 151 · 39% fav · avg -0.11% · PF 0.88 | 62 · 39% fav · avg +1.30% · PF 2.70 | ❌ not net-positive both periods |
| 2 / 1.5 / 24 | 151 · 39% fav · avg -0.09% · PF 0.89 | 62 · 39% fav · avg +1.21% · PF 2.58 | ❌ not net-positive both periods |
| 2 / 2 / 12 | 151 · 40% fav · avg -0.21% · PF 0.82 | 61 · 44% fav · avg +1.44% · PF 2.52 | ❌ not net-positive both periods |
| 2 / 2 / 18 | 151 · 40% fav · avg -0.05% · PF 0.96 | 61 · 41% fav · avg +1.61% · PF 2.59 | ❌ not net-positive both periods |
| 2 / 2 / 24 | 151 · 40% fav · avg +0.04% · PF 1.04 | 61 · 39% fav · avg +1.42% · PF 2.32 | · no improvement |
| 2 / 3 / 12 | 151 · 43% fav · avg -0.09% · PF 0.93 | 61 · 44% fav · avg +1.36% · PF 2.17 | ❌ not net-positive both periods |
| 2 / 3 / 18 | 151 · 40% fav · avg +0.19% · PF 1.14 | 61 · 38% fav · avg +2.19% · PF 2.66 | · no improvement |

## Side split — daily swing-55 (pooled) (live exits)

| Side | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| long | 117 · 41% fav · avg +0.68% · PF 1.55 | 40 · 43% fav · avg +3.56% · PF 3.95 | ✅ carries its weight |
| short | 34 · 32% fav · avg -0.67% · PF 0.65 | 21 · 24% fav · avg -1.12% · PF 0.46 | ❌ loses net in at least one period |

## Pyramiding the daily swing-55 (add to winners?)

Pre-registered refinement of the validated swing stream: add-on units fill at the close that first reaches the trigger, share the trail, and exit together. Returns are net % on total deployed notional under one simulator (the baseline row is re-simulated the same way, so rows are directly comparable). Adoption rule: a variant becomes an execution rule ONLY if it beats the no-adds baseline in BOTH periods with ≥30 validate trades. Honest caveat: adds raise open risk precisely when a trade is winning — the % edge must beat the baseline to justify that.

| Variant | Side | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|
| no adds (live baseline, re-simulated) | both | 151 · 43% fav · avg +0.68% · PF 1.42 | 62 · 35% fav · avg +0.75% · PF 1.39 | baseline |
| add ½ unit at +1×ATR | both | 151 · 42% fav · avg +0.17% · PF 1.09 | 62 · 34% fav · avg +0.12% · PF 1.06 | ❌ no improvement |
| add 1 unit at +1×ATR | both | 151 · 41% fav · avg -0.09% · PF 0.95 | 62 · 34% fav · avg -0.20% · PF 0.91 | ❌ no improvement |
| add ½ + ½ at +1 and +2×ATR | both | 151 · 40% fav · avg -0.23% · PF 0.88 | 62 · 34% fav · avg -0.26% · PF 0.88 | ❌ no improvement |
| no adds (live baseline, re-simulated) | ▲ longs | 117 · 49% fav · avg +1.44% · PF 2.07 | 40 · 40% fav · avg +1.75% · PF 2.26 | baseline |
| add ½ unit at +1×ATR | ▲ longs | 117 · 48% fav · avg +0.95% · PF 1.66 | 40 · 38% fav · avg +1.07% · PF 1.69 | ❌ no improvement |
| add 1 unit at +1×ATR | ▲ longs | 117 · 47% fav · avg +0.71% · PF 1.47 | 40 · 38% fav · avg +0.74% · PF 1.44 | ❌ no improvement |
| add ½ + ½ at +1 and +2×ATR | ▲ longs | 117 · 46% fav · avg +0.60% · PF 1.39 | 40 · 38% fav · avg +0.68% · PF 1.41 | ❌ no improvement |

## Trend-quality gate on the daily swing-55 (regime filter?)

Pre-registered refinement: entries only when the signal candle sits in a trend regime (EMA200 side and/or an ADX floor), scored under the live swing exit and net of modeled cost. Adoption rule: a gate becomes an execution rule ONLY if it beats the no-gate baseline in BOTH periods with ≥30 validate trades. Honest caveat: a filter only removes trades — a better average on far fewer trades can still earn less in total, so weigh n as well as avg.

| Gate | Side | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|
| no gate (live baseline, re-simulated) | both | 151 · 43% fav · avg +0.68% · PF 1.42 | 62 · 35% fav · avg +0.75% · PF 1.39 | baseline |
| EMA200-aligned (with-trend only) | both | 103 · 45% fav · avg +0.73% · PF 1.50 | 54 · 37% fav · avg +1.00% · PF 1.57 | ✅ beats baseline both periods — adopt as execution rule |
| ADX ≥ 20 (trend regime) | both | 103 · 38% fav · avg -0.02% · PF 0.99 | 45 · 36% fav · avg +1.11% · PF 1.52 | ❌ no improvement |
| ADX ≥ 25 (strong trend) | both | 72 · 36% fav · avg -0.11% · PF 0.94 | 30 · 40% fav · avg +1.19% · PF 1.56 | ❌ no improvement |
| EMA200-aligned AND ADX ≥ 20 | both | 70 · 40% fav · avg -0.02% · PF 0.99 | 39 · 38% fav · avg +1.74% · PF 1.93 | ❌ no improvement |
| no gate (live baseline, re-simulated) | ▲ longs | 117 · 49% fav · avg +1.44% · PF 2.07 | 40 · 40% fav · avg +1.75% · PF 2.26 | baseline |
| EMA200-aligned (with-trend only) | ▲ longs | 82 · 48% fav · avg +1.15% · PF 1.87 | 36 · 39% fav · avg +1.82% · PF 2.51 | ❌ no improvement |
| ADX ≥ 20 (trend regime) | ▲ longs | 78 · 40% fav · avg +0.57% · PF 1.34 | 26 · 38% fav · avg +2.66% · PF 2.83 | ⚠️ too few trades |
| ADX ≥ 25 (strong trend) | ▲ longs | 52 · 38% fav · avg +0.63% · PF 1.38 | 17 · 41% fav · avg +3.15% · PF 2.87 | ⚠️ too few trades |
| EMA200-aligned AND ADX ≥ 20 | ▲ longs | 54 · 39% fav · avg +0.11% · PF 1.07 | 23 · 39% fav · avg +3.32% · PF 4.01 | ⚠️ too few trades |

## Cost robustness — funded swing-55 longs (fragility report)

How much spread-widening the validated edge absorbs. Pre-registered as a report only: no rule ships from it. Modeled per-market round-trip costs are the baseline (1×); live spreads at news times can run multiples of that.

| Cost assumption | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| 1× modeled cost | 117 · 49% fav · avg +1.44% · PF 2.07 | 40 · 40% fav · avg +1.75% · PF 2.26 | ✅ edge survives |
| 2× modeled cost | 117 · 49% fav · avg +1.40% · PF 2.02 | 40 · 40% fav · avg +1.71% · PF 2.21 | ✅ edge survives |
| 3× modeled cost | 117 · 48% fav · avg +1.36% · PF 1.98 | 40 · 40% fav · avg +1.67% · PF 2.16 | ✅ edge survives |
| 5× modeled cost | 117 · 48% fav · avg +1.28% · PF 1.90 | 40 · 40% fav · avg +1.59% · PF 2.07 | ✅ edge survives |
| _Break-even cost multiple (validate)_ | — | gross 40 · 40% fav · avg +1.78% · PF 2.30 | edge ≈ 46× the modeled cost |

## Cost robustness — funded early-swing (20d) longs (fragility report)

The thinnest funded daily edge, under the same spread-widening sweep as the swing-55 block above. Pre-registered as a report only: no rule ships from it, and the early-swing alert only gains a measured discipline line from numbers published here.

| Cost assumption | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| 1× modeled cost | 170 · 46% fav · avg +0.58% · PF 1.48 | 59 · 44% fav · avg +1.17% · PF 1.74 | ✅ edge survives |
| 2× modeled cost | 170 · 46% fav · avg +0.54% · PF 1.43 | 59 · 42% fav · avg +1.13% · PF 1.71 | ✅ edge survives |
| 3× modeled cost | 170 · 45% fav · avg +0.50% · PF 1.40 | 59 · 42% fav · avg +1.09% · PF 1.67 | ✅ edge survives |
| 5× modeled cost | 170 · 45% fav · avg +0.42% · PF 1.32 | 59 · 42% fav · avg +1.00% · PF 1.60 | ✅ edge survives |
| _Break-even cost multiple (validate)_ | — | gross 59 · 44% fav · avg +1.21% · PF 1.78 | edge ≈ 29× the modeled cost |

## WTI deep-dive

4722 4h candles (2023-10-01 → 2026-10-30), 958 daily. Three-way split (tune / select / confirm); a candidate must be net-positive in ALL segments with ≥15 confirm trades. 14 variants tested — with this many looks at one market, treat even a triple pass as a paper candidate, not a funded stream.

| Variant | Tune (net) | Select (net) | Confirm (net) | Verdict |
|---|---|---|---|---|
| 4h breakout-20 | 120 · 31% fav · avg -0.25% · PF 0.72 | 61 · 30% fav · avg -0.17% · PF 0.81 | 52 · 38% fav · avg +0.89% · PF 1.63 | ❌ fails at least one segment |
| 4h breakout-20 longs | 65 · 26% fav · avg -0.37% · PF 0.57 | 34 · 29% fav · avg -0.14% · PF 0.86 | 33 · 42% fav · avg +1.50% · PF 2.18 | ❌ fails at least one segment |
| 4h breakout-55 | 73 · 25% fav · avg -0.55% · PF 0.45 | 28 · 25% fav · avg -0.16% · PF 0.82 | 35 · 37% fav · avg +1.37% · PF 2.00 | ❌ fails at least one segment |
| 4h breakout-55 longs | 36 · 22% fav · avg -0.49% · PF 0.47 | 14 · 21% fav · avg +0.37% · PF 1.61 | 24 · 38% fav · avg +1.96% · PF 2.76 | ❌ fails at least one segment |
| 4h breakout-55 shorts | 37 · 27% fav · avg -0.60% · PF 0.44 | 14 · 29% fav · avg -0.69% · PF 0.40 | 11 · 36% fav · avg +0.09% · PF 1.05 | ❌ fails at least one segment |
| 4h breakout-100 | 48 · 29% fav · avg -0.41% · PF 0.55 | 16 · 31% fav · avg +0.25% · PF 1.35 | 24 · 33% fav · avg +1.77% · PF 2.39 | ❌ fails at least one segment |
| 4h breakout-100 longs | 21 · 24% fav · avg -0.28% · PF 0.61 | 9 · 33% fav · avg +0.88% · PF 2.33 | 18 · 28% fav · avg +2.13% · PF 2.83 | ❌ fails at least one segment |
| 4h breakout-55 NY session (12-20 UTC) | 9 · 22% fav · avg -1.05% · PF 0.08 | 7 · 57% fav · avg +2.24% · PF 8.27 | 7 · 43% fav · avg +0.50% · PF 1.46 | ❌ fails at least one segment |
| 4h filtered cross | 11 · 18% fav · avg -0.38% · PF 0.51 | 3 · 100% fav · avg +0.91% · PF ∞ | 4 · 50% fav · avg -0.32% · PF 0.67 | ❌ fails at least one segment |
| daily breakout-20 | 21 · 33% fav · avg -0.95% · PF 0.48 | 10 · 30% fav · avg -0.33% · PF 0.85 | 9 · 56% fav · avg +4.99% · PF 2.23 | ❌ fails at least one segment |
| daily breakout-20 longs | 11 · 27% fav · avg -0.68% · PF 0.58 | 5 · 40% fav · avg +1.04% · PF 1.51 | 6 · 67% fav · avg +8.08% · PF 4.51 | ❌ fails at least one segment |
| daily breakout-55 (swing exits) | 10 · 40% fav · avg -0.09% · PF 0.95 | 3 · 67% fav · avg +0.44% · PF 1.24 | 6 · 50% fav · avg +15.72% · PF 6.07 | ❌ fails at least one segment |
| daily breakout-55 longs (swing exits) | 5 · 80% fav · avg +3.18% · PF 14.90 | 1 · 100% fav · avg +5.99% · PF ∞ | 4 · 75% fav · avg +27.85% · PF 75.84 | ❌ fails at least one segment |
| daily breakout-100 | 6 · 33% fav · avg -1.14% · PF 0.13 | 3 · 33% fav · avg -1.95% · PF 0.35 | 4 · 25% fav · avg +7.15% · PF 3.13 | ❌ fails at least one segment |

## WTI intraday scalp + EIA conditioning

Insufficient 1h history (0 candles) — skipped. When the count is 0 this is usually a data-plan limit, not a market gap: FMP answers 1-hour CLUSD requests with HTTP 402/403 on plans without intraday commodity history (the job log shows the per-chunk errors). The study runs automatically on the next research pass once 1h WTI data is available.

## AI meta-label experiment

A logistic model trained on the 342 train-period baseline signals (features: side, RSI, ADX, volume ratio, trend distance, ATR%) predicts the probability a signal ends favorable. Judged on the 171 untouched validate-period signals.

| Threshold | Train (kept signals) | Validate (kept signals) |
|---|---|---|
| p ≥ 0.5 | 55 · 49% fav · avg +0.06% · PF 1.12 | 31 · 32% fav · avg -0.45% · PF 0.56 |
| p ≥ 0.55 | 17 · 35% fav · avg -0.35% · PF 0.56 | 18 · 28% fav · avg -0.83% · PF 0.42 |
| p ≥ 0.6 | 4 · 25% fav · avg -0.97% · PF 0.11 | 14 · 29% fav · avg -0.85% · PF 0.43 |
| p ≥ 0.65 | 0 signals | 7 · 14% fav · avg -0.61% · PF 0.31 |

**Verdict: ❌ does not pass out-of-sample** — the model is NOT published or used. Train-period fit did not survive on unseen data.

## Overall (all markets pooled)

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 67 · 36% fav · avg -0.06% · PF 0.86 | 21 · 48% fav · avg -0.18% · PF 0.73 |
| Unfiltered baseline | 342 · 40% fav · avg +0.05% · PF 1.12 | 171 · 37% fav · avg -0.07% · PF 0.85 |
| Filtered + trailing exit | 67 · 36% fav · avg +0.10% · PF 1.18 | 21 · 33% fav · avg -0.15% · PF 0.82 |

### Verdicts (by average move per signal)

- **Filters vs baseline**: train worse, validate worse → ❌ does NOT hold up out-of-sample
- **Trailing exit vs fixed exit**: train better, validate better → ✅ holds up out-of-sample

_Educational research, not financial advice. Past performance does not predict future results._
