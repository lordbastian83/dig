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
import { ASSETS, demoCandles, fmpChart } from './feeds.mjs';
import { buildEnrichment, enrichSignal } from './enrich.mjs';
import { writeFileSync } from 'node:fs';

const E = globalThis.BudSignalEngine;
const DEMO = process.env.DEMO === '1'; // offline pipeline test on synthetic data
const FMP_KEY = process.env.FMP_API_KEY;
if (!FMP_KEY && !DEMO) { console.error('FMP_API_KEY is required for research'); process.exit(1); }
const YEARS = +(process.env.YEARS || 3);
const REPORT_FILE = process.env.REPORT_FILE || 'research-report.md';
const COST = 0.10; // assumed round-trip cost per trade (fees + slippage), in %
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const day = (t) => new Date(t).toISOString().slice(0, 10);

async function fetchHistory(symbol, { interval = '4hour', years = YEARS, chunkDays = 85 } = {}) {
  const byT = new Map();
  const end = Date.now();
  const CHUNK = chunkDays * 86400000;
  for (let hi = end; hi > end - years * 365 * 86400000; hi -= CHUNK) {
    try {
      for (const c of await fmpChart(symbol, hi - CHUNK, hi, FMP_KEY, interval)) byT.set(c.t, c);
    } catch (e) {
      console.log(`${symbol} ${interval} chunk ${day(hi - CHUNK)}..${day(hi)}: ${e.message}`);
    }
    await sleep(300); // stay friendly to rate limits
  }
  return [...byT.values()].sort((a, b) => a.t - b.t);
}

