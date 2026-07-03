/* BudSignal walk-forward research — pulls multi-year 4h history via FMP,
   splits it 70/30 into train/validate periods, and reports how the filtered
   rules, the unfiltered EMA-cross baseline, and the trailing-exit variant
   performed in EACH period per market.

   The point: a rule that only works in the train period is fitted noise. A
   rule worth keeping beats the baseline in BOTH periods. The report is
   committed to the budsignal-data branch as research-report.md.

   Environment:
     FMP_API_KEY  required
     YEARS        history depth (default 3)
     REPORT_FILE  output path (default research-report.md) */

import './engine.js';
import { ASSETS, demoCandles } from './feeds.mjs';
import { writeFileSync } from 'node:fs';

const E = globalThis.BudSignalEngine;
const DEMO = process.env.DEMO === '1'; // offline pipeline test on synthetic data
const FMP_KEY = process.env.FMP_API_KEY;
if (!FMP_KEY && !DEMO) { console.error('FMP_API_KEY is required for research'); process.exit(1); }
const YEARS = +(process.env.YEARS || 3);
const REPORT_FILE = process.env.REPORT_FILE || 'research-report.md';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const day = (t) => new Date(t).toISOString().slice(0, 10);

async function fetchChunk(symbol, fromT, toT) {
  const url = `https://financialmodelingprep.com/api/v3/historical-chart/4hour/${encodeURIComponent(symbol)}` +
    `?from=${day(fromT)}&to=${day(toT)}&apikey=${encodeURIComponent(FMP_KEY)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`FMP HTTP ${r.status}`);
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error((j && j['Error Message']) || 'no data');
  return j.map((v) => ({
    t: Date.parse(v.date.replace(' ', 'T') + 'Z'),
    o: +v.open, h: +v.high, l: +v.low, c: +v.close,
    v: v.volume != null ? +v.volume : 0,
  }));
}

async function fetchHistory(symbol) {
  const byT = new Map();
  const end = Date.now();
  const CHUNK = 85 * 86400000;
  for (let hi = end; hi > end - YEARS * 365 * 86400000; hi -= CHUNK) {
    try {
      for (const c of await fetchChunk(symbol, hi - CHUNK, hi)) byT.set(c.t, c);
    } catch (e) {
      console.log(`${symbol} chunk ${day(hi - CHUNK)}..${day(hi)}: ${e.message}`);
    }
    await sleep(300); // stay friendly to rate limits
  }
  return [...byT.values()].sort((a, b) => a.t - b.t);
}

function stats(moves) {
  if (!moves.length) return null;
  const fav = moves.filter((m) => m > 0).length;
  const gw = moves.reduce((a, m) => a + Math.max(m, 0), 0);
  const gl = moves.reduce((a, m) => a + Math.max(-m, 0), 0);
  return {
    n: moves.length,
    favPct: (fav / moves.length) * 100,
    avg: moves.reduce((a, m) => a + m, 0) / moves.length,
    pf: gl > 0 ? gw / gl : Infinity,
  };
}

const fmtStats = (s) => s
  ? `${s.n} · ${s.favPct.toFixed(0)}% fav · avg ${s.avg >= 0 ? '+' : ''}${s.avg.toFixed(2)}% · PF ${s.pf === Infinity ? '∞' : s.pf.toFixed(2)}`
  : '0 signals';

async function main() {
  const lines = [
    '# BudSignal walk-forward research',
    '',
    `Generated ${new Date().toISOString()} · ${YEARS}y of 4h candles via FMP · ` +
    'train = first 70% of each market\'s history, validate = last 30% (out-of-sample).',
    '',
    'A variant only counts as an improvement if it beats its comparator in **both** periods — ' +
    'train-only wins are fitted noise.',
    '',
  ];
  const overall = { train: { F: [], B: [], T: [] }, validate: { F: [], B: [], T: [] } };

  for (const [asset, cfg] of Object.entries(ASSETS)) {
    console.log(`fetching ${asset} (${cfg.fmp})...`);
    const candles = DEMO ? demoCandles(100, asset.length * 7 + 1) : await fetchHistory(cfg.fmp);
    if (candles.length < 800) {
      lines.push(`## ${cfg.pair}`, '', `Insufficient history (${candles.length} candles) — skipped.`, '');
      console.log(`${asset}: only ${candles.length} candles, skipped`);
      continue;
    }
    const ind = E.computeIndicators(candles);
    const filtered = E.closedOf(E.computeSignals(candles, ind, true));
    const baseline = E.closedOf(E.computeSignals(candles, ind, false));
    const splitT = candles[Math.floor(candles.length * 0.7)].t;

    const bucket = {};
    for (const period of ['train', 'validate']) {
      const inP = (s) => (period === 'train' ? s.t < splitT : s.t >= splitT);
      const F = filtered.filter(inP).map((s) => s.movePct);
      const B = baseline.filter(inP).map((s) => s.movePct);
      const T = filtered.filter(inP)
        .map((s) => (ind.atr[s.i] != null ? E.trailingScore(candles, s.i, s.side, s.entry, ind.atr[s.i]) : null))
        .filter((t) => t && t.closed).map((t) => t.movePct);
      bucket[period] = { F: stats(F), B: stats(B), T: stats(T) };
      overall[period].F.push(...F);
      overall[period].B.push(...B);
      overall[period].T.push(...T);
    }

    lines.push(
      `## ${cfg.pair}`,
      '',
      `${candles.length} candles, ${day(candles[0].t)} → ${day(candles[candles.length - 1].t)}, split at ${day(splitT)}`,
      '',
      '| Variant | Train | Validate |',
      '|---|---|---|',
      `| Filtered rules (fixed exit) | ${fmtStats(bucket.train.F)} | ${fmtStats(bucket.validate.F)} |`,
      `| Unfiltered baseline | ${fmtStats(bucket.train.B)} | ${fmtStats(bucket.validate.B)} |`,
      `| Filtered + trailing exit | ${fmtStats(bucket.train.T)} | ${fmtStats(bucket.validate.T)} |`,
      '',
    );
    console.log(`${asset}: F ${filtered.length} / B ${baseline.length} signals over ${candles.length} candles`);
  }

  const verdict = (aKey, bKey, label) => {
    const better = (p) => {
      const a = stats(overall[p][aKey]), b = stats(overall[p][bKey]);
      return a && b ? a.avg > b.avg : null;
    };
    const tr = better('train'), va = better('validate');
    const mark = tr && va ? '✅ holds up out-of-sample' : tr === null || va === null ? '⚠️ not enough signals to judge' : va ? '⚠️ validate-only (weak evidence)' : '❌ does NOT hold up out-of-sample';
    return `- **${label}**: train ${tr == null ? 'n/a' : tr ? 'better' : 'worse'}, validate ${va == null ? 'n/a' : va ? 'better' : 'worse'} → ${mark}`;
  };

  lines.push(
    '## Overall (all markets pooled)',
    '',
    '| Variant | Train | Validate |',
    '|---|---|---|',
    `| Filtered rules (fixed exit) | ${fmtStats(stats(overall.train.F))} | ${fmtStats(stats(overall.validate.F))} |`,
    `| Unfiltered baseline | ${fmtStats(stats(overall.train.B))} | ${fmtStats(stats(overall.validate.B))} |`,
    `| Filtered + trailing exit | ${fmtStats(stats(overall.train.T))} | ${fmtStats(stats(overall.validate.T))} |`,
    '',
    '### Verdicts (by average move per signal)',
    '',
    verdict('F', 'B', 'Filters vs baseline'),
    verdict('T', 'F', 'Trailing exit vs fixed exit'),
    '',
    '_Educational research, not financial advice. Past performance does not predict future results._',
    '',
  );

  writeFileSync(REPORT_FILE, lines.join('\n'));
  console.log('\n===== report =====\n');
  console.log(lines.join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
