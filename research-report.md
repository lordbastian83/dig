# LordBastian Signal Generator — walk-forward research

Generated 2026-07-13T22:15:37.402Z · 3y of 4h candles via FMP · train = first 70% of each market's history, validate = last 30% (out-of-sample).

A variant only counts as an improvement if it beats its comparator in **both** periods — train-only wins are fitted noise.

Enrichment coverage: funding 4/4 · fng 3081 · econ 1011 · usd ok · btc ok

## BTC / USD

6638 candles, 2023-07-04 → 2026-07-13, split at 2025-08-16

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 14 · 21% fav · avg -0.54% · PF 0.46 | 2 · 0% fav · avg -0.85% · PF 0.00 |
| Unfiltered baseline | 73 · 38% fav · avg -0.14% · PF 0.85 | 36 · 33% fav · avg -0.17% · PF 0.74 |
| Filtered + trailing exit | 14 · 36% fav · avg -0.07% · PF 0.94 | 2 · 0% fav · avg -1.21% · PF 0.00 |

## ETH / USD

6638 candles, 2023-07-04 → 2026-07-13, split at 2025-08-16

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 11 · 36% fav · avg +0.22% · PF 1.29 | 8 · 38% fav · avg -1.02% · PF 0.53 |
| Unfiltered baseline | 67 · 46% fav · avg +0.19% · PF 1.22 | 37 · 41% fav · avg +0.01% · PF 1.01 |
| Filtered + trailing exit | 11 · 27% fav · avg -0.44% · PF 0.66 | 8 · 25% fav · avg -0.14% · PF 0.94 |

## SOL / USD

6638 candles, 2023-07-04 → 2026-07-13, split at 2025-08-16

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 12 · 50% fav · avg +1.00% · PF 2.96 | 6 · 67% fav · avg +0.46% · PF 1.37 |
| Unfiltered baseline | 71 · 54% fav · avg +0.56% · PF 1.47 | 35 · 54% fav · avg +0.26% · PF 1.25 |
| Filtered + trailing exit | 12 · 67% fav · avg +0.92% · PF 1.89 | 6 · 50% fav · avg +0.02% · PF 1.01 |

## XRP / USD

6521 candles, 2023-07-04 → 2026-07-13, split at 2025-08-21

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 11 · 18% fav · avg -0.93% · PF 0.36 | 5 · 40% fav · avg +0.28% · PF 1.50 |
| Unfiltered baseline | 79 · 38% fav · avg -0.03% · PF 0.97 | 32 · 41% fav · avg -0.04% · PF 0.96 |
| Filtered + trailing exit | 11 · 36% fav · avg -1.17% · PF 0.48 | 5 · 80% fav · avg +2.09% · PF 5.20 |

## XAU / USD · Gold

4642 candles, 2023-07-04 → 2026-07-13, split at 2025-08-18

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 20 · 30% fav · avg +0.09% · PF 1.44 | 5 · 40% fav · avg -0.83% · PF 0.40 |
| Unfiltered baseline | 63 · 38% fav · avg +0.12% · PF 1.49 | 20 · 40% fav · avg -0.44% · PF 0.50 |
| Filtered + trailing exit | 20 · 35% fav · avg +0.08% · PF 1.20 | 4 · 0% fav · avg -1.85% · PF 0.00 |

## US30 · Dow (DIA proxy)

1509 candles, 2023-07-05 → 2026-07-13, split at 2025-08-14

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 3 · 67% fav · avg +0.17% · PF 1.38 | 0 signals |
| Unfiltered baseline | 8 · 63% fav · avg +0.23% · PF 1.77 | 4 · 75% fav · avg +0.52% · PF 2.72 |
| Filtered + trailing exit | 3 · 67% fav · avg +0.63% · PF 2.13 | 0 signals |

## NAS100 · Nasdaq (QQQ proxy)

1508 candles, 2023-07-05 → 2026-07-13, split at 2025-08-14

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 1 · 100% fav · avg +0.88% · PF ∞ | 0 signals |
| Unfiltered baseline | 10 · 70% fav · avg +1.05% · PF 44.12 | 8 · 50% fav · avg +0.08% · PF 1.13 |
| Filtered + trailing exit | 1 · 100% fav · avg +3.55% · PF ∞ | 0 signals |

## SPX500 · S&P (SPY proxy)

1509 candles, 2023-07-05 → 2026-07-13, split at 2025-08-14

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 1 · 0% fav · avg -1.22% · PF 0.00 | 2 · 100% fav · avg +0.98% · PF ∞ |
| Unfiltered baseline | 8 · 50% fav · avg +0.18% · PF 1.50 | 8 · 63% fav · avg +0.24% · PF 1.74 |
| Filtered + trailing exit | 1 · 0% fav · avg -1.02% · PF 0.00 | 2 · 100% fav · avg +2.58% · PF ∞ |

