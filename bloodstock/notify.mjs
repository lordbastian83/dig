/* Identified-horse alert — Telegrams when a lot passes all 6 filters.

   Runs after ingest: loads the enriched lots.json, scores every lot with
   the SAME engine the app uses, and if any horse is identified (6/6 PASS)
   sends one Telegram message with name, rating, hard max bid and value
   gap. Silent when nothing qualifies — the alert means something.

   Environment:
     TELEGRAM_BOT_TOKEN     required to send (existing repo secret)
     TELEGRAM_CHAT_ID       optional numeric id; else auto-resolved from
     TELEGRAM_CHAT_HANDLE   (default Lordbastian83) via the bot's updates
     LOTS                   lots file (default lots.json)

   Never fails the workflow: all errors are logged and exit code is 0. */

import './app/engine.js';
import { readFileSync } from 'node:fs';

const E = globalThis.VaultRacingEngine;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const HANDLE = (process.env.TELEGRAM_CHAT_HANDLE || 'Lordbastian83').replace(/^@/, '').toLowerCase();
const LOTS = process.env.LOTS || 'lots.json';

const fmt = (n) => n.toLocaleString('en-GB', { maximumFractionDigits: 0 });

async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`telegram ${method}: ${j.description || r.status}`);
  return j.result;
}

async function chats() {
  const ids = new Set();
  if (process.env.TELEGRAM_CHAT_ID) ids.add(+process.env.TELEGRAM_CHAT_ID);
  try {
    for (const u of await tg('getUpdates', {})) {
      const chat = u.message?.chat || u.edited_message?.chat;
      if (chat?.type === 'private' && (!chat.username || chat.username.toLowerCase() === HANDLE)) {
        ids.add(chat.id);
      }
    }
  } catch (e) { console.error('getUpdates:', e.message); }
  return [...ids];
}

try {
  const lots = JSON.parse(readFileSync(LOTS, 'utf8')).watchlist ?? [];
  let medians = {};
  try {
    medians = JSON.parse(readFileSync(new URL('./app/data/sire-medians.json', import.meta.url), 'utf8'));
    delete medians._meta;
  } catch { /* no comps yet */ }

  const P = E.PARAM_DEFAULTS;
  const identified = lots
    .map((h) => ({ h, r: E.evaluate(h, P), exp: E.expectedPrice(h, medians) }))
    .filter(({ r }) => r.verdict === 'BID');

  console.log(`${lots.length} lots scored — ${identified.length} identified`);
  if (!identified.length) process.exit(0);
  if (!TOKEN) { console.log('TELEGRAM_BOT_TOKEN not set — cannot alert.'); process.exit(0); }

  const lines = identified.map(({ h, r, exp }) => {
    const gap = exp ? ` · gap ${r.gns - exp.gns >= 0 ? '+' : ''}${fmt(r.gns - exp.gns)}` : '';
    const vet = r.vetClean ? '' : ' · vet −20% applied';
    return `• ${h.name}${h.lot ? ` (lot ${h.lot})` : ''} — OR ${h.rating}, ${h.starts} starts\n  max bid ${fmt(r.gns)} gns${gap}${vet}`;
  });
  const msg = [`🐎 vault racing — ${identified.length} horse${identified.length === 1 ? '' : 's'} identified (6/6):`,
    '', ...lines, '', 'Full board: open the scanner → Rank by value gap.'].join('\n');

  for (const chat of await chats()) {
    try { await tg('sendMessage', { chat_id: chat, text: msg }); console.log(`alerted ${chat}`); }
    catch (e) { console.error(`send ${chat}: ${e.message}`); }
  }
} catch (e) {
  console.error('notify:', e.message); // never fail the pipeline over an alert
}
