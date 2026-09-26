/* Opportunity scanner — ranks long and short setups across a broad US
   universe by combining three things:
     1. FMP daily prices  -> trend, momentum, breakouts, relative strength
     2. ORTEX short data  -> short-interest flow, borrow cost, days to cover
     3. A backtest of every setup over the same universe's own history, so
        each setup's score is weighted by its measured expectancy, not a guess
   Output: a ranked trade plan (trigger / stop / target / size in GBP) as
   markdown + JSON, optionally a Telegram digest. Read-only: never trades.

   Env:
     FMP_API_KEY      required
     ORTEX_API_KEY    optional; enables short-interest / borrow enrichment
     ORTEX_BUDGET     max tickers enriched per run (default 12, ~4.5 credits each)
     ACCOUNT_GBP      account size for sizing (default 1000)
     RISK_PCT         % of account risked per trade (default 1)
     HOLDINGS         comma list always reviewed (default AMC,SNDL)
     EXTRA_SYMBOLS    comma list added to the universe
     TOP_N            ideas per side in the report (default 10)
     OUT_JSON / OUT_MD  output paths (default opportunities.json / .md)
     TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (or STATE_FILE chats) -> digest
     SEND_TELEGRAM    '1' to send the digest (default off)
*/
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const FMP_KEY = process.env.FMP_API_KEY;
if (!FMP_KEY) { console.error('FMP_API_KEY is required'); process.exit(1); }
const ORTEX_KEY = process.env.ORTEX_API_KEY || '';
const num = (v, d) => (Number.isFinite(parseFloat(v)) && parseFloat(v) > 0 ? parseFloat(v) : d);
const ORTEX_BUDGET = Math.floor(num(process.env.ORTEX_BUDGET, 12));
const ACCOUNT_GBP = num(process.env.ACCOUNT_GBP, 1000);
const RISK_PCT = num(process.env.RISK_PCT, 1);
const TOP_N = Math.floor(num(process.env.TOP_N, 10));
const list = (s) => (s || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
const HOLDINGS = process.env.HOLDINGS != null ? list(process.env.HOLDINGS) : ['AMC', 'SNDL'];
const OUT_JSON = process.env.OUT_JSON || 'opportunities.json';
const OUT_MD = process.env.OUT_MD || 'opportunities.md';

// Liquid names across sectors plus the macro ETFs; movers and upcoming
// earnings are added dynamically each run.
const CORE = [
  // mega-cap tech / semis / growth
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'AMD', 'NFLX', 'ORCL', 'CRM', 'ADBE', 'INTC',
  'MU', 'QCOM', 'TSM', 'ARM', 'SMCI', 'PLTR', 'COIN', 'MSTR', 'HOOD', 'SHOP', 'UBER', 'ABNB', 'SNOW', 'NET',
  'CRWD', 'PANW', 'DELL', 'ANET',
  // financials
  'JPM', 'BAC', 'GS', 'MS', 'WFC', 'C', 'V', 'MA', 'PYPL', 'SOFI', 'SCHW',
  // energy
  'XOM', 'CVX', 'OXY', 'COP', 'SLB', 'HAL', 'DVN', 'EOG', 'MPC', 'VLO', 'PSX',
  // airlines / travel (oil-sensitive)
  'DAL', 'UAL', 'AAL', 'LUV', 'CCL', 'RCL', 'NCLH',
  // consumer
  'NKE', 'SBUX', 'MCD', 'WMT', 'COST', 'TGT', 'HD', 'LOW', 'DIS', 'LULU', 'KO', 'PEP',
  // healthcare
  'LLY', 'UNH', 'PFE', 'MRK', 'JNJ', 'ABBV', 'NVO', 'MRNA',
  // industrials / defence
  'BA', 'CAT', 'GE', 'DE', 'LMT', 'RTX',
  // high-beta retail favourites
  'GME', 'AMC', 'SNDL', 'RIVN', 'LCID', 'F', 'GM', 'RKLB',
  // ETFs: market, sectors, commodities, rates
  'SPY', 'QQQ', 'IWM', 'DIA', 'XLE', 'XLF', 'XLK', 'SMH', 'USO', 'UNG', 'GLD', 'SLV', 'TLT',
];
const MACRO = ['BZUSD', 'GCUSD', 'GBPUSD', '^FTSE', '^STOXX50E'];
const ETFS = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'XLE', 'XLF', 'XLK', 'SMH', 'USO', 'UNG', 'GLD', 'SLV', 'TLT']);

const day = (x) => new Date(x).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/* ---------------- data: FMP ---------------- */

