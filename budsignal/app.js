/* BudSignal — rules-based BTC signal dashboard.
   Everything is computed client-side from public candle data; the rule set
   here is the same one described in the "How signals work" section. */

(() => {
  'use strict';

  const CANDLE_LIMIT = 500;      // 4h candles ≈ 83 days
  const EMA_FAST = 20;
  const EMA_SLOW = 50;
  const RSI_LEN = 14;
  const ATR_LEN = 14;
  const VOL_LEN = 20;
  const STOP_ATR = 1.5;          // stop distance in ATRs
  const TARGET_ATR = 2.0;        // target distance in ATRs
  const EVAL_CANDLES = 6;        // outcome window: 6 × 4h = 24h
  const VISIBLE = 120;           // candles drawn on the chart

  const COLORS = {
    up: '#0ca30c', down: '#d03b3b',
    ema20: '#3987e5', ema50: '#c98500',
    grid: '#2c2c2a', baseline: '#383835',
    muted: '#898781', ink: '#ffffff', surface: '#1a1a19',
  };

  const $ = (id) => document.getElementById(id);

  const fmtUsd = (v, digits = 0) =>
    v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const fmtPct = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
  const fmtTime = (t) => {
    const d = new Date(t);
    return d.toISOString().slice(0, 16).replace('T', ' ');
  };

  /* ---------------- data ---------------- */

  async function fetchCandles() {
    // Binance kline row: [openTime, open, high, low, close, volume, ...]
    try {
      const r = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=${CANDLE_LIMIT}`,
        { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const rows = await r.json();
      return {
        source: 'Binance (BTC/USDT, live)',
        candles: rows.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] })),
      };
    } catch (e) { /* fall through */ }

    // Coinbase Exchange row: [time, low, high, open, close, volume], newest first, max 300
    try {
      const r = await fetch(
        'https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=14400',
        { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const rows = await r.json();
      return {
        source: 'Coinbase (BTC/USD, live)',
        candles: rows.reverse().map((k) => ({ t: k[0] * 1000, o: k[3], h: k[2], l: k[1], c: k[4], v: k[5] })),
      };
    } catch (e) { /* fall through */ }

    return { source: 'demo data (exchange APIs unreachable — figures are illustrative only)', candles: demoCandles() };
  }

  // Deterministic random walk so the page still demonstrates itself offline.
  function demoCandles() {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const out = [];
    const FOUR_H = 4 * 3600 * 1000;
    let t = Date.now() - CANDLE_LIMIT * FOUR_H;
    let price = 64000;
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
      t += FOUR_H;
    }
    return out;
  }

  /* ---------------- indicators ---------------- */

  function ema(values, len) {
    const out = new Array(values.length).fill(null);
    const k = 2 / (len + 1);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      if (i < len - 1) { sum += values[i]; continue; }
      if (i === len - 1) { sum += values[i]; out[i] = sum / len; continue; }
      out[i] = values[i] * k + out[i - 1] * (1 - k);
    }
    return out;
  }

  function rsi(closes, len) {
    const out = new Array(closes.length).fill(null);
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i < closes.length; i++) {
      const ch = closes[i] - closes[i - 1];
      const gain = Math.max(ch, 0), loss = Math.max(-ch, 0);
      if (i <= len) {
        avgGain += gain / len;
        avgLoss += loss / len;
        if (i === len) out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      } else {
        avgGain = (avgGain * (len - 1) + gain) / len;
        avgLoss = (avgLoss * (len - 1) + loss) / len;
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      }
    }
    return out;
  }

  function atr(candles, len) {
    const out = new Array(candles.length).fill(null);
    let sum = 0;
    for (let i = 1; i < candles.length; i++) {
      const tr = Math.max(
        candles[i].h - candles[i].l,
        Math.abs(candles[i].h - candles[i - 1].c),
        Math.abs(candles[i].l - candles[i - 1].c));
      if (i <= len) {
        sum += tr;
        if (i === len) out[i] = sum / len;
      } else {
        out[i] = (out[i - 1] * (len - 1) + tr) / len;
      }
    }
    return out;
  }

  function sma(values, len) {
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= len) sum -= values[i - len];
      if (i >= len - 1) out[i] = sum / len;
    }
    return out;
  }

  /* ---------------- signal engine ---------------- */

  function computeSignals(candles, ind) {
    const signals = [];
    for (let i = 1; i < candles.length; i++) {
      const f0 = ind.emaFast[i - 1], s0 = ind.emaSlow[i - 1];
      const f1 = ind.emaFast[i], s1 = ind.emaSlow[i];
      if (f0 == null || s0 == null || ind.rsi[i] == null || ind.atr[i] == null) continue;

      let side = null;
      if (f0 <= s0 && f1 > s1 && ind.rsi[i] >= 45 && ind.rsi[i] <= 70) side = 'long';
      if (f0 >= s0 && f1 < s1 && ind.rsi[i] >= 30 && ind.rsi[i] <= 55) side = 'short';
      if (!side) continue;

      const entry = candles[i].c;
      const a = ind.atr[i];
      const dir = side === 'long' ? 1 : -1;
      const stop = entry - dir * STOP_ATR * a;
      const target = entry + dir * TARGET_ATR * a;

      // Confidence: volume confirmation + how centered RSI sits in its band.
      const volConfirm = ind.volSma[i] != null && candles[i].v > ind.volSma[i];
      const band = side === 'long' ? [45, 70] : [30, 55];
      const mid = (band[0] + band[1]) / 2;
      const rsiCentered = 1 - Math.abs(ind.rsi[i] - mid) / ((band[1] - band[0]) / 2);
      const confidence = Math.round(55 + (volConfirm ? 20 : 0) + rsiCentered * 25);

      signals.push({ i, t: candles[i].t, side, entry, stop, target, confidence, ...scoreOutcome(candles, i, side, entry, stop, target) });
    }
    return signals;
  }

  // Walk forward up to EVAL_CANDLES; first touch of stop or target wins.
  // Within a single candle that spans both, assume the stop hit first (conservative).
  function scoreOutcome(candles, i, side, entry, stop, target) {
    const dir = side === 'long' ? 1 : -1;
    for (let j = i + 1; j <= i + EVAL_CANDLES && j < candles.length; j++) {
      const hitStop = dir === 1 ? candles[j].l <= stop : candles[j].h >= stop;
      const hitTarget = dir === 1 ? candles[j].h >= target : candles[j].l <= target;
      if (hitStop) return { outcome: 'loss', exit: stop, movePct: (dir * (stop - entry) / entry) * 100 };
      if (hitTarget) return { outcome: 'win', exit: target, movePct: (dir * (target - entry) / entry) * 100 };
    }
    const last = Math.min(i + EVAL_CANDLES, candles.length - 1);
    if (last - i < EVAL_CANDLES) {
      // Not enough forward candles yet — signal still open.
      return { outcome: 'open', exit: null, movePct: (dir * (candles[last].c - entry) / entry) * 100 };
    }
    const exit = candles[last].c;
    return { outcome: 'flat', exit, movePct: (dir * (exit - entry) / entry) * 100 };
  }

  /* ---------------- chart ---------------- */

  const chart = {
    canvas: null, ctx: null, dpr: 1,
    candles: [], ind: null, signals: [],
    view: null, // { start, plot geometry } — rebuilt on each draw
  };

  function setupChart(candles, ind, signals) {
    chart.canvas = $('chart');
    chart.ctx = chart.canvas.getContext('2d');
    chart.candles = candles;
    chart.ind = ind;
    chart.signals = signals;
    drawChart();
    window.addEventListener('resize', drawChart);
    chart.canvas.addEventListener('mousemove', onChartHover);
    chart.canvas.addEventListener('mouseleave', hideTooltip);
  }

  function drawChart(hoverIdx = null) {
    const { canvas, ctx, candles, ind, signals } = chart;
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
    const padR = 64, padT = 12, padB = 26, padL = 6;
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
      ctx.fillText(fmtUsd(p), W - padR + 8, yy);
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
    drawLine(ctx, ind.emaFast, start, view.length, x, y, COLORS.ema20);
    drawLine(ctx, ind.emaSlow, start, view.length, x, y, COLORS.ema50);

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

    // crosshair
    if (hoverIdx != null && hoverIdx >= start) {
      const cx = x(hoverIdx);
      ctx.strokeStyle = COLORS.baseline;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(cx, padT); ctx.lineTo(cx, H - padB); ctx.stroke();
    }
  }

  function drawLine(ctx, series, start, n, x, y, color) {
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
    const sig = chart.signals.find((s) => s.i === idx);
    const tt = $('tooltip');
    tt.innerHTML = `
      <div class="tt-time">${fmtTime(c.t)} UTC</div>
      <div class="tt-row"><span>Open</span><span>${fmtUsd(c.o)}</span></div>
      <div class="tt-row"><span>High</span><span>${fmtUsd(c.h)}</span></div>
      <div class="tt-row"><span>Low</span><span>${fmtUsd(c.l)}</span></div>
      <div class="tt-row"><span>Close</span><span>${fmtUsd(c.c)}</span></div>
      <div class="tt-row"><span>Volume</span><span>${fmtUsd(c.v)}</span></div>
      ${chart.ind.emaFast[idx] != null ? `<div class="tt-row"><span>EMA 20</span><span>${fmtUsd(chart.ind.emaFast[idx])}</span></div>` : ''}
      ${chart.ind.emaSlow[idx] != null ? `<div class="tt-row"><span>EMA 50</span><span>${fmtUsd(chart.ind.emaSlow[idx])}</span></div>` : ''}
      ${sig ? `<div class="tt-signal ${sig.side}">${sig.side === 'long' ? '▲ LONG' : '▼ SHORT'} signal · entry ${fmtUsd(sig.entry)}</div>` : ''}`;
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

  /* ---------------- page rendering ---------------- */

  function renderTiles(candles, ind, signals) {
    const closed = signals.filter((s) => s.outcome === 'win' || s.outcome === 'loss' || s.outcome === 'flat');
    const favorable = closed.filter((s) => s.movePct > 0);
    const days = Math.round((candles[candles.length - 1].t - candles[0].t) / 86400000);

    const wr = closed.length ? (favorable.length / closed.length) * 100 : null;
    const wrEl = $('tile-winrate');
    wrEl.textContent = wr == null ? 'n/a' : `${wr.toFixed(0)}%`;
    $('tile-winrate-note').textContent = closed.length
      ? `${favorable.length} of ${closed.length} closed signals ended favorable`
      : 'no closed signals in loaded history';

    $('tile-signals').textContent = String(signals.length);
    $('tile-signals-note').textContent = `over the last ${days} days of 4h candles`;

    const avg = closed.length ? closed.reduce((a, s) => a + s.movePct, 0) / closed.length : null;
    const avgEl = $('tile-avgmove');
    avgEl.textContent = avg == null ? 'n/a' : fmtPct(avg);
    if (avg != null) avgEl.classList.add(avg >= 0 ? 'pos' : 'neg');

    const i = candles.length - 1;
    const bull = ind.emaFast[i] != null && ind.emaSlow[i] != null && ind.emaFast[i] > ind.emaSlow[i];
    const regimeEl = $('tile-regime');
    regimeEl.textContent = bull ? 'Uptrend' : 'Downtrend';
    regimeEl.classList.add(bull ? 'pos' : 'neg');
    $('tile-regime-note').textContent = bull ? 'EMA 20 above EMA 50' : 'EMA 20 below EMA 50';
  }

  function renderIndicators(candles, ind) {
    const i = candles.length - 1;
    $('ind-rsi').textContent = ind.rsi[i] != null ? ind.rsi[i].toFixed(1) : '—';
    $('ind-ema20').textContent = ind.emaFast[i] != null ? `$${fmtUsd(ind.emaFast[i])}` : '—';
    $('ind-ema50').textContent = ind.emaSlow[i] != null ? `$${fmtUsd(ind.emaSlow[i])}` : '—';
    $('ind-atr').textContent = ind.atr[i] != null ? `$${fmtUsd(ind.atr[i])}` : '—';
    const volRatio = ind.volSma[i] ? candles[i].v / ind.volSma[i] : null;
    $('ind-vol').textContent = volRatio ? `${(volRatio * 100).toFixed(0)}%` : '—';
  }

  function renderCurrentSignal(candles, ind, signals) {
    const last = candles[candles.length - 1];
    const FOUR_H = 4 * 3600 * 1000;
    const active = signals.filter((s) => last.t - s.t <= FOUR_H);
    const badge = $('signal-badge');
    const copy = $('signal-copy');
    const levels = $('signal-levels');

    if (active.length) {
      const s = active[active.length - 1];
      badge.className = `signal-badge ${s.side}`;
      badge.textContent = s.side === 'long' ? '▲ LONG' : '▼ SHORT';
      $('signal-when').textContent = `fired ${fmtTime(s.t)} UTC`;
      copy.textContent = s.side === 'long'
        ? 'EMA 20 crossed above EMA 50 with momentum confirming. The entry window is one 4-hour candle from the signal close; after that the setup expires.'
        : 'EMA 20 crossed below EMA 50 with momentum confirming. The entry window is one 4-hour candle from the signal close; after that the setup expires.';
      $('lvl-entry').textContent = `$${fmtUsd(s.entry)}`;
      $('lvl-stop').textContent = `$${fmtUsd(s.stop)}`;
      $('lvl-target').textContent = `$${fmtUsd(s.target)}`;
      const remaining = Math.max(0, s.t + FOUR_H - Date.now());
      $('lvl-window').textContent = remaining > 0
        ? `${Math.floor(remaining / 3600000)}h ${Math.floor((remaining % 3600000) / 60000)}m left`
        : 'expired';
      $('lvl-conf').textContent = `${s.confidence}/100`;
      levels.hidden = false;
    } else {
      badge.className = 'signal-badge neutral';
      badge.textContent = '— NO SIGNAL';
      $('signal-when').textContent = `as of ${fmtTime(last.t)} UTC`;
      const lastSig = signals[signals.length - 1];
      copy.textContent = lastSig
        ? `Conditions don't currently line up — the rule set is flat and waiting. The most recent signal was a ${lastSig.side.toUpperCase()} on ${fmtTime(lastSig.t)} UTC (see the track record below).`
        : 'Conditions don\'t currently line up — the rule set is flat and waiting. No signals fired in the loaded history.';
      levels.hidden = true;
    }
  }

  function renderTrackRecord(signals) {
    const body = $('record-body');
    if (!signals.length) {
      body.innerHTML = '<tr><td colspan="6" class="table-empty">The rule set produced no signals over the loaded history.</td></tr>';
      return;
    }
    const rows = [...signals].reverse().map((s) => {
      const outcome =
        s.outcome === 'win' ? '<span class="outcome win">✓ Target hit</span>' :
        s.outcome === 'loss' ? '<span class="outcome loss">✕ Stopped out</span>' :
        s.outcome === 'open' ? '<span class="outcome flat">● Open</span>' :
        '<span class="outcome flat">◦ Expired at market</span>';
      const moveCls = s.movePct >= 0 ? 'move-pos' : 'move-neg';
      return `<tr>
        <td>${fmtTime(s.t)}</td>
        <td><span class="side-badge ${s.side}">${s.side === 'long' ? '▲ LONG' : '▼ SHORT'}</span></td>
        <td class="num">$${fmtUsd(s.entry)}</td>
        <td class="num">${s.exit != null ? '$' + fmtUsd(s.exit) : '—'}</td>
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
    $('hero-price').textContent = `$${fmtUsd(last.c)}`;
    const dEl = $('hero-delta');
    dEl.textContent = `${fmtPct(delta)} · 24h`;
    dEl.className = `hero-price-delta ${delta >= 0 ? 'pos' : 'neg'}`;
  }

  /* ---------------- boot ---------------- */

  async function refresh() {
    const { source, candles } = await fetchCandles();
    $('data-source').textContent = source;
    if (candles.length < EMA_SLOW + 5) return;

    const closes = candles.map((c) => c.c);
    const ind = {
      emaFast: ema(closes, EMA_FAST),
      emaSlow: ema(closes, EMA_SLOW),
      rsi: rsi(closes, RSI_LEN),
      atr: atr(candles, ATR_LEN),
      volSma: sma(candles.map((c) => c.v), VOL_LEN),
    };
    const signals = computeSignals(candles, ind);

    renderHero(candles);
    renderTiles(candles, ind, signals);
    renderIndicators(candles, ind);
    renderCurrentSignal(candles, ind, signals);
    renderTrackRecord(signals);
    setupChart(candles, ind, signals);
  }

  refresh();
  setInterval(refresh, 5 * 60 * 1000); // re-pull every 5 minutes
})();
