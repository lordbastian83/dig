/* Dirt-translation table builder — replace the hand-picked sire tiers with
   MEASURED dirt win rates. Once the Carnival runs (Nov-Mar), sweep Meydan /
   UAE results and compute, per sire, the strike rate of European imports on
   dirt. Sires that actually translate rise to tier A from evidence, not
   reputation — the most defensible edge in the system.

   Output: app/data/sire-dirt.json  { sire: {runs, wins, rate, tier} }
   The scan/engine can prefer this over the static list when present.

   Environment:
     RACING_API_USERNAME / RACING_API_PASSWORD  required
     SEASONS   comma years to include (default current)
     MIN_RUNS  minimum dirt runs to rank a sire (default 8)
     DEMO=1    offline synthetic run */

import { writeFileSync } from 'node:fs';

const USER = process.env.RACING_API_USERNAME;
const PASS = process.env.RACING_API_PASSWORD;
const DEMO = process.env.DEMO === '1';
const MIN_RUNS = +(process.env.MIN_RUNS || 8);
const OUT = new URL('./app/data/sire-dirt.json', import.meta.url).pathname;
const API = 'https://api.theracingapi.com/v1';

const lc = (s) => String(s || '').toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path) {
  const res = await fetch(API + path, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64') },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

const bySire = new Map(); // sire -> {runs, wins}
function record(sire, won) {
  const k = lc(sire).replace(/\(.*?\)/g, '').trim();
  if (!k) return;
  const e = bySire.get(k) || { runs: 0, wins: 0 };
  e.runs++; if (won) e.wins++;
  bySire.set(k, e);
}

if (DEMO) {
  // synthetic: dubawi translates, a turf sire doesn't
  for (let i = 0; i < 20; i++) record('Dubawi', i % 3 === 0);
  for (let i = 0; i < 15; i++) record('Turf Only Sire', i % 12 === 0);
} else {
  if (!USER || !PASS) { console.error('RACING_API credentials required'); process.exit(1); }
  // VERIFY endpoint/params against the API's Meydan/UAE coverage; region and
  // course filters may differ. This is the shape to fill once Carnival runs.
  for (let page = 0; page < 40; page++) {
    let batch;
    try { batch = await api(`/results?region=uae&limit=50&skip=${page * 50}`); }
    catch (e) { console.error(`page ${page}: ${e.message}`); break; }
    const races = (batch?.results ?? []).filter((r) => /dirt|meydan/.test(lc(r.surface) + lc(r.course)));
    if (!batch?.results?.length) break;
    for (const race of races) {
      for (const r of race.runners ?? []) record(r.sire, String(r.position) === '1');
    }
    await sleep(300);
  }
}

const table = {};
for (const [sire, e] of bySire) {
  if (e.runs < MIN_RUNS) continue;
  const rate = e.wins / e.runs;
  table[sire] = { runs: e.runs, wins: e.wins, rate: +rate.toFixed(3),
    tier: rate >= 0.14 ? 'A' : rate >= 0.08 ? 'B' : '' };
}
table._meta = { generated: 'dirt-tiers.mjs', min_runs: MIN_RUNS,
  note: 'Measured UAE/dirt strike rate of imports by sire. tier A >=14%, B >=8%.' };

writeFileSync(OUT, JSON.stringify(table, null, 2) + '\n');
const ranked = Object.entries(table).filter(([k]) => k !== '_meta')
  .sort((a, b) => b[1].rate - a[1].rate);
console.log(`${ranked.length} sires ranked by measured dirt rate → ${OUT}`);
for (const [s, e] of ranked.slice(0, 12)) console.log(`  ${e.tier || '-'} ${s} — ${(e.rate * 100).toFixed(0)}% of ${e.runs}`);