// Post-2025 keys only work on /stable/, older keys only on /api/v3/.
async function fmp(stablePath, v3Path) {
  const key = `apikey=${encodeURIComponent(FMP_KEY)}`;
  const urls = [`https://financialmodelingprep.com/stable/${stablePath}`];
  if (v3Path) urls.push(`https://financialmodelingprep.com/api/v3/${v3Path}`);
  const errors = [];
  for (const base of urls) {
    const url = `${base}${base.includes('?') ? '&' : '?'}${key}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (r.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (Array.isArray(j)) return j;
        if (Array.isArray(j?.historical)) return j.historical;
        throw new Error((j && (j['Error Message'] || j.message)) || 'no data');
      } catch (e) { errors.push(e.message); break; }
    }
  }
  throw new Error(errors.join(' | ') || 'rate limited');
}

async function dailyBars(symbol) {
  const from = day(Date.now() - 1100 * 86400000); // ~3 years: enough trades per setup for stable stats
  const rows = await fmp(
    `historical-price-eod/full?symbol=${encodeURIComponent(symbol)}&from=${from}`,
    `historical-price-full/${encodeURIComponent(symbol)}?from=${from}`,
  );
  return rows
    .map((v) => ({ date: v.date, o: +v.open, h: +v.high, l: +v.low, c: +v.close, v: +(v.volume ?? 0) }))
    .filter((b) => b.c > 0 && b.h >= b.l)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function movers() {
  const out = new Set();
  for (const [s, v3] of [['most-actives', 'stock_market/actives'], ['biggest-gainers', 'stock_market/gainers'], ['biggest-losers', 'stock_market/losers']]) {
    try {
      for (const r of (await fmp(s, v3)).slice(0, 15)) {
        if (r.symbol && !r.symbol.includes('.') && +r.price >= 3) out.add(r.symbol.toUpperCase());
      }
    } catch (e) { console.log(`movers ${s}: ${e.message}`); }
  }
  return [...out];
}

async function earningsCalendar() {
  const from = day(Date.now()), to = day(Date.now() + 14 * 86400000);
  try {
    return (await fmp(`earnings-calendar?from=${from}&to=${to}`, `earning_calendar?from=${from}&to=${to}`))
      .filter((e) => e.symbol && !e.symbol.includes('.'))
      .map((e) => ({ symbol: e.symbol.toUpperCase(), date: e.date, eps: e.epsEstimated ?? null, rev: e.revenueEstimated ?? null }));
  } catch (e) { console.log(`earnings: ${e.message}`); return []; }
}

async function econCalendar() {
  const from = day(Date.now()), to = day(Date.now() + 7 * 86400000);
  try {
    return (await fmp(`economic-calendar?from=${from}&to=${to}`, `economic_calendar?from=${from}&to=${to}`))
      .filter((ev) => {
        const impact = String(ev.impact || ev.importance || '').toLowerCase();
        const cur = String(ev.currency || ev.country || '').toUpperCase();
        return (impact === 'high' || impact === '3') && (cur === 'USD' || cur === 'US');
      })
      .map((ev) => ({ date: String(ev.date), event: ev.event, estimate: ev.estimate ?? null, previous: ev.previous ?? null }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (e) { console.log(`econ: ${e.message}`); return []; }
}

/* ---------------- data: ORTEX ---------------- */

async function ortex(path) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`https://api.ortex.com/api/v1/${path}`, {
      headers: { 'Ortex-Api-Key': ORTEX_KEY, accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (r.status === 429) { await sleep(3000 * (attempt + 1)); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const rows = j.rows || j.data || (Array.isArray(j) ? j : null);
    if (!rows) throw new Error('unexpected ORTEX response');
    return rows;
  }
  throw new Error('rate limited');
}

async function shortFlow(symbol, avgVol20) {
  const res = { symbol };
  try {
    const si = (await ortex(`stock/us/${encodeURIComponent(symbol)}/short_interest?from_date=${day(Date.now() - 21 * 86400000)}`))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (si.length) {
      const last = si[si.length - 1], first = si[0];
      res.siPctFF = +last.shortInterestPcFreeFloat;
      res.siShares = +last.shortInterestShares;
      res.siChangePct = first.shortInterestShares > 0 ? ((last.shortInterestShares / first.shortInterestShares) - 1) * 100 : null;
      res.dtc = avgVol20 > 0 ? res.siShares / avgVol20 : null;
      res.siDate = last.date;
    }
  } catch (e) { res.siError = e.message; }
  await sleep(1200);
  try {
    const ctb = (await ortex(`stock/us/${encodeURIComponent(symbol)}/ctb/all?from_date=${day(Date.now() - 10 * 86400000)}`))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (ctb.length) {
      const v = ctb[ctb.length - 1];
      res.ctb = +(v.costToBorrowAll ?? v.costToBorrow ?? v.ctb ?? v.value);
    }
  } catch (e) { res.ctbError = e.message; }
  await sleep(1200);
  // ORTEX's own generated signals: the composite Stock Score (growth /
  // momentum / quality / value, 0-100) and the Short Score (squeeze pressure).
  try {
    const sc = (await ortex(`stock/us/${encodeURIComponent(symbol)}/stock_scores?from_date=${day(Date.now() - 10 * 86400000)}`))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (sc.length) {
      const v = sc[sc.length - 1];
      res.stockScore = +v.total; res.momentum = +v.momentum; res.growth = +v.growth; res.quality = +v.quality; res.value = +v.value;
      res.stockScoreChange = sc.length > 1 ? +v.total - +sc[0].total : 0;
    }
  } catch (e) { res.scoreError = e.message; }
  await sleep(1200);
  try {
    const ss = (await ortex(`stock/us/${encodeURIComponent(symbol)}/short_score?from_date=${day(Date.now() - 10 * 86400000)}`))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (ss.length) res.shortScore = +ss[ss.length - 1].score;
  } catch (e) { res.shortScoreError = e.message; }
  await sleep(1200);
  return res;
}

/* ---------------- indicators (full arrays, index-aligned) ---------------- */

function emaArr(v, n) {
  const out = new Array(v.length).fill(null);
  if (v.length < n) return out;
  let e = v.slice(0, n).reduce((a, b) => a + b, 0) / n;
  out[n - 1] = e;
  const k = 2 / (n + 1);
  for (let i = n; i < v.length; i++) { e = v[i] * k + e * (1 - k); out[i] = e; }
  return out;
}

function rsiArr(c, n = 14) {
  const out = new Array(c.length).fill(null);
  if (c.length <= n) return out;
  let up = 0, dn = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d > 0) up += d; else dn -= d; }
  up /= n; dn /= n;
  out[n] = dn === 0 ? 100 : 100 - 100 / (1 + up / dn);
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    up = (up * (n - 1) + Math.max(d, 0)) / n;
    dn = (dn * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = dn === 0 ? 100 : 100 - 100 / (1 + up / dn);
  }
  return out;
}

function trArr(b) {
  return b.map((x, i) => (i === 0 ? x.h - x.l : Math.max(x.h - x.l, Math.abs(x.h - b[i - 1].c), Math.abs(x.l - b[i - 1].c))));
}

function wilder(v, n, start = 1) {
  const out = new Array(v.length).fill(null);
  if (v.length < start + n) return out;
  let s = 0;
  for (let i = start; i < start + n; i++) s += v[i];
  let a = s / n;
  out[start + n - 1] = a;
  for (let i = start + n; i < v.length; i++) { a = (a * (n - 1) + v[i]) / n; out[i] = a; }
  return out;
}

function adxArr(b, n = 14) {
  const pdm = b.map((x, i) => (i === 0 ? 0 : (x.h - b[i - 1].h > b[i - 1].l - x.l && x.h - b[i - 1].h > 0 ? x.h - b[i - 1].h : 0)));
  const mdm = b.map((x, i) => (i === 0 ? 0 : (b[i - 1].l - x.l > x.h - b[i - 1].h && b[i - 1].l - x.l > 0 ? b[i - 1].l - x.l : 0)));
  const atr = wilder(trArr(b), n), p = wilder(pdm, n), m = wilder(mdm, n);
  const dx = b.map((_, i) => {
    if (atr[i] == null || !atr[i]) return null;
    const pdi = (100 * p[i]) / atr[i], mdi = (100 * m[i]) / atr[i];
    return pdi + mdi === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / (pdi + mdi);
  });
  const firstDx = dx.findIndex((x) => x != null);
  const out = new Array(b.length).fill(null);
  if (firstDx < 0 || b.length < firstDx + n) return out;
  let a = dx.slice(firstDx, firstDx + n).reduce((s, x) => s + x, 0) / n;
  out[firstDx + n - 1] = a;
  for (let i = firstDx + n; i < b.length; i++) { a = (a * (n - 1) + dx[i]) / n; out[i] = a; }
  return out;
}

function indicators(bars) {
  const c = bars.map((b) => b.c);
  return {
    e20: emaArr(c, 20), e50: emaArr(c, 50), e200: emaArr(c, 200),
    rsi: rsiArr(c), atr: wilder(trArr(bars), 14), adx: adxArr(bars),
  };
}

/* ---------------- setups ---------------- */

