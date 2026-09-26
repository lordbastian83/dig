/* BudSignal intel desk — server-side fetcher for context datasets the
   browser cannot or should not fetch itself: the macro calendar (FMP),
   US Congress trades (ORTEX), insider trades (FMP) and macro-relevant
   prediction markets (Polymarket's public Gamma API). Publishes
   intel.json to the budsignal-data branch on a 6-hour schedule.

   Every source is isolated: one dead source is recorded in the output's
   errors map and skipped, never fatal (the Telegram-freeze lesson).

   Honesty contract, carried into the UI: ALL of this is context.
   Congress/insider flows are US single-stock datasets with disclosure
   lags — they do not and cannot feed the validated CFD streams.
   Prediction-market prices are crowd odds, not forecasts. The macro
   calendar is the one directly desk-relevant feed: scheduled-volatility
   TIMING (the EIA principle generalized), never direction.

   Environment:
     FMP_API_KEY    macro calendar + insider trades
     ORTEX_API_KEY  congress trades
     INTEL_FILE     output path (default intel.json)
     SELF_TEST=1    offline: run mappers on fixtures, write nothing */

const FMP_KEY = process.env.FMP_API_KEY || '';
const ORTEX_KEY = process.env.ORTEX_API_KEY || '';
const INTEL_FILE = process.env.INTEL_FILE || 'intel.json';
const SELF_TEST = process.env.SELF_TEST === '1';

const day = (t) => new Date(t).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (o, ...keys) => { for (const k of keys) if (o[k] != null && o[k] !== '') return o[k]; return null; };

async function getJson(url, headers) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/* ---------- macro calendar: high-impact events, next 8 days ---------- */

export function mapMacro(rows) {
  const out = [];
  for (const ev of rows || []) {
    const impact = String(pick(ev, 'impact', 'importance') || '').toLowerCase();
    const cur = String(pick(ev, 'currency', 'country') || '').toUpperCase();
    if (!(impact === 'high' || impact === '3')) continue;
    if (!['USD', 'US', 'EUR', 'GBP', 'GB', 'UK'].includes(cur)) continue;
    const t = Date.parse(String(ev.date).replace(' ', 'T') + (String(ev.date).endsWith('Z') ? '' : 'Z'));
    if (!Number.isFinite(t) || t < Date.now() - 3600000) continue;
    out.push({ t, name: String(pick(ev, 'event', 'name') || '').slice(0, 80), cur: cur.slice(0, 3) });
  }
  return out.sort((a, b) => a.t - b.t).slice(0, 14);
}

async function fetchMacro() {
  if (!FMP_KEY) throw new Error('no FMP key');
  const range = `from=${day(Date.now())}&to=${day(Date.now() + 8 * 86400000)}&apikey=${encodeURIComponent(FMP_KEY)}`;
  for (const url of [
    `https://financialmodelingprep.com/stable/economic-calendar?${range}`,
    `https://financialmodelingprep.com/api/v3/economic_calendar?${range}`,
  ]) {
    try {
      const j = await getJson(url);
      if (Array.isArray(j)) return mapMacro(j);
    } catch (e) { /* try next */ }
  }
  throw new Error('calendar unavailable');
}

/* ---------- Congress trades via ORTEX (global us_government_trades) ---------- */

export function mapGov(rows) {
  const out = [];
  for (const g of rows || []) {
    const t = Date.parse(String(pick(g, 'transactionDate', 'reportDate', 'date') || ''));
    if (!Number.isFinite(t)) continue;
    const who = String(pick(g, 'filerName', 'politician', 'name') || 'unknown').slice(0, 40);
    const party = String(pick(g, 'party') || '').slice(0, 1); // R / D / I
    out.push({
      t,
      ticker: String(pick(g, 'ticker', 'symbol') || '?').slice(0, 8),
      who: party ? `${who} (${party})` : who,
      side: String(pick(g, 'transactionType', 'transaction', 'side') || '?').slice(0, 16),
      amount: String(pick(g, 'usdValue', 'amount', 'range') || '').slice(0, 24),
    });
  }
  return out;
}

async function fetchCongress() {
  if (!ORTEX_KEY) throw new Error('no ORTEX key');
  const j = await getJson(
    `https://api.ortex.com/api/v1/us_government_trades?from_date=${day(Date.now() - 45 * 86400000)}&page_size=50`,
    { 'Ortex-Api-Key': ORTEX_KEY, accept: 'application/json' });
  const rows = j.rows || j.data || (Array.isArray(j) ? j : []);
  return mapGov(rows).sort((a, b) => b.t - a.t).slice(0, 15);
}

/* ---------- insider trades via FMP ---------- */

export function mapInsider(rows) {
  const out = [];
  for (const r of rows || []) {
    const t = Date.parse(String(pick(r, 'transactionDate', 'filingDate') || ''));
    if (!Number.isFinite(t)) continue;
    const type = String(pick(r, 'transactionType', 'acquistionOrDisposition', 'acquisitionOrDisposition') || '?');
    const shares = +pick(r, 'securitiesTransacted', 'shares') || 0;
    const price = +pick(r, 'price') || 0;
    out.push({
      t,
      ticker: String(pick(r, 'symbol', 'ticker') || '?').slice(0, 8),
      who: String(pick(r, 'reportingName', 'insiderName', 'name') || 'unknown').slice(0, 36),
      side: /p|buy|a/i.test(type[0]) ? 'BUY' : 'SELL',
      usd: shares && price ? Math.round(shares * price) : null,
    });
  }
  return out.sort((a, b) => b.t - a.t).slice(0, 15);
}

