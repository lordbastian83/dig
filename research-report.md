# LordBastian Signal Generator — walk-forward research

Generated 2026-10-02T05:57:51.673Z · 3y of 4h candles via FMP · train = first 70% of each market's history, validate = last 30% (out-of-sample).

A variant only counts as an improvement if it beats its comparator in **both** periods — train-only wins are fitted noise.

Enrichment coverage: funding 4/4 · fng 3162 · econ 838 · usd ok · btc ok

## BTC / USD

6634 candles, 2023-09-23 → 2026-10-02, split at 2025-11-04

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 12 · 25% fav · avg -0.49% · PF 0.53 | 4 · 0% fav · avg -0.70% · PF 0.00 |
| Unfiltered baseline | 74 · 38% fav · avg -0.18% · PF 0.81 | 39 · 28% fav · avg -0.17% · PF 0.74 |
| Filtered + trailing exit | 12 · 42% fav · avg +0.14% · PF 1.12 | 4 · 0% fav · avg -0.90% · PF 0.00 |

## XAU / USD · Gold

4647 candles, 2023-09-24 → 2026-10-02, split at 2025-11-06

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 19 · 26% fav · avg +0.08% · PF 1.39 | 5 · 40% fav · avg -0.83% · PF 0.40 |
| Unfiltered baseline | 62 · 40% fav · avg +0.13% · PF 1.57 | 26 · 31% fav · avg -0.38% · PF 0.54 |
| Filtered + trailing exit | 19 · 32% fav · avg +0.06% · PF 1.16 | 5 · 20% fav · avg -1.43% · PF 0.04 |

## US30 · Dow (DIA proxy)

1509 candles, 2023-09-25 → 2026-10-01, split at 2025-11-04

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 3 · 67% fav · avg +0.17% · PF 1.38 | 0 signals |
| Unfiltered baseline | 8 · 63% fav · avg +0.23% · PF 1.77 | 5 · 60% fav · avg +0.42% · PF 2.72 |
| Filtered + trailing exit | 3 · 67% fav · avg +0.63% · PF 2.13 | 0 signals |

## NAS100 · Nasdaq (QQQ proxy)

1509 candles, 2023-09-25 → 2026-10-01, split at 2025-11-04

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 1 · 100% fav · avg +0.88% · PF ∞ | 1 · 100% fav · avg +0.58% · PF ∞ |
| Unfiltered baseline | 10 · 70% fav · avg +1.05% · PF 44.12 | 12 · 58% fav · avg +0.35% · PF 1.69 |
| Filtered + trailing exit | 1 · 100% fav · avg +3.55% · PF ∞ | 1 · 0% fav · avg -0.68% · PF 0.00 |

## SPX500 · S&P (SPY proxy)

1509 candles, 2023-09-25 → 2026-10-01, split at 2025-11-04

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 1 · 0% fav · avg -1.22% · PF 0.00 | 3 · 100% fav · avg +1.18% · PF ∞ |
| Unfiltered baseline | 8 · 50% fav · avg +0.18% · PF 1.50 | 12 · 50% fav · avg +0.22% · PF 1.75 |
| Filtered + trailing exit | 1 · 0% fav · avg -1.02% · PF 0.00 | 3 · 100% fav · avg +2.54% · PF ∞ |

## GBP / USD · Cable

4722 candles, 2023-09-24 → 2026-10-02, split at 2025-11-05

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 10 · 50% fav · avg +0.14% · PF 3.07 | 1 · 100% fav · avg +0.09% · PF ∞ |
| Unfiltered baseline | 56 · 32% fav · avg -0.02% · PF 0.88 | 25 · 32% fav · avg -0.07% · PF 0.60 |
| Filtered + trailing exit | 10 · 20% fav · avg -0.13% · PF 0.17 | 1 · 100% fav · avg +0.12% · PF ∞ |

## EUR / USD