const SETUPS = {
  breakout_long: { side: 'long', label: '20-day breakout', base: 20 },
  near_breakout_long: { side: 'long', label: 'Coiling under 20-day high', base: 16 },
  pullback_long: { side: 'long', label: 'Pullback in uptrend', base: 18 },
  oversold_long: { side: 'long', label: 'Oversold in long-term uptrend', base: 10 },
  breakdown_short: { side: 'short', label: '20-day breakdown', base: 20 },
  near_breakdown_short: { side: 'short', label: 'Sagging onto 20-day low', base: 16 },
  rally_short: { side: 'short', label: 'Bear-market rally into resistance', base: 18 },
  overbought_short: { side: 'short', label: 'Overbought in long-term downtrend', base: 10 },
};

// Evaluates every setup on bar i using only data up to and including i.
// 'market' entries fill at the next open; 'stop' entries need price to trade
// through the trigger within 3 sessions or the idea is void.
function detect(bars, ind, i) {
  const b = bars[i];
  const e20 = ind.e20[i], e50 = ind.e50[i], e200 = ind.e200[i], rsi = ind.rsi[i], atr = ind.atr[i];
  if ([e20, e50, e200, rsi, atr].some((x) => x == null) || i < 21 || ind.e50[i - 10] == null || !atr) return [];
  const prior = bars.slice(i - 20, i);
  const hi20 = Math.max(...prior.map((x) => x.h)), lo20 = Math.min(...prior.map((x) => x.l));
  const avgVol = prior.reduce((s, x) => s + x.v, 0) / 20;
  const volRatio = avgVol > 0 ? b.v / avgVol : 1;
  const slope = e50 - ind.e50[i - 10];
  const up = b.c > e50 && e50 > e200 && slope > 0;
  const down = b.c < e50 && e50 < e200 && slope < 0;
  const found = [];
  const add = (key, entryType, trigger, stop) => {
    const side = SETUPS[key].side;
    const risk = side === 'long' ? trigger - stop : stop - trigger;
    if (!(risk > 0)) return;
    const target = side === 'long' ? trigger + 2 * risk : trigger - 2 * risk;
    found.push({ key, side, entryType, trigger, stop, target, risk, hi20, lo20, volRatio });
  };
  // longs, in priority order — one per side
  if (up && b.c > hi20 && volRatio >= 1.2) add('breakout_long', 'market', b.c, b.c - 1.5 * atr);
  else if (up && b.c <= hi20 && hi20 - b.c <= 0.75 * atr && rsi >= 50 && rsi <= 72) {
    const t = hi20 + 0.05 * atr; add('near_breakout_long', 'stop', t, t - 1.5 * atr);
  } else if (e20 > e50 && e50 > e200 && slope > 0 && b.c < e20 + 0.25 * atr && b.c > e50 - 0.5 * atr && rsi >= 35 && rsi <= 52) {
    const t = b.h + 0.02 * atr; add('pullback_long', 'stop', t, Math.min(t - 1.5 * atr, b.l - 0.25 * atr));
  } else if (b.c > e200 && rsi < 30) {
    const t = b.h + 0.02 * atr; add('oversold_long', 'stop', t, t - 1.5 * atr);
  }
  // shorts
  if (down && b.c < lo20 && volRatio >= 1.2) add('breakdown_short', 'market', b.c, b.c + 1.5 * atr);
  else if (down && b.c >= lo20 && b.c - lo20 <= 0.75 * atr && rsi <= 50 && rsi >= 28) {
    const t = lo20 - 0.05 * atr; add('near_breakdown_short', 'stop', t, t + 1.5 * atr);
  } else if (e20 < e50 && e50 < e200 && slope < 0 && b.c > e20 - 0.25 * atr && b.c < e50 + 0.5 * atr && rsi >= 48 && rsi <= 65) {
    const t = b.l - 0.02 * atr; add('rally_short', 'stop', t, Math.max(t + 1.5 * atr, b.h + 0.25 * atr));
  } else if (b.c < e200 && rsi > 70) {
    const t = b.l - 0.02 * atr; add('overbought_short', 'stop', t, t + 1.5 * atr);
  }
  return found;
}

// Plays a setup forward bar by bar. Stop wins ties (conservative); gaps
// through a level fill at the open. Returns R multiple and exit index.
function simulate(bars, s, i, maxBars = 20) {
  const long = s.side === 'long';
  let k = i + 1, entry;
  if (s.entryType === 'market') {
    if (k >= bars.length) return null;
    entry = bars[k].o;
  } else {
    for (; k <= i + 3 && k < bars.length; k++) {
      const x = bars[k];
      if (long ? x.h >= s.trigger : x.l <= s.trigger) { entry = long ? Math.max(s.trigger, x.o) : Math.min(s.trigger, x.o); break; }
    }
    if (entry == null) return null;
  }
  const risk = s.risk;
  const stop = long ? entry - risk : entry + risk;
  const target = long ? entry + 2 * risk : entry - 2 * risk;
  for (let j = k; j < Math.min(bars.length, k + maxBars); j++) {
    const x = bars[j];
    const hitStop = long ? x.l <= stop : x.h >= stop;
    const hitTarget = j > k && (long ? x.h >= target : x.l <= target);
    if (hitStop) {
      const fill = j > k && (long ? x.o < stop : x.o > stop) ? x.o : stop;
      return { r: ((long ? fill - entry : entry - fill) / risk), exit: j };
    }
    if (hitTarget) {
      const fill = long ? Math.max(target, x.o) : Math.min(target, x.o);
      return { r: ((long ? fill - entry : entry - fill) / risk), exit: j };
    }
  }
  const last = bars[Math.min(bars.length - 1, k + maxBars - 1)];
  if (k + maxBars - 1 >= bars.length) return null; // still open: don't count
  return { r: (long ? last.c - entry : entry - last.c) / risk, exit: k + maxBars - 1 };
}

/* ---------------- main ---------------- */

const started = Date.now();
const [moverSyms, earnings, econ] = await Promise.all([movers(), earningsCalendar(), econCalendar()]);
const earningsBy = new Map();
for (const e of earnings) if (!earningsBy.has(e.symbol) || e.date < earningsBy.get(e.symbol).date) earningsBy.set(e.symbol, e);
const bigEarnings = earnings.filter((e) => (e.rev ?? 0) >= 2e9).map((e) => e.symbol);
const universe = [...new Set([...CORE, ...HOLDINGS, ...list(process.env.EXTRA_SYMBOLS), ...moverSyms, ...bigEarnings])];

const data = new Map();
const failures = [];
const queue = [...universe, ...MACRO];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) {
    const s = queue.shift();
    try {
      const bars = await dailyBars(s);
      if (bars.length >= 230) data.set(s, { bars, ind: indicators(bars) });
      else failures.push(`${s}: ${bars.length} bars`);
    } catch (e) { failures.push(`${s}: ${e.message}`); }
  }
}));

const spy = data.get('SPY');
if (!spy) { console.error('SPY history unavailable — cannot compute regime'); process.exit(1); }
const riskOnByDate = new Map();
spy.bars.forEach((b, i) => {
  const { e20, e50, e200 } = spy.ind;
  if (e200[i] != null) riskOnByDate.set(b.date, b.c > e200[i] && e20[i] > e50[i]);
});
const spyN = spy.bars.length - 1;
const regime = riskOnByDate.get(spy.bars[spyN].date) ? 'risk-on' : 'risk-off';
const ret = (bars, n) => (bars.length > n ? (bars[bars.length - 1].c / bars[bars.length - 1 - n].c - 1) * 100 : null);
const spyRet20 = ret(spy.bars, 20);

