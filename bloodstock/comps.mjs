/* Comps builder — turn scraped/hand-built sale RESULTS into sire medians the
   app's expected-price model uses. Replaces the seed estimates in
   app/data/sire-medians.json with computed medians (est:false).

   Input CSV (any extra columns ignored):  sire,price
     - price in guineas (or the sale's unit, kept consistent per file)
     - one row per sold lot; unsold/withdrawn rows omitted

   Usage:
     node comps.mjs results-autumn-hit-2025.csv [more.csv ...]
   Output:
     app/data/sire-medians.json  (only sires with n >= MIN_N are written;
     seed entries for sires still lacking data are preserved as est:true) */

import { readFileSync, writeFileSync } from 'node:fs';

const OUT = new URL('./app/data/sire-medians.json', import.meta.url).pathname;
const MIN_N = 3; // fewer than 3 sold lots is an anecdote, not a median

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node comps.mjs <results.csv> [...]');
  process.exit(1);
}

const bySire = new Map();
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean);
  const head = lines.shift().toLowerCase().split(',').map((h) => h.trim());
  const si = head.indexOf('sire'), pi = head.indexOf('price');
  if (si < 0 || pi < 0) { console.error(`${f}: needs sire,price columns`); continue; }
  for (const line of lines) {
    const cols = line.split(',');
    const sire = (cols[si] || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/"/g, '').trim();
    const price = +String(cols[pi] || '').replace(/[^0-9.]/g, '');
    if (!sire || !Number.isFinite(price) || price <= 0) continue;
    if (!bySire.has(sire)) bySire.set(sire, []);
    bySire.get(sire).push(price);
  }
  console.log(`${f}: parsed`);
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// preserve seed entries for sires we still have no data on
let existing = {};
try { existing = JSON.parse(readFileSync(OUT, 'utf8')); } catch { /* fresh file */ }
const meta = existing._meta || {};
delete existing._meta;

const out = { ...existing };
let computed = 0;
for (const [sire, prices] of bySire) {
  if (prices.length < MIN_N) continue;
  out[sire] = { median: Math.round(median(prices)), n: prices.length, est: false };
  computed++;
}

out._meta = { ...meta, units: 'gns',
  generated: `comps.mjs — computed ${computed} sires from ${files.length} file(s)` };
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`${computed} sire medians computed (min n=${MIN_N}); seeds kept for the rest → ${OUT}`);
