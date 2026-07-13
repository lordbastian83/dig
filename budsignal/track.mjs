/* BudSignal performance tracker — maintains an append-only ledger of every
   signal the engine fires, updated on the same 4h schedule as the alerts.

   Records are added when a signal fires (with a feature snapshot) and their
   outcomes are filled in as they resolve. On the very first run the ledger
   is seeded from recomputed history, with those rows marked
   recorded:'backfill' so they are never confused with live-recorded rows —
   only rows marked recorded:'live' are out-of-sample evidence.

   Environment:
     LEDGER_FILE   path to performance.json (required)
     FMP_API_KEY   enables GOLD / US30 / GBPUSD (optional)
     DEMO=1        offline testing: synthetic candles instead of live feeds */

import './engine.js';
import { ASSETS, fetchCandles, demoCandles } from './feeds.mjs';
import { buildEnrichment, enrichSignal, snapshotMetrics } from './enrich.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const E = globalThis.BudSignalEngine;
const LEDGER_FILE = process.env.LEDGER_FILE;
if (!LEDGER_FILE) { console.error('LEDGER_FILE not set'); process.exit(1); }
const FMP_KEY = process.env.FMP_API_KEY || '';
const DEMO = process.env.DEMO === '1';
const DEMO_SEEDS = { BTC: 42, ETH: 7, SOL: 19, XRP: 3, GOLD: 5, US30: 13, GBPUSD: 21 };

function loadLedger() {
  try {
    const j = JSON.parse(readFileSync(LEDGER_FILE, 'utf8'));
    if (Array.isArray(j.records)) return j;
  } catch { /* fresh ledger */ }
  return { records: [] };
}

async function main() {
  const ledger = loadLedger();
  const bootstrap = ledger.records.length === 0;
  const byKey = new Map(ledger.records.map((r) => [`${r.asset}:${r.t}:${r.strategy || 'cross'}`, r]));
  let added = 0, resolved = 0;

  const histories = {};
  for (const asset of Object.keys(ASSETS)) {
    try {
      histories[asset] = DEMO ? demoCandles(1000, DEMO_SEEDS[asset]) : await fetchCandles(asset, FMP_KEY);
    } catch (e) { console.log(`${asset}: ${e.message}`); }
  }
  // light enrichment window: enough for funding percentile + context EMAs
  const ctx = DEMO ? null : await buildEnrichment({
    fmpKey: FMP_KEY, sinceT: Date.now() - 60 * 86400000, btcCandles: histories.BTC || null,
  });

  for (const asset of Object.keys(ASSETS)) {
    const candles = histories[asset];
    if (!candles) continue;
    const closed = E.closedPrefix(candles, Date.now());
    if (closed.length < E.CFG.EMA_TREND + 10) { console.log(`${asset}: only ${closed.length} closed candles — skipping`); continue; }
    const ind = E.computeIndicators(closed);
    const signals = [
      ...E.computeSignals(closed, ind, true),
      ...E.computeBreakoutStream(closed, ind),
      ...E.computeSwingStream(closed),
    ];

    // the validated 1h scalp stream, for its markets only (extra 1h fetch)
    if (E.SCALP.ASSETS.includes(asset)) {
      try {
        const c1h = DEMO ? demoCandles(1000, (DEMO_SEEDS[asset] || 1) + 100) : await fetchCandles(asset, FMP_KEY, { interval: '1h' });
        const closed1h = E.closedPrefix(c1h, Date.now(), E.SCALP.CANDLE_MS);
        if (closed1h.length >= E.CFG.EMA_TREND + 10) {
          signals.push(...E.computeScalpStream(closed1h, E.computeIndicators(closed1h)));
        }
      } catch (e) { console.log(`${asset} 1h: ${e.message}`); }
    }

    for (const s of signals) {
      const key = `${asset}:${s.t}:${s.strategy || 'cross'}`;
      const existing = byKey.get(key);
      if (!existing) {
        enrichSignal(asset, s, ctx);
        const rec = {
          asset, t: s.t, side: s.side, strategy: s.strategy || 'cross',
          entry: s.entry, stop: s.stop, target: s.target,
          confidence: s.confidence, adx: s.adx, rsi: s.rsiAt, volConfirm: s.volConfirm,
          fundRate: s.fundRate ?? null, fundPctl: s.fundPctl ?? null, fng: s.fng ?? null,
          eventHrs: s.eventHrs ?? null, ctxTrend: s.ctxTrend ?? null,
          outcome: s.outcome, movePct: Math.round(s.movePct * 100) / 100,
          // 'live' must mean recorded as it fired — historical signals pulled
          // in when a market is first added (or on bootstrap) are backfill.
          // The window scales with the signal's candle size, floored at the
          // 4h run cadence so hourly scalp signals recorded on the next
          // 4h run still count as live.
          recorded: bootstrap || Date.now() - s.t > Math.max(2 * (s.candleMs || E.CFG.CANDLE_MS), 2 * E.CFG.CANDLE_MS)
            ? 'backfill' : 'live',
        };
        ledger.records.push(rec);
        byKey.set(key, rec);
        added++;
      } else if (existing.outcome === 'open' && s.outcome !== 'open') {
        existing.outcome = s.outcome;
        existing.movePct = Math.round(s.movePct * 100) / 100;
        resolved++;
      }
    }
  }

  ledger.records.sort((a, b) => a.t - b.t);
  ledger.updated = Date.now();
  ledger.counts = {
    total: ledger.records.length,
    live: ledger.records.filter((r) => r.recorded === 'live').length,
    backfill: ledger.records.filter((r) => r.recorded === 'backfill').length,
  };
  writeFileSync(LEDGER_FILE, JSON.stringify(ledger));
  console.log(`ledger: +${added} new, ${resolved} outcomes resolved, ${ledger.counts.total} total ` +
    `(${ledger.counts.live} live / ${ledger.counts.backfill} backfill)`);

  // metrics recorder: funding / open interest / fear&greed snapshot every run,
  // so data with shallow public history (esp. OI) accumulates from today
  const METRICS_FILE = process.env.METRICS_FILE;
  if (METRICS_FILE && !DEMO) {
    let metrics;
    try { metrics = JSON.parse(readFileSync(METRICS_FILE, 'utf8')); } catch { metrics = { rows: [] } }
    if (!Array.isArray(metrics.rows)) metrics.rows = [];
    metrics.rows.push(await snapshotMetrics());
    if (metrics.rows.length > 8760) metrics.rows = metrics.rows.slice(-8760); // ~4y of 4h snapshots
    writeFileSync(METRICS_FILE, JSON.stringify(metrics));
    console.log(`metrics: ${metrics.rows.length} snapshots recorded`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
