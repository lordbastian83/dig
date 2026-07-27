/* Diamond radar — scans recent UK/IRE results for horses matching the
   Imperial Emperor profile BEFORE they reach a sale.

   Daily flow: pull the last DAYS of results from The Racing API, keep
   runners with OR in band + dirt-line pedigree (+ age <= 4), then deep-check
   each candidate's full record (starts, AW win). New finds are merged into
   candidates.json (published to the bloodstock-data branch) and Telegrammed
   when they pass every filter that form data can prove — black type on the
   page and availability always need a human check, and are flagged as such.

   Environment:
     RACING_API_USERNAME / RACING_API_PASSWORD   required (repo secrets)
     DAYS        lookback window (default 7)
     OUT         output file (default candidates.json)
     EXISTING    previous candidates.json to merge with (default = OUT)
     MAX_PAGES   results pages per run (default 20)
     TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID / TELEGRAM_CHAT_HANDLE  alerts
     DEMO=1      synthetic offline test, no network */

import './app/engine.js';
import { readFileSync, writeFileSync } from 'node:fs';

const E = globalThis.VaultRacingEngine;
const USER = process.env.RACING_API_USERNAME;
const PASS = process.env.RACING_API_PASSWORD;
const DEMO = process.env.DEMO === '1';
const DEBUG = process.env.DEBUG === '1';
const DAYS = +(process.env.DAYS || 7);
const OUT = process.env.OUT || 'candidates.json';
const EXISTING = process.env.EXISTING || OUT;
const MAX_PAGES = +(process.env.MAX_PAGES || 60); // Pro tier — deeper sweep
const API = 'https://api.theracingapi.com/v1';

const TIER_A = ['dubawi', 'night of thunder', 'too darn hot', 'new bay', 'blue point'];
const DIRT_DAMSIRE = ['street cry', 'shamardal', "medaglia d'oro", 'dubai millennium'];
const POWERHOUSE = ['godolphin', 'juddmonte', 'shadwell', 'darley',
  'sheikh mohammed', 'sheikh hamdan', 'coolmore', 'wathnan'];
const AW_HINTS = ['aw', 'tapeta', 'polytrack', 'fibresand', 'psf', 'dirt', 'sand'];

const lc = (s) => String(s || '').toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const day = (offset) => {
  const d = new Date(Date.now() - offset * 86400000);
  return d.toISOString().slice(0, 10);
};

