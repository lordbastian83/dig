/* vault racing — live market/odds feed ingestion.

   Config-driven, fail-safe enrichment of candidates.json with a REAL market
   price per horse. Reads feeds/sources.json; for each enabled source with a
   `url` it fetches a CSV or JSON feed, maps it to the app's fields, and keys
   the result by (lower-cased) horse name. `applyLiveFeeds(candidates)` then
   stamps matching candidates with `marketGns` / `liveOdds` / `orLive` and a
   `marketLive: true` flag.

   Runs inside the bloodstock-scan GitHub Action (which has internet); the dev
   sandbox does not, so a feed URL is confirmed by a CI run, not locally.
   Every fetch is wrapped: a failing, disabled, or unconfigured source yields
   nothing and never breaks the scan. With no feed configured this is a no-op
   and the app keeps using its model-derived market estimate.

   Enable in CI with FEEDS=1; secrets (tokens, basic-auth) come from Actions
   env vars named in sources.json, never from the file itself. */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (cell !== '' || row.length) { row.push(cell); rows.push(row); row = []; cell = ''; }
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  if (!rows.length) return [];
  const head = rows.shift().map((h) => h.trim().toLowerCase());
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// pull a nested value by dotted path, e.g. "odds.decimal"
const dig = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

// Map a JSON feed's array to the app's field names via source.map.
function mapJson(json, map) {
  const arr = map.items ? dig(json, map.items) : json;
  if (!Array.isArray(arr)) return [];
  const cols = Object.entries(map).filter(([k]) => k !== 'items');
  return arr.map((item) => {
    const row = {};
    for (const [field, path] of cols) row[field] = dig(item, path) ?? '';
    return row;
  });
}

// Alias a source's own CSV headers to the app's fields.
function applyColumns(rows, columns) {
  if (!columns || !Object.keys(columns).length) return rows;
  const alias = Object.fromEntries(Object.entries(columns).map(([k, v]) => [k.toLowerCase(), v]));
  return rows.map((r) => {
    const out = { ...r };
    for (const [src, dst] of Object.entries(alias)) {
      if (r[src] != null && r[src] !== '') out[dst] = r[src];
    }
    return out;
  });
}

function authHeaders(src) {
  const h = { 'user-agent': 'vault-racing-feeds/1.0' };
  if (src.authEnv && process.env[src.authEnv]) h.Authorization = `Bearer ${process.env[src.authEnv]}`;
  else if (src.basicEnvUser && src.basicEnvPass && process.env[src.basicEnvUser] && process.env[src.basicEnvPass]) {
    h.Authorization = 'Basic ' + Buffer.from(`${process.env[src.basicEnvUser]}:${process.env[src.basicEnvPass]}`).toString('base64');
  }
  return h;
}

const num = (v) => { const n = +String(v ?? '').replace(/[^0-9.]/g, ''); return Number.isFinite(n) && n ? n : null; };

// Normalise raw feed rows (already field-mapped) to the live-fields shape.
function normalise(rows) {
  return rows
    .map((r) => ({
      name: String(r.name || '').trim(),
      marketGns: num(r.marketGns),
      liveOdds: r.liveOdds != null && r.liveOdds !== '' ? String(r.liveOdds) : null,
      orLive: num(r.orLive),
    }))
    .filter((r) => r.name);
}

// Fetch one feed → array of { name, marketGns?, liveOdds?, orLive? }. Never throws.
// Prefers a live `url`; falls back to a committed CSV at feeds/data/<file>
// (a no-network path, and how this is tested offline).
async function fetchFeed(src) {
  if (src.enabled === false) return [];
  try {
    if (!src.url && src.file) {
      const p = join(HERE, 'data', src.file);
      if (!existsSync(p)) return [];
      return normalise(applyColumns(parseCSV(readFileSync(p, 'utf8')), src.columns));
    }
    if (!src.url) return [];
    const res = await fetch(src.url, { headers: authHeaders(src) });
    if (!res.ok) { console.error(`  feed ${src.name}: ${res.status} — skipped`); return []; }
    let rows = (src.format || 'csv') === 'json'
      ? mapJson(await res.json(), src.map || {})
      : applyColumns(parseCSV(await res.text()), src.columns);
    return normalise(rows);
  } catch (e) {
    console.error(`  feed ${src.name}: ${e && e.message || e} — skipped`);
    return [];
  }
}

