/* Outcome-tree backtest — MEASURE the real probability tree instead of
   assuming 10/20/40/30.

   Method (needs no auction data — builds its own cohort from race results,
   a less biased sample than sale lots): take every horse that, in a window
   ~13-15 months ago, matched the radar profile at that time (OR in band,
   dirt-line sire, age <= 4, few prior starts), then follow each for the
   next 12 months and classify the outcome into the four residual branches.
   Print the empirical distribution, the £-weighted residual it implies, and
   the pTop/pWin base rates to drop into engine.js.

   Environment:
     RACING_API_USERNAME / RACING_API_PASSWORD  required
     COHORT_MONTHS   how far back the cohort window opens (default 15)
     WINDOW_DAYS     width of the cohort window (default 45)
     TRACK_MONTHS    follow-forward horizon (default 12)
     MAX_PAGES       result pages to sweep for the cohort (default 60)
     OUT             write JSON report here (optional)
     DEMO=1          offline synthetic run */

import { writeFileSync } from 'node:fs';

const USER = process.env.RACING_API_USERNAME;
const PASS = process.env.RACING_API_PASSWORD;
const DEMO = process.env.DEMO === '1';
const COHORT_MONTHS = +(process.env.COHORT_MONTHS || 15);
const WINDOW_DAYS = +(process.env.WINDOW_DAYS || 45);
const TRACK_MONTHS = +(process.env.TRACK_MONTHS || 12);
const MAX_PAGES = +(process.env.MAX_PAGES || 60);
const API = 'https://api.theracingapi.com/v1';

const TIER_A = ['dubawi', 'night of thunder', 'too darn hot', 'new bay', 'blue point'];
const DIRT_DAMSIRE = ['street cry', 'shamardal', "medaglia d'oro", 'dubai millennium'];

const BANDS = {
  breakthrough: { label: 'group/listed, 110+, or Meydan black type', value: 350000 },
  winner:       { label: 'won & reprized to 100+',                   value: 120000 },
  mid:          { label: 'competitive, stayed 80-99',                value: 30000 },
  flop:         { label: 'declined / injured / disappeared',         value: 8000 },
};

const lc = (s) => String(s || '').toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (d) => d.toISOString().slice(0, 10);
const dirtLine = (sire, damsire) =>
  TIER_A.some((x) => lc(sire).includes(x)) || DIRT_DAMSIRE.some((x) => lc(damsire).includes(x));

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

const now = new Date();
const MIN_MONTHS = +(process.env.MIN_MONTHS || 9);   // shortest usable horizon
const monthsAgo = (m) => { const d = new Date(now); d.setMonth(d.getMonth() - m); return d; };

async function sweepWindow(from, to) {
  const cohort = new Map();
  for (let page = 0; page < MAX_PAGES; page++) {
    let batch;
    try { batch = await api(`/results?start_date=${iso(from)}&end_date=${iso(to)}&region=gb&region=ire&limit=50&skip=${page * 50}`); }
    catch (e) {
      if (String(e.message).startsWith('422')) return null; // window beyond API history
      console.error(`sweep ${page}: ${e.message}`); break;
    }
    const races = batch?.results ?? [];
    if (!races.length) break;
    for (const race of races) {
      for (const r of race.runners ?? []) {
        const or = +(r.or ?? NaN), age = +(r.age ?? 99);
        if (!Number.isFinite(or) || or < 85 || or > 95 || age > 4) continue;
        if (!dirtLine(r.sire, r.damsire)) continue;
        if (!cohort.has(r.horse_id)) cohort.set(r.horse_id, { id: r.horse_id, name: r.horse, cohortDate: race.date, or });
      }
    }
    await sleep(250);
  }
  return cohort;
}