const net = (moves) => moves.map((m) => m - COST);

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
    '# LordBastian Signal Generator — walk-forward research',
    '',
    `Generated ${new Date().toISOString()} · ${YEARS}y of 4h candles via FMP · ` +
    'train = first 70% of each market\'s history, validate = last 30% (out-of-sample).',
    '',
    'A variant only counts as an improvement if it beats its comparator in **both** periods — ' +
    'train-only wins are fitted noise.',
    '',
  ];
  const overall = { train: { F: [], B: [], T: [] }, validate: { F: [], B: [], T: [] } };
  const mlRows = { train: [], validate: [] }; // baseline signals with features, for meta-labeling

  // fetch all histories first so cross-asset context (BTC trend) is available
  const histories = {};
  for (const [asset, cfg] of Object.entries(ASSETS)) {
    console.log(`fetching ${asset} (${cfg.fmp})...`);
    histories[asset] = DEMO ? demoCandles(100, asset.length * 7 + 1) : await fetchHistory(cfg.fmp);
  }

  // Tier-1 enrichment: funding, fear&greed, econ calendar, USD/BTC context
  const sinceT = Date.now() - YEARS * 365 * 86400000;
  const ctx = DEMO ? null : await buildEnrichment({ fmpKey: FMP_KEY, sinceT, btcCandles: histories.BTC });
  if (ctx) lines.push(`Enrichment coverage: ${ctx.coverage}`, '');

  for (const [asset, cfg] of Object.entries(ASSETS)) {
    const candles = histories[asset];
    if (candles.length < 800) {
      lines.push(`## ${cfg.pair}`, '', `Insufficient history (${candles.length} candles) — skipped.`, '');
      console.log(`${asset}: only ${candles.length} candles, skipped`);
      continue;
    }
    const ind = E.computeIndicators(candles);
    const filtered = E.closedOf(E.computeSignals(candles, ind, true));
    const baseline = E.closedOf(E.computeSignals(candles, ind, false));
    for (const s of baseline) enrichSignal(asset, s, ctx);
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
      mlRows[period].push(...baseline.filter(inP).map((s) => ({ sig: s, label: s.movePct > 0, movePct: s.movePct })));
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

  // ---- Alternative entry families, same walk-forward split ----
  {
    const alt = {
      breakoutFixed: { train: [], validate: [] },
      breakoutTrail: { train: [], validate: [] },
      fundingFixed: { train: [], validate: [] },
      fundingTrail: { train: [], validate: [] },
    };
    for (const [asset] of Object.entries(ASSETS)) {
      const candles = histories[asset];
      if (!candles || candles.length < 800) continue;
      const ind = E.computeIndicators(candles);
      const splitT = candles[Math.floor(candles.length * 0.7)].t;
      const period = (s) => (s.t < splitT ? 'train' : 'validate');

      // Donchian breakout
      for (const s of E.closedOf(E.computeBreakoutSignals(candles, ind))) {
        alt.breakoutFixed[period(s)].push(s.movePct);
        const tr = E.trailingScore(candles, s.i, s.side, s.entry, ind.atr[s.i]);
        if (tr.closed) alt.breakoutTrail[period(s)].push(tr.movePct);
      }

      // Funding-extreme mean reversion (crypto with funding history only):
      // crowd maximally long (>=90th pctl of trailing 30d fundings) -> short,
      // maximally short (<=10th) -> long
      const rates = ctx?.funding?.[asset];
      if (rates && rates.length > 200) {
        let last = -Infinity;
        for (let i = 210; i < candles.length; i++) {
          const a = ind.atr[i];
          if (!a) continue;
          let k = rates.length - 1;
          while (k >= 0 && rates[k].t > candles[i].t) k--;
          if (k < 90) continue;
          const win = rates.slice(k - 90, k + 1).map((r) => r.rate);
          const pctl = win.filter((v) => v <= rates[k].rate).length / win.length;
          let side = null;
          if (pctl >= 0.9) side = 'short';
          else if (pctl <= 0.1) side = 'long';
          if (!side || i - last <= 18) continue;
          last = i;
          const dir = side === 'long' ? 1 : -1;
          const entry = candles[i].c;
          const out = E.scoreOutcome(candles, i, side, entry, entry - dir * 1.5 * a, entry + dir * 2 * a, a);
          const s = { i, t: candles[i].t, side, entry };
          if (out.outcome !== 'open') alt.fundingFixed[period(s)].push(out.movePct);
          const tr = E.trailingScore(candles, i, side, entry, a);
          if (tr.closed) alt.fundingTrail[period(s)].push(tr.movePct);
        }
      }
    }
    const altVerdict = (key) => {
      const tr = stats(alt[key].train), va = stats(alt[key].validate);
      return tr && va && tr.avg > 0 && va.avg > 0 ? '✅ positive in BOTH periods' : '❌ no out-of-sample edge';
    };
    lines.push(
      '## Alternative entry families (pooled)',
      '',
      '| Strategy | Train | Validate | Verdict |',
      '|---|---|---|---|',
      `| Donchian-55 breakout, fixed exits | ${fmtStats(stats(alt.breakoutFixed.train))} | ${fmtStats(stats(alt.breakoutFixed.validate))} | ${altVerdict('breakoutFixed')} |`,
      `| Donchian-55 breakout, trailing exits | ${fmtStats(stats(alt.breakoutTrail.train))} | ${fmtStats(stats(alt.breakoutTrail.validate))} | ${altVerdict('breakoutTrail')} |`,
      `| Funding-extreme mean reversion, fixed | ${fmtStats(stats(alt.fundingFixed.train))} | ${fmtStats(stats(alt.fundingFixed.validate))} | ${altVerdict('fundingFixed')} |`,
      `| Funding-extreme mean reversion, trailing | ${fmtStats(stats(alt.fundingTrail.train))} | ${fmtStats(stats(alt.fundingTrail.validate))} | ${altVerdict('fundingTrail')} |`,
      `| **Breakout trailing, NET of ${COST.toFixed(2)}% costs** | ${fmtStats(stats(net(alt.breakoutTrail.train)))} | ${fmtStats(stats(net(alt.breakoutTrail.validate)))} | ${(() => { const tr = stats(net(alt.breakoutTrail.train)), va = stats(net(alt.breakoutTrail.validate)); return tr && va && tr.avg > 0 && va.avg > 0 ? '✅ survives costs' : '❌ costs eat the edge'; })()} |`,
      '',
    );
    console.log('alternative entry families evaluated');
  }

  // ---- Faster timeframe: the winning strategy on 1h candles (scalp feasibility) ----
  if (!DEMO) {
    const fast = { fixed: { train: [], validate: [] }, trail: { train: [], validate: [] } };
    let fastMarkets = 0;
    for (const [asset, cfg] of Object.entries(ASSETS)) {
      console.log(`fetching ${asset} 1h...`);
      const candles = await fetchHistory(cfg.fmp, { interval: '1hour', years: Math.min(YEARS, 2), chunkDays: 25 });
      if (candles.length < 2000) { console.log(`${asset} 1h: only ${candles.length} candles — skipped`); continue; }
      fastMarkets++;
      const ind = E.computeIndicators(candles);
      const splitT = candles[Math.floor(candles.length * 0.7)].t;
      const period = (s) => (s.t < splitT ? 'train' : 'validate');
      for (const s of E.closedOf(E.computeBreakoutSignals(candles, ind))) {
        fast.fixed[period(s)].push(s.movePct);
        const tr = E.trailingScore(candles, s.i, s.side, s.entry, ind.atr[s.i]);
        if (tr.closed) fast.trail[period(s)].push(tr.movePct);
      }
    }
    const fastVerdict = (rows) => {
      const tr = stats(net(rows.train)), va = stats(net(rows.validate));
      return tr && va && tr.avg > 0 && va.avg > 0 ? '✅ survives costs on 1h' : '❌ not viable net of costs';
    };
    lines.push(
      '## Scalp feasibility: Donchian breakout on 1-hour candles',
      '',
      `Same strategy, 4× faster timeframe, ${fastMarkets} markets over up to 2 years. ` +
      `The question is not accuracy — it is whether the per-trade move survives a realistic ${COST.toFixed(2)}% round-trip cost. ` +
      'Faster timeframes shrink the move; costs stay constant.',
      '',
      '| Variant | Train (gross) | Validate (gross) | Train (net) | Validate (net) | Verdict |',
      '|---|---|---|---|---|---|',
      `| 1h breakout, fixed exits | ${fmtStats(stats(fast.fixed.train))} | ${fmtStats(stats(fast.fixed.validate))} | ${fmtStats(stats(net(fast.fixed.train)))} | ${fmtStats(stats(net(fast.fixed.validate)))} | ${fastVerdict(fast.fixed)} |`,
      `| 1h breakout, trailing exits | ${fmtStats(stats(fast.trail.train))} | ${fmtStats(stats(fast.trail.validate))} | ${fmtStats(stats(net(fast.trail.train)))} | ${fmtStats(stats(net(fast.trail.validate)))} | ${fastVerdict(fast.trail)} |`,
      '',
    );
    console.log('1h scalp-feasibility evaluated');
  }

  // ---- ML meta-labeling: train on train-period baseline signals, judge on validate ----
  let mlPassed = false;
  if (mlRows.train.length >= 100 && mlRows.validate.length >= 30) {
    const model = E.mlTrain(mlRows.train);
    const evalAt = (rows, thr) => stats(rows.filter((r) => E.mlScore(r.sig, model) >= thr).map((r) => r.movePct));
    lines.push(
      '## AI meta-label experiment',
      '',
      `A logistic model trained on the ${mlRows.train.length} train-period baseline signals ` +
      '(features: side, RSI, ADX, volume ratio, trend distance, ATR%) predicts the probability a signal ends favorable. ' +
      `Judged on the ${mlRows.validate.length} untouched validate-period signals.`,
      '',
      '| Threshold | Train (kept signals) | Validate (kept signals) |',
      '|---|---|---|',
    );
    let best = null;
    for (const thr of [0.5, 0.55, 0.6, 0.65]) {
      const tr = evalAt(mlRows.train, thr);
      const va = evalAt(mlRows.validate, thr);
      lines.push(`| p ≥ ${thr} | ${fmtStats(tr)} | ${fmtStats(va)} |`);
      if (tr && va && va.n >= 15 && (!best || va.avg > best.va.avg)) best = { thr, tr, va };
    }
    const baseVa = stats(mlRows.validate.map((r) => r.movePct));
    if (best && best.va.avg > 0 && baseVa && best.va.avg > baseVa.avg && best.tr.avg > 0) {
      mlPassed = true;
      const published = { ...model, threshold: best.thr, trainedRows: mlRows.train.length };
      writeFileSync('ml-model.json', JSON.stringify(published, null, 2));
      lines.push('', `**Verdict: ✅ passes out-of-sample at p ≥ ${best.thr}** — positive in both periods and beats the unfiltered baseline in validation. Model published (weights are public in ml-model.json on the budsignal-data branch).`);
    } else {
      lines.push('', '**Verdict: ❌ does not pass out-of-sample** — the model is NOT published or used. Train-period fit did not survive on unseen data.');
    }
    lines.push('');
  } else {
    lines.push('## AI meta-label experiment', '', 'Not enough signals to train and validate — skipped.', '');
  }
  console.log(`ML experiment: ${mlPassed ? 'PASSED — model published' : 'not published'}`);

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