4719 candles, 2023-09-24 → 2026-10-02, split at 2025-11-04

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 8 · 25% fav · avg -0.05% · PF 0.67 | 2 · 50% fav · avg -0.15% · PF 0.02 |
| Unfiltered baseline | 42 · 38% fav · avg +0.04% · PF 1.39 | 30 · 37% fav · avg +0.00% · PF 1.01 |
| Filtered + trailing exit | 8 · 38% fav · avg +0.14% · PF 1.69 | 2 · 0% fav · avg -0.28% · PF 0.00 |

## WTI Crude Oil

4601 candles, 2023-10-01 → 2026-10-02, split at 2025-11-10

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 13 · 31% fav · avg -0.07% · PF 0.88 | 5 · 60% fav · avg -0.19% · PF 0.76 |
| Unfiltered baseline | 66 · 38% fav · avg +0.21% · PF 1.51 | 28 · 43% fav · avg -0.38% · PF 0.62 |
| Filtered + trailing exit | 13 · 31% fav · avg -0.09% · PF 0.88 | 5 · 40% fav · avg +0.17% · PF 1.14 |

## Alternative entry families (pooled)

| Strategy | Train | Validate | Verdict |
|---|---|---|---|
| Donchian-55 breakout, fixed exits | 609 · 40% fav · avg +0.06% · PF 1.14 | 226 · 37% fav · avg +0.10% · PF 1.21 | ✅ positive in BOTH periods |
| Donchian-55 breakout, trailing exits | 609 · 36% fav · avg +0.01% · PF 1.02 | 225 · 37% fav · avg +0.45% · PF 1.74 | ✅ positive in BOTH periods |
| Funding-extreme mean reversion, fixed | 0 signals | 13 · 46% fav · avg -0.25% · PF 0.59 | ❌ no out-of-sample edge |
| Funding-extreme mean reversion, trailing | 0 signals | 13 · 31% fav · avg -0.50% · PF 0.46 | ❌ no out-of-sample edge |
| **Breakout trailing, NET of per-market costs** | 609 · 35% fav · avg -0.04% · PF 0.94 | 225 · 36% fav · avg +0.40% · PF 1.62 | ❌ costs eat the edge |

## Breakout + trailing, per market (net of that market's cost)

| Market | Cost | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|
| BTC / USD | 0.10% | 115 · 30% fav · avg -0.16% · PF 0.86 | 46 · 30% fav · avg +0.14% · PF 1.14 | ❌ no net edge |
| XAU / USD · Gold | 0.05% | 106 · 43% fav · avg +0.12% · PF 1.32 | 33 · 58% fav · avg +0.84% · PF 2.87 | ✅ net edge |
| US30 · Dow (DIA proxy) | 0.02% | 35 · 40% fav · avg +0.28% · PF 1.57 | 14 · 7% fav · avg -0.63% · PF 0.23 | ❌ no net edge |
| NAS100 · Nasdaq (QQQ proxy) | 0.02% | 37 · 49% fav · avg +0.35% · PF 1.66 | 13 · 38% fav · avg +0.90% · PF 2.54 | ✅ net edge |
| SPX500 · S&P (SPY proxy) | 0.02% | 42 · 45% fav · avg +0.33% · PF 1.89 | 14 · 29% fav · avg +0.02% · PF 1.03 | ✅ net edge |
| GBP / USD · Cable | 0.03% | 92 · 34% fav · avg -0.06% · PF 0.71 | 34 · 29% fav · avg -0.02% · PF 0.89 | ❌ no net edge |
| EUR / USD | 0.03% | 88 · 31% fav · avg -0.03% · PF 0.84 | 34 · 41% fav · avg +0.00% · PF 1.02 | ❌ no net edge |
| WTI Crude Oil | 0.05% | 94 · 24% fav · avg -0.47% · PF 0.52 | 37 · 38% fav · avg +1.43% · PF 2.19 | ❌ no net edge |

Per-market edge status published to edge-status.json — alerts for ❌ markets carry an informational-only warning.

