/* Tier-1 enrichment data — information that is NOT derivable from the price
   series itself: crowd positioning (perp funding), event risk (economic
   calendar), cross-asset context (dollar-index / BTC trend), and sentiment
   (Fear & Greed). Everything here is free and keyless except the calendar
   (FMP). All fetchers degrade to null; features fall back to neutral
   defaults so a missing source never breaks scoring. */

import './engine.js';
import { ASSETS, fmpChart } from './feeds.mjs';

const E = globalThis.BudSignalEngine;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const day = (t) => new Date(t).toISOString().slice(0, 10);

const BYBIT_SYMBOLS = { BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', XRP: 'XRPUSDT' };
const OKX_INST = { BTC: 'BTC-USDT-SWAP', ETH: 'ETH-USDT-SWAP', SOL: 'SOL-USDT-SWAP', XRP: 'XRP-USDT-SWAP' };

/* ---------- perp funding-rate history (positioning) ---------- */

async function bybitFunding(symbol, sinceT) {
  const out = [];
  let endTime = Date.now();
  for (let page = 0; page < 30 && endTime > sinceT; page++) {
    const r = await fetch(
      `https://api.bybit.com/v5/market/funding-history?category=linear&symbol=${symbol}&limit=200&endTime=${endTime}`,
      { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`Bybit HTTP ${r.status}`);
    const j = await r.json();
    const rows = j.result?.list || [];
    if (!rows.length) break;
    for (const row of rows) out.push({ t: +row.fundingRateTimestamp, rate: +row.fundingRate });
    endTime = Math.min(...rows.map((row) => +row.fundingRateTimestamp)) - 1;
    await sleep(150);
  }
  return out.sort((a, b) => a.t - b.t);
}

async function okxFunding(instId, sinceT) {
  const out = [];
  let after = '';
  for (let page = 0; page < 40; page++) {
    const r = await fetch(
      `https://www.okx.com/api/v5/public/funding-rate-history?instId=${instId}&limit=100${after ? `&after=${after}` : ''}`,
      { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`OKX HTTP ${r.status}`);
    const j = await r.json();
    const rows = j.data || [];
    if (!rows.length) break;
    for (const row of rows) out.push({ t: +row.fundingTime, rate: +row.fundingRate });
    const oldest = Math.min(...rows.map((row) => +row.fundingTime));
    if (oldest <= sinceT) break;
    after = String(oldest);
    await sleep(150);
  }
  return out.sort((a, b) => a.t - b.t);
}

export async function fetchFunding(asset, sinceT) {
  if (!BYBIT_SYMBOLS[asset]) return null;
  try { return await bybitFunding(BYBIT_SYMBOLS[asset], sinceT); }
  catch (e) {
    try { return await okxFunding(OKX_INST[asset], sinceT); }
    catch (e2) { console.log(`funding ${asset}: ${e.message} | ${e2.message}`); return null; }
  }
}

/* ---------- crypto Fear & Greed (sentiment) ---------- */

export async function fetchFearGreed() {
  try {
    const r = await fetch('https://api.alternative.me/fng/?limit=0&format=json',
      { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    return (j.data || [])
      .map((d) => ({ t: +d.timestamp * 1000, v: +d.value }))
      .sort((a, b) => a.t - b.t);
  } catch (e) { console.log(`fear&greed: ${e.message}`); return null; }
}

/* ---------- high-impact USD economic events (event risk) ---------- */

export async function fetchEconEvents(fmpKey, sinceT) {
  if (!fmpKey) return null;
  const events = [];
  const CHUNK = 80 * 86400000;
  try {
    for (let lo = sinceT; lo < Date.now() + 7 * 86400000; lo += CHUNK) {
      const range = `from=${day(lo)}&to=${day(Math.min(lo + CHUNK, Date.now() + 7 * 86400000))}&apikey=${encodeURIComponent(fmpKey)}`;
      const urls = [
        `https://financialmodelingprep.com/stable/economic-calendar?${range}`,
        `https://financialmodelingprep.com/api/v3/economic_calendar?${range}`,
      ];
      let rows = null;
      for (const url of urls) {
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const j = await r.json();
          if (Array.isArray(j)) { rows = j; break; }
        } catch (e) { /* try next */ }
      }
      if (rows) {
        for (const ev of rows) {
          const impact = (ev.impact || ev.importance || '').toString().toLowerCase();
          const cur = (ev.currency || ev.country || '').toString().toUpperCase();
          if ((impact === 'high' || impact === '3') && (cur === 'USD' || cur === 'US')) {
            const t = Date.parse(String(ev.date).replace(' ', 'T') + 'Z');
            if (!Number.isNaN(t)) events.push(t);
          }
        }
      }
      await sleep(200);
    }
  } catch (e) { console.log(`econ calendar: ${e.message}`); }
  return events.length ? events.sort((a, b) => a - b) : null;
}

/* ---------- cross-asset trend context ---------- */

// trend distance of a series at time t: (close - EMA50) / ATR, same scale as
// the engine's trendDist feature
function trendDistAt(candles, ind, t) {
  let i = candles.length - 1;
  while (i >= 0 && candles[i].t > t) i--;
  if (i < 0 || ind.emaSlow[i] == null || !ind.atr[i]) return null;
  return (candles[i].c - ind.emaSlow[i]) / ind.atr[i];
}

/* ---------- assembled context ---------- */

export async function buildEnrichment({ fmpKey, sinceT, btcCandles = null }) {
  const ctx = { funding: {}, fng: null, econ: null, usd: null, btc: null };
  for (const asset of Object.keys(BYBIT_SYMBOLS)) {
    ctx.funding[asset] = await fetchFunding(asset, sinceT);
  }
  ctx.fng = await fetchFearGreed();
  ctx.econ = await fetchEconEvents(fmpKey, sinceT);
  if (fmpKey) {
    try {
      const uup = await fmpChart('UUP', sinceT, Date.now(), fmpKey); // dollar-index ETF proxy
      ctx.usd = { candles: uup, ind: E.computeIndicators(uup) };
    } catch (e) { console.log(`UUP: ${e.message}`); }
  }
  if (btcCandles && btcCandles.length > 60) {
    ctx.btc = { candles: btcCandles, ind: E.computeIndicators(btcCandles) };
  }
  const cov = [
    `funding ${Object.values(ctx.funding).filter(Boolean).length}/4`,
    `fng ${ctx.fng ? ctx.fng.length : 0}`,
    `econ ${ctx.econ ? ctx.econ.length : 0}`,
    `usd ${ctx.usd ? 'ok' : 'no'}`, `btc ${ctx.btc ? 'ok' : 'no'}`,
  ].join(' · ');
  console.log(`enrichment coverage: ${cov}`);
  ctx.coverage = cov;
  return ctx;
}

// Adds enriched fields to a signal (mutates + returns it). Missing sources
// leave fields undefined — mlFeatures() substitutes neutral defaults.
export function enrichSignal(asset, sig, ctx) {
  if (!ctx) return sig;
  const rates = ctx.funding[asset];
  if (rates && rates.length) {
    let i = rates.length - 1;
    while (i >= 0 && rates[i].t > sig.t) i--;
    if (i >= 0) {
      sig.fundRate = Math.round(rates[i].rate * 1e6) / 1e6;
      const win = rates.slice(Math.max(0, i - 90), i + 1).map((r) => r.rate); // ~30 days of 8h fundings
      if (win.length >= 10) {
        const below = win.filter((v) => v <= rates[i].rate).length;
        sig.fundPctl = Math.round((below / win.length) * 100) / 100;
      }
    }
  }
  if (ctx.fng && ctx.fng.length && ASSETS[asset]?.kind === 'crypto') {
    let i = ctx.fng.length - 1;
    while (i >= 0 && ctx.fng[i].t > sig.t) i--;
    if (i >= 0) sig.fng = ctx.fng[i].v;
  }
  if (ctx.econ && ctx.econ.length) {
    const next = ctx.econ.find((t) => t >= sig.t);
    if (next != null) sig.eventHrs = Math.round(Math.min((next - sig.t) / 3600000, 48) * 10) / 10;
  }
  const src = ASSETS[asset]?.kind === 'crypto' ? (asset === 'BTC' ? null : ctx.btc) : ctx.usd;
  if (src) {
    const d = trendDistAt(src.candles, src.ind, sig.t);
    if (d != null) sig.ctxTrend = Math.round(d * 100) / 100;
  }
  return sig;
}

/* ---------- live metrics snapshot (recorded every 4h — history compounds) ---------- */

export async function snapshotMetrics() {
  const snap = { t: Date.now(), funding: {}, oi: {}, fng: null };
  for (const [asset, symbol] of Object.entries(BYBIT_SYMBOLS)) {
    try {
      const r = await fetch(
        `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`,
        { signal: AbortSignal.timeout(10000) });
      const j = await r.json();
      const row = j.result?.list?.[0];
      if (row) {
        snap.funding[asset] = +row.fundingRate;
        snap.oi[asset] = +row.openInterestValue || +row.openInterest || null;
      }
    } catch (e) { /* skip */ }
    await sleep(100);
  }
  try {
    const r = await fetch('https://api.alternative.me/fng/?limit=1', { signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    snap.fng = +j.data?.[0]?.value || null;
  } catch (e) { /* skip */ }
  return snap;
}
