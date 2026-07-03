# LordBastian Signal Generator — walk-forward research

Generated 2026-07-03T20:05:58.573Z · 3y of 4h candles via FMP · train = first 70% of each market's history, validate = last 30% (out-of-sample).

A variant only counts as an improvement if it beats its comparator in **both** periods — train-only wins are fitted noise.

## BTC / USD

6638 candles, 2023-06-24 → 2026-07-03, split at 2025-08-06

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 14 · 21% fav · avg -0.54% · PF 0.46 | 2 · 0% fav · avg -0.85% · PF 0.00 |
| Unfiltered baseline | 72 · 39% fav · avg -0.14% · PF 0.85 | 36 · 31% fav · avg -0.20% · PF 0.69 |
| Filtered + trailing exit | 14 · 36% fav · avg -0.07% · PF 0.94 | 2 · 0% fav · avg -1.21% · PF 0.00 |

## ETH / USD

6638 candles, 2023-06-24 → 2026-07-03, split at 2025-08-06

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 11 · 36% fav · avg +0.22% · PF 1.29 | 8 · 38% fav · avg -1.02% · PF 0.53 |
| Unfiltered baseline | 66 · 45% fav · avg +0.13% · PF 1.15 | 38 · 42% fav · avg +0.11% · PF 1.11 |
| Filtered + trailing exit | 11 · 27% fav · avg -0.44% · PF 0.66 | 8 · 25% fav · avg -0.14% · PF 0.94 |

## SOL / USD

6638 candles, 2023-06-24 → 2026-07-03, split at 2025-08-06

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 12 · 42% fav · avg +0.82% · PF 2.50 | 7 · 71% fav · avg +0.64% · PF 1.60 |
| Unfiltered baseline | 72 · 53% fav · avg +0.55% · PF 1.47 | 35 · 54% fav · avg +0.26% · PF 1.25 |
| Filtered + trailing exit | 12 · 58% fav · avg +0.54% · PF 1.40 | 7 · 57% fav · avg +0.10% · PF 1.08 |

## XRP / USD

6521 candles, 2023-06-24 → 2026-07-03, split at 2025-08-11

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 11 · 18% fav · avg -0.93% · PF 0.36 | 5 · 40% fav · avg +0.28% · PF 1.50 |
| Unfiltered baseline | 78 · 38% fav · avg +0.02% · PF 1.01 | 30 · 40% fav · avg -0.11% · PF 0.88 |
| Filtered + trailing exit | 11 · 36% fav · avg -1.17% · PF 0.48 | 5 · 80% fav · avg +2.09% · PF 5.20 |

## XAU / USD · Gold

4643 candles, 2023-06-25 → 2026-07-03, split at 2025-08-08

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 20 · 30% fav · avg +0.09% · PF 1.44 | 3 · 33% fav · avg -1.45% · PF 0.20 |
| Unfiltered baseline | 62 · 39% fav · avg +0.13% · PF 1.57 | 17 · 41% fav · avg -0.51% · PF 0.46 |
| Filtered + trailing exit | 20 · 35% fav · avg +0.08% · PF 1.20 | 3 · 0% fav · avg -2.02% · PF 0.00 |

## US30 · Dow (DIA proxy)

1508 candles, 2023-06-26 → 2026-07-02, split at 2025-08-06

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 3 · 67% fav · avg +0.17% · PF 1.38 | 0 signals |
| Unfiltered baseline | 8 · 63% fav · avg +0.23% · PF 1.77 | 4 · 75% fav · avg +0.52% · PF 2.72 |
| Filtered + trailing exit | 3 · 67% fav · avg +0.63% · PF 2.13 | 0 signals |

## NAS100 · Nasdaq (QQQ proxy)

1507 candles, 2023-06-26 → 2026-07-02, split at 2025-08-06

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 1 · 100% fav · avg +0.88% · PF ∞ | 0 signals |
| Unfiltered baseline | 10 · 70% fav · avg +1.05% · PF 44.12 | 8 · 50% fav · avg +0.08% · PF 1.13 |
| Filtered + trailing exit | 1 · 100% fav · avg +3.55% · PF ∞ | 0 signals |