// Backtest: every setup on every symbol over the history we hold, split by
// the market regime on the signal day.
const stats = {};
for (const [sym, { bars, ind }] of data) {
  if (MACRO.includes(sym)) continue;
  const busyUntil = {};
  for (let i = 210; i < bars.length - 1; i++) {
    for (const s of detect(bars, ind, i)) {
      if ((busyUntil[s.key] ?? -1) >= i) continue;
      const res = simulate(bars, s, i);
      if (!res) continue;
      busyUntil[s.key] = res.exit;
      const reg = riskOnByDate.get(bars[i].date) ? 'risk-on' : 'risk-off';
      for (const k of [`${s.key}|all`, `${s.key}|${reg}`]) {
        const st = (stats[k] ||= { n: 0, wins: 0, sumR: 0 });
        st.n++; st.sumR += res.r; if (res.r > 0) st.wins++;
      }
    }
  }
}
const statFor = (key) => {
  const st = stats[`${key}|${regime}`];
  const use = st && st.n >= 30 ? st : stats[`${key}|all`];
  return use ? { n: use.n, winRate: (use.wins / use.n) * 100, expR: use.sumR / use.n, scope: use === st ? regime : 'all' } : null;
};

// Current signals
const gbpusd = data.get('GBPUSD')?.bars.at(-1)?.c || 1.3;
const riskGBP = (ACCOUNT_GBP * RISK_PCT) / 100;
const ideas = [];
const snapshot = new Map();
for (const [sym, { bars, ind }] of data) {
  const i = bars.length - 1;
  const last = bars[i];
  const avgVol20 = bars.slice(-21, -1).reduce((s, x) => s + x.v, 0) / 20;
  const dollarVol = avgVol20 * last.c;
  const info = {
    symbol: sym, date: last.date, close: last.c,
    chg1d: ((last.c / bars[i - 1].c) - 1) * 100,
    ret20: ret(bars, 20), rs20: ret(bars, 20) != null && spyRet20 != null ? ret(bars, 20) - spyRet20 : null,
    rsi: ind.rsi[i], atr: ind.atr[i], atrPct: (ind.atr[i] / last.c) * 100, adx: ind.adx[i],
    e20: ind.e20[i], e50: ind.e50[i], e200: ind.e200[i], avgVol20, dollarVol,
    trend: last.c > ind.e50[i] && ind.e50[i] > ind.e200[i] ? 'up' : last.c < ind.e50[i] && ind.e50[i] < ind.e200[i] ? 'down' : 'mixed',
    earnings: earningsBy.get(sym) || null,
  };
  snapshot.set(sym, info);
  if (MACRO.includes(sym)) continue;
  if (dollarVol < 20e6 && !HOLDINGS.includes(sym)) continue;
  for (const s of detect(bars, ind, i)) {
    const st = statFor(s.key);
    let score = SETUPS[s.key].base;
    const why = [SETUPS[s.key].label];
    const dir = s.side === 'long' ? 1 : -1;
    if (info.adx != null) score += clamp((info.adx - 15) * 0.8, 0, 15);
    if (info.rs20 != null) { score += clamp(dir * info.rs20 * 1.5, -10, 15); if (dir * info.rs20 > 5) why.push(`${s.side === 'long' ? 'outperforming' : 'underperforming'} SPY by ${Math.abs(info.rs20).toFixed(1)}% over 20d`); }
    if (s.volRatio >= 1.5) { score += 6; why.push(`volume ${s.volRatio.toFixed(1)}x average`); }
    const aligned = (s.side === 'long') === (regime === 'risk-on');
    score += aligned ? 8 : -6;
    if (st && st.n >= 20) score += clamp(st.expR * 40, -20, 20);
    const earn = info.earnings;
    const daysToEarn = earn ? Math.round((Date.parse(earn.date) - Date.parse(last.date)) / 86400000) : null;
    if (daysToEarn != null && daysToEarn >= 0 && daysToEarn <= 7) { score -= 10; why.push(`earnings ${earn.date} (binary risk)`); }
    ideas.push({ ...s, symbol: sym, label: SETUPS[s.key].label, score, why, stat: st, info, daysToEarn });
  }
}

// ORTEX: enrich the strongest candidates plus holdings, then re-score.
let ortexUsed = 0;
const flows = new Map();
if (ORTEX_KEY) {
  const want = [...new Set([
    ...HOLDINGS,
    ...ideas.filter((x) => !ETFS.has(x.symbol)).sort((a, b) => b.score - a.score).map((x) => x.symbol),
  ])].slice(0, ORTEX_BUDGET + HOLDINGS.length);
  for (const sym of want) {
    const f = await shortFlow(sym, snapshot.get(sym)?.avgVol20 || 0);
    flows.set(sym, f);
    ortexUsed++;
  }
}
for (const idea of ideas) {
  const f = flows.get(idea.symbol);
  if (!f) continue;
  idea.flow = f;
  const long = idea.side === 'long';
  if (f.stockScore != null) {
    // ORTEX Stock Score: >70 is a strong name, <40 a weak one. Momentum
    // confirms the direction we are trading.
    const dir = long ? 1 : -1;
    idea.score += clamp(dir * (f.stockScore - 55) / 4, -8, 8);
    if (f.momentum != null) idea.score += clamp(dir * (f.momentum - 50) / 8, -4, 4);
    idea.why.push(`ORTEX stock score ${f.stockScore.toFixed(0)} (momentum ${f.momentum?.toFixed(0) ?? '—'}, ${f.stockScoreChange >= 0 ? '+' : ''}${f.stockScoreChange.toFixed(1)} in 10d)`);
  }
  if (f.shortScore != null) {
    if (f.shortScore >= 70) { idea.score += long ? 8 : -15; idea.why.push(`ORTEX short score ${f.shortScore.toFixed(0)}: squeeze pressure${long ? ' (fuel for longs)' : ' (danger for shorts)'}`); }
    else if (f.shortScore <= 30 && !long) { idea.score += 3; }
  }
  if (f.siPctFF == null) continue;
  const chg = f.siChangePct ?? 0;
  if (long) {
    if (chg <= -10) { idea.score += 8; idea.why.push(`shorts covering (SI ${chg.toFixed(0)}% in 3w)`); }
    if (f.siPctFF >= 10 && (f.ctb ?? 0) >= 5 && idea.info.close > idea.info.e20) { idea.score += 12; idea.why.push(`squeeze fuel: SI ${f.siPctFF.toFixed(1)}% FF, borrow ${f.ctb.toFixed(1)}%`); }
    if (chg >= 15) { idea.score -= 5; idea.why.push(`shorts adding (+${chg.toFixed(0)}%)`); }
  } else {
    if (chg >= 10) { idea.score += 8; idea.why.push(`shorts adding (SI +${chg.toFixed(0)}% in 3w)`); }
    if ((f.ctb ?? 0) >= 10 || f.siPctFF >= 20 || (f.dtc ?? 0) >= 7) { idea.score -= 12; idea.why.push('crowded short: squeeze risk / costly borrow'); }
    if (chg <= -10) { idea.score -= 5; idea.why.push(`shorts covering (${chg.toFixed(0)}%)`); }
  }
}

