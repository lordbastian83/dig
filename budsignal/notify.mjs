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
import { buildEnrichment, enrichSignal } from './enrich.mjs';
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

// A bot cannot message a @username — it needs numeric chat ids, and only for
// people who have messaged it first. This is a personal alert bot, so treat
// every private chat found in the bot's updates as a subscriber (username
// matching proved fragile: unset usernames or spelling mismatches fail
// silently). Ids are cached in state so they survive update expiry.
async function resolveChatIds(state) {
  state.chats = state.chats || [];
  if (process.env.TELEGRAM_CHAT_ID && !state.chats.includes(process.env.TELEGRAM_CHAT_ID)) {
    state.chats.push(process.env.TELEGRAM_CHAT_ID);
  }
  if (state.chatId && !state.chats.includes(state.chatId)) state.chats.push(state.chatId); // legacy field
  let updateCount = 0;
  try {
    const updates = await tg('getUpdates', { limit: 100 });
    updateCount = updates.length;
    for (const u of updates) {
      const chat = u.message?.chat || u.edited_message?.chat;
      if (chat?.type === 'private' && !state.chats.includes(chat.id)) {
        state.chats.push(chat.id);
        console.log(`subscribed chat ${chat.id} (@${chat.username || 'no-username'})`);
      }
    }
  } catch (e) {
    console.log(`getUpdates failed: ${e.message}`);
  }
  return { chats: state.chats, updateCount };
}

function composeResolution(asset, sig) {
  const cfg = ASSETS[asset];
  const head =
    sig.outcome === 'win' ? '🎯 <b>Target hit</b>' :
    sig.outcome === 'loss' ? '🛑 <b>Stopped out</b>' :
    sig.outcome === 'be' ? '⚪ <b>Breakeven stop</b>' :
    sig.outcome === 'trail' ? `⤳ <b>Trailed out ${sig.movePct >= 0 ? 'in profit' : 'at a loss'}</b>` :
    '⏱ <b>Expired at market</b>';
  const move = `${sig.movePct >= 0 ? '+' : ''}${sig.movePct.toFixed(2)}%`;
  return [
    `${head} — ${cfg.pair}`,
    `${sig.side === 'long' ? '▲ LONG' : '▼ SHORT'} from $${fmtPrice(sig.entry)} closed ${sig.exit != null ? `at $${fmtPrice(sig.exit)} ` : ''}(${move})`,
    `Signal fired ${fmtTime(sig.t)} UTC`,
  ].join('\n');
}

function composeDigest(records) {
  const now = Date.now();
  const week = records.filter((r) => r.t >= now - 7 * 86400000);
  const closed = records.filter((r) => r.outcome !== 'open');
  const stats = (rs) => {
    const c = rs.filter((r) => r.outcome !== 'open');
    if (!c.length) return null;
    const fav = c.filter((r) => r.movePct > 0).length;
    const gw = c.reduce((a, r) => a + Math.max(r.movePct, 0), 0);
    const gl = c.reduce((a, r) => a + Math.max(-r.movePct, 0), 0);
    return { n: c.length, fav, favPct: (fav / c.length) * 100, avg: c.reduce((a, r) => a + r.movePct, 0) / c.length, pf: gl > 0 ? gw / gl : Infinity };
  };
  const all = stats(records);
  const perAsset = {};
  for (const r of closed) (perAsset[r.asset] = perAsset[r.asset] || []).push(r);
  const ranked = Object.entries(perAsset)
    .map(([a, rs]) => ({ a, avg: rs.reduce((x, r) => x + r.movePct, 0) / rs.length, n: rs.length }))
    .filter((x) => x.n >= 2)
    .sort((x, y) => y.avg - x.avg);
  const pf = all && (all.pf === Infinity ? '∞' : all.pf.toFixed(2));
  return [
    '📊 <b>LordBastian signals — weekly digest</b>',
    `This week: ${week.length} signal(s) fired.`,
    all ? `All-time ledger: ${all.n} closed · ${all.favPct.toFixed(0)}% favorable · avg ${all.avg >= 0 ? '+' : ''}${all.avg.toFixed(2)}% · profit factor ${pf}` : 'No closed signals in the ledger yet.',
    ranked.length ? `Best market: ${ranked[0].a} (avg ${ranked[0].avg >= 0 ? '+' : ''}${ranked[0].avg.toFixed(2)}%) · Worst: ${ranked[ranked.length - 1].a} (avg ${ranked[ranked.length - 1].avg >= 0 ? '+' : ''}${ranked[ranked.length - 1].avg.toFixed(2)}%)` : '',
    '<i>Full breakdowns: the Performance section on the site.</i>',
  ].filter(Boolean).join('\n');
}

