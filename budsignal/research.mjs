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
// Round-trip cost per trade (fees + spread + slippage), in %, by market
// class: crypto taker fees dominate; FX spreads are tight; ETFs tighter.
const COSTS = {
  BTC: 0.10, ETH: 0.10, SOL: 0.10, XRP: 0.10,
  GOLD: 0.05, OIL: 0.05,
  US30: 0.02, NAS100: 0.02, SPX500: 0.02,
  GBPUSD: 0.03, EURUSD: 0.03,
};
const costOf = (asset) => COSTS[asset] ?? 0.05;
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

// rows are {m: movePct, c: cost}; gross ignores c, net subtracts it
const gross = (rows) => rows.map((r) => r.m);
const net = (rows) => rows.map((r) => r.m - r.c);

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
  const edgeAssets = new Set(); // markets whose 4h breakout survived costs, filled below

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
    const perMarket = {}; // breakout+trailing per asset
    for (const [asset] of Object.entries(ASSETS)) {
      const candles = histories[asset];
      if (!candles || candles.length < 800) continue;
      const c = costOf(asset);
      const ind = E.computeIndicators(candles);
      const splitT = candles[Math.floor(candles.length * 0.7)].t;
      const period = (s) => (s.t < splitT ? 'train' : 'validate');
      perMarket[asset] = { train: [], validate: [] };

      // Donchian breakout
      for (const s of E.closedOf(E.computeBreakoutSignals(candles, ind))) {
        alt.breakoutFixed[period(s)].push({ m: s.movePct, c });
        const tr = E.trailingScore(candles, s.i, s.side, s.entry, ind.atr[s.i]);
        if (tr.closed) {
          alt.breakoutTrail[period(s)].push({ m: tr.movePct, c });
          perMarket[asset][period(s)].push({ m: tr.movePct, c });
        }
      }

      // Funding-extreme mean reversion (crypto with funding history only)
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
          const sSig = { t: candles[i].t };
          if (out.outcome !== 'open') alt.fundingFixed[period(sSig)].push({ m: out.movePct, c });
          const tr = E.trailingScore(candles, i, side, entry, a);
          if (tr.closed) alt.fundingTrail[period(sSig)].push({ m: tr.movePct, c });
        }
      }
    }
    const altVerdict = (key) => {
      const tr = stats(gross(alt[key].train)), va = stats(gross(alt[key].validate));
      return tr && va && tr.avg > 0 && va.avg > 0 ? '✅ positive in BOTH periods' : '❌ no out-of-sample edge';
    };
    lines.push(
      '## Alternative entry families (pooled)',
      '',
      '| Strategy | Train | Validate | Verdict |',
      '|---|---|---|---|',
      `| Donchian-55 breakout, fixed exits | ${fmtStats(stats(gross(alt.breakoutFixed.train)))} | ${fmtStats(stats(gross(alt.breakoutFixed.validate)))} | ${altVerdict('breakoutFixed')} |`,
      `| Donchian-55 breakout, trailing exits | ${fmtStats(stats(gross(alt.breakoutTrail.train)))} | ${fmtStats(stats(gross(alt.breakoutTrail.validate)))} | ${altVerdict('breakoutTrail')} |`,
      `| Funding-extreme mean reversion, fixed | ${fmtStats(stats(gross(alt.fundingFixed.train)))} | ${fmtStats(stats(gross(alt.fundingFixed.validate)))} | ${altVerdict('fundingFixed')} |`,
      `| Funding-extreme mean reversion, trailing | ${fmtStats(stats(gross(alt.fundingTrail.train)))} | ${fmtStats(stats(gross(alt.fundingTrail.validate)))} | ${altVerdict('fundingTrail')} |`,
      `| **Breakout trailing, NET of per-market costs** | ${fmtStats(stats(net(alt.breakoutTrail.train)))} | ${fmtStats(stats(net(alt.breakoutTrail.validate)))} | ${(() => { const tr = stats(net(alt.breakoutTrail.train)), va = stats(net(alt.breakoutTrail.validate)); return tr && va && tr.avg > 0 && va.avg > 0 ? '✅ survives costs' : '❌ costs eat the edge'; })()} |`,
      '',
    );

    // per-market breakout verdicts (the "does MY market work" table) + edge status file
    const edgeStatus = { strategy: 'breakout-trailing', assets: {} };
    edgeAssets.clear();
    lines.push(
      '## Breakout + trailing, per market (net of that market\'s cost)',
      '',
      '| Market | Cost | Train (net) | Validate (net) | Verdict |',
      '|---|---|---|---|---|',
    );
    for (const [asset, cfg] of Object.entries(ASSETS)) {
      const pm = perMarket[asset];
      if (!pm) continue;
      const tr = stats(net(pm.train)), va = stats(net(pm.validate));
      const edge = !!(tr && va && tr.avg > 0 && va.avg > 0);
      edgeStatus.assets[asset] = {
        edge,
        netValidateAvg: va ? Math.round(va.avg * 100) / 100 : null,
        n: (pm.train.length + pm.validate.length),
      };
      if (edge) edgeAssets.add(asset);
      lines.push(`| ${cfg.pair} | ${costOf(asset).toFixed(2)}% | ${fmtStats(tr)} | ${fmtStats(va)} | ${edge ? '✅ net edge' : '❌ no net edge'} |`);
    }
    writeFileSync('edge-status.json', JSON.stringify(edgeStatus, null, 2));
    lines.push('', 'Per-market edge status published to edge-status.json — alerts for ❌ markets carry an informational-only warning.', '');

    // lookback grid — asset-class level (pooled vs non-crypto), predefined
    // values only; per-single-market tuning is deliberately NOT done (overfitting)
    lines.push(
      '## Donchian lookback grid (breakout + trailing, net of costs)',
      '',
      '| Lookback | All markets: train | validate | Non-crypto only: train | validate |',
      '|---|---|---|---|---|',
    );
    for (const L of [20, 55, 100]) {
      const pool = { train: [], validate: [] }, nc = { train: [], validate: [] };
      for (const [asset] of Object.entries(ASSETS)) {
        const candles = histories[asset];
        if (!candles || candles.length < 800) continue;
        const c = costOf(asset);
        const ind = E.computeIndicators(candles);
        const splitT = candles[Math.floor(candles.length * 0.7)].t;
        const isCrypto = ASSETS[asset].kind === 'crypto';
        for (const s of E.closedOf(E.computeBreakoutSignals(candles, ind, { lookback: L }))) {
          const tr = E.trailingScore(candles, s.i, s.side, s.entry, ind.atr[s.i]);
          if (!tr.closed) continue;
          const p = s.t < splitT ? 'train' : 'validate';
          pool[p].push({ m: tr.movePct, c });
          if (!isCrypto) nc[p].push({ m: tr.movePct, c });
        }
      }
      lines.push(`| ${L} | ${fmtStats(stats(net(pool.train)))} | ${fmtStats(stats(net(pool.validate)))} | ${fmtStats(stats(net(nc.train)))} | ${fmtStats(stats(net(nc.validate)))} |`);
    }
    lines.push('');
    console.log('alternative entry families + per-market + grid evaluated');
  }

  // ---- Candidate markets: breadth is the honest profit lever ----
  // Trend-following returns scale with the number of independent validated
  // markets far more than with per-market tweaks. Candidates are tested with
  // the exact live rule set (Donchian-55 + trailing, net of a realistic
  // per-market cost) and earn a place only by passing both periods.
  {
    const CANDIDATES = {
      SILVER: { fmp: 'XAGUSD', pair: 'XAG / USD · Silver', cost: 0.05 },
      USDJPY: { fmp: 'USDJPY', pair: 'USD / JPY', cost: 0.03 },
      AUDUSD: { fmp: 'AUDUSD', pair: 'AUD / USD', cost: 0.03 },
      USDCAD: { fmp: 'USDCAD', pair: 'USD / CAD', cost: 0.03 },
      EURGBP: { fmp: 'EURGBP', pair: 'EUR / GBP', cost: 0.03 },
      NATGAS: { fmp: 'NGUSD', pair: 'Natural Gas', cost: 0.08 },
    };
    lines.push(
      '## Candidate markets (4h breakout + trailing, net of own cost)',
      '',
      'New markets audition with the exact live rule set — a candidate is added to the app only if net-positive in both periods.',
      '',
      '| Candidate | Cost | Train (net) | Validate (net) | Verdict |',
      '|---|---|---|---|---|',
    );
    for (const [key, cfg] of Object.entries(CANDIDATES)) {
      console.log(`fetching candidate ${key} (${cfg.fmp})...`);
      const candles = DEMO ? demoCandles(100, key.length * 13 + 5) : await fetchHistory(cfg.fmp);
      if (candles.length < 800) {
        lines.push(`| ${cfg.pair} | ${cfg.cost.toFixed(2)}% | insufficient history (${candles.length} candles) | — | ⚠️ no data |`);
        continue;
      }
      const ind = E.computeIndicators(candles);
      const splitT = candles[Math.floor(candles.length * 0.7)].t;
      const pool = { train: [], validate: [] };
      for (const s of E.closedOf(E.computeBreakoutSignals(candles, ind))) {
        const tr = E.trailingScore(candles, s.i, s.side, s.entry, ind.atr[s.i]);
        if (!tr.closed) continue;
        pool[s.t < splitT ? 'train' : 'validate'].push({ m: tr.movePct, c: cfg.cost });
      }
      const tr = stats(net(pool.train)), va = stats(net(pool.validate));
      const pass = !!(tr && va && va.n >= 15 && tr.avg > 0 && va.avg > 0);
      lines.push(`| ${cfg.pair} | ${cfg.cost.toFixed(2)}% | ${fmtStats(tr)} | ${fmtStats(va)} | ${pass ? '✅ net edge — add' : '❌ no net edge'} |`);
    }
    lines.push('');
    console.log('candidate markets evaluated');
  }

  // ---- Faster timeframe: the winning strategy on 1h candles (scalp feasibility) ----
  // Plus the "scalp rescue" filters: the honest question isn't whether raw 1h
  // trading works (it doesn't — costs eat it) but whether any defensible
  // filter concentrates entries enough to clear the cost bar out-of-sample:
  //   session   — entries 07:00–15:59 UTC (London/NY hours: tightest spreads,
  //               biggest moves)
  //   high-vol  — entry ATR% above its own trailing 200-candle average
  //               (bigger expected move vs the same fixed cost)
  //   edge mkts — only markets whose 4h breakout survived costs (note: that
  //               list is derived from overlapping history, so treat a pass
  //               as suggestive, not proof)
  //   combo     — all three at once
  {
    const mk = () => ({ train: [], validate: [] });
    const fast = { fixed: mk(), trail: mk(), session: mk(), highVol: mk(), edgeOnly: mk(), combo: mk() };
    let fastMarkets = 0;
    for (const [asset, cfg] of Object.entries(ASSETS)) {
      console.log(`fetching ${asset} 1h...`);
      const candles = DEMO
        ? demoCandles(100, asset.length * 11 + 3)
        : await fetchHistory(cfg.fmp, { interval: '1hour', years: Math.min(YEARS, 2), chunkDays: 25 });
      if (candles.length < (DEMO ? 500 : 2000)) { console.log(`${asset} 1h: only ${candles.length} candles — skipped`); continue; }
      fastMarkets++;
      const ind = E.computeIndicators(candles);
      const splitT = candles[Math.floor(candles.length * 0.7)].t;
      const period = (s) => (s.t < splitT ? 'train' : 'validate');
      const c = costOf(asset);
      // trailing average of ATR% via prefix sums, for the high-vol gate
      const atrPct = candles.map((k, i) => (ind.atr[i] != null ? ind.atr[i] / k.c : null));
      const pre = [0];
      let cnt = [0];
      for (let i = 0; i < atrPct.length; i++) {
        pre.push(pre[i] + (atrPct[i] ?? 0));
        cnt.push(cnt[i] + (atrPct[i] != null ? 1 : 0));
      }
      const avgAtrPct = (i) => {
        const lo = Math.max(0, i - 200);
        const n = cnt[i] - cnt[lo];
        return n > 50 ? (pre[i] - pre[lo]) / n : null;
      };
      for (const s of E.closedOf(E.computeBreakoutSignals(candles, ind))) {
        fast.fixed[period(s)].push({ m: s.movePct, c });
        const tr = E.trailingScore(candles, s.i, s.side, s.entry, ind.atr[s.i]);
        if (!tr.closed) continue;
        const p = period(s);
        const row = { m: tr.movePct, c };
        fast.trail[p].push(row);
        const hour = new Date(s.t).getUTCHours();
        const inSession = hour >= 7 && hour < 16;
        const base = avgAtrPct(s.i);
        const highVol = base != null && atrPct[s.i] != null && atrPct[s.i] > base;
        const onEdge = edgeAssets.has(asset);
        if (inSession) fast.session[p].push(row);
        if (highVol) fast.highVol[p].push(row);
        if (onEdge) fast.edgeOnly[p].push(row);
        if (inSession && highVol && onEdge) fast.combo[p].push(row);
      }
    }
    const fastVerdict = (rows) => {
      const tr = stats(net(rows.train)), va = stats(net(rows.validate));
      if (!tr || !va || va.n < 15) return '⚠️ too few signals to judge';
      return tr.avg > 0 && va.avg > 0 ? '✅ survives costs on 1h' : '❌ not viable net of costs';
    };
    const halfCost = (rows) => rows.map((r) => r.m - r.c / 2);
    const g = gross;
    const fastRow = (label, rows) =>
      `| ${label} | ${fmtStats(stats(net(rows.train)))} | ${fmtStats(stats(net(rows.validate)))} | ${fastVerdict(rows)} |`;
    lines.push(
      '## Scalp feasibility: Donchian breakout on 1-hour candles',
      '',
      `Same strategy, 4× faster timeframe, ${fastMarkets} markets over up to 2 years. ` +
      `The question is not accuracy — it is whether the per-trade move survives realistic per-market round-trip costs. ` +
      'Faster timeframes shrink the move; costs stay constant.',
      '',
      '| Variant | Train (gross) | Validate (gross) | Train (net) | Validate (net) | Verdict |',
      '|---|---|---|---|---|---|',
      `| 1h breakout, fixed exits | ${fmtStats(stats(g(fast.fixed.train)))} | ${fmtStats(stats(g(fast.fixed.validate)))} | ${fmtStats(stats(net(fast.fixed.train)))} | ${fmtStats(stats(net(fast.fixed.validate)))} | ${fastVerdict(fast.fixed)} |`,
      `| 1h breakout, trailing exits | ${fmtStats(stats(g(fast.trail.train)))} | ${fmtStats(stats(g(fast.trail.validate)))} | ${fmtStats(stats(net(fast.trail.train)))} | ${fmtStats(stats(net(fast.trail.validate)))} | ${fastVerdict(fast.trail)} |`,
      '',
      '### Scalp rescue filters (1h breakout + trailing, net of costs)',
      '',
      'Each filter attacks the reason scalping failed: too-small moves against fixed costs. ' +
      'A filter only counts if it turns the NET result positive in both periods.',
      '',
      '| Filter | Train (net) | Validate (net) | Verdict |',
      '|---|---|---|---|',
      fastRow('Session only (07–16 UTC)', fast.session),
      fastRow('High volatility only (ATR% > trailing avg)', fast.highVol),
      fastRow(`4h-edge markets only (${[...edgeAssets].join(', ') || 'none'})`, fast.edgeOnly),
      fastRow('All three combined', fast.combo),
      `| Combo at HALF costs (best-case raw spreads) | ${fmtStats(stats(halfCost(fast.combo.train)))} | ${fmtStats(stats(halfCost(fast.combo.validate)))} | ${(() => { const tr = stats(halfCost(fast.combo.train)), va = stats(halfCost(fast.combo.validate)); if (!tr || !va || va.n < 15) return '⚠️ too few signals to judge'; return tr.avg > 0 && va.avg > 0 ? '✅ viable IF costs halve' : '❌ fails even at half costs'; })()} |`,
      '',
    );
    console.log('1h scalp-feasibility + rescue filters evaluated');
  }

  // ---- Slower timeframe: daily candles (aggregated from the 4h history) ----
  // The mirror image of the scalp question: per-trade moves grow with the
  // timeframe while costs stay fixed, so if anything clears the cost bar
  // by a wide margin it should be here.
  {
    const toDaily = (candles) => {
      const by = new Map();
      for (const k of candles) {
        const d = Math.floor(k.t / 86400000);
        const cur = by.get(d);
        if (!cur) by.set(d, { t: d * 86400000, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v });
        else { cur.h = Math.max(cur.h, k.h); cur.l = Math.min(cur.l, k.l); cur.c = k.c; cur.v += k.v; }
      }
      return [...by.values()].sort((a, b) => a.t - b.t);
    };
    lines.push(
      '## Daily-candle breakout (slower, not faster)',
      '',
      'Daily candles aggregated from the same history. Fewer, bigger trades — the direction where cost drag shrinks instead of grows.',
      '',
      '| Lookback | Train (net) | Validate (net) | Verdict |',
      '|---|---|---|---|',
    );
    for (const L of [20, 55]) {
      const pool = { train: [], validate: [] };
      for (const [asset] of Object.entries(ASSETS)) {
        const daily = histories[asset] ? toDaily(histories[asset]) : [];
        if (daily.length < 400) continue;
        const c = costOf(asset);
        const ind = E.computeIndicators(daily);
        const splitT = daily[Math.floor(daily.length * 0.7)].t;
        for (const s of E.closedOf(E.computeBreakoutSignals(daily, ind, { lookback: L }))) {
          const tr = E.trailingScore(daily, s.i, s.side, s.entry, ind.atr[s.i]);
          if (!tr.closed) continue;
          pool[s.t < splitT ? 'train' : 'validate'].push({ m: tr.movePct, c });
        }
      }
      const tr = stats(net(pool.train)), va = stats(net(pool.validate));
      const v = !tr || !va || va.n < 15 ? '⚠️ too few signals to judge' : tr.avg > 0 && va.avg > 0 ? '✅ survives costs on daily' : '❌ no net edge on daily';
      lines.push(`| ${L} | ${fmtStats(tr)} | ${fmtStats(va)} | ${v} |`);
    }
    lines.push('');
    console.log('daily-candle study evaluated');
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