// Sizing in GBP: risk budget / per-share risk, capped at the account (no leverage).
for (const idea of ideas) {
  const perShareUsd = idea.risk;
  const riskUsd = riskGBP * gbpusd;
  const maxByCash = Math.floor((ACCOUNT_GBP * gbpusd) / idea.trigger);
  idea.shares = Math.max(0, Math.min(Math.floor(riskUsd / perShareUsd), maxByCash));
  idea.costGBP = (idea.shares * idea.trigger) / gbpusd;
  idea.riskGBP = (idea.shares * perShareUsd) / gbpusd;
}

// Only setups that have actually made money on this universe (in the current
// regime when there is enough history) are actionable; the rest are shown as
// watch-only so a high score can never promote a setup with no edge.
const MIN_EDGE_R = 0.05;
const MIN_EDGE_N = 100; // smaller samples are noise (a 40-trade setup once promoted a spiking small-cap short)
for (const idea of ideas) idea.edge = !!(idea.stat && idea.stat.n >= MIN_EDGE_N && idea.stat.expR >= MIN_EDGE_R);
const rank = (side, edge) => ideas.filter((x) => x.side === side && x.edge === edge).sort((a, b) => b.score - a.score);
const longs = rank('long', true), shorts = rank('short', true);
const watchLongs = rank('long', false), watchShorts = rank('short', false);

/* ---------------- news + TradingView ideas on the finalists ---------------- */

const POS = /\b(upgrades?|upgraded|beats?|raises?|raised|record|buyback|approv\w*|wins?|contract|partnership|surg\w*|jumps?|soars?|outperform\w*|rall\w*)\b/i;
const NEG = /\b(downgrades?|downgraded|miss(?:es|ed)?|cuts?|insider sell\w*|sells? \$?\d+|lawsuit|probe|investigation|recall\w*|bankrupt\w*|offering|dilut\w*|plung\w*|slump\w*|warns?|warning|delay\w*|fraud|subpoena|layoffs?|halt\w*|sinks?|tumbl\w*)\b/i;
const strip = (s) => String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim();

