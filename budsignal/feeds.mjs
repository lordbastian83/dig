/* BudSignal data feeds for Node scripts (notify.mjs, track.mjs) — mirrors
   the browser's fetch order: Binance -> Coinbase for crypto, FMP for
   metals/indices/FX. */

export const CANDLE_LIMIT = 1000;

export const ASSETS = {
  BTC:    { kind: 'crypto', pair: 'BTC / USD',        binance: 'BTCUSDT',  kraken: 'XBTUSD', fmp: 'BTCUSD' },
  ETH:    { kind: 'crypto', pair: 'ETH / USD',        binance: 'ETHUSDT',  kraken: 'ETHUSD', fmp: 'ETHUSD' },
  SOL:    { kind: 'crypto', pair: 'SOL / USD',        binance: 'SOLUSDT',  kraken: 'SOLUSD', fmp: 'SOLUSD' },
  XRP:    { kind: 'crypto', pair: 'XRP / USD',        binance: 'XRPUSDT',  kraken: 'XRPUSD', fmp: 'XRPUSD' },
  GOLD:   { kind: 'market', pair: 'XAU / USD · Gold',   fmp: 'XAUUSD' },
  US30:   { kind: 'market', pair: 'US30 · Dow Jones',   fmp: '^DJI' },
  NAS100: { kind: 'market', pair: 'NAS100 · Nasdaq 100', fmp: '^NDX' },
  SPX500: { kind: 'market', pair: 'SPX500 · S&P 500',   fmp: '^GSPC' },
  GBPUSD: { kind: 'market', pair: 'GBP / USD · Cable',  fmp: 'GBPUSD' },
  EURUSD: { kind: 'market', pair: 'EUR / USD',          fmp: 'EURUSD' },
  OIL:    { kind: 'market', pair: 'WTI Crude Oil',      fmp: 'CLUSD' },
};

async function fetchBinance(host, symbol) {
  const r = await fetch(
    `https://${host}/api/v3/klines?symbol=${symbol}&interval=4h&limit=${CANDLE_LIMIT}`,
    { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${host} HTTP ${r.status}`);
  const rows = await r.json();
  return rows.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
}

// Kraken: native 4h (240-minute) candles, no key, not geo-blocked from US
// runners, up to 720 rows (~120 days). Row: [t, o, h, l, c, vwap, vol, count].
async function fetchKraken(pairCode) {
  const r = await fetch(
    `https://api.kraken.com/0/public/OHLC?pair=${pairCode}&interval=240`,
    { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Kraken HTTP ${r.status}`);
  const j = await r.json();
  if (j.error?.length) throw new Error(`Kraken: ${j.error[0]}`);
  const key = Object.keys(j.result).find((k) => k !== 'last');
  return j.result[key].map((k) => ({ t: k[0] * 1000, o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[6] }));
}

// FMP: keys issued after the 2025 API revamp only work on /stable/ endpoints
// (legacy /api/v3/ returns 403 for them), while old keys are the reverse — so
// try stable first and fall back to v3.
export async function fmpChart(symbol, fromT, toT, fmpKey) {
  const day = (x) => new Date(x).toISOString().slice(0, 10);
  const range = `from=${day(fromT)}&to=${day(toT)}&apikey=${encodeURIComponent(fmpKey)}`;
  const urls = [
    `https://financialmodelingprep.com/stable/historical-chart/4hour?symbol=${encodeURIComponent(symbol)}&${range}`,
    `https://financialmodelingprep.com/api/v3/historical-chart/4hour/${encodeURIComponent(symbol)}?${range}`,
  ];
  const errors = [];
  for (const url of urls) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (!Array.isArray(j)) throw new Error((j && (j['Error Message'] || j.message)) || 'no data');
      return j.map((v) => ({
        t: Date.parse(v.date.replace(' ', 'T') + 'Z'),
        o: +v.open, h: +v.high, l: +v.low, c: +v.close,
        v: v.volume != null ? +v.volume : 0,
      })).sort((a, b) => a.t - b.t);
    } catch (e) { errors.push(e.message); }
  }
  throw new Error(`FMP ${symbol}: ${errors.join(' | ')}`);
}

async function fetchFmp(symbol, fmpKey) {
  const candles = await fmpChart(symbol, Date.now() - 170 * 86400000, Date.now(), fmpKey);
  if (!candles.length) throw new Error(`FMP ${symbol}: empty`);
  return candles.slice(-CANDLE_LIMIT);
}

export async function fetchCandles(asset, fmpKey) {
  const cfg = ASSETS[asset];
  if (cfg.kind === 'market') {
    if (!fmpKey) throw new Error('no FMP_API_KEY — skipping');
    return fetchFmp(cfg.fmp, fmpKey);
  }
  // Binance geo-blocks US IPs (where GitHub runners live), so chain through
  // Binance.US and Kraken, then FMP if a key is available.
  const attempts = [
    () => fetchBinance('api.binance.com', cfg.binance),
    () => fetchBinance('api.binance.us', cfg.binance),
    () => fetchKraken(cfg.kraken),
  ];
  if (fmpKey) attempts.push(() => fetchFmp(cfg.fmp, fmpKey));
  const errors = [];
  for (const attempt of attempts) {
    try { return await attempt(); } catch (e) { errors.push(e.message); }
  }
  throw new Error(errors.join(' | '));
}

// Deterministic random walk — offline testing only.
export function demoCandles(basePrice, seed) {
  const CANDLE_MS = 4 * 3600 * 1000;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const out = [];
  // aligned to the 4h grid, like real candles — keeps timestamps stable
  // across runs so ledger dedupe can be exercised offline
  let t = Math.floor(Date.now() / CANDLE_MS) * CANDLE_MS - CANDLE_LIMIT * CANDLE_MS;
  let price = basePrice;
  let drift = 0;
  for (let i = 0; i < CANDLE_LIMIT; i++) {
    if (i % 40 === 0) drift = (rand() - 0.5) * 0.004;
    const o = price;
    const shock = (rand() - 0.5) * 0.02 + drift;
    const c = o * (1 + shock);
    const h = Math.max(o, c) * (1 + rand() * 0.006);
    const l = Math.min(o, c) * (1 - rand() * 0.006);
    out.push({ t, o, h, l, c, v: 800 + rand() * 1200 });
    price = c;
    t += CANDLE_MS;
  }
  return out;
}
