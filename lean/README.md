# LordBastian Signals on QuantConnect Lean

`lordbastian_signals.py` is a faithful port of this project's **funded**
rule set to [QuantConnect Lean](https://github.com/QuantConnect/Lean) —
daily swing-55 longs (2×ATR stop, 3×ATR trail, 24-day window) on all
eight markets, and 4h breakout-55 longs on the markets that kept a net
edge out-of-sample (Gold, NAS100, SPX500), with edge-weighted sizing
(1.25% / 1.0%) and the 3-position cap.

## Why this exists

Independent cross-validation. The home pipeline validated these rules
walk-forward on its own data (see `research-report.md` on the
`budsignal-data` branch). QuantConnect runs the same rules on a
completely different data source (Oanda CFD/forex, Bitfinex crypto,
minute-level, with modeled spreads and realistic fills). If the edge
only shows up on one data source, that is evidence against the edge —
and we want to know.

## How to run it (free)

1. Create a free account at quantconnect.com
2. Create New Algorithm → Python
3. Replace the template with `lordbastian_signals.py`
4. Backtest

Compare against the home pipeline's validation numbers (swing-55 longs:
≈ +2%/trade net, PF ≈ 2.6 in the validate period). Expect differences —
different data, different fills, QC's spread models — the question is
whether the SIGN and rough magnitude of the edge survive, not whether
the numbers match exactly.

## What is deliberately not here

Shorts (failed side-split validation), the cross stream (never passed),
the 1h scalp (thin, alert-only), pyramiding (tested 2026-09-17, failed).
This port trades exactly what the desk funds — nothing else.

## Why the Lean engine itself is not vendored into this repo

Lean is a ~500 MB C#/.NET framework that needs its own runtime, docker
images and data subscriptions; nothing in this repo executes it. The
strategy file is the interface: paste it into QC's cloud (or run it via
`lean-cli` locally if you install docker) and the engine is theirs to
host. Educational tool, not financial advice.
