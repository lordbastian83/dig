# BudSignal walk-forward research

Generated 2026-07-03T06:44:52.585Z · 3y of 4h candles via FMP · train = first 70% of each market's history, validate = last 30% (out-of-sample).

A variant only counts as an improvement if it beats its comparator in **both** periods — train-only wins are fitted noise.

## BTC / USD

6634 candles, 2023-06-24 → 2026-07-03, split at 2025-08-05

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 14 · 21% fav · avg -0.54% · PF 0.46 | 2 · 0% fav · avg -0.85% · PF 0.00 |
| Unfiltered baseline | 72 · 39% fav · avg -0.14% · PF 0.85 | 36 · 31% fav · avg -0.20% · PF 0.69 |
| Filtered + trailing exit | 14 · 36% fav · avg -0.07% · PF 0.94 | 2 · 0% fav · avg -1.21% · PF 0.00 |

## ETH / USD

6634 candles, 2023-06-24 → 2026-07-03, split at 2025-08-05

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 11 · 36% fav · avg +0.22% · PF 1.29 | 8 · 38% fav · avg -1.02% · PF 0.53 |
| Unfiltered baseline | 66 · 45% fav · avg +0.13% · PF 1.15 | 37 · 41% fav · avg +0.04% · PF 1.04 |
| Filtered + trailing exit | 11 · 27% fav · avg -0.44% · PF 0.66 | 8 · 25% fav · avg -0.14% · PF 0.94 |

## SOL / USD

6634 candles, 2023-06-24 → 2026-07-03, split at 2025-08-05

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 12 · 42% fav · avg +0.82% · PF 2.50 | 7 · 71% fav · avg +0.64% · PF 1.60 |
| Unfiltered baseline | 72 · 53% fav · avg +0.55% · PF 1.47 | 35 · 54% fav · avg +0.26% · PF 1.25 |
| Filtered + trailing exit | 12 · 58% fav · avg +0.54% · PF 1.40 | 7 · 57% fav · avg +0.10% · PF 1.08 |

## XRP / USD

6517 candles, 2023-06-24 → 2026-07-03, split at 2025-08-11

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 11 · 18% fav · avg -0.93% · PF 0.36 | 5 · 40% fav · avg +0.28% · PF 1.50 |
| Unfiltered baseline | 78 · 38% fav · avg +0.02% · PF 1.01 | 29 · 38% fav · avg -0.23% · PF 0.77 |
| Filtered + trailing exit | 11 · 36% fav · avg -1.17% · PF 0.48 | 5 · 80% fav · avg +2.09% · PF 5.20 |

## XAU / USD · Gold

4640 candles, 2023-06-25 → 2026-07-03, split at 2025-08-08

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 20 · 30% fav · avg +0.09% · PF 1.44 | 3 · 33% fav · avg -1.45% · PF 0.20 |
| Unfiltered baseline | 62 · 39% fav · avg +0.13% · PF 1.57 | 17 · 41% fav · avg -0.51% · PF 0.46 |
| Filtered + trailing exit | 20 · 35% fav · avg +0.08% · PF 1.20 | 3 · 0% fav · avg -2.02% · PF 0.00 |

## US30 · Dow Jones

Insufficient history (0 candles) — skipped.

## NAS100 · Nasdaq 100

Insufficient history (0 candles) — skipped.

## SPX500 · S&P 500

Insufficient history (0 candles) — skipped.

## GBP / USD · Cable

4722 candles, 2023-06-25 → 2026-07-03, split at 2025-08-06

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 8 · 50% fav · avg +0.13% · PF 2.68 | 3 · 33% fav · avg -0.06% · PF 0.74 |
| Unfiltered baseline | 52 · 35% fav · avg -0.00% · PF 0.99 | 31 · 29% fav · avg -0.07% · PF 0.57 |
| Filtered + trailing exit | 8 · 13% fav · avg -0.19% · PF 0.04 | 3 · 33% fav · avg -0.12% · PF 0.37 |

## EUR / USD

4714 candles, 2023-06-26 → 2026-07-03, split at 2025-08-06

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 7 · 29% fav · avg -0.07% · PF 0.62 | 4 · 25% fav · avg -0.17% · PF 0.01 |
| Unfiltered baseline | 42 · 33% fav · avg -0.01% · PF 0.90 | 30 · 43% fav · avg +0.02% · PF 1.18 |
| Filtered + trailing exit | 7 · 43% fav · avg +0.17% · PF 1.79 | 4 · 0% fav · avg -0.28% · PF 0.00 |

## WTI Crude Oil

4212 candles, 2023-10-01 → 2026-07-03, split at 2025-09-08

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 13 · 31% fav · avg -0.07% · PF 0.88 | 4 · 50% fav · avg -0.66% · PF 0.32 |
| Unfiltered baseline | 61 · 36% fav · avg +0.20% · PF 1.47 | 27 · 44% fav · avg -0.27% · PF 0.69 |
| Filtered + trailing exit | 13 · 31% fav · avg -0.09% · PF 0.88 | 4 · 25% fav · avg -0.81% · PF 0.50 |

## Overall (all markets pooled)

| Variant | Train | Validate |
|---|---|---|
| Filtered rules (fixed exit) | 96 · 31% fav · avg -0.04% · PF 0.93 | 36 · 42% fav · avg -0.33% · PF 0.71 |
| Unfiltered baseline | 505 · 40% fav · avg +0.12% · PF 1.17 | 242 · 40% fav · avg -0.09% · PF 0.88 |
| Filtered + trailing exit | 96 · 35% fav · avg -0.13% · PF 0.87 | 36 · 33% fav · avg -0.09% · PF 0.93 |

### Verdicts (by average move per signal)

- **Filters vs baseline**: train worse, validate worse → ❌ does NOT hold up out-of-sample
- **Trailing exit vs fixed exit**: train worse, validate better → ⚠️ validate-only (weak evidence)

_Educational research, not financial advice. Past performance does not predict future results._