// Daily heartbeat: proof-of-life plus "what's brewing" — for each market,
// how far the EMA-20/50 pair is from crossing (in ATRs) and which gates
// would still block a signal if it crossed right now.
async function composeHeartbeat() {
  const near = [];
  let fired = 0, scanned = 0;
  for (const asset of Object.keys(ASSETS)) {
    let candles;
    try { candles = await feedFetch(asset, FMP_KEY); } catch (e) { console.log(`${asset}: ${e.message}`); continue; }
    const closed = E.closedPrefix(candles, Date.now());
    if (closed.length < E.CFG.EMA_TREND + 10) continue;
    scanned++;
    const ind = E.computeIndicators(closed);
    const signals = E.computeSignals(closed, ind, true);
    fired += signals.filter((s) => Date.now() - s.t <= 86400000).length;
    const i = closed.length - 1;
    if (ind.emaFast[i] == null || ind.emaSlow[i] == null || !ind.atr[i]) continue;
    const gapAtr = Math.abs(ind.emaFast[i] - ind.emaSlow[i]) / ind.atr[i];
    const dir = ind.emaFast[i] < ind.emaSlow[i] ? 'long' : 'short'; // direction of the prospective cross
    const blockers = [];
    if (ind.adx[i] != null && ind.adx[i] < E.CFG.ADX_MIN) blockers.push(`ADX ${ind.adx[i].toFixed(0)} needs ${E.CFG.ADX_MIN}`);
    if (ind.emaTrend[i] != null) {
      const trendOk = dir === 'long' ? closed[i].c > ind.emaTrend[i] : closed[i].c < ind.emaTrend[i];
      if (!trendOk) blockers.push('wrong side of 200-EMA');
    }
    near.push({ asset, gapAtr, dir, blockers });
  }
  near.sort((a, b) => a.gapAtr - b.gapAtr);
  const top = near.slice(0, 3).map((n) =>
    `${n.asset}: ${n.dir === 'long' ? '▲' : '▼'} cross ${n.gapAtr.toFixed(1)} ATR away${n.blockers.length ? ` · ${n.blockers.join(' · ')}` : ' · gates clear'}`);
  const text = [
    `🫀 <b>Daily check</b> — ${scanned} markets scanned, ${fired ? `${fired} signal(s) fired in the last 24h` : 'no setups today'}.`,
    top.length ? 'Closest to firing:' : '',
    ...top,
  ].filter(Boolean).join('\n');
  return { text, data: { scanned, firedLast24h: fired, markets: near } };
}

function composeMessage(asset, sig, mlModel) {
  const cfg = ASSETS[asset];
  const bk = sig.strategy === 'breakout';
  const arrow = `${sig.side === 'long' ? '🟢 LONG' : '🔴 SHORT'}${bk ? ' BREAKOUT' : ''}`;
  const windowEnd = fmtTime(sig.t + E.CFG.CANDLE_MS);
  return [
    `${arrow} — <b>${cfg.pair}</b>`,
    bk
      ? `Entry $${fmtPrice(sig.entry)} · Initial stop $${fmtPrice(sig.stop)} · Exit: 2×ATR trailing stop (max 3 days)`
      : `Entry $${fmtPrice(sig.entry)} · Stop $${fmtPrice(sig.stop)} · Target $${fmtPrice(sig.target)}`,
    (sig.confidence != null ? `Confidence ${sig.confidence}/100 · ` : '') +
      (mlModel && sig.rsiAt != null ? `AI score ${Math.round(E.mlScore(sig, mlModel) * 100)}% · ` : '') +
      `entry window until ${windowEnd} UTC`,
    `Signal candle closed ${fmtTime(sig.t)} UTC`,
    `<i>LordBastian Signal Generator — educational tool, not financial advice.</i>`,
  ].join('\n');
}