## Donchian lookback grid (breakout + trailing, net of costs)

| Lookback | All markets: train | validate | Non-crypto only: train | validate |
|---|---|---|---|---|
| 20 | 982 · 38% fav · avg +0.05% · PF 1.09 | 405 · 36% fav · avg +0.10% · PF 1.14 | 793 · 38% fav · avg +0.04% · PF 1.10 | 316 · 39% fav · avg +0.24% · PF 1.44 |
| 55 | 609 · 35% fav · avg -0.04% · PF 0.94 | 225 · 36% fav · avg +0.40% · PF 1.62 | 494 · 36% fav · avg -0.01% · PF 0.98 | 179 · 37% fav · avg +0.46% · PF 1.85 |
| 100 | 442 · 36% fav · avg +0.00% · PF 1.00 | 175 · 39% fav · avg +0.50% · PF 1.87 | 356 · 37% fav · avg +0.01% · PF 1.02 | 140 · 41% fav · avg +0.57% · PF 2.24 |

## Candidate markets (4h breakout + trailing, net of own cost)

New markets audition with the exact live rule set — a candidate is added to the app only if net-positive in both periods.

| Candidate | Cost | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|
| XAG / USD · Silver | 0.05% | 94 · 34% fav · avg -0.08% · PF 0.89 | 44 · 39% fav · avg -0.11% · PF 0.93 | ❌ no net edge |
| USD / JPY | 0.03% | 91 · 43% fav · avg +0.07% · PF 1.30 | 39 · 28% fav · avg -0.04% · PF 0.72 | ❌ no net edge |
| AUD / USD | 0.03% | 90 · 24% fav · avg -0.17% · PF 0.51 | 40 · 35% fav · avg +0.00% · PF 1.02 | ❌ no net edge |
| USD / CAD | 0.03% | 87 · 29% fav · avg -0.00% · PF 0.98 | 47 · 53% fav · avg +0.08% · PF 2.02 | ❌ no net edge |
| EUR / GBP | 0.03% | 70 · 33% fav · avg -0.05% · PF 0.79 | 37 · 22% fav · avg -0.10% · PF 0.31 | ❌ no net edge |
| Natural Gas | 0.08% | 104 · 38% fav · avg +0.24% · PF 1.15 | 38 · 26% fav · avg -0.40% · PF 0.79 | ❌ no net edge |

## Scalp feasibility: Donchian breakout on 1-hour candles

Same strategy, 4× faster timeframe, 7 markets over up to 2 years. The question is not accuracy — it is whether the per-trade move survives realistic per-market round-trip costs. Faster timeframes shrink the move; costs stay constant.

| Variant | Train (gross) | Validate (gross) | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|---|
| 1h breakout, fixed exits | 1260 · 38% fav · avg +0.03% · PF 1.14 | 534 · 34% fav · avg -0.01% · PF 0.98 | 1260 · 35% fav · avg -0.02% · PF 0.89 | 534 · 32% fav · avg -0.05% · PF 0.78 | ❌ not viable net of costs |
| 1h breakout, trailing exits | 1260 · 38% fav · avg +0.04% · PF 1.17 | 534 · 36% fav · avg +0.01% · PF 1.03 | 1260 · 35% fav · avg -0.01% · PF 0.97 | 534 · 34% fav · avg -0.04% · PF 0.86 | ❌ not viable net of costs |

### Scalp rescue filters (1h breakout + trailing, net of costs)

Each filter attacks the reason scalping failed: too-small moves against fixed costs. A filter only counts if it turns the NET result positive in both periods.