## GBP / USD · Cable

4725 candles, 2023-07-04 → 2026-07-13, split at 2025-08-15

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 8 · 50% fav · avg +0.13% · PF 2.68 | 3 · 33% fav · avg -0.06% · PF 0.74 |
| Unfiltered baseline | 52 · 35% fav · avg -0.00% · PF 0.99 | 31 · 29% fav · avg -0.07% · PF 0.57 |
| Filtered + trailing exit | 8 · 13% fav · avg -0.19% · PF 0.04 | 3 · 33% fav · avg -0.12% · PF 0.37 |

## EUR / USD

4722 candles, 2023-07-04 → 2026-07-13, split at 2025-08-14

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 7 · 29% fav · avg -0.07% · PF 0.62 | 4 · 25% fav · avg -0.17% · PF 0.01 |
| Unfiltered baseline | 42 · 33% fav · avg -0.01% · PF 0.90 | 33 · 42% fav · avg +0.01% · PF 1.09 |
| Filtered + trailing exit | 7 · 43% fav · avg +0.17% · PF 1.79 | 4 · 0% fav · avg -0.28% · PF 0.00 |

## WTI Crude Oil

4251 candles, 2023-10-01 → 2026-07-13, split at 2025-09-12

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 13 · 31% fav · avg -0.07% · PF 0.88 | 4 · 50% fav · avg -0.66% · PF 0.32 |
| Unfiltered baseline | 61 · 36% fav · avg +0.20% · PF 1.47 | 27 · 44% fav · avg -0.27% · PF 0.69 |
| Filtered + trailing exit | 13 · 31% fav · avg -0.09% · PF 0.88 | 4 · 25% fav · avg -0.81% · PF 0.50 |

## Alternative entry families (pooled)

| Strategy | Train | Validate | Verdict |
|---|---|---|---|
| Donchian-55 breakout, fixed exits | 912 · 39% fav · avg +0.11% · PF 1.14 | 372 · 38% fav · avg +0.12% · PF 1.18 | ✅ positive in BOTH periods |
| Donchian-55 breakout, trailing exits | 912 · 37% fav · avg +0.26% · PF 1.28 | 372 · 37% fav · avg +0.41% · PF 1.47 | ✅ positive in BOTH periods |
| Funding-extreme mean reversion, fixed | 0 signals | 58 · 36% fav · avg -0.09% · PF 0.90 | ❌ no out-of-sample edge |
| Funding-extreme mean reversion, trailing | 0 signals | 58 · 45% fav · avg +0.22% · PF 1.18 | ❌ no out-of-sample edge |
| **Breakout trailing, NET of per-market costs** | 912 · 36% fav · avg +0.19% · PF 1.20 | 372 · 37% fav · avg +0.34% · PF 1.37 | ✅ survives costs |

## Breakout + trailing, per market (net of that market's cost)

| Market | Cost | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|
| BTC / USD | 0.10% | 109 · 32% fav · avg -0.06% · PF 0.95 | 53 · 26% fav · avg -0.23% · PF 0.77 | ❌ no net edge |
| ETH / USD | 0.10% | 109 · 42% fav · avg +0.93% · PF 1.74 | 44 · 39% fav · avg +0.31% · PF 1.23 | ✅ net edge |
| SOL / USD | 0.10% | 112 · 42% fav · avg +0.36% · PF 1.18 | 50 · 34% fav · avg -0.22% · PF 0.88 | ❌ no net edge |
| XRP / USD | 0.10% | 95 · 35% fav · avg +0.55% · PF 1.29 | 45 · 40% fav · avg +1.09% · PF 1.83 | ✅ net edge |
| XAU / USD · Gold | 0.05% | 104 · 41% fav · avg +0.03% · PF 1.10 | 41 · 56% fav · avg +0.80% · PF 3.00 | ✅ net edge |
| US30 · Dow (DIA proxy) | 0.02% | 35 · 40% fav · avg +0.28% · PF 1.57 | 16 · 13% fav · avg -0.56% · PF 0.24 | ❌ no net edge |
| NAS100 · Nasdaq (QQQ proxy) | 0.02% | 36 · 44% fav · avg +0.30% · PF 1.55 | 14 · 57% fav · avg +1.07% · PF 3.58 | ✅ net edge |
| SPX500 · S&P (SPY proxy) | 0.02% | 41 · 46% fav · avg +0.32% · PF 1.81 | 16 · 31% fav · avg -0.07% · PF 0.86 | ❌ no net edge |
| GBP / USD · Cable | 0.03% | 92 · 33% fav · avg -0.08% · PF 0.65 | 33 · 33% fav · avg -0.00% · PF 0.98 | ❌ no net edge |
| EUR / USD | 0.03% | 91 · 29% fav · avg -0.05% · PF 0.76 | 31 · 39% fav · avg +0.01% · PF 1.05 | ❌ no net edge |
| WTI Crude Oil | 0.05% | 88 · 25% fav · avg -0.44% · PF 0.55 | 29 · 34% fav · avg +1.73% · PF 2.55 | ❌ no net edge |

