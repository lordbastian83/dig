/* Tattersalls catalogue scraper — lot pages → catalogue.csv for ingest.mjs.

   Tattersalls publish every lot as a public web page but offer no API, and
   the exact markup can change per sale. The selectors/regexes below are
   therefore configuration, expected to need a 10-minute tune when the
   Autumn HIT catalogue drops (~6 Oct) — run with one lot URL, adjust the
   LOT_PATTERNS until the parsed output looks right, then run the full sale.

   Usage:
     node scrape-tattersalls.mjs --demo                 # offline pipeline test
     node scrape-tattersalls.mjs <sale-lots-index-url>  # live scrape

   Output: catalogue.csv (columns ingest.mjs expects). Black-type detection
   is a heuristic (bold-caps race names in the page text) — treat blackType
   as provisional until the catalogue page is eyeballed. */

import { writeFileSync } from 'node:fs';

const OUT = process.env.OUT || 'catalogue.csv';
const DEMO = process.argv.includes('--demo');
const INDEX_URL = process.argv.find((a) => a.startsWith('http'));

// --- tune these against the live catalogue markup (VERIFY on drop) ---
const LOT_LINK_RE = /href="([^"]*\/lot\/[^"]+)"/gi;      // lot links on the index
const LOT_PATTERNS = {
  name:   /<h1[^>]*>([^<]+)<\/h1>/i,
  lot:    /Lot\s+(\d+)/i,
  sire:   /(?:sire|by)\s*[:>]?\s*<[^>]*>?\s*([A-Z][A-Za-z' ]+)\s*\(/,
  dam:    /(?:dam|out of)\s*[:>]?\s*<[^>]*>?\s*([A-Z][A-Za-z' ]+)\s*\(/,
  vendor: /(?:consignor|vendor)\s*[:>]?\s*<[^>]*>?\s*([^<]+)</i,
};
const BLACK_TYPE_RE = /<b>[A-Z][A-Z' ]{3,}<\/b>|<strong>[A-Z][A-Z' ]{3,}<\/strong>/;
// ---------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const HEAD = 'name,lot,sale,sire,dam,vendor,rating,starts,vet,powerhouse,blackType,awForm,notes';

function toRow(l) {
  return [l.name, l.lot, l.sale, l.sire, l.dam, l.vendor, '', '', 'unknown',
    '', l.blackType ? 'yes' : '', '', l.notes || ''].map(esc).join(',');
}

if (DEMO) {
  const demo = [
    { name: 'Demo Lot A', lot: '101', sale: 'DEMO', sire: 'Night Of Thunder',
      dam: 'Demo Mare (Shamardal)', vendor: 'Godolphin', blackType: true },
    { name: 'Demo Lot B', lot: '102', sale: 'DEMO', sire: 'Turf Only Sire',
      dam: 'Plain Mare (Plain Sire)', vendor: 'Small Stud', blackType: false },
  ];
  writeFileSync(OUT, [HEAD, ...demo.map(toRow)].join('\n'));
  console.log(`demo: ${demo.length} lots → ${OUT}`);
  process.exit(0);
}

if (!INDEX_URL) {
  console.error('usage: node scrape-tattersalls.mjs --demo | <sale-lots-index-url>');
  process.exit(1);
}

console.log(`fetching index ${INDEX_URL}`);
const index = await (await fetch(INDEX_URL)).text();
const links = [...new Set([...index.matchAll(LOT_LINK_RE)].map((m) => new URL(m[1], INDEX_URL).href))];
console.log(`${links.length} lot links found${links.length === 0 ? ' — LOT_LINK_RE needs tuning against this page' : ''}`);

const lots = [];
for (const url of links) {
  try {
    const html = await (await fetch(url)).text();
    const pick = (re) => (html.match(re)?.[1] || '').replace(/\s+/g, ' ').trim();
    const lot = {
      name: pick(LOT_PATTERNS.name), lot: pick(LOT_PATTERNS.lot),
      sale: new URL(INDEX_URL).pathname.split('/').filter(Boolean).pop() || 'Tattersalls',
      sire: pick(LOT_PATTERNS.sire), dam: pick(LOT_PATTERNS.dam),
      vendor: pick(LOT_PATTERNS.vendor),
      blackType: BLACK_TYPE_RE.test(html),
      notes: lotNeedsCheck(pick) ? '[SCRAPE INCOMPLETE — verify against page]' : '',
    };
    lots.push(lot);
    console.log(`  ${lot.lot || '?'} ${lot.name || url}`);
  } catch (e) {
    console.error(`  ! ${url}: ${e.message}`);
  }
  await sleep(700); // be polite
}

function lotNeedsCheck(pick) {
  return !pick(LOT_PATTERNS.name) || !pick(LOT_PATTERNS.sire);
}

writeFileSync(OUT, [HEAD, ...lots.map(toRow)].join('\n'));
console.log(`${lots.length} lots → ${OUT}. Next: node ingest.mjs (with RACING_API creds) to enrich.`);