| Filter | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| Session only (07–16 UTC) | 733 · 36% fav · avg +0.01% · PF 1.03 | 324 · 34% fav · avg -0.05% · PF 0.83 | ❌ not viable net of costs |
| High volatility only (ATR% > trailing avg) | 638 · 35% fav · avg +0.01% · PF 1.02 | 274 · 34% fav · avg -0.06% · PF 0.81 | ❌ not viable net of costs |
| 4h-edge markets only (GOLD, NAS100, SPX500) | 404 · 39% fav · avg +0.06% · PF 1.23 | 166 · 39% fav · avg +0.05% · PF 1.16 | ✅ survives costs on 1h |
| All three combined | 125 · 39% fav · avg +0.16% · PF 1.47 | 51 · 43% fav · avg +0.04% · PF 1.12 | ✅ survives costs on 1h |
| Combo at HALF costs (best-case raw spreads) | 125 · 39% fav · avg +0.17% · PF 1.54 | 51 · 45% fav · avg +0.06% · PF 1.18 | ✅ viable IF costs halve |
| Combo at 2× modeled costs (widened spreads) | 125 · 39% fav · avg +0.12% · PF 1.34 | 51 · 39% fav · avg +0.01% · PF 1.02 | ✅ edge survives |
| Combo at 3× modeled costs (widened spreads) | 125 · 35% fav · avg +0.08% · PF 1.22 | 51 · 39% fav · avg -0.02% · PF 0.93 | ❌ edge gone — skip trades when spreads look like this |
| _Break-even cost multiple (validate)_ | — | — | gross edge ≈ 2.3× the modeled cost |

## Daily-candle breakout (slower, not faster)

Daily candles aggregated from the same history. Fewer, bigger trades — the direction where cost drag shrinks instead of grows.

| Lookback | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| 20 | 260 · 36% fav · avg -0.04% · PF 0.97 | 99 · 44% fav · avg +1.11% · PF 1.84 | ❌ no net edge on daily |
| 55 | 158 · 39% fav · avg +0.05% · PF 1.04 | 57 · 42% fav · avg +1.91% · PF 3.12 | ✅ survives costs on daily |

## Exit grid — 4h breakout (edge markets: GOLD, NAS100, SPX500)

| stop / trail / window | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| **1.5 / 2 / 18 (live)** | 185 · 45% fav · avg +0.21% · PF 1.53 | 60 · 47% fav · avg +0.66% · PF 2.27 | baseline |
| 1.5 / 1.5 / 12 | 185 · 46% fav · avg +0.21% · PF 1.66 | 60 · 50% fav · avg +0.42% · PF 1.96 | · no improvement |
| 1.5 / 1.5 / 18 | 185 · 46% fav · avg +0.21% · PF 1.66 | 60 · 50% fav · avg +0.40% · PF 1.92 | · no improvement |
| 1.5 / 1.5 / 24 | 185 · 46% fav · avg +0.21% · PF 1.64 | 60 · 50% fav · avg +0.39% · PF 1.89 | · no improvement |
| 1.5 / 2 / 12 | 185 · 47% fav · avg +0.25% · PF 1.64 | 60 · 47% fav · avg +0.55% · PF 2.06 | · no improvement |
| 1.5 / 2 / 24 | 185 · 44% fav · avg +0.20% · PF 1.49 | 60 · 47% fav · avg +0.71% · PF 2.36 | · no improvement |
| 1.5 / 3 / 12 | 185 · 43% fav · avg +0.20% · PF 1.44 | 60 · 48% fav · avg +0.51% · PF 1.78 | · no improvement |
| 1.5 / 3 / 18 | 185 · 38% fav · avg +0.11% · PF 1.22 | 59 · 46% fav · avg +0.61% · PF 1.91 | · no improvement |
| 1.5 / 3 / 24 | 185 · 35% fav · avg +0.05% · PF 1.10 | 59 · 44% fav · avg +0.71% · PF 2.06 | · no improvement |
| 2 / 1.5 / 12 | 185 · 46% fav · avg +0.22% · PF 1.66 | 60 · 50% fav · avg +0.41% · PF 1.95 | · no improvement |
| 2 / 1.5 / 18 | 185 · 46% fav · avg +0.22% · PF 1.66 | 60 · 50% fav · avg +0.40% · PF 1.91 | · no improvement |
| 2 / 1.5 / 24 | 185 · 46% fav · avg +0.21% · PF 1.64 | 60 · 50% fav · avg +0.38% · PF 1.88 | · no improvement |
| 2 / 2 / 12 | 185 · 49% fav · avg +0.26% · PF 1.65 | 60 · 47% fav · avg +0.50% · PF 1.86 | · no improvement |
| 2 / 2 / 18 | 185 · 47% fav · avg +0.23% · PF 1.56 | 60 · 47% fav · avg +0.60% · PF 2.02 | · no improvement |
| 2 / 2 / 24 | 185 · 46% fav · avg +0.21% · PF 1.51 | 60 · 47% fav · avg +0.64% · PF 2.10 | · no improvement |
| 2 / 3 / 12 | 185 · 46% fav · avg +0.18% · PF 1.38 | 60 · 50% fav · avg +0.42% · PF 1.55 | · no improvement |
| 2 / 3 / 18 | 185 · 41% fav · avg +0.08% · PF 1.15 | 59 · 47% fav · avg +0.51% · PF 1.63 | · no improvement |
| 2 / 3 / 24 | 185 · 39% fav · avg +0.03% · PF 1.04 | 59 · 46% fav · avg +0.61% · PF 1.75 | · no improvement |

