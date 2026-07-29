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

  // Distance aptitude by sire (centre trip, furlongs) — a curated map of where
  // each sire's stock is bred to be best. Used for a dosage-style speed↔stamina
  // read from pedigree, blended with the horse's own form when we have it.
  const SIRE_APTITUDE = {
    'dubawi': 9, 'night of thunder': 7.5, 'too darn hot': 7.5, 'new bay': 9,
    'blue point': 6, 'kingman': 8, 'dark angel': 6.5, 'no nay never': 6,
    'kodiac': 6, 'invincible spirit': 7, 'galileo': 11, 'sea the stars': 10,
    'frankel': 9, 'lope de vega': 8.5, 'wootton bassett': 8, 'mehmas': 6,
    'churchill': 9, 'starspangledbanner': 6, 'havana grey': 5.5, 'sioux nation': 6,
    'ten sovereigns': 6, 'space blues': 7, 'palace pier': 8, 'pinatubo': 8,
    'harry angel': 6, 'showcasing': 6, 'exceed and excel': 6, 'zoustar': 6.5,
    'siyouni': 7.5, 'shamardal': 8, 'street cry': 9, "medaglia d'oro": 9,
    'tapit': 8.5, 'into mischief': 6.5, 'curlin': 9.5, 'american pharoah': 9,
  };
  function aptitudeIndex(h) {
    const s = String(h.sire || '').toLowerCase().replace(/\(.*?\)/g, '').trim();
    let centre = SIRE_APTITUDE[s];
    if (centre == null) {
      const k = Object.keys(SIRE_APTITUDE).find((x) => s && (s.includes(x) || x.includes(s)));
      centre = k ? SIRE_APTITUDE[k] : null;
    }
    const source = centre != null ? 'pedigree' : (h.distBest != null ? 'form' : null);
    if (centre == null) centre = h.distBest != null ? +h.distBest : null;
    if (centre == null) return null;
    if (h.distBest != null && source === 'pedigree') centre = (centre + +h.distBest) / 2; // blend
    centre = +centre.toFixed(1);
    const speed = Math.max(0, Math.min(100, Math.round((12 - centre) / 7 * 100)));
    const band = centre <= 6 ? 'sprint (5–6f)' : centre <= 8 ? 'mile (7–8f)'
      : centre <= 11 ? 'middle (9–11f)' : 'staying (12f+)';
    return { centre, speed, stamina: 100 - speed, band, source };
  }
  // Female-family strength (0..1) — the damside quality, from radar-measured dam
  // production plus verified/likely black type.
  function femaleFamily(h) {
    let f = 0; const notes = [];
    if (+h.damScore >= 0.6) { f += 0.6; notes.push(h.damLabel || 'strong producer'); }
    else if (+h.damScore >= 0.3) { f += 0.35; notes.push(h.damLabel || 'some black type'); }
    else if (h.damScore != null) { f += 0.12; }
    if (h.blackType) { f += 0.3; notes.push('black type in first two dams'); }
    const damsire = damsireOf(h);
    if (DIRT_DAMSIRES.find((d) => damsire.toLowerCase().includes(d))) { f += 0.12; notes.push(`${damsire} damsire`); }
    if (f === 0) return null;
    const pct = Math.min(1, +f.toFixed(2));
    return { pct, label: pct >= 0.7 ? 'strong female family' : pct >= 0.45 ? 'useful family' : 'modest family', notes };
  }

  /* ---------- Dosage (speed↔stamina from chef-de-race ancestors) ----------
     A real implementation of Steven Roman's Dosage method: chef-de-race
     ancestors in the first four generations contribute points to five
     aptitude categories (Brilliant→Professional), weighted by generation
     (16/8/4/2, halving each generation back). From the resulting Dosage
     Profile we compute the Dosage Index (DI) and Centre of Distribution (CD).

     CHEFS follows Roman's published chef-de-race classifications, extended
     with a few recent influential sires by aptitude so modern pedigrees light
     up. It is a curated, extensible subset — misclassifying or omitting a
     name only affects horses carrying it. The DI/CD math is exact; the output
     is only as complete as the pedigree supplied (sire+damsire alone is
     "indicative"; a full 4-generation pedigree gives the real figure). */
  const CHEFS = {
    // Brilliant (B) — pure speed
    'nasrullah': ['B'], 'bold ruler': ['B'], 'raise a native': ['B'], 'habitat': ['B'],
    'grey sovereign': ['B'], 'red god': ['B'], 'mr. prospector': ['B', 'C'], 'mr prospector': ['B', 'C'],
    'gone west': ['B', 'I'], 'sharpen up': ['B', 'C'], 'seeking the gold': ['B', 'C'],
    'green desert': ['B', 'I'], 'dr. fager': ['B', 'I'], 'in reality': ['B', 'C'],
    'nearctic': ['B'], 'turn-to': ['B', 'I'], 'tom fool': ['B', 'C'], 'never bend': ['B', 'C'],
    // Intermediate (I)
    'native dancer': ['I'], 'danzig': ['I'], 'storm cat': ['I', 'C'], 'halo': ['I', 'C'],
    'hail to reason': ['I', 'S'], 'lyphard': ['I', 'C'], 'blushing groom': ['I', 'C'],
    'kris': ['I'], 'diesis': ['I'], 'caro': ['I', 'C'], 'danehill': ['I', 'C'],
    'fappiano': ['I', 'C'], 'kingmambo': ['I', 'C'], 'dubawi': ['I', 'C'],
    "giant's causeway": ['I', 'C'], 'secretariat': ['I', 'C'],
    // Classic (C)
    'northern dancer': ['C'], 'nijinsky': ['C'], "sadler's wells": ['C'], 'nureyev': ['C'],
    'sir ivor': ['C'], 'round table': ['C'], 'seattle slew': ['C'], 'mill reef': ['C'],
    'sea the stars': ['C'], 'street cry': ['C'], "medaglia d'oro": ['C'], 'frankel': ['C'],
    'buckpasser': ['C', 'S'], 'damascus': ['C', 'S'], 'roberto': ['C', 'P'],
    'a.p. indy': ['C', 'S'], 'ap indy': ['C', 'S'], 'unbridled': ['C', 'S'],
    'sunday silence': ['C', 'S'], 'galileo': ['C', 'S'], 'montjeu': ['C', 'S'],
    'tapit': ['C', 'S'], 'curlin': ['C', 'S'],
    // Solid (S) / Professional (P) — stamina
    'ribot': ['C', 'P'], 'graustark': ['C', 'P'], 'sea-bird': ['C', 'P'], 'sea bird': ['C', 'P'],
    'princequillo': ['S', 'P'], 'darshaan': ['C', 'S'], 'rainbow quest': ['C', 'S'],
    'shirley heights': ['S'], 'alleged': ['C', 'S'], 'vaguely noble': ['S', 'P'],
  };
  const GEN_PTS = { 1: 16, 2: 8, 3: 4, 4: 2 };
  function chefCats(name) {
    if (!name) return null;
    if (CHEFS[name]) return CHEFS[name];
    const k = Object.keys(CHEFS).find((x) => name.includes(x) || x.includes(name));
    return k ? CHEFS[k] : null;
  }
  // Parse a supplied pedigree into [{name, gen}]. Accepts an array of
  // {name,gen}, an array of "name:gen" strings, or a "name:gen; name:gen"
  // string. Missing generation defaults to 3.
  function parsePed(ped) {
    if (!ped) return [];
    let list = ped;
    if (typeof ped === 'string') list = ped.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    if (!Array.isArray(list)) return [];
    return list.map((item) => {
      if (item && typeof item === 'object') return { name: String(item.name || '').toLowerCase().trim(), gen: Math.max(1, Math.min(4, +item.gen || 3)) };
      const p = String(item).split(':');
      return { name: p[0].toLowerCase().replace(/\(.*?\)/g, '').trim(), gen: p[1] ? Math.max(1, Math.min(4, +p[1])) : 3 };
    }).filter((a) => a.name);
  }
  function dosageOf(h) {
    let anc = parsePed(h.ped || h.pedigree);
    let fallback = false;
    if (anc.length < 3) {
      const sire = String(h.sire || '').toLowerCase().replace(/\(.*?\)/g, '').trim();
      const ds = damsireOf(h).toLowerCase();
      const extra = [];
      if (sire) extra.push({ name: sire, gen: 1 });
      if (ds) extra.push({ name: ds, gen: 2 });
      anc = anc.length ? anc.concat(extra) : extra;
      fallback = true;
    }
    const P = { B: 0, I: 0, C: 0, S: 0, P: 0 };
    const chefs = [];
    for (const a of anc) {
      const cats = chefCats(a.name);
      if (!cats) continue;
      const pts = (GEN_PTS[a.gen] || 2) / cats.length;
      for (const c of cats) P[c] += pts;
      chefs.push({ name: a.name, gen: a.gen, cats });
    }
    const total = P.B + P.I + P.C + P.S + P.P;
    if (!total) return null;
    const denom = P.C / 2 + P.S + P.P;
    const di = denom > 0 ? +((P.B + P.I + P.C / 2) / denom).toFixed(2) : null; // null = pure speed / ∞
    const cd = +((2 * P.B + P.I - P.S - 2 * P.P) / total).toFixed(2);
    const centre = +(9 - cd * 2).toFixed(1); // cd +2→5f, 0→9f, −2→13f
    const aptitude = (di == null || di >= 4) ? 'speed / precocity'
      : di >= 2 ? 'speed–classic' : di >= 1 ? 'classic' : 'stamina';
    return {
      profile: [P.B, P.I, P.C, P.S, P.P].map((x) => +x.toFixed(1)),
      di, cd, centre, aptitude,
      chefs, count: chefs.length,
      partial: fallback || chefs.length < 4,
    };
  }

  globalThis.VaultRacingEngine = { PARAM_DEFAULTS, ratingMult, expectedPrice, evaluate, dubaiFit,
    nickScore, damsireOf, marketEstimate, roiOutlook, conformationScore, CONF_ITEMS,
    aptitudeIndex, femaleFamily, dosageOf };
})();
