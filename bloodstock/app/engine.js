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
             residual, inflows, cap, gns, vetClean, clamped, verdict };
  }

  globalThis.VaultRacingEngine = { PARAM_DEFAULTS, ratingMult, expectedPrice, evaluate };
})();
