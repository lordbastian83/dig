/* Market snapshot — pulls quotes, daily history and the earnings calendar
   from FMP and prints a compact desk summary (trend, RSI, ATR, 20-day range)
   to the job log and step summary. Read-only: no orders, no ledger writes.

   Env:
     FMP_API_KEY  required
     SYMBOLS      optional comma list (defaults to WATCHLIST below)
     OUT_FILE     optional JSON output path (default market-snapshot.json)
*/
import { writeFileSync, appendFileSync } from 'node:fs';

const FMP_KEY = process.env.FMP_API_KEY;
if (!FMP_KEY) { console.error('FMP_API_KEY is required for the snapshot'); process.exit(1); }

const WATCHLIST = [
  'CLUSD', 'BZUSD', 'NGUSD', 'GCUSD',          // WTI, Brent, nat gas, gold
  'USO', 'XLE', 'XOM', 'CVX', 'OXY',           // oil proxies + majors
  'SPY', 'QQQ', 'NVDA', 'TSLA',                // market
  'AMC', 'SNDL',                               // held in Saxo
];
const SYMBOLS = (process.env.SYMBOLS || '').split(',').map((s) => s.trim()).filter(Boolean);
const OUT_FILE = process.env.OUT_FILE || 'market-snapshot.json';
const day = (x) => new Date(x).toISOString().slice(0, 10);

// Same stable-then-v3 fallback as feeds.mjs: post-2025 keys only work on /stable/.
async function fmp(stablePath, v3Path) {
  const key = `apikey=${encodeURIComponent(FMP_KEY)}`;
  const urls = [
    `https://financialmodelingprep.com/stable/${stablePath}${stablePath.includes('?') ? '&' : '?'}${key}`,
    `https://financialmodelingprep.com/api/v3/${v3Path}${v3Path.includes('?') ? '&' : '?'}${key}`,
  ];
  const errors = [];
  for (const url of urls) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (Array.isArray(j)) return j;
      if (Array.isArray(j?.historical)) return j.historical;
      throw new Error((j && (j['Error Message'] || j.message)) || 'no data');
    } catch (e) { errors.push(e.message); }
  }
  throw new Error(errors.join(' | '));
}

function ema(values, n) {
  const k = 2 / (n + 1);
  let e = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return values.length >= n ? e : null;
}

function rsi(closes, n = 14) {
  if (closes.length <= n) return null;
  let up = 0, dn = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) up += d; else dn -= d;
  }
  up /= n; dn /= n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    up = (up * (n - 1) + Math.max(d, 0)) / n;
    dn = (dn * (n - 1) + Math.max(-d, 0)) / n;
  }
  return dn === 0 ? 100 : 100 - 100 / (1 + up / dn);
}

function atr(bars, n = 14) {
  if (bars.length <= n) return null;
  const tr = bars.slice(1).map((b, i) => Math.max(b.h - b.l, Math.abs(b.h - bars[i].c), Math.abs(b.l - bars[i].c)));
  let a = tr.slice(0, n).reduce((x, y) => x + y, 0) / n;
  for (let i = n; i < tr.length; i++) a = (a * (n - 1) + tr[i]) / n;
  return a;
}

async function analyse(symbol) {
  const from = day(Date.now() - 420 * 86400000);
  const rows = await fmp(
    `historical-price-eod/full?symbol=${encodeURIComponent(symbol)}&from=${from}`,
    `historical-price-full/${encodeURIComponent(symbol)}?from=${from}`,
  );
  const bars = rows.map((v) => ({ date: v.date, o: +v.open, h: +v.high, l: +v.low, c: +v.close, v: +(v.volume ?? 0) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (bars.length < 30) throw new Error(`only ${bars.length} bars`);
  const closes = bars.map((b) => b.c);
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const last20 = bars.slice(-21, -1);
  const e20 = ema(closes, 20), e50 = ema(closes, 50), e200 = ema(closes, 200);
  const a14 = atr(bars);
  let trend = 'mixed';
  if (e50 != null && last.c > e20 && e20 > e50) trend = 'up';
  else if (e50 != null && last.c < e20 && e20 < e50) trend = 'down';
  else if (e50 != null && e20 > e50) trend = 'up, pulling back';
  else if (e50 != null && e20 < e50) trend = 'down, bouncing';
  return {
    symbol,
    date: last.date,
    close: last.c,
    change_pct: prev ? ((last.c / prev.c) - 1) * 100 : null,
    ema20: e20, ema50: e50, ema200: e200,
    rsi14: rsi(closes),
    atr14: a14,
    atr_pct: a14 != null ? (a14 / last.c) * 100 : null,
    high20: Math.max(...last20.map((b) => b.h)),
    low20: Math.min(...last20.map((b) => b.l)),
    trend,
    recent: bars.slice(-10),
  };
}

const f = (x, d = 2) => (x == null || Number.isNaN(x) ? '—' : x.toFixed(d));

const results = [];
for (const symbol of SYMBOLS.length ? SYMBOLS : WATCHLIST) {
  try { results.push(await analyse(symbol)); }
  catch (e) { results.push({ symbol, error: e.message }); }
}

let earnings = [];
try {
  const from = day(Date.now()), to = day(Date.now() + 14 * 86400000);
  earnings = (await fmp(`earnings-calendar?from=${from}&to=${to}`, `earning_calendar?from=${from}&to=${to}`))
    .filter((e) => e.symbol && !e.symbol.includes('.'))
    .map((e) => ({ symbol: e.symbol, date: e.date, epsEstimated: e.epsEstimated ?? null, revenueEstimated: e.revenueEstimated ?? null }))
    .sort((a, b) => a.date.localeCompare(b.date));
} catch (e) { earnings = [{ error: e.message }]; }

const snapshot = { generated_at: new Date().toISOString(), results, earnings };
writeFileSync(OUT_FILE, JSON.stringify(snapshot, null, 2));

const lines = [
  `## Market snapshot ${snapshot.generated_at}`,
  '',
  '| Symbol | Date | Close | Chg% | Trend | EMA20 | EMA50 | EMA200 | RSI14 | ATR% | 20d low | 20d high |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...results.map((r) => (r.error
    ? `| ${r.symbol} | error: ${r.error} |||||||||||`
    : `| ${r.symbol} | ${r.date} | ${f(r.close)} | ${f(r.change_pct)} | ${r.trend} | ${f(r.ema20)} | ${f(r.ema50)} | ${f(r.ema200)} | ${f(r.rsi14, 1)} | ${f(r.atr_pct)} | ${f(r.low20)} | ${f(r.high20)} |`)),
  '',
  `### Earnings, next 14 days (${earnings.length})`,
  '',
  ...earnings.slice(0, 150).map((e) => (e.error ? `- error: ${e.error}` : `- ${e.date} ${e.symbol} (EPS est ${e.epsEstimated ?? '—'})`)),
];
const md = lines.join('\n');
console.log(md);
console.log('\nSNAPSHOT_JSON_BEGIN');
console.log(JSON.stringify({ ...snapshot, earnings: earnings.slice(0, 150) }));
console.log('SNAPSHOT_JSON_END');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
