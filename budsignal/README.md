# BudSignal

A rules-based swing-signal dashboard for crypto, gold, indices and FX, inspired
by budsignal.io. Static, dependency-free web app — no build step, no backend,
no accounts.

## What it does

- **Live dashboard** — 4-hour candlestick chart with EMA 20/50 overlays,
  crosshair tooltip, and signal markers, plus RSI, ADX, ATR, and volume
  readouts. Asset tabs: BTC, ETH, SOL, XRP, Gold (XAU/USD), US30 (Dow Jones),
  GBP/USD (cable).
- **Signal engine** — long/short signals from a fixed, published rule set:
  EMA 20/50 cross, gated by the 200-EMA higher-timeframe trend and an
  ADX ≥ 20 chop filter, RSI band filter, ATR-scaled stop (1.5×) and target
  (2×), one-candle (4-hour) entry window.
- **Honest track record** — the same rules are replayed over the loaded history
  in the browser on every visit, so the win rate and signal table are computed,
  never curated. An unfiltered EMA-cross baseline is computed over the same
  span so the value of the filters is measured, not asserted.

## Data

All fetches happen client-side:

- **Crypto** — Binance (4h klines) → Coinbase Exchange fallback. No key needed.
- **Gold / US30 / GBP/USD** — [Twelve Data](https://twelvedata.com) `time_series`
  API. Needs a free API key, entered in the dashboard and stored only in the
  browser's localStorage. Note: the free tier covers FX and metals; index data
  (`DJI`) may require a paid plan — if a symbol is rejected, the app falls back
  to demo data and says so.
- **Fallback** — an embedded deterministic demo dataset (clearly labeled) so
  the app still demonstrates itself offline.

## Running locally

It's a static site — open `index.html` directly, or serve the directory:

```sh
cd budsignal
python3 -m http.server 8080
# then open http://localhost:8080
```

## Hosting

A GitHub Actions workflow (`.github/workflows/budsignal-pages.yml`) deploys
this directory to GitHub Pages on every push to `master` that touches
`budsignal/`. One-time setup: repo **Settings → Pages → Source → GitHub
Actions**. The site then lives at `https://<user>.github.io/<repo>/`.

Because it's plain static files, it also drops into Netlify, Vercel, or
Cloudflare Pages unchanged (publish directory: `budsignal`).

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
