/* BudSignal desk feed — fetches the site's market candles server-side with
   the repo's FMP secret and publishes them to the budsignal-data branch,
   so every visitor's charts, radar, watchlist and scalp desk are LIVE with
   no browser key at all. The browser key becomes an optional booster
   (forming-candle freshness + the lookup tool), never a requirement.

   Runs hourly: the 1h scalp pairs refresh every run; the 4h set only on
   hours divisible by 4 (candles only change when they close), keeping the
   secret key's daily call count around ninety.

   Output shape is deliberately compact (arrays, not objects):
     { updated, h4: { ASSET: [[t,o,h,l,c,v], ...] }, h1: { ... } }

   Environment:
     FMP_API_KEY   required
     CANDLES_FILE  output path (default candles.json)
     FORCE_H4=1    refresh the 4h set regardless of the hour
     SELF_TEST=1   offline: exercise the packer, write nothing */

import './engine.js';
import { ASSETS, fmpChart } from './feeds.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const FMP_KEY = process.env.FMP_API_KEY || '';
const OUT = process.env.CANDLES_FILE || 'candles.json';
const SELF_TEST = process.env.SELF_TEST === '1';
const E = globalThis.BudSignalEngine;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const pack = (candles) => candles.map((c) => [c.t, c.o, c.h, c.l, c.c, c.v || 0]);

// every non-crypto market the site charts (BTC is keyless in-browser via Binance)
const H4_ASSETS = Object.entries(ASSETS).filter(([, cfg]) => cfg.kind !== 'crypto').map(([a]) => a);

async function main() {
  if (SELF_TEST) {
    const fake = [{ t: 1, o: 2, h: 3, l: 1.5, c: 2.5, v: 9 }];
    const p = pack(fake);
    if (JSON.stringify(p) !== '[[1,2,3,1.5,2.5,9]]') { console.error('SELF_TEST FAILED'); process.exit(1); }
    console.log('self-test OK');
    return;
  }
  if (!FMP_KEY) { console.error('FMP_API_KEY required'); process.exit(1); }

  // start from the previous publish so a partial failure degrades, never blanks
  let out = { h4: {}, h1: {} };
  try { out = { h4: {}, h1: {}, ...JSON.parse(readFileSync(OUT, 'utf8')) }; } catch (e) { /* first run */ }

  const hour = new Date().getUTCHours();
  const doH4 = process.env.FORCE_H4 === '1' || hour % 4 === 0 || !Object.keys(out.h4).length;
  let fetched = 0, failed = 0;

  if (doH4) {
    for (const a of H4_ASSETS) {
      try {
        const candles = (await fmpChart(ASSETS[a].fmp, Date.now() - 170 * 86400000, Date.now(), FMP_KEY, '4hour'))
          .sort((x, y) => x.t - y.t).slice(-1000);
        if (candles.length < 100) throw new Error(`only ${candles.length} candles`);
        out.h4[a] = pack(candles);
        fetched++;
      } catch (e) { failed++; console.log(`4h ${a}: ${e.message} (previous data kept)`); }
      await sleep(400);
    }
  } else {
    console.log('4h set skipped (refreshes on hours divisible by 4)');
  }

  for (const a of E.SCALP.ASSETS) {
    try {
      const candles = (await fmpChart(ASSETS[a].fmp, Date.now() - 30 * 86400000, Date.now(), FMP_KEY, '1hour'))
        .sort((x, y) => x.t - y.t).slice(-420);
      if (candles.length < 100) throw new Error(`only ${candles.length} candles`);
      out.h1[a] = pack(candles);
      fetched++;
    } catch (e) { failed++; console.log(`1h ${a}: ${e.message} (previous data kept)`); }
    await sleep(400);
  }

  if (!fetched && failed) { console.error('every fetch failed — keeping the previous file'); process.exit(1); }
  out.updated = Date.now();
  writeFileSync(OUT, JSON.stringify(out));
  console.log(`wrote ${OUT}: h4=${Object.keys(out.h4).length} markets, h1=${Object.keys(out.h1).length}, ${fetched} refreshed, ${failed} kept previous`);
}

main().catch((e) => { console.error(e); process.exit(1); });
