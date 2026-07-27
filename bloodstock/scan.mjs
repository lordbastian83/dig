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
const DAYS = +(process.env.DAYS || 7);
const OUT = process.env.OUT || 'candidates.json';
const EXISTING = process.env.EXISTING || OUT;
const MAX_PAGES = +(process.env.MAX_PAGES || 20);
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
      for (const r of race.runners ?? []) {
        const or = +(r.or ?? NaN);
        const tier = tierOf(r.sire, r.damsire);
        const age = +(r.age ?? 99);
        if (!Number.isFinite(or) || or < 85 || or > 95) continue;
        if (!tier) continue;
        if (age > 4) continue;
        if (!prelim.has(r.horse_id)) {
          prelim.set(r.horse_id, {
            id: r.horse_id, name: r.horse, sire: r.sire, dam: r.dam,
            damsire: r.damsire, rating: or, age,
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

/* ---------- stage 2: deep-check each match (starts, AW win) ---------- */
async function deepCheck(c) {
  const res = await api(`/horses/${c.id}/results`);
  const races = res?.results ?? [];
  let starts = 0, awForm = false;
  for (const race of races) {
    const me = (race.runners ?? []).find((r) => r.horse_id === c.id);
    if (!me) continue;
    starts++;
    const isAW = AW_HINTS.some((h) => lc(race.surface).includes(h));
    if (isAW && String(me.position) === '1') awForm = true;
  }
  return { starts, awForm };
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
    `• ${f.name} (${f.sire}) — OR ${f.rating}, ${f.starts} starts${f.awForm ? ', AW win' : ''}\n  owner ${f.vendor || '?'} · max bid ~${fmt(f.maxBidGns)} gns\n  ⚠ verify black type + whether buyable`);
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

const fresh = [];
for (const m of matches) {
  if (known.has(lc(m.name))) continue;
  let deep = { starts: 99, awForm: false };
  if (DEMO) deep = { starts: 4, awForm: true };
  else {
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
    blackType: false, // cannot be proven from form data — human check
    awForm: deep.awForm,
    notes: `[RADAR ${day(0)}] trainer ${m.trainer} · last ran ${m.lastRun} · VERIFY black type + availability`,
    status: 'watch', added: day(0),
  };
  const r = E.evaluate(horse, E.PARAM_DEFAULTS);
  horse.maxBidGns = r.gns;
  // "diamond" = fails nothing that form data can prove (black type pends)
  horse.radarPass = r.fails.every((f) => f.startsWith('Black type'));
  fresh.push(horse);
  console.log(`  + ${m.name} — OR ${m.rating}, ${deep.starts} starts, AW ${deep.awForm}, ${horse.radarPass ? 'RADAR PASS' : 'partial'} → ${r.gns} gns`);
}

const all = [...fresh, ...existing.candidates].slice(0, 200);
writeFileSync(OUT, JSON.stringify({ generated: day(0), candidates: all }, null, 2));
console.log(`${fresh.length} new, ${all.length} total → ${OUT}`);

await alert(fresh.filter((f) => f.radarPass));
