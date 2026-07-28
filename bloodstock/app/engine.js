/* vault racing — shared valuation engine.
   Loaded by the browser app (script tag → globalThis.VaultRacingEngine) and
   by the pipeline notifier (node import), exactly like budsignal's engine.js,
   so a lot scores identically on the site and in alerts. */

(() => {
  'use strict';

  const PARAM_DEFAULTS = {
    vTop: 350000, vWin: 120000, vMid: 30000, vFlop: 8000,
    prizeEV: 25000, costs: 30000, margin: 15, budgetGns: 60000,
    ratingMin: 85, ratingMax: 95, maxStarts: 7,
  };

  // What the HIT ring pays relative to the sire median, by rating band.
  function ratingMult(r) {
    return r >= 98 ? 2.5 : r >= 94 ? 1.9 : r >= 90 ? 1.4 : r >= 85 ? 1.0
         : r >= 80 ? 0.75 : 0.5;
  }

  // Expected hammer price (gns) from sire-median comps. null = no comp.
  function expectedPrice(h, medians) {
    const s = String(h.sire || '').toLowerCase().replace(/\(.*?\)/g, '').trim();
    const comp = medians[s] || Object.entries(medians)
      .find(([k]) => s && (s.includes(k) || k.includes(s)))?.[1];
    if (!comp || !comp.median) return null;
    let p = comp.median * ratingMult(+h.rating || 0);
    if (h.powerhouse) p *= 1.2;   // powerhouse drafts attract a premium
    if (h.awForm) p *= 1.1;       // AW winners are bid up by export money
    return { gns: Math.round(p / 500) * 500, est: !!comp.est };
  }

  // The 6-filter screen + EV-capped hard max bid.
  function evaluate(h, P) {
    const checks = [
      ['Powerhouse cast-off vendor',        !!h.powerhouse],
      ['Dirt-translating sire line',        h.sireTier === 'A' || h.sireTier === 'B'],
      ['Black type in first two dams',      !!h.blackType],
      [`Rating ${P.ratingMin}–${P.ratingMax}`,
        h.rating >= P.ratingMin && h.rating <= P.ratingMax],
      [`≤ ${P.maxStarts} starts`,      h.starts <= P.maxStarts],
      ['AW form signal',                    !!h.awForm],
    ];
    const fails = checks.filter(([, ok]) => !ok).map(([n]) => n);

    // Quality score 0..1 — soft grading inside the hard filters, weighted to
    // what actually matters for a Meydan dirt campaign. An elite Dubai-profile
    // lot tops out near 1.0; a decent-but-ordinary one lands ~0.6–0.75.
    let s = 0;
    // --- pedigree & connections (the residual-value engine) ---
    s += h.sireTier === 'A' ? 0.26 : h.sireTier === 'B' ? 0.15 : 0;
    // family floor: radar-measured dam production beats the manual tickbox
    const damQ = +h.damScore >= 0.6 ? 0.14 : +h.damScore >= 0.3 ? 0.08 : 0;
    s += Math.max(damQ, h.blackType ? 0.10 : 0);
    s += h.powerhouse ? 0.13 : 0;
    // --- dirt / all-weather proof: Dubai runs on dirt ---
    const dirtSurf = /aw|tapeta|polytrack|fibresand|dirt|sand|psf/
      .test(String(h.surfaceList || '').toLowerCase());
    if (h.awForm) s += 0.13;                       // a win on the surface
    else if (dirtSurf) s += 0.06;                  // has at least run on it
    // --- ability: proven mark with unpriced ceiling ---
    if (h.rating >= 88 && h.rating <= 93) s += 0.16;       // sweet spot
    else if (h.rating >= P.ratingMin && h.rating <= P.ratingMax) s += 0.10;
    if (+h.careerHigh > +h.rating) s += 0.03;      // has been rated higher
    // --- form trajectory the market hasn't repriced ---
    if (h.trend === 'improving') s += 0.05;
    if (+h.rprEdge >= 5) s += 0.05;
    // --- proven winner: strike rate is hard evidence of a will to win ---
    if (+h.winPct >= 0.33) s += 0.06;
    else if (+h.winPct >= 0.20) s += 0.03;
    // --- suited to the Carnival dirt lane (6–9.5f) ---
    if (h.distBest != null && h.distBest >= 6 && h.distBest <= 9.5) s += 0.05;
    // --- well-in & reliable ---
    if (h.classMove === 'dropping') s += 0.03;     // ready to strike
    if (+h.consistency >= 0.5) s += 0.02;          // reliable mark
    s = Math.min(1, s);

    // Outcome tree: upside probability scales with quality score.
    const pTop = 0.04 + 0.06 * s;   // 4% .. 10%
    const pWin = 0.12 + 0.08 * s;   // 12% .. 20%
    const pMid = 0.40;
    const pFlop = 1 - pTop - pWin - pMid;

    const residual = pTop * P.vTop + pWin * P.vWin + pMid * P.vMid + pFlop * P.vFlop;
    const inflows = residual + P.prizeEV;
    const cap = inflows - P.costs;                          // breakeven, £
    let bid = cap / (1 + P.margin / 100) / 1.05;            // margin, frictions→gns
    const vetClean = h.vet === 'clean';
    if (!vetClean) bid *= 0.8;                              // mandatory rule
    let gns = Math.max(0, Math.floor(bid / 1000) * 1000);
    const clamped = gns > P.budgetGns;
    if (clamped) gns = P.budgetGns;

    const verdict = fails.length ? 'REJECT' : 'BID';
    return { checks, fails, score: s, pTop, pWin, pMid, pFlop,
             residual, inflows, cap, gns, vetClean, clamped, verdict,
             dubai: dubaiFit(h) };
  }

  /* Dubai Carnival fit (0..1) — how well this horse suits a Meydan dirt
     campaign next season, independent of price/value. Dirt proof is the
     differentiator; then a dirt sire line, the Carnival-competitive rating
     band, a Meydan trip, the right age to campaign, and upside. A turf-only
     sprinter can be great VALUE (high vault score) yet a poor Dubai FIT. */
  function dubaiFit(h) {
    let f = 0;
    const reasons = [];
    // dirt / all-weather proof — THE Meydan differentiator
    if (h.awForm) { f += 0.28; reasons.push('AW/dirt winner'); }
    const dirtSurf = /aw|tapeta|polytrack|fibresand|dirt|sand|psf/
      .test(String(h.surfaceList || '').toLowerCase());
    if (dirtSurf && !h.awForm) { f += 0.08; reasons.push('run on the surface'); }
    // dirt-translating sire line
    if (h.sireTier === 'A') { f += 0.18; reasons.push('proven dirt sire'); }
    else if (h.sireTier === 'B') { f += 0.11; reasons.push('dirt damsire'); }
    // Carnival-competitive mark (imported handicappers sit ~90–102)
    const r = +h.rating || 0;
    if (r >= 90 && r <= 102) { f += 0.16; reasons.push('Carnival rating band'); }
    else if (r >= 85 && r <= 108) { f += 0.10; }
    else if (r >= 80) { f += 0.04; }
    // a Meydan dirt trip (sprints to 9f handicaps)
    if (h.distBest != null) {
      if (h.distBest >= 6 && h.distBest <= 9.5) { f += 0.12; reasons.push('Meydan trip'); }
      else if (h.distBest >= 5 && h.distBest <= 10.5) { f += 0.06; }
    }
    // the right age to campaign next season
    const age = +h.age || null;
    if (age != null) { if (age >= 3 && age <= 6) { f += 0.08; } }
    else { f += 0.04; }
    // upside — improving and still unexposed
    if (h.trend === 'improving') { f += 0.04; reasons.push('improving'); }
    if (+h.starts <= 10) { f += 0.02; }
    return { pct: Math.min(1, +f.toFixed(3)), reasons };
  }

  // Broodmare-sire lines that put dirt/all-weather aptitude into a pedigree —
  // the damside half of a strong Meydan "nick".
  const DIRT_DAMSIRES = [
    'street cry', 'shamardal', "medaglia d'oro", 'dubai millennium', 'storm cat',
    'tapit', 'a.p. indy', 'ap indy', "giant's causeway", 'distorted humor',
    'speightstown', 'pioneerof the nile', 'curlin', 'bernardini', 'more than ready',
    'kingmambo', 'unbridled', 'gone west', 'smart strike', 'elusive quality',
    'ghostzapper', 'candy ride', 'malibu moon', 'uncle mo', 'into mischief',
    'quality road', 'hard spun', 'exchange rate', 'scat daddy', 'munnings',
  ];
  function damsireOf(h) {
    if (h.damsire) return String(h.damsire);
    const m = /\(([^)]+)\)\s*$/.exec(String(h.dam || ''));
    return m ? m[1] : '';
  }
  // Pedigree "nick" for dirt (0..1): how well the sire line and the broodmare
  // sire line combine for a Meydan dirt campaign. Sire dirt-line + a US/dirt
  // damsire is the classic strong cross.
  function nickScore(h) {
    const damsire = damsireOf(h);
    const ds = damsire.toLowerCase();
    let n = 0; const notes = [];
    if (h.sireTier === 'A') { n += 0.38; notes.push('proven dirt sire line'); }
    else if (h.sireTier === 'B') { n += 0.18; notes.push('dirt-influenced sire'); }
    const hit = DIRT_DAMSIRES.find((d) => ds && ds.includes(d));
    if (hit) { n += 0.42; notes.push(`${damsire} — dirt/US broodmare sire`); }
    else if (ds) { n += 0.05; }
    // both halves dirt = a genuine dirt cross
    if (h.sireTier === 'A' && hit) { n += 0.15; notes.push('dirt on both sides — strong cross'); }
    const pct = Math.min(1, +n.toFixed(3));
    const label = pct >= 0.75 ? 'strong dirt cross' : pct >= 0.5 ? 'promising cross'
      : pct >= 0.3 ? 'some dirt influence' : 'turf-leaning pedigree';
    return { pct, damsire, label, notes };
  }

  // Market estimate — Conservative / Base / Upside likely hammer price (gns).
  function marketEstimate(h, medians) {
    const exp = expectedPrice(h, medians || {});
    const base = exp ? exp.gns
      : Math.round(ratingMult(+h.rating || 0) * 22000 / 500) * 500; // fallback from rating
    const round = (n) => Math.round(n / 500) * 500;
    return { conservative: round(base * 0.72), base: round(base), upside: round(base * 1.45),
      est: exp ? !!exp.est : true };
  }

  // 5-year outlook — projected total return (residual value at exit + prize
  // money over ~2 racing seasons) and the ROI on the recommended max bid.
  function roiOutlook(h, P, purchaseGns) {
    const r = evaluate(h, P);
    const buy = purchaseGns || r.gns || 1;
    const seasons = 2;
    const prize = P.prizeEV * seasons;
    const cost = P.costs * seasons;
    const cons = r.residual * 0.6 + prize * 0.55;
    const base = r.residual + prize;
    const up = P.vTop * (r.pTop * 3) + r.residual + prize * 1.4; // breakthrough tilts upside
    const roi = (v) => Math.round(((v - buy - cost) / buy) * 100);
    return { buy, seasons, cons: Math.round(cons), base: Math.round(base), up: Math.round(up),
      roiCons: roi(cons), roiBase: roi(base), roiUp: roi(up) };
  }

  // Conformation & biomechanics — scores a manual assessment (h.conf) against
  // ideal ranges. h.conf keys hold 'ideal' | 'mild' | 'notable' (deviation).
  const CONF_ITEMS = [
    ['shoulder', 'Shoulder angle'], ['pasterns', 'Pasterns'],
    ['hoofpastern', 'Hoof-pastern axis'], ['limb', 'Limb / knee'],
    ['walk', 'Walk / action'], ['balance', 'Overall balance'],
  ];
  function conformationScore(h) {
    const c = h && h.conf; if (!c || typeof c !== 'object') return null;
    const w = { ideal: 1, mild: 0.6, notable: 0.15 };
    const flags = []; let sum = 0, n = 0;
    for (const [k, label] of CONF_ITEMS) {
      const v = c[k]; if (!v) continue; n++;
      sum += (w[v] ?? 0.6);
      if (v === 'notable') flags.push(`${label}: notable deviation`);
      else if (v === 'mild') flags.push(`${label}: mild`);
    }
    if (!n) return null;
    const pct = +(sum / n).toFixed(2);
    const label = pct >= 0.85 ? 'correct — excellent' : pct >= 0.7 ? 'good' : pct >= 0.5 ? 'some concerns' : 'significant faults';
    return { pct, label, flags, assessed: n };
  }

  globalThis.VaultRacingEngine = { PARAM_DEFAULTS, ratingMult, expectedPrice, evaluate, dubaiFit,
    nickScore, damsireOf, marketEstimate, roiOutlook, conformationScore, CONF_ITEMS };
})();
