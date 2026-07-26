/* Bloodstock catalogue ingest — enrich a catalogue CSV into app-ready JSON.

   Reads a CSV with at minimum: name,lot,sale,sire,dam,vendor
   (rating/starts/awForm are filled from feeds when missing), queries
   The Racing API for each horse's form, and writes lots.json that the
   scanner app's "Restore JSON" button understands.

   Environment:
     RACING_API_USERNAME  ┐ HTTP basic auth for api.theracingapi.com
     RACING_API_PASSWORD  ┘ (Actions secrets, same pattern as FMP_API_KEY)
     CATALOGUE            input CSV path  (default catalogue.csv)
     OUT                  output path     (default lots.json)

   NOTE: endpoint paths below follow The Racing API's published v1 layout
   but MUST be verified against their docs once credentials exist — they
   are marked VERIFY. The script fails soft per-horse: anything it cannot
   enrich is emitted with nulls so the app flags it for manual entry. */

import { readFileSync, writeFileSync } from 'node:fs';

const USER = process.env.RACING_API_USERNAME;
const PASS = process.env.RACING_API_PASSWORD;
const CATALOGUE = process.env.CATALOGUE || 'catalogue.csv';
const OUT = process.env.OUT || 'lots.json';
const API = 'https://api.theracingapi.com/v1';

// AW / PSF courses — a win or best figure here is the dirt proxy (filter 6).
const AW_COURSES = [
  'newcastle', 'wolverhampton', 'kempton', 'lingfield', 'southwell',
  'chelmsford', 'dundalk',
  'deauville', 'chantilly', 'cagnes-sur-mer', 'pornichet', // French PSF
];

// Filter 2 sire tiers — maintain by hand, this is analysis not data.
const SIRE_TIER_A = ['dubawi', 'night of thunder', 'too darn hot', 'new bay', 'blue point'];
const DIRT_DAMSIRE = ['street cry', 'shamardal', 'medaglia d\'oro', 'dubai millennium'];
const POWERHOUSE = ['godolphin', 'juddmonte', 'shadwell', 'darley'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- tiny CSV parser (quoted fields, same dialect the app exports) */
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
  const head = rows.shift().map((h) => h.trim().toLowerCase());
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

/* ---------- The Racing API ---------- */
async function api(path) {
  if (!USER || !PASS) return null;
  const res = await fetch(API + path, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64') },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

async function enrich(horse) {
  try {
    // VERIFY: horse search endpoint & response shape against the API docs.
    const search = await api(`/horses/search?name=${encodeURIComponent(horse.name)}`);
    const id = search?.horses?.[0]?.id ?? search?.search_results?.[0]?.horse_id;
    if (!id) return { enriched: false };

    // VERIFY: results endpoint & row fields (course, position, or/rating).
    const res = await api(`/horses/${id}/results`);
    const runs = res?.results ?? [];
    const starts = runs.length;
    const awForm = runs.some((r) => {
      const course = String(r.course || '').toLowerCase();
      const won = String(r.position ?? r.pos ?? '') === '1';
      return won && AW_COURSES.some((c) => course.includes(c));
    });
    // Official rating: take the most recent non-empty OR carried in a result
    // row if present; otherwise leave for the BHA ratings sheet / manual.
    const rating = runs.map((r) => +(r.or ?? r.official_rating ?? NaN))
      .find(Number.isFinite) ?? null;
    return { enriched: true, starts, awForm, rating };
  } catch (e) {
    console.error(`  ! ${horse.name}: ${e.message}`);
    return { enriched: false };
  }
}

/* ---------- static classification ---------- */
const lc = (s) => String(s || '').toLowerCase();
function classify(h) {
  const sire = lc(h.sire), dam = lc(h.dam), vendor = lc(h.vendor);
  const sireTier = SIRE_TIER_A.some((s) => sire.includes(s)) ? 'A'
    : DIRT_DAMSIRE.some((s) => dam.includes(s)) ? 'B' : '';
  const powerhouse = POWERHOUSE.some((p) => vendor.includes(p));
  return { sireTier, powerhouse };
}

/* ---------- main ---------- */
const input = parseCSV(readFileSync(CATALOGUE, 'utf8'));
console.log(`${input.length} lots read from ${CATALOGUE}`);
if (!USER || !PASS) console.log('No RACING_API credentials — emitting catalogue fields only.');

const bool = (v) => ['true', 'yes', '1', 'y'].includes(lc(v));
const lots = [];
for (const row of input) {
  const base = {
    name: row.name, lot: row.lot || '', sale: row.sale || '',
    sire: row.sire || '', dam: row.dam || '', vendor: row.vendor || '',
    rating: row.rating ? +row.rating : null,
    starts: row.starts ? +row.starts : null,
    awForm: bool(row.awform), blackType: bool(row.blacktype),
    vet: row.vet || 'unknown', notes: row.notes || '',
    status: 'watch', added: new Date().toISOString().slice(0, 10),
  };
  Object.assign(base, classify(base));
  if (row.siretier) base.sireTier = row.siretier.toUpperCase();
  if (bool(row.powerhouse)) base.powerhouse = true;

  if ((base.rating == null || base.starts == null || !base.awForm) && USER) {
    const extra = await enrich(base);
    if (extra.enriched) {
      base.rating = base.rating ?? extra.rating;
      base.starts = base.starts ?? extra.starts;
      base.awForm = base.awForm || extra.awForm;
    }
    await sleep(400); // stay polite to the API
  }
  const missing = ['rating', 'starts'].filter((k) => base[k] == null);
  if (missing.length) base.notes = `[NEEDS: ${missing.join(', ')}] ${base.notes}`.trim();
  lots.push(base);
  console.log(`  ${base.name} — OR ${base.rating ?? '?'}, ${base.starts ?? '?'} starts, AW ${base.awForm}`);
}

writeFileSync(OUT, JSON.stringify({ watchlist: lots }, null, 2));
console.log(`${lots.length} lots written to ${OUT} — load via the app's Restore JSON button.`);
