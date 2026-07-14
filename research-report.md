# LordBastian Signal Generator — walk-forward research

Generated 2026-07-14T21:18:24.152Z · 3y of 4h candles via FMP · train = first 70% of each market's history, validate = last 30% (out-of-sample).

A variant only counts as an improvement if it beats its comparator in **both** periods — train-only wins are fitted noise.

Enrichment coverage: funding 4/4 · fng 3082 · econ 1001 · usd ok · btc ok

## BTC / USD

6638 candles, 2023-07-05 → 2026-07-14, split at 2025-08-17

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 14 · 21% fav · avg -0.54% · PF 0.46 | 2 · 0% fav · avg -0.85% · PF 0.00 |
| Unfiltered baseline | 74 · 38% fav · avg -0.14% · PF 0.85 | 35 · 34% fav · avg -0.18% · PF 0.74 |
| Filtered + trailing exit | 14 · 36% fav · avg -0.07% · PF 0.94 | 2 · 0% fav · avg -1.21% · PF 0.00 |

## XAU / USD · Gold

4642 candles, 2023-07-05 → 2026-07-14, split at 2025-08-19

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 20 · 30% fav · avg +0.09% · PF 1.44 | 5 · 40% fav · avg -0.83% · PF 0.40 |
| Unfiltered baseline | 63 · 38% fav · avg +0.12% · PF 1.49 | 20 · 40% fav · avg -0.44% · PF 0.50 |
| Filtered + trailing exit | 20 · 35% fav · avg +0.08% · PF 1.20 | 5 · 20% fav · avg -1.44% · PF 0.03 |

## US30 · Dow (DIA proxy)

1511 candles, 2023-07-05 → 2026-07-14, split at 2025-08-15

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 3 · 67% fav · avg +0.17% · PF 1.38 | 0 signals |
| Unfiltered baseline | 8 · 63% fav · avg +0.23% · PF 1.77 | 4 · 75% fav · avg +0.52% · PF 2.72 |
| Filtered + trailing exit | 3 · 67% fav · avg +0.63% · PF 2.13 | 0 signals |

## NAS100 · Nasdaq (QQQ proxy)

1510 candles, 2023-07-05 → 2026-07-14, split at 2025-08-15

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 1 · 100% fav · avg +0.88% · PF ∞ | 0 signals |
| Unfiltered baseline | 10 · 70% fav · avg +1.05% · PF 44.12 | 8 · 50% fav · avg +0.08% · PF 1.13 |
| Filtered + trailing exit | 1 · 100% fav · avg +3.55% · PF ∞ | 0 signals |

## SPX500 · S&P (SPY proxy)

1511 candles, 2023-07-05 → 2026-07-14, split at 2025-08-15

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 1 · 0% fav · avg -1.22% · PF 0.00 | 2 · 100% fav · avg +0.98% · PF ∞ |
| Unfiltered baseline | 8 · 50% fav · avg +0.18% · PF 1.50 | 8 · 63% fav · avg +0.24% · PF 1.74 |
| Filtered + trailing exit | 1 · 0% fav · avg -1.02% · PF 0.00 | 2 · 100% fav · avg +2.58% · PF ∞ |

## GBP / USD · Cable

4725 candles, 2023-07-05 → 2026-07-14, split at 2025-08-18

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 8 · 50% fav · avg +0.13% · PF 2.68 | 3 · 33% fav · avg -0.06% · PF 0.74 |
| Unfiltered baseline | 51 · 35% fav · avg -0.00% · PF 0.99 | 31 · 29% fav · avg -0.07% · PF 0.57 |
| Filtered + trailing exit | 8 · 13% fav · avg -0.19% · PF 0.04 | 3 · 33% fav · avg -0.12% · PF 0.37 |

## EUR / USD

4722 candles, 2023-07-05 → 2026-07-14, split at 2025-08-15

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 7 · 29% fav · avg -0.07% · PF 0.62 | 4 · 25% fav · avg -0.17% · PF 0.01 |
| Unfiltered baseline | 42 · 33% fav · avg -0.01% · PF 0.90 | 34 · 41% fav · avg +0.01% · PF 1.09 |
| Filtered + trailing exit | 7 · 43% fav · avg +0.17% · PF 1.79 | 4 · 0% fav · avg -0.28% · PF 0.00 |

## WTI Crude Oil

4257 candles, 2023-10-01 → 2026-07-14, split at 2025-09-15

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 13 · 31% fav · avg -0.07% · PF 0.88 | 4 · 50% fav · avg -0.66% · PF 0.32 |
| Unfiltered baseline | 61 · 36% fav · avg +0.20% · PF 1.47 | 27 · 44% fav · avg -0.27% · PF 0.69 |
| Filtered + trailing exit | 13 · 31% fav · avg -0.09% · PF 0.88 | 4 · 25% fav · avg -0.81% · PF 0.50 |

## Alternative entry families (pooled)