// Per-market breakout edge verdicts from the walk-forward research.
async function loadEdgeStatus() {
  try {
    const r = await fetch('https://raw.githubusercontent.com/lordbastian83/dig/budsignal-data/edge-status.json',
      { signal: AbortSignal.timeout(10000) });
    if (r.ok) return await r.json();
  } catch (e) { /* fine */ }
  return null;
}

// Published only when it passed out-of-sample validation; missing file = no model.
async function loadMlModel() {
  try {
    const r = await fetch('https://raw.githubusercontent.com/lordbastian83/dig/budsignal-data/ml-model.json',
      { signal: AbortSignal.timeout(10000) });
    if (r.ok) return await r.json();
  } catch (e) { /* fine */ }
  return null;
}

// Claude analyst briefing — commentary on regimes and form, never price
// prediction. Activated by the ANTHROPIC_API_KEY secret; silently absent
// without it.
async function claudeBrief(data) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 350,
        system: 'You are the analyst voice of the LordBastian Signal Generator, a rules-based educational trading-signal app. ' +
          'Given JSON market data, write a brief daily briefing of at most 110 words in plain text (no markdown, no headers, no bullet lists): ' +
          'which regimes the markets are in, what is closest to producing a setup and why, and anything notable in recent signal form. ' +
          'Never predict prices, never recommend trades, never give financial advice — the app appends its own disclaimer. Be concrete and dry, not promotional.',
        messages: [{ role: 'user', content: JSON.stringify(data) }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    const j = await r.json();
    if (j.type === 'error') throw new Error(j.error?.message || 'api error');
    return j.content?.[0]?.text?.trim() || null;
  } catch (e) {
    console.log(`claude briefing skipped: ${e.message}`);
    return null;
  }
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
  const { chats, updateCount } = await resolveChatIds(state);
  if (!chats.length) {
    // getMe proves whether the token itself is valid and names the bot, so
    // "no chats" is never ambiguous in the logs.
    let botName = 'unknown';
    try { botName = (await tg('getMe')).username; } catch (e) { botName = `TOKEN INVALID (${e.message})`; }
    const msg = `No subscriber chats found. Bot: @${botName}, updates seen: ${updateCount}. ` +
      'Open the bot in Telegram, press Start / send it a message, then re-run this workflow.';
    saveState(state);
    if (process.env.SEND_TEST === '1') { console.error(msg); process.exit(1); }
    console.log(msg);
    return;
  }

  if (process.env.HEARTBEAT === '1') {
    const hb = await composeHeartbeat();
    const brief = await claudeBrief({ kind: 'daily heartbeat', ...hb.data });
    const text = brief ? `${hb.text}\n\n🧠 ${brief}` : hb.text;
    if (DRY_RUN) { console.log(`DRY RUN heartbeat:\n${text.replace(/<[^>]+>/g, '')}`); saveState(state); return; }
    for (const chatId of chats) {
      await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text });
    }
    console.log(`heartbeat sent${brief ? ' (with Claude briefing)' : ''}`);
    saveState(state);
    return;
  }

  if (process.env.DIGEST === '1') {
    let records = [];
    try { records = JSON.parse(readFileSync(process.env.LEDGER_FILE || 'performance.json', 'utf8')).records || []; }
    catch (e) { console.log('no ledger available for digest'); }
    let text = composeDigest(records);
    const brief = await claudeBrief({ kind: 'weekly digest commentary', records: records.slice(-60) });
    if (brief) text += `\n\n🧠 ${brief}`;
    for (const chatId of chats) {
      await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text });
    }
    console.log('weekly digest sent');
    saveState(state);
    return;
  }

  if (process.env.SEND_TEST === '1') {
    for (const chatId of chats) {
      await tg('sendMessage', {
        chat_id: chatId, parse_mode: 'HTML',
        text: '✅ <b>LordBastian Signal Generator connected.</b> You will get a message here whenever a signal fires on a closed 4-hour candle.',
      });
      console.log(`test message sent to chat ${chatId}`);
    }
    saveState(state);
    return;
  }

  state.notified = state.notified || {};
  state.pending = state.pending || {};
  const mlModel = await loadMlModel();
  const edgeStatus = await loadEdgeStatus();
  let enrichCtx = null, enrichTried = false;
  let sent = 0;
  for (const asset of Object.keys(ASSETS)) {
    let candles;
    try { candles = await feedFetch(asset, FMP_KEY); } catch (e) { console.log(`${asset}: ${e.message}`); continue; }
    const closed = E.closedPrefix(candles, Date.now());
    if (closed.length < E.CFG.EMA_TREND + 10) { console.log(`${asset}: only ${closed.length} closed candles — skipping`); continue; }
    const ind = E.computeIndicators(closed);
    const signals = [...E.computeSignals(closed, ind, true), ...E.computeBreakoutStream(closed, ind)];

    // resolution alerts: a signal we announced earlier has now closed out
    const stillPending = [];
    for (const pt of state.pending[asset] || []) {
      const [ptT, ptStrat] = Array.isArray(pt) ? pt : [pt, 'cross'];
      const p = signals.find((s) => s.t === ptT && (s.strategy || 'cross') === ptStrat);
      if (p && p.outcome === 'open') { stillPending.push([ptT, ptStrat]); continue; }
      if (p) {
        const text = composeResolution(asset, p);
        if (DRY_RUN) console.log(`DRY RUN — would send resolution for ${asset}: ${text.replace(/<[^>]+>/g, ' ')}`);
        else {
          for (const chatId of chats) await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text });
          console.log(`${asset}: resolution sent (${p.outcome} @ ${fmtTime(p.t)})`);
        }
        sent++;
      }
    }
    state.pending[asset] = stillPending;

    // GitHub cron can fire hours late, so a strict "signal on the very last
    // candle" check would silently skip alerts — instead alert any signal
    // from the last two candles that hasn't been announced yet.
    if (!Array.isArray(state.notified[asset])) {
      state.notified[asset] = state.notified[asset] ? [state.notified[asset]] : [];
    }
    const key = (s) => `${s.t}:${s.strategy || 'cross'}`;
    const fresh = signals.filter((s) =>
      Date.now() - s.t <= 2 * E.CFG.CANDLE_MS && !state.notified[asset].includes(key(s)));
    if (!fresh.length) { console.log(`${asset}: no new signal (last closed candle ${fmtTime(closed[closed.length - 1].t)})`); continue; }
    if (fresh.length && mlModel && !enrichTried) {
      enrichTried = true;
      try {
        enrichCtx = await buildEnrichment({ fmpKey: FMP_KEY, sinceT: Date.now() - 60 * 86400000, btcCandles: null });
      } catch (e) { console.log(`enrichment skipped: ${e.message}`); }
    }
    for (const sig of fresh) {
      if (enrichCtx) enrichSignal(asset, sig, enrichCtx);
      let text = composeMessage(asset, sig, mlModel);
      const es = edgeStatus?.assets?.[asset];
      if (sig.strategy === 'breakout' && es && es.edge === false) {
        text += `\n⚠️ <i>Historical note: this market showed no net edge for this strategy in the walk-forward — treat as informational.</i>`;
      }
      if (DRY_RUN) {
        console.log(`DRY RUN — would send for ${asset}:\n${text.replace(/<[^>]+>/g, '')}`);
      } else {
        for (const chatId of chats) {
          await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text });
        }
        console.log(`${asset}: signal notification sent (${sig.side} @ ${fmtTime(sig.t)})`);
      }
      state.notified[asset].push(key(sig));
      state.pending[asset] = [...(state.pending[asset] || []), [sig.t, sig.strategy || 'cross']];
      sent++;
    }
  }
  if (!sent) console.log('no new signals this candle');
  saveState(state);
}

main().catch((e) => { console.error(e); process.exit(1); });
