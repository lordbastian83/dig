/* vault racing — sale catalogue builder.

   Turns catalogue source files into catalogue.json on the bloodstock-data
   branch, which the app's "Sale shopping list" auto-loads with a sale picker
   (exactly like candidates.json powers the radar). This is the "the shopping
   list fills itself" step — drop a sale's catalogue in and every lot is
   scored and ranked for the Dubai plan without anyone typing it in.

   Source of truth: any CSV files in bloodstock/catalogues/*.csv. Each file is
   one sale; the file name (or a `sale` column) names it. Columns are the same
   as the manual catalogue import (see DATA.md): name, lot, sire, dam, damsire,
   vendor, rating, starts, age, sex, sireTier, vet, powerhouse, blackType,
   awForm, distBest, wins, guide, notes — plus optional `horseid` for Racing
   API enrichment.

   A real scrape of Tattersalls/Goffs/Arqana would drop its output CSV into
   that folder (or this script would fetch it); until then, committing a CSV
   there — or exporting one from the app — publishes a live, scored catalogue.

   Env:
     CATALOGUE_DIR   dir of source CSVs (default bloodstock/catalogues)
     OUT             output file (default catalogue.json)
     RACING_API_*    optional — enrich rating/form for rows with a horseid
*/

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fetchConfiguredSources } from './scrapers/index.mjs';

const DIR = process.env.CATALOGUE_DIR || 'bloodstock/catalogues';
const OUT = process.env.OUT || 'catalogue.json';
const USER = process.env.RACING_API_USERNAME;
const PASS = process.env.RACING_API_PASSWORD;
const API = 'https://api.theracingapi.com/v1';

// --- tiny CSV parser (quoted fields) → array of lower-cased-key objects ---
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

// --- map a raw row to the lot shape the app's engine consumes ---
const TIER_A = ['dubawi', 'night of thunder', 'too darn hot', 'new bay', 'blue point'];
const TIER_B_DS = ['street cry', 'shamardal', "medaglia d'oro", 'dubai millennium'];
// Which currency a sale quotes guides in (matches the app's saleCcy()).
function saleCcy(name) {
  const s = String(name || '').toLowerCase();
  if (/arqana|deauville|bbag|baden|france|french/.test(s)) return 'EUR';
  if (/keeneland|fasig|saratoga|tipton/.test(s)) return 'USD';
  if (/ireland|orby|kildare|goresbridge/.test(s)) return 'EUR';
  if (/inglis|magic millions|australia/.test(s)) return 'AUD';
  return 'gns';
}
function rowToLot(r, saleLabel) {
  const bool = (v) => ['true', 'yes', '1', 'y'].includes(String(v || '').toLowerCase());
  // First numeric token only, so a "40,000 - 60,000" range reads as 40000.
  const num = (v) => { const m = String(v ?? '').match(/[0-9][0-9,. ]*/); if (!m) return null; const n = +m[0].replace(/[^0-9.]/g, ''); return Number.isFinite(n) && n ? n : null; };
  const startsN = (r.starts == null || r.starts === '') ? 99 : +r.starts;
  const t = (r.siretier || '').toUpperCase();
  const sire = (r.sire || '').toLowerCase(), dam = (r.dam || '').toLowerCase(), ds = (r.damsire || '').toLowerCase();
  const tier = (t === 'A' || t === 'B') ? t
    : TIER_A.some((s) => sire.includes(s)) ? 'A'
    : TIER_B_DS.some((s) => dam.includes(s) || ds.includes(s)) ? 'B' : '';
  return {
    name: r.name, lot: r.lot || '', sale: r.sale || saleLabel,
    sire: r.sire || '', dam: r.dam || '', damsire: r.damsire || '', vendor: r.vendor || '',
    rating: +r.rating || 0, starts: Number.isFinite(startsN) ? startsN : 99, sireTier: tier,
    vet: ['clean', 'incomplete'].includes(r.vet) ? r.vet : 'unknown',
    powerhouse: bool(r.powerhouse), blackType: bool(r.blacktype), awForm: bool(r.awform),
    distBest: num(r.distbest ?? r.bestdist), age: num(r.age), sxClass: r.sex || '',
    wins: r.wins === '' || r.wins == null ? null : +r.wins,
    guide: num(r.guide ?? r.guideprice ?? r.estimate),
    ccy: (r.ccy || r.currency || saleCcy(r.sale || saleLabel)),
    ped: r.ped || r.pedigree || '',
    horseid: r.horseid || r.horse_id || '',
    notes: r.notes || '', status: 'watch',
  };
}