| Strategy | Train | Validate | Verdict |
|---|---|---|---|
| Donchian-55 breakout, fixed exits | 595 · 39% fav · avg +0.03% · PF 1.06 | 233 · 41% fav · avg +0.20% · PF 1.48 | ✅ positive in BOTH periods |
| Donchian-55 breakout, trailing exits | 595 · 36% fav · avg +0.02% · PF 1.03 | 233 · 38% fav · avg +0.38% · PF 1.68 | ✅ positive in BOTH periods |
| Funding-extreme mean reversion, fixed | 0 signals | 14 · 36% fav · avg +0.13% · PF 1.23 | ❌ no out-of-sample edge |
| Funding-extreme mean reversion, trailing | 0 signals | 14 · 57% fav · avg +0.57% · PF 1.85 | ❌ no out-of-sample edge |
| **Breakout trailing, NET of per-market costs** | 595 · 34% fav · avg -0.03% · PF 0.95 | 233 · 37% fav · avg +0.33% · PF 1.56 | ❌ costs eat the edge |

## Breakout + trailing, per market (net of that market's cost)

| Market | Cost | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|
| BTC / USD | 0.10% | 108 · 32% fav · avg -0.04% · PF 0.97 | 53 · 26% fav · avg -0.23% · PF 0.77 | ❌ no net edge |
| XAU / USD · Gold | 0.05% | 105 · 41% fav · avg +0.03% · PF 1.08 | 40 · 57% fav · avg +0.83% · PF 3.09 | ✅ net edge |
| US30 · Dow (DIA proxy) | 0.02% | 35 · 40% fav · avg +0.28% · PF 1.57 | 16 · 13% fav · avg -0.56% · PF 0.24 | ❌ no net edge |
| NAS100 · Nasdaq (QQQ proxy) | 0.02% | 36 · 44% fav · avg +0.30% · PF 1.55 | 14 · 57% fav · avg +1.07% · PF 3.58 | ✅ net edge |
| SPX500 · S&P (SPY proxy) | 0.02% | 41 · 46% fav · avg +0.32% · PF 1.81 | 16 · 31% fav · avg -0.07% · PF 0.86 | ❌ no net edge |
| GBP / USD · Cable | 0.03% | 92 · 33% fav · avg -0.08% · PF 0.65 | 33 · 33% fav · avg -0.00% · PF 0.98 | ❌ no net edge |
| EUR / USD | 0.03% | 90 · 29% fav · avg -0.05% · PF 0.77 | 31 · 39% fav · avg +0.01% · PF 1.05 | ❌ no net edge |
| WTI Crude Oil | 0.05% | 88 · 25% fav · avg -0.44% · PF 0.55 | 30 · 37% fav · avg +1.69% · PF 2.56 | ❌ no net edge |

Per-market edge status published to edge-status.json — alerts for ❌ markets carry an informational-only warning.

## Donchian lookback grid (breakout + trailing, net of costs)

| Lookback | All markets: train | validate | Non-crypto only: train | validate |
|---|---|---|---|---|
| 20 | 972 · 38% fav · avg +0.04% · PF 1.08 | 405 · 38% fav · avg +0.09% · PF 1.14 | 786 · 38% fav · avg +0.04% · PF 1.11 | 312 · 40% fav · avg +0.23% · PF 1.45 |
| 55 | 595 · 34% fav · avg -0.03% · PF 0.95 | 233 · 37% fav · avg +0.33% · PF 1.56 | 487 · 35% fav · avg -0.03% · PF 0.94 | 180 · 40% fav · avg +0.49% · PF 2.05 |
| 100 | 434 · 35% fav · avg +0.02% · PF 1.04 | 182 · 41% fav · avg +0.41% · PF 1.74 | 353 · 36% fav · avg +0.01% · PF 1.02 | 142 · 44% fav · avg +0.53% · PF 2.24 |

## Candidate markets (4h breakout + trailing, net of own cost)

New markets audition with the exact live rule set — a candidate is added to the app only if net-positive in both periods.

| Candidate | Cost | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|
| XAG / USD · Silver | 0.05% | 87 · 34% fav · avg -0.02% · PF 0.97 | 45 · 40% fav · avg -0.04% · PF 0.97 | ❌ no net edge |
| USD / JPY | 0.03% | 94 · 40% fav · avg +0.05% · PF 1.20 | 36 · 31% fav · avg -0.02% · PF 0.90 | ❌ no net edge |
| AUD / USD | 0.03% | 89 · 22% fav · avg -0.21% · PF 0.44 | 39 · 33% fav · avg +0.00% · PF 1.02 | ❌ no net edge |
| USD / CAD | 0.03% | 88 · 28% fav · avg -0.03% · PF 0.87 | 43 · 44% fav · avg +0.04% · PF 1.51 | ❌ no net edge |
| EUR / GBP | 0.03% | 66 · 33% fav · avg -0.05% · PF 0.79 | 37 · 27% fav · avg -0.08% · PF 0.44 | ❌ no net edge |
| Natural Gas | 0.08% | 94 · 38% fav · avg +0.38% · PF 1.25 | 41 · 29% fav · avg -0.48% · PF 0.77 | ❌ no net edge |

