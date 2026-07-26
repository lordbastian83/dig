/* Catalogue watcher — checks sale pages daily and Telegrams when one
   changes (i.e. a catalogue has dropped or lots were published).

   Reuses the budsignal Telegram pattern:
     TELEGRAM_BOT_TOKEN   required to send (existing repo secret)
     TELEGRAM_CHAT_ID     optional numeric id; else auto-resolved from the
     TELEGRAM_CHAT_HANDLE (default Lordbastian83) via the bot's updates
   State (content hashes per URL) lives in watch-state.json, committed back
   by the workflow so a change only alerts once. */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const STATE_FILE = process.env.STATE_FILE || 'watch-state.json';
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const HANDLE = (process.env.TELEGRAM_CHAT_HANDLE || 'Lordbastian83').replace(/^@/, '').toLowerCase();

const WATCH = [
  { key: 'tatts-autumn-hit',
    url: 'https://www.tattersalls.com/sales/autumn-horses-in-training-sale/overview/',
    label: 'Tattersalls Autumn HIT Sale page' },
  { key: 'arqana-autumn',
    url: 'https://www.arqana.com/',
    label: 'Arqana site (Autumn Sale window)' },
  { key: 'tatts-online',
    url: 'https://www.tattersallsonline.com/',
    label: 'Tattersalls Online (monthly sales)' },
];

async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`telegram ${method}: ${j.description || r.status}`);
  return j.result;
}

async function resolveChats(state) {
  state.chats = state.chats || [];
  if (process.env.TELEGRAM_CHAT_ID && !state.chats.includes(+process.env.TELEGRAM_CHAT_ID)) {
    state.chats.push(+process.env.TELEGRAM_CHAT_ID);
  }
  try {
    const updates = await tg('getUpdates', {});
    for (const u of updates) {
      const chat = u.message?.chat || u.edited_message?.chat;
      if (chat?.type === 'private' && !state.chats.includes(chat.id)) {
        if (!chat.username || chat.username.toLowerCase() === HANDLE) state.chats.push(chat.id);
      }
    }
  } catch (e) { console.error('getUpdates:', e.message); }
  return state.chats;
}

let state = {};
try { state = JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { /* first run */ }
state.hashes = state.hashes || {};

const changes = [];
for (const w of WATCH) {
  try {
    const res = await fetch(w.url, { headers: { 'user-agent': 'Mozilla/5.0 (bloodstock-watch)' } });
    const text = (await res.text())
      .replace(/<script[\s\S]*?<\/script>/gi, '')   // ignore script noise
      .replace(/\s+/g, ' ');
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
    const prev = state.hashes[w.key];
    if (prev && prev !== hash) changes.push(w);
    if (!prev) console.log(`${w.key}: baseline recorded`);
    state.hashes[w.key] = hash;
    console.log(`${w.key}: ${hash}${prev && prev !== hash ? '  << CHANGED' : ''}`);
  } catch (e) {
    console.error(`${w.key}: ${e.message}`); // network blip — keep old hash
  }
}

if (changes.length && TOKEN) {
  const chats = await resolveChats(state);
  const msg = ['🐎 Bloodstock watch — page change detected:',
    ...changes.map((c) => `• ${c.label}\n  ${c.url}`),
    '',
    'If this is the catalogue drop: run the Actions workflow',
    '"Bloodstock catalogue ingest" to scrape + score, or screen it in the app.',
  ].join('\n');
  for (const chat of chats) {
    try { await tg('sendMessage', { chat_id: chat, text: msg }); console.log(`alerted ${chat}`); }
    catch (e) { console.error(`send ${chat}: ${e.message}`); }
  }
} else if (changes.length) {
  console.log('changes detected but TELEGRAM_BOT_TOKEN not set — no alert sent');
} else {
  console.log('no changes');
}

writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