// --- optional Racing API enrichment for rows that carry a horseid ---
async function api(path) {
  const res = await fetch(API + path, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64') },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
async function enrich(lot) {
  if (!USER || !PASS || !lot.horseid) return lot;
  try {
    const d = await api(`/horses/${encodeURIComponent(lot.horseid)}/results`);
    const runs = (d && (d.results || d.data || [])) || [];
    const ratings = runs.map((x) => +x.or).filter((n) => Number.isFinite(n) && n);
    if (ratings.length && !lot.rating) lot.rating = Math.max(...ratings);
    if (!lot.starts || lot.starts === 99) lot.starts = runs.length || lot.starts;
    lot.awForm = lot.awForm || runs.some((x) => /aw|tapeta|polytrack|dirt/i.test(String(x.surface || x.going || '')));
  } catch { /* enrichment is best-effort */ }
  return lot;
}

function saleIdFromFile(file, rows) {
  const fromCol = rows.find((r) => r.sale)?.sale;
  if (fromCol) return fromCol;
  return basename(file, '.csv').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function main() {
  if (!existsSync(DIR)) {
    console.error(`No catalogue dir at ${DIR} — nothing to build.`);
    writeFileSync(OUT, JSON.stringify({ generated: null, sales: [] }, null, 2));
    return;
  }
  const files = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.csv')).sort();
  const sales = [];
  const seenSale = new Set();
  for (const f of files) {
    const rows = parseCSV(readFileSync(join(DIR, f), 'utf8')).filter((r) => r.name);
    if (!rows.length) continue;
    const label = saleIdFromFile(f, rows);
    let lots = rows.map((r) => rowToLot(r, label));
    lots = await Promise.all(lots.map(enrich));
    sales.push({ id: f.replace(/\.csv$/i, ''), label, count: lots.length, lots });
    seenSale.add(label.toLowerCase());
    console.error(`  ${label}: ${lots.length} lots`);
  }

  // Optional: pull configured feed sources (real sale houses). Runs in CI,
  // where there's internet; SCRAPE=1 to enable. Fail-safe — a source that
  // returns nothing is simply skipped.
  if (process.env.SCRAPE === '1') {
    console.error('SCRAPE=1 — fetching configured sale sources…');
    const fetched = await fetchConfiguredSources();
    for (const src of fetched) {
      if (seenSale.has(String(src.sale).toLowerCase())) continue; // CSV file wins
      const clean = src.rows.filter((r) => r.name);
      if (!clean.length) continue;
      let lots = clean.map((r) => rowToLot(r, src.sale));
      lots = await Promise.all(lots.map(enrich));
      sales.push({ id: src.sale.replace(/\s+/g, '-').toLowerCase(), label: src.sale, count: lots.length, lots });
      seenSale.add(String(src.sale).toLowerCase());
    }
  }
  // Stamp is passed in by the workflow (scripts can't read the clock here in
  // the harness, but Node in CI can) — use ISO now.
  const generated = new Date().toISOString();
  writeFileSync(OUT, JSON.stringify({ generated, sales }, null, 2));
  console.error(`Wrote ${OUT}: ${sales.length} sale(s), ${sales.reduce((n, s) => n + s.count, 0)} lots.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