// Build a name → live-fields map from every enabled, configured feed.
export async function fetchLiveMarket() {
  const cfgPath = join(HERE, 'sources.json');
  if (!existsSync(cfgPath)) return new Map();
  let cfg;
  try { cfg = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { return new Map(); }
  const sources = Array.isArray(cfg.sources) ? cfg.sources : [];
  const map = new Map();
  for (const src of sources) {
    const rows = await fetchFeed(src);
    for (const r of rows) {
      const key = r.name.toLowerCase();
      const prev = map.get(key) || {};
      // first non-null wins per field, so earlier (higher-priority) feeds hold
      map.set(key, {
        marketGns: prev.marketGns ?? r.marketGns,
        liveOdds: prev.liveOdds ?? r.liveOdds,
        orLive: prev.orLive ?? r.orLive,
      });
    }
    if (rows.length) console.error(`  feed ${src.name}: ${rows.length} rows`);
  }
  return map;
}

/* The Racing API — real forecast/live betting odds for candidates DECLARED to
   run. Uses the same proven Basic-auth pattern as scan.mjs. Reads every field
   defensively (the racecards shape is confirmed by a CI run, not the sandbox),
   so a wrong endpoint or missing field simply yields nothing — never a crash,
   never a fabricated price. Keyed by the API horse_id, with a name fallback. */
async function racingApiOdds() {
  const USER = process.env.RACING_API_USERNAME, PASS = process.env.RACING_API_PASSWORD;
  const map = new Map();
  if (!USER || !PASS) return map;
  const API = 'https://api.theracingapi.com/v1';
  const auth = { Authorization: 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64') };
  const get = async (path) => { const r = await fetch(API + path, { headers: auth }); if (!r.ok) throw new Error(`${r.status}`); return r.json(); };
  const pick = (o, ...keys) => { for (const k of keys) { const v = k.split('.').reduce((x, kk) => (x == null ? x : x[kk]), o); if (v != null && v !== '') return v; } return null; };
  for (const day of ['today', 'tomorrow']) {
    let data = null;
    for (const path of [`/racecards/pro?day=${day}`, `/racecards/standard?day=${day}`, `/racecards?day=${day}`]) {
      try { data = await get(path); break; } catch { /* try next shape */ }
    }
    if (!data) continue;
    const cards = data.racecards || data.data || (Array.isArray(data) ? data : []);
    for (const rc of cards) for (const rn of (rc.runners || rc.horses || [])) {
      const id = pick(rn, 'horse_id', 'id');
      const name = pick(rn, 'horse', 'name');
      const odds = pick(rn, 'odds.0.decimal', 'odds.0.fractional', 'forecast', 'sp_forecast', 'odds_decimal', 'odds');
      const or = +(pick(rn, 'ofr', 'official_rating', 'or') ?? NaN);
      if (!id && !name) continue;
      const rec = { name, liveOdds: odds != null ? String(odds) : null, orLive: Number.isFinite(or) ? or : null };
      if (id) map.set(String(id), rec);
      if (name) map.set(name.toLowerCase(), rec);
    }
  }
  return map;
}

// Stamp candidates in place with any live market/odds data. Returns count matched.
export async function applyLiveFeeds(candidates) {
  if (process.env.FEEDS !== '1' || !Array.isArray(candidates) || !candidates.length) return 0;
  const ts = new Date().toISOString();
  let matched = 0;
  // 1) configured market feeds (real hammer/market price → marketGns)
  const market = await fetchLiveMarket().catch(() => new Map());
  for (const h of candidates) {
    const m = market.get(String(h.name || '').toLowerCase());
    if (!m) continue;
    if (m.marketGns != null) { h.marketGns = m.marketGns; h.marketLive = true; h.marketTs = ts; matched++; }
    if (m.liveOdds != null) h.liveOdds = m.liveOdds;
    if (m.orLive != null) h.orLive = m.orLive;
  }
  // 2) The Racing API — live/forecast betting odds for declared runners
  const odds = await racingApiOdds().catch(() => new Map());
  let oddsHit = 0;
  if (odds.size) for (const h of candidates) {
    const rec = (h.horseId && odds.get(String(h.horseId))) || odds.get(String(h.name || '').toLowerCase());
    if (!rec) continue;
    if (rec.liveOdds != null) { h.liveOdds = rec.liveOdds; h.oddsTs = ts; oddsHit++; }
    if (rec.orLive != null) h.orLive = rec.orLive;
  }
  console.error(`Live feeds: ${matched} market price(s), ${oddsHit} live-odds match(es) across ${candidates.length} candidates.`);
  return matched + oddsHit;
}
