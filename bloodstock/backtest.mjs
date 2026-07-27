/* Outcome-tree backtest — replace the ASSUMED probability tree
   (10/20/40/30) with MEASURED frequencies from horses actually sold at past
   HIT sales in our profile band.

   Input: a CSV of past-sale lots we can track forward —
     name,sold_gns,sale_date   (one row per lot; name must resolve in the API)
   For each, the script pulls the 12 months after sale_date from The Racing
   API and classifies the outcome into the same four branches the engine
   uses, then prints the empirical distribution + the £-weighted residual
   those frequencies imply, so PARAM_DEFAULTS can be recalibrated from data.

   Environment:
     RACING_API_USERNAME / RACING_API_PASSWORD  required
     LOTS      input CSV (default backtest-lots.csv)
     DEMO=1    offline synthetic run

   This is the honesty engine: it does not guess, it measures. Feed it one
   past sale's results and the max-bid math stops being assumption. */

import { readFileSync } from 'node:fs';

const USER = process.env.RACING_API_USERNAME;
const PASS = process.env.RACING_API_PASSWORD;
const DEMO = process.env.DEMO === '1';
const LOTS = process.env.LOTS || 'backtest-lots.csv';
const API = 'https://api.theracingapi.com/v1';

// Outcome bands (align with engine's residual tree). Tune the thresholds as
// the definition of each branch firms up.
const BANDS = {
  breakthrough: { label: 'group/listed or 110+ or Meydan black type', value: 350000 },
  winner:       { label: 'won & reprized to 100+',                     value: 120000 },
  mid:          { label: 'competitive, stayed 80-99',                  value: 30000 },
  flop:         { label: 'declined / injured / disappeared',           value: 8000 },
};

const lc = (s) => String(s || '').toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path) {
  const res = await fetch(API + path, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64') },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function classify(runsAfter, saleOR) {
  if (!runsAfter.length) return 'flop';
  let bestOR = saleOR, blackType = false, won = false;
  for (const r of runsAfter) {
    const or = +(r.or ?? NaN);
    if (Number.isFinite(or)) bestOR = Math.max(bestOR, or);
    if (String(r.position) === '1') won = true;
    const pat = lc(r.pattern) + ' ' + lc(r.race_name);
    if (/group|listed|\bg[123]\b|stakes|meydan|carnival/.test(pat) && +r.position <= 3) blackType = true;
  }
  if (blackType || bestOR >= 110) return 'breakthrough';
  if (won && bestOR >= 100) return 'winner';
  if (bestOR >= 80) return 'mid';
  return 'flop';
}

/* ---------- gather ---------- */
let lots;
if (DEMO) {
  lots = [
    { outcome: 'breakthrough' }, { outcome: 'winner' }, { outcome: 'winner' },
    { outcome: 'mid' }, { outcome: 'mid' }, { outcome: 'mid' }, { outcome: 'mid' },
    { outcome: 'flop' }, { outcome: 'flop' }, { outcome: 'breakthrough' },
  ];
} else {
  if (!USER || !PASS) { console.error('RACING_API credentials required'); process.exit(1); }
  const rows = readFileSync(LOTS, 'utf8').split(/\r?\n/).filter(Boolean);
  const head = rows.shift().toLowerCase().split(',').map((h) => h.trim());
  const ni = head.indexOf('name'), di = head.indexOf('sale_date');
  lots = [];
  for (const line of rows) {
    const cols = line.split(',');
    const name = (cols[ni] || '').trim(), saleDate = (cols[di] || '').trim();
    if (!name || !saleDate) continue;
    try {
      const s = await api(`/horses/search?name=${encodeURIComponent(name)}`);
      const id = s?.search_results?.[0]?.id ?? s?.horses?.[0]?.id;
      if (!id) { console.error(`  ? ${name}: not found`); continue; }
      const res = await api(`/horses/${id}/results`);
      const races = res?.results ?? [];
      const t0 = Date.parse(saleDate), t1 = t0 + 365 * 86400000;
      let saleOR = 0; const after = [];
      for (const race of races) {
        const me = (race.runners ?? []).find((r) => r.horse_id === id);
        if (!me) continue;
        const t = Date.parse(race.date);
        if (t <= t0) { const or = +(me.or ?? 0); if (or) saleOR = Math.max(saleOR, or); }
        else if (t <= t1) after.push({ ...me, pattern: race.pattern, race_name: race.race_name });
      }
      lots.push({ name, outcome: classify(after, saleOR) });
      console.log(`  ${name}: ${lots.at(-1).outcome}`);
      await sleep(400);
    } catch (e) { console.error(`  ! ${name}: ${e.message}`); }
  }
}

/* ---------- report ---------- */
const n = lots.length;
if (!n) { console.error('no trackable lots'); process.exit(1); }
const counts = { breakthrough: 0, winner: 0, mid: 0, flop: 0 };
for (const l of lots) counts[l.outcome]++;
const freq = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / n]));
const residual = Object.entries(freq).reduce((sum, [k, p]) => sum + p * BANDS[k].value, 0);

console.log(`\n=== Backtest over ${n} lots ===`);
for (const k of Object.keys(BANDS)) {
  console.log(`  ${k.padEnd(13)} ${(freq[k] * 100).toFixed(0).padStart(3)}%  (${counts[k]})  £${BANDS[k].value.toLocaleString()}  — ${BANDS[k].label}`);
}
console.log(`\n  MEASURED E[residual] = £${Math.round(residual).toLocaleString()}`);
console.log(`  Engine's assumed tree (10/20/40/30) → £73,400`);
console.log(`  Δ ${residual > 73400 ? '+' : ''}£${Math.round(residual - 73400).toLocaleString()} — if negative, current max bids are too generous.`);
console.log(`\n  To adopt: set engine pTop/pWin base rates from the frequencies above.`);