## SPX500 · S&P (SPY proxy)

1508 candles, 2023-06-26 → 2026-07-02, split at 2025-08-06

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 1 · 0% fav · avg -1.22% · PF 0.00 | 2 · 100% fav · avg +0.98% · PF ∞ |
| Unfiltered baseline | 8 · 50% fav · avg +0.18% · PF 1.50 | 7 · 57% fav · avg +0.19% · PF 1.50 |
| Filtered + trailing exit | 1 · 0% fav · avg -1.02% · PF 0.00 | 2 · 100% fav · avg +2.58% · PF ∞ |

## GBP / USD · Cable

4726 candles, 2023-06-25 → 2026-07-03, split at 2025-08-07

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 8 · 50% fav · avg +0.13% · PF 2.68 | 3 · 33% fav · avg -0.06% · PF 0.74 |
| Unfiltered baseline | 52 · 35% fav · avg -0.00% · PF 0.99 | 31 · 29% fav · avg -0.07% · PF 0.57 |
| Filtered + trailing exit | 8 · 13% fav · avg -0.19% · PF 0.04 | 3 · 33% fav · avg -0.12% · PF 0.37 |

## EUR / USD

4718 candles, 2023-06-26 → 2026-07-03, split at 2025-08-06

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 7 · 29% fav · avg -0.07% · PF 0.62 | 4 · 25% fav · avg -0.17% · PF 0.01 |
| Unfiltered baseline | 42 · 33% fav · avg -0.01% · PF 0.90 | 30 · 43% fav · avg +0.02% · PF 1.18 |
| Filtered + trailing exit | 7 · 43% fav · avg +0.17% · PF 1.79 | 4 · 0% fav · avg -0.28% · PF 0.00 |

## WTI Crude Oil

4215 candles, 2023-10-01 → 2026-07-03, split at 2025-09-08

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 13 · 31% fav · avg -0.07% · PF 0.88 | 4 · 50% fav · avg -0.66% · PF 0.32 |
| Unfiltered baseline | 61 · 36% fav · avg +0.20% · PF 1.47 | 27 · 44% fav · avg -0.27% · PF 0.69 |
| Filtered + trailing exit | 13 · 31% fav · avg -0.09% · PF 0.88 | 4 · 25% fav · avg -0.81% · PF 0.50 |

## AI meta-label experiment

A logistic model trained on the 531 train-period baseline signals (features: side, RSI, ADX, volume ratio, trend distance, ATR%) predicts the probability a signal ends favorable. Judged on the 263 untouched validate-period signals.

| Threshold | Train (kept signals) | Validate (kept signals) |
|---|---|---|
| p ≥ 0.5 | 12 · 17% fav · avg -2.78% · PF 0.09 | 4 · 0% fav · avg -1.27% · PF 0.00 |
| p ≥ 0.55 | 0 signals | 0 signals |
| p ≥ 0.6 | 0 signals | 0 signals |
| p ≥ 0.65 | 0 signals | 0 signals |

**Verdict: ❌ does not pass out-of-sample** — the model is NOT published or used. Train-period fit did not survive on unseen data.

## Overall (all markets pooled)

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 101 · 33% fav · avg -0.04% · PF 0.93 | 38 · 45% fav · avg -0.26% · PF 0.75 |
| Unfiltered baseline | 531 · 41% fav · avg +0.14% · PF 1.21 | 263 · 42% fav · avg -0.04% · PF 0.94 |
| Filtered + trailing exit | 101 · 37% fav · avg -0.08% · PF 0.92 | 38 · 37% fav · avg +0.05% · PF 1.04 |

### Verdicts (by average move per signal)

- **Filters vs baseline**: train worse, validate worse → ❌ does NOT hold up out-of-sample
- **Trailing exit vs fixed exit**: train worse, validate better → ⚠️ validate-only (weak evidence)

_Educational research, not financial advice. Past performance does not predict future results._