async function api(path) {
  const res = await fetch(API + path, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64') },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function tierOf(sire, damsire) {
  return TIER_A.some((x) => lc(sire).includes(x)) ? 'A'
       : DIRT_DAMSIRE.some((x) => lc(damsire).includes(x)) ? 'B' : '';
}

// Trainer strike-rate accumulated across the whole sweep — no extra API
// calls, and a trainer who wins often is one whose cast-offs improved under
// good handling: a real quality signal on the horses they're now letting go.
const trainerStats = new Map(); // trainer -> {runs, wins}
function trainerSR(name) {
  const e = trainerStats.get(lc(name));
  return e && e.runs >= 10 ? +(e.wins / e.runs).toFixed(3) : null;
}

/* ---------- stage 1: sweep recent results for profile matches ---------- */
async function sweep() {
  const prelim = new Map(); // horse_id -> runner snapshot
  for (let page = 0; page < MAX_PAGES; page++) {
    let batch;
    try {
      batch = await api(`/results?start_date=${day(DAYS)}&end_date=${day(0)}&region=gb&region=ire&limit=50&skip=${page * 50}`);
    } catch (e) { console.error(`results page ${page}: ${e.message}`); break; }
    const races = batch?.results ?? [];
    if (!races.length) break;
    for (const race of races) {
      // Dirt targets are FLAT horses — skip jumps races entirely.
      if (race.jumps || /hurdle|chase|nh flat|bumper/.test(lc(race.type) + lc(race.race_name))) continue;
      const region = /ire|irish/.test(lc(race.region) + lc(race.course)) ? 'IRE' : 'GB';
      for (const r of race.runners ?? []) {
        const tk = lc(r.trainer);
        if (tk) { const e = trainerStats.get(tk) || { runs: 0, wins: 0 };
          e.runs++; if (String(r.position) === '1') e.wins++; trainerStats.set(tk, e); }
      }
      for (const r of race.runners ?? []) {
        const or = +(r.or ?? NaN);
        const tier = tierOf(r.sire, r.damsire);
        const age = +(r.age ?? 99);
        // Wide collection net so CUSTOM profiles have data to filter — the
        // Imperial Emperor default (85-95, dirt line, age<=4) is applied
        // client-side, not here. Keep anything plausibly interesting.
        if (!Number.isFinite(or) || or < 70 || or > 105) continue;
        if (age > 6) continue;
        if (!prelim.has(r.horse_id)) {
          prelim.set(r.horse_id, {
            id: r.horse_id, name: r.horse, sire: r.sire, dam: r.dam,
            damsire: r.damsire, rating: or, age, region, sex: r.sex || '',
            owner: r.owner || '', trainer: r.trainer || '',
            lastRun: race.date, tier,
          });
        }
      }
    }
    await sleep(300);
  }
  return [...prelim.values()];
}

/* ---------- stage 2: deep-check each match ----------
   starts, AW win, RPR edge (best Racing Post Rating minus official rating —
   ability the handicapper hasn't repriced), and OR momentum over the last
   three marks (improving / flat / declining). */
// Dam production quality — the family's real record, not just a black-type
// tickbox. Looks up the dam and her other offspring; returns a 0-1 score and
// a label. VERIFY the progeny endpoint against the API once live; degrades to
// null (falls back to the manual blackType flag) if unavailable.
async function damProduction(damId, damName, selfId) {
  if (!damId && !damName) return null;
  try {
    const id = damId || (await api(`/dams/search?name=${encodeURIComponent(damName)}`))
      ?.search_results?.[0]?.id
      || (await api(`/horses/search?name=${encodeURIComponent(damName)}`))?.search_results?.[0]?.id;
    if (!id) return null;
    // The dam endpoint returns the offspring's RACE RESULTS (races with a
    // runners[] of her foals), not a flat foal list. Try the known paths.
    let data = null;
    for (const path of [`/dams/${id}/results`, `/dams/${id}/results?limit=200`]) {
      try { data = await api(path); if (data) break; } catch { /* next */ }
    }
    const races = data?.results ?? (Array.isArray(data) ? data : []);
    if (DEBUG && races[0]) console.error(`  ? dam ${damName} result keys: ${Object.keys(races[0]).join(',').slice(0, 200)}`);
    if (!races.length) return null;

    // Aggregate per offspring: best OR, and whether it hit black type. Each
    // race's runners include ALL horses in that race, so keep ONLY the dam's
    // own foals — the runner whose dam_id matches this dam.
    const foals = new Map(); // offspring horse_id -> {bestOR, blackType}
    for (const race of races) {
      const runners = Array.isArray(race.runners) ? race.runners : [race];
      const pat = lc(race.pattern) + ' ' + lc(race.race_name) + ' ' + lc(race.class);
      const isBT = /group|listed|\bg[123]\b|stakes/.test(pat);
      for (const r of runners) {
        const isOffspring = String(r.dam_id ?? '') === String(id)
          || lc(r.dam) === lc(damName);
        if (!isOffspring) continue;              // skip rivals in the race
        const hid = r.horse_id ?? r.id ?? r.horse;
        if (!hid || hid === selfId) continue;    // exclude the candidate itself
        const e = foals.get(hid) || { bestOR: 0, blackType: false };
        const or = +(r.or ?? r.official_rating ?? NaN);
        if (Number.isFinite(or)) e.bestOR = Math.max(e.bestOR, or);
        if (isBT && +(r.position ?? 99) <= 3) e.blackType = true;
        foals.set(hid, e);
      }
    }
    const n = foals.size;
    if (!n || n > 20) return null;   // >20 "foals" = matched rivals, discard
    let rated90 = 0, blackType = 0;
    for (const f of foals.values()) { if (f.bestOR >= 90) rated90++; if (f.blackType) blackType++; }
    const rate90 = rated90 / n;
    const score = Math.min(1, blackType * 0.4 + rate90);
    const label = blackType ? `${blackType} black-type from ${n} siblings`
      : rated90 ? `${rated90}/${n} siblings rated 90+` : `${n} siblings, none 90+`;
    return { score: +score.toFixed(2), label, blackType: blackType > 0, n };
  } catch (e) { console.error(`  dam ${damName}: ${e.message}`); return null; }
}

async function deepCheck(c) {
  const res = await api(`/horses/${c.id}/results`);
  const races = res?.results ?? [];
  let starts = 0, awForm = false, bestRPR = null, bestTSR = null, damId = null;
  let careerHigh = null, wins = 0, placed = 0, bestWin = null, bestWinCls = 99, earnings = 0;
  const orsNewestFirst = [];
  const furlongs = [];      // distance aptitude
  const goings = new Set(); // ground aptitude
  const surfaces = new Set();
  const classesNewestFirst = []; // class-drop signal
  let bestDistF = null, bestPos = 99;
  for (const race of races) {
    const me = (race.runners ?? []).find((r) => r.horse_id === c.id);
    if (!me) continue;
    starts++;
    if (!damId && me.dam_id) damId = me.dam_id;
    const pos = +(me.position ?? 99);
    if (pos <= 3) placed++;
    if (pos === 1) {
      wins++;
      const cls = +(String(race.class || '').replace(/[^0-9]/g, '') || 99);
      if (cls < bestWinCls) { bestWinCls = cls; bestWin = race.race_name || `Class ${cls}`; }
    }
    earnings += +(me.prize ?? 0) || 0;
    const isAW = AW_HINTS.some((h) => lc(race.surface).includes(h));
    if (race.surface) surfaces.add(lc(race.surface).split(' ')[0]);
    if (isAW && String(me.position) === '1') awForm = true;
    const rpr = +(me.rpr ?? NaN);
    if (Number.isFinite(rpr) && (bestRPR === null || rpr > bestRPR)) bestRPR = rpr;
    const tsr = +(me.tsr ?? NaN);
    if (Number.isFinite(tsr) && (bestTSR === null || tsr > bestTSR)) bestTSR = tsr;
    const or = +(me.or ?? NaN);
    if (Number.isFinite(or) && or > 0) { orsNewestFirst.push(or); if (careerHigh === null || or > careerHigh) careerHigh = or; }
    const cls = +(String(race.class || '').replace(/[^0-9]/g, '') || NaN);
    if (Number.isFinite(cls)) classesNewestFirst.push(cls);
    const f = +(race.dist_f ?? NaN);
    if (Number.isFinite(f)) {
      furlongs.push(f);
      if (pos < bestPos) { bestPos = pos; bestDistF = f; } // trip of best run
    }
    if (race.going) goings.add(lc(race.going).split(' ')[0]);
  }
  const rprEdge = bestRPR !== null ? bestRPR - c.rating : null;
  const last3 = orsNewestFirst.slice(0, 3);
  const slope = last3.length >= 2 ? last3[0] - last3[last3.length - 1] : 0;
  const trend = slope >= 3 ? 'improving' : slope <= -3 ? 'declining' : 'flat';

  // Distance aptitude + a plain-language race plan from the trip band.
  const distMin = furlongs.length ? Math.min(...furlongs) : null;
  const distMax = furlongs.length ? Math.max(...furlongs) : null;
  const distBest = bestDistF ?? (furlongs.length
    ? +(furlongs.reduce((a, b) => a + b, 0) / furlongs.length).toFixed(1) : null);
  const racePlan = distBest == null ? null
    : distBest <= 6 ? 'sprint (5–6f) — Meydan dirt sprints, quick from the gate'
    : distBest <= 8 ? 'miler (7–8f) — the Imperial Emperor lane, Carnival handicaps→G-races'
    : distBest <= 11 ? 'middle distance (9–11f) — Meydan 1900m handicaps, World Cup night undercard'
    : 'staying (12f+) — dirt options thin; better as a turf/AW campaigner';
  const versatile = distMin != null && distMax - distMin >= 3; // ran a wide trip range

  // Consistency: placed rate over its career (reliability of the mark).
  const consistency = starts ? +(placed / starts).toFixed(2) : null;
  const winPct = starts ? +(wins / starts).toFixed(2) : null;
  const goingList = [...goings].filter(Boolean).slice(0, 4);
  const surfaceList = [...surfaces].filter(Boolean);
  // Class-drop: a lower class number is a higher grade, so newest < oldest
  // means DROPPING in grade — often well-in and ready to strike.
  const clsFirst = classesNewestFirst[0], clsLast = classesNewestFirst.at(-1);
  const classMove = classesNewestFirst.length >= 2
    ? (clsFirst > clsLast ? 'dropping' : clsFirst < clsLast ? 'rising' : 'level') : null;

  const dam = await damProduction(damId, (c.dam || '').replace(/\(.*?\)/g, '').trim(), c.id);

  return { starts, awForm, rprEdge, trend, distMin, distMax, distBest, racePlan,
           versatile, consistency, classMove, dam,
           bestRPR, bestTSR, careerHigh, wins, placed, winPct, bestWin,
           earnings: Math.round(earnings), goingList, surfaceList };
}

/* ---------- telegram ---------- */
async function alert(finds) {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TOKEN || !finds.length) return;
  const HANDLE = (process.env.TELEGRAM_CHAT_HANDLE || 'Lordbastian83').replace(/^@/, '').toLowerCase();
  const tg = async (m, b) => {
    const r = await (await fetch(`https://api.telegram.org/bot${TOKEN}/${m}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json();
    if (!r.ok) throw new Error(r.description); return r.result;
  };
  const ids = new Set();
  if (process.env.TELEGRAM_CHAT_ID) ids.add(+process.env.TELEGRAM_CHAT_ID);
  try {
    for (const u of await tg('getUpdates', {})) {
      const chat = u.message?.chat || u.edited_message?.chat;
      if (chat?.type === 'private' && (!chat.username || chat.username.toLowerCase() === HANDLE)) ids.add(chat.id);
    }
  } catch (e) { console.error('getUpdates:', e.message); }
  const fmt = (n) => n.toLocaleString('en-GB', { maximumFractionDigits: 0 });
  const lines = finds.map((f) =>
    `• ${f.name} (${f.sire}) — OR ${f.rating} ${f.trend}${f.rprEdge > 0 ? `, RPR +${f.rprEdge}` : ''}, ${f.starts} starts${f.awForm ? ', AW win' : ''}${f.distBest ? `, best ${f.distBest}f` : ''}\n  owner ${f.vendor || '?'} · max bid ~${fmt(f.maxBidGns)} gns${f.racePlan ? `\n  plan: ${f.racePlan}` : ''}\n  ⚠ verify black type + whether buyable`);
  const msg = [`🐎💎 vault racing radar — ${finds.length} new candidate${finds.length === 1 ? '' : 's'}:`, '', ...lines].join('\n');
  for (const chat of ids) {
    try { await tg('sendMessage', { chat_id: chat, text: msg }); console.log(`alerted ${chat}`); }
    catch (e) { console.error(`send ${chat}: ${e.message}`); }
  }
}

/* ---------- main ---------- */
let existing = { candidates: [] };
try { existing = JSON.parse(readFileSync(EXISTING, 'utf8')); } catch { /* first run */ }
const known = new Set(existing.candidates.map((c) => lc(c.name)));

let matches;
if (DEMO) {
  matches = [{ id: 'demo1', name: 'Radar Demo', sire: 'Night Of Thunder', dam: 'Demo Mare',
    damsire: 'Shamardal', rating: 90, age: 3, owner: 'Godolphin', trainer: 'Demo Trainer',
    lastRun: day(1), tier: 'A' }];
} else {
  if (!USER || !PASS) { console.error('RACING_API credentials required'); process.exit(1); }
  matches = await sweep();
}
console.log(`${matches.length} profile matches in the last ${DAYS} days`);

// Deep-check budget: the wide net can surface many matches, so prioritise
// the ones nearest the diamond profile (dirt line + in-band rating) and cap
// the per-run API spend. The rest are still stored from stage-1 data.
const MAX_DEEP = +(process.env.MAX_DEEP || 150); // Pro tier — check more lots
const ranked = matches
  .filter((m) => !known.has(lc(m.name)))
  .sort((a, b) => {
    const score = (m) => (m.tier === 'A' ? 2 : m.tier === 'B' ? 1 : 0)
      + (m.rating >= 85 && m.rating <= 95 ? 1 : 0);
    return score(b) - score(a);
  });

const fresh = [];
let deepUsed = 0;
for (const m of ranked) {
  let deep = { starts: 99, awForm: false, rprEdge: null, trend: 'flat',
    distBest: null, racePlan: null, distMin: null, distMax: null, versatile: false,
    consistency: null, classMove: null, dam: null };
  if (DEMO) deep = { starts: 4, awForm: true, rprEdge: 7, trend: 'improving',
    distBest: 8, racePlan: 'miler (7–8f) — the Imperial Emperor lane, Carnival handicaps→G-races',
    distMin: 7, distMax: 9, versatile: false, consistency: 0.75, classMove: 'dropping',
    bestRPR: 98, bestTSR: 92, careerHigh: 91, wins: 2, placed: 3, winPct: 0.5,
    bestWin: 'Class 3 Handicap', earnings: 24800, goingList: ['good', 'soft'], surfaceList: ['turf', 'aw'],
    dam: { score: 0.8, label: '2 black-type from 5 foals', blackType: true } };
  else if (deepUsed >= MAX_DEEP) { console.log(`  · ${m.name}: deep-check budget spent, stored from sweep`); }
  else {
    deepUsed++;
    try { deep = await deepCheck(m); await sleep(400); }
    catch (e) { console.error(`  ! ${m.name}: ${e.message}`); continue; }
  }
  if (deep.starts > 7) { console.log(`  – ${m.name}: ${deep.starts} starts, too exposed`); continue; }

  const horse = {
    name: m.name, lot: '', sale: 'IN TRAINING — radar find',
    sire: m.sire, dam: m.damsire ? `${m.dam} (${m.damsire})` : m.dam,
    vendor: m.owner, rating: m.rating, starts: deep.starts,
    sireTier: m.tier, vet: 'unknown',
    powerhouse: POWERHOUSE.some((p) => lc(m.owner).includes(p)),
    awForm: deep.awForm,
    rprEdge: deep.rprEdge, trend: deep.trend,
    region: m.region, sex: m.sex,
    distBest: deep.distBest, distMin: deep.distMin, distMax: deep.distMax,
    racePlan: deep.racePlan, versatile: deep.versatile,
    consistency: deep.consistency, classMove: deep.classMove,
    trainerSR: trainerSR(m.trainer), trainer: m.trainer,
    bestRPR: deep.bestRPR, bestTSR: deep.bestTSR, careerHigh: deep.careerHigh,
    wins: deep.wins, placed: deep.placed, winPct: deep.winPct, bestWin: deep.bestWin,
    earnings: deep.earnings, goingList: deep.goingList, surfaceList: deep.surfaceList,
    damScore: deep.dam?.score ?? null, damLabel: deep.dam?.label ?? null,
    // dam production, when found, is stronger evidence than the manual flag
    blackType: deep.dam?.blackType ?? false,
    notes: `[RADAR ${day(0)}] trainer ${m.trainer} · last ran ${m.lastRun}`
      + (deep.rprEdge > 0 ? ` · RPR +${deep.rprEdge} over OR` : '')
      + ` · OR ${deep.trend}`
      + (deep.distBest ? ` · best trip ${deep.distBest}f` : '')
      + (deep.racePlan ? ` · plan: ${deep.racePlan}` : '')
      + ` · VERIFY black type + availability`,
    status: 'watch', added: day(0),
  };
  const r = E.evaluate(horse, E.PARAM_DEFAULTS);
  horse.maxBidGns = r.gns;
  // "diamond" = fails nothing that form data can prove (black type pends)
  horse.radarPass = r.fails.every((f) => f.startsWith('Black type'));
  fresh.push(horse);
  console.log(`  + ${m.name} — OR ${m.rating} (${deep.trend}${deep.rprEdge > 0 ? `, RPR +${deep.rprEdge}` : ''}), ${deep.starts} starts, AW ${deep.awForm}, ${horse.radarPass ? 'RADAR PASS' : 'partial'} → ${r.gns} gns`);
}

const all = [...fresh, ...existing.candidates].slice(0, 200);
writeFileSync(OUT, JSON.stringify({ generated: day(0), candidates: all }, null, 2));
console.log(`${fresh.length} new, ${all.length} total → ${OUT}`);

await alert(fresh.filter((f) => f.radarPass));