let lots, usedFrom, usedTo, horizonMonths = TRACK_MONTHS;
if (DEMO) {
  lots = ['breakthrough', 'winner', 'winner', 'mid', 'mid', 'mid', 'mid', 'flop', 'flop', 'breakthrough']
    .map((o) => ({ outcome: o }));
  usedFrom = monthsAgo(COHORT_MONTHS); usedTo = monthsAgo(COHORT_MONTHS - 1);
} else {
  if (!USER || !PASS) { console.error('RACING_API credentials required'); process.exit(1); }
  // Adaptive: walk the window from the requested age toward recent until the
  // API actually serves data (it 422s on dates beyond the plan's history).
  let cohort = null;
  for (let m = COHORT_MONTHS; m >= MIN_MONTHS; m--) {
    const from = monthsAgo(m), to = monthsAgo(m - 1.5);
    process.stdout.write(`trying window ${iso(from)}…${iso(to)} `);
    const c = await sweepWindow(from, to);
    if (c === null) { console.log('→ 422 (beyond API history)'); continue; }
    console.log(`→ ${c.size} profile matches`);
    if (c.size >= 8) { cohort = c; usedFrom = from; usedTo = to; horizonMonths = m; break; }
    if (c.size > 0 && !cohort) { cohort = c; usedFrom = from; usedTo = to; horizonMonths = m; }
  }
  if (!cohort || cohort.size === 0) { console.error('no trackable cohort within API history'); process.exit(1); }
  console.log(`Using window ${iso(usedFrom)}…${iso(usedTo)} — ${cohort.size} horses, tracked to now (~${horizonMonths}mo)`);

  lots = [];
  for (const c of cohort.values()) {
    try {
      const res = await api(`/horses/${c.id}/results`);
      const races = res?.results ?? [];
      const t0 = Date.parse(c.cohortDate);
      const t1 = now.getTime(); // track to now (horizon = window age)
      let priorStarts = 0; const after = [];
      for (const race of races) {
        const me = (race.runners ?? []).find((r) => r.horse_id === c.id);
        if (!me) continue;
        const t = Date.parse(race.date);
        if (t < t0) priorStarts++;
        else if (t > t0 && t <= t1) after.push({ ...me, pattern: race.pattern, race_name: race.race_name });
      }
      if (priorStarts > 7) continue; // exposed at cohort time — not our profile
      lots.push({ name: c.name, outcome: classify(after, c.or) });
      await sleep(300);
    } catch (e) { console.error(`  ! ${c.name}: ${e.message}`); }
  }
}

const n = lots.length;
if (!n) { console.error('no trackable cohort'); process.exit(1); }
const counts = { breakthrough: 0, winner: 0, mid: 0, flop: 0 };
for (const l of lots) counts[l.outcome]++;
const freq = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / n]));
const residual = Object.entries(freq).reduce((s, [k, p]) => s + p * BANDS[k].value, 0);

console.log(`\n=== Measured outcome tree over ${n} profile horses ===`);
for (const k of Object.keys(BANDS)) {
  console.log(`  ${k.padEnd(13)} ${(freq[k] * 100).toFixed(0).padStart(3)}%  (${counts[k]})  £${BANDS[k].value.toLocaleString()}  — ${BANDS[k].label}`);
}
console.log(`\n  MEASURED E[residual] = £${Math.round(residual).toLocaleString()}`);
console.log(`  Assumed tree (10/20/40/30) → £73,400   Δ ${residual >= 73400 ? '+' : ''}£${Math.round(residual - 73400).toLocaleString()}`);
console.log(`\n  Engine base rates to adopt:`);
console.log(`    pTop  ≈ ${freq.breakthrough.toFixed(3)}   (currently 0.04–0.10)`);
console.log(`    pWin  ≈ ${freq.winner.toFixed(3)}   (currently 0.12–0.20)`);
console.log(`  If Δ is sharply negative, current max bids are too generous — recalibrate before bidding.`);

if (process.env.OUT) {
  writeFileSync(process.env.OUT, JSON.stringify({
    generated: iso(now), n, window: { from: iso(usedFrom), to: iso(usedTo), trackMonths: horizonMonths },
    freq, counts, measuredResidual: Math.round(residual), assumedResidual: 73400,
  }, null, 2));
  console.log(`\n  report → ${process.env.OUT}`);
}
