/* BudSignal — page logic: data fetching, rendering, charts. All indicator
   math and signal rules live in engine.js (shared with the Telegram
   notifier) so the site and the alerts can never disagree. */

(() => {
  'use strict';

  const E = globalThis.BudSignalEngine;
  const CANDLE_MS = E.CFG.CANDLE_MS;
  const CANDLE_LIMIT = 1000;     // ~166 days of 4h candles
  const VISIBLE = 120;           // candles drawn on the chart

  // kind 'crypto' loads keyless from Binance/Coinbase; kind 'market' (metals,
  // indices, FX) loads from FMP or Twelve Data with the user's own API key.
  // ETH / SOL / XRP removed by owner request (BTC is the only crypto kept).
  const ASSETS = {
    BTC:    { kind: 'crypto', tab: 'BTC',     pair: 'BTC / USD',        binance: 'BTCUSDT',  kraken: 'XBTUSD', fmp: 'BTCUSD', demoPrice: 64000, demoSeed: 42 },
    GOLD:   { kind: 'market', tab: 'GOLD',    pair: 'XAU / USD · Gold',   fmp: 'XAUUSD', td: 'XAU/USD', demoPrice: 2700,  demoSeed: 5 },
    US30:   { kind: 'market', tab: 'US30',    pair: 'US30 · Dow (DIA proxy)',   fmp: 'DIA',   td: 'DJI',     demoPrice: 44000, demoSeed: 13 },
    NAS100: { kind: 'market', tab: 'NAS100',  pair: 'NAS100 · Nasdaq (QQQ proxy)', fmp: 'QQQ',  td: 'NDX',     demoPrice: 21000, demoSeed: 31 },
    SPX500: { kind: 'market', tab: 'SPX500',  pair: 'SPX500 · S&P (SPY proxy)',   fmp: 'SPY',  td: 'SPX',     demoPrice: 6000,  demoSeed: 17 },
    GBPUSD: { kind: 'market', tab: 'GBP/USD', pair: 'GBP / USD · Cable',  fmp: 'GBPUSD', td: 'GBP/USD', demoPrice: 1.27,  demoSeed: 21 },
    EURUSD: { kind: 'market', tab: 'EUR/USD', pair: 'EUR / USD',          fmp: 'EURUSD', td: 'EUR/USD', demoPrice: 1.08,  demoSeed: 9 },
    OIL:    { kind: 'market', tab: 'OIL',     pair: 'WTI Crude Oil',      fmp: 'CLUSD',  td: 'WTI/USD', demoPrice: 78,    demoSeed: 25 },
  };

  const FMP_KEY_STORE = 'budsignal-fmp-key';
  const TD_KEY_STORE = 'budsignal-td-key';

  // Account settings drive position sizing in the trade plan and the paper
  // account. Defaults match the owner's live account: £3,500, 1% per trade.
  const ACCT_STORE = 'budsignal-acct-gbp';
  const RISK_STORE = 'budsignal-risk-pct';
  const acctGbp = () => { const v = parseFloat(localStorage.getItem(ACCT_STORE)); return v > 0 ? v : 3500; };
  const riskPct = () => { const v = parseFloat(localStorage.getItem(RISK_STORE)); return v > 0 && v <= 5 ? v : 1; };

  let currentAsset = localStorage.getItem('budsignal-asset');
  if (!ASSETS[currentAsset]) currentAsset = 'BTC';

  const COLORS = {
    up: '#0ca30c', down: '#d03b3b',
    ema20: '#3987e5', ema50: '#c98500',
    line: '#3987e5', lineWash: 'rgba(57, 135, 229, 0.10)',
    grid: '#2c2c2a', baseline: '#383835',
    muted: '#898781', ink: '#ffffff', surface: '#1a1a19',
  };

  const $ = (id) => document.getElementById(id);

  const fmtUsd = (v, digits = 0) =>
    v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  // Adaptive decimals so sub-dollar assets (XRP) and FX stay readable.
  const fmtPrice = (v) => fmtUsd(v, v >= 1000 ? 0 : v >= 10 ? 2 : 4);
  const fmtPct = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
  const fmtTime = (t) => {
    const d = new Date(t);
    return d.toISOString().slice(0, 16).replace('T', ' ');
  };
  const fmtClock = (t) => new Date(t).toISOString().slice(11, 16);

  /* ---------------- data ---------------- */

  async function fetchCandles(asset) {
    const cfg = ASSETS[asset];

    if (cfg.kind === 'market') {
      const fmpKey = localStorage.getItem(FMP_KEY_STORE);
      const tdKey = localStorage.getItem(TD_KEY_STORE);
      if (fmpKey) {
        try { return await fetchFmp(cfg, fmpKey); } catch (e) { /* fall through */ }
      }
      if (tdKey) {
        try { return await fetchTwelveData(cfg, tdKey); } catch (e) { /* fall through */ }
      }
      return {
        source: fmpKey || tdKey
          ? 'demo data (data-provider request failed — check your API key and plan; figures are illustrative only)'
          : 'demo data — add an FMP or Twelve Data API key above to load live prices',
        candles: demoCandles(cfg.demoPrice, cfg.demoSeed),
      };
    }

    // Binance kline row: [openTime, open, high, low, close, volume, ...]
    try {
      const r = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${cfg.binance}&interval=4h&limit=${CANDLE_LIMIT}`,
        { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const rows = await r.json();
      return {
        source: `Binance (${asset}/USDT, live)`,
        candles: rows.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] })),
      };
    } catch (e) { /* fall through */ }

    // Kraken: native 4h (240-min) candles, CORS-enabled, not geo-blocked
    // where Binance is. Row: [t, o, h, l, c, vwap, volume, count].
    try {
      const r = await fetch(
        `https://api.kraken.com/0/public/OHLC?pair=${cfg.kraken}&interval=240`,
        { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (j.error?.length) throw new Error(j.error[0]);
      const key = Object.keys(j.result).find((k) => k !== 'last');
      return {
        source: `Kraken (${asset}/USD, live)`,
        candles: j.result[key].map((k) => ({ t: k[0] * 1000, o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[6] })),
      };
    } catch (e) { /* fall through */ }

    // last chance: FMP also lists major crypto pairs
    const fmpKey = localStorage.getItem(FMP_KEY_STORE);
    if (fmpKey) {
      try { return await fetchFmp(cfg, fmpKey); } catch (e) { /* fall through */ }
    }

    return {
      source: 'demo data (exchange APIs unreachable — figures are illustrative only)',
      candles: demoCandles(cfg.demoPrice, cfg.demoSeed),
    };
  }

  // FMP intraday chart. Keys issued after the 2025 API revamp only work on
  // /stable/ endpoints (legacy /api/v3/ returns 403 for them) — try stable
  // first, fall back to v3 for older keys.
  async function fetchFmp(cfg, key) {
    const now = Date.now();
    const day = (x) => new Date(x).toISOString().slice(0, 10);
    const range = `from=${day(now - 170 * 86400000)}&to=${day(now)}&apikey=${encodeURIComponent(key)}`;
    const urls = [
      `https://financialmodelingprep.com/stable/historical-chart/4hour?symbol=${encodeURIComponent(cfg.fmp)}&${range}`,
      `https://financialmodelingprep.com/api/v3/historical-chart/4hour/${encodeURIComponent(cfg.fmp)}?${range}`,
    ];
    let lastErr = 'no data';
    for (const url of urls) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (!Array.isArray(j) || !j.length) throw new Error((j && (j['Error Message'] || j.message)) || 'no data');
        const candles = j.map((v) => ({
          t: Date.parse(v.date.replace(' ', 'T') + 'Z'),
          o: +v.open, h: +v.high, l: +v.low, c: +v.close,
          v: v.volume != null ? +v.volume : 0,
        })).sort((a, b) => a.t - b.t).slice(-CANDLE_LIMIT);
        return { source: `FMP (${cfg.fmp}, live)`, candles };
      } catch (e) { lastErr = e.message; }
    }
    throw new Error(lastErr);
  }

  // Twelve Data time_series: values[] newest-first; FX/index rows may omit volume.
  async function fetchTwelveData(cfg, key) {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(cfg.td)}` +
      `&interval=4h&outputsize=${CANDLE_LIMIT}&apikey=${encodeURIComponent(key)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (j.status === 'error' || !Array.isArray(j.values)) throw new Error(j.message || 'no data');
    const candles = j.values.map((v) => ({
      t: Date.parse(v.datetime.includes(' ') ? v.datetime.replace(' ', 'T') + 'Z' : v.datetime + 'T00:00:00Z'),
      o: +v.open, h: +v.high, l: +v.low, c: +v.close,
      v: v.volume != null ? +v.volume : 0,
    })).reverse();
    return { source: `Twelve Data (${cfg.td}, live)`, candles };
  }

  // Deterministic random walk so the page still demonstrates itself offline.
  function demoCandles(basePrice, seed) {
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const out = [];
    let t = Date.now() - CANDLE_LIMIT * CANDLE_MS;
    let price = basePrice;
    let drift = 0;
    for (let i = 0; i < CANDLE_LIMIT; i++) {
      if (i % 40 === 0) drift = (rand() - 0.5) * 0.004;
      const o = price;
      const shock = (rand() - 0.5) * 0.02 + drift;
      const c = o * (1 + shock);
      const h = Math.max(o, c) * (1 + rand() * 0.006);
      const l = Math.min(o, c) * (1 - rand() * 0.006);
      const v = 800 + rand() * 1200;
      out.push({ t, o, h, l, c, v });
      price = c;
      t += CANDLE_MS;
    }
    return out;
  }

  /* ---------------- price chart ---------------- */

  const chart = {
    canvas: null, ctx: null,
    candles: [], ind: null, signals: [],
    view: null, listenersBound: false,
  };

  function setupChart(candles, ind, signals, breakout) {
    chart.canvas = $('chart');
    chart.ctx = chart.canvas.getContext('2d');
    chart.candles = candles;
    chart.ind = ind;
    chart.signals = signals;
    chart.breakout = breakout || [];
    drawChart();
    if (!chart.listenersBound) {
      window.addEventListener('resize', () => { drawChart(); drawEquity(); });
      chart.canvas.addEventListener('mousemove', onChartHover);
      chart.canvas.addEventListener('mouseleave', hideTooltip);
      chart.listenersBound = true;
    }
  }

  function drawChart(hoverIdx = null) {
    const { canvas, ctx, candles, ind, signals } = chart;
    if (!candles.length) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(rect.width * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = rect.width, H = rect.height;
    ctx.clearRect(0, 0, W, H);

    const start = Math.max(0, candles.length - VISIBLE);
    const view = candles.slice(start);
    const padR = 72, padT = 12, padB = 26, padL = 6;
    const plotW = W - padL - padR, plotH = H - padT - padB;

    let lo = Infinity, hi = -Infinity;
    for (const c of view) { lo = Math.min(lo, c.l); hi = Math.max(hi, c.h); }
    const span = (hi - lo) || 1;
    lo -= span * 0.05; hi += span * 0.05;

    const x = (i) => padL + ((i - start) + 0.5) * (plotW / view.length);
    const y = (p) => padT + (1 - (p - lo) / (hi - lo)) * plotH;
    chart.view = { start, x, y, padL, padR, padT, padB, plotW, plotH, lo, hi, W, H };

    // gridlines + right price axis, clean steps
    const step = niceStep((hi - lo) / 5);
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) {
      const yy = y(p);
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'left';
      ctx.fillText(fmtPrice(p), W - padR + 8, yy);
    }

    // time axis: one label roughly every 24 candles
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i < view.length; i += 24) {
      const cx = x(start + i);
      if (cx < 34) continue; // a centered label this close to the edge would clip
      const d = new Date(view[i].t);
      const label = `${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCDate()}`;
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(label, cx, H - padB + 8);
    }

    // trade levels for the latest visible signal: entry / stop / target lines
    // from the signal candle to the right edge, so the setup is readable on
    // the chart itself. Drawn under the candles.
    const latest = signals.length ? signals[signals.length - 1] : null;
    if (latest && latest.i >= start && (latest.outcome === 'open' || candles.length - 1 - latest.i <= E.CFG.EVAL_CANDLES)) {
      const x0 = x(latest.i);
      const levels = [
        { p: latest.target, color: COLORS.up, label: 'Target' },
        { p: latest.entry, color: COLORS.muted, label: 'Entry' },
        { p: latest.stop, color: COLORS.down, label: 'Stop' },
      ];
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      for (const lvl of levels) {
        if (lvl.p < lo || lvl.p > hi) continue;
        const yy = y(lvl.p);
        ctx.strokeStyle = lvl.color;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
        ctx.fillStyle = COLORS.muted;
        ctx.fillText(lvl.label, W - padR - 4, yy - 2);
      }
      ctx.restore();
    }

    // candles — thin bodies with a surface gap between neighbors
    const slot = plotW / view.length;
    const bodyW = Math.min(24, Math.max(2, Math.floor(slot) - 2));
    for (let i = 0; i < view.length; i++) {
      const c = view[i];
      const cx = x(start + i);
      const col = c.c >= c.o ? COLORS.up : COLORS.down;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, y(c.h)); ctx.lineTo(cx, y(c.l)); ctx.stroke();
      const top = y(Math.max(c.o, c.c)), bot = y(Math.min(c.o, c.c));
      ctx.fillStyle = col;
      ctx.fillRect(cx - bodyW / 2, top, bodyW, Math.max(1, bot - top));
    }

    // EMA overlays — 2px lines
    drawSeries(ctx, chart.ind.emaFast, start, view.length, x, y, COLORS.ema20);
    drawSeries(ctx, chart.ind.emaSlow, start, view.length, x, y, COLORS.ema50);

    // signal markers: triangle beyond the wick, with a surface ring for legibility
    for (const s of signals) {
      if (s.i < start) continue;
      const cx = x(s.i);
      const c = candles[s.i];
      const up = s.side === 'long';
      const cy = up ? y(c.l) + 14 : y(c.h) - 14;
      ctx.beginPath();
      if (up) { ctx.moveTo(cx, cy - 6); ctx.lineTo(cx - 6, cy + 5); ctx.lineTo(cx + 6, cy + 5); }
      else    { ctx.moveTo(cx, cy + 6); ctx.lineTo(cx - 6, cy - 5); ctx.lineTo(cx + 6, cy - 5); }
      ctx.closePath();
      ctx.fillStyle = up ? COLORS.up : COLORS.down;
      ctx.strokeStyle = COLORS.surface;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fill();
    }

    // breakout markers: diamonds (shape distinguishes the stream, not color)
    for (const s of chart.breakout) {
      if (s.i < start) continue;
      const cx = x(s.i);
      const c = candles[s.i];
      const up = s.side === 'long';
      const cy = up ? y(c.l) + 16 : y(c.h) - 16;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 6); ctx.lineTo(cx + 5, cy); ctx.lineTo(cx, cy + 6); ctx.lineTo(cx - 5, cy);
      ctx.closePath();
      ctx.fillStyle = up ? COLORS.up : COLORS.down;
      ctx.strokeStyle = COLORS.surface;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fill();
    }

    // crosshair
    if (hoverIdx != null && hoverIdx >= start) {
      const cx = x(hoverIdx);
      ctx.strokeStyle = COLORS.baseline;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(cx, padT); ctx.lineTo(cx, H - padB); ctx.stroke();
    }
  }

  function drawSeries(ctx, series, start, n, x, y, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < n; i++) {
      const v = series[start + i];
      if (v == null) continue;
      if (!started) { ctx.moveTo(x(start + i), y(v)); started = true; }
      else ctx.lineTo(x(start + i), y(v));
    }
    ctx.stroke();
  }

  function niceStep(raw) {
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag) return m * mag;
    return 10 * mag;
  }

  function onChartHover(ev) {
    const v = chart.view;
    if (!v) return;
    const rect = chart.canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const n = chart.candles.length - v.start;
    let idx = v.start + Math.floor((mx - v.padL) / (v.plotW / n));
    idx = Math.max(v.start, Math.min(chart.candles.length - 1, idx));
    drawChart(idx);

    const c = chart.candles[idx];
    const sig = chart.signals.find((s) => s.i === idx) || chart.breakout.find((s) => s.i === idx);
    const tt = $('tooltip');
    tt.innerHTML = `
      <div class="tt-time">${fmtTime(c.t)} UTC</div>
      <div class="tt-row"><span>Open</span><span>${fmtPrice(c.o)}</span></div>
      <div class="tt-row"><span>High</span><span>${fmtPrice(c.h)}</span></div>
      <div class="tt-row"><span>Low</span><span>${fmtPrice(c.l)}</span></div>
      <div class="tt-row"><span>Close</span><span>${fmtPrice(c.c)}</span></div>
      ${c.v ? `<div class="tt-row"><span>Volume</span><span>${fmtUsd(c.v)}</span></div>` : ''}
      ${chart.ind.emaFast[idx] != null ? `<div class="tt-row"><span>EMA 20</span><span>${fmtPrice(chart.ind.emaFast[idx])}</span></div>` : ''}
      ${chart.ind.emaSlow[idx] != null ? `<div class="tt-row"><span>EMA 50</span><span>${fmtPrice(chart.ind.emaSlow[idx])}</span></div>` : ''}
      ${sig ? `<div class="tt-signal ${sig.side}">${sig.side === 'long' ? '▲ LONG' : '▼ SHORT'} ${sig.strategy === 'breakout' ? 'breakout' : 'signal'} · entry ${fmtPrice(sig.entry)}</div>` : ''}`;
    tt.hidden = false;
    const ttw = tt.offsetWidth;
    const px = chart.view.x(idx);
    tt.style.left = `${px + 14 + ttw > rect.width ? px - ttw - 14 : px + 14}px`;
    tt.style.top = '14px';
  }

  function hideTooltip() {
    $('tooltip').hidden = true;
    drawChart();
  }

  /* ---------------- equity curve (cumulative move across closed signals) ---------------- */

  const equity = { canvas: null, points: [], view: null, listenersBound: false };

  function setupEquity(signals) {
    equity.canvas = $('equity');
    const closed = E.closedOf(signals);
    let cum = 0;
    equity.points = closed.map((s) => {
      cum += s.movePct;
      return { t: s.t, side: s.side, move: s.movePct, cum };
    });
    const wrap = $('equity-wrap');
    wrap.hidden = equity.points.length < 2;
    if (!wrap.hidden) drawEquity();
    if (!equity.listenersBound && equity.canvas) {
      equity.canvas.addEventListener('mousemove', onEquityHover);
      equity.canvas.addEventListener('mouseleave', () => { $('equity-tooltip').hidden = true; drawEquity(); });
      equity.listenersBound = true;
    }
  }

  function drawEquity(hoverIdx = null) {
    const { canvas, points } = equity;
    if (!canvas || points.length < 2) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(rect.width * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = rect.width, H = rect.height;
    ctx.clearRect(0, 0, W, H);
    const padR = 56, padT = 10, padB = 22, padL = 8;
    const plotW = W - padL - padR, plotH = H - padT - padB;

    let lo = 0, hi = 0;
    for (const p of points) { lo = Math.min(lo, p.cum); hi = Math.max(hi, p.cum); }
    const span = (hi - lo) || 1;
    lo -= span * 0.1; hi += span * 0.1;

    const x = (i) => padL + (i / (points.length - 1)) * plotW;
    const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * plotH;
    equity.view = { x, y, padL, padR, plotW, W, H };

    // hairline grid + right axis
    const step = niceStep((hi - lo) / 4);
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) {
      const yy = y(p);
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'left';
      ctx.fillText(`${p >= 0 ? '+' : ''}${p.toFixed(1)}%`, W - padR + 8, yy);
    }
    // zero baseline slightly stronger
    if (lo < 0 && hi > 0) {
      ctx.strokeStyle = COLORS.baseline;
      ctx.beginPath(); ctx.moveTo(padL, y(0)); ctx.lineTo(W - padR, y(0)); ctx.stroke();
    }
    // first/last date labels
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = 'left';
    ctx.fillText(fmtTime(points[0].t).slice(0, 10), padL, H - padB + 6);
    ctx.textAlign = 'right';
    ctx.fillText(fmtTime(points[points.length - 1].t).slice(0, 10), W - padR, H - padB + 6);

    // area wash + 2px line
    ctx.beginPath();
    points.forEach((p, i) => { i ? ctx.lineTo(x(i), y(p.cum)) : ctx.moveTo(x(0), y(p.cum)); });
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.lineTo(x(points.length - 1), y(Math.max(lo, 0)));
    ctx.lineTo(x(0), y(Math.max(lo, 0)));
    ctx.closePath();
    ctx.fillStyle = COLORS.lineWash;
    ctx.fill();

    // markers with a surface ring; hovered point enlarged
    points.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(x(i), y(p.cum), i === hoverIdx ? 5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.line;
      ctx.strokeStyle = COLORS.surface;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fill();
    });
  }

  function onEquityHover(ev) {
    const v = equity.view;
    if (!v) return;
    const rect = equity.canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const n = equity.points.length;
    let idx = Math.round(((mx - v.padL) / v.plotW) * (n - 1));
    idx = Math.max(0, Math.min(n - 1, idx));
    drawEquity(idx);
    const p = equity.points[idx];
    const tt = $('equity-tooltip');
    tt.innerHTML = `
      <div class="tt-time">${fmtTime(p.t)} UTC</div>
      <div class="tt-row"><span>Signal</span><span>${p.side === 'long' ? '▲ LONG' : '▼ SHORT'}</span></div>
      <div class="tt-row"><span>Move</span><span>${fmtPct(p.move)}</span></div>
      <div class="tt-row"><span>Cumulative</span><span>${fmtPct(p.cum)}</span></div>`;
    tt.hidden = false;
    const ttw = tt.offsetWidth;
    const px = v.x(idx);
    tt.style.left = `${px + 12 + ttw > rect.width ? px - ttw - 12 : px + 12}px`;
    tt.style.top = '8px';
  }

  /* ---------------- page rendering ---------------- */

  function renderAssetTabs() {
    const wrap = $('asset-tabs');
    wrap.innerHTML = Object.entries(ASSETS).map(([a, cfg]) =>
      `<button class="asset-tab${a === currentAsset ? ' active' : ''}" role="tab"
        aria-selected="${a === currentAsset}" data-asset="${a}">${cfg.tab}</button>`).join('');
    wrap.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.asset === currentAsset) return;
        currentAsset = b.dataset.asset;
        localStorage.setItem('budsignal-asset', currentAsset);
        refresh();
      });
    });

    // The API-key row only concerns non-crypto (FMP / Twelve Data) assets.
    const keyRow = $('key-row');
    keyRow.hidden = ASSETS[currentAsset].kind !== 'market';
    if (!keyRow.dataset.bound) {
      keyRow.dataset.bound = '1';
      $('fmp-key').value = localStorage.getItem(FMP_KEY_STORE) || '';
      $('td-key').value = localStorage.getItem(TD_KEY_STORE) || '';
      $('keys-save').addEventListener('click', () => {
        const fmp = $('fmp-key').value.trim();
        const td = $('td-key').value.trim();
        if (fmp) localStorage.setItem(FMP_KEY_STORE, fmp); else localStorage.removeItem(FMP_KEY_STORE);
        if (td) localStorage.setItem(TD_KEY_STORE, td); else localStorage.removeItem(TD_KEY_STORE);
        refresh();
      });
    }
  }

  function renderTiles(candles, ind, signals, baseline, breakout) {
    const all = [...signals, ...breakout];
    const closed = E.closedOf(all);
    const favorable = closed.filter((s) => s.movePct > 0);
    const warmupIdx = Math.min(candles.length - 1, E.CFG.EMA_TREND);
    const days = Math.round((candles[candles.length - 1].t - candles[warmupIdx].t) / 86400000);

    const wr = E.favorableRate(closed);
    $('tile-winrate').textContent = wr == null ? 'n/a' : `${wr.toFixed(0)}%`;
    $('tile-winrate-note').textContent = closed.length
      ? `${favorable.length} of ${closed.length} closed signals ended favorable`
      : 'no closed signals in loaded history';

    $('tile-signals').textContent = String(all.length);
    $('tile-signals-note').textContent =
      `over ${days} days · ${signals.length} cross + ${breakout.length} breakout`;

    const avg = closed.length ? closed.reduce((a, s) => a + s.movePct, 0) / closed.length : null;
    const avgEl = $('tile-avgmove');
    avgEl.textContent = avg == null ? 'n/a' : fmtPct(avg);
    avgEl.classList.remove('pos', 'neg');
    if (avg != null) avgEl.classList.add(avg >= 0 ? 'pos' : 'neg');

    const i = candles.length - 1;
    const bull = ind.emaFast[i] != null && ind.emaSlow[i] != null && ind.emaFast[i] > ind.emaSlow[i];
    const trending = ind.adx[i] != null && ind.adx[i] >= E.CFG.ADX_MIN;
    const regimeEl = $('tile-regime');
    regimeEl.textContent = trending ? (bull ? 'Uptrend' : 'Downtrend') : 'Chop';
    regimeEl.classList.remove('pos', 'neg');
    if (trending) regimeEl.classList.add(bull ? 'pos' : 'neg');
    $('tile-regime-note').textContent = trending
      ? `${bull ? 'EMA 20 above EMA 50' : 'EMA 20 below EMA 50'} · ADX ${ind.adx[i].toFixed(0)}`
      : `ADX ${ind.adx[i] != null ? ind.adx[i].toFixed(0) : '—'} < ${E.CFG.ADX_MIN} — signals gated off`;
  }

  function renderIndicators(candles, ind) {
    const i = candles.length - 1;
    $('ind-rsi').textContent = ind.rsi[i] != null ? ind.rsi[i].toFixed(1) : '—';
    $('ind-adx').textContent = ind.adx[i] != null ? ind.adx[i].toFixed(1) : '—';
    $('ind-ema20').textContent = ind.emaFast[i] != null ? `$${fmtPrice(ind.emaFast[i])}` : '—';
    $('ind-ema50').textContent = ind.emaSlow[i] != null ? `$${fmtPrice(ind.emaSlow[i])}` : '—';
    $('ind-ema200').textContent = ind.emaTrend[i] != null ? `$${fmtPrice(ind.emaTrend[i])}` : '—';
    $('ind-atr').textContent = ind.atr[i] != null ? `$${fmtPrice(ind.atr[i])}` : '—';
    const volRatio = ind.volSma[i] ? candles[i].v / ind.volSma[i] : null;
    $('ind-vol').textContent = volRatio ? `${(volRatio * 100).toFixed(0)}%` : '—';
  }

  // "Next candle" countdown — the moment the next 4h candle closes is the
  // next moment a signal can fire.
  let lastCandleT = null;
  function renderCountdown() {
    if (lastCandleT == null) return;
    let next = lastCandleT + CANDLE_MS;
    while (next <= Date.now()) next += CANDLE_MS;
    const ms = next - Date.now();
    $('ind-next').textContent = `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
  }

  function renderCurrentSignal(candles, ind, signals, breakout, swing) {
    const last = candles[candles.length - 1];
    const active = [...signals, ...breakout, ...(swing || [])]
      .filter((s) => last.t - s.t <= (s.candleMs || CANDLE_MS))
      .sort((a, b) => a.t - b.t);
    const badge = $('signal-badge');
    const copy = $('signal-copy');
    const levels = $('signal-levels');

    if (active.length) {
      const s = active[active.length - 1];
      badge.className = `signal-badge ${s.side}`;
      badge.textContent = `${s.side === 'long' ? '▲ LONG' : '▼ SHORT'}${s.strategy === 'breakout' ? ' · BREAKOUT' : s.strategy === 'swing' ? (s.early ? ' · EARLY SWING (DAILY-20)' : ' · SWING (DAILY)') : ''}`;
      $('signal-when').textContent = `${currentAsset} · fired ${fmtTime(s.t)} UTC`;
      copy.textContent = s.strategy === 'swing'
        ? `Price closed ${s.side === 'long' ? `above its ${s.early ? '20' : '55'}-day high` : `below its ${s.early ? '20' : '55'}-day low`} on the daily chart — ${s.early ? 'the validated early-swing variant (thinner edge than the main daily-55 stream)' : 'the strongest validated stream'}. Exit is a 2×ATR trailing stop evaluated on daily closes (max 18 days). The entry window is one daily candle.`
        : s.strategy === 'breakout'
        ? (s.side === 'long'
          ? 'Price closed above its 55-candle high — a momentum breakout. Exit is a 2×ATR trailing stop rather than a fixed target: winners run, losers are cut. The entry window is one 4-hour candle.'
          : 'Price closed below its 55-candle low — a momentum breakdown. Exit is a 2×ATR trailing stop rather than a fixed target: winners run, losers are cut. The entry window is one 4-hour candle.')
        : s.side === 'long'
        ? 'EMA 20 crossed above EMA 50 with the higher-timeframe trend, trend strength, slope, and momentum all confirming. The entry window is one 4-hour candle from the signal close; after that the setup expires.'
        : 'EMA 20 crossed below EMA 50 with the higher-timeframe trend, trend strength, slope, and momentum all confirming. The entry window is one 4-hour candle from the signal close; after that the setup expires.';
      $('lvl-entry').textContent = `$${fmtPrice(s.entry)}`;
      $('lvl-stop').textContent = `$${fmtPrice(s.stop)}`;
      $('lvl-target').textContent = s.target != null ? `$${fmtPrice(s.target)}` : 'trailing 2×ATR';
      const remaining = Math.max(0, s.t + (s.candleMs || CANDLE_MS) - Date.now());
      $('lvl-window').textContent = remaining > 0
        ? `${Math.floor(remaining / 3600000)}h ${Math.floor((remaining % 3600000) / 60000)}m left`
        : 'expired';
      $('lvl-conf').textContent = s.confidence != null ? `${s.confidence}/100` : 'n/a (breakout)';
      const aiWrap = $('lvl-ai-wrap');
      if (mlModel && s.rsiAt != null) {
        $('lvl-ai').textContent = `${Math.round(E.mlScore(s, mlModel) * 100)}% favorable`;
        aiWrap.hidden = false;
      } else {
        aiWrap.hidden = true;
      }
      levels.hidden = false;
      lastActiveSignal = s;
    } else {
      badge.className = 'signal-badge neutral';
      badge.textContent = '— NO SIGNAL';
      $('signal-when').textContent = `${currentAsset} · as of ${fmtTime(last.t)} UTC`;
      const lastSig = signals[signals.length - 1];
      copy.textContent = lastSig
        ? `Conditions don't currently line up on ${currentAsset} — the rule set is flat and waiting. The most recent signal was a ${lastSig.side.toUpperCase()} on ${fmtTime(lastSig.t)} UTC (see the track record below).`
        : `Conditions don't currently line up on ${currentAsset} — the rule set is flat and waiting. No signals passed the filters in the loaded history.`;
      levels.hidden = true;
      lastActiveSignal = null;
    }
    renderTradePlan();
  }

  /* ---------------- trade plan (account sizing) ---------------- */

  // Per-market breakout verdicts from the walk-forward research — published
  // by the research job, so the "trade it / skip it" call is evidence, not vibes.
  const EDGE_URL = 'https://raw.githubusercontent.com/lordbastian83/dig/budsignal-data/edge-status.json';
  let edgeStatus = null;
  async function loadEdgeStatus() {
    try {
      const r = await fetch(`${EDGE_URL}?v=${Math.floor(Date.now() / 3600000)}`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) edgeStatus = await r.json();
    } catch (e) { /* verdicts unavailable — plan falls back to paper-only wording */ }
  }

  // £ risk converts to USD-quoted instruments at the live cable rate; without
  // a data key the plan uses a flagged approximation instead.
  let gbpUsdRate = null;
  async function loadGbpUsd() {
    try {
      const { source, candles } = await fetchCandles('GBPUSD');
      if (!/demo/i.test(source) && candles.length) gbpUsdRate = candles[candles.length - 1].c;
    } catch (e) { /* approximate rate used instead */ }
  }

  const INDEX_PROXIES = ['US30', 'NAS100', 'SPX500'];
  let lastActiveSignal = null;

  function renderTradePlan() {
    const body = $('plan-body');
    if (!body) return;
    const s = lastActiveSignal;
    if (!s) {
      body.innerHTML = `<p class="plan-note">No live signal on ${currentAsset}, so there is nothing to do. ` +
        `The moment one fires, this panel (and the Telegram alert) turns it into an exact order: ` +
        `£${fmtUsd(acctGbp() * riskPct() / 100)} at risk (${riskPct()}% of £${fmtUsd(acctGbp())}), position sized to the stop, exits fixed in advance.</p>`;
      return;
    }
    const plan = E.tradePlan(currentAsset, s, { accountGbp: acctGbp(), riskPct: riskPct(), gbpUsd: gbpUsdRate });
    if (!plan) { body.innerHTML = ''; return; }
    const bk = s.strategy === 'breakout';
    const swing = s.strategy === 'swing';
    const es = edgeStatus?.assets?.[currentAsset];
    const verdict = swing
      ? (s.early
        ? '<p class="plan-verdict ok">✅ Qualifies for real money — validated early-swing variant (+0.5%/trade net in validation, PF 1.25 — thinner edge than the main daily-55 stream).</p>'
        : '<p class="plan-verdict ok">✅ Qualifies for real money — the daily swing stream is the strongest validated edge (+1.5%/trade net in validation, PF 1.9).</p>')
      : bk && es?.edge === true
      ? '<p class="plan-verdict ok">✅ Qualifies for real money — breakout signal on a market that kept a net edge out-of-sample.</p>'
      : bk
        ? '<p class="plan-verdict no">❌ Paper only — this market showed no net edge for the breakout strategy in walk-forward validation. Watch it, don\'t fund it.</p>'
        : '<p class="plan-verdict no">❌ Paper only — the cross stream has never beaten its baseline out-of-sample; real money goes only on validated streams.</p>';
    const lots = plan.lots != null ? Math.floor(plan.lots * 100) / 100 : null;
    const sizeLine = lots != null
      ? `<strong>${lots.toFixed(2)} lots</strong> (${plan.units.toFixed(plan.units < 10 ? 2 : 0)} units ≈ $${fmtUsd(plan.notionalUsd)} position)` +
        (lots < 0.01 ? ' — below the 0.01-lot minimum: skip the trade rather than over-risk' : '')
      : INDEX_PROXIES.includes(currentAsset)
        ? `set volume so <strong>position value ≈ $${fmtUsd(plan.notionalUsd)}</strong> — the chart uses an ETF proxy, so size by position value, not units`
        : `<strong>${plan.units.toFixed(plan.units < 1 ? 4 : 2)} ${currentAsset}</strong> ≈ $${fmtUsd(plan.notionalUsd)} position value`;
    const closeRule = bk || swing
      ? `<strong>Close:</strong> when price hits the trailing stop — it starts at $${fmtPrice(s.stop)} and after every ${swing ? 'daily' : '4-hour'} close moves to 2×ATR ${s.side === 'long' ? 'below the highest' : 'above the lowest'} close since entry, never loosening. Hard exit at market after ${swing ? '18 days' : '3 days'}.`
      : `<strong>Close:</strong> at target $${fmtPrice(s.target)} or stop $${fmtPrice(s.stop)}; move the stop to entry once 1×ATR in profit; exit at market after 24h.`;
    body.innerHTML = `
      ${verdict}
      <div class="plan-grid">
        <div><span class="lvl-label">Risk</span><span class="lvl-value">£${fmtUsd(plan.riskGbp)} = ${plan.riskPctEff}% of £${fmtUsd(acctGbp())}${plan.riskPctEff !== riskPct() ? ` (edge-weighted from your ${riskPct()}% base)` : ''} ≈ $${fmtUsd(plan.riskUsd)}</span></div>
        <div><span class="lvl-label">Size</span><span class="lvl-value">${sizeLine}</span></div>
        <div><span class="lvl-label">Stop distance</span><span class="lvl-value">${plan.stopPct.toFixed(2)}% from entry — sized so a stop-out costs £${fmtUsd(plan.riskGbp)}</span></div>
      </div>
      <p class="plan-note">${closeRule}${plan.rateApprox ? ' · £→$ conversion is approximate (add a data key to load live cable)' : ''}</p>`;
  }

  /* ---------------- breakout radar ---------------- */

  // Distance from every market to its next Donchian trigger, 4h and daily.
  // Fetches all markets, so it refreshes on load / manual refresh / a slow
  // 30-minute interval — not the 5-minute chart cycle — to stay inside
  // data-provider rate limits.
  async function renderRadar() {
    const body = $('radar-body');
    if (!body) return;
    const rows = await Promise.all(Object.keys(ASSETS).map(async (a) => {
      try {
        const { source, candles } = await fetchCandles(a);
        const closed = E.closedPrefix(candles, Date.now());
        if (closed.length < 60) return null;
        const r4 = E.breakoutRadar(closed);
        const daily = E.toDailyCandles(closed);
        while (daily.length && daily[daily.length - 1].t + E.SWING.CANDLE_MS > Date.now()) daily.pop();
        const rd = daily.length > 56 ? E.breakoutRadar(daily) : null;
        return { a, demo: /demo/i.test(source), price: closed[closed.length - 1].c, r4, rd };
      } catch (e) { return null; }
    }));
    const nearer = (r) => (r ? (r.upPct <= r.downPct
      ? { side: '▲', cls: 'move-pos', level: r.up, pct: r.upPct }
      : { side: '▼', cls: 'move-neg', level: r.down, pct: r.downPct }) : null);
    const cell = (n) => n
      ? `<span class="${n.cls}">${n.side}</span> $${fmtPrice(n.level)} <span class="${n.pct < 1 ? 'radar-hot' : 'radar-dist'}">${n.pct.toFixed(1)}% away</span>`
      : '—';
    const list = rows.filter(Boolean)
      .map((r) => ({ ...r, n4: nearer(r.r4), nd: nearer(r.rd) }))
      .sort((x, y) => (x.n4?.pct ?? 99) - (y.n4?.pct ?? 99));
    body.innerHTML = list.map((r) => `<tr>
      <td>${ASSETS[r.a].pair}${r.demo ? ' <span class="radar-dist">(demo)</span>' : ''}</td>
      <td class="num">$${fmtPrice(r.price)}</td>
      <td>${cell(r.n4)}</td>
      <td>${cell(r.nd)}</td>
    </tr>`).join('') || '<tr><td colspan="4" class="table-empty">No market data available.</td></tr>';
  }

  function renderTrackRecord(signals, baseline, candles, ind, breakout) {
    // Filters are only worth shipping if they measurably beat the raw cross —
    // so the comparison is computed and shown, not asserted. Same for the
    // trailing-exit experiment: identical entries, different exit, measured.
    const wrF = E.favorableRate(E.closedOf(signals));
    const wrB = E.favorableRate(E.closedOf(baseline));
    const trail = E.trailingComparison(candles, ind, signals);
    $('track-sub').textContent =
      `Every ${currentAsset} signal the rule set produced over the loaded history — recomputed from raw candles on each page load, so it cannot be curated.` +
      (wrF != null && wrB != null
        ? ` Filtered rules: ${wrF.toFixed(0)}% favorable (${E.closedOf(signals).length} closed) vs ${wrB.toFixed(0)}% for the unfiltered EMA-cross baseline (${E.closedOf(baseline).length} closed) over the same span.`
        : '') +
      (trail
        ? ` Exit experiment on the same entries: fixed target averaged ${fmtPct(trail.fixed.avg)} per signal vs ${fmtPct(trail.trail.avg)} with a trailing stop (${trail.trail.favPct.toFixed(0)}% favorable, ${trail.trail.n} signals).`
        : '');

    const body = $('record-body');
    const merged = [...signals, ...breakout].sort((a, b) => b.t - a.t);
    if (!merged.length) {
      body.innerHTML = '<tr><td colspan="7" class="table-empty">No signals over the loaded history.</td></tr>';
      return;
    }
    const rows = merged.map((s) => {
      const outcome =
        s.outcome === 'win' ? '<span class="outcome win">✓ Target hit</span>' :
        s.outcome === 'loss' ? '<span class="outcome loss">✕ Stopped out</span>' :
        s.outcome === 'be' ? '<span class="outcome flat">◇ Breakeven stop</span>' :
        s.outcome === 'trail' ? `<span class="outcome ${s.movePct >= 0 ? 'win' : 'loss'}">⤳ Trailed out</span>` :
        s.outcome === 'open' ? '<span class="outcome flat">● Open</span>' :
        '<span class="outcome flat">◦ Expired at market</span>';
      const moveCls = s.movePct >= 0 ? 'move-pos' : 'move-neg';
      return `<tr>
        <td>${fmtTime(s.t)}</td>
        <td>${s.strategy === 'breakout' ? '◆ Breakout' : s.strategy === 'swing' ? (s.early ? '🌊 Early swing (20d)' : '🌊 Swing (daily)') : s.strategy === 'scalp' ? '⚡ Scalp (1h)' : 'Cross'}</td>
        <td><span class="side-badge ${s.side}">${s.side === 'long' ? '▲ LONG' : '▼ SHORT'}</span></td>
        <td class="num">$${fmtPrice(s.entry)}</td>
        <td class="num">${s.exit != null ? '$' + fmtPrice(s.exit) : '—'}</td>
        <td>${outcome}</td>
        <td class="num ${moveCls}">${fmtPct(s.movePct)}</td>
      </tr>`;
    });
    body.innerHTML = rows.join('');
  }

  function renderHero(candles) {
    const last = candles[candles.length - 1];
    // 24h ago = 6 candles back on the 4h chart
    const ref = candles[Math.max(0, candles.length - 7)];
    const delta = ((last.c - ref.c) / ref.c) * 100;
    $('hero-symbol').textContent = ASSETS[currentAsset].pair;
    $('hero-price').textContent = `$${fmtPrice(last.c)}`;
    const dEl = $('hero-delta');
    dEl.textContent = `${fmtPct(delta)} · 24h`;
    dEl.className = `hero-price-delta ${delta >= 0 ? 'pos' : 'neg'}`;
  }

  /* ---------------- live performance (signal ledger) ---------------- */

  // Written by the alert bot every 4h to the budsignal-data branch; rows are
  // recorded when signals fire, so they cannot be retro-fitted.
  const LEDGER_URL = 'https://raw.githubusercontent.com/lordbastian83/dig/budsignal-data/performance.json';
  const ML_MODEL_URL = 'https://raw.githubusercontent.com/lordbastian83/dig/budsignal-data/ml-model.json';

  // ML meta-model: published by the research job ONLY if it passed
  // out-of-sample validation; absence means no model earned its place.
  let mlModel = null;
  async function loadMlModel() {
    try {
      const r = await fetch(`${ML_MODEL_URL}?v=${Math.floor(Date.now() / 3600000)}`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) mlModel = await r.json();
    } catch (e) { /* no model published */ }
  }

  async function loadPerformance() {
    let data = null;
    try {
      const r = await fetch(`${LEDGER_URL}?v=${Math.floor(Date.now() / 600000)}`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) data = await r.json();
    } catch (e) { /* fall through */ }
    if (!data) {
      try {
        const r = await fetch('performance.json', { signal: AbortSignal.timeout(4000) });
        if (r.ok) data = await r.json();
      } catch (e) { /* fall through */ }
    }
    renderPerformance(data);
  }

  // Paper account: starts at the user's own account size (default £3,500),
  // risking the same edge-weighted fraction per trade the trade plan uses
  // (position sized to the stop distance), compounded chronologically, net
  // of per-market costs.
  const PAPER_COSTS = { BTC: 0.10, ETH: 0.10, SOL: 0.10, XRP: 0.10, GOLD: 0.05, OIL: 0.05, US30: 0.02, NAS100: 0.02, SPX500: 0.02, GBPUSD: 0.03, EURUSD: 0.03 };
  function renderPaperAccount(recs) {
    const start = acctGbp();
    const closed = recs.filter((r) => r.outcome !== 'open' && r.entry && r.stop)
      .sort((a, b) => a.t - b.t);
    let equity = start, peak = start, maxDD = 0, best = null, worst = null;
    for (const r of closed) {
      const stopPct = Math.abs(r.entry - r.stop) / r.entry * 100;
      if (!stopPct) continue;
      const netMove = r.movePct - (PAPER_COSTS[r.asset] ?? 0.05);
      const R = netMove / stopPct;           // outcome in risk units
      const pnl = equity * 0.01 * E.riskMultiplier(r) * R; // 1% base, edge-weighted per stream
      equity += pnl;
      peak = Math.max(peak, equity);
      maxDD = Math.max(maxDD, (peak - equity) / peak * 100);
      if (best == null || pnl > best) best = pnl;
      if (worst == null || pnl < worst) worst = pnl;
    }
    const ret = (equity / start - 1) * 100;
    $('paper-equity').textContent = `£${fmtUsd(equity)}`;
    $('paper-start').textContent = `started at £${fmtUsd(start)}`;
    const retEl = $('paper-return');
    retEl.textContent = fmtPct(ret);
    retEl.classList.remove('pos', 'neg');
    retEl.classList.add(ret >= 0 ? 'pos' : 'neg');
    $('paper-trades').textContent = `${closed.length} closed trades, 1% risk each`;
    $('paper-dd').textContent = `−${maxDD.toFixed(1)}%`;
    $('paper-best').textContent = best != null ? `+£${fmtUsd(Math.max(best, 0))}` : '—';
    $('paper-worst').textContent = worst != null ? `worst −£${fmtUsd(Math.abs(Math.min(worst, 0)))}` : '—';
  }

  function segmentStats(recs) {
    const closed = recs.filter((r) => r.outcome !== 'open');
    if (!closed.length) return { n: 0 };
    const fav = closed.filter((r) => r.movePct > 0);
    const grossWin = closed.reduce((a, r) => a + Math.max(r.movePct, 0), 0);
    const grossLoss = closed.reduce((a, r) => a + Math.max(-r.movePct, 0), 0);
    return {
      n: closed.length,
      favPct: (fav.length / closed.length) * 100,
      avg: closed.reduce((a, r) => a + r.movePct, 0) / closed.length,
      pf: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : null),
    };
  }

  const fmtPf = (pf) => pf == null ? 'n/a' : pf === Infinity ? '∞' : pf.toFixed(2);

  function renderPerformance(data) {
    const sub = $('perf-sub');
    const content = $('perf-content');
    if (!data || !Array.isArray(data.records) || !data.records.length) {
      sub.textContent = 'No ledger data yet. The alert bot records every signal as it fires (starting with a one-time backfill on its first run) — results will appear here after its next 4-hour check.';
      content.hidden = true;
      return;
    }
    const recs = data.records;
    const all = segmentStats(recs);
    sub.textContent =
      `Recorded by the alert bot as signals fire and stored in an append-only ledger — unlike the recomputed track record above, these rows cannot be retro-fitted. ` +
      `${data.counts?.live ?? 0} recorded live, ${data.counts?.backfill ?? 0} backfilled from history on first run. Updated ${fmtTime(data.updated || Date.now())} UTC.`;
    content.hidden = false;

    $('perf-total').textContent = String(recs.length);
    $('perf-total-note').textContent = `${data.counts?.live ?? 0} live · ${data.counts?.backfill ?? 0} backfill`;
    $('perf-winrate').textContent = all.n ? `${all.favPct.toFixed(0)}%` : 'n/a';
    const avgEl = $('perf-avg');
    avgEl.textContent = all.n ? fmtPct(all.avg) : 'n/a';
    avgEl.classList.remove('pos', 'neg');
    if (all.n) avgEl.classList.add(all.avg >= 0 ? 'pos' : 'neg');
    $('perf-pf').textContent = all.n ? fmtPf(all.pf) : 'n/a';

    const row = (label, s) => s.n
      ? `<tr><td>${label}</td><td class="num">${s.n}</td><td class="num">${s.favPct.toFixed(0)}%</td><td class="num ${s.avg >= 0 ? 'move-pos' : 'move-neg'}">${fmtPct(s.avg)}</td></tr>`
      : `<tr><td>${label}</td><td class="num">0</td><td class="num">—</td><td class="num">—</td></tr>`;

    $('perf-assets').innerHTML = Object.keys(ASSETS)
      .map((a) => ({ a, s: segmentStats(recs.filter((r) => r.asset === a)) }))
      .filter((x) => x.s.n)
      .map((x) => `<tr><td>${ASSETS[x.a].pair}</td><td class="num">${x.s.n}</td><td class="num">${x.s.favPct.toFixed(0)}%</td><td class="num ${x.s.avg >= 0 ? 'move-pos' : 'move-neg'}">${fmtPct(x.s.avg)}</td><td class="num">${fmtPf(x.s.pf)}</td></tr>`)
      .join('') || '<tr><td colspan="5" class="table-empty">No closed signals yet.</td></tr>';

    const segments = [
      ['Cross entries', (r) => !r.strategy || r.strategy === 'cross'],
      ['◆ Breakout entries', (r) => r.strategy === 'breakout'],
      ['🌊 Swing entries (daily-55)', (r) => r.strategy === 'swing' && !r.early],
      ['🌊 Early swing (daily-20)', (r) => r.strategy === 'swing' && r.early === true],
      ['⚡ Scalp entries (1h)', (r) => r.strategy === 'scalp'],
      ['▲ Longs', (r) => r.side === 'long'],
      ['▼ Shorts', (r) => r.side === 'short'],
      ['Confidence below 70', (r) => r.confidence < 70],
      ['Confidence 70–84', (r) => r.confidence >= 70 && r.confidence < 85],
      ['Confidence 85+', (r) => r.confidence >= 85],
      ['ADX 20–25 (weak trend)', (r) => r.adx != null && r.adx >= 20 && r.adx < 25],
      ['ADX 25+ (strong trend)', (r) => r.adx != null && r.adx >= 25],
      ['Volume confirmed', (r) => r.volConfirm === true],
      ['Volume not confirmed', (r) => r.volConfirm === false],
    ];
    $('perf-buckets').innerHTML = segments
      .map(([label, fn]) => row(label, segmentStats(recs.filter(fn))))
      .join('');

    lastRecs = recs;
    renderPaperAccount(recs);
  }
  let lastRecs = null;

  /* ---------------- boot ---------------- */

  async function refresh() {
    renderAssetTabs();
    $('chart-title').textContent = `${ASSETS[currentAsset].pair} · 4h candles`;
    const asset = currentAsset;
    const { source, candles } = await fetchCandles(asset);
    if (asset !== currentAsset) return; // user switched assets mid-fetch
    $('data-source').textContent = `${source} · updated ${fmtClock(Date.now())} UTC`;
    if (candles.length < E.CFG.EMA_SLOW + 5) return;

    // Signals are computed on CLOSED candles only, so they never repaint
    // while a candle is still forming. closedPrefix is a prefix of the full
    // array, so signal indices stay valid against the full chart.
    const closedCandles = E.closedPrefix(candles, Date.now());
    const ind = E.computeIndicators(candles);
    const closedInd = E.computeIndicators(closedCandles);
    const signals = E.computeSignals(closedCandles, closedInd, true);
    const baseline = E.computeSignals(closedCandles, closedInd, false);
    const breakout = E.computeBreakoutStream(closedCandles, closedInd);
    const swing = E.computeSwingStream(closedCandles);
    lastCandleT = candles[candles.length - 1].t;

    renderHero(candles);
    renderTiles(closedCandles, closedInd, signals, baseline, breakout);
    renderIndicators(candles, ind);
    renderCountdown();
    renderCurrentSignal(closedCandles, closedInd, signals, breakout, swing);
    renderTrackRecord(signals, baseline, closedCandles, closedInd, [...breakout, ...swing]);
    setupChart(candles, ind, signals, breakout);
    setupEquity([...signals, ...breakout, ...swing].sort((a, b) => a.t - b.t));
  }

  // One-time key handoff via URL fragment (#fmpkey=...&tdkey=...): stores the
  // key locally and strips it from the address bar. Fragments are never sent
  // to the server, so this is a convenient way to hand a key to your browser.
  if (location.hash) {
    const p = new URLSearchParams(location.hash.slice(1));
    let touched = false;
    if (p.get('fmpkey')) { localStorage.setItem(FMP_KEY_STORE, p.get('fmpkey')); touched = true; }
    if (p.get('tdkey')) { localStorage.setItem(TD_KEY_STORE, p.get('tdkey')); touched = true; }
    if (touched) history.replaceState(null, '', location.pathname + location.search);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* PWA optional */ });
  }

  // Account inputs: persist, then re-price the plan and paper account live.
  $('acct-size').value = String(acctGbp());
  $('acct-risk').value = String(riskPct());
  const onAcctChange = () => {
    const a = parseFloat($('acct-size').value);
    const r = parseFloat($('acct-risk').value);
    if (a > 0) localStorage.setItem(ACCT_STORE, String(a));
    if (r > 0 && r <= 5) localStorage.setItem(RISK_STORE, String(r));
    renderTradePlan();
    if (lastRecs) renderPaperAccount(lastRecs);
  };
  $('acct-size').addEventListener('input', onAcctChange);
  $('acct-risk').addEventListener('input', onAcctChange);

  // Manual refresh: re-pull prices, signals, radar, and the ledger on demand.
  $('refresh-btn').addEventListener('click', async () => {
    const btn = $('refresh-btn');
    btn.classList.add('spinning');
    try { await Promise.allSettled([refresh(), loadPerformance(), renderRadar()]); }
    finally { btn.classList.remove('spinning'); }
  });

  refresh();
  loadMlModel().then(() => { if (mlModel) refresh(); }); // re-render with AI score once the model arrives
  loadEdgeStatus().then(renderTradePlan);
  loadGbpUsd().then(renderTradePlan);
  loadPerformance();
  renderRadar();
  setInterval(refresh, 5 * 60 * 1000); // re-pull every 5 minutes
  setInterval(loadPerformance, 30 * 60 * 1000); // ledger updates every 4h
  setInterval(renderRadar, 30 * 60 * 1000); // radar sweeps all markets — keep it slow
  setInterval(renderCountdown, 30 * 1000);
})();
