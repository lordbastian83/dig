/* vault racing — catalogue source ingestion.

   Config-driven, fail-safe fetcher for real sale catalogues. Reads
   scrapers/sources.json; for each sale source it either:
     • fetches a CSV/JSON feed URL (when `url` is set), or
     • defers to a CSV file in bloodstock/catalogues/ (the reliable path).

   It runs inside the bloodstock-catalogue GitHub Action, which HAS internet
   access — the dev sandbox does not, so feed URLs can't be validated locally
   and must be confirmed by a CI run. Every fetch is wrapped so a failing or
   unconfigured source yields [] and never breaks the build.

   Why no URLs are pre-filled: the sale houses (Tattersalls, Arqana, Goffs,
   Keeneland) publish catalogues as web pages with no documented public feed,
   and the autumn 2026 catalogues have not dropped yet (see catalogue_expected
   in sources.json). When a house exposes a CSV/JSON feed, drop its address in
   `url`; otherwise export the catalogue to CSV into ../catalogues/. */

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

// pull a nested value by dotted path, e.g. "data.hips"
const dig = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

// Map a JSON feed's lot array to the app's CSV-row column names.
function mapJson(json, map) {
  const arr = map.lots ? dig(json, map.lots) : json;
  if (!Array.isArray(arr)) return [];
  const cols = Object.entries(map).filter(([k]) => k !== 'lots');
  return arr.map((item) => {
    const row = {};
    for (const [col, path] of cols) row[col] = dig(item, path) ?? '';
    return row;
  });
}

// Remap a house's own column names to the app's canonical fields. `columns`
// is { "source header (lower-case)": "appField" } — e.g. Keeneland's
// { "hip": "lot", "broodmare sire": "damsire", "consignor": "vendor",
//   "estimate": "guide" }. Unmapped columns pass through untouched, so a
// header that already matches (sire, dam, …) still works.
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

// Fetch + normalise one source into raw catalogue rows (each row is later
// mapped to a scored lot by catalogue.mjs). Never throws.
async function fetchSource(src) {
  const stamp = (rows) => applyColumns(rows, src.columns)
    .map((r) => ({ ...r, sale: r.sale || src.sale, ccy: r.ccy || src.ccy }));
  try {
    if (src.url) {
      const res = await fetch(src.url, { headers: { 'user-agent': 'vault-racing-catalogue/1.0' } });
      if (!res.ok) { console.error(`  ${src.sale}: feed ${res.status} — skipped`); return []; }
      if ((src.format || 'csv') === 'json') return stamp(mapJson(await res.json(), src.map || {}));
      return stamp(parseCSV(await res.text()));
    }
    if (src.file) {
      // House-native-header exports live in catalogues/sources/ so the raw
      // directory scan (which expects app-canonical headers) skips them and
      // the column-alias mapping here applies instead.
      const p = join(HERE, '..', 'catalogues', 'sources', src.file);
      if (!existsSync(p)) { console.error(`  ${src.sale}: no feed url and no sources/${src.file} — awaiting catalogue`); return []; }
      return stamp(parseCSV(readFileSync(p, 'utf8')));
    }
    console.error(`  ${src.sale}: no url or file configured`);
    return [];
  } catch (e) {
    console.error(`  ${src.sale}: ${e && e.message || e} — skipped`);
    return [];
  }
}

// Fetch every configured source; returns [{ sale, ccy, rows }] with any rows.
export async function fetchConfiguredSources() {
  const cfgPath = join(HERE, 'sources.json');
  if (!existsSync(cfgPath)) return [];
  let cfg;
  try { cfg = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { return []; }
  const sources = Array.isArray(cfg.sources) ? cfg.sources : [];
  const out = [];
  for (const src of sources) {
    const rows = await fetchSource(src);
    if (rows.length) { out.push({ sale: src.sale, ccy: src.ccy, rows }); console.error(`  ${src.sale}: ${rows.length} lots`); }
  }
  return out;
}
