/* BudSignal Telegram notifier — runs on a GitHub Actions schedule a few
   minutes after each 4h candle closes, recomputes signals with the same
   engine the website uses, and messages the configured Telegram chat when a
   signal fired on the just-closed candle.

   Environment:
     TELEGRAM_BOT_TOKEN    bot token from @BotFather (required to send)
     TELEGRAM_CHAT_ID      numeric chat id (optional — auto-resolved if absent)
     TELEGRAM_CHAT_HANDLE  telegram @username to auto-resolve the chat id
                           from the bot's incoming messages (user must have
                           messaged the bot at least once)
     FMP_API_KEY           enables GOLD / US30 / GBPUSD signals (optional)
     STATE_FILE            dedupe/state path (default .notify-state.json)
     DRY_RUN=1             compute and print, but send nothing
     SEND_TEST=1           send a connectivity test message and exit
     SELF_TEST=1           offline: synthetic candles through the full
                           pipeline, print the composed message, no network */

import './engine.js';
import { ASSETS, fetchCandles as feedFetch } from './feeds.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const E = globalThis.BudSignalEngine;

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const HANDLE = (process.env.TELEGRAM_CHAT_HANDLE || 'Lordbastian83').replace(/^@/, '').toLowerCase();
const FMP_KEY = process.env.FMP_API_KEY || '';
const STATE_FILE = process.env.STATE_FILE || '.notify-state.json';
const DRY_RUN = process.env.DRY_RUN === '1';

const fmtPrice = (v) =>
  v.toLocaleString('en-US', { minimumFractionDigits: v >= 1000 ? 0 : v >= 10 ? 2 : 4, maximumFractionDigits: v >= 1000 ? 0 : v >= 10 ? 2 : 4 });
const fmtTime = (t) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');

function loadState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`telegram ${method}: ${j.description || r.status}`);
  return j.result;
}

// A bot cannot message a @username — it needs the numeric chat id, and only
// for users who have messaged it first. Resolve the id by scanning the bot's
// recent updates for a private chat from HANDLE, then cache it in state.
async function resolveChatId(state) {
  if (process.env.TELEGRAM_CHAT_ID) return process.env.TELEGRAM_CHAT_ID;
  if (state.chatId) return state.chatId;
  const updates = await tg('getUpdates', { limit: 100 });
  for (const u of updates.reverse()) {
    const chat = u.message?.chat || u.edited_message?.chat;
    if (chat?.type === 'private' && (chat.username || '').toLowerCase() === HANDLE) {
      state.chatId = chat.id;
      console.log(`resolved chat id for @${HANDLE}: ${chat.id}`);
      return chat.id;
    }
  }
  return null;
}

function composeMessage(asset, sig) {
  const cfg = ASSETS[asset];
  const arrow = sig.side === 'long' ? '🟢 LONG' : '🔴 SHORT';
  const windowEnd = fmtTime(sig.t + E.CFG.CANDLE_MS);
  return [
    `${arrow} — <b>${cfg.pair}</b>`,
    `Entry $${fmtPrice(sig.entry)} · Stop $${fmtPrice(sig.stop)} · Target $${fmtPrice(sig.target)}`,
    `Confidence ${sig.confidence}/100 · entry window until ${windowEnd} UTC`,
    `Signal candle closed ${fmtTime(sig.t)} UTC`,
    `<i>BudSignal is an educational tool — not financial advice.</i>`,
  ].join('\n');
}

// Deterministic random walk (same generator as the site's demo mode) so the
// full pipeline (indicators -> gates -> message) can be exercised offline.
function selfTestCandles(seed) {
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const out = [];
  let t = Date.now() - 1000 * E.CFG.CANDLE_MS;
  let price = 64000;
  let drift = 0;
  for (let i = 0; i < 1000; i++) {
    if (i % 40 === 0) drift = (rand() - 0.5) * 0.004;
    const o = price;
    const shock = (rand() - 0.5) * 0.02 + drift;
    const c = o * (1 + shock);
    const h = Math.max(o, c) * (1 + rand() * 0.006);
    const l = Math.min(o, c) * (1 - rand() * 0.006);
    out.push({ t, o, h, l, c, v: 800 + rand() * 1200 });
    price = c;
    t += E.CFG.CANDLE_MS;
  }
  return out;
}

async function main() {
  if (process.env.SELF_TEST === '1') {
    let last = null, total = 0;
    for (const seed of [42, 7, 19, 3, 5, 13, 21]) {
      const candles = selfTestCandles(seed);
      const ind = E.computeIndicators(candles);
      const signals = E.computeSignals(candles, ind, true);
      total += signals.length;
      if (signals.length) last = signals[signals.length - 1];
    }
    console.log(`self-test: ${total} signal(s) across 7 synthetic histories`);
    if (!last) { console.error('self-test FAILED: no signal produced'); process.exit(1); }
    console.log('--- composed message ---');
    console.log(composeMessage('BTC', last).replace(/<[^>]+>/g, ''));
    console.log('self-test OK');
    return;
  }

  if (!TOKEN) {
    console.log('TELEGRAM_BOT_TOKEN is not set — notifier is not configured yet; nothing to do.');
    return;
  }

  const state = loadState();
  const chatId = await resolveChatId(state);
  if (!chatId) {
    console.log(`Could not resolve a chat id: @${HANDLE} has not messaged the bot yet. ` +
      'Open the bot in Telegram, press Start, then re-run this workflow.');
    saveState(state);
    return;
  }

  if (process.env.SEND_TEST === '1') {
    await tg('sendMessage', {
      chat_id: chatId, parse_mode: 'HTML',
      text: '✅ <b>BudSignal connected.</b> You will get a message here whenever a signal fires on a closed 4-hour candle.',
    });
    console.log('test message sent');
    saveState(state);
    return;
  }

  state.notified = state.notified || {};
  let sent = 0;
  for (const asset of Object.keys(ASSETS)) {
    let candles;
    try { candles = await feedFetch(asset, FMP_KEY); } catch (e) { console.log(`${asset}: ${e.message}`); continue; }
    const closed = E.closedPrefix(candles, Date.now());
    if (closed.length < E.CFG.EMA_TREND + 10) { console.log(`${asset}: only ${closed.length} closed candles — skipping`); continue; }
    const ind = E.computeIndicators(closed);
    const signals = E.computeSignals(closed, ind, true);
    const last = closed[closed.length - 1];
    const sig = signals.find((s) => s.t === last.t);
    if (!sig) { console.log(`${asset}: no signal on candle ${fmtTime(last.t)}`); continue; }
    if (state.notified[asset] === sig.t) { console.log(`${asset}: already notified for ${fmtTime(sig.t)}`); continue; }
    const text = composeMessage(asset, sig);
    if (DRY_RUN) {
      console.log(`DRY RUN — would send for ${asset}:\n${text.replace(/<[^>]+>/g, '')}`);
    } else {
      await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text });
      console.log(`${asset}: signal notification sent (${sig.side} @ ${fmtTime(sig.t)})`);
    }
    state.notified[asset] = sig.t;
    sent++;
  }
  if (!sent) console.log('no new signals this candle');
  saveState(state);
}

main().catch((e) => { console.error(e); process.exit(1); });