## Side split — 4h breakout (edge markets: GOLD, NAS100, SPX500) (live exits)

| Side | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| long | 148 · 49% fav · avg +0.29% · PF 1.81 | 40 · 55% fav · avg +0.87% · PF 2.91 | ✅ carries its weight |
| short | 37 · 30% fav · avg -0.10% · PF 0.84 | 20 · 30% fav · avg +0.25% · PF 1.38 | ❌ loses net in at least one period |

## Exit grid — daily swing-55 (pooled)

| stop / trail / window | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| **2 / 3 / 24 (live)** | 158 · 39% fav · avg +0.40% · PF 1.29 | 57 · 37% fav · avg +2.20% · PF 2.48 | baseline |
| 1.5 / 1.5 / 12 | 158 · 39% fav · avg -0.08% · PF 0.90 | 60 · 40% fav · avg +1.34% · PF 2.79 | ❌ not net-positive both periods |
| 1.5 / 1.5 / 18 | 158 · 39% fav · avg -0.06% · PF 0.93 | 60 · 40% fav · avg +1.44% · PF 2.92 | ❌ not net-positive both periods |
| 1.5 / 1.5 / 24 | 158 · 39% fav · avg -0.05% · PF 0.95 | 60 · 40% fav · avg +1.34% · PF 2.79 | ❌ not net-positive both periods |
| 1.5 / 2 / 12 | 158 · 39% fav · avg -0.10% · PF 0.90 | 57 · 42% fav · avg +1.60% · PF 2.73 | ❌ not net-positive both periods |
| 1.5 / 2 / 18 | 158 · 39% fav · avg +0.05% · PF 1.04 | 57 · 42% fav · avg +1.91% · PF 3.12 | · no improvement |
| 1.5 / 2 / 24 | 158 · 38% fav · avg +0.12% · PF 1.11 | 57 · 40% fav · avg +1.71% · PF 2.76 | · no improvement |
| 1.5 / 3 / 12 | 158 · 38% fav · avg -0.05% · PF 0.95 | 57 · 39% fav · avg +1.08% · PF 1.90 | ❌ not net-positive both periods |
| 1.5 / 3 / 18 | 158 · 34% fav · avg +0.14% · PF 1.11 | 57 · 35% fav · avg +1.27% · PF 2.04 | · no improvement |
| 1.5 / 3 / 24 | 158 · 32% fav · avg +0.20% · PF 1.16 | 57 · 33% fav · avg +1.05% · PF 1.77 | · no improvement |
| 2 / 1.5 / 12 | 158 · 39% fav · avg -0.11% · PF 0.88 | 60 · 40% fav · avg +1.34% · PF 2.80 | ❌ not net-positive both periods |
| 2 / 1.5 / 18 | 158 · 39% fav · avg -0.08% · PF 0.91 | 60 · 40% fav · avg +1.44% · PF 2.92 | ❌ not net-positive both periods |
| 2 / 1.5 / 24 | 158 · 39% fav · avg -0.07% · PF 0.92 | 60 · 40% fav · avg +1.34% · PF 2.80 | ❌ not net-positive both periods |
| 2 / 2 / 12 | 158 · 40% fav · avg -0.18% · PF 0.84 | 57 · 44% fav · avg +1.56% · PF 2.62 | ❌ not net-positive both periods |
| 2 / 2 / 18 | 158 · 40% fav · avg -0.03% · PF 0.98 | 57 · 42% fav · avg +1.83% · PF 2.87 | ❌ not net-positive both periods |
| 2 / 2 / 24 | 158 · 39% fav · avg +0.05% · PF 1.05 | 57 · 40% fav · avg +1.63% · PF 2.55 | · no improvement |
| 2 / 3 / 12 | 158 · 43% fav · avg -0.06% · PF 0.95 | 57 · 42% fav · avg +1.41% · PF 2.13 | ❌ not net-positive both periods |
| 2 / 3 / 18 | 158 · 41% fav · avg +0.20% · PF 1.15 | 57 · 39% fav · avg +2.45% · PF 2.89 | · no improvement |