async function newsFor(sym) {
  let items = [];
  try {
    items = (await fmp(`news/stock?symbols=${encodeURIComponent(sym)}&limit=10`, `stock_news?tickers=${encodeURIComponent(sym)}&limit=10`))
      .map((n) => ({ title: n.title, date: n.publishedDate || n.date, source: n.site || n.publisher || 'FMP' }));
  } catch (e) { /* fall back to Yahoo RSS */ }
  if (!items.length) {
    try {
      const r = await fetch(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(sym)}&region=US&lang=en-US`, { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0' } });
      const xml = await r.text();
      items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => ({
        title: strip(m[1].match(/<title>([\s\S]*?)<\/title>/)?.[1]),
        date: strip(m[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]),
        source: 'Yahoo',
      }));
    } catch (e) { /* no news source reachable */ }
  }
  // Google News: the wider web (Reuters, Bloomberg, CNBC, blogs) rather than
  // only the feeds FMP licenses.
  try {
    const r = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(`"${sym}" stock`)}&hl=en-US&gl=US&ceid=US:en`, { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0' } });
    const xml = await r.text();
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const title = strip(m[1].match(/<title>([\s\S]*?)<\/title>/)?.[1]);
      const source = strip(m[1].match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]) || 'Google News';
      items.push({ title: title.replace(/\s+-\s+[^-]+$/, ''), date: strip(m[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]), source });
    }
  } catch (e) { /* best effort */ }
  const seen = new Set();
  const recent = items
    .filter((n) => n.title && Date.now() - Date.parse(n.date) < 4 * 86400000)
    .filter((n) => { const k = n.title.toLowerCase().slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, 12);
  const sentiment = recent.reduce((s, n) => s + (POS.test(n.title) ? 1 : 0) - (NEG.test(n.title) ? 1 : 0), 0);
  return { items: recent, sentiment };
}

/* ---------------- social sentiment ---------------- */

// StockTwits: users tag posts Bullish/Bearish, so this is explicit retail
// sentiment. Reddit: mention counts on r/wallstreetbets + r/stocks in the
// last 24h (attention, not direction). FMP social sentiment where the plan
// allows it. All best effort — a blocked endpoint reports as unavailable.
let redditTopCache = null;
async function redditTop() {
  if (redditTopCache) return redditTopCache;
  const r = await fetch('https://apewisdom.io/api/v1.0/filter/all-stocks/page/1', { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`ApeWisdom HTTP ${r.status}`);
  const j = await r.json();
  redditTopCache = (j.results || []).map((x) => ({ ticker: String(x.ticker).toUpperCase(), rank: +x.rank, mentions: +x.mentions, mentions_24h_ago: +x.mentions_24h_ago, upvotes: +x.upvotes }));
  return redditTopCache;
}

async function socialFor(sym) {
  const out = { bullish: null, bearish: null, posts: 0, redditMentions: null, fmp: null, errors: [] };
  try {
    const r = await fetch(`https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(sym)}.json`, { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!r.ok) throw new Error(`StockTwits HTTP ${r.status}`);
    const j = await r.json();
    const msgs = (j.messages || []).filter((m) => Date.now() - Date.parse(m.created_at) < 3 * 86400000);
    out.posts = msgs.length;
    out.bullish = msgs.filter((m) => m.entities?.sentiment?.basic === 'Bullish').length;
    out.bearish = msgs.filter((m) => m.entities?.sentiment?.basic === 'Bearish').length;
    out.sample = msgs.filter((m) => m.entities?.sentiment?.basic).slice(0, 3).map((m) => `${m.entities.sentiment.basic}: ${String(m.body).replace(/\s+/g, ' ').slice(0, 90)}`);
  } catch (e) { out.errors.push(e.message); }
  // Reddit itself returns 403 to cloud runners; ApeWisdom aggregates
  // r/wallstreetbets + r/stocks mentions per ticker (top 100 by 24h volume).
  try {
    const top = await redditTop();
    const hit = top.find((r) => r.ticker === sym);
    out.redditMentions = hit ? hit.mentions : 0;
    out.redditRank = hit ? hit.rank : null;
    out.redditMentions24hAgo = hit ? hit.mentions_24h_ago : null;
  } catch (e) { out.errors.push(e.message); }
  try {
    const rows = await fmp(`historical-social-sentiment?symbol=${encodeURIComponent(sym)}&page=0`, `historical/social-sentiment?symbol=${encodeURIComponent(sym)}&page=0`);
    const v = rows[0];
    if (v) out.fmp = { date: v.date, stocktwitsSentiment: v.stocktwitsSentiment ?? null, twitterSentiment: v.twitterSentiment ?? null, posts: (v.stocktwitsPosts ?? 0) + (v.twitterPosts ?? 0) };
  } catch (e) { /* not on this plan */ }
  const voted = (out.bullish ?? 0) + (out.bearish ?? 0);
  out.bullPct = voted >= 5 ? (out.bullish / voted) * 100 : null;
  return out;
}

// Community ideas on TradingView: counts recent Long vs Short labels on the
// symbol's ideas page. Best effort — the page layout is not an API, so an
// unparseable page is reported as unavailable rather than guessed at.
async function tvIdeas(sym) {
  try {
    const r = await fetch(`https://www.tradingview.com/symbols/${encodeURIComponent(sym)}/ideas/`, {
      signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64)', accept: 'text/html' },
    });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const html = await r.text();
    const count = (re) => (html.match(re) || []).length;
    const long = count(/"direction"\s*:\s*"long"|"is_long"\s*:\s*true|data-direction="long"|>Long</gi);
    const short = count(/"direction"\s*:\s*"short"|"is_long"\s*:\s*false|data-direction="short"|>Short</gi);
    return long + short ? { long, short } : { error: 'no idea labels found' };
  } catch (e) { return { error: e.message }; }
}

const finalists = [...longs.slice(0, 5), ...shorts.slice(0, 3)];
for (const idea of finalists) {
  const [news, tv, social] = await Promise.all([newsFor(idea.symbol), tvIdeas(idea.symbol), socialFor(idea.symbol)]);
  idea.news = news;
  idea.tv = tv;
  idea.social = social;
  const dir = idea.side === 'long' ? 1 : -1;
  if (social.bullPct != null) {
    // Retail sentiment is mildly confirming, but a crowd that is almost all
    // one way is a contrarian warning, not fuel.
    const bias = (social.bullPct - 50) / 50;
    if (social.bullPct >= 90 && idea.side === 'long') { idea.score -= 4; idea.why.push(`StockTwits ${social.bullPct.toFixed(0)}% bullish (crowded, contrarian caution)`); }
    else if (social.bullPct <= 10 && idea.side === 'short') { idea.score -= 4; idea.why.push(`StockTwits ${(100 - social.bullPct).toFixed(0)}% bearish (crowded, contrarian caution)`); }
    else { idea.score += clamp(dir * bias * 5, -5, 5); idea.why.push(`StockTwits ${social.bullPct.toFixed(0)}% bullish of ${social.bullish + social.bearish} votes`); }
  }
  if (social.redditRank != null) {
    const spike = social.redditMentions24hAgo > 0 ? social.redditMentions / social.redditMentions24hAgo : null;
    idea.why.push(`Reddit #${social.redditRank} most-discussed (${social.redditMentions} mentions${spike != null ? `, ${spike.toFixed(1)}x yesterday` : ''})`);
    // A sudden retail pile-in is late money; treat a 3x spike as caution for longs.
    if (idea.side === 'long' && spike != null && spike >= 3 && social.redditRank <= 10) { idea.score -= 4; idea.why.push('retail mention spike (late-money caution)'); }
  }
  if (social.fmp?.twitterSentiment != null) idea.why.push(`social sentiment (FMP) ${(social.fmp.twitterSentiment * 100).toFixed(0)}%`);
  if (news.sentiment) {
    idea.score += clamp(dir * news.sentiment * 3, -12, 9);
    idea.why.push(`news ${news.sentiment > 0 ? 'positive' : 'negative'} (${news.sentiment > 0 ? '+' : ''}${news.sentiment})`);
  }
  if (tv.long != null && tv.long + tv.short >= 4) {
    const bias = (tv.long - tv.short) / (tv.long + tv.short);
    idea.score += clamp(dir * bias * 5, -5, 5);
    idea.why.push(`TradingView ideas ${tv.long} long / ${tv.short} short`);
  }
  console.log(`finalist ${idea.symbol}: news ${news.items.length} (sent ${news.sentiment}), TV ideas ${tv.error || `${tv.long}L/${tv.short}S`}, StockTwits ${social.bullPct != null ? `${social.bullPct.toFixed(0)}% bull (${social.posts} posts)` : 'n/a'}, Reddit ${social.redditRank != null ? `#${social.redditRank} (${social.redditMentions})` : social.redditMentions === 0 ? 'not top-100' : 'n/a'}${social.errors.length ? ` [${social.errors.join('; ')}]` : ''}`);
}
longs.sort((a, b) => b.score - a.score);
shorts.sort((a, b) => b.score - a.score);

// The one trade to execute: best actionable idea that fits the account,
// has no earnings inside a week and no news running against it.
const eligible = [...longs, ...shorts]
  .filter((x) => x.shares > 0 && !(x.daysToEarn != null && x.daysToEarn >= 0 && x.daysToEarn <= 7))
  .filter((x) => !x.news || (x.side === 'long' ? x.news.sentiment > -2 : x.news.sentiment < 2))
  .sort((a, b) => b.score - a.score);
const best = eligible[0] || null;
const runnersUp = eligible.slice(1, 3);

/* ---------------- report ---------------- */

const f = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d));
const px = (x) => (x == null ? '—' : x >= 100 ? x.toFixed(2) : x >= 10 ? x.toFixed(2) : x.toFixed(3));
const statTxt = (st) => (st ? `${st.winRate.toFixed(0)}% / ${st.expR >= 0 ? '+' : ''}${st.expR.toFixed(2)}R (n=${st.n})` : '—');
const flowTxt = (fl) => {
  if (!fl) return '—';
  const parts = [];
  if (fl.siPctFF != null) parts.push(`SI ${fl.siPctFF.toFixed(1)}% (${fl.siChangePct >= 0 ? '+' : ''}${f(fl.siChangePct, 0)}%)`);
  if (fl.ctb != null) parts.push(`CTB ${fl.ctb.toFixed(2)}%`);
  if (fl.dtc != null) parts.push(`DTC ${fl.dtc.toFixed(1)}`);
  if (fl.stockScore != null) parts.push(`score ${fl.stockScore.toFixed(0)}/mom ${fl.momentum?.toFixed(0) ?? '—'}`);
  if (fl.shortScore != null) parts.push(`short score ${fl.shortScore.toFixed(0)}`);
  return parts.join(', ') || '—';
};
const table = (rows) => [
  '| # | Symbol | Setup | Score | Close | Entry | Stop | Target | Shares | Cost £ | Risk £ | Setup history (win / exp) | ORTEX (SI 3w Δ, borrow, scores) | Notes |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((x, k) => `| ${k + 1} | **${x.symbol}** | ${x.label}${x.entryType === 'stop' ? ' (stop order)' : ' (at open)'} | ${x.score.toFixed(0)} | ${px(x.info.close)} | ${px(x.trigger)} | ${px(x.stop)} | ${px(x.target)} | ${x.shares || 'too big'} | ${f(x.costGBP, 0)} | ${f(x.riskGBP, 1)} | ${statTxt(x.stat)} | ${flowTxt(x.flow)} | ${x.why.slice(1).join('; ') || ''} |`),
];

const macroLine = (sym, name) => {
  const s = snapshot.get(sym);
  return s ? `- **${name}** ${px(s.close)} (${s.chg1d >= 0 ? '+' : ''}${f(s.chg1d)}%), trend ${s.trend}, RSI ${f(s.rsi, 0)}, 20d ${s.ret20 >= 0 ? '+' : ''}${f(s.ret20, 1)}%` : `- **${name}** unavailable`;
};

const setupRows = Object.keys(SETUPS).map((k) => {
  const all = stats[`${k}|all`], on = stats[`${k}|risk-on`], off = stats[`${k}|risk-off`];
  const t = (st) => (st ? `${((st.wins / st.n) * 100).toFixed(0)}% / ${(st.sumR / st.n) >= 0 ? '+' : ''}${(st.sumR / st.n).toFixed(2)}R (${st.n})` : '—');
  return `| ${SETUPS[k].label} | ${SETUPS[k].side} | ${t(all)} | ${t(on)} | ${t(off)} |`;
});

const holdingLines = HOLDINGS.map((h) => {
  const s = snapshot.get(h);
  if (!s) return `- **${h}**: no data`;
  const bars = data.get(h).bars;
  const chandelier = Math.max(...bars.slice(-22).map((b) => b.c)) - 3 * s.atr;
  return `- **${h}** ${px(s.close)}: trend ${s.trend}, RSI ${f(s.rsi, 0)}, 20d ${f(s.ret20, 1)}%, trailing stop idea ${px(chandelier)} (22d high close − 3 ATR); ORTEX ${flowTxt(flows.get(h))}`;
});

const saxoPlan = (x) => {
  const verb = x.side === 'long' ? 'Buy' : 'Sell';
  const inst = x.side === 'long' ? 'shares' : 'CFD (Saxo shorts US stocks via CFDs)';
  const entry = x.entryType === 'stop'
    ? `${verb} Stop order, ${x.shares} ${inst} at ${px(x.trigger)}, good for 3 sessions (cancel if not filled)`
    : `Market ${verb.toLowerCase()} ${x.shares} ${inst} at the open`;
  return `${entry}; attach Stop-Loss ${px(x.stop)} and Take-Profit ${px(x.target)}${x.entryType === 'market' ? (x.side === 'long'
    ? ` (re-anchor to your fill: stop = fill − ${px(x.risk)}, target = fill + ${px(2 * x.risk)})`
    : ` (re-anchor to your fill: stop = fill + ${px(x.risk)}, target = fill − ${px(2 * x.risk)})`) : ''}.`;
};
const socialTxt = (so) => {
  if (!so) return '—';
  const parts = [];
  if (so.bullPct != null) parts.push(`StockTwits ${so.bullPct.toFixed(0)}% bullish (${so.bullish}/${so.bullish + so.bearish} votes, ${so.posts} posts in 3d)`);
  else if (so.posts) parts.push(`StockTwits ${so.posts} posts, too few votes`);
  if (so.redditRank != null) parts.push(`Reddit #${so.redditRank} most-discussed, ${so.redditMentions} mentions`);
  else if (so.redditMentions === 0) parts.push('Reddit: not in the top 100 discussed');
  if (so.fmp?.twitterSentiment != null) parts.push(`FMP social ${(so.fmp.twitterSentiment * 100).toFixed(0)}% positive`);
  return parts.join(' · ') || `unavailable (${so.errors.join('; ') || 'no data'})`;
};
const bestBlock = best ? [
  `## ⭐ Best trade to execute: ${best.side === 'long' ? 'LONG' : 'SHORT'} ${best.symbol}`,
  `- **Setup:** ${best.label}, score ${best.score.toFixed(0)}; setup history ${statTxt(best.stat)}`,
  `- **Plan:** ${saxoPlan(best)}`,
  `- **Money:** ≈ £${best.costGBP.toFixed(0)} position, £${best.riskGBP.toFixed(1)} at risk, £${(2 * best.riskGBP).toFixed(1)} if the target hits`,
  `- **Why:** ${best.why.slice(1).join('; ') || 'setup + trend'}`,
  `- **ORTEX:** ${flowTxt(best.flow)} · **TradingView ideas:** ${best.tv ? (best.tv.error ? `unavailable (${best.tv.error})` : `${best.tv.long} long / ${best.tv.short} short`) : '—'}`,
  `- **Social:** ${socialTxt(best.social)}`,
  ...(best.social?.sample?.length ? best.social.sample.map((t) => `  - ${t}`) : []),
  ...(best.news?.items.length ? ['- **Latest headlines:**', ...best.news.items.slice(0, 6).map((n) => `  - ${n.title} (${n.source})`)] : ['- **Latest headlines:** none in the last 4 days']),
  ...(runnersUp.length ? [`- **Runners-up:** ${runnersUp.map((x) => `${x.side === 'long' ? '▲' : '▼'} ${x.symbol} (${x.label}, score ${x.score.toFixed(0)})`).join(', ')}`] : []),
] : ['## ⭐ Best trade to execute', '_No trade today — nothing with a measured edge fits the account without earnings or news risk. Staying flat is a position._'];

const md = [
  `# Opportunity scan — ${day(Date.now())}`,
  '',
  ...bestBlock,
  '',
  `Universe ${data.size - MACRO.length} symbols (core + today's movers + upcoming large-cap earnings). Market regime: **${regime}** (SPY ${regime === 'risk-on' ? 'above' : 'not above'} its 200-day with 20 > 50 EMA). Sizing: £${ACCOUNT_GBP} account, ${RISK_PCT}% risk (£${riskGBP.toFixed(0)}) per trade, GBPUSD ${gbpusd.toFixed(4)}, no leverage.`,
  ORTEX_KEY ? `ORTEX short data + stock/short scores on ${ortexUsed} symbols (~${(ortexUsed * 4.5).toFixed(0)} credits).` : 'ORTEX not configured (add the ORTEX_API_KEY secret) — short-flow scoring skipped.',
  '',
  '## Macro',
  macroLine('SPY', 'S&P 500 (SPY)'), macroLine('QQQ', 'Nasdaq 100 (QQQ)'), macroLine('^FTSE', 'FTSE 100'), macroLine('^STOXX50E', 'Euro Stoxx 50'), macroLine('BZUSD', 'Brent'), macroLine('USO', 'WTI proxy (USO)'), macroLine('GCUSD', 'Gold'), macroLine('TLT', '20y Treasuries (TLT)'),
  '',
  '**High-impact US data, next 7 days**',
  ...(econ.length ? econ.slice(0, 20).map((e) => `- ${e.date} ${e.event}${e.estimate != null ? ` (est ${e.estimate}, prev ${e.previous ?? '—'})` : ''}`) : ['- none returned']),
  '',
  `## Actionable longs (setup expectancy >= +${MIN_EDGE_R}R over ${MIN_EDGE_N}+ trades)`,
  ...(longs.length ? table(longs.slice(0, TOP_N)) : ['_None today — no long setup with a measured edge fired._']),
  '',
  `## Actionable shorts (setup expectancy >= +${MIN_EDGE_R}R over ${MIN_EDGE_N}+ trades)`,
  ...(shorts.length ? table(shorts.slice(0, TOP_N)) : ['_None today — short setups have not shown an edge on this universe in the current regime._']),
  '',
  '## Watch only (setup fired but has no measured edge)',
  ...[...watchLongs.slice(0, 5), ...watchShorts.slice(0, 5)].map((x) => `- ${x.side === 'long' ? '▲' : '▼'} **${x.symbol}** ${x.label}, score ${x.score.toFixed(0)}, trigger ${px(x.trigger)} — history ${statTxt(x.stat)}${x.why.length > 1 ? `; ${x.why.slice(1).join('; ')}` : ''}`),
  '',
  '## Your holdings',
  ...holdingLines,
  '',
  '## Large-cap earnings, next 14 days',
  ...earnings.filter((e) => (e.rev ?? 0) >= 2e9).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 30)
    .map((e) => `- ${e.date} **${e.symbol}**${snapshot.get(e.symbol) ? ` — ${px(snapshot.get(e.symbol).close)}, trend ${snapshot.get(e.symbol).trend}` : ''} (EPS est ${e.eps ?? '—'})`),
  '',
  '## How each setup has actually performed (this universe, ~3 years, 2R target / 1R stop, 20-day max hold)',
  '| Setup | Side | All (win / exp, n) | Risk-on | Risk-off |',
  '|---|---|---|---|---|',
  ...setupRows,
  '',
  '_Score = setup base + trend strength (ADX) + relative strength vs SPY + volume + regime fit + measured setup expectancy + ORTEX short flow and scores + news sentiment + TradingView ideas + StockTwits/Reddit sentiment − earnings risk. Entry "stop order" means only enter if price trades through the entry level within 3 sessions. Analysis only — not financial advice._',
  failures.length ? `\n<details><summary>${failures.length} symbols skipped</summary>\n\n${failures.join('\n')}\n</details>` : '',
].join('\n');

