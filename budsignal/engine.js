/* BudSignal engine — indicators + signal rules, shared verbatim by the web
   app (index.html) and the Telegram notifier (notify.mjs) so the two can
   never disagree about what a signal is. Exposed via globalThis so the same
   file loads as a browser script and as a Node import. */

(() => {
  'use strict';

  const CFG = {
    CANDLE_MS: 4 * 3600 * 1000, // 4h timeframe
    EMA_FAST: 20,
    EMA_SLOW: 50,
    EMA_TREND: 200,             // higher-timeframe trend filter
    RSI_LEN: 14,
    ATR_LEN: 14,
    ADX_LEN: 14,
    ADX_MIN: 20,                // below this the market is chop — no signals
    SLOPE_LOOKBACK: 3,          // EMA-slow slope gate: 3 candles = 12h
    VOL_LEN: 20,
    STOP_ATR: 1.5,              // stop distance in ATRs
    TARGET_ATR: 2.0,            // target distance in ATRs
    BE_TRIGGER_ATR: 1.0,        // favorable excursion that moves the stop to breakeven
    EVAL_CANDLES: 6,            // outcome window: 6 x 4h = 24h
    TRAIL_ATR: 2.0,             // chandelier trailing-stop distance in ATRs
    TRAIL_EVAL: 18,             // trailing-exit window: 18 x 4h = 3 days
  };

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

  // Wilder's ADX — trend-strength gate; low ADX means chop, where EMA crosses whipsaw.
  function adx(candles, len) {
    const out = new Array(candles.length).fill(null);
    let trS = 0, pS = 0, mS = 0;
    let dxSum = 0, dxCount = 0, prevAdx = null;
    for (let i = 1; i < candles.length; i++) {
      const tr = Math.max(
        candles[i].h - candles[i].l,
        Math.abs(candles[i].h - candles[i - 1].c),
        Math.abs(candles[i].l - candles[i - 1].c));
      const up = candles[i].h - candles[i - 1].h;
      const dn = candles[i - 1].l - candles[i].l;
      const pdm = up > dn && up > 0 ? up : 0;
      const mdm = dn > up && dn > 0 ? dn : 0;
      if (i <= len) {
        trS += tr; pS += pdm; mS += mdm;
        if (i < len) continue;
      } else {
        trS = trS - trS / len + tr;
        pS = pS - pS / len + pdm;
        mS = mS - mS / len + mdm;
      }
      if (trS === 0) continue;
      const pdi = (100 * pS) / trS;
      const mdi = (100 * mS) / trS;
      const dx = pdi + mdi === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / (pdi + mdi);
      if (prevAdx == null) {
        dxSum += dx; dxCount++;
        if (dxCount === len) { prevAdx = dxSum / len; out[i] = prevAdx; }
      } else {
        prevAdx = (prevAdx * (len - 1) + dx) / len;
        out[i] = prevAdx;
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

  function computeIndicators(candles) {
    const closes = candles.map((c) => c.c);
    return {
      emaFast: ema(closes, CFG.EMA_FAST),
      emaSlow: ema(closes, CFG.EMA_SLOW),
      emaTrend: ema(closes, CFG.EMA_TREND),
      rsi: rsi(closes, CFG.RSI_LEN),
      atr: atr(candles, CFG.ATR_LEN),
      adx: adx(candles, CFG.ADX_LEN),
      volSma: sma(candles.map((c) => c.v), CFG.VOL_LEN),
    };
  }

  // `filtered` = the shipped rule set (trend + ADX + candle + slope gates).
  // `filtered: false` is the raw EMA-cross baseline, computed only so the
  // dashboard can show what the filters are worth over the same history.
  function computeSignals(candles, ind, filtered) {
    const signals = [];
    // Both variants start where every indicator is defined, so the
    // filtered-vs-baseline comparison covers an identical span.
    const warmup = Math.min(candles.length - 1, CFG.EMA_TREND);
    for (let i = warmup; i < candles.length; i++) {
      const f0 = ind.emaFast[i - 1], s0 = ind.emaSlow[i - 1];
      const f1 = ind.emaFast[i], s1 = ind.emaSlow[i];
      if (f0 == null || s0 == null || ind.rsi[i] == null || ind.atr[i] == null) continue;

      let side = null;
      if (f0 <= s0 && f1 > s1 && ind.rsi[i] >= 45 && ind.rsi[i] <= 70) side = 'long';
      if (f0 >= s0 && f1 < s1 && ind.rsi[i] >= 30 && ind.rsi[i] <= 55) side = 'short';
      if (!side) continue;

      if (filtered) {
        // Gate 1: trade only with the higher-timeframe trend (200 EMA side).
        const trend = ind.emaTrend[i];
        if (trend == null) continue;
        if (side === 'long' && candles[i].c <= trend) continue;
        if (side === 'short' && candles[i].c >= trend) continue;
        // Gate 2: skip chop — EMA crosses whipsaw when trend strength is low.
        if (ind.adx[i] == null || ind.adx[i] < CFG.ADX_MIN) continue;
        // Gate 3: the signal candle itself must close with the cross, so a
        // cross produced by a candle already reversing doesn't fire.
        if (side === 'long' && candles[i].c <= candles[i].o) continue;
        if (side === 'short' && candles[i].c >= candles[i].o) continue;
        // Gate 4: the slow EMA must already be bending the trade's way, so
        // crosses against a still-falling (or still-rising) backbone don't fire.
        const back = ind.emaSlow[i - CFG.SLOPE_LOOKBACK];
        if (back == null) continue;
        if (side === 'long' && s1 <= back) continue;
        if (side === 'short' && s1 >= back) continue;
      }

      const entry = candles[i].c;
      const a = ind.atr[i];
      const dir = side === 'long' ? 1 : -1;
      const stop = entry - dir * CFG.STOP_ATR * a;
      const target = entry + dir * CFG.TARGET_ATR * a;

      // Confidence: volume confirmation + how centered RSI sits in its band.
      const volConfirm = ind.volSma[i] != null && candles[i].v > ind.volSma[i];
      const band = side === 'long' ? [45, 70] : [30, 55];
      const mid = (band[0] + band[1]) / 2;
      const rsiCentered = 1 - Math.abs(ind.rsi[i] - mid) / ((band[1] - band[0]) / 2);
      const confidence = Math.round(55 + (volConfirm ? 20 : 0) + rsiCentered * 25);

      signals.push({
        i, t: candles[i].t, side, entry, stop, target, confidence,
        // feature snapshot at fire time — recorded to the performance ledger
        // (regime breakdowns) and consumed by the ML meta-model
        adx: ind.adx[i] != null ? Math.round(ind.adx[i] * 10) / 10 : null,
        rsiAt: Math.round(ind.rsi[i] * 10) / 10,
        volConfirm,
        volRatio: ind.volSma[i] ? Math.round((candles[i].v / ind.volSma[i]) * 100) / 100 : null,
        trendDist: ind.emaTrend[i] != null ? Math.round(((candles[i].c - ind.emaTrend[i]) / a) * 100) / 100 : null,
        atrPct: Math.round((a / candles[i].c) * 10000) / 10000,
        ...scoreOutcome(candles, i, side, entry, stop, target, a),
      });
    }
    return signals;
  }

  // Walk forward up to EVAL_CANDLES; first touch of stop or target wins.
  // Within a single candle that spans both, assume the stop hit first
  // (conservative). Once price has moved BE_TRIGGER_ATR in favor, the stop
  // moves to breakeven from the NEXT candle on — cutting full-size losses on
  // trades that worked first and then reversed.
  function scoreOutcome(candles, i, side, entry, stop, target, a) {
    const dir = side === 'long' ? 1 : -1;
    let beArmed = false;
    for (let j = i + 1; j <= i + CFG.EVAL_CANDLES && j < candles.length; j++) {
      const hitStop = dir === 1 ? candles[j].l <= stop : candles[j].h >= stop;
      const hitTarget = dir === 1 ? candles[j].h >= target : candles[j].l <= target;
      if (hitStop) {
        if (beArmed) return { outcome: 'be', exit: stop, movePct: 0 };
        return { outcome: 'loss', exit: stop, movePct: (dir * (stop - entry) / entry) * 100 };
      }
      if (hitTarget) return { outcome: 'win', exit: target, movePct: (dir * (target - entry) / entry) * 100 };
      const excursion = dir === 1 ? candles[j].h - entry : entry - candles[j].l;
      if (!beArmed && excursion >= CFG.BE_TRIGGER_ATR * a) { beArmed = true; stop = entry; }
    }
    const last = Math.min(i + CFG.EVAL_CANDLES, candles.length - 1);
    if (last - i < CFG.EVAL_CANDLES) {
      // Not enough forward candles yet — signal still open.
      return { outcome: 'open', exit: null, movePct: (dir * (candles[last].c - entry) / entry) * 100 };
    }
    const exit = candles[last].c;
    return { outcome: 'flat', exit, movePct: (dir * (exit - entry) / entry) * 100 };
  }

  // Experimental exit: same entry, but instead of a fixed 2xATR target the
  // stop trails TRAIL_ATR behind the best price seen (chandelier), letting
  // winners run for up to TRAIL_EVAL candles. Used only for the measured
  // fixed-vs-trailing comparison — the shipped signal levels stay fixed.
  function trailingScore(candles, i, side, entry, a) {
    const dir = side === 'long' ? 1 : -1;
    let stop = entry - dir * CFG.STOP_ATR * a;
    let best = entry;
    for (let j = i + 1; j <= i + CFG.TRAIL_EVAL && j < candles.length; j++) {
      const hitStop = dir === 1 ? candles[j].l <= stop : candles[j].h >= stop;
      if (hitStop) return { closed: true, movePct: (dir * (stop - entry) / entry) * 100 };
      best = dir === 1 ? Math.max(best, candles[j].h) : Math.min(best, candles[j].l);
      const trailed = best - dir * CFG.TRAIL_ATR * a;
      if (dir === 1 ? trailed > stop : trailed < stop) stop = trailed;
    }
    const last = Math.min(i + CFG.TRAIL_EVAL, candles.length - 1);
    if (last - i < CFG.TRAIL_EVAL) return { closed: false, movePct: null };
    return { closed: true, movePct: (dir * (candles[last].c - entry) / entry) * 100 };
  }

  // Aggregate fixed-vs-trailing comparison over an existing signal list.
  function trailingComparison(candles, ind, signals) {
    const rows = [];
    for (const s of signals) {
      if (ind.atr[s.i] == null) continue;
      const t = trailingScore(candles, s.i, s.side, s.entry, ind.atr[s.i]);
      if (t.closed && s.outcome !== 'open') rows.push({ fixed: s.movePct, trail: t.movePct });
    }
    if (!rows.length) return null;
    const agg = (get) => {
      const v = rows.map(get);
      const fav = v.filter((x) => x > 0).length;
      return { n: v.length, favPct: (fav / v.length) * 100, avg: v.reduce((x, y) => x + y, 0) / v.length };
    };
    return { fixed: agg((r) => r.fixed), trail: agg((r) => r.trail) };
  }

  // --- ML meta-model (trained by research.mjs, published as ml-model.json) ---
  // Predicts the probability a signal ends favorable from its fire-time
  // features. It classifies signals, it does not predict price.

  function mlFeatures(sig) {
    return [
      sig.side === 'long' ? 1 : 0,
      sig.rsiAt ?? 50,
      sig.adx ?? 20,
      Math.min(sig.volRatio ?? 1, 3),
      Math.max(-5, Math.min(5, sig.trendDist ?? 0)),
      (sig.atrPct ?? 0.02) * 100,
      // Tier-1 enrichment (enrich.mjs) — neutral defaults when a source is
      // unavailable, so unenriched signals still score sanely
      sig.fundPctl ?? 0.5,                                  // funding percentile vs trailing 30d
      (sig.fng ?? 50) / 100,                                // crypto Fear & Greed
      Math.min(sig.eventHrs ?? 48, 48) / 48,                // hours to next high-impact USD event
      Math.max(-5, Math.min(5, sig.ctxTrend ?? 0)),         // cross-asset trend (USD index / BTC)
    ];
  }

  function mlScore(sig, model) {
    const f = mlFeatures(sig);
    let z = model.bias;
    for (let k = 0; k < f.length; k++) {
      z += model.weights[k] * ((f[k] - model.mean[k]) / (model.std[k] || 1));
    }
    return 1 / (1 + Math.exp(-z));
  }

  // Plain logistic regression, batch gradient descent with L2 — small enough
  // to need no dependencies, transparent enough to publish the weights.
  function mlTrain(rows, { epochs = 800, lr = 0.1, l2 = 0.01 } = {}) {
    const X = rows.map((r) => mlFeatures(r.sig));
    const y = rows.map((r) => (r.label ? 1 : 0));
    const d = X[0].length, n = X.length;
    const mean = Array(d).fill(0), std = Array(d).fill(0);
    for (const x of X) for (let k = 0; k < d; k++) mean[k] += x[k] / n;
    for (const x of X) for (let k = 0; k < d; k++) std[k] += (x[k] - mean[k]) ** 2 / n;
    for (let k = 0; k < d; k++) std[k] = Math.sqrt(std[k]) || 1;
    const Z = X.map((x) => x.map((v, k) => (v - mean[k]) / std[k]));
    let w = Array(d).fill(0), b = 0;
    for (let e = 0; e < epochs; e++) {
      const gw = Array(d).fill(0);
      let gb = 0;
      for (let i = 0; i < n; i++) {
        let z = b;
        for (let k = 0; k < d; k++) z += w[k] * Z[i][k];
        const p = 1 / (1 + Math.exp(-z));
        const err = p - y[i];
        for (let k = 0; k < d; k++) gw[k] += (err * Z[i][k]) / n;
        gb += err / n;
      }
      for (let k = 0; k < d; k++) w[k] -= lr * (gw[k] + l2 * w[k]);
      b -= lr * gb;
    }
    return {
      weights: w, bias: b, mean, std,
      features: ['sideLong', 'rsi', 'adx', 'volRatio', 'trendDist', 'atrPct%', 'fundPctl', 'fng', 'eventHrs', 'ctxTrend'],
    };
  }

  // Signals must only ever be computed on CLOSED candles — a forming candle's
  // close changes until it closes, so a signal computed on it could appear
  // and then vanish ("repainting"). Returns the prefix of `candles` whose
  // final candle has fully closed as of `now`.
  function closedPrefix(candles, now) {
    let end = candles.length;
    while (end > 0 && candles[end - 1].t + CFG.CANDLE_MS > now) end--;
    return candles.slice(0, end);
  }

  const closedOf = (signals) => signals.filter((s) => s.outcome !== 'open');
  const favorableRate = (closed) =>
    closed.length ? (closed.filter((s) => s.movePct > 0).length / closed.length) * 100 : null;

  globalThis.BudSignalEngine = {
    CFG, ema, rsi, atr, adx, sma,
    computeIndicators, computeSignals, closedPrefix, closedOf, favorableRate,
    trailingScore, trailingComparison,
    mlFeatures, mlScore, mlTrain,
  };
})();