## Side split — daily swing-55 (pooled) (live exits)

| Side | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| long | 124 · 41% fav · avg +0.72% · PF 1.60 | 38 · 45% fav · avg +3.95% · PF 4.69 | ✅ carries its weight |
| short | 34 · 32% fav · avg -0.77% · PF 0.61 | 19 · 21% fav · avg -1.30% · PF 0.44 | ❌ loses net in at least one period |

## Pyramiding the daily swing-55 (add to winners?)

Pre-registered refinement of the validated swing stream: add-on units fill at the close that first reaches the trigger, share the trail, and exit together. Returns are net % on total deployed notional under one simulator (the baseline row is re-simulated the same way, so rows are directly comparable). Adoption rule: a variant becomes an execution rule ONLY if it beats the no-adds baseline in BOTH periods with ≥30 validate trades. Honest caveat: adds raise open risk precisely when a trade is winning — the % edge must beat the baseline to justify that.

| Variant | Side | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|
| no adds (live baseline, re-simulated) | both | 158 · 43% fav · avg +0.70% · PF 1.44 | 62 · 40% fav · avg +0.83% · PF 1.47 | baseline |
| add ½ unit at +1×ATR | both | 158 · 42% fav · avg +0.20% · PF 1.11 | 62 · 39% fav · avg +0.20% · PF 1.10 | ❌ no improvement |
| add 1 unit at +1×ATR | both | 158 · 41% fav · avg -0.06% · PF 0.97 | 62 · 39% fav · avg -0.12% · PF 0.94 | ❌ no improvement |
| add ½ + ½ at +1 and +2×ATR | both | 158 · 40% fav · avg -0.20% · PF 0.90 | 62 · 39% fav · avg -0.17% · PF 0.92 | ❌ no improvement |
| no adds (live baseline, re-simulated) | ▲ longs | 124 · 48% fav · avg +1.46% · PF 2.12 | 40 · 45% fav · avg +1.95% · PF 2.63 | baseline |
| add ½ unit at +1×ATR | ▲ longs | 124 · 48% fav · avg +0.97% · PF 1.69 | 40 · 43% fav · avg +1.30% · PF 1.96 | ❌ no improvement |
| add 1 unit at +1×ATR | ▲ longs | 124 · 47% fav · avg +0.73% · PF 1.50 | 40 · 43% fav · avg +0.97% · PF 1.67 | ❌ no improvement |
| add ½ + ½ at +1 and +2×ATR | ▲ longs | 124 · 46% fav · avg +0.61% · PF 1.42 | 40 · 43% fav · avg +0.90% · PF 1.62 | ❌ no improvement |

