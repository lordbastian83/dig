# BudSignal

A rules-based Bitcoin swing-signal dashboard, inspired by budsignal.io. Static,
dependency-free web app — no build step, no backend, no accounts.

## What it does

- **Live dashboard** — BTC/USD 4-hour candlestick chart with EMA 20/50 overlays,
  crosshair tooltip, and signal markers, plus RSI, ATR, and volume readouts.
- **Signal engine** — long/short signals from a fixed, published rule set:
  EMA 20/50 cross, RSI band filter, ATR-scaled stop (1.5×) and target (2×),
  one-candle (4-hour) entry window.
- **Honest track record** — the same rules are replayed over the loaded history
  in the browser on every visit, so the win rate and signal table are computed,
  never curated.

## Data

Candles are fetched client-side from public exchange APIs, in order of
preference: Binance (BTC/USDT 4h klines) → Coinbase Exchange (BTC-USD 4h
candles) → an embedded deterministic demo dataset (clearly labeled) so the app
still demonstrates itself offline.

## Running

It's a static site — open `index.html` directly, or serve the directory:

```sh
cd budsignal
python3 -m http.server 8080
# then open http://localhost:8080
```

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure: hero, dashboard, current signal, methodology, track record |
| `styles.css` | Dark theme; colors follow a CVD-validated palette |
| `app.js` | Data fetch + fallbacks, indicators (EMA/RSI/ATR), signal engine, backtest, canvas chart |

## Disclaimer

BudSignal is an educational tool, **not financial advice**. Signals are
generated mechanically from public market data; past performance does not
predict future results.