Per-market edge status published to edge-status.json — alerts for ❌ markets carry an informational-only warning.

## Donchian lookback grid (breakout + trailing, net of costs)

| Lookback | All markets: train | validate | Non-crypto only: train | validate |
|---|---|---|---|---|
| 20 | 1540 · 37% fav · avg +0.06% · PF 1.06 | 680 · 35% fav · avg -0.04% · PF 0.96 | 786 · 38% fav · avg +0.04% · PF 1.11 | 310 · 40% fav · avg +0.23% · PF 1.46 |
| 55 | 912 · 36% fav · avg +0.19% · PF 1.20 | 372 · 37% fav · avg +0.34% · PF 1.37 | 487 · 35% fav · avg -0.03% · PF 0.94 | 180 · 39% fav · avg +0.49% · PF 2.04 |
| 100 | 648 · 37% fav · avg +0.21% · PF 1.22 | 273 · 40% fav · avg +0.44% · PF 1.52 | 353 · 36% fav · avg +0.01% · PF 1.02 | 141 · 44% fav · avg +0.55% · PF 2.32 |

## Scalp feasibility: Donchian breakout on 1-hour candles

Same strategy, 4× faster timeframe, 10 markets over up to 2 years. The question is not accuracy — it is whether the per-trade move survives realistic per-market round-trip costs. Faster timeframes shrink the move; costs stay constant.

| Variant | Train (gross) | Validate (gross) | Train (net) | Validate (net) | Verdict |
|---|---|---|---|---|---|
| 1h breakout, fixed exits | 2221 · 37% fav · avg +0.05% · PF 1.14 | 907 · 36% fav · avg -0.00% · PF 0.99 | 2221 · 35% fav · avg -0.02% · PF 0.96 | 907 · 34% fav · avg -0.07% · PF 0.82 | ❌ not viable net of costs |
| 1h breakout, trailing exits | 2221 · 38% fav · avg +0.03% · PF 1.05 | 905 · 38% fav · avg +0.04% · PF 1.09 | 2221 · 36% fav · avg -0.04% · PF 0.92 | 905 · 36% fav · avg -0.03% · PF 0.94 | ❌ not viable net of costs |

## AI meta-label experiment

A logistic model trained on the 534 train-period baseline signals (features: side, RSI, ADX, volume ratio, trend distance, ATR%) predicts the probability a signal ends favorable. Judged on the 271 untouched validate-period signals.

| Threshold | Train (kept signals) | Validate (kept signals) |
|---|---|---|
| p ≥ 0.5 | 59 · 53% fav · avg +0.10% · PF 1.12 | 39 · 44% fav · avg +0.05% · PF 1.08 |
| p ≥ 0.55 | 9 · 67% fav · avg -0.35% · PF 0.70 | 22 · 50% fav · avg +0.23% · PF 1.41 |
| p ≥ 0.6 | 0 signals | 22 · 50% fav · avg +0.23% · PF 1.41 |
| p ≥ 0.65 | 0 signals | 22 · 50% fav · avg +0.23% · PF 1.41 |

**Verdict: ❌ does not pass out-of-sample** — the model is NOT published or used. Train-period fit did not survive on unseen data.

## Overall (all markets pooled)

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 101 · 34% fav · avg -0.02% · PF 0.97 | 39 · 44% fav · avg -0.29% · PF 0.73 |
| Unfiltered baseline | 534 · 41% fav · avg +0.13% · PF 1.20 | 271 · 42% fav · avg -0.04% · PF 0.94 |
| Filtered + trailing exit | 101 · 38% fav · avg -0.03% · PF 0.96 | 38 · 34% fav · avg +0.00% · PF 1.00 |

### Verdicts (by average move per signal)

- **Filters vs baseline**: train worse, validate worse → ❌ does NOT hold up out-of-sample
- **Trailing exit vs fixed exit**: train worse, validate better → ⚠️ validate-only (weak evidence)

_Educational research, not financial advice. Past performance does not predict future results._