## Trend-quality gate on the daily swing-55 (regime filter?)

Pre-registered refinement: entries only when the signal candle sits in a trend regime (EMA200 side and/or an ADX floor), scored under the live swing exit and net of modeled cost. Adoption rule: a gate becomes an execution rule ONLY if it beats the no-gate baseline in BOTH periods with ≥30 validate trades. Honest caveat: a filter only removes trades — a better average on far fewer trades can still earn less in total, so weigh n as well as avg.

| Gate | Side | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|
| no gate (live baseline, re-simulated) | both | 158 · 43% fav · avg +0.70% · PF 1.44 | 62 · 40% fav · avg +0.83% · PF 1.47 | baseline |
| EMA200-aligned (with-trend only) | both | 106 · 43% fav · avg +0.63% · PF 1.42 | 54 · 41% fav · avg +1.04% · PF 1.64 | ❌ no improvement |
| ADX ≥ 20 (trend regime) | both | 110 · 38% fav · avg +0.06% · PF 1.03 | 46 · 39% fav · avg +1.06% · PF 1.52 | ❌ no improvement |
| ADX ≥ 25 (strong trend) | both | 77 · 38% fav · avg +0.01% · PF 1.00 | 30 · 43% fav · avg +1.14% · PF 1.56 | ❌ no improvement |
| EMA200-aligned AND ADX ≥ 20 | both | 72 · 39% fav · avg -0.11% · PF 0.93 | 40 · 40% fav · avg +1.60% · PF 1.88 | ❌ no improvement |
| no gate (live baseline, re-simulated) | ▲ longs | 124 · 48% fav · avg +1.46% · PF 2.12 | 40 · 45% fav · avg +1.95% · PF 2.63 | baseline |
| EMA200-aligned (with-trend only) | ▲ longs | 85 · 46% fav · avg +1.05% · PF 1.78 | 36 · 44% fav · avg +2.05% · PF 3.08 | ❌ no improvement |
| ADX ≥ 20 (trend regime) | ▲ longs | 85 · 40% fav · avg +0.68% · PF 1.42 | 27 · 41% fav · avg +2.64% · PF 3.01 | ⚠️ too few trades |
| ADX ≥ 25 (strong trend) | ▲ longs | 57 · 40% fav · avg +0.80% · PF 1.51 | 17 · 47% fav · avg +3.42% · PF 3.40 | ⚠️ too few trades |
| EMA200-aligned AND ADX ≥ 20 | ▲ longs | 56 · 38% fav · avg +0.03% · PF 1.02 | 24 · 42% fav · avg +3.28% · PF 4.38 | ⚠️ too few trades |

## Cost robustness — funded swing-55 longs (fragility report)

How much spread-widening the validated edge absorbs. Pre-registered as a report only: no rule ships from it. Modeled per-market round-trip costs are the baseline (1×); live spreads at news times can run multiples of that.

| Cost assumption | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| 1× modeled cost | 124 · 48% fav · avg +1.46% · PF 2.12 | 40 · 45% fav · avg +1.95% · PF 2.63 | ✅ edge survives |
| 2× modeled cost | 124 · 48% fav · avg +1.42% · PF 2.08 | 40 · 45% fav · avg +1.91% · PF 2.58 | ✅ edge survives |
| 3× modeled cost | 124 · 48% fav · avg +1.38% · PF 2.03 | 40 · 43% fav · avg +1.87% · PF 2.52 | ✅ edge survives |
| 5× modeled cost | 124 · 48% fav · avg +1.30% · PF 1.95 | 40 · 40% fav · avg +1.79% · PF 2.41 | ✅ edge survives |
| _Break-even cost multiple (validate)_ | — | gross 40 · 45% fav · avg +1.99% · PF 2.70 | edge ≈ 51× the modeled cost |

