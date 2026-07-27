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

    // Quality score 0..1 — soft grading inside the hard filters.
    let s = 0;
    s += h.sireTier === 'A' ? 0.30 : h.sireTier === 'B' ? 0.18 : 0;
    s += h.blackType ? 0.20 : 0;
    s += h.awForm ? 0.15 : 0;
    s += h.powerhouse ? 0.15 : 0;
    if (h.rating >= 88 && h.rating <= 93) s += 0.20;        // sweet spot
    else if (h.rating >= P.ratingMin && h.rating <= P.ratingMax) s += 0.12;
    // Form-trajectory bonus (radar-supplied; absent for hand-entered lots):
    // an improving mark or an RPR edge is ability the market hasn't repriced.
    if (h.trend === 'improving') s += 0.05;
    if (+h.rprEdge >= 5) s += 0.05;
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
