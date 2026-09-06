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
    up: '#22c55e', down: '#ef4444',
    ema20: '#4a90e8', ema50: '#c98500',
    line: '#35c9f5', lineWash: 'rgba(53, 201, 245, 0.10)',
    grid: '#1a2436', baseline: '#26344e',
    muted: '#64748f', ink: '#e9eff8', surface: '#0d1420',
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
    // reserve room to the right for the 24h volatility cone (6 × 4h slots)
    const FUT = 6;
    const lastIdx = candles.length - 1;
    const coneAtr = ind.atr[lastIdx];
    if (coneAtr != null) {
      hi = Math.max(hi, candles[lastIdx].c + coneAtr * Math.sqrt(FUT));
      lo = Math.min(lo, candles[lastIdx].c - coneAtr * Math.sqrt(FUT));
    }
    const span = (hi - lo) || 1;
    lo -= span * 0.05; hi += span * 0.05;

    const slots = view.length + FUT;
    const x = (i) => padL + ((i - start) + 0.5) * (plotW / slots);
    const y = (p) => padT + (1 - (p - lo) / (hi - lo)) * plotH;
    chart.view = { start, x, y, padL, padR, padT, padB, plotW, plotH, lo, hi, W, H, slots };

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

    // Forward volatility cone: the honest forecast. It says where price is
    // LIKELY to be over the next 24h (±1×ATR·√t band), never which way it
    // goes — the size of the move is forecastable, the direction is not.
    if (coneAtr != null) {
      const c0 = candles[lastIdx].c;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x(lastIdx), y(c0));
      for (let k = 1; k <= FUT; k++) ctx.lineTo(x(lastIdx + k), y(c0 + coneAtr * Math.sqrt(k)));
      for (let k = FUT; k >= 1; k--) ctx.lineTo(x(lastIdx + k), y(c0 - coneAtr * Math.sqrt(k)));
      ctx.closePath();
      ctx.fillStyle = 'rgba(53, 201, 245, 0.07)';
      ctx.fill();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(53, 201, 245, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.muted;
      ctx.font = '9.5px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('±1σ 24H', x(lastIdx + FUT), y(c0 + coneAtr * Math.sqrt(FUT)) - 3);
      ctx.restore();
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
    const slot = plotW / slots;
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
    let idx = v.start + Math.floor((mx - v.padL) / (v.plotW / (v.slots || chart.candles.length - v.start)));
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

  // Asset switching lives in the cartogram tiles, the watchlist rows and the
  // ←/→ keys — this only manages the API-key row's visibility now.
  function renderAssetTabs() {
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
    // Regime lives in the chart header now — a quiet annotation, not a tile.
    {
      const el = $('chart-regime');
      if (el) {
        const i = candles.length - 1;
        const bull = ind.emaFast[i] != null && ind.emaSlow[i] != null && ind.emaFast[i] > ind.emaSlow[i];
        const trending = ind.adx[i] != null && ind.adx[i] >= E.CFG.ADX_MIN;
        const adx = ind.adx[i] != null ? ind.adx[i].toFixed(0) : '—';
        el.innerHTML = trending
          ? `REGIME <span class="${bull ? 'pos' : 'neg'}">${bull ? '▲ UPTREND' : '▼ DOWNTREND'}</span> · ADX ${adx}`
          : `REGIME CHOP · ADX ${adx} &lt; ${E.CFG.ADX_MIN} — gated`;
      }
    }
    if (!$('tiles')) return; // the dashboard stat tiles were retired
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

  /* ---------------- forecast strip: what is honestly forecastable ---------------- */

  // Historical base rate: of the times this market closed within `maxDistPct`
  // of its 55-candle Donchian trigger, how often did the breakout actually
  // fire (close through the band) within the next 6 candles? Measured on the
  // loaded history — a counting exercise, not a directional call.
  function fireStats(candles, maxDistPct) {
    const LB = 55;
    let cases = 0, fired = 0;
    for (let i = LB; i < candles.length - 6; i++) {
      let bandHi = -Infinity, bandLo = Infinity;
      for (let j = i - LB; j < i; j++) {
        if (candles[j].c > bandHi) bandHi = candles[j].c;
        if (candles[j].c < bandLo) bandLo = candles[j].c;
      }
      const c = candles[i].c;
      const dUp = ((bandHi - c) / c) * 100;
      const dDn = ((c - bandLo) / c) * 100;
      const up = dUp <= dDn;
      const d = Math.min(dUp, dDn);
      if (d < 0 || d > maxDistPct) continue;
      cases++;
      for (let k = 1; k <= 6; k++) {
        if (up ? candles[i + k].c > bandHi : candles[i + k].c < bandLo) { fired++; break; }
      }
    }
    return { cases, fired };
  }

  let fcData = null; // {candles, ind} for the current asset, closed candles only

  function renderForecast() {
    const row = $('forecast-row');
    if (!row || !fcData) return;
    const { candles, ind } = fcData;
    const i = candles.length - 1;
    const c = candles[i].c;
    const atr = ind.atr[i];
    const items = [];
    if (atr != null) {
      const r = atr * Math.sqrt(6);
      items.push(`<span title="ATR-based volatility forecast: price is likely to stay within this band over the next 24h (±1σ). The SIZE of the move is forecastable — the direction is not.">24h range <strong>±$${fmtPrice(r)} · ±${((r / c) * 100).toFixed(1)}%</strong></span>`);
    }
    const radar = candles.length > 60 ? E.breakoutRadar(candles) : null;
    if (radar) {
      const up = radar.upPct <= radar.downPct;
      const d = Math.min(radar.upPct, radar.downPct);
      items.push(`<span title="Distance from the last closed candle to the nearest 55-candle Donchian trigger — the level where the next breakout signal fires.">Next trigger <strong class="${up ? 'move-pos' : 'move-neg'}">${up ? '▲' : '▼'} $${fmtPrice(up ? radar.up : radar.down)}</strong> <strong>${d.toFixed(1)}% away</strong></span>`);
      const band = Math.min(5, Math.max(1, Math.ceil(d)));
      const fs = fireStats(candles, band);
      if (fs.cases >= 20) {
        items.push(`<span title="Measured on this market's loaded history: of the ${fs.cases} times price closed within ${band}% of a trigger, the breakout fired within 24h in ${((fs.fired / fs.cases) * 100).toFixed(0)}% of them. A base rate, not a prediction of direction.">Fire odds from ≤${band}% <strong>${((fs.fired / fs.cases) * 100).toFixed(0)}%</strong> <span class="radar-dist">n=${fs.cases}</span></span>`);
      }
    }
    if (lastRecs) {
      const avgR = (keep) => {
        const Rs = [];
        for (const r of lastRecs) {
          if (r.outcome === 'open' || !r.entry || !r.stop || !keep(r)) continue;
          const stopPct = (Math.abs(r.entry - r.stop) / r.entry) * 100;
          if (stopPct) Rs.push((r.movePct - (PAPER_COSTS[r.asset] ?? 0.05)) / stopPct);
        }
        return Rs.length >= 15 ? { avg: Rs.reduce((a, b) => a + b, 0) / Rs.length, n: Rs.length } : null;
      };
      const bk = avgR((r) => r.strategy === 'breakout');
      const sw = avgR((r) => r.strategy === 'swing' && !r.early);
      const fmt = (s) => `${s.avg >= 0 ? '+' : ''}${s.avg.toFixed(2)}R`;
      if (bk || sw) {
        items.push(`<span title="Average recorded outcome per trade in risk units, from the append-only ledger${bk ? ` — breakout over ${bk.n} closed trades` : ''}${sw ? `, swing over ${sw.n}` : ''}. What a trade has been worth on average, not what the next one will do.">Ledger expectancy <strong>${bk ? `◆ ${fmt(bk)}` : ''}${bk && sw ? ' · ' : ''}${sw ? `🌊 ${fmt(sw)}` : ''}</strong></span>`);
      }
    }
    if (currentAsset === 'OIL') {
      const h = (E.nextEiaTime() - Date.now()) / 3600000;
      if (h <= 48) items.push(`<span title="The one scheduled, predictable volatility event on this market: the EIA weekly petroleum print.">EIA print <strong>~${h.toFixed(0)}h</strong></span>`);
    }
    row.hidden = !items.length;
    row.innerHTML = `<span class="fcast-tag" title="Only what is honestly forecastable appears here: expected range, trigger distance, measured base rates and event timing — never direction.">FORECAST</span>` + items.join('');
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
        ? `Price closed ${s.side === 'long' ? `above its ${s.early ? '20' : '55'}-day high` : `below its ${s.early ? '20' : '55'}-day low`} on the daily chart — ${s.early ? 'the validated early-swing variant (thinner edge than the main daily-55 stream)' : 'the strongest validated stream'}. Exit is a ${s.early ? '2' : '3'}×ATR trailing stop evaluated on daily closes (max ${s.early ? '18' : '24'} days). The entry window is one daily candle.`
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
    const verdict = !E.fundedSide(s)
      ? '<p class="plan-verdict no">❌ Paper only — SHORT signals failed side-split validation on this stream (longs carry the edge). Watch it, don\'t fund it.</p>'
      : swing
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
      ? `<strong>Close:</strong> when price hits the trailing stop — it starts at $${fmtPrice(s.stop)} and after every ${swing ? 'daily' : '4-hour'} close moves to ${swing && !s.early ? 3 : 2}×ATR ${s.side === 'long' ? 'below the highest' : 'above the lowest'} close since entry, never loosening. Hard exit at market after ${swing ? (s.early ? '18 days' : '24 days') : '3 days'}.`
      : `<strong>Close:</strong> at target $${fmtPrice(s.target)} or stop $${fmtPrice(s.stop)}; move the stop to entry once 1×ATR in profit; exit at market after 24h.`;
    body.innerHTML = `
      ${verdict}
      <div class="plan-grid">
        <div><span class="lvl-label">Risk</span><span class="lvl-value">£${fmtUsd(plan.riskGbp)} = ${plan.riskPctEff}% of £${fmtUsd(acctGbp())}${plan.riskPctEff !== riskPct() ? ` (edge-weighted from your ${riskPct()}% base)` : ''} ≈ $${fmtUsd(plan.riskUsd)}</span></div>
        <div><span class="lvl-label">Size</span><span class="lvl-value">${sizeLine}</span></div>
        <div><span class="lvl-label">Stop distance</span><span class="lvl-value">${plan.stopPct.toFixed(2)}% from entry — sized so a stop-out costs £${fmtUsd(plan.riskGbp)}</span></div>
      </div>
      <p class="plan-note">${closeRule}${plan.rateApprox ? ' · £→$ conversion is approximate (add a data key to load live cable)' : ''}${(() => { if (currentAsset !== 'OIL') return ''; const h = (E.nextEiaTime() - Date.now()) / 3600000; return h <= 8 ? ` · ⚠ EIA petroleum report in ~${h.toFixed(0)}h — expect a volatility spike around the print` : ''; })()}</p>`;
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
        const ref = closed[Math.max(0, closed.length - 7)]; // ~24h back on 4h candles
        const price = closed[closed.length - 1].c;
        // quant extras for the watchlist and correlation matrix
        const closes = daily.map((d) => d.c);
        const sma20 = closes.length >= 20 ? closes.slice(-20).reduce((x, y) => x + y, 0) / 20 : null;
        const dInd = daily.length > 30 ? E.computeIndicators(daily) : null;
        const dAtr = dInd ? dInd.atr[dInd.atr.length - 1] : null;
        const rets = new Map(); // day timestamp -> daily return, for correlation
        for (let i = 1; i < daily.length; i++) rets.set(daily[i].t, daily[i].c / daily[i - 1].c - 1);
        // live funded-stream signals on THIS market, whatever asset the
        // chart is showing — feeds the masthead live bar
        const ind4 = E.computeIndicators(closed);
        const lastT = closed[closed.length - 1].t;
        const active = [...E.computeBreakoutStream(closed, ind4), ...E.computeSwingStream(closed)]
          .filter((s) => lastT - s.t <= (s.candleMs || CANDLE_MS))
          .map((s) => ({ side: s.side, strategy: s.strategy, early: s.early, entry: s.entry }));
        return {
          a, demo: /demo/i.test(source), price, r4, rd,
          d24: ((price - ref.c) / ref.c) * 100,
          trendUp: sma20 != null ? price > sma20 : null,
          rngPct: dAtr ? (dAtr / price) * 100 : null,
          spark: closes.slice(-30),
          rets, active,
        };
      } catch (e) { return null; }
    }));
    renderTicker(rows.filter(Boolean));
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
    renderWatchlist(list);
    renderCorr(list);
    lastSweepRows = list;
    renderLiveBar(list);
    renderBlotter();
    renderCarto(list);
    renderCrew();
    renderDeskLog();
    renderActionQueue();
    renderSessions();
  }
  let lastSweepRows = null;

  // Live bar: signals firing on ANY market right now — the signal card only
  // covers the selected one, and a Gold signal shouldn't hide behind a BTC
  // chart. Hidden entirely when everything is flat.
  function renderLiveBar(list) {
    const bar = $('live-bar');
    if (!bar) return;
    const items = list.flatMap((r) => (r.active || []).map((s) =>
      `<button class="live-item" data-asset="${r.a}" type="button">● ${ASSETS[r.a].tab} ${s.side === 'long' ? '▲ LONG' : '▼ SHORT'} ${s.strategy === 'swing' ? (s.early ? 'EARLY SWING' : 'SWING') : 'BREAKOUT'} @ $${fmtPrice(s.entry)}${r.demo ? ' *' : ''}</button>`));
    bar.hidden = !items.length;
    if (items.length) {
      bar.innerHTML = `<span class="live-tag">LIVE</span>${items.join('')}`;
      bar.querySelectorAll('.live-item').forEach((b) => b.addEventListener('click', () => {
        currentAsset = b.dataset.asset;
        localStorage.setItem('budsignal-asset', currentAsset);
        refresh();
        document.getElementById('signal').scrollIntoView({ behavior: 'smooth' });
      }));
    }
  }

  // Positions blotter: the ledger's open trades marked to the latest sweep
  // price. R is measured against the initial stop; £ applies the account's
  // edge-weighted plan size for that stream. Ledger orphans (rows still
  // "open" long past their stream's hard time-exit — feed-timestamp drift)
  // are counted, not displayed: marking a dead row to today's price prints
  // ±1000R nonsense.
  function renderBlotter() {
    const body = $('pos-body');
    if (!body) return;
    if (!lastRecs) return;
    const px = new Map((lastSweepRows || []).map((r) => [r.a, r]));
    const maxHoldH = (r) => (r.strategy === 'scalp' ? 18 : r.strategy === 'swing' ? (r.early ? 18 : 24) * 24 : 3 * 24);
    const all = lastRecs.filter((r) => r.outcome === 'open' && r.entry && r.stop && ASSETS[r.asset]);
    const open = all.filter((r) => (Date.now() - r.t) / 3600000 <= maxHoldH(r) * 1.5)
      .sort((a, b) => b.t - a.t);
    const orphans = all.length - open.length;
    const orphanNote = orphans
      ? `<tr><td colspan="9" class="table-empty">${orphans} stale ledger orphan${orphans > 1 ? 's' : ''} hidden (past their stream's hard exit — record-keeping artifacts, not live positions).</td></tr>`
      : '';
    if (!open.length) {
      body.innerHTML = '<tr><td colspan="9" class="table-empty">Flat — no open positions in the ledger.</td></tr>' + orphanNote;
      return;
    }
    body.innerHTML = open.map((r) => {
      const dir = r.side === 'long' ? 1 : -1;
      const sweep = px.get(r.asset);
      // a demo price is not a mark — without live data the P&L columns stay blank
      const now = sweep && !sweep.demo ? sweep.price : null;
      const stopPct = Math.abs(r.entry - r.stop) / r.entry * 100;
      const movePct = now != null ? (dir * (now - r.entry) / r.entry) * 100 : null;
      const R = stopPct && movePct != null ? movePct / stopPct : null;
      const funded = E.fundedSide(r) && (r.strategy === 'swing' || r.strategy === 'scalp' ||
        (r.strategy === 'breakout' && edgeStatus?.assets?.[r.asset]?.edge === true));
      const gbp = R != null && funded ? acctGbp() * 0.01 * E.riskMultiplier(r) * R : null;
      const ageH = (Date.now() - r.t) / 3600000;
      const stream = r.strategy === 'breakout' ? '◆ Breakout' : r.strategy === 'swing' ? (r.early ? '🌊 Early swing' : '🌊 Swing') : r.strategy === 'scalp' ? '⚡ Scalp' : 'Cross';
      const cls = (v) => (v >= 0 ? 'move-pos' : 'move-neg');
      return `<tr>
        <td>${ASSETS[r.asset].tab}</td>
        <td>${stream}${funded ? '' : ' <span class="radar-dist">paper</span>'}</td>
        <td><span class="side-badge ${r.side}">${r.side === 'long' ? '▲ LONG' : '▼ SHORT'}</span></td>
        <td class="num">$${fmtPrice(r.entry)}</td>
        <td class="num">${now != null ? '$' + fmtPrice(now) : '<span class="radar-dist">no live feed</span>'}</td>
        <td class="num ${movePct != null ? cls(movePct) : ''}">${movePct != null ? fmtPct(movePct) : '—'}</td>
        <td class="num ${R != null ? cls(R) : ''}">${R != null ? (R >= 0 ? '+' : '') + R.toFixed(2) + 'R' : '—'}</td>
        <td class="num ${gbp != null ? cls(gbp) : ''}">${gbp != null ? (gbp >= 0 ? '+£' : '−£') + fmtUsd(Math.abs(gbp)) : '—'}</td>
        <td class="num">${ageH < 48 ? ageH.toFixed(0) + 'h' : (ageH / 24).toFixed(1) + 'd'}</td>
      </tr>`;
    }).join('') + orphanNote;
  }

  // Watchlist: trend vs 20-day mean, last, 24h change, expected daily range
  // (an honest volatility forecast — direction is NOT predictable, size of
  // move is), and distance to the nearest 4h breakout trigger. Tapping a row
  // switches the chart, terminal-style.
  function renderWatchlist(list) {
    const body = $('watchlist-body');
    if (!body) return;
    body.innerHTML = list.map((r) => `<tr data-asset="${r.a}" class="${r.a === currentAsset ? 'wl-active' : ''}">
      <td><span class="${r.trendUp == null ? 'radar-dist' : r.trendUp ? 'move-pos' : 'move-neg'}">${r.trendUp == null ? '·' : r.trendUp ? '▲' : '▼'}</span> ${ASSETS[r.a].tab}${r.demo ? '<span class="radar-dist">*</span>' : ''}</td>
      <td class="num">${fmtPrice(r.price)}</td>
      <td class="num ${r.d24 >= 0 ? 'move-pos' : 'move-neg'}">${fmtPct(r.d24)}</td>
      <td class="num">${r.rngPct != null ? `±${r.rngPct.toFixed(1)}%` : '—'}</td>
      <td class="num">${r.n4 ? `<span class="${r.n4.pct < 1 ? 'radar-hot' : ''}">${r.n4.pct.toFixed(1)}%</span>` : '—'}</td>
    </tr>`).join('');
    body.querySelectorAll('tr[data-asset]').forEach((tr) => tr.addEventListener('click', () => {
      currentAsset = tr.dataset.asset;
      localStorage.setItem('budsignal-asset', currentAsset);
      body.querySelectorAll('tr').forEach((x) => x.classList.toggle('wl-active', x === tr));
      refresh();
    }));
  }

  // Pearson correlation of daily returns over the last 60 shared trading
  // days — crypto trades weekends and FX doesn't, so pairs align on common
  // days only ('·' where fewer than 30 overlap).
  function renderCorr(list) {
    const body = $('corr-body');
    if (!body) return;
    const ms = list.filter((r) => r.rets && r.rets.size >= 30);
    if (ms.length < 2) { body.innerHTML = '<tr><td class="table-empty">Not enough daily history yet.</td></tr>'; return; }
    const corr = (A, B) => {
      const days = [...A.keys()].filter((t) => B.has(t)).slice(-60);
      if (days.length < 30) return null;
      const a = days.map((t) => A.get(t)), b = days.map((t) => B.get(t));
      const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length;
      let num = 0, da = 0, db = 0;
      for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
      return da && db ? num / Math.sqrt(da * db) : null;
    };
    const head = `<tr><th></th>${ms.map((r) => `<th class="num">${ASSETS[r.a].tab}</th>`).join('')}</tr>`;
    const rows = ms.map((r, i) => `<tr><th>${ASSETS[r.a].tab}</th>${ms.map((c, j) => {
      if (i === j) return '<td class="num corr-self">1.00</td>';
      const v = corr(r.rets, c.rets);
      if (v == null) return '<td class="num radar-dist">·</td>';
      const cls = v >= 0.6 ? 'corr-hi' : v <= -0.6 ? 'corr-lo' : '';
      return `<td class="num ${cls}">${v.toFixed(2)}</td>`;
    }).join('')}</tr>`).join('');
    body.innerHTML = head + rows;
  }

  /* ---------------- desk furniture: cartogram, crew, log ---------------- */

  // Market cartogram: one tile per market — 24h change tint, 30-day
  // sparkline, tap to switch the chart. Same sweep data as the watchlist.
  function renderCarto(list) {
    const box = $('carto');
    if (!box) return;
    const rows = [...list].sort((x, y) => (ASSETS[x.a].tab > ASSETS[y.a].tab ? 1 : -1));
    box.innerHTML = rows.map((r) => `
      <button type="button" class="carto-tile ${r.d24 >= 0 ? 'pos' : 'neg'} ${r.a === currentAsset ? 'active' : ''}" data-asset="${r.a}">
        <span class="carto-head"><span class="carto-sym">${ASSETS[r.a].tab}</span><span class="carto-delta">${fmtPct(r.d24)}</span></span>
        <canvas class="carto-spark" width="176" height="44"></canvas>
      </button>`).join('');
    box.querySelectorAll('.carto-tile').forEach((tile, i) => {
      const r = rows[i];
      const cv = tile.querySelector('canvas');
      const ctx = cv.getContext('2d');
      const s = r.spark || [];
      if (s.length > 2) {
        const lo = Math.min(...s), hi = Math.max(...s);
        ctx.strokeStyle = r.d24 >= 0 ? COLORS.up : COLORS.down;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        s.forEach((v, j) => {
          const x = 4 + (j / (s.length - 1)) * 168;
          const y = 6 + (1 - (v - lo) / Math.max(1e-9, hi - lo)) * 32;
          j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.stroke();
      }
      tile.addEventListener('click', () => {
        currentAsset = r.a;
        localStorage.setItem('budsignal-asset', currentAsset);
        refresh();
        renderCarto(list);
      });
    });
  }

  // Desk crew: the pipeline's real roles with live status — the honest
  // version of the agent-swarm strip. Every value is measured, none narrated.
  function renderCrew() {
    const box = $('crew');
    if (!box) return;
    const sweep = lastSweepRows || [];
    const liveN = sweep.reduce((n, r) => n + (r.active?.length || 0), 0);
    const openN = lastRecs ? lastRecs.filter((r) => r.outcome === 'open' && ASSETS[r.asset]).length : null;
    const closedN = lastRecs ? lastRecs.filter((r) => r.outcome !== 'open').length : null;
    const edges = edgeStatus?.assets ? Object.values(edgeStatus.assets).filter((x) => x.edge === true).length : null;
    const roles = [
      ['SCAN', 'sweeps 8 markets · 4h + daily', sweep.length ? `${sweep.length} live` : 'starting…'],
      ['SIGNAL', 'validated streams only', liveN ? `${liveN} firing` : 'flat'],
      ['SIZE', 'edge-weighted, longs funded', `1% · £${fmtUsd(acctGbp())}`],
      ['LEDGER', 'append-only record', closedN != null ? `${closedN}c / ${openN}o` : 'loading'],
      ['AUDIT', 'monthly walk-forward revalidation', edges != null ? `${edges} edges ✅` : 'current'],
    ];
    box.innerHTML = roles.map(([tag, sub, val]) =>
      `<span class="dl-item" title="${sub}"><span class="dl-tag">${tag}</span>${val}</span>`).join('');
  }

  // Desk log: the ledger rendered as an event stream — most recent first.
  function renderDeskLog() {
    const box = $('desk-log');
    if (!box || !lastRecs) return;
    const tag = (r) => (r.strategy === 'swing' ? (r.early ? 'SWNG20' : 'SWING') : r.strategy === 'breakout' ? 'BRKOUT' : r.strategy === 'scalp' ? 'SCALP' : 'CROSS');
    const rows = [...lastRecs].filter((r) => ASSETS[r.asset]).sort((a, b) => b.t - a.t).slice(0, 14);
    const sweepAt = lastSweepRows ? `<li><span class="log-tag t-scan">SCAN</span> sweep complete · ${lastSweepRows.length} markets · ${fmtClock(Date.now())} UTC</li>` : '';
    box.innerHTML = sweepAt + rows.map((r) => {
      const open = r.outcome === 'open';
      const pnlCls = r.movePct >= 0 ? 'move-pos' : 'move-neg';
      const status = open ? '<span class="radar-dist">open</span>' : `<span class="${pnlCls}">${fmtPct(r.movePct)}</span>`;
      return `<li><span class="log-tag ${open ? 't-sig' : 't-close'}">${open ? 'SIG' : 'CLOSE'}</span>` +
        `<span class="log-tag t-strm">${tag(r)}</span> ${ASSETS[r.asset].tab} ` +
        `<span class="${r.side === 'long' ? 'move-pos' : 'move-neg'}">${r.side === 'long' ? '▲' : '▼'}</span> ` +
        `@ $${fmtPrice(r.entry)} · ${status}<span class="radar-dist"> · ${fmtTime(r.t)}</span></li>`;
    }).join('');
  }

  // Session clocks: which markets are awake right now (approximate UTC
  // hours, ignoring DST shifts by design — this is orientation, not an
  // execution calendar). The scalp-window chip mirrors the 1h stream's
  // actual session gate from the engine config.
  function renderSessions() {
    const box = $('sess');
    if (!box) return;
    const d = new Date();
    const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
    const hh = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const rows = [
      ['TOK', 'Tokyo', 0, 8 * 60],
      ['LDN', 'London', 7 * 60, 16 * 60],
      ['NY', 'New York', 12.5 * 60, 21 * 60],
      ['SCALP', 'Scalp window — the 1h stream\'s validated session gate (Gold + NAS100)', E.SCALP.HOUR_FROM * 60, E.SCALP.HOUR_TO * 60],
    ];
    box.innerHTML = rows.map(([short, name, a, b]) => {
      const on = mins >= a && mins < b;
      return `<span class="dl-sess ${on ? 'on' : ''}" title="${name} · ${hh(a)}–${hh(b)} UTC"><span class="sess-dot"></span>${short}</span>`;
    }).join('');
  }

  // Action queue: the whole platform reduced to "what do I do right now".
  // Funded signals firing on ANY market, funded positions approaching their
  // hard time-exit, and scheduled-volatility warnings — or an explicit
  // stand-down. Everything here is derived from the same sweep, ledger and
  // edge verdicts the rest of the page uses.
  function renderActionQueue() {
    const list = $('aq-list');
    if (!list) return;
    const stamp = $('aq-stamp');
    if (stamp) stamp.textContent = `as of ${fmtClock(Date.now())} UTC`;
    const sweep = lastSweepRows || [];
    const items = [];
    const streamName = (s) => (s.strategy === 'swing' ? (s.early ? 'early swing' : 'swing') : s.strategy === 'scalp' ? 'scalp' : s.strategy === 'breakout' ? 'breakout' : 'cross');
    const isFunded = (s, asset) => E.fundedSide(s) && (s.strategy === 'swing' || s.strategy === 'scalp' ||
      (s.strategy === 'breakout' && edgeStatus?.assets?.[asset]?.edge === true));
    for (const r of sweep) {
      for (const s of (r.active || [])) {
        const sideHtml = `<span class="${s.side === 'long' ? 'move-pos' : 'move-neg'}">${s.side === 'long' ? '▲ LONG' : '▼ SHORT'}</span>`;
        if (isFunded(s, r.a)) {
          const risk = acctGbp() * (riskPct() / 100) * E.riskMultiplier(s);
          items.push({ tag: 'OPEN', cls: 'aq-open', asset: r.a, html: `${ASSETS[r.a].tab} ${sideHtml} ${streamName(s)} @ $${fmtPrice(s.entry)} — risk £${fmtUsd(risk)} (${(riskPct() * E.riskMultiplier(s)).toFixed(2)}% edge-weighted). Tap for size, stop and exit.` });
        } else {
          items.push({ tag: 'WATCH', cls: 'aq-watch', asset: r.a, html: `${ASSETS[r.a].tab} ${sideHtml} ${streamName(s)} @ $${fmtPrice(s.entry)} — paper only (${s.side === 'short' ? 'shorts failed side-split validation on this stream' : 'no validated edge on this market'}).` });
        }
      }
    }
    if (lastRecs) {
      const maxHoldH = (r) => (r.strategy === 'scalp' ? 18 : r.strategy === 'swing' ? (r.early ? 18 : 24) * 24 : 3 * 24);
      for (const r of lastRecs) {
        if (r.outcome !== 'open' || !ASSETS[r.asset] || !r.entry || !r.stop) continue;
        const hold = maxHoldH(r);
        const ageH = (Date.now() - r.t) / 3600000;
        if (ageH > hold * 1.5) continue; // ledger orphan, not a live position
        if (!isFunded(r, r.asset)) continue;
        const sideGlyph = `<span class="${r.side === 'long' ? 'move-pos' : 'move-neg'}">${r.side === 'long' ? '▲' : '▼'}</span>`;
        if (ageH >= hold) {
          items.push({ tag: 'CLOSE NOW', cls: 'aq-warn', asset: r.asset, html: `${ASSETS[r.asset].tab} ${sideGlyph} ${streamName(r)} from $${fmtPrice(r.entry)} is past its hard time-exit (${fmtTime(r.t + hold * 3600000)} UTC) — if you still hold it, close at market now.` });
        } else if (hold - ageH <= hold * 0.25) {
          items.push({ tag: 'CLOSE BY', cls: 'aq-close', asset: r.asset, html: `${ASSETS[r.asset].tab} ${sideGlyph} ${streamName(r)} from $${fmtPrice(r.entry)} reaches its hard time-exit ${fmtTime(r.t + hold * 3600000)} UTC — close at market then if the trailing stop hasn't already taken it out.` });
        }
      }
    }
    const eiaH = (E.nextEiaTime() - Date.now()) / 3600000;
    const oilLive = sweep.some((r) => r.a === 'OIL' && r.active?.length) ||
      (lastRecs || []).some((r) => r.asset === 'OIL' && r.outcome === 'open' && ASSETS[r.asset]);
    if (eiaH <= 8 && oilLive) {
      items.push({ tag: 'CAUTION', cls: 'aq-warn', html: `EIA petroleum report in ~${Math.max(1, eiaH).toFixed(0)}h — a scheduled WTI volatility spike. Don't open new oil risk into the print; existing stops stay where they are.` });
    }
    const openN = items.filter((i) => i.tag === 'OPEN').length;
    if (openN > 3) {
      items.push({ tag: 'CAP', cls: 'aq-warn', html: `${openN} signals qualify but the playbook caps total open risk at 3% — take the strongest validated edges first and skip the rest. Never shrink stops to fit more trades.` });
    }
    if (!items.length) {
      items.push({ tag: 'STAND DOWN', cls: 'aq-flat', html: 'No funded signal is live and no open position needs action. Flat is a position — doing nothing is the correct trade right now.' });
    }
    list.innerHTML = items.map((i) =>
      `<li class="${i.asset ? 'aq-link' : ''}"${i.asset ? ` data-asset="${i.asset}"` : ''}><span class="aq-tag ${i.cls}">${i.tag}</span><span class="aq-body">${i.html}</span></li>`).join('');
    list.querySelectorAll('li[data-asset]').forEach((li) => li.addEventListener('click', () => {
      currentAsset = li.dataset.asset;
      localStorage.setItem('budsignal-asset', currentAsset);
      refresh();
      document.getElementById('signal').scrollIntoView({ behavior: 'smooth' });
    }));
  }

  // Ticker tape: every market's price and 24h change from the radar sweep.
  // Content is rendered twice so the -50% translate loops seamlessly.
  function renderTicker(rows) {
    const track = $('tape-track');
    if (!track || !rows.length) return;
    const items = rows.map((r) =>
      `<span class="tape-item"><span class="tape-sym">${ASSETS[r.a].tab}</span>` +
      `<span class="tape-px">${fmtPrice(r.price)}</span>` +
      `<span class="tape-delta ${r.d24 >= 0 ? 'pos' : 'neg'}">${r.d24 >= 0 ? '▲' : '▼'}${fmtPct(r.d24)}</span>` +
      `${r.demo ? '<span class="tape-px" style="opacity:.5">demo</span>' : ''}</span>`).join('');
    track.innerHTML = items + items;
  }

  /* ---------------- crude desk (WTI events + headlines) ---------------- */

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Headlines are context, never a signal input: public news is in the price
  // within seconds. The genuinely predictable part is the TIMING of scheduled
  // volatility — the EIA weekly petroleum print — so that gets a countdown.
  async function renderOilNews() {
    const list = $('news-list');
    const eia = $('eia-line');
    if (!list || !eia) return;
    const next = E.nextEiaTime();
    const hrs = (next - Date.now()) / 3600000;
    eia.textContent = `Next EIA weekly petroleum report: ${fmtTime(next)} UTC` +
      ` (${hrs < 48 ? 'in ~' + hrs.toFixed(0) + 'h' : 'in ~' + Math.ceil(hrs / 24) + ' days'})` +
      ' — WTI usually spikes around the print. Manage entries and stops accordingly; the direction of the reaction is not predictable.';
    const key = localStorage.getItem(FMP_KEY_STORE);
    if (!key) { list.innerHTML = '<li class="radar-dist">Add your FMP data key above to load crude headlines.</li>'; return; }
    const urls = [
      `https://financialmodelingprep.com/stable/news/general-latest?page=0&limit=60&apikey=${encodeURIComponent(key)}`,
      `https://financialmodelingprep.com/api/v3/general_news?page=0&apikey=${encodeURIComponent(key)}`,
    ];
    let items = null;
    for (const u of urls) {
      try {
        const r = await fetch(u, { signal: AbortSignal.timeout(9000) });
        if (!r.ok) continue;
        const j = await r.json();
        if (Array.isArray(j) && j.length) { items = j; break; }
      } catch (e) { /* try next */ }
    }
    if (!items) { list.innerHTML = '<li class="radar-dist">Headlines unavailable on this data plan.</li>'; return; }
    const RE = /\b(oil|crude|opec|eia|barrel|wti|brent|petroleum)\b/i;
    const oil = items.filter((n) => RE.test(`${n.title || ''} ${n.text || ''}`)).slice(0, 8);
    list.innerHTML = oil.length
      ? oil.map((n) => {
          const when = String(n.publishedDate || n.date || '').slice(0, 16).replace('T', ' ');
          const href = /^https?:\/\//.test(n.url || '') ? esc(n.url) : null;
          const title = esc((n.title || '').slice(0, 130));
          return `<li>${href ? `<a href="${href}" target="_blank" rel="noopener">${title}</a>` : title}` +
            `<span class="radar-dist"> · ${esc(n.site || n.publisher || '')} ${esc(when)}</span></li>`;
        }).join('')
      : '<li class="radar-dist">No crude-related headlines in the latest batch.</li>';
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
    const trades = []; // per-trade series feeding the quant tearsheet
    for (const r of closed) {
      const stopPct = Math.abs(r.entry - r.stop) / r.entry * 100;
      if (!stopPct) continue;
      const netMove = r.movePct - (PAPER_COSTS[r.asset] ?? 0.05);
      const R = netMove / stopPct;           // outcome in risk units
      const fret = 0.01 * E.riskMultiplier(r) * R; // fractional account return, 1% base edge-weighted
      const pnl = equity * fret;
      equity += pnl;
      peak = Math.max(peak, equity);
      const dd = (peak - equity) / peak * 100;
      maxDD = Math.max(maxDD, dd);
      trades.push({ t: r.t, R, fret, equity, dd });
      if (best == null || pnl > best) best = pnl;
      if (worst == null || pnl < worst) worst = pnl;
    }
    const ret = (equity / start - 1) * 100;
    const tp = $('term-paper');
    if (tp) {
      tp.textContent = `£${fmtUsd(equity)} (${fmtPct(ret)})`;
      tp.className = ret >= 0 ? 'move-pos' : 'move-neg';
    }
    renderTearsheet(trades, start, equity, maxDD);
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

  /* ---------------- quant tearsheet ---------------- */

  // Institutional-style statistics over the paper-account trade series.
  // Everything derives from the same ledger the tiles use — no separate
  // data source, so the tearsheet can never disagree with the account.
  function renderTearsheet(trades, start, endEquity, maxDD) {
    const wrap = $('ts-tiles');
    if (!wrap || trades.length < 5) return;
    const n = trades.length;
    const spanDays = Math.max(1, (trades[n - 1].t - trades[0].t) / 86400000);
    const years = spanDays / 365;
    const perYear = n / years;

    const rets = trades.map((x) => x.fret);
    const mean = rets.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
    const sharpe = sd > 0 ? (mean / sd) * Math.sqrt(perYear) : null;

    const Rs = trades.map((x) => x.R);
    const expectR = Rs.reduce((a, b) => a + b, 0) / n;
    const wins = Rs.filter((r) => r > 0), losses = Rs.filter((r) => r <= 0);
    const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
    const avgLoss = losses.length ? -losses.reduce((a, b) => a + b, 0) / losses.length : 0;

    const cagr = (Math.pow(endEquity / start, 1 / Math.max(years, 0.25)) - 1) * 100;
    const mar = maxDD > 0 ? (cagr / maxDD) : null;

    // Monte Carlo: resample the observed per-trade returns (seeded, so the
    // page shows the same figure on every load) over the next 100 trades and
    // take the 95th-percentile max drawdown across 1,000 paths.
    let seed = 42;
    const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const dds = [];
    for (let p = 0; p < 1000; p++) {
      let eq = 1, pk = 1, dd = 0;
      for (let i = 0; i < 100; i++) {
        eq *= 1 + rets[Math.floor(rand() * n)];
        pk = Math.max(pk, eq);
        dd = Math.max(dd, (pk - eq) / pk);
      }
      dds.push(dd);
    }
    dds.sort((a, b) => a - b);
    const mc95 = dds[Math.floor(0.95 * dds.length)] * 100;

    $('ts-cagr').textContent = fmtPct(cagr);
    $('ts-cagr').className = `tile-value ${cagr >= 0 ? 'pos' : 'neg'}`;
    $('ts-sharpe').textContent = sharpe != null ? sharpe.toFixed(2) : 'n/a';
    $('ts-expect').textContent = `${expectR >= 0 ? '+' : ''}${expectR.toFixed(2)}R`;
    $('ts-payoff').textContent = `${((wins.length / n) * 100).toFixed(0)}% win · payoff ${avgLoss > 0 ? (avgWin / avgLoss).toFixed(1) : '∞'}:1`;
    $('ts-mar').textContent = mar != null ? mar.toFixed(2) : 'n/a';
    $('ts-mc').textContent = `−${mc95.toFixed(1)}%`;
    $('ts-rate').textContent = `${perYear.toFixed(0)}/yr`;
    $('ts-span').textContent = `${n} trades over ${(spanDays / 30.44).toFixed(1)} months`;

    drawTearsheetCurve(trades, start);
    drawHistogram(Rs);
    renderMonthly(trades, start);
  }

  // Shared canvas prep: size to CSS box × devicePixelRatio, clear, return ctx.
  function canvasCtx(id) {
    const canvas = $(id);
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const h = +canvas.getAttribute('height');
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, h);
    return { ctx, w: rect.width, h };
  }

  // Equity line (top panel) with the underwater drawdown area beneath it.
  function drawTearsheetCurve(trades, start) {
    const c = canvasCtx('ts-curve');
    if (!c) return;
    const { ctx, w, h } = c;
    const padL = 8, padR = 8;
    const eqH = Math.round(h * 0.62), ddTop = eqH + 14, ddH = h - ddTop - 4;
    const xs = (i) => padL + (i / Math.max(1, trades.length - 1)) * (w - padL - padR);

    const eqs = [start, ...trades.map((x) => x.equity)];
    const lo = Math.min(...eqs), hi = Math.max(...eqs);
    const ye = (v) => 4 + (1 - (v - lo) / Math.max(1e-9, hi - lo)) * (eqH - 8);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, ye(start)); ctx.lineTo(w - padR, ye(start)); ctx.stroke();
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    trades.forEach((x, i) => { const px = xs(i), py = ye(x.equity); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.stroke();

    const maxDD = Math.max(...trades.map((x) => x.dd), 1);
    const yd = (v) => ddTop + (v / maxDD) * ddH;
    ctx.fillStyle = 'rgba(208, 59, 59, 0.25)';
    ctx.strokeStyle = COLORS.down;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(xs(0), yd(0));
    trades.forEach((x, i) => ctx.lineTo(xs(i), yd(x.dd)));
    ctx.lineTo(xs(trades.length - 1), yd(0));
    ctx.closePath(); ctx.fill();
    ctx.font = '11px system-ui';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('equity', padL + 2, 14);
    ctx.fillText(`drawdown (max −${maxDD.toFixed(1)}%)`, padL + 2, ddTop + 12);
  }

  // R-multiple distribution: bars left of the zero line are losses (red),
  // right are wins (green) — the position carries the sign, color echoes it.
  function drawHistogram(Rs) {
    const c = canvasCtx('ts-hist');
    if (!c) return;
    const { ctx, w, h } = c;
    const BIN = 0.5, MIN = -2.5, MAX = 6;
    const bins = new Array(Math.round((MAX - MIN) / BIN)).fill(0);
    for (const r of Rs) {
      const i = Math.min(bins.length - 1, Math.max(0, Math.floor((r - MIN) / BIN)));
      bins[i]++;
    }
    const peak = Math.max(...bins, 1);
    const bw = (w - 16) / bins.length;
    const baseline = h - 18;
    bins.forEach((count, i) => {
      const x = 8 + i * bw;
      const binLo = MIN + i * BIN;
      const bh = (count / peak) * (baseline - 10);
      ctx.fillStyle = binLo + BIN <= 0 ? COLORS.down : binLo >= 0 ? COLORS.up : COLORS.muted;
      if (count) {
        ctx.beginPath();
        ctx.roundRect(x + 1, baseline - bh, Math.max(1, bw - 2), bh, 3);
        ctx.fill();
      }
    });
    const zeroX = 8 + ((0 - MIN) / BIN) * bw;
    ctx.strokeStyle = COLORS.baseline;
    ctx.beginPath(); ctx.moveTo(zeroX, 4); ctx.lineTo(zeroX, baseline); ctx.stroke();
    ctx.font = '11px system-ui';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('−2R', 8, h - 5);
    ctx.fillText('0', zeroX - 3, h - 5);
    ctx.fillText('+6R', w - 32, h - 5);
  }

  // Month-by-month % change of the paper equity, rows per year. Values wear
  // pos/neg ink with explicit signs — never color alone.
  function renderMonthly(trades, start) {
    const body = $('ts-monthly-body');
    if (!body) return;
    const months = new Map(); // 'YYYY-MM' -> end equity
    for (const x of trades) months.set(new Date(x.t).toISOString().slice(0, 7), x.equity);
    const keys = [...months.keys()].sort();
    if (!keys.length) return;
    let prev = start;
    const cells = new Map();
    for (const k of keys) {
      const eq = months.get(k);
      cells.set(k, (eq / prev - 1) * 100);
      prev = eq;
    }
    const years = [...new Set(keys.map((k) => k.slice(0, 4)))];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const head = `<tr><th></th>${MONTHS.map((m) => `<th class="num">${m}</th>`).join('')}</tr>`;
    const rows = years.map((y) => `<tr><td>${y}</td>${MONTHS.map((_, i) => {
      const v = cells.get(`${y}-${String(i + 1).padStart(2, '0')}`);
      return v == null ? '<td class="num radar-dist">·</td>'
        : `<td class="num ${v >= 0 ? 'move-pos' : 'move-neg'}">${fmtPct(v)}</td>`;
    }).join('')}</tr>`);
    body.innerHTML = head + rows.join('');
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
    renderAttribution(recs);
    renderBlotter();
    renderCrew();
    renderDeskLog();
    renderActionQueue();
    renderForecast();
  }
  let lastRecs = null;

  // Attribution: closed ledger trades grouped by stream, measured in R
  // (net move ÷ stop distance, costs included) — the only unit where a
  // swing trade and a scalp are directly comparable. Uses the same R
  // computation as the paper account, so the two can never disagree.
  function renderAttribution(recs) {
    const body = $('attr-body');
    if (!body) return;
    const META = [
      ['swing', '🌊 Swing (daily-55)', '1.25%'],
      ['swingEarly', '🌊 Early swing (daily-20)', '0.75%'],
      ['breakout', '◆ Breakout (4h)', '1.00%'],
      ['scalp', '⚡ Scalp (1h)', '0.50%'],
      ['cross', 'Cross (paper only)', '—'],
    ];
    const keyOf = (r) => (r.strategy === 'swing' ? (r.early ? 'swingEarly' : 'swing') : r.strategy === 'breakout' || r.strategy === 'scalp' ? r.strategy : 'cross');
    const groups = new Map(META.map(([k]) => [k, []]));
    for (const r of recs) {
      if (r.outcome === 'open' || !r.entry || !r.stop) continue;
      const stopPct = Math.abs(r.entry - r.stop) / r.entry * 100;
      if (!stopPct) continue;
      groups.get(keyOf(r)).push((r.movePct - (PAPER_COSTS[r.asset] ?? 0.05)) / stopPct);
    }
    body.innerHTML = META.map(([k, label, weight]) => {
      const Rs = groups.get(k);
      if (!Rs.length) return `<tr><td>${label}</td><td class="num">0</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">${weight}</td></tr>`;
      const sum = Rs.reduce((a, b) => a + b, 0);
      const avg = sum / Rs.length;
      const win = Rs.filter((r) => r > 0).length / Rs.length * 100;
      const cls = (v) => (v >= 0 ? 'move-pos' : 'move-neg');
      return `<tr><td>${label}</td><td class="num">${Rs.length}</td><td class="num">${win.toFixed(0)}%</td>` +
        `<td class="num ${cls(avg)}">${avg >= 0 ? '+' : ''}${avg.toFixed(2)}R</td>` +
        `<td class="num ${cls(sum)}">${sum >= 0 ? '+' : ''}${sum.toFixed(1)}R</td>` +
        `<td class="num">${weight}</td></tr>`;
    }).join('');
  }

  /* ---------------- boot ---------------- */

  async function refresh() {
    renderAssetTabs();
    $('chart-title').textContent = `${ASSETS[currentAsset].pair} · 4h candles`;
    const asset = currentAsset;
    const { source, candles } = await fetchCandles(asset);
    if (asset !== currentAsset) return; // user switched assets mid-fetch
    $('data-source').textContent = `${source} · updated ${fmtClock(Date.now())} UTC`;
    // demo feed gets one clear call to action instead of scattered tags
    const kj = $('key-jump');
    if (kj) kj.hidden = !/demo/i.test(source);
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
    fcData = { candles: closedCandles, ind: closedInd };
    renderForecast();
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

  $('key-jump')?.addEventListener('click', () => {
    const row = $('key-row');
    row.hidden = false;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('fmp-key').focus();
  });

  // Manual refresh: re-pull prices, signals, radar, and the ledger on demand.
  $('refresh-btn').addEventListener('click', async () => {
    const btn = $('refresh-btn');
    btn.classList.add('spinning');
    try { await Promise.allSettled([refresh(), loadPerformance(), renderRadar(), renderOilNews()]); }
    finally { btn.classList.remove('spinning'); }
  });

  refresh();
  loadMlModel().then(() => { if (mlModel) refresh(); }); // re-render with AI score once the model arrives
  loadEdgeStatus().then(renderTradePlan);
  loadGbpUsd().then(renderTradePlan);
  loadPerformance();
  renderRadar();
  renderOilNews();
  setInterval(refresh, 5 * 60 * 1000); // re-pull every 5 minutes
  setInterval(loadPerformance, 30 * 60 * 1000); // ledger updates every 4h
  setInterval(renderRadar, 30 * 60 * 1000); // radar sweeps all markets — keep it slow
  setInterval(renderOilNews, 30 * 60 * 1000);

  // ledger CSV export — the raw records, for spreadsheets or your own research
  $('csv-btn')?.addEventListener('click', () => {
    if (!lastRecs) return;
    const cols = ['asset', 't', 'strategy', 'early', 'side', 'entry', 'stop', 'target', 'outcome', 'movePct', 'confidence', 'adx', 'rsi', 'volConfirm', 'recorded'];
    const csv = [
      cols.join(','),
      ...lastRecs.map((r) => cols.map((c) => (c === 't' ? new Date(r.t).toISOString() : r[c] ?? '')).join(',')),
    ].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'lordbastian-signal-ledger.csv';
    a.click();
  });

  // terminal keyboard nav: ← → cycle markets (desktop)
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const keys = Object.keys(ASSETS);
    const i = keys.indexOf(currentAsset);
    currentAsset = keys[(i + (e.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length];
    localStorage.setItem('budsignal-asset', currentAsset);
    refresh();
  });

  // masthead UTC clock
  const tickClock = () => { const el = $('term-clock'); if (el) el.textContent = new Date().toISOString().slice(11, 19); };
  tickClock();
  setInterval(tickClock, 1000);
  setInterval(renderCountdown, 30 * 1000);
  renderSessions();
  setInterval(renderSessions, 60 * 1000);

  // Self-update: installed PWAs resume old sessions instead of reloading, so
  // the deployed build stamps version.json and the app reloads itself the
  // moment the stamp changes. Checked on load, on resume, and every 10 min.
  let bootVersion;
  async function checkVersion() {
    try {
      const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
      if (!r.ok) return;
      const v = (await r.json()).v;
      const el = $('term-build');
      if (el && v) el.textContent = String(v).slice(0, 7);
      if (bootVersion === undefined) bootVersion = v;
      else if (v !== bootVersion) location.reload();
    } catch (e) { /* offline — try again later */ }
  }
  checkVersion();
  setInterval(checkVersion, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    checkVersion();
    refresh();          // resume also re-pulls data, so a reopened app is never stale
    loadPerformance();
  });
})();