## WTI deep-dive

4601 4h candles (2023-10-01 → 2026-10-02), 934 daily. Three-way split (tune / select / confirm); a candidate must be net-positive in ALL segments with ≥15 confirm trades. 14 variants tested — with this many looks at one market, treat even a triple pass as a paper candidate, not a funded stream.

| Variant | Tune (net) | Select (net) | Confirm (net) | Verdict |
|---|---|---|---|---|
| 4h breakout-20 | 117 · 31% fav · avg -0.22% · PF 0.74 | 58 · 31% fav · avg -0.22% · PF 0.76 | 52 · 38% fav · avg +1.04% · PF 1.78 | ❌ fails at least one segment |
| 4h breakout-20 longs | 63 · 27% fav · avg -0.32% · PF 0.62 | 30 · 30% fav · avg -0.26% · PF 0.75 | 34 · 41% fav · avg +1.60% · PF 2.35 | ❌ fails at least one segment |
| 4h breakout-55 | 71 · 24% fav · avg -0.54% · PF 0.46 | 27 · 26% fav · avg -0.29% · PF 0.68 | 33 · 39% fav · avg +1.68% · PF 2.36 | ❌ fails at least one segment |
| 4h breakout-55 longs | 35 · 23% fav · avg -0.45% · PF 0.50 | 12 · 17% fav · avg +0.09% · PF 1.13 | 23 · 39% fav · avg +2.24% · PF 3.32 | ❌ fails at least one segment |
| 4h breakout-55 shorts | 36 · 25% fav · avg -0.64% · PF 0.42 | 15 · 33% fav · avg -0.60% · PF 0.44 | 10 · 40% fav · avg +0.38% · PF 1.20 | ❌ fails at least one segment |
| 4h breakout-100 | 47 · 28% fav · avg -0.43% · PF 0.53 | 14 · 36% fav · avg +0.17% · PF 1.25 | 23 · 39% fav · avg +2.35% · PF 3.32 | ❌ fails at least one segment |
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

A logistic model trained on the 326 train-period baseline signals (features: side, RSI, ADX, volume ratio, trend distance, ATR%) predicts the probability a signal ends favorable. Judged on the 177 untouched validate-period signals.

| Threshold | Train (kept signals) | Validate (kept signals) |
|---|---|---|
| p ≥ 0.5 | 45 · 47% fav · avg +0.19% · PF 1.38 | 27 · 30% fav · avg -0.69% · PF 0.44 |
| p ≥ 0.55 | 17 · 35% fav · avg -0.39% · PF 0.46 | 18 · 22% fav · avg -0.85% · PF 0.37 |
| p ≥ 0.6 | 4 · 50% fav · avg -0.45% · PF 0.37 | 13 · 8% fav · avg -1.40% · PF 0.05 |
| p ≥ 0.65 | 1 · 0% fav · avg +0.00% · PF ∞ | 8 · 0% fav · avg -1.33% · PF 0.00 |

**Verdict: ❌ does not pass out-of-sample** — the model is NOT published or used. Train-period fit did not survive on unseen data.

## Overall (all markets pooled)

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 67 · 33% fav · avg -0.06% · PF 0.86 | 21 · 52% fav · avg -0.19% · PF 0.71 |
| Unfiltered baseline | 326 · 39% fav · avg +0.07% · PF 1.18 | 177 · 37% fav · avg -0.11% · PF 0.78 |
| Filtered + trailing exit | 67 · 34% fav · avg +0.09% · PF 1.15 | 21 · 33% fav · avg -0.16% · PF 0.82 |

### Verdicts (by average move per signal)

- **Filters vs baseline**: train worse, validate worse → ❌ does NOT hold up out-of-sample
- **Trailing exit vs fixed exit**: train better, validate better → ✅ holds up out-of-sample

_Educational research, not financial advice. Past performance does not predict future results._
