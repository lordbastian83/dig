# Live data — how the desk gets real market data

The desk reads all market data through one **provider chain** (`data/gateway.py`).
For each `(ticker, slice)` it walks the chain and takes the first provider that
both *supports* the ticker and *returns* the slice. A synthetic provider anchors
the chain, so there is always an answer and the desk never crashes on a flaky
feed — missing data lowers conviction instead.

```
equities (AAPL)      openbb (if OPENBB_PAT) → yfinance → synthetic
crypto  (BTC_USDT)   cryptocom → synthetic
```

Routing is automatic: providers declare which tickers they support
(`supports()`), so a crypto pair (`BTC_USDT`) skips the equity providers and a
stock skips the crypto one. No per-ticker config needed.

## Providers

| Provider | Class | Serves | Key? |
|---|---|---|---|
| **Crypto.com** | `CryptoComProvider` | crypto `technical`, `flow` | none (public REST) |
| **Yahoo Finance** | `YFinanceProvider` | equity: all 7 slices | none |
| **OpenBB** | `OpenBBProvider` | equity: all 7 slices (premium) | `OPENBB_PAT` |
| **Synthetic** | `SyntheticProvider` | everything (offline floor) | none |

Every provider returns the **same slice shapes** (defined by the synthetic
provider and the indicator engine), so downstream agents are indifferent to which
venue answered. The provider that answered is stamped into each slice as
`_source`, and surfaced on the audit via `DataGateway.provider_for()`.

## Indicators are computed once, centrally

`data/indicators.py` holds the math — SMA, EMA (SMA-seeded), **Wilder RSI**,
**Wilder ATR**, returns, annualized realized vol. Every provider that returns
candles runs them through `snapshot_from_candles()`, so a crypto pair's
`technical` slice is directly comparable to a stock's. The functions return
`None` (not an exception) when history is too short — a 50-bar sample yields a
valid SMA-50 but an honest `sma_200 = None`.

## Verify it yourself

```bash
# Real crypto indicators from the live Crypto.com REST endpoint:
python scripts/live_check.py BTC_USDT

# Equities live via yfinance:
python scripts/live_check.py AAPL
```

Sample output on live BTC_USDT 4h data:

```
=== BTC_USDT · technical · source=cryptocom ===
  last           62,671.30
  sma_50         61,077.81
  ema_20         62,554.26
  ema_50         61,077.81
  rsi_14         54.61
  atr_14           679.26
  realized_vol       0.3688
  momentum posture (EMA20 vs EMA50, price): BULLISH
```

### A note on this repo's CI

External market hosts are blocked by the sandbox egress policy, so the running
container here cannot open a socket to Yahoo or Crypto.com. The live path is
therefore verified in `tests/test_live_data.py` against a **real captured
Crypto.com sample** (`tests/fixtures/btc_usdt_4h.json`) with the HTTP transport
injected — the exact parse + indicator code that runs live, only the socket is
swapped. `python scripts/live_check.py BTC_USDT --fixture` reproduces the numbers
above from that sample. On any normal deploy (Azure, a laptop) drop `--fixture`
and it hits the network for real.

## Adding a provider

1. Implement `supports(ticker)` and `fetch(ticker, slice)` (see `providers/base.py`).
2. Return candles → `snapshot_from_candles(...)` for `technical`; a flat dict for
   other slices. Return `None` for slices you don't serve.
3. Register it in `gateway._REGISTRY` and add its name to `providers:` in
   `config/settings.yaml` at the position you want in the chain.