async function fetchInsider() {
  if (!FMP_KEY) throw new Error('no FMP key');
  for (const url of [
    `https://financialmodelingprep.com/stable/insider-trading/latest?page=0&limit=100&apikey=${encodeURIComponent(FMP_KEY)}`,
    `https://financialmodelingprep.com/api/v4/insider-trading?page=0&apikey=${encodeURIComponent(FMP_KEY)}`,
  ]) {
    try {
      const j = await getJson(url);
      if (Array.isArray(j) && j.length) return mapInsider(j);
    } catch (e) { /* try next */ }
  }
  throw new Error('insider feed unavailable on this plan');
}

/* ---------- macro-relevant prediction markets (Polymarket Gamma, public) ---------- */

const POLY_RE = /\b(fed|rate[s]?|cpi|inflation|recession|gdp|bitcoin|btc|ethereum|gold|oil|opec|election|tariff[s]?|war|ceasefire|shutdown|treasury|dollar|powell)\b/i;

export function mapPoly(rows) {
  const out = [];
  for (const m of rows || []) {
    const q = String(pick(m, 'question', 'title') || '');
    if (!q || !POLY_RE.test(q)) continue;
    let yes = null;
    try {
      const prices = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices;
      if (Array.isArray(prices) && prices.length) yes = Math.round(parseFloat(prices[0]) * 100);
    } catch (e) { /* leave null */ }
    if (yes == null || yes < 2 || yes > 98) continue; // degenerate odds are noise
    const endT = Date.parse(String(pick(m, 'endDate', 'end_date') || ''));
    if (Number.isFinite(endT) && endT - Date.now() > 150 * 86400000) continue; // 2028 lottery tickets out
    out.push({
      q: q.slice(0, 110),
      yes,
      vol: Math.round(+pick(m, 'volumeNum', 'volume') || 0),
      end: pick(m, 'endDate', 'end_date'),
    });
  }
  return out.slice(0, 10);
}

async function fetchPoly() {
  const j = await getJson('https://gamma-api.polymarket.com/markets?closed=false&order=volumeNum&ascending=false&limit=80');
  if (!Array.isArray(j)) throw new Error('unexpected response');
  return mapPoly(j);
}

/* ---------- main ---------- */

const FIXTURES = {
  macro: [{ date: new Date(Date.now() + 86400000).toISOString(), event: 'CPI YoY', impact: 'High', currency: 'USD' }],
  gov: [{ transactionDate: '2026-09-20', ticker: 'AAPL', filerName: 'A. Person', party: 'Republican', transactionType: 'Buy', usdValue: '$15,001-$50,000' }],
  insider: [{ transactionDate: '2026-09-24', symbol: 'NVDA', reportingName: 'SOME EXEC', transactionType: 'S-Sale', securitiesTransacted: 1000, price: 190 }],
  poly: [{ question: 'Will the Fed cut rates in October?', outcomePrices: '["0.62","0.38"]', volumeNum: 1234567, endDate: new Date(Date.now() + 30 * 86400000).toISOString() }, { question: 'Will X win the 2028 election?', outcomePrices: '["0.01","0.99"]', volumeNum: 99999999, endDate: '2028-11-07T00:00:00Z' }],
};

async function main() {
  if (SELF_TEST) {
    const m = mapMacro(FIXTURES.macro), g = mapGov(FIXTURES.gov), i = mapInsider(FIXTURES.insider), p = mapPoly(FIXTURES.poly);
    const ok = m.length === 1 && g.length === 1 && g[0].who === 'A. Person (R)' && g[0].amount === '$15,001-$50,000' &&
      i.length === 1 && i[0].side === 'SELL' && i[0].usd === 190000 &&
      p.length === 1 && p[0].yes === 62;
    console.log(JSON.stringify({ m, g, i, p }));
    if (!ok) { console.error('SELF_TEST FAILED'); process.exit(1); }
    console.log('self-test OK');
    return;
  }
  const out = { updated: Date.now(), errors: {} };
  for (const [key, fn] of [['macro', fetchMacro], ['congress', fetchCongress], ['insider', fetchInsider], ['polymarket', fetchPoly]]) {
    try {
      out[key] = await fn();
      console.log(`${key}: ${out[key].length} rows`);
    } catch (e) {
      out[key] = [];
      out.errors[key] = String(e.message).slice(0, 80);
      console.log(`${key}: ERR ${e.message}`);
    }
  }
  if (!out.macro.length && !out.congress.length && !out.insider.length && !out.polymarket.length) {
    console.error('every source failed — keeping the previous intel file');
    process.exit(1);
  }
  const { writeFileSync } = await import('node:fs');
  writeFileSync(INTEL_FILE, JSON.stringify(out));
  console.log(`wrote ${INTEL_FILE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