const out = {
  generated_at: new Date().toISOString(), regime, account_gbp: ACCOUNT_GBP, risk_pct: RISK_PCT, gbpusd,
  best: best ? (({ info, ...x }) => ({ ...x, close: info.close, plan: saxoPlan(best) }))(best) : null,
  universe_size: data.size - MACRO.length, ortex_symbols: ortexUsed,
  watch: [...watchLongs.slice(0, 10), ...watchShorts.slice(0, 10)].map(({ info, ...x }) => ({ ...x, close: info.close })),
  longs: longs.slice(0, 25).map(({ info, ...x }) => ({ ...x, close: info.close, rsi: info.rsi, rs20: info.rs20, atrPct: info.atrPct, earnings: info.earnings })),
  shorts: shorts.slice(0, 25).map(({ info, ...x }) => ({ ...x, close: info.close, rsi: info.rsi, rs20: info.rs20, atrPct: info.atrPct, earnings: info.earnings })),
  setup_stats: stats, econ, holdings: HOLDINGS.map((h) => ({ ...snapshot.get(h), flow: flows.get(h) || null })),
  skipped: failures,
};
writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
writeFileSync(OUT_MD, md);
console.log(md);
console.log(`\n(done in ${((Date.now() - started) / 1000).toFixed(0)}s)`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');

/* ---------------- Telegram digest (best effort) ---------------- */

if (process.env.SEND_TELEGRAM === '1' && process.env.TELEGRAM_BOT_TOKEN) {
  const chats = new Set();
  if (process.env.TELEGRAM_CHAT_ID) chats.add(String(process.env.TELEGRAM_CHAT_ID));
  try { for (const c of JSON.parse(readFileSync(process.env.STATE_FILE || '.notify-state.json', 'utf8')).chats || []) chats.add(String(c)); } catch { /* no state */ }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const run = process.env.RUN_LABEL || 'Scan';
  const strip = ['SPY', '^FTSE', 'BZUSD', 'GCUSD', 'GBPUSD'].map((sym) => {
    const s = snapshot.get(sym); if (!s) return null;
    const name = { SPY: 'SPY', '^FTSE': 'FTSE', BZUSD: 'Brent', GCUSD: 'Gold', GBPUSD: 'GBPUSD' }[sym];
    return `${name} ${px(s.close)} (${s.chg1d >= 0 ? '+' : ''}${s.chg1d.toFixed(1)}%)`;
  }).filter(Boolean).join(' · ');
  const text = best ? [
    `🎯 <b>${esc(run)}: best trade</b> · ${day(Date.now())} · market ${regime}`,
    esc(strip),
    '',
    `${best.side === 'long' ? '▲ LONG' : '▼ SHORT'} <b>${esc(best.symbol)}</b> — ${esc(best.label)} (score ${best.score.toFixed(0)})`,
    `Last close ${px(best.info.close)}`,
    `<b>Entry</b> ${px(best.trigger)}${best.entryType === 'stop' ? ' (stop order, 3 sessions)' : ' (market at open)'}`,
    `<b>Stop</b> ${px(best.stop)}   <b>Target</b> ${px(best.target)}`,
    `<b>Size</b> ${best.shares} ≈ £${best.costGBP.toFixed(0)} · risk £${best.riskGBP.toFixed(1)} · reward £${(2 * best.riskGBP).toFixed(1)}`,
    '',
    `Saxo: ${esc(saxoPlan(best))}`,
    '',
    `Why: ${esc(best.why.slice(1).join('; ') || 'setup + trend')}`,
    `Setup history: ${esc(statTxt(best.stat))}`,
    ...(best.flow ? [`ORTEX: ${esc(flowTxt(best.flow))}`] : []),
    `Social: ${esc(socialTxt(best.social))}`,
    ...(best.news?.items.length ? ['', '<b>Headlines</b>', ...best.news.items.slice(0, 4).map((n) => `• ${esc(n.title)} (${esc(n.source)})`)] : []),
    ...(runnersUp.length ? ['', `Runners-up: ${esc(runnersUp.map((x) => `${x.symbol} (${x.side}, ${x.score.toFixed(0)})`).join(', '))}`] : []),
    '', '<i>Check the price before placing: skip it if it has already run past the target or below the stop. Analysis only, not advice.</i>',
  ].join('\n') : [
    `🟰 <b>${esc(run)}: no trade today</b> · ${day(Date.now())} · market ${regime}`,
    esc(strip),
    'Nothing with a measured edge fits the account without earnings or news risk. Staying flat.',
    ...(watchLongs[0] ? [`Watching: ${esc(watchLongs.slice(0, 3).map((x) => x.symbol).join(', '))}`] : []),
  ].join('\n');
  for (const chat of chats) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, parse_mode: 'HTML', text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(15000),
      });
      const j = await r.json();
      console.log(j.ok ? `Telegram: sent to chat ${String(chat).slice(0, 3)}…` : `WARN telegram ${chat}: ${j.description}`);
    } catch (e) { console.log(`WARN telegram ${chat}: ${e.message}`); }
  }
  if (!chats.size) console.log('Telegram: no chat ids known; digest not sent');
}