## Scalp feasibility: Donchian breakout on 1-hour candles

Same strategy, 4× faster timeframe, 7 markets over up to 2 years. The question is not accuracy — it is whether the per-trade move survives realistic per-market round-trip costs. Faster timeframes shrink the move; costs stay constant.

| Variant | Train (gross) | Validate (gross) | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|---|
| 1h breakout, fixed exits | 1291 · 38% fav · avg +0.04% · PF 1.21 | 524 · 38% fav · avg +0.02% · PF 1.12 | 1291 · 35% fav · avg -0.01% · PF 0.95 | 524 · 35% fav · avg -0.03% · PF 0.90 | ❌ not viable net of costs |
| 1h breakout, trailing exits | 1291 · 39% fav · avg +0.05% · PF 1.21 | 523 · 38% fav · avg +0.03% · PF 1.10 | 1291 · 36% fav · avg +0.00% · PF 1.00 | 523 · 36% fav · avg -0.02% · PF 0.92 | ❌ not viable net of costs |

### Scalp rescue filters (1h breakout + trailing, net of costs)

Each filter attacks the reason scalping failed: too-small moves against fixed costs. A filter only counts if it turns the NET result positive in both periods.

| Filter | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| Session only (07–16 UTC) | 752 · 37% fav · avg +0.02% · PF 1.07 | 303 · 39% fav · avg -0.00% · PF 1.00 | ❌ not viable net of costs |
| High volatility only (ATR% > trailing avg) | 670 · 35% fav · avg +0.01% · PF 1.03 | 250 · 38% fav · avg -0.02% · PF 0.95 | ❌ not viable net of costs |
| 4h-edge markets only (GOLD, NAS100) | 334 · 39% fav · avg +0.06% · PF 1.25 | 129 · 43% fav · avg +0.13% · PF 1.37 | ✅ survives costs on 1h |
| All three combined | 109 · 37% fav · avg +0.09% · PF 1.27 | 34 · 59% fav · avg +0.44% · PF 2.77 | ✅ survives costs on 1h |
| Combo at HALF costs (best-case raw spreads) | 109 · 37% fav · avg +0.11% · PF 1.35 | 34 · 62% fav · avg +0.46% · PF 2.90 | ✅ viable IF costs halve |

## Daily-candle breakout (slower, not faster)

Daily candles aggregated from the same history. Fewer, bigger trades — the direction where cost drag shrinks instead of grows.

| Lookback | Train (net) | Validate (net) | Verdict |
|---|---|---|---|
| 20 | 248 · 39% fav · avg +0.02% · PF 1.02 | 110 · 36% fav · avg +0.61% · PF 1.45 | ✅ survives costs on daily |
| 55 | 155 · 43% fav · avg +0.20% · PF 1.19 | 71 · 38% fav · avg +1.29% · PF 2.39 | ✅ survives costs on daily |

## AI meta-label experiment

A logistic model trained on the 317 train-period baseline signals (features: side, RSI, ADX, volume ratio, trend distance, ATR%) predicts the probability a signal ends favorable. Judged on the 167 untouched validate-period signals.

| Threshold | Train (kept signals) | Validate (kept signals) |
|---|---|---|
| p ≥ 0.5 | 33 · 42% fav · avg +0.15% · PF 1.28 | 16 · 38% fav · avg -0.47% · PF 0.64 |
| p ≥ 0.55 | 13 · 31% fav · avg -0.40% · PF 0.46 | 12 · 33% fav · avg -0.49% · PF 0.65 |
| p ≥ 0.6 | 1 · 0% fav · avg +0.00% · PF ∞ | 6 · 17% fav · avg -0.57% · PF 0.40 |
| p ≥ 0.65 | 0 signals | 3 · 33% fav · avg -0.30% · PF 0.72 |

**Verdict: ❌ does not pass out-of-sample** — the model is NOT published or used. Train-period fit did not survive on unseen data.

## Overall (all markets pooled)

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 67 · 33% fav · avg -0.09% · PF 0.80 | 20 · 40% fav · avg -0.37% · PF 0.46 |
| Unfiltered baseline | 317 · 38% fav · avg +0.07% · PF 1.17 | 167 · 40% fav · avg -0.12% · PF 0.76 |
| Filtered + trailing exit | 67 · 34% fav · avg +0.05% · PF 1.08 | 20 · 25% fav · avg -0.46% · PF 0.49 |

### Verdicts (by average move per signal)

- **Filters vs baseline**: train worse, validate worse → ❌ does NOT hold up out-of-sample
- **Trailing exit vs fixed exit**: train better, validate worse → ❌ does NOT hold up out-of-sample

_Educational research, not financial advice. Past performance does not predict future results._
