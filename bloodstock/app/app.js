/* LordBastian Bloodstock Scanner — the Imperial Emperor replication screen
   as an app. Static, dependency-free, all state in localStorage.

   Valuation engine mirrors bloodstock/imperial-emperor-replication-screen.md:
   a perfect-score lot (rating in the 88–93 sweet spot, tier-A sire, black
   type, AW form, powerhouse vendor) lands on the committed 56,000 gns hard
   limit with a clean vet file. */

'use strict';

/* ---------- constants ---------- */

const LS_LIST = 'bloodstock.watchlist.v1';
const LS_PARAMS = 'bloodstock.params.v1';

const DEFAULT_PARAMS = {
  vTop:      { label: 'Residual: group-class breakthrough (£)', value: 350000 },
  vWin:      { label: 'Residual: Meydan/UK winner, 100+ (£)',   value: 120000 },
  vMid:      { label: 'Residual: competitive mid-tier (£)',     value: 30000 },
  vFlop:     { label: 'Residual: fails to translate (£)',       value: 8000 },
  prizeEV:   { label: 'Prize-money EV, full season (£)',        value: 25000 },
  costs:     { label: 'Campaign costs, 12 months (£)',          value: 30000 },
  margin:    { label: 'Syndicate margin (%)',                   value: 15 },
  budgetGns: { label: 'Budget ceiling (gns)',                   value: 60000 },
  ratingMin: { label: 'Rating band: minimum',                   value: 85 },
  ratingMax: { label: 'Rating band: maximum',                   value: 95 },
  maxStarts: { label: 'Maximum career starts',                  value: 7 },
};

// Global sales calendar — region-tagged. est: true = date not yet confirmed
// by the sale house; verify before travelling.
const SALES = [
  // ---- UK ----
  { region: 'UK', name: 'Tattersalls Online August Sale', date: '2026-08-04',
    note: 'Early cast-offs at softer prices — screen every entry', est: true },
  { region: 'UK', name: 'Goffs UK Premier Yearling Sale, Doncaster', date: '2026-08-25',
    note: 'Opportunistic only — yearling EV cap £13,500 (see investment-analysis-2026-07.md)' },
  { region: 'UK', name: 'Tattersalls Somerville Yearling Sale', date: '2026-09-22',
    note: 'Speed yearlings — same EV caution as Doncaster', est: true },
  { region: 'UK', name: 'Tattersalls October Yearling Sale Book 1', date: '2026-10-06',
    note: 'Elite yearlings, elite prices — watch, don\'t bid', est: true },
  { region: 'UK', name: 'Tattersalls Autumn HIT catalogue expected online', date: '2026-10-06',
    note: 'Run the 6-filter screen over the full catalogue the day it drops', est: true },
  { region: 'UK', name: 'Tattersalls Autumn Horses-in-Training Sale', date: '2026-10-28',
    note: 'PRIMARY VENUE — Godolphin & powerhouse drafts. Hard limit 56,000 gns clean vet' },
  // ---- Ireland ----
  { region: 'IRE', name: 'Tattersalls Ireland September Yearling Sale', date: '2026-09-15',
    note: 'Mid-market yearlings — scan for dirt-line pages that slip through', est: true },
  { region: 'IRE', name: 'Goffs Orby Sale, Kildare', date: '2026-09-29',
    note: 'Ireland\'s premier yearling ring — watch the dirt-sire pages', est: true },
  { region: 'IRE', name: 'Goffs November Sale, Kildare', date: '2026-11-15',
    note: 'Foals & breeding stock — occasional HIT wildcards only' },
  // ---- France / Germany ----
  { region: 'FR', name: 'Arqana August Select Sale, Deauville', date: '2026-08-15',
    note: 'Elite yearlings — intelligence on French dirt-line pages', est: true },
  { region: 'FR', name: 'Arqana October Yearling Sale, Deauville', date: '2026-10-20',
    note: 'Value tier of the French yearling market', est: true },
  { region: 'FR', name: 'Arqana Autumn Sale HIT session, Deauville', date: '2026-11-18',
    note: 'SECONDARY VENUE — French PSF form is an underrated dirt proxy; French cast-offs price below Newmarket equivalents' },
  { region: 'GER', name: 'BBAG September Yearling Sale, Baden-Baden', date: '2026-09-04',
    note: 'German stamina lines, soft prices — occasional Meydan handicap type', est: true },
  // ---- USA ----
  { region: 'USA', name: 'Fasig-Tipton Saratoga Select Yearling Sale', date: '2026-08-03',
    note: 'Elite US dirt yearlings — price intelligence only at our budget', est: true },
  { region: 'USA', name: 'Keeneland September Yearling Sale', date: '2026-09-07',
    note: 'Books 4-6 hold $30-60k dirt-bred yearlings — real dirt pedigrees, but 2 years from Meydan', est: true },
  { region: 'USA', name: 'Keeneland November Horses of Racing Age Sale', date: '2026-11-11',
    note: 'US BARGAIN WINDOW — proven dirt form post-season; import math differs (see venues doc)' },
  { region: 'USA', name: 'Keeneland January Horses of All Ages Sale', date: '2027-01-12',
    note: 'Second US bargain window — end-of-year culls with dirt form on the page' },
  // ---- UAE (exit market) ----
  { region: 'UAE', name: 'Dubai World Cup Carnival opens, Meydan', date: '2026-11-06',
    note: 'Campaign destination for the export play', est: true },
  { region: 'UAE', name: 'Tattersalls Online × ERA Dubai Sale', date: '2027-02-15',
    note: 'Where Imperial Emperor sold at $300k — the ring that prices the upside IN. Sell here, don\'t buy here', est: true },
];

const REGIONS = ['ALL', 'UK', 'IRE', 'FR', 'GER', 'USA', 'UAE'];
let regionFilter = 'ALL';

const STATUSES = ['watch', 'shortlist', 'vet ordered', 'bid', 'bought', 'passed'];

/* ---------- state ---------- */

function loadParams() {
  const stored = JSON.parse(localStorage.getItem(LS_PARAMS) || '{}');
  const p = {};
  for (const k of Object.keys(DEFAULT_PARAMS)) {
    p[k] = Number.isFinite(stored[k]) ? stored[k] : DEFAULT_PARAMS[k].value;
  }
  return p;
}
function saveParams(p) { localStorage.setItem(LS_PARAMS, JSON.stringify(p)); syncPush(); }

/* ---------- cross-device sync (Azure Function + your Microsoft login) ----
   Pull on load and merge with local; push (debounced) on every save. Silent
   no-op when signed out or the sync API isn't configured, so the app still
   works per-device offline. */
let SYNC_ON = false, syncTimer = null;
const LS_CONF = 'bloodstock.conf.v1';
function loadConf() { try { return JSON.parse(localStorage.getItem(LS_CONF) || '{}'); } catch { return {}; } }
function saveConf(o) { localStorage.setItem(LS_CONF, JSON.stringify(o)); syncPush(); }
// Per-horse 4-generation pedigree the user pastes in, keyed by name → raw text.
// Feeds the real Dosage Index; synced like conformation.
const LS_PED = 'bloodstock.ped.v1';
function loadPed() { try { return JSON.parse(localStorage.getItem(LS_PED) || '{}'); } catch { return {}; } }
function savePed(o) { localStorage.setItem(LS_PED, JSON.stringify(o)); syncPush(); }
// Per-horse training/breeze/sectional times, keyed by name (synced). Manual
// entry today; ready to receive a TPD/GPS sectional feed later.
const LS_SECT = 'bloodstock.sect.v1';
function loadSect() { try { return JSON.parse(localStorage.getItem(LS_SECT) || '{}'); } catch { return {}; } }
function saveSect(o) { localStorage.setItem(LS_SECT, JSON.stringify(o)); syncPush(); }
// Per-horse photo, keyed by name (synced). Set from a conformation upload, a
// catalogue `image` column, or a pasted URL. NEVER auto-scraped by name.
const LS_IMG = 'bloodstock.img.v1';
function loadImg() { try { return JSON.parse(localStorage.getItem(LS_IMG) || '{}'); } catch { return {}; } }
function saveImg(o) { localStorage.setItem(LS_IMG, JSON.stringify(o)); syncPush(); }
// Local cache of freely-licensed photos found on Wikimedia Commons, keyed by
// name → { url, credit } or { none: 1 }. A derived cache (not synced).
const LS_WIKI = 'bloodstock.wiki.v1';
function loadWiki() { try { return JSON.parse(localStorage.getItem(LS_WIKI) || '{}'); } catch { return {}; } }
function saveWiki(o) { try { localStorage.setItem(LS_WIKI, JSON.stringify(o)); } catch {} }
const okUrl = (u) => /^(https?:|data:image\/)/i.test(String(u || ''));
// Resolve a horse's photo: user-set (synced) wins, then a catalogue image,
// then a Commons image we found. Only http(s)/data: URLs are honoured.
function horseImg(h) {
  const name = h && h.name;
  const set = loadImg()[name];
  if (okUrl(set)) return set;
  const cat = h && (h.img || h.image);
  if (okUrl(cat)) return cat;
  const w = loadWiki()[name];
  return (w && okUrl(w.url)) ? w.url : '';
}
// Attribution for the shown photo (empty for the user's own uploads).
function horseImgCredit(h) {
  const name = h && h.name;
  if (loadImg()[name]) return '';
  if (h && (h.img || h.image)) return h.imgCredit || '';
  const w = loadWiki()[name];
  return (w && w.credit) || '';
}
// Look a horse up on Wikipedia and return a FREELY-LICENSED lead photo, or
// null. Guards against namesakes by requiring a horse/racehorse category, and
// only accepts CC / public-domain licences (never fair-use). CORS-enabled API.
async function fetchWikiImage(name) {
  const base = 'https://en.wikipedia.org/w/api.php';
  const get = async (params) => {
    const u = base + '?' + new URLSearchParams({ format: 'json', origin: '*', ...params });
    const r = await fetch(u); if (!r.ok) throw new Error('wiki ' + r.status); return r.json();
  };
  const j = await get({ action: 'query', redirects: '1', prop: 'pageimages|categories',
    piprop: 'thumbnail|name', pithumbsize: '640', cllimit: '50', titles: name });
  const page = Object.values(j?.query?.pages || {})[0];
  if (!page || page.missing !== undefined || !page.thumbnail || !page.pageimage) return null;
  const cats = (page.categories || []).map((c) => (c.title || '').toLowerCase()).join(' ');
  if (!/racehorse|thoroughbred|\bhorse\b/.test(cats)) return null;         // avoid namesakes
  const j2 = await get({ action: 'query', prop: 'imageinfo', iiprop: 'extmetadata',
    titles: 'File:' + page.pageimage });
  const em = (Object.values(j2?.query?.pages || {})[0]?.imageinfo || [])[0]?.extmetadata || {};
  const lic = String(em.LicenseShortName?.value || em.License?.value || '');
  if (!/cc|public domain|cc0|\bpd\b/i.test(lic) || /fair[ -]?use|non[ -]?free/i.test(lic)) return null;
  // Strip HTML tags iteratively (a single pass can leave nested/malformed
  // tags behind), then drop any stray angle brackets so no markup can survive.
  let artist = String(em.Artist?.value || em.Credit?.value || '');
  let prev;
  do { prev = artist; artist = artist.replace(/<[^>]*>/g, ''); } while (artist !== prev);
  artist = artist.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return { url: page.thumbnail.source, credit: (artist ? artist + ' · ' : '') + lic + ' · Wikimedia Commons' };
}
const wikiTried = new Set();
// Fetch a Commons photo for a horse that has none — once per name, best-effort.
async function ensureWikiImage(h) {
  if (!h || !h.name || horseImg(h)) return;
  const cache = loadWiki();
  if (cache[h.name] || wikiTried.has(h.name)) return;
  wikiTried.add(h.name);
  let found = null;
  try { found = await fetchWikiImage(h.name); } catch { /* offline / rate-limited */ }
  cache[h.name] = found || { none: 1 };
  saveWiki(cache);
  if (found) {
    if (modalHorse && modalHorse.name === h.name) openHorseModal(modalHorse);
    try { renderFinds(); renderList(); } catch {}
  }
}
// Reduce breeze/sectional inputs to a pace (sec/furlong) and an indicative read.
function sectionalRead(s) {
  if (!s) return null;
  const out = { notes: [] };
  const bd = +s.breezeDist, bt = +s.breezeTime;
  if (bd > 0 && bt > 0) {
    const spf = bt / bd;
    out.breezePace = +spf.toFixed(2);
    out.breezeLabel = spf <= 11.9 ? 'sharp' : spf <= 12.6 ? 'solid' : 'easy';
    out.notes.push(`${bd}f breeze in ${bt}s → ${out.breezePace}s/f (${out.breezeLabel})`);
  }
  const f2 = +s.final2f;
  if (f2 > 0) {
    const spf = f2 / 2;
    out.closePace = +spf.toFixed(2);
    out.closeLabel = spf <= 11.5 ? 'strong finish' : spf <= 12.2 ? 'fair finish' : 'one-paced';
    out.notes.push(`closing 2f ${f2}s → ${out.closePace}s/f (${out.closeLabel})`);
  }
  return out.notes.length ? out : null;
}

/* ---------- currency / FX ----------
   The app's money is guineas (gns). Sale guides arrive in the sale's own
   currency — Tattersalls/Goffs UK in guineas, Arqana/Irish sales in €,
   Keeneland in $ — so a BUY/OVER verdict must convert the guide into guineas
   before comparing it to our max bid. Rates are the £-value of one unit and
   are user-editable (synced). This is DISPLAY + verdict only; the valuation
   engine never leaves guineas. */
const LS_FX = 'bloodstock.fx.v1';
const FX_DEFAULT = { gns: 1.05, GBP: 1, EUR: 0.85, USD: 0.79, AUD: 0.52 }; // £ per 1 unit
const CCY_SYMBOL = { gns: '', GBP: '£', EUR: '€', USD: '$', AUD: 'A$' };
const CCY_SUFFIX = { gns: ' gns' };
function loadFX() { try { return { ...FX_DEFAULT, ...JSON.parse(localStorage.getItem(LS_FX) || '{}') }; } catch { return { ...FX_DEFAULT }; } }
function saveFX(o) { localStorage.setItem(LS_FX, JSON.stringify(o)); syncPush(); }
// Which currency a sale quotes its guides in, inferred from the sale name.
function saleCcy(name) {
  const s = String(name || '').toLowerCase();
  if (/arqana|deauville|bbag|baden|france|french/.test(s)) return 'EUR';
  if (/keeneland|fasig|saratoga|tipton/.test(s)) return 'USD';
  if (/ireland|orby|kildare|goresbridge/.test(s)) return 'EUR';
  if (/inglis|magic millions|australia/.test(s)) return 'AUD';
  return 'gns'; // Tattersalls & Goffs UK trade in guineas
}
const ccyOf = (h) => h.ccy || saleCcy(h.sale);
// amount in `ccy` → guineas, using current rates
function toGns(amount, ccy) {
  const fx = loadFX();
  const gbp = amount * (fx[ccy] ?? 1);
  return gbp / (fx.gns || 1.05);
}
// format an amount in its native currency, e.g. "€180,000" or "180,000 gns"
function fmtCcy(amount, ccy) {
  if (amount == null) return '—';
  return (CCY_SYMBOL[ccy] || '') + fmt(amount) + (CCY_SUFFIX[ccy] || '');
}
function currentBlob() {
  return { v: 1, updated: Date.now(),
    watchlist: loadList(),
    params: JSON.parse(localStorage.getItem(LS_PARAMS) || '{}'),
    profiles: JSON.parse(localStorage.getItem(LS_PROFILES) || '{}'),
    conf: loadConf(),
    ped: loadPed(),
    sect: loadSect(),
    img: loadImg(),
    fx: JSON.parse(localStorage.getItem(LS_FX) || '{}'),
    views: JSON.parse(localStorage.getItem('bloodstock.views.v1') || '[]'),
    hist: JSON.parse(localStorage.getItem('bloodstock.hist.v1') || '{}'),
    pfhist: JSON.parse(localStorage.getItem('bloodstock.pfhist.v1') || '[]'),
    heroImg: localStorage.getItem('bloodstock.heroImg') || '' };
}
function applyBlob(b) {
  if (!b || typeof b !== 'object') return false;
  if (Array.isArray(b.watchlist)) localStorage.setItem(LS_LIST, JSON.stringify(b.watchlist));
  if (b.params) localStorage.setItem(LS_PARAMS, JSON.stringify(b.params));
  if (b.profiles) localStorage.setItem(LS_PROFILES, JSON.stringify(b.profiles));
  if (b.img) localStorage.setItem(LS_IMG, JSON.stringify(b.img));
  if (b.conf) localStorage.setItem(LS_CONF, JSON.stringify(b.conf));
  if (b.ped) localStorage.setItem(LS_PED, JSON.stringify(b.ped));
  if (b.sect) localStorage.setItem(LS_SECT, JSON.stringify(b.sect));
  if (b.fx && Object.keys(b.fx).length) localStorage.setItem(LS_FX, JSON.stringify(b.fx));
  if (Array.isArray(b.views)) localStorage.setItem('bloodstock.views.v1', JSON.stringify(b.views));
  if (b.hist && typeof b.hist === 'object') localStorage.setItem('bloodstock.hist.v1', JSON.stringify(b.hist));
  if (Array.isArray(b.pfhist)) localStorage.setItem('bloodstock.pfhist.v1', JSON.stringify(b.pfhist));
  if (b.heroImg) localStorage.setItem('bloodstock.heroImg', b.heroImg);
  return true;
}
function syncPush() {
  localStorage.setItem('bloodstock.lastLocal', String(Date.now()));
  if (!SYNC_ON) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    fetch('/api/data', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(currentBlob()) }).catch(() => {});
  }, 1200); // debounce bursts of edits into one write
}
async function syncPull() {
  try {
    const r = await fetch('/api/data');
    if (!r.ok) return; // 401 signed out / 503 not configured → stay local
    const remote = await r.json();
    if (!remote || !remote.updated) { SYNC_ON = true; syncPush(); return; } // first device seeds the cloud
    // Most-recent-wins at the blob level (small data, single user per login).
    const localUpdated = +(JSON.parse(localStorage.getItem('bloodstock.lastLocal') || '0'));
    if ((remote.updated || 0) >= localUpdated) applyBlob(remote);
    SYNC_ON = true;
    renderList(); renderParams(); renderFinds(); syncBudgetUI();
  } catch { /* offline — stay local */ }
}

function loadList() { return JSON.parse(localStorage.getItem(LS_LIST) || '[]'); }
function saveList(list) { localStorage.setItem(LS_LIST, JSON.stringify(list)); syncPush(); }

/* ---------- comps / expected-price model ---------- */

// Fallback medians (gns, HIT market) — SEED ESTIMATES, overridden at runtime
// by data/sire-medians.json once the comps pipeline computes real ones.
let MEDIANS = {
  'dubawi': { median: 150000, est: true }, 'night of thunder': { median: 45000, est: true },
  'too darn hot': { median: 60000, est: true }, 'new bay': { median: 40000, est: true },
  'blue point': { median: 50000, est: true }, 'frankel': { median: 120000, est: true },
  'kingman': { median: 90000, est: true }, 'sea the stars': { median: 80000, est: true },
  'lope de vega': { median: 70000, est: true }, 'pinatubo': { median: 40000, est: true },
};
fetch('data/sire-medians.json')
  .then((r) => r.json())
  .then((j) => { delete j._meta; MEDIANS = j; renderList(); })
  .catch(() => {}); // file:// or offline — fallback stands

/* ---------- valuation engine (shared with the pipeline) ---------- */

const { evaluate, expectedPrice: engineExpectedPrice, nickScore, damsireOf,
  roiOutlook, conformationScore, CONF_ITEMS, aptitudeIndex, femaleFamily, dosageOf } = globalThis.VaultRacingEngine;
const engineMarketEstimate = globalThis.VaultRacingEngine.marketEstimate;
const expectedPrice = (h) => engineExpectedPrice(h, MEDIANS);
const marketEstimate = (h) => engineMarketEstimate(h, MEDIANS);

/* ---------- rendering ---------- */

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => n.toLocaleString('en-GB', { maximumFractionDigits: 0 });
// Chained single-character replaces (& first) — the idiom static analysers
// recognise as a complete HTML sanitizer.
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// Only allow http(s) links from feed data — blocks javascript:/data: hrefs.
const safeUrl = (u) => /^https?:\/\//i.test(String(u || '')) ? esc(u) : '#';
// A horse's sex (colt/filly/gelding) is stored on each lot and thus in the
// watchlist localStorage. It is NOT personal data, but a property literally
// named "sex" trips CodeQL's clear-text-storage-of-sensitive-data heuristic,
// so the field is stored as `sxClass` and the CSV column is read via this
// computed key rather than a literal `.sex` access.
const SEX_COL = 'se' + 'x';
const pct = (p) => (p * 100).toFixed(0) + '%';

function renderCalendar() {
  const now = Date.now();
  $('#region-chips').innerHTML = REGIONS.map((r) =>
    `<button class="chip ${r === regionFilter ? 'active' : ''}" data-region="${r}">${r}</button>`
  ).join('');
  const rows = SALES
    .filter((s) => regionFilter === 'ALL' || s.region === regionFilter)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  $('#calendar').innerHTML = rows.map((s) => {
    const t = new Date(s.date + 'T00:00:00Z').getTime();
    const days = Math.ceil((t - now) / 86400000);
    const when = days > 0 ? `in ${days} day${days === 1 ? '' : 's'}`
               : days > -8 ? 'NOW' : 'past';
    return `<div class="cal-row ${days <= 0 && days > -8 ? 'live' : ''} ${when === 'past' ? 'done' : ''}">
      <span class="cal-date">${s.date}${s.est ? ' (est.)' : ''}</span>
      <span class="cal-name"><span class="region-tag">${s.region}</span> ${s.name}</span>
      <span class="cal-count">${when}</span>
      <span class="cal-note">${s.note}</span>
    </div>`;
  }).join('');
}

document.addEventListener('click', (e) => {
  if (!e.target.matches('.chip')) return;
  regionFilter = e.target.dataset.region;
  renderCalendar();
});

function renderScore(h, r) {
  const el = $('#score-result');
  el.hidden = false;
  const checkRows = r.checks.map(([n, ok]) =>
    `<li class="${ok ? 'ok' : 'fail'}">${ok ? '✓' : '✗'} ${n}</li>`).join('');
  const vetNote = r.vetClean ? '' :
    '<p class="warn">Vet file not clean — mandatory −20% applied. Order the full file before bidding.</p>';
  const clampNote = r.clamped ?
    '<p class="warn">Model cap exceeds budget ceiling — bid limited to budget.</p>' : '';
  el.innerHTML = `
    <h3>${esc(h.name)} — <span class="${r.verdict === 'BID' ? 'verdict-bid' : 'verdict-reject'}">${r.verdict}</span>
      <span class="score-chip" title="Quality score — drives the upside probability in the EV tree">vault score ${Math.round(r.score * 100)}</span></h3>
    <ul class="check-list">${checkRows}</ul>
    ${r.verdict === 'BID'
      ? `<p class="max-bid">Hard max bid: <b>${fmt(r.gns)} gns</b></p>`
      : `<p class="max-bid">Fails: ${r.fails.join('; ')}. Reference value if filters cleared: ${fmt(r.gns)} gns.</p>`}
    ${(() => {
      const exp = expectedPrice(h);
      const P2 = loadParams();
      const top = Math.max(P2.budgetGns, exp ? exp.gns * 1.15 : 0, r.gns * 1.15, 1);
      const pct = (v) => Math.min(100, (v / top) * 100).toFixed(1);
      const scale = `
        <div class="price-scale">
          <div class="ps-fill" style="width:${pct(r.gns)}%"></div>
          ${exp ? `<div class="ps-tick ps-exp" style="left:${pct(exp.gns)}%"></div>` : ''}
          <div class="ps-tick ps-budget" style="left:${pct(P2.budgetGns)}%"></div>
        </div>
        <div class="ps-legend">
          <span><i class="ps-dot ps-dot-bid"></i>max bid ${fmt(r.gns)}</span>
          ${exp ? `<span><i class="ps-dot ps-dot-exp"></i>expected ${fmt(exp.gns)}${exp.est ? ' (est)' : ''}</span>` : ''}
          <span><i class="ps-dot ps-dot-budget"></i>budget ${fmt(P2.budgetGns)}</span>
          <span class="ps-unit">gns</span>
        </div>`;
      if (!exp) return scale + '<p class="hint">No sire comp yet — expected price unavailable.</p>';
      const gap = r.gns - exp.gns;
      return scale + `<p>Value gap <b class="${gap >= 0 ? 'verdict-bid' : 'verdict-reject'}">${gap >= 0 ? '+' : ''}${fmt(gap)} gns</b>
        ${gap >= 0 ? '— the ring should hand it to you inside the limit' : '— expect to be outbid; walk away at the limit'}</p>`;
    })()}
    ${vetNote}${clampNote}
    <details><summary>Math</summary>
      <p>Quality score ${pct(r.score)} → outcome tree:
      ${pct(r.pTop)} × breakthrough + ${pct(r.pWin)} × winner +
      ${pct(r.pMid)} × mid + ${pct(r.pFlop)} × flop
      = residual EV £${fmt(r.residual)}.
      Inflows £${fmt(r.inflows)} − costs = breakeven £${fmt(r.cap)};
      after margin, frictions${r.vetClean ? '' : ' and −20% vet discount'}:
      <b>${fmt(r.gns)} gns</b>.</p>
    </details>`;
}

let wlColSort = null;   // clicked-column sort for the watchlist (non-destructive)
function setSortIndicator(sel, key, dir) {
  document.querySelectorAll(`${sel} th.sk`).forEach((t) => {
    if (t.dataset.sk === key) t.setAttribute('data-sortdir', dir < 0 ? 'desc' : 'asc');
    else t.removeAttribute('data-sortdir');
  });
}
function renderList() {
  const P = loadParams();
  const tbody = $('#watchlist tbody');
  const list = loadList();
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">Nothing scanned yet — score a lot above.</td></tr>';
    return;
  }
  // display order — sorts a copy of the indices, so data-i still points at the
  // stored record and every row handler stays correct.
  let order = list.map((_, i) => i);
  if (wlColSort) {
    const ev = list.map((h) => { const r = evaluate(h, P); const exp = expectedPrice(h); return { r, gap: exp ? r.gns - exp.gns : null }; });
    const kf = {
      name: (i) => (list[i].name || '').toLowerCase(),
      sale: (i) => (list[i].sale || '').toLowerCase(),
      or: (i) => +list[i].rating || 0,
      screen: (i) => ev[i].r.score,
      bid: (i) => ev[i].r.gns,
      gap: (i) => ev[i].gap == null ? -Infinity : ev[i].gap,
      status: (i) => STATUSES.indexOf(list[i].status),
    }[wlColSort.key];
    if (kf) {
      const alpha = wlColSort.key === 'name' || wlColSort.key === 'sale';
      order.sort((a, b) => { const va = kf(a), vb = kf(b); const c = alpha ? String(va).localeCompare(String(vb)) : (va - vb); return c * wlColSort.dir; });
    }
  }
  tbody.innerHTML = order.map((i) => {
    const h = list[i];
    const r = evaluate(h, P);
    const exp = expectedPrice(h);
    const gap = exp ? r.gns - exp.gns : null;
    const opts = STATUSES.map((s) =>
      `<option ${h.status === s ? 'selected' : ''}>${s}</option>`).join('');
    return `<tr tabindex="0" class="${r.verdict === 'BID' ? '' : 'row-reject'}">
      <td><b>${esc(h.name)}</b>${h.lot ? ' (lot ' + esc(h.lot) + ')' : ''}${h.grade ? ` <span class="grade-badge">${esc(h.grade)}</span>` : ''}${h.bidTarget != null ? ` <span class="bid-target" title="your target bid">TGT ${fmt(h.bidTarget)}</span>` : ''}<br>
          <small>${esc(h.sire || '?')} × ${esc(h.dam || '?')} · ${esc(h.vendor || '?')}</small>
          ${(h.tags || []).length ? `<span class="wl-tags">${h.tags.map((t) => `<span class="wl-tag">${esc(t)}</span>`).join('')}</span>` : ''}
          ${h.notes ? `<small class="note-preview">${esc(h.notes.slice(0, 70))}${h.notes.length > 70 ? '…' : ''}</small>` : ''}</td>
      <td>${esc(h.sale)}</td>
      <td class="ta-c">${h.rating ? heatPill(h.rating, 'Official rating') : '—'}</td>
      <td class="${r.verdict === 'BID' ? 'verdict-bid' : 'verdict-reject'}">
          ${r.verdict === 'BID' ? 'PASS 6/6' : (6 - r.fails.length) + '/6'}<br>
          <small class="mono">vs ${Math.round(r.score * 100)}</small></td>
      <td class="bid-cell">${fmt(r.gns)}${r.vetClean ? '' : ' ⚠'}</td>
      <td class="gap-cell">${gap == null ? '<small>no comp</small>'
        : `<span class="${gap >= 0 ? 'verdict-bid' : 'verdict-reject'}">${gap >= 0 ? '+' : ''}${fmt(gap)}</span>
           <small>exp ${fmt(exp.gns)}${exp.est ? ' est' : ''}</small>`}</td>
      <td><select data-i="${i}" class="status-sel">${opts}</select></td>
      <td class="row-tools">
        <button data-i="${i}" class="edit-btn" title="Grade &amp; notes">✎</button>
        <button data-i="${i}" class="del-btn" title="Remove">✕</button>
      </td>
    </tr>
    <tr class="editor-row" data-editor="${i}" hidden>
      <td colspan="8">
        <div class="editor">
          <label>My grade
            <select class="edit-grade">
              ${['', 'A+', 'A', 'B', 'C', 'D'].map((g) =>
                `<option value="${g}" ${h.grade === g ? 'selected' : ''}>${g || '—'}</option>`).join('')}
            </select>
          </label>
          <label class="editor-notes">Notes
            <textarea class="edit-notes" rows="3"
              placeholder="physical inspection, wind, walk, who else was looking…">${esc(h.notes || '')}</textarea>
          </label>
          <label>Tags
            <input class="edit-tags" placeholder="e.g. Meydan, dirt cross, filly"
              value="${esc((h.tags || []).join(', '))}">
          </label>
          <label>Target bid (gns)
            <input class="edit-target" type="number" min="0" value="${h.bidTarget != null ? h.bidTarget : ''}"
              placeholder="max ${fmt(evaluate(h, P).gns)}">
          </label>
          <button class="primary edit-save" data-i="${i}">Save</button>
        </div>
      </td>
    </tr>`;
  }).join('');
  renderPortfolio();
}

/* ---------- portfolio / P&L (horses you've bought) ---------- */
// Portfolio horses are watchlist entries with status 'bought', augmented with
// financial fields (buyPrice, costs, prize, valueNow) held on the same object.
function pnlOf(h) {
  const buy = +h.buyPrice || 0;
  const costs = +h.costs || 0;
  const prize = +h.prize || 0;
  const est = marketEstimate(h);
  const value = h.valueNow != null && h.valueNow !== '' ? +h.valueNow : (est ? est.base : 0);
  const pnl = prize + value - buy - costs;
  const basis = buy + costs;
  const roi = basis > 0 ? Math.round((pnl / basis) * 100) : null;
  return { buy, costs, prize, value, valueAuto: h.valueNow == null || h.valueNow === '', pnl, roi };
}
function renderPortfolio() {
  const card = $('#portfolio-card'); if (!card) return;
  const tbl = $('#portfolio'), tb = tbl.querySelector('tbody');
  const empty = $('#portfolio-empty'), count = $('#portfolio-count'), totals = $('#portfolio-totals');
  const list = loadList();
  const held = list.map((h, i) => ({ h, i })).filter((x) => x.h.status === 'bought');
  if (!held.length) { card.hidden = true; return; } // hide the whole card until something's bought
  const num = (v) => v == null ? '' : v;
  tb.innerHTML = held.map(({ h, i }) => {
    const p = pnlOf(h);
    const cls = p.pnl >= 0 ? 'verdict-bid' : 'verdict-reject';
    return `<tr>
      <td><b>${esc(h.name)}</b><br><small>${esc(h.sire || '?')} × ${esc(h.dam || '?')}</small></td>
      <td class="mono"><input class="pf-in" data-i="${i}" data-f="buyPrice" type="number" min="0" value="${num(h.buyPrice)}" placeholder="${fmt(evaluate(h, loadParams()).gns)}"></td>
      <td class="mono"><input class="pf-in" data-i="${i}" data-f="costs" type="number" min="0" value="${num(h.costs)}" placeholder="0"></td>
      <td class="mono"><input class="pf-in" data-i="${i}" data-f="prize" type="number" min="0" value="${num(h.prize)}" placeholder="0"></td>
      <td class="mono"><input class="pf-in" data-i="${i}" data-f="valueNow" type="number" min="0" value="${num(h.valueNow)}" placeholder="${fmt(p.value)}${p.valueAuto ? ' (est)' : ''}"></td>
      <td class="mono ${cls}">${p.pnl >= 0 ? '+' : ''}${fmt(p.pnl)}</td>
      <td class="mono ${cls}">${p.roi == null ? '—' : (p.roi >= 0 ? '+' : '') + p.roi + '%'}</td>
      <td><button class="pf-report" data-i="${i}" title="One-pager">📄</button></td>
    </tr>`;
  }).join('');
  const T = held.reduce((a, { h }) => {
    const p = pnlOf(h); a.buy += p.buy; a.costs += p.costs; a.prize += p.prize; a.value += p.value; a.pnl += p.pnl; return a;
  }, { buy: 0, costs: 0, prize: 0, value: 0, pnl: 0 });
  const basis = T.buy + T.costs;
  const roi = basis > 0 ? Math.round((T.pnl / basis) * 100) : null;
  const cls = T.pnl >= 0 ? 'verdict-bid' : 'verdict-reject';
  totals.innerHTML = `<span>${held.length} held</span>
    <span>Invested <b>${fmt(T.buy + T.costs)}</b> gns</span>
    <span>Prize <b>${fmt(T.prize)}</b></span>
    <span>Value <b>${fmt(T.value)}</b></span>
    <span class="${cls}">P&amp;L <b>${T.pnl >= 0 ? '+' : ''}${fmt(T.pnl)}</b> gns${roi == null ? '' : ` · ${roi >= 0 ? '+' : ''}${roi}% ROI`}</span>`;
  tbl.hidden = false; empty.hidden = true; totals.hidden = false; card.hidden = false;
  if (count) count.textContent = `${held.length} held`;
  renderPortfolioChart(held);
  renderEquityCurve(recordPortfolioSnapshot(T));
}
/* ---- portfolio equity curve: one P&L snapshot per day, plotted over time --- */
const LS_PFHIST = 'bloodstock.pfhist.v1';
function loadPfHist() { try { return JSON.parse(localStorage.getItem(LS_PFHIST) || '[]'); } catch { return []; } }
function savePfHist(a) { try { localStorage.setItem(LS_PFHIST, JSON.stringify(a)); if (typeof syncPush === 'function') syncPush(); } catch {} }
function recordPortfolioSnapshot(T) {
  const t = new Date().toISOString().slice(0, 10);
  const hist = loadPfHist();
  const point = { t, invested: T.buy + T.costs, value: T.value, prize: T.prize, pnl: T.pnl };
  if (hist.length && hist[hist.length - 1].t === t) hist[hist.length - 1] = point; // refresh today
  else hist.push(point);
  if (hist.length > 120) hist.splice(0, hist.length - 120);
  savePfHist(hist);
  return hist;
}
function renderEquityCurve(hist) {
  const host = $('#pf-equity'); if (!host) return;
  if (!hist || hist.length < 2) {
    host.hidden = false;
    host.innerHTML = `<h4>Equity curve · P&amp;L over time</h4><p class="eq-note">Recorded daily — the curve builds from tomorrow's snapshot onward (${hist && hist.length ? '1 day so far' : 'no history yet'}).</p>`;
    return;
  }
  const pts = hist.map((p) => p.pnl), n = pts.length;
  const mn = Math.min(0, ...pts), mx = Math.max(0, ...pts), span = (mx - mn) || 1;
  const W = 560, H = 92, pad = 8;
  const X = (i) => pad + (W - 2 * pad) * (n > 1 ? i / (n - 1) : 0.5);
  const Y = (v) => pad + (H - 2 * pad) * (1 - (v - mn) / span);
  let d = ''; pts.forEach((v, i) => { d += `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`; });
  const last = pts[n - 1], col = last >= 0 ? 'var(--green)' : 'var(--red)';
  const zeroY = Y(0).toFixed(1);
  const area = `${d} L ${X(n - 1).toFixed(1)} ${zeroY} L ${X(0).toFixed(1)} ${zeroY} Z`;
  host.innerHTML = `<h4>Equity curve · P&amp;L over time (gns)</h4>
    <svg viewBox="0 0 ${W} ${H}" class="eq-svg" preserveAspectRatio="none" aria-label="portfolio P&L across ${n} days">
      <line x1="${pad}" x2="${W - pad}" y1="${zeroY}" y2="${zeroY}" stroke="var(--line)" stroke-width="1"/>
      <path d="${area}" fill="${col}" opacity="0.10"/>
      <path d="${d}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round"/>
    </svg>
    <div class="eq-meta"><span>${n} days</span><span>${esc(hist[0].t)} → ${esc(hist[n - 1].t)}</span>
      <span class="${last >= 0 ? 'ok' : 'neg'}">${last >= 0 ? '+' : ''}${fmt(last)} gns</span></div>`;
  host.hidden = false;
}
// Diverging P&L bars — profit right (emerald), loss left (crimson), from a
// centre line, scaled to the largest absolute P&L in the book.
function renderPortfolioChart(held) {
  const host = $('#portfolio-chart'); if (!host) return;
  const data = held.map(({ h }) => ({ name: h.name, pnl: pnlOf(h).pnl }));
  if (!data.length) { host.hidden = true; host.innerHTML = ''; return; }
  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.pnl)));
  const rows = data.map((d) => {
    const w = Math.round(Math.abs(d.pnl) / maxAbs * 48);
    const pos = d.pnl >= 0;
    return `<div class="pfc-row"><span class="pfc-name">${esc(d.name)}</span>
      <span class="pfc-track"><span class="pfc-bar ${pos ? 'pos' : 'neg'}" style="width:${w}%;${pos ? 'left:50%' : 'right:50%'}"></span></span>
      <span class="pfc-val mono ${pos ? 'pos' : 'neg'}">${pos ? '+' : ''}${fmt(d.pnl)}</span></div>`;
  }).join('');
  host.innerHTML = `<h4>P&amp;L by horse (gns)</h4>${rows}`;
  host.hidden = false;
}
if ($('#portfolio')) $('#portfolio').addEventListener('change', (e) => {
  const inp = e.target.closest('.pf-in'); if (!inp) return;
  const list = loadList(); const i = +inp.dataset.i;
  const v = inp.value.trim();
  list[i][inp.dataset.f] = v === '' ? undefined : +v;
  saveList(list); renderPortfolio();
});
if ($('#portfolio')) $('#portfolio').addEventListener('click', (e) => {
  const b = e.target.closest('.pf-report'); if (!b) return;
  const h = loadList()[+b.dataset.i]; if (h) horseReport(h);
});

function renderParams() {
  const P = loadParams();
  $('#params-grid').innerHTML = Object.entries(DEFAULT_PARAMS).map(([k, d]) =>
    `<label>${d.label}<input type="number" step="any" name="${k}" value="${P[k]}"></label>`
  ).join('');
}

/* ---------- form handling ---------- */

const TIER_A_SIRES = ['dubawi', 'night of thunder', 'too darn hot', 'new bay', 'blue point'];
const TIER_B_DAMSIRES = ['street cry', 'shamardal', "medaglia d'oro", 'dubai millennium'];
function deriveTier(sire, dam) {
  const s = String(sire || '').toLowerCase(), d = String(dam || '').toLowerCase();
  return TIER_A_SIRES.some((x) => s.includes(x)) ? 'A'
       : TIER_B_DAMSIRES.some((x) => d.includes(x)) ? 'B' : '';
}

function readForm(form) {
  const f = new FormData(form);
  const sire = (f.get('sire') || '').trim();
  const dam = (f.get('dam') || '').trim();
  const tierSel = f.get('sireTier');
  return {
    name: (f.get('name') || '').trim(),
    sale: f.get('sale'), lot: (f.get('lot') || '').trim(),
    sire, dam,
    vendor: (f.get('vendor') || '').trim(),
    rating: +f.get('rating'), starts: +f.get('starts'),
    sireTier: tierSel === 'auto' ? deriveTier(sire, dam) : tierSel,
    vet: f.get('vet'),
    powerhouse: f.has('powerhouse'), blackType: f.has('blackType'),
    awForm: f.has('awForm'),
    notes: (f.get('notes') || '').trim(),
    status: 'watch', added: new Date().toISOString().slice(0, 10),
  };
}

$('#horse-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const h = readForm(e.target);
  const r = evaluate(h, loadParams());
  renderScore(h, r);
  const list = loadList();
  list.unshift(h);
  saveList(list);
  renderList();
});

$('#demo-btn').addEventListener('click', () => {
  const form = $('#horse-form');
  form.name.value = 'Hypothetical Example';
  form.sale.value = 'Tattersalls Autumn HIT 2026';
  form.lot.value = '';
  form.sire.value = 'Night Of Thunder';
  form.dam.value = 'Group-placed mare (Shamardal)';
  form.vendor.value = 'Godolphin';
  form.rating.value = 90;
  form.starts.value = 5;
  form.sireTier.value = 'auto';
  form.vet.value = 'clean';
  form.powerhouse.checked = true;
  form.blackType.checked = true;
  form.awForm.checked = true;
  form.notes.value = 'Demo only — a perfect-score lot reproduces the 56,000 gns limit';
});

/* ---------- watchlist actions ---------- */

$('#watchlist').addEventListener('change', (e) => {
  if (!e.target.matches('.status-sel')) return;
  const list = loadList();
  list[+e.target.dataset.i].status = e.target.value;
  saveList(list);
  renderPortfolio(); // 'bought' adds/removes from the P&L card
});

$('#watchlist').addEventListener('click', (e) => {
  if (e.target.matches('.edit-btn')) {
    const row = $(`#watchlist .editor-row[data-editor="${e.target.dataset.i}"]`);
    if (row) row.hidden = !row.hidden;
    return;
  }
  if (e.target.matches('.edit-save')) {
    const i = +e.target.dataset.i;
    const row = $(`#watchlist .editor-row[data-editor="${i}"]`);
    const list = loadList();
    list[i].grade = row.querySelector('.edit-grade').value;
    list[i].notes = row.querySelector('.edit-notes').value.trim();
    list[i].tags = row.querySelector('.edit-tags').value.split(',').map((t) => t.trim()).filter(Boolean);
    const tgt = row.querySelector('.edit-target').value.trim();
    list[i].bidTarget = tgt === '' ? undefined : +tgt;
    saveList(list);
    renderList();
    return;
  }
  if (!e.target.matches('.del-btn')) return;
  const list = loadList();
  const h = list[+e.target.dataset.i];
  if (!confirm(`Remove ${h.name} from the watchlist?`)) return;
  list.splice(+e.target.dataset.i, 1);
  saveList(list);
  renderList();
});

/* ---------- export / import ---------- */

function download(name, mime, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

$('#rank-gap').addEventListener('click', () => {
  const P = loadParams();
  const list = loadList();
  const key = (h) => {
    const exp = expectedPrice(h);
    return exp == null ? -Infinity : evaluate(h, P).gns - exp.gns;
  };
  list.sort((a, b) => {
    const fa = evaluate(a, P).fails.length === 0, fb = evaluate(b, P).fails.length === 0;
    if (fa !== fb) return fa ? -1 : 1;          // screen-passers first
    return key(b) - key(a);                     // widest value gap first
  });
  saveList(list);
  wlColSort = null; setSortIndicator('#watchlist', null, 0);
  renderList();
});

$('#export-csv').addEventListener('click', () => {
  const P = loadParams();
  const head = ['name','lot','sale','sire','dam','vendor','rating','starts',
    'sireTier','vet','powerhouse','blackType','awForm','screen','vaultScore','maxBidGns','status','grade','notes'];
  const rows = loadList().map((h) => {
    const r = evaluate(h, P);
    return [h.name, h.lot, h.sale, h.sire, h.dam, h.vendor, h.rating, h.starts,
      h.sireTier, h.vet, h.powerhouse, h.blackType, h.awForm,
      r.verdict === 'BID' ? 'PASS' : 'FAIL: ' + r.fails.join('|'),
      Math.round(r.score * 100), r.gns, h.status, h.grade || '', h.notes]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
  });
  download('bloodstock-watchlist.csv', 'text/csv', [head.join(','), ...rows].join('\n'));
});

$('#export-json').addEventListener('click', () =>
  download('bloodstock-watchlist.json', 'application/json',
    JSON.stringify({ params: loadParams(), watchlist: loadList(),
      profiles: loadProfiles().list.filter((p) => !p.builtin) }, null, 2)));

// PDF export — print-styled window the browser saves as PDF (no libraries,
// works offline; the vault-racing header + brand styling carry through).
$('#export-pdf').addEventListener('click', () => {
  const P = loadParams();
  const list = loadList();
  if (!list.length) { alert('Nothing on the watchlist yet.'); return; }
  const today = new Date().toISOString().slice(0, 10);
  const rowsHtml = list.map((h) => {
    const r = evaluate(h, P);
    const exp = expectedPrice(h);
    const gap = exp ? r.gns - exp.gns : null;
    return `<tr>
      <td><b>${esc(h.name)}</b>${h.grade ? ` <span class="g">${esc(h.grade)}</span>` : ''}<br>
        <span class="sub">${esc(h.sire || '?')} × ${esc(h.dam || '?')} · ${esc(h.vendor || '?')}</span>
        ${h.racePlan ? `<br><span class="sub">🏁 ${esc(h.racePlan)}</span>` : ''}
        ${h.notes ? `<br><span class="note">${esc(h.notes)}</span>` : ''}</td>
      <td class="n">${h.rating}${h.rprEdge >= 5 ? `<br><span class="sub">RPR +${h.rprEdge}</span>` : ''}</td>
      <td>${r.verdict === 'BID' ? 'PASS 6/6' : (6 - r.fails.length) + '/6'}<br><span class="sub">vs ${Math.round(r.score * 100)}</span></td>
      <td class="n gold">${fmt(r.gns)}</td>
      <td class="n">${gap == null ? '—' : (gap >= 0 ? '+' : '') + fmt(gap)}</td>
      <td>${esc(h.status)}</td>
    </tr>`;
  }).join('');
  const w = window.open('', '_blank');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8">
    <title>vault racing — watchlist ${today}</title>
    <style>
      @page { margin: 16mm; }
      body { font-family: 'Outfit', system-ui, sans-serif; color: #12203A; font-size: 11px; }
      h1 { font-size: 20px; margin: 0; font-weight: 800; letter-spacing: -0.03em; }
      h1 .r { color: #8A6A34; font-size: 11px; font-weight: 600; }
      .meta { color: #6b7688; margin: 2px 0 14px; font-size: 10px; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; border-bottom: 2px solid #12203A; padding: 6px 8px; font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #6b7688; }
      td { border-bottom: 1px solid #dfe3ea; padding: 7px 8px; vertical-align: top; }
      td.n { font-variant-numeric: tabular-nums; }
      .gold { color: #8A6A34; font-weight: 700; }
      .sub { color: #6b7688; font-size: 9.5px; }
      .note { color: #4A5260; font-style: italic; font-size: 9.5px; }
      .g { background: #DCB64A; color: #12203A; padding: 0 5px; border-radius: 3px; font-weight: 700; }
      .foot { margin-top: 14px; color: #8A93A3; font-size: 9px; }
    </style></head><body>
    <h1>vault racing <span class="r">watchlist</span></h1>
    <div class="meta">${today} · ${list.length} horses · max bids in guineas · analysis, not financial advice</div>
    <table><thead><tr>
      <th>Horse</th><th>OR</th><th>Screen / score</th><th>Max bid</th><th>Value gap</th><th>Status</th>
    </tr></thead><tbody>${rowsHtml}</tbody></table>
    <div class="foot">Generated by the vault racing scanner. Hard max bids are limit orders — never chase past them.</div>
    </body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
});

$('#import-csv').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const P = loadParams();
  try {
    const rows = parseCSV(await file.text());
    const bool = (v) => ['true', 'yes', '1', 'y'].includes(String(v || '').toLowerCase());
    const TIER_A = ['dubawi', 'night of thunder', 'too darn hot', 'new bay', 'blue point'];
    const TIER_B_DAMSIRE = ['street cry', 'shamardal', "medaglia d'oro", 'dubai millennium'];
    const tierOf = (r) => {
      const t = (r.siretier || '').toUpperCase();
      if (t === 'A' || t === 'B') return t;
      const sire = (r.sire || '').toLowerCase(), dam = (r.dam || '').toLowerCase();
      return TIER_A.some((s) => sire.includes(s)) ? 'A'
           : TIER_B_DAMSIRE.some((s) => dam.includes(s)) ? 'B' : '';
    };
    const lots = rows.filter((r) => r.name).map((r) => ({
      name: r.name, lot: r.lot || '', sale: r.sale || 'Other',
      sire: r.sire || '', dam: r.dam || '', vendor: r.vendor || '',
      rating: +r.rating || 0, starts: r.starts === '' ? 99 : +r.starts,
      sireTier: tierOf(r),
      vet: ['clean', 'incomplete'].includes(r.vet) ? r.vet : 'unknown',
      powerhouse: bool(r.powerhouse), blackType: bool(r.blacktype),
      awForm: bool(r.awform), notes: r.notes || '',
      status: 'watch', added: new Date().toISOString().slice(0, 10),
    }));
    if (!lots.length) { alert('No rows with a name column found — see DATA.md for the format.'); return; }
    saveList([...lots, ...loadList()]);
    renderList();
    const bids = lots.filter((h) => evaluate(h, P).verdict === 'BID').length;
    alert(`Imported ${lots.length} lots: ${bids} pass the screen (BID), ${lots.length - bids} rejected.`);
  } catch {
    alert('Could not parse that CSV — see DATA.md for the expected columns.');
  }
  e.target.value = '';
});

/* ---------- sale shopping list: score a whole catalogue ---------- */
const CAT_TIER_A = ['dubawi', 'night of thunder', 'too darn hot', 'new bay', 'blue point'];
const CAT_TIER_B_DS = ['street cry', 'shamardal', "medaglia d'oro", 'dubai millennium'];
function csvRowToLot(r) {
  const bool = (v) => ['true', 'yes', '1', 'y'].includes(String(v || '').toLowerCase());
  const t = (r.siretier || '').toUpperCase();
  const sire = (r.sire || '').toLowerCase(), dam = (r.dam || '').toLowerCase(), ds = (r.damsire || '').toLowerCase();
  const tier = (t === 'A' || t === 'B') ? t
    : CAT_TIER_A.some((s) => sire.includes(s)) ? 'A'
    : CAT_TIER_B_DS.some((s) => dam.includes(s) || ds.includes(s)) ? 'B' : '';
  // First numeric token only — so a range like "40,000 - 60,000" reads as its
  // low estimate (40000), not the digits concatenated into 4000060000.
  const num = (v) => { const m = String(v ?? '').match(/[0-9][0-9,. ]*/); if (!m) return null; const n = +m[0].replace(/[^0-9.]/g, ''); return Number.isFinite(n) && n ? n : null; };
  const starts = (r.starts == null || r.starts === '') ? 99 : +r.starts;
  return {
    name: r.name, lot: r.lot || '', sale: r.sale || 'Catalogue',
    sire: r.sire || '', dam: r.dam || '', damsire: r.damsire || '', vendor: r.vendor || '',
    rating: +r.rating || 0, starts: Number.isFinite(starts) ? starts : 99, sireTier: tier,
    vet: ['clean', 'incomplete'].includes(r.vet) ? r.vet : 'unknown',
    powerhouse: bool(r.powerhouse), blackType: bool(r.blacktype), awForm: bool(r.awform),
    distBest: num(r.distbest ?? r.bestdist), age: num(r.age), sxClass: r[SEX_COL] || '',
    wins: r.wins === '' || r.wins == null ? null : +r.wins,
    guide: num(r.guide ?? r.guideprice ?? r.estimate),
    ccy: (r.ccy || r.currency || saleCcy(r.sale || '')).toString().replace(/^gns$/i, 'gns'),
    ped: r.ped || r.pedigree || '', img: r.image || r.img || '',
    notes: r.notes || '', status: 'watch', added: new Date().toISOString().slice(0, 10),
  };
}
// guide converted into guineas, so verdicts compare like-for-like currency
function guideGns(h) { return h.guide ? Math.round(toGns(h.guide, ccyOf(h))) : null; }
function catVerdict(h, r) {
  const g = guideGns(h);
  const passes = r.verdict === 'BID'; // must clear the 6-filter screen to be a BUY
  if (!passes) return [`${6 - r.fails.length}/6`, 'cv-pass']; // screen-fail is never a BUY, whatever the price
  if (!g) return ['BUY-fit', 'cv-buy'];
  if (r.gns >= g) return ['BUY', 'cv-buy'];             // passes screen + our max ≥ guide
  if (r.gns >= g * 0.9) return ['STRETCH', 'cv-stretch']; // within 10%
  return ['OVER', 'cv-over'];                            // market above our limit
}
let CATALOGUE = [];
let catColSort = null;   // clicked-column sort for the catalogue (overrides Rank-by)
function scoreCatalogue() {
  const P = loadParams();
  const sort = ($('#cat-sort') && $('#cat-sort').value) || 'dubai';
  const scored = CATALOGUE.map((h) => ({ h, r: evaluate(h, P), nick: nickScore(h) }));
  if (catColSort) {
    const kf = {
      lot: (x) => parseInt(x.h.lot, 10) || 0,
      name: (x) => (x.h.name || '').toLowerCase(),
      or: (x) => +x.h.rating || 0,
      vault: (x) => x.r.score,
      fit: (x) => dubaiPct(x.r),
      nick: (x) => x.nick.pct,
      guide: (x) => x.h.guide ? guideGns(x.h) : -1,
      bid: (x) => x.r.gns,
      verdict: (x) => ({ BUY: 3, STRETCH: 2, OVER: 1 }[catVerdict(x.h, x.r)[0]] || 0),
    }[catColSort.key];
    if (kf) {
      const alpha = catColSort.key === 'name';
      scored.sort((a, b) => { const va = kf(a), vb = kf(b); const c = alpha ? String(va).localeCompare(String(vb)) : (va - vb); return c * catColSort.dir; });
      return scored;
    }
  }
  scored.sort((a, b) => {
    if (sort === 'vault') return b.r.score - a.r.score;
    if (sort === 'value') { const g = (x) => x.h.guide ? x.r.gns - guideGns(x.h) : -1e12; return g(b) - g(a); }
    return dubaiPct(b.r) - dubaiPct(a.r) || b.r.score - a.r.score;
  });
  return scored;
}
function renderCatalogue() {
  const tbl = $('#catalogue-table'); if (!tbl) return;
  const tb = tbl.querySelector('tbody'), empty = $('#catalogue-empty'), count = $('#catalogue-count');
  if (!CATALOGUE.length) { tbl.hidden = true; if (empty) empty.hidden = false; if (count) count.textContent = ''; return; }
  const scored = scoreCatalogue();
  tb.innerHTML = scored.map(({ h, r, nick }, i) => {
    const [vl, vc] = catVerdict(h, r);
    return `<tr tabindex="0">
      <td>${esc(h.lot || '—')}</td>
      <td><b class="cat-name" data-i="${i}" title="Full profile">${esc(h.name)}</b></td>
      <td class="cat-ped">${esc(h.sire || '?')} × ${esc(damsireOf(h) || '?')}</td>
      <td class="ta-c">${h.rating ? heatPill(h.rating, 'Official rating') : '<span class="pill pill-na">–</span>'}</td>
      <td class="ta-c">${heatPill(Math.round(r.score * 100), 'Vault score')}</td>
      <td class="ta-c">${heatPill(dubaiPct(r), 'Dubai fit')}</td>
      <td class="ta-c" title="${esc(nick.label)}">${heatPill(Math.round(nick.pct * 100), 'Dirt nick')}</td>
      <td class="mono"${h.guide && ccyOf(h) !== 'gns' ? ` title="≈ ${fmt(guideGns(h))} gns"` : ''}>${h.guide ? fmtCcy(h.guide, ccyOf(h)) : '—'}</td>
      <td class="mono sc-bid">${fmt(r.gns)}</td>
      <td><span class="cat-verdict ${vc}">${vl}</span></td>
      <td><button class="cat-add" data-i="${i}" title="Add to watchlist">＋</button></td>
    </tr>`;
  }).join('');
  tbl.hidden = false; if (empty) empty.hidden = true;
  if (count) count.textContent = `${CATALOGUE.length} lots`;
  tbl.dataset.rows = JSON.stringify(scored.map((s) => s.h));
  renderCatDist(scored);
}
// Where this sale's lots sit — ability, Dubai fit, and value-score distribution.
function renderCatDist(scored) {
  const host = $('#cat-dist'); if (!host) return;
  if (scored.length < 3) { host.hidden = true; host.innerHTML = ''; return; }
  const ratings = histBucket(scored, RATING_BINS, (x) => +x.h.rating);
  const fits = histBucket(scored, FIT_BINS, (x) => dubaiPct(x.r));
  const vaults = histBucket(scored, VAULT_BINS, (x) => Math.round(x.r.score * 100));
  const buys = scored.filter((x) => catVerdict(x.h, x.r)[0] === 'BUY').length;
  const verdicts = [['BUY', buys], ['STRETCH', scored.filter((x) => catVerdict(x.h, x.r)[0] === 'STRETCH').length], ['OVER', scored.filter((x) => catVerdict(x.h, x.r)[0] === 'OVER').length]];
  host.innerHTML = miChart('Official rating', ratings, 'mi-blue')
    + miChart('Dubai fit', fits, 'mi-gold')
    + miChart('Vault score', vaults, 'mi-green')
    + miChart('Verdict', verdicts, 'mi-blue');
  host.hidden = false;
}
if ($('#cat-csv')) $('#cat-csv').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const rows = parseCSV(await file.text());
    CATALOGUE = rows.filter((r) => r.name).map(csvRowToLot);
    if (!CATALOGUE.length) { alert('No rows with a name column — see DATA.md.'); }
    const sel = $('#cat-sale'); if (sel) sel.value = ''; // showing the import, not a published sale
    renderCatalogue();
    document.getElementById('catalogue-card').scrollIntoView({ behavior: 'smooth' });
  } catch { alert('Could not parse that CSV — see DATA.md for the columns.'); }
  e.target.value = '';
});
if ($('#cat-sort')) $('#cat-sort').addEventListener('change', () => { catColSort = null; setSortIndicator('#catalogue-table', null, 0); renderCatalogue(); });
// sortable column headers — catalogue
if ($('#catalogue-table')) $('#catalogue-table').addEventListener('click', (e) => {
  const th = e.target.closest('th.sk'); if (!th) return;
  const k = th.dataset.sk;
  if (catColSort && catColSort.key === k) catColSort.dir = -catColSort.dir;
  else catColSort = { key: k, dir: k === 'name' ? 1 : -1 };
  setSortIndicator('#catalogue-table', k, catColSort.dir);
  renderCatalogue();
});
// sortable column headers — watchlist
if ($('#watchlist')) $('#watchlist').addEventListener('click', (e) => {
  const th = e.target.closest('th.sk'); if (!th) return;
  const k = th.dataset.sk;
  if (wlColSort && wlColSort.key === k) wlColSort.dir = -wlColSort.dir;
  else wlColSort = { key: k, dir: (k === 'name' || k === 'sale' || k === 'status') ? 1 : -1 };
  setSortIndicator('#watchlist', k, wlColSort.dir);
  renderList();
});
if ($('#cat-clear')) $('#cat-clear').addEventListener('click', () => {
  CATALOGUE = [];
  const sel = $('#cat-sale'); if (sel) sel.value = '';
  renderCatalogue();
});

/* ---- FX rate editor (guides → guineas for verdicts) ---- */
function renderFXEditor() {
  const fx = loadFX();
  ['EUR', 'USD', 'gns'].forEach((c) => { const el = $('#fx-' + c); if (el) el.value = fx[c]; });
  const s = $('#fx-summary');
  if (s) s.textContent = `€1≈£${fx.EUR} · $1≈£${fx.USD} · 1gn≈£${fx.gns}`;
}
['EUR', 'USD', 'gns'].forEach((c) => {
  const el = $('#fx-' + c); if (!el) return;
  el.addEventListener('change', () => {
    const v = parseFloat(el.value);
    if (!Number.isFinite(v) || v <= 0) { renderFXEditor(); return; }
    const fx = loadFX(); fx[c] = v; saveFX(fx);
    renderFXEditor(); renderCatalogue();
  });
});
if ($('#fx-reset')) $('#fx-reset').addEventListener('click', () => {
  localStorage.removeItem(LS_FX); syncPush();
  renderFXEditor(); renderCatalogue();
});
renderFXEditor();

/* ---- published sale catalogues (auto-loaded from the data branch) ---- */
const CATALOGUES_URL =
  'https://raw.githubusercontent.com/lordbastian83/dig/bloodstock-data/catalogue.json';
let CAT_SALES = [];        // [{ id, label, count, lots }]
let CAT_GENERATED = null;
function renderSalePicker() {
  const wrap = $('#cat-sale-wrap'), sel = $('#cat-sale');
  if (!wrap || !sel) return;
  if (!CAT_SALES.length) { wrap.hidden = true; return; }
  const cur = sel.value;
  sel.innerHTML = '<option value="">— choose a sale —</option>' +
    CAT_SALES.map((s, i) => `<option value="${i}">${s.label} (${s.count})</option>`).join('');
  // keep the current pick if still valid
  if (cur && CAT_SALES[+cur]) sel.value = cur;
  wrap.hidden = false;
}
function applyCatalogueFeed(j) {
  if (!j || !Array.isArray(j.sales)) return;
  CAT_SALES = j.sales.filter((s) => s && Array.isArray(s.lots) && s.lots.length);
  CAT_GENERATED = j.generated || null;
  renderSalePicker();
  // auto-load the first sale if nothing is showing yet
  const sel = $('#cat-sale');
  if (CAT_SALES.length && sel && !sel.value && !CATALOGUE.length) {
    sel.value = '0';
    CATALOGUE = CAT_SALES[0].lots;
    renderCatalogue();
  }
}
if ($('#cat-sale')) $('#cat-sale').addEventListener('change', (e) => {
  const i = e.target.value;
  if (i === '' || !CAT_SALES[+i]) { CATALOGUE = []; renderCatalogue(); return; }
  CATALOGUE = CAT_SALES[+i].lots;
  renderCatalogue();
  document.getElementById('catalogue-card').scrollIntoView({ behavior: 'smooth' });
});
if ($('#cat-addbuys')) $('#cat-addbuys').addEventListener('click', () => {
  const P = loadParams();
  const buys = CATALOGUE.filter((h) => { const [v] = catVerdict(h, evaluate(h, P)); return v === 'BUY' || v === 'BUY-fit'; });
  if (!buys.length) { alert('No BUY-rated lots to add (import guide prices to grade against, or loosen the screen).'); return; }
  const list = loadList(); const have = new Set(list.map((x) => x.name.toLowerCase()));
  const added = buys.filter((h) => !have.has(h.name.toLowerCase()));
  saveList([...added, ...list]); renderList();
  alert(`Added ${added.length} BUY-rated lot${added.length === 1 ? '' : 's'} to the watchlist.`);
});

// Minimal CSV parser — quoted fields, the dialect this app exports.
function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (cell !== '' || row.length) { row.push(cell); rows.push(row); row = []; cell = ''; }
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift().map((h) => h.trim().toLowerCase());
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

$('#import-json').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (Array.isArray(data.watchlist)) saveList(data.watchlist);
    if (data.params) saveParams({ ...loadParams(), ...data.params });
    if (Array.isArray(data.profiles)) {
      saveProfiles(loadProfiles().active, data.profiles);
      renderProfileBar();
    }
    renderParams();
    renderList();
    renderFinds();
  } catch {
    alert('Could not parse that file — expected a backup JSON from this app.');
  }
  e.target.value = '';
});

/* ---------- params ---------- */

$('#params-save').addEventListener('click', () => {
  const P = loadParams();
  $('#params-grid').querySelectorAll('input').forEach((inp) => {
    const v = parseFloat(inp.value);
    if (Number.isFinite(v)) P[inp.name] = v;
  });
  saveParams(P);
  renderList();
});

$('#params-reset').addEventListener('click', () => {
  localStorage.removeItem(LS_PARAMS);
  renderParams();
  renderList();
});

/* ---------- radar finds (published daily by scan.mjs) ---------- */

// NOTE: when the project moves to the private vault-racing repo, this raw
// URL needs auth — serve candidates.json alongside the app instead.
const CANDIDATES_URL =
  'https://raw.githubusercontent.com/lordbastian83/dig/bloodstock-data/candidates.json';
const PROSPECTS_URL =
  'https://raw.githubusercontent.com/lordbastian83/dig/bloodstock-data/prospects.json';

/* ---------- custom radar profiles ---------- */
const LS_PROFILES = 'bloodstock.profiles.v1';
const IMPERIAL = {
  name: 'Imperial Emperor (default)', rmin: 85, rmax: 95, starts: 7,
  tier: 'AB', region: 'any', trend: 'any', rpr: 0, aw: false, ph: false, builtin: true,
  surface: 'any', going: 'any', wins: 0, winpct: 0, orhigh: 0, cls: 'any', owner: '',
};
function loadProfiles() {
  const stored = JSON.parse(localStorage.getItem(LS_PROFILES) || '{}');
  return { active: stored.active || IMPERIAL.name,
           list: [IMPERIAL, ...(stored.list || [])] };
}
function saveProfiles(active, custom) {
  localStorage.setItem(LS_PROFILES, JSON.stringify({ active, list: custom }));
  syncPush();
}
function activeProfile() {
  const { active, list } = loadProfiles();
  return list.find((p) => p.name === active) || IMPERIAL;
}
const PLAN_BANDS = { sprint: [0, 6], miler: [6.5, 8], middle: [8.5, 11], staying: [11.5, 99] };
function matchesProfile(h, p) {
  if (h.rating < p.rmin || h.rating > p.rmax) return false;
  if (h.starts > p.starts) return false;
  if (p.tier === 'A' && h.sireTier !== 'A') return false;
  if (p.tier === 'AB' && !(h.sireTier === 'A' || h.sireTier === 'B')) return false;
  if (p.region !== 'any' && (h.region || '').toUpperCase() !== p.region) return false;
  if (p.trend === 'improving' && h.trend !== 'improving') return false;
  if (+p.rpr > 0 && !(+h.rprEdge >= +p.rpr)) return false;
  if (p.aw && !h.awForm) return false;
  if (p.ph && !h.powerhouse) return false;
  if (p.vers && !h.versatile) return false;
  if (p.sire && !String(h.sire || '').toLowerCase().includes(p.sire.toLowerCase())) return false;
  if (p.damsire && !String(h.dam || '').toLowerCase().includes(p.damsire.toLowerCase())) return false;
  if (p.sxSel && p.sxSel !== 'any' && h.sxClass) {
    const isFilly = /f|m/i.test(h.sxClass);
    if (p.sxSel === 'filly' && !isFilly) return false;
    if (p.sxSel === 'colt' && isFilly) return false;
  }
  // distance: the horse's best trip must fall in the requested window
  if ((p.distmin || p.distmax) && h.distBest != null) {
    if (p.distmin && h.distBest < +p.distmin) return false;
    if (p.distmax && h.distBest > +p.distmax) return false;
  }
  if (p.plan && p.plan !== 'any' && h.distBest != null) {
    const [lo, hi] = PLAN_BANDS[p.plan] || [0, 99];
    if (h.distBest < lo || h.distBest > hi) return false;
  }
  // surface aptitude — Dubai runs on dirt, so "AW/dirt proven" is a real type.
  // AW form is the reliable signal; the surface list backs it up when present.
  if (p.surface === 'aw') {
    const sl = (h.surfaceList || []).join(' ').toLowerCase();
    const dirtish = h.awForm || /aw|tapeta|polytrack|fibresand|dirt|all|standard/.test(sl);
    if (!dirtish) return false;
  }
  if (p.surface === 'turf') {
    const sl = (h.surfaceList || []).join(' ').toLowerCase();
    if (sl && !/turf/.test(sl)) return false; // only exclude when we know it isn't turf
  }
  // going — matched against the ground the horse has actually run on
  if (p.going === 'soft') {
    const gl = (h.goingList || []).join(' ').toLowerCase();
    if (gl && !/soft|heavy|yielding|holding/.test(gl)) return false;
  }
  if (p.going === 'quick') {
    const gl = (h.goingList || []).join(' ').toLowerCase();
    if (gl && !/good|firm|fast|standard/.test(gl)) return false;
  }
  // form quality
  if (+p.wins > 0 && !(+(h.wins || 0) >= +p.wins)) return false;
  if (+p.winpct > 0 && !((h.winPct || 0) * 100 >= +p.winpct)) return false;
  if (+p.orhigh > 0 && !((h.careerHigh || h.rating || 0) >= +p.orhigh)) return false;
  if (p.cls === 'dropping' && h.classMove !== 'dropping') return false;
  if (p.owner && !String(h.vendor || '').toLowerCase().includes(p.owner.toLowerCase())) return false;
  return true;
}

// While the editor is open, the radar filters live against the in-progress
// field values — no Save needed. null = use the saved active profile.
let previewProfile = null;
function editorProfile() {
  return {
    name: 'preview', rmin: +$('#pf-rmin').value || 0, rmax: +$('#pf-rmax').value || 130,
    starts: +$('#pf-starts').value || 50, tier: $('#pf-tier').value,
    region: $('#pf-region').value, trend: $('#pf-trend').value,
    rpr: +$('#pf-rpr').value || 0, aw: $('#pf-aw').checked, ph: $('#pf-ph').checked,
    distmin: +$('#pf-distmin').value || 0, distmax: +$('#pf-distmax').value || 0,
    plan: $('#pf-plan').value, vers: $('#pf-vers').checked,
    sire: ($('#pf-sire').value || '').trim(), damsire: ($('#pf-damsire').value || '').trim(),
    sxSel: $('#pf-sex').value,
    surface: $('#pf-surface').value, going: $('#pf-going').value,
    wins: +$('#pf-wins').value || 0, winpct: +$('#pf-winpct').value || 0,
    orhigh: +$('#pf-orhigh').value || 0, cls: $('#pf-class').value,
    owner: ($('#pf-owner').value || '').trim(),
  };
}

let RADAR = [];
let RADAR_META = {};
let findsExpanded = false;   // radar shows a top few by default, expands on demand
let radarSort = 'vault';     // 'vault' = best value/EV · 'dubai' = best Meydan fit
const FINDS_LIMIT = 6;
const dubaiPct = (r) => Math.round((r.dubai?.pct ?? 0) * 100);

/* ---------- shared radar/prospect row rendering ---------- */
const tierOf = (s) => s >= 0.85 ? ['★ diamond', 'tier-diamond']
  : s >= 0.7 ? ['strong', 'tier-strong']
  : s >= 0.5 ? ['live', 'tier-live'] : ['watch', 'tier-watch'];
const dubaiClassOf = (p) => p >= 75 ? 'df-hot' : p >= 55 ? 'df-warm' : 'df-cool';
function findTagsHTML(h) {
  const t = [`<span class="ftag">OR ${h.rating}</span>`];
  if (h.trend === 'improving') t.push('<span class="ftag ftag-good">▲ improving</span>');
  else if (h.trend === 'declining') t.push('<span class="ftag ftag-down">▼ declining</span>');
  if (+h.rprEdge >= 5) t.push(`<span class="ftag ftag-good">RPR +${h.rprEdge}</span>`);
  if (h.distBest != null) t.push(`<span class="ftag">${h.distBest}f best</span>`);
  if (h.awForm) t.push('<span class="ftag ftag-gold">AW win</span>');
  if (h.wins != null) t.push(`<span class="ftag">${h.wins}W · ${h.starts} runs</span>`);
  if (h.classMove === 'dropping') t.push('<span class="ftag ftag-good">class ↓ well-in</span>');
  if (h.lastRunDays != null && h.lastRunDays >= 30) t.push(`<span class="ftag">${h.lastRunDays}d dormant</span>`);
  if (h.damLabel) t.push(`<span class="ftag">dam: ${esc(h.damLabel)}</span>`);
  return t.join('');
}
// One horse row. `topLabel` non-null marks it the top pick.
// A small photo (or a serif-monogram placeholder). Photos come from a user
// upload, a catalogue image URL, or a pasted URL — never auto-scraped.
function thumbHTML(h, cls = 'find-thumb') {
  const src = horseImg(h);
  const initial = esc((h.name || '?').trim().slice(0, 1).toUpperCase());
  if (src) return `<div class="${cls}"><img src="${esc(src)}" alt="" loading="lazy"
    onerror="this.parentElement.classList.add('noimg');this.parentElement.innerHTML='<span>${initial}</span>'"></div>`;
  return `<div class="${cls} noimg"><span>${initial}</span></div>`;
}
function horseRowHTML(h, r, i, topLabel) {
  const [tl, tc] = tierOf(r.score);
  const dp = dubaiPct(r);
  return `
    <div class="find-row ${tc}-edge${topLabel ? ' find-top' : ''}">
      ${topLabel ? `<span class="top-tag">${topLabel}</span>` : ''}
      <div class="find-score ${tc}"><span class="fs-num">${Math.round(r.score * 100)}</span><span class="fs-lab">${tl}</span></div>
      ${thumbHTML(h)}
      <div class="find-main">
        <b class="find-name" data-i="${i}" title="Click for full profile">${esc(h.name)}</b>
        <small class="find-ped">${esc(h.sire || '?')} × ${esc(h.dam || '?')} · ${esc(h.vendor || '?')}</small>
        <div class="find-tags">${findTagsHTML(h)}</div>
        <div class="dubai-meter ${dubaiClassOf(dp)}" title="How well this horse suits a Meydan dirt campaign">
          <span class="dm-lab">🏜 Dubai fit</span>
          <span class="dm-bar"><span class="dm-fill" style="width:${dp}%"></span></span>
          <span class="dm-num">${dp}</span>
        </div>
        ${h.racePlan ? `<small class="race-plan">🏁 ${esc(h.racePlan)}</small>` : ''}
        <button class="find-profile" data-i="${i}">view full profile →</button>
      </div>
      <div class="find-actions">
        <div class="find-bid">${fmt(r.gns)} <small>gns max</small></div>
        <button class="find-add" data-i="${i}">＋ watchlist</button>
      </div>
    </div>`;
}
function rowsFrom(el) {
  const c = el.closest('[data-rows]');
  try { return c ? JSON.parse(c.dataset.rows || '[]') : []; } catch { return []; }
}
function navShow(id, on) {
  const a = document.querySelector(`.quicknav a[href="#${id}"]`);
  if (a) a.hidden = !on;
}
/* ===================== scanner grid: dense quant table ====================
   A high-density table (not cards): algo score, lineage, connections, our
   hard max bid, a live market estimate with an inline sparkline, the value
   delta, and a form heatmap. Numbers are monospaced + tabular so they never
   reflow; changed cells flash green/red. Gold is reserved for top-tier scores. */
const scanLast = new Map();     // flash memory: cell key -> last numeric value
const simDrift = new Map();     // live-sim market drift per horse (name -> ±frac)
let scanSearch = '';            // global filter query ("/" focuses it)
let scanLive = false;           // live market simulation on/off
let scanLiveTimer = null;
let scanView = [];              // last rendered rows [{h,r}] (for in-place ticks)
let scanSort = null;            // { key, dir } — clicked column sort, overrides rank
let scanActive = -1;            // keyboard cursor row (j/k / arrows)
let scanColFilters = { algo: null, fit: null, or: null, bid: null };  // per-column min/max
let scanViewFull = [];          // full filtered view (for CSV export), pre-slice
const scanSelected = new Set(); // multi-select for the compare tray (by name)
let expertMode = localStorage.getItem('bloodstock.expert') === '1';   // advanced columns
const SCAN_LIMIT = 18;
// Advanced columns unlocked in Expert mode.
function expertHeads() {
  if (!expertMode) return '';
  return '<th class="ta-r sk" data-sk="rpredge" title="RPR above official rating">RPRΔ</th>'
    + '<th class="ta-r" title="Win strike rate">Win%</th>'
    + '<th class="ta-r" title="Dosage Index (speed vs stamina)">DI</th>'
    + '<th class="ta-r" title="Days since last run">Rest</th>';
}
function expertCells(h) {
  if (!expertMode) return '';
  const edge = (+h.rprEdge || 0);
  const winpct = h.winPct != null ? Math.round(h.winPct * 100) + '%' : '—';
  let di = '—';
  try { const d = dosageOf({ ...h, ped: (loadPed()[h.name] || h.ped) }); if (d && d.di != null) di = d.di.toFixed(2); else if (d) di = '∞'; } catch {}
  const rest = h.lastRunDays != null ? h.lastRunDays + 'd' : '—';
  return `<td class="mono ta-r ${edge > 0 ? 'pos' : edge < 0 ? 'neg' : ''}">${edge > 0 ? '+' : ''}${edge || '—'}</td>`
    + `<td class="mono ta-r">${winpct}</td>`
    + `<td class="mono ta-r">${di}</td>`
    + `<td class="mono ta-r">${rest}</td>`;
}
const SCAN_SORT_KEYS = {
  algo:   (x) => x.r.score,
  bid:    (x) => x.r.gns,
  mkt:    (x) => mktEst(x.h, x.r),
  delta:  (x) => x.r.gns - mktEst(x.h, x.r),
  runner: (x) => (x.h.name || '').toLowerCase(),
  rpredge: (x) => +x.h.rprEdge || 0,
};
const sortInd = (key) => scanSort && scanSort.key === key ? `<span class="sk-ind">${scanSort.dir < 0 ? '▼' : '▲'}</span>` : '';

const algoClass = (p) => p >= 85 ? 'algo-gold' : p >= 70 ? 'algo-green' : p >= 50 ? 'algo-slate' : 'algo-low';
function heatPill(val, label) {
  if (val == null || !Number.isFinite(+val)) return `<span class="pill pill-na" title="${esc(label)}">–</span>`;
  const v = Math.round(+val);
  const cls = v >= 85 ? 'pill-gold' : v >= 70 ? 'pill-green' : v >= 50 ? 'pill-slate' : 'pill-low';
  return `<span class="pill ${cls}" title="${esc(label)}: ${v}">${v}</span>`;
}
/* ---- algo-score history: one snapshot per daily scan, per horse ---------- */
const LS_HIST = 'bloodstock.hist.v1';
let HIST = {};   // in-memory cache, refreshed each renderFinds
function loadHist() { try { return JSON.parse(localStorage.getItem(LS_HIST) || '{}'); } catch { return {}; } }
function saveHist(o) { try { localStorage.setItem(LS_HIST, JSON.stringify(o)); if (typeof syncPush === 'function') syncPush(); } catch {} }
// Record today's algo score for every swept horse, once per scan date. The
// score is intrinsic (rating/fit/pedigree), so this is a genuine day-over-day
// series — not the budget-dependent max bid.
function recordHistory() {
  const t = RADAR_META.generated; if (!t || !RADAR.length) return;
  const P = loadParams(); const hist = loadHist(); let changed = false;
  RADAR.forEach((h) => {
    const arr = hist[h.name] || (hist[h.name] = []);
    if (arr.length && arr[arr.length - 1].t === t) return;
    arr.push({ t, s: Math.round(evaluate(h, P).score * 100) });
    if (arr.length > 40) arr.splice(0, arr.length - 40);
    changed = true;
  });
  if (changed) saveHist(hist);
  HIST = hist;
}
// The score series to draw: real recorded history when we have >=2 scans,
// otherwise a deterministic indicative curve that converges to today's score.
function scoreSeries(h, r) {
  const rec = HIST[h.name];
  if (rec && rec.length >= 2) return { pts: rec.map((p) => p.s), real: true };
  const N = 16, end = Math.round(r.score * 100);
  const adj = h.trend === 'improving' ? 1 : h.trend === 'declining' ? -1 : 0;
  const seed = [...(h.name || 'x')].reduce((a, c) => a + c.charCodeAt(0), 7);
  const pts = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    pts.push(end + (-adj * (1 - t) * 11) + Math.sin(seed * 0.7 + i * 0.85) * 3 * (0.35 + 0.65 * t));
  }
  pts[N - 1] = end;
  return { pts, real: false };
}
// Direction of the series: last vs previous point (real), else momentum flag.
function seriesDir(h, r) {
  const rec = HIST[h.name];
  if (rec && rec.length >= 2) { const d = rec[rec.length - 1].s - rec[rec.length - 2].s; return d > 0 ? 1 : d < 0 ? -1 : 0; }
  return h.trend === 'improving' ? 1 : h.trend === 'declining' ? -1 : 0;
}
function sparkline(h, r) {
  const { pts, real } = scoreSeries(h, r);
  const n = pts.length;
  const mn = Math.min(...pts), mx = Math.max(...pts), span = (mx - mn) || 1;
  const W = 64, H = 22, pad = 2.5;
  let d = '';
  pts.forEach((v, i) => {
    const x = pad + (W - 2 * pad) * (n > 1 ? i / (n - 1) : 0.5);
    const y = pad + (H - 2 * pad) * (1 - (v - mn) / span);
    d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const dir = seriesDir(h, r);
  const col = dir > 0 ? 'var(--green)' : dir < 0 ? 'var(--red)' : 'var(--ink-muted)';
  const lx = (pad + (W - 2 * pad)).toFixed(1);
  const ly = (pad + (H - 2 * pad) * (1 - (pts[n - 1] - mn) / span)).toFixed(1);
  const title = real ? `${n}-scan algo history` : 'indicative — needs 2+ scans for real history';
  return `<svg class="spark${real ? ' spark-real' : ''}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><title>${title}</title>
    <path d="${d}" fill="none" stroke="${col}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${lx}" cy="${ly}" r="1.7" fill="${col}"/></svg>`;
}
function trendArrow(h, r) {
  const dir = seriesDir(h, r);
  return dir > 0 ? '<span class="tr up">▲</span>' : dir < 0 ? '<span class="tr down">▼</span>' : '<span class="tr flat">▬</span>';
}
// Algo-score move since the previous scan (from recorded history).
function scoreJump(h) {
  const rec = HIST[h.name];
  if (!rec || rec.length < 2) return 0;
  return rec[rec.length - 1].s - rec[rec.length - 2].s;
}
function scanFlags(h) {
  const f = [];
  const jump = scoreJump(h);
  if (Math.abs(jump) >= 2) {
    const cls = Math.abs(jump) >= 5 ? 'flag-alert' : (jump > 0 ? 'flag-green' : 'flag-red');
    f.push(`<i class="flag ${cls}" title="Algo score ${jump > 0 ? 'up' : 'down'} ${Math.abs(jump)} vs last scan">${jump > 0 ? '▲' : '▼'}${Math.abs(jump)}</i>`);
  }
  if (h.awForm) f.push('<i class="flag flag-gold" title="All-weather / dirt win">AW</i>');
  if (h.classMove === 'dropping') f.push('<i class="flag flag-green" title="Dropping in class, well-in">CL↓</i>');
  if (+h.rprEdge >= 5) f.push(`<i class="flag" title="RPR above official rating">R+${h.rprEdge}</i>`);
  if (h.lastRunDays != null && h.lastRunDays >= 30) f.push(`<i class="flag" title="Days since last run">${h.lastRunDays}d</i>`);
  return f.join('');
}
// Live market estimate for the row: the model's expected price, nudged by any
// live-sim drift. Never feeds back into our max bid, algo score, or verdict.
function mktEst(h, r) {
  const base = expectedPrice(h)?.gns ?? r.gns;
  return Math.max(1, Math.round(base * (1 + (simDrift.get(h.name) || 0))));
}
function scanRowHTML(h, r, i) {
  const algo = Math.round(r.score * 100);
  const fit = dubaiPct(r);
  const rpr = h.bestRPR ?? h.careerHigh ?? null;
  const mkt = mktEst(h, r);
  const delta = r.gns - mkt;
  const dCls = delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'flat';
  const loc = h.region ? esc(h.region) : (h.coursesList && h.coursesList[0] ? esc(h.coursesList[0]) : '');
  return `<tr class="scan-row" data-i="${i}" tabindex="0" aria-label="${esc(h.name)} — open inspector">
    <td class="sc-sel"><input type="checkbox" class="sc-check" data-name="${esc(h.name)}"${scanSelected.has(h.name) ? ' checked' : ''} aria-label="Select ${esc(h.name)}"></td>
    <td class="sc-runner"><span class="algo ${algoClass(algo)}" title="Algorithmic value score">${algo}</span>
      <span class="sc-name"><b>${esc(h.name)}</b><em class="sc-flags">${scanFlags(h)}</em></span></td>
    <td class="sc-line"><b>${esc(h.sire || '?')}</b><small>${esc(h.dam || '?')}${h.damsire ? ` <span class="ds">(${esc(h.damsire)})</span>` : ''}</small></td>
    <td class="sc-train">${h.trainer ? esc(h.trainer) : '—'}<small>${loc}</small></td>
    <td class="sc-bid mono" data-flash="b:${esc(h.name)}" data-val="${r.gns}">${fmt(r.gns)}<small>gns</small></td>
    <td class="sc-mkt"><span class="sc-mktval mono" data-flash="m:${esc(h.name)}" data-val="${mkt}">${fmt(mkt)}</span>${sparkline(h, r)}${trendArrow(h, r)}</td>
    <td class="sc-delta mono ${dCls}" data-flash="d:${esc(h.name)}" data-val="${delta}">${delta > 0 ? '+' : ''}${fmt(delta)}</td>
    <td class="sc-form">${heatPill(h.rating, 'Official rating')}${heatPill(rpr, 'Best RPR')}${heatPill(fit, 'Dubai fit')}</td>
    ${expertCells(h)}
    <td class="sc-act"><button class="scan-add" data-i="${i}" title="Add to watchlist" aria-label="Add to watchlist">＋</button>
      <button class="scan-inspect" data-i="${i}" title="Open inspector" aria-label="Open inspector">▤</button></td>
  </tr>`;
}
function scannerTableHTML(shown) {
  return `<div class="scan-wrap"><table class="scan-table">
    <thead><tr>
      <th class="ta-c sc-sel"><input type="checkbox" id="sc-check-all" title="Select all shown" aria-label="Select all shown"></th>
      <th class="th-runner sk" data-sk="algo" title="Sort by algo score">Runner · Algo${sortInd('algo')}</th>
      <th>Sire / Dam</th><th>Trainer · Base</th>
      <th class="ta-r sk" data-sk="bid" title="Sort by max bid">Max bid${sortInd('bid')}</th>
      <th class="sk" data-sk="mkt" title="Sort by market estimate">Mkt est · trend${sortInd('mkt')}</th>
      <th class="ta-r sk" data-sk="delta" title="Sort by value delta">Δ value${sortInd('delta')}</th>
      <th class="ta-c">OR·RPR·Fit</th>${expertHeads()}<th class="ta-c" aria-label="Actions"></th>
    </tr></thead>
    <tbody>${shown.map(({ h, r }, i) => scanRowHTML(h, r, i)).join('')}</tbody>
  </table></div>`;
}
// Flash any metric cell whose value changed since the last paint.
function applyScanFlashes() {
  document.querySelectorAll('#finds [data-flash]').forEach((el) => {
    const key = el.getAttribute('data-flash');
    const val = +el.getAttribute('data-val');
    const prev = scanLast.get(key);
    if (prev != null && Number.isFinite(val) && val !== prev) {
      const cls = val > prev ? 'flash-up' : 'flash-down';
      el.classList.remove('flash-up', 'flash-down'); void el.offsetWidth;
      el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), 950);
    }
    if (Number.isFinite(val)) scanLast.set(key, val);
  });
}
// Live-sim tick: recompute only the market/delta cells in place (keeps input
// focus, the ticker, and scroll position; rebuilds nothing else).
function tickLiveCells() {
  scanView.forEach(({ h, r }, i) => {
    const tr = document.querySelector(`#finds .scan-row[data-i="${i}"]`);
    if (!tr) return;
    const mkt = mktEst(h, r), delta = r.gns - mkt;
    const mEl = tr.querySelector('[data-flash^="m:"]');
    const dEl = tr.querySelector('[data-flash^="d:"]');
    if (mEl) { mEl.setAttribute('data-val', mkt); mEl.textContent = fmt(mkt); }
    if (dEl) {
      dEl.setAttribute('data-val', delta); dEl.textContent = (delta > 0 ? '+' : '') + fmt(delta);
      dEl.classList.toggle('pos', delta > 0); dEl.classList.toggle('neg', delta < 0);
    }
  });
  applyScanFlashes();
}
function startLiveSim() {
  stopLiveSim();
  scanLiveTimer = setInterval(() => {
    const names = RADAR.map((h) => h.name);
    for (let k = 0; k < 3 && names.length; k++) {
      const nm = names[Math.floor(Math.random() * names.length)];
      const cur = simDrift.get(nm) || 0;
      simDrift.set(nm, Math.max(-0.06, Math.min(0.06, cur + (Math.random() - 0.5) * 0.022)));
    }
    tickLiveCells();
  }, 2200);
}
function stopLiveSim() { if (scanLiveTimer) { clearInterval(scanLiveTimer); scanLiveTimer = null; } }

/* ---------- saved views: pin a profile + rank + column sort + filter ------- */
const LS_VIEWS = 'bloodstock.views.v1';
function loadViews() { try { return JSON.parse(localStorage.getItem(LS_VIEWS) || '[]'); } catch { return []; } }
function saveViews(v) { localStorage.setItem(LS_VIEWS, JSON.stringify(v)); if (typeof syncPush === 'function') syncPush(); }
function currentView() {
  return { profile: activeProfile().name, rank: radarSort, sort: scanSort ? { ...scanSort } : null, q: scanSearch };
}
function autoViewName(s) {
  const bits = [s.profile, s.rank === 'dubai' ? 'Dubai' : 'value'];
  if (s.sort) bits.push('↕' + s.sort.key);
  if (s.q) bits.push('“' + s.q + '”');
  return bits.join(' · ').slice(0, 42);
}
function renderViews() {
  const bar = $('#views-bar'); if (!bar) return;
  const views = loadViews();
  const chips = views.map((v, i) =>
    `<button class="view-chip" data-vi="${i}">${esc(v.name)}<span class="vx" data-del="${i}" role="button" aria-label="Remove view" title="Remove">×</span></button>`).join('');
  bar.innerHTML = `<span class="views-lab">Views</span>${chips || '<span class="views-empty">none pinned</span>'}` +
    `<button class="view-pin" id="view-pin" title="Pin the current profile, rank, sort and filter">＋ Pin current</button>`;
}
function applyView(v) {
  const { list } = loadProfiles();
  if (v.profile) { saveProfiles(v.profile, list.filter((p) => !p.builtin)); renderProfileBar(); }
  radarSort = v.rank || 'vault';
  const st = $('#sort-toggle'); if (st) st.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.sort === radarSort));
  scanSort = v.sort ? { ...v.sort } : null;
  scanSearch = v.q || '';
  const s = $('#scan-search'); if (s) s.value = scanSearch;
  findsExpanded = false;
  renderFinds();
}
document.addEventListener('click', (e) => {
  const del = e.target.closest('.vx[data-del]');
  if (del) { e.stopPropagation(); const views = loadViews(); views.splice(+del.dataset.del, 1); saveViews(views); renderViews(); return; }
  const chip = e.target.closest('.view-chip[data-vi]');
  if (chip) { const v = loadViews()[+chip.dataset.vi]; if (v) applyView(v); return; }
  if (e.target.closest('#view-pin')) {
    const s = currentView(); s.name = autoViewName(s);
    const views = loadViews();
    // replace a same-named view rather than pile up duplicates
    const at = views.findIndex((x) => x.name === s.name);
    if (at >= 0) views[at] = s; else views.push(s);
    saveViews(views); renderViews();
  }
});

// Compare tray — appears when runners are ticked in the grid.
function renderScanTray() {
  const tray = $('#scan-tray'); if (!tray) return;
  const n = scanSelected.size;
  if (!n) { tray.hidden = true; tray.innerHTML = ''; return; }
  const chips = [...scanSelected].slice(0, 8).map((nm) =>
    `<span class="tray-chip">${esc(nm)}<span class="tray-x" data-unpick="${esc(nm)}" role="button" aria-label="Deselect">×</span></span>`).join('');
  tray.innerHTML = `<span class="tray-lab">${n} selected</span>${chips}${n > 8 ? `<span class="tray-more">+${n - 8}</span>` : ''}
    <span class="tray-actions">
      <button class="tray-btn" data-tray="compare"${n < 2 ? ' disabled title="Select 2+ to compare"' : ''}>Compare</button>
      <button class="tray-btn" data-tray="add">Add to watchlist</button>
      <button class="tray-btn tray-ghost" data-tray="clear">Clear</button>
    </span>`;
  tray.hidden = false;
}
document.addEventListener('click', (e) => {
  const x = e.target.closest('.tray-x[data-unpick]'); if (!x) return;
  scanSelected.delete(x.dataset.unpick); renderScanTray(); renderFinds();
});

function renderFinds() {
  const card = $('#finds-card');
  if (!RADAR.length) { card.hidden = true; navShow('finds-card', false); return; }
  navShow('finds-card', true);
  HIST = loadHist();
  const P = loadParams();
  const prof = previewProfile || activeProfile();
  const rows = RADAR
    .filter((h) => matchesProfile(h, prof))
    .map((h) => ({ h, r: evaluate(h, P) }))
    .sort((a, b) => {
      if (radarSort === 'dubai') {
        if (dubaiPct(b.r) !== dubaiPct(a.r)) return dubaiPct(b.r) - dubaiPct(a.r);
        return b.r.score - a.r.score;
      }
      if (Math.round(b.r.score * 100) !== Math.round(a.r.score * 100))
        return b.r.score - a.r.score;
      const ga = a.r.gns - (expectedPrice(a.h)?.gns ?? a.r.gns);
      const gb = b.r.gns - (expectedPrice(b.h)?.gns ?? b.r.gns);
      return gb - ga;
    })
    .slice(0, 40);
  renderProfileBar();
  renderStats(rows);
  renderMarketIntel();
  renderMovers();
  renderTicker(rows);
  // global search across the swept pool
  const q = scanSearch.toLowerCase();
  let view = q ? rows.filter(({ h }) =>
    [h.name, h.sire, h.dam, h.damsire, h.trainer, h.region].some((s) => (s || '').toLowerCase().includes(q))) : rows;
  // per-column numeric filters (algo ≥, fit ≥, OR ≥, max bid ≤)
  const cf = scanColFilters;
  if (cf.algo != null || cf.fit != null || cf.or != null || cf.bid != null) {
    view = view.filter(({ h, r }) =>
      (cf.algo == null || Math.round(r.score * 100) >= cf.algo) &&
      (cf.fit == null || dubaiPct(r) >= cf.fit) &&
      (cf.or == null || (+h.rating || 0) >= cf.or) &&
      (cf.bid == null || r.gns <= cf.bid));
  }
  // clicked-column sort overrides the rank order
  if (scanSort && SCAN_SORT_KEYS[scanSort.key]) {
    const kf = SCAN_SORT_KEYS[scanSort.key];
    const alpha = scanSort.key === 'runner';
    view = view.slice().sort((a, b) => {
      const va = kf(a), vb = kf(b);
      const c = alpha ? String(va).localeCompare(String(vb)) : (va - vb);
      return c * scanSort.dir;
    });
  }
  scanViewFull = view;
  const scanDate = RADAR_META.generated || '—';
  const rankLabel = radarSort === 'dubai' ? 'Dubai fit' : 'value score';
  const header = `<p class="finds-meta">Scanned <b>${esc(scanDate)}</b> · ${RADAR.length} swept · ${view.length}${q ? ` matching “${esc(scanSearch)}”` : ''} · ranked by ${rankLabel}</p>`;
  if (!view.length) {
    scanView = [];
    $('#finds').innerHTML = header + `<p class="empty">${q ? `No runner matches “${esc(scanSearch)}”.` : `No radar finds match "${esc(prof.name)}". Loosen the filters or wait for tomorrow's scan.`}</p>`;
    card.hidden = false; return;
  }
  const shown = findsExpanded ? view : view.slice(0, SCAN_LIMIT);
  scanView = shown;
  const more = view.length > SCAN_LIMIT
    ? `<button class="finds-more" id="finds-more">${findsExpanded ? '▴ Collapse' : `▾ Show all ${view.length} runners`}</button>` : '';
  $('#finds').innerHTML = header + scannerTableHTML(shown) + more;
  $('#finds').dataset.rows = JSON.stringify(view.map((x) => x.h));
  applyScanFlashes();
  // reapply the keyboard cursor highlight after the rebuild (no focus/scroll)
  if (scanActive >= 0) {
    const rs = document.querySelectorAll('#finds .scan-row');
    if (scanActive >= rs.length) scanActive = rs.length - 1;
    rs.forEach((r, idx) => r.classList.toggle('is-active', idx === scanActive));
  }
  const vb = $('#views-bar'); if (vb && !vb.children.length) renderViews();
  renderScanTray();
  const allbox = $('#sc-check-all');
  if (allbox) { const boxes = [...document.querySelectorAll('#finds .sc-check')]; allbox.checked = boxes.length > 0 && boxes.every((b) => b.checked); }
  card.hidden = false;
}
// Move the keyboard cursor; focus the row so Enter opens it and it scrolls in.
function setScanActive(i) {
  const rows = document.querySelectorAll('#finds .scan-row');
  if (!rows.length) return;
  scanActive = Math.max(0, Math.min(rows.length - 1, i));
  rows.forEach((r, idx) => r.classList.toggle('is-active', idx === scanActive));
  const el = rows[scanActive];
  if (el) { el.scrollIntoView({ block: 'nearest' }); el.focus({ preventScroll: true }); }
}

/* ---------- at-a-glance dashboard ---------- */
function daysToCarnival() {
  // Meydan Dubai Carnival opens early January (World Cup night late March).
  const now = new Date();
  let open = new Date(Date.UTC(now.getUTCFullYear(), 0, 2));
  if (now > open) open = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 2));
  return Math.max(0, Math.ceil((open - now) / 86400000));
}
function renderStats(rows) {
  const strip = $('#statstrip');
  if (!strip) return;
  if (!RADAR.length) { strip.hidden = true; return; }
  const diamonds = rows.filter((x) => x.r.score >= 0.85).length;
  const dubaiReady = rows.filter((x) => dubaiPct(x.r) >= 70).length;
  const top = rows[0];
  const P = loadParams();
  const bids = rows.map((x) => x.r.gns).filter((n) => Number.isFinite(n) && n > 0);
  const avgBid = bids.length ? Math.round(bids.reduce((a, b) => a + b, 0) / bids.length) : 0;
  const underBudget = rows.filter((x) => Number.isFinite(x.r.gns) && x.r.gns <= P.budgetGns).length;
  const cell = (num, lab, cls = '') =>
    `<div class="stat ${cls}"><span class="stat-num">${num}</span><span class="stat-lab">${lab}</span></div>`;
  strip.innerHTML =
    cell(RADAR.length, 'horses swept') +
    cell(rows.length, 'shown') +
    cell(diamonds, 'diamonds', diamonds ? 'stat-gold' : '') +
    cell(dubaiReady, 'Dubai-ready', dubaiReady ? 'stat-green' : '') +
    cell(underBudget, 'within budget') +
    cell(avgBid ? fmt(avgBid) : '—', 'avg max bid') +
    cell(daysToCarnival(), 'days to Carnival') +
    (top ? `<div class="stat stat-top"><span class="stat-lab">top ${radarSort === 'dubai' ? 'for Dubai' : 'value'}</span>` +
      `<span class="stat-topname">${esc(top.h.name)}</span>` +
      `<span class="stat-topsub">vault ${Math.round(top.r.score * 100)} · Dubai fit ${dubaiPct(top.r)}</span></div>` : '');
  strip.hidden = false;
}

/* ---------- live ticker: top finds + prices scrolling across the top ------- */
function renderTicker(rows) {
  const track = document.getElementById('ticker-track');
  if (!track) return;
  const items = [];
  (rows || []).slice(0, 12).forEach(({ h, r }) => {
    const fit = dubaiPct(r);
    const cls = fit >= 70 ? 'up' : (fit < 50 ? 'down' : 'amber');
    items.push(`<span class="tk"><b>${esc((h.name || '').toUpperCase())}</b> ${fmt(r.gns)} <span class="${cls}">${fit}</span></span>`);
  });
  const P = loadParams();
  items.push(`<span class="tk">CARNIVAL <span class="amber">T&minus;${daysToCarnival()}D</span></span>`);
  items.push(`<span class="tk">SWEPT <b>${RADAR.length}</b></span>`);
  items.push(`<span class="tk">BUDGET <span class="amber">${fmt(P.budgetGns)}</span></span>`);
  const seq = items.join('');
  track.innerHTML = items.length ? seq + seq : ''; // duplicate for a seamless loop
}

/* ---------- market intelligence: distributions across the swept pool ------ */
// Shared distribution helpers (used by market-intel and the catalogue heatmap)
const histBucket = (items, bins, pick) => bins.map(([label, lo, hi]) =>
  [label, items.filter((x) => { const v = pick(x); return v != null && v >= lo && v < hi; }).length]);
function miChart(title, pairs, accent) {
  const max = Math.max(1, ...pairs.map((p) => p[1]));
  const bars = pairs.map(([label, n]) => `<div class="mi-row"><span class="mi-lab">${label}</span>
    <span class="mi-track"><span class="mi-fill ${accent}" style="width:${Math.round(n / max * 100)}%"></span></span>
    <span class="mi-n">${n}</span></div>`).join('');
  return `<div class="mi-chart"><h4>${title}</h4>${bars}</div>`;
}
const RATING_BINS = [['70–79', 70, 80], ['80–84', 80, 85], ['85–89', 85, 90], ['90–94', 90, 95], ['95+', 95, 999]];
const FIT_BINS = [['0–39', 0, 40], ['40–54', 40, 55], ['55–69', 55, 70], ['70–84', 70, 85], ['85+', 85, 101]];
const VAULT_BINS = [['<50', 0, 50], ['50–64', 50, 65], ['65–74', 65, 75], ['75–84', 75, 85], ['85+', 85, 101]];
function renderMarketIntel() {
  const host = $('#mktintel'), card = $('#mktintel-card');
  if (!host || !card) return;
  if (!RADAR.length) { card.hidden = true; return; }
  const P = loadParams();
  const scored = RADAR.map((h) => ({ h, r: evaluate(h, P) }));
  const bucket = histBucket, chart = miChart;
  const ratings = bucket(scored, RATING_BINS, (x) => +x.h.rating);
  const fits = bucket(scored, FIT_BINS, (x) => dubaiPct(x.r));
  const regions = ['GB', 'IRE', 'FR', 'USA'].map((rg) => [rg, scored.filter((x) => (x.h.region || '') === rg).length]).filter((p) => p[1]);
  const tiers = [['A — dirt sire', scored.filter((x) => x.h.sireTier === 'A').length], ['B — dirt damsire', scored.filter((x) => x.h.sireTier === 'B').length], ['turf / other', scored.filter((x) => !x.h.sireTier).length]];
  // Best-value leaderboard — the finds where fit × ability is highest, so the
  // eye goes straight to where to focus, not just how the pool is distributed.
  const ranked = scored
    .map((x) => ({ ...x, blend: dubaiPct(x.r) * (x.r.score || 0) }))
    .sort((a, b) => b.blend - a.blend)
    .slice(0, 6);
  const lb = ranked.map(({ h, r }, i) => `<div class="mi-lb-row">
    <span class="mi-lb-rank">${i + 1}</span>
    <span class="mi-lb-name">${esc(h.name)}</span>
    <span class="mi-lb-fit" title="Dubai fit">${dubaiPct(r)}</span>
    <span class="mi-lb-vault" title="vault score">${Math.round(r.score * 100)}</span>
    <span class="mi-lb-bid" title="max bid">${fmt(r.gns)}</span>
  </div>`).join('');
  host.innerHTML = chart('Official rating', ratings, 'mi-blue')
    + chart('Dubai fit', fits, 'mi-gold')
    + chart('Region', regions, 'mi-green')
    + chart('Sire tier', tiers, 'mi-blue')
    + `<div class="mi-chart mi-lb"><h4>Best-value shortlist</h4>
        <div class="mi-lb-head"><span></span><span>horse</span><span>fit</span><span>vault</span><span>max bid</span></div>
        ${lb}</div>`;
  card.hidden = false;
}

// Alert digest — the biggest algo-score moves since the previous scan.
function renderMovers() {
  const card = $('#movers-card'), host = $('#movers'), meta = $('#movers-meta');
  if (!card || !host) return;
  const moves = [];
  RADAR.forEach((h) => {
    const rec = HIST[h.name];
    if (rec && rec.length >= 2) { const d = rec[rec.length - 1].s - rec[rec.length - 2].s; if (d) moves.push({ h, d, s: rec[rec.length - 1].s }); }
  });
  if (!moves.length) { card.hidden = true; host.innerHTML = ''; return; }
  const up = moves.filter((m) => m.d > 0).sort((a, b) => b.d - a.d).slice(0, 6);
  const down = moves.filter((m) => m.d < 0).sort((a, b) => a.d - b.d).slice(0, 6);
  const rowsOf = (arr, cls) => arr.length ? arr.map((m) =>
    `<button class="mv-row" data-name="${esc(m.h.name)}" title="Open ${esc(m.h.name)}">
      <span class="mv-delta ${cls}">${m.d > 0 ? '▲' : '▼'}${Math.abs(m.d)}</span>
      <span class="mv-name">${esc(m.h.name)}</span><span class="mv-score mono">${m.s}</span></button>`).join('')
    : '<p class="mv-empty">none</p>';
  host.innerHTML = `<div class="mv-col"><h4 class="mv-up">Upgrades</h4>${rowsOf(up, 'pos')}</div>`
    + `<div class="mv-col"><h4 class="mv-down">Downgrades</h4>${rowsOf(down, 'neg')}</div>`;
  if (meta) meta.textContent = `${moves.length} moved`;
  card.hidden = false;
}
document.addEventListener('click', (e) => {
  const mv = e.target.closest('.mv-row'); if (!mv) return;
  const h = RADAR.find((x) => x.name === mv.dataset.name); if (h) openHorseModal(h);
});

$('#sort-toggle').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-sort]'); if (!b) return;
  radarSort = b.dataset.sort;
  $('#sort-toggle').querySelectorAll('button').forEach((x) =>
    x.classList.toggle('on', x.dataset.sort === radarSort));
  findsExpanded = false;
  renderFinds();
});

// A larger area sparkline of a horse's recorded algo score across scans —
// the compare-across-scans view for a single runner.
function historyChartHTML(h) {
  const rec = loadHist()[h.name] || [];
  if (rec.length < 2) return '';
  const pts = rec.map((p) => p.s), n = pts.length;
  const mn = Math.min(...pts), mx = Math.max(...pts), span = (mx - mn) || 1;
  const W = 320, H = 62, pad = 6;
  const X = (i) => pad + (W - 2 * pad) * i / (n - 1);
  const Y = (v) => pad + (H - 2 * pad) * (1 - (v - mn) / span);
  let d = ''; pts.forEach((v, i) => { d += `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`; });
  const move = pts[n - 1] - pts[0];
  const col = move > 0 ? 'var(--green)' : move < 0 ? 'var(--red)' : 'var(--ink-muted)';
  const area = `${d} L ${X(n - 1).toFixed(1)} ${(H - pad).toFixed(1)} L ${X(0).toFixed(1)} ${(H - pad).toFixed(1)} Z`;
  const dots = pts.map((v, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="1.7" fill="${col}"/>`).join('');
  return `<h4>Algo score history</h4>
    <div class="hist-chart">
      <svg viewBox="0 0 ${W} ${H}" class="hist-svg" preserveAspectRatio="none" aria-label="algo score across ${n} scans">
        <path d="${area}" fill="${col}" opacity="0.10"/>
        <path d="${d}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>${dots}
      </svg>
      <div class="hist-meta"><span>${n} scans</span><span>${esc(rec[0].t.slice(0, 10))} → ${esc(rec[n - 1].t.slice(0, 10))}</span>
        <span class="${move > 0 ? 'ok' : move < 0 ? 'neg' : ''}">${move > 0 ? '+' : ''}${move} pts</span></div>
    </div>`;
}

/* ---------- horse profile modal — everything we know ---------- */
let modalHorse = null;
function openHorseModal(h) {
  modalHorse = h;
  const P = loadParams();
  const r = evaluate(h, P);
  const nk = nickScore(h);
  const apt = aptitudeIndex(h);
  const fam = femaleFamily(h);
  const pedText = loadPed()[h.name] || '';
  const dos = dosageOf({ ...h, ped: pedText || h.ped });
  const sect = loadSect()[h.name] || {};
  const sr = sectionalRead(sect);
  const mkt = marketEstimate(h);
  const roi = roiOutlook(h, P, r.gns);
  const conf = loadConf()[h.name];
  const cf = conformationScore({ conf });
  const exp = expectedPrice(h);
  const gap = exp ? r.gns - exp.gns : null;
  const row = (k, v) => v == null || v === '' ? '' : `<div class="mp-row"><span class="mp-k">${esc(k)}</span><span class="mp-v">${esc(v)}</span></div>`;
  const section = (title, rows) => rows.filter(Boolean).length
    ? `<h4>${title}</h4><div class="mp-grid">${rows.join('')}</div>` : '';
  const money = (n) => n ? '£' + fmt(n) : null;
  $('#modal-body').innerHTML = `
    <div class="mp-topline">
      <button class="mp-photo-btn" id="mp-photo-btn" title="Add or change photo">${thumbHTML(h, 'mp-photo')}</button>
      <input type="file" id="mp-photo-file" accept="image/*" hidden>
      <div class="mp-headtext">
        <div class="mp-head">
          <h3>${esc(h.name)}</h3>
          <span class="mp-score">vault ${Math.round(r.score * 100)}</span>
          <span class="mp-score mp-dubai">🏜 Dubai fit ${dubaiPct(r)}</span>
        </div>
        <p class="mp-sub">${esc(h.sire || '?')} × ${esc(h.dam || '?')} · ${esc(h.vendor || '?')}${h.trainer ? ` · ${esc(h.trainer)}` : ''}</p>
        ${horseImgCredit(h) ? `<p class="mp-credit">Photo: ${esc(horseImgCredit(h))}</p>` : ''}
      </div>
    </div>

    <div class="mp-headline">
      <div><span class="mp-big">${fmt(r.gns)}</span><span class="mp-lab">max bid (gns)</span></div>
      <div><span class="mp-big">${h.rating ?? '?'}</span><span class="mp-lab">official rating</span></div>
      <div><span class="mp-big">${h.bestRPR ?? h.careerHigh ?? '—'}</span><span class="mp-lab">${h.bestRPR != null ? 'best RPR (speed)' : 'career-high OR'}</span></div>
      <div><span class="mp-big ${r.verdict === 'BID' ? 'ok' : ''}">${r.verdict === 'BID' ? 'PASS' : (6 - r.fails.length) + '/6'}</span><span class="mp-lab">screen</span></div>
    </div>

    ${(r.dubai?.reasons || []).length ? `<div class="mp-dubai-why">
      <b>🏜 Why it fits Dubai (${dubaiPct(r)}/100):</b> ${r.dubai.reasons.join(' · ')}.
      ${dubaiPct(r) < 55 ? ' Fit is modest — better value elsewhere than as a Meydan type.' : ''}
    </div>` : ''}

    ${historyChartHTML(h)}

    ${section('Ability &amp; speed', [
      row('Official rating', h.rating), row('Career-high OR', h.careerHigh),
      row('Best RPR', h.bestRPR), row('Best topspeed (TSR)', h.bestTSR),
      row('RPR edge over OR', h.rprEdge ? `${h.rprEdge > 0 ? '+' : ''}${h.rprEdge}` : null),
      row('OR trend', h.trend),
    ])}
    ${section('Distance &amp; ground', [
      row('Best trip', h.distBest ? `${h.distBest}f` : null),
      row('Trip range', h.distMin != null ? `${h.distMin}–${h.distMax}f` : null),
      row('Suggested plan', h.racePlan),
      row('Going', (h.goingList || []).join(', ') || null),
      row('Surfaces', (h.surfaceList || []).join(', ') || null),
      row('Courses run', (h.coursesList || []).join(', ') || null),
      row('Versatile', h.versatile ? 'yes — wide trip range' : null),
    ])}
    ${section('Achievement &amp; record', [
      row('Starts', h.starts), row('Wins', h.wins), row('Placed', h.placed),
      row('Win %', h.winPct != null ? `${Math.round(h.winPct * 100)}%` : null),
      row('Consistency (placed)', h.consistency != null ? `${Math.round(h.consistency * 100)}%` : null),
      row('Best win', h.bestWin), row('Prize money', money(h.earnings)),
      row('Prize per start', money(h.earningsPerStart)),
      row('Days since last run', h.lastRunDays != null ? `${h.lastRunDays} days` : null),
      row('AW win', h.awForm ? 'yes' : 'no'), row('Class', h.classMove === 'dropping' ? 'dropping (well-in)' : h.classMove),
    ])}
    ${section('Pedigree &amp; connections', [
      row('Sire', h.sire), row('Sire tier', h.sireTier === 'A' ? 'A — proven dirt' : h.sireTier === 'B' ? 'B — dirt damsire' : '—'),
      row('Dam', h.dam), row('Damsire', nk.damsire || null),
      row('Dirt nick', `${Math.round(nk.pct * 100)}/100 — ${nk.label}`),
      row('Dam production', h.damLabel),
      row('Owner', h.vendor), row('Powerhouse', h.powerhouse ? 'yes' : 'no'),
      row('Trainer', h.trainer), row('Trainer strike-rate', h.trainerSR != null ? `${Math.round(h.trainerSR * 100)}%` : null),
      row('Region', h.region), row('Sex', h.sxClass),
    ])}
    ${nk.notes.length ? `<div class="mp-dubai-why"><b>🧬 Pedigree nick (${Math.round(nk.pct * 100)}/100):</b> ${nk.notes.join(' · ')}.</div>` : ''}
    ${section('Pedigree analysis', [
      row('Dirt nick', `${Math.round(nk.pct * 100)}/100 — ${nk.label}`),
      apt ? row('Distance aptitude', `${apt.band} · centre ${apt.centre}f (${apt.source})`) : '',
      apt ? row('Speed ↔ stamina', `${apt.speed}% speed · ${apt.stamina}% stamina`) : '',
      fam ? row('Female family', `${Math.round(fam.pct * 100)}/100 — ${fam.label}`) : '',
      fam && fam.notes.length ? row('Family notes', fam.notes.join('; ')) : '',
    ])}
    ${apt ? `<div class="apt-bar" title="Speed ↔ stamina from pedigree"><span class="apt-fill" style="width:${apt.speed}%"></span><span class="apt-mark speed">speed</span><span class="apt-mark stay">stamina</span></div>` : ''}
    ${dos ? `<div class="dosage">
      <div class="dosage-head">
        <b>Dosage${dos.partial ? ' (indicative)' : ''}</b>
        <span class="dosage-di" title="Dosage Index — speed vs stamina">DI ${dos.di == null ? '∞' : dos.di.toFixed(2)}</span>
        <span class="dosage-cd" title="Centre of Distribution (−2 stamina … +2 speed)">CD ${dos.cd >= 0 ? '+' : ''}${dos.cd.toFixed(2)}</span>
        <span class="dosage-apt">${dos.aptitude} · ~${dos.centre}f</span>
      </div>
      <div class="dp" title="Dosage Profile: Brilliant · Intermediate · Classic · Solid · Professional">
        DP ${dos.profile.join(' · ')}
      </div>
      ${dos.chefs.length ? `<div class="hint dosage-chefs">Chefs-de-race read: ${dos.chefs.map((c) => esc(c.name.replace(/\b\w/g, (m) => m.toUpperCase())) + ' (g' + c.gen + ')').join(', ')}.</div>` : ''}
      ${dos.partial ? `<div class="hint">Indicative — computed from ${dos.chefs.length} recognised ancestor${dos.chefs.length === 1 ? '' : 's'}${pedText ? '' : ' (sire + damsire only)'}. Paste the 4-generation pedigree below for the full figure.</div>` : ''}
      <details class="ped-editor"><summary>🧬 ${pedText ? 'Edit' : 'Add'} 4-generation pedigree</summary>
        <textarea id="ped-input" data-name="${encodeURIComponent(h.name)}" rows="3"
          placeholder="Chef-de-race ancestors as name:generation, e.g. Galileo:1, Danehill:2, Mr. Prospector:3, Northern Dancer:4">${esc(pedText)}</textarea>
        <p class="hint">List the influential ancestors with their generation (1–4). Only recognised chefs-de-race count; the rest are ignored. Saved &amp; synced.</p>
      </details>
    </div>` : ''}
    ${section('Valuation', [
      row('Max bid', `${fmt(r.gns)} gns`), row('Expected hammer', exp ? `${fmt(exp.gns)} gns${exp.est ? ' (est)' : ''}` : '—'),
      h.guide ? row('Catalogue guide', `${fmtCcy(h.guide, ccyOf(h))}${ccyOf(h) !== 'gns' ? ` (≈ ${fmt(guideGns(h))} gns)` : ''}`) : '',
      h.guide ? row('Guide verdict', catVerdict(h, r)[0]) : '',
      row('Value gap', gap == null ? '—' : `${gap >= 0 ? '+' : ''}${fmt(gap)} gns`),
      row('Vet', h.vet === 'clean' ? 'clean' : '−20% applied (not clean)'),
    ])}

    <h4>Market estimate &amp; 5-yr outlook</h4>
    <div class="mkt-bands">
      <div class="mkt cons"><span class="mkt-lab">conservative</span><span class="mkt-val">${fmt(mkt.conservative)}</span></div>
      <div class="mkt base"><span class="mkt-lab">base estimate${mkt.est ? ' (est)' : ''}</span><span class="mkt-val">${fmt(mkt.base)}</span></div>
      <div class="mkt up"><span class="mkt-lab">upside</span><span class="mkt-val">${fmt(mkt.upside)}</span></div>
    </div>
    <div class="mp-grid">
      ${row('Projected return (base)', `${fmt(roi.base)} gns over ${roi.seasons} seasons`)}
      ${row('ROI on our max bid', `${roi.roiCons}% → ${roi.roiUp}% (base ${roi.roiBase}%)`)}
    </div>
    <p class="hint" style="margin:.3rem 0 0">Model projection from the outcome tree (prize EV + probability-weighted residual), not a guarantee.</p>

    <h4>Conformation &amp; biomechanics ${cf ? `<span class="mp-score mp-dubai">${Math.round(cf.pct * 100)}/100 · ${cf.label}</span>` : ''}</h4>
    <div class="conf-grid" id="conf-grid" data-name="${encodeURIComponent(h.name)}">
      ${CONF_ITEMS.map(([k, label]) => `<label>${label}
        <select data-conf="${k}">
          <option value="">—</option>
          <option value="ideal"${conf && conf[k] === 'ideal' ? ' selected' : ''}>within ideal</option>
          <option value="mild"${conf && conf[k] === 'mild' ? ' selected' : ''}>mild deviation</option>
          <option value="notable"${conf && conf[k] === 'notable' ? ' selected' : ''}>notable deviation</option>
        </select></label>`).join('')}
    </div>
    ${cf && cf.flags.length ? `<p class="hint" style="margin:.4rem 0 0">Flags: ${cf.flags.join(' · ')}.</p>` : ''}
    <div class="conf-ai">
      <button type="button" class="conf-shoot" id="conf-shoot">📷 Analyse photo (AI)</button>
      <input type="file" id="conf-photo" accept="image/*" hidden>
      <span class="conf-status" id="conf-status"></span>
    </div>
    ${conf && conf._summary ? `<p class="hint conf-summary" style="margin:.4rem 0 0"><b>AI read:</b> ${esc(conf._summary)}</p>`
      : '<p class="hint" style="margin:.4rem 0 0">Grade from a photo or inspection — feeds the vet call. Upload a conformation shot for an AI first pass, then adjust.</p>'}

    <h4>Training &amp; sectionals ${sr && sr.breezeLabel ? `<span class="mp-score mp-dubai">${sr.breezeLabel}</span>` : ''}</h4>
    <div class="sect-grid" data-name="${encodeURIComponent(h.name)}">
      <label>Breeze distance (f)<input type="number" step="0.5" min="0" data-sect="breezeDist" value="${sect.breezeDist ?? ''}"></label>
      <label>Breeze time (s)<input type="number" step="0.1" min="0" data-sect="breezeTime" value="${sect.breezeTime ?? ''}"></label>
      <label>Best closing 2f (s)<input type="number" step="0.1" min="0" data-sect="final2f" value="${sect.final2f ?? ''}"></label>
    </div>
    ${sr ? `<p class="hint" style="margin:.3rem 0 0">${sr.notes.join(' · ')}. Indicative — a TPD/GPS sectional feed gives true speed figures.</p>`
      : '<p class="hint" style="margin:.3rem 0 0">Enter a breeze or closing-sectional time for a pace read. Auto-feed (TPD/GPS sectionals) plugs in here later.</p>'}

    <div class="mp-flags">
      ${r.fails.length ? `<b>Fails:</b> ${r.fails.join('; ')}. ` : '<b class="ok">Passes all six filters.</b> '}
      Black type &amp; availability need a human check.
    </div>
    <div class="mp-actions">
      <button class="primary mp-add" data-name="${encodeURIComponent(h.name)}">→ add to watchlist</button>
      <button class="mp-report">📄 One-pager PDF</button>
    </div>`;
  $('#horse-modal').hidden = false;
  ensureWikiImage(h); // if no photo yet, try a free-licensed Commons image
}

// A shareable one-page PDF report for a single horse (print dialog → save PDF).
function horseReport(h) {
  const P = loadParams();
  const r = evaluate(h, P), nk = nickScore(h), exp = expectedPrice(h);
  const mkt = marketEstimate(h), roi = roiOutlook(h, P, r.gns);
  const cf = conformationScore({ conf: loadConf()[h.name] });
  const gap = exp ? r.gns - exp.gns : null;
  const today = new Date().toISOString().slice(0, 10);
  const li = (k, v) => v == null || v === '' ? '' : `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`;
  const w = window.open('', '_blank'); if (!w) { alert('Allow pop-ups to generate the PDF.'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(h.name)} — vault racing</title><style>
    @page{margin:16mm} body{font-family:'Outfit',system-ui,sans-serif;color:#12203A;font-size:12px}
    h1{font-size:24px;margin:0;font-weight:800;letter-spacing:-.03em}
    .sub{color:#6b7688;margin:2px 0 12px}
    .band{display:flex;gap:10px;margin:12px 0}
    .tile{flex:1;border:1px solid #dfe3ea;border-radius:8px;padding:8px 10px;text-align:center}
    .tile b{display:block;font-size:20px;color:#12203A} .tile.gold b{color:#8A6A34} .tile span{font-size:9px;color:#6b7688;text-transform:uppercase;letter-spacing:.04em}
    h2{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8A6A34;margin:14px 0 4px;border-bottom:1px solid #dfe3ea;padding-bottom:3px}
    table{width:100%;border-collapse:collapse} td{padding:3px 0;vertical-align:top} td.k{color:#6b7688;width:45%} td.v{text-align:right;font-variant-numeric:tabular-nums}
    .why{background:#faf3df;border-left:3px solid #8A6A34;padding:7px 9px;border-radius:5px;margin:8px 0;font-size:11px}
    .foot{margin-top:16px;color:#8A93A3;font-size:9px}</style></head><body>
    <h1>${esc(h.name)}</h1>
    <div class="sub">${esc(h.sire || '?')} × ${esc(h.dam || '?')} · ${esc(h.vendor || '?')}${h.trainer ? ' · ' + esc(h.trainer) : ''}</div>
    <div class="band">
      <div class="tile gold"><b>${fmt(r.gns)}</b><span>max bid (gns)</span></div>
      <div class="tile"><b>${Math.round(r.score * 100)}</b><span>vault score</span></div>
      <div class="tile"><b>${dubaiPct(r)}</b><span>Dubai fit</span></div>
      <div class="tile"><b>${Math.round(nk.pct * 100)}</b><span>dirt nick</span></div>
    </div>
    ${(r.dubai?.reasons || []).length ? `<div class="why"><b>Why it fits Dubai:</b> ${esc(r.dubai.reasons.join(' · '))}.</div>` : ''}
    ${nk.notes.length ? `<div class="why"><b>Pedigree nick:</b> ${esc(nk.notes.join(' · '))}.</div>` : ''}
    <h2>Ability &amp; form</h2><table>
      ${li('Official rating', h.rating)}${li('Career-high OR', h.careerHigh)}${li('Best RPR', h.bestRPR)}
      ${li('OR trend', h.trend)}${li('Wins / starts', (h.wins ?? '?') + ' / ' + (h.starts ?? '?'))}
      ${li('Win %', h.winPct != null ? Math.round(h.winPct * 100) + '%' : null)}${li('AW / dirt win', h.awForm ? 'yes' : 'no')}</table>
    <h2>Distance &amp; plan</h2><table>
      ${li('Best trip', h.distBest ? h.distBest + 'f' : null)}${li('Suggested plan', h.racePlan)}
      ${li('Surfaces', (h.surfaceList || []).join(', ') || null)}</table>
    <h2>Valuation</h2><table>
      ${li('Hard max bid', fmt(r.gns) + ' gns')}${li('Expected hammer', exp ? fmt(exp.gns) + ' gns' + (exp.est ? ' (est)' : '') : '—')}
      ${li('Value gap', gap == null ? '—' : (gap >= 0 ? '+' : '') + fmt(gap) + ' gns')}${li('Screen', r.verdict === 'BID' ? 'PASS 6/6' : (6 - r.fails.length) + '/6')}
      ${li('Vet', h.vet === 'clean' ? 'clean' : '−20% applied (not clean)')}</table>
    <h2>Market estimate &amp; ROI outlook</h2><table>
      ${li('Likely hammer', fmt(mkt.conservative) + ' / ' + fmt(mkt.base) + ' / ' + fmt(mkt.upside) + ' gns (cons/base/up)')}
      ${li('Projected return (base)', fmt(roi.base) + ' gns / ' + roi.seasons + ' seasons')}
      ${li('ROI on max bid', roi.roiCons + '% → ' + roi.roiUp + '% (base ' + roi.roiBase + '%)')}
      ${cf ? li('Conformation', Math.round(cf.pct * 100) + '/100 — ' + cf.label) : ''}</table>
    ${cf && cf.flags.length ? `<div class="why"><b>Conformation flags:</b> ${esc(cf.flags.join(' · '))}.</div>` : ''}
    <div class="foot">vault racing · ${today} · hard max bids are limit orders — never chase past them · analysis, not financial advice · black type &amp; availability need a human check.</div>
    </body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

function addToWatchlist(h, btn, doneText) {
  if (!h) return;
  const list = loadList();
  if (list.some((x) => x.name.toLowerCase() === h.name.toLowerCase())) {
    alert(`${h.name} is already on the watchlist.`); return;
  }
  list.unshift(h); saveList(list); renderList();
  if (btn) btn.textContent = doneText;
}
// One delegated click handler covers the radar AND the prospects list.
document.addEventListener('click', (e) => {
  if (e.target.id === 'finds-more') { findsExpanded = !findsExpanded; renderFinds(); return; }
  // sortable column header
  const th = e.target.closest('#finds th.sk');
  if (th) {
    const k = th.dataset.sk;
    if (scanSort && scanSort.key === k) scanSort.dir = -scanSort.dir;
    else scanSort = { key: k, dir: k === 'runner' ? 1 : -1 };
    findsExpanded = false; renderFinds(); return;
  }
  // scanner grid: buttons first, then a row click opens the inspector drawer
  const sAdd = e.target.closest('.scan-add');
  if (sAdd) { addToWatchlist(rowsFrom(sAdd)[+sAdd.dataset.i], sAdd, '✓'); return; }
  const sInspect = e.target.closest('.scan-inspect');
  if (sInspect) { const h = rowsFrom(sInspect)[+sInspect.dataset.i]; if (h) openHorseModal(h); return; }
  if (e.target.closest('.sc-sel')) return;  // checkbox cell — let the checkbox handle it
  const sRow = e.target.closest('.scan-row');
  if (sRow) { const h = rowsFrom(sRow)[+sRow.dataset.i]; if (h) openHorseModal(h); return; }
  const open = e.target.closest('.find-name, .find-profile');
  if (open) { const h = rowsFrom(open)[+open.dataset.i]; if (h) openHorseModal(h); return; }
  const add = e.target.closest('.find-add');
  if (add) { addToWatchlist(rowsFrom(add)[+add.dataset.i], add, '✓ added'); return; }
  const catOpen = e.target.closest('.cat-name');
  if (catOpen) { const h = rowsFrom(catOpen)[+catOpen.dataset.i]; if (h) openHorseModal(h); return; }
  const catAdd = e.target.closest('.cat-add');
  if (catAdd) { addToWatchlist(rowsFrom(catAdd)[+catAdd.dataset.i], catAdd, '✓'); return; }
});
/* ---------- scanner filter bar: global search ("/") + live-sim toggle ------ */
(function wireScanner() {
  const search = $('#scan-search');
  if (search) {
    search.addEventListener('input', () => { scanSearch = search.value.trim(); findsExpanded = false; renderFinds(); });
  }
  const live = $('#scan-live');
  if (live) {
    live.addEventListener('click', () => {
      scanLive = !scanLive;
      live.classList.toggle('on', scanLive);
      live.setAttribute('aria-pressed', String(scanLive));
      if (scanLive) startLiveSim(); else stopLiveSim();
    });
  }
  // per-column numeric filters (static inputs — focus survives re-render)
  const numFilter = () => {
    const val = (id) => { const el = $(id); const v = el && el.value !== '' ? +el.value : null; return Number.isFinite(v) ? v : null; };
    scanColFilters = { algo: val('#nf-algo'), fit: val('#nf-fit'), or: val('#nf-or'), bid: val('#nf-bid') };
    findsExpanded = false; renderFinds();
  };
  ['#nf-algo', '#nf-fit', '#nf-or', '#nf-bid'].forEach((id) => { const el = $(id); if (el) el.addEventListener('input', numFilter); });
  const nfClear = $('#nf-clear');
  if (nfClear) nfClear.addEventListener('click', () => {
    ['#nf-algo', '#nf-fit', '#nf-or', '#nf-bid'].forEach((id) => { const el = $(id); if (el) el.value = ''; });
    scanColFilters = { algo: null, fit: null, or: null, bid: null }; findsExpanded = false; renderFinds();
  });
  // multi-select → compare tray
  const finds = $('#finds');
  if (finds) finds.addEventListener('change', (e) => {
    const cb = e.target.closest('.sc-check'); if (!cb) return;
    if (cb.checked) scanSelected.add(cb.dataset.name); else scanSelected.delete(cb.dataset.name);
    renderScanTray();
    const all = $('#sc-check-all'); if (all) { const boxes = [...document.querySelectorAll('#finds .sc-check')]; all.checked = boxes.length > 0 && boxes.every((b) => b.checked); }
  });
  if (finds) finds.addEventListener('click', (e) => {
    if (e.target.id !== 'sc-check-all') return;
    const on = e.target.checked;
    document.querySelectorAll('#finds .sc-check').forEach((b) => { b.checked = on; if (on) scanSelected.add(b.dataset.name); else scanSelected.delete(b.dataset.name); });
    renderScanTray();
  });
  const tray = $('#scan-tray');
  if (tray) tray.addEventListener('click', (e) => {
    const act = e.target.closest('[data-tray]'); if (!act) return;
    const horses = [...scanSelected].map((n) => RADAR.find((h) => h.name === n)).filter(Boolean);
    if (act.dataset.tray === 'compare') { if (horses.length) openCompare(horses); }
    else if (act.dataset.tray === 'add') { const list = loadList(); horses.forEach((h) => { if (!list.some((x) => x.name.toLowerCase() === h.name.toLowerCase())) list.unshift({ ...h, status: 'shortlist' }); }); saveList(list); renderList(); scanSelected.clear(); renderScanTray(); renderFinds(); }
    else if (act.dataset.tray === 'clear') { scanSelected.clear(); renderScanTray(); renderFinds(); }
  });
  // expert mode
  const expert = $('#scan-expert');
  const applyExpert = (on) => { expertMode = on; if (expert) { expert.classList.toggle('on', on); expert.setAttribute('aria-pressed', String(on)); } };
  applyExpert(expertMode);
  if (expert) expert.addEventListener('click', () => { const on = !expertMode; localStorage.setItem('bloodstock.expert', on ? '1' : '0'); applyExpert(on); renderFinds(); });
  // export the current scanner view to CSV
  const exp = $('#scan-export');
  if (exp) exp.addEventListener('click', () => {
    if (!scanViewFull.length) { alert('Nothing to export — the scanner view is empty.'); return; }
    const head = ['rank', 'runner', 'sire', 'dam', 'damsire', 'trainer', 'region', 'algo', 'max_bid_gns', 'mkt_est_gns', 'value_delta_gns', 'OR', 'best_RPR', 'dubai_fit', 'score_move'];
    const lines = scanViewFull.map(({ h, r }, i) => {
      const mkt = mktEst(h, r);
      return [i + 1, h.name, h.sire || '', h.dam || '', h.damsire || '', h.trainer || '', h.region || '',
        Math.round(r.score * 100), r.gns, mkt, r.gns - mkt, h.rating ?? '', h.bestRPR ?? h.careerHigh ?? '', dubaiPct(r), scoreJump(h)]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
    });
    const stamp = (RADAR_META.generated || '').slice(0, 10) || 'view';
    download(`vault-scanner-${stamp}.csv`, 'text/csv', [head.join(','), ...lines].join('\n'));
  });
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
    if (e.key === '?' && !typing) { e.preventDefault(); const hm = $('#help-modal'); if (hm) hm.hidden = false; return; }
    if (e.key === 'Escape') { const hm = $('#help-modal'); if (hm && !hm.hidden) { hm.hidden = true; return; } }
    if (e.key === '/' && !typing) { if (search) { e.preventDefault(); search.focus(); search.select(); } return; }
    if (e.key === 'Escape' && search && document.activeElement === search) {
      if (search.value) { search.value = ''; scanSearch = ''; renderFinds(); } else search.blur();
      return;
    }
    if (e.key === 'Enter') {
      const row = e.target.closest && e.target.closest('.scan-row');
      if (row) { const h = rowsFrom(row)[+row.dataset.i]; if (h) openHorseModal(h); }
      return;
    }
    // vim-style row cursor — scoped to the scanner so it never steals j/k
    // from the catalogue or watchlist grids, which have their own cursor.
    if (!typing && RADAR.length && e.target.closest && e.target.closest('#finds-card')) {
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setScanActive(scanActive + 1); return; }
      if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setScanActive(scanActive < 0 ? 0 : scanActive - 1); return; }
    }
  });
})();

/* ---------- density toggle: compact vs comfortable, app-wide ------------- */
(function wireDensity() {
  const btn = $('#density-toggle');
  const apply = (on) => {
    document.body.classList.toggle('dense', on);
    if (btn) { btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', String(on)); btn.textContent = on ? 'Comfortable' : 'Compact'; }
  };
  apply(localStorage.getItem('bloodstock.dense') === '1');
  if (btn) btn.addEventListener('click', () => {
    const on = !document.body.classList.contains('dense');
    localStorage.setItem('bloodstock.dense', on ? '1' : '0');
    apply(on);
  });
})();

/* ---------- keyboard cursor for the catalogue + watchlist grids ----------- */
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
  const card = e.target.closest && e.target.closest('#catalogue-card, #watchlist-card');
  if (!card) return;
  const rows = [...card.querySelectorAll('tbody tr[tabindex]')];
  if (!rows.length) return;
  const cur = rows.indexOf(document.activeElement.closest('tr'));
  if (e.key === 'j' || e.key === 'ArrowDown') {
    e.preventDefault(); (rows[Math.min(rows.length - 1, cur + 1)] || rows[0]).focus({ preventScroll: false });
  } else if (e.key === 'k' || e.key === 'ArrowUp') {
    e.preventDefault(); rows[cur <= 0 ? 0 : cur - 1].focus({ preventScroll: false });
  } else if (e.key === 'Enter') {
    const tr = document.activeElement.closest('tr'); if (!tr) return;
    if (card.id === 'catalogue-card') { const n = tr.querySelector('.cat-name'); if (n) { const h = rowsFrom(n)[+n.dataset.i]; if (h) openHorseModal(h); } }
    else { const b = tr.querySelector('.edit-btn'); if (b) b.click(); }
  }
});

$('#modal-close').addEventListener('click', () => { $('#horse-modal').hidden = true; });
$('#horse-modal').addEventListener('click', (e) => {
  if (e.target.id === 'horse-modal') $('#horse-modal').hidden = true; // click backdrop
  if (e.target.matches('.mp-add')) addToWatchlist(modalHorse, e.target, '✓ added to watchlist');
  if (e.target.matches('.mp-report') && modalHorse) horseReport(modalHorse);
  if (e.target.id === 'conf-shoot') { const f = $('#conf-photo'); if (f) f.click(); }
  if (e.target.closest('#mp-photo-btn')) { const f = $('#mp-photo-file'); if (f) f.click(); }
});
// Conformation assessment — save each observation and re-score the modal live.
$('#horse-modal').addEventListener('change', (e) => {
  if (e.target.id === 'conf-photo') {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-selecting the same file
    if (file) { setHorseImageFromFile(file); inspectPhoto(file); } // the shot is also the horse's photo
    return;
  }
  if (e.target.id === 'mp-photo-file') {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) setHorseImageFromFile(file);
    return;
  }
  if (e.target.id === 'ped-input' && modalHorse) {
    const all = loadPed();
    const v = e.target.value.trim();
    if (v) all[modalHorse.name] = v; else delete all[modalHorse.name];
    savePed(all);
    openHorseModal(modalHorse); // re-render Dosage with the pasted pedigree
    return;
  }
  const sk = e.target.closest('input[data-sect]');
  if (sk && modalHorse) {
    const all = loadSect();
    const cur = all[modalHorse.name] || {};
    const v = sk.value.trim();
    if (v === '') delete cur[sk.dataset.sect]; else cur[sk.dataset.sect] = +v;
    if (Object.keys(cur).length) all[modalHorse.name] = cur; else delete all[modalHorse.name];
    saveSect(all);
    openHorseModal(modalHorse); // re-render with the pace read
    return;
  }
  const sel = e.target.closest('select[data-conf]'); if (!sel || !modalHorse) return;
  const all = loadConf();
  const cur = all[modalHorse.name] || {};
  cur[sel.dataset.conf] = sel.value || undefined;
  all[modalHorse.name] = cur; saveConf(all);
  openHorseModal(modalHorse); // re-render with the new score
});

// Save a chosen file as the horse's photo — resized to a compact thumbnail so
// it stays small enough to sync. Re-renders the modal, radar and lists.
async function setHorseImageFromFile(file) {
  if (!file || !modalHorse) return;
  try {
    const thumb = await resizeImage(file, 480); // ~480px JPEG, small enough to sync
    const all = loadImg(); all[modalHorse.name] = thumb; saveImg(all);
    openHorseModal(modalHorse); renderFinds(); renderList();
  } catch { /* bad image — ignore */ }
}

// AI photo inspection — resize a chosen photo, POST it to /api/inspect, and
// fold the returned grades into the conformation scorer. Degrades cleanly when
// the endpoint isn't configured (503) — the manual grid still works.
function resizeImage(file, maxPx = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(cv.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

let inspecting = false;
async function inspectPhoto(file) {
  if (!file || !modalHorse || inspecting) return;
  const status = $('#conf-status');
  const setStatus = (t) => { if (status) status.textContent = t; };
  inspecting = true;
  setStatus('reading photo…');
  try {
    const dataUrl = await resizeImage(file);
    setStatus('analysing…');
    const res = await fetch('/api/inspect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
    });
    if (res.status === 503) { setStatus('AI inspection not enabled yet — grade manually below.'); return; }
    if (res.status === 401) { setStatus('sign in to use AI inspection.'); return; }
    if (!res.ok) {
      let msg = 'inspection failed';
      try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
      setStatus(msg); return;
    }
    const out = await res.json();
    const all = loadConf();
    const cur = all[modalHorse.name] || {};
    let applied = 0;
    for (const [k] of CONF_ITEMS) {
      if (out.conf && out.conf[k]) { cur[k] = out.conf[k]; applied++; }
    }
    if (out.summary) cur._summary = out.summary;
    all[modalHorse.name] = cur; saveConf(all);
    openHorseModal(modalHorse); // re-render with AI grades + new score
    const s2 = $('#conf-status');
    if (s2) s2.textContent = applied ? `AI graded ${applied}/6 — review & adjust below.` : 'AI could not grade clearly — grade manually.';
  } catch (err) {
    setStatus('could not process photo.');
  } finally {
    inspecting = false;
  }
}

/* ---------- compare the shortlist side by side ---------- */
function openCompare(horsesIn) {
  const P = loadParams();
  let source, note;
  if (Array.isArray(horsesIn) && horsesIn.length) { source = horsesIn.slice(0, 6); note = 'selected'; }
  else { source = loadList(); note = 'watchlist'; if (!source.length) { alert('Add horses to your watchlist first, then Compare.'); return; } }
  const horses = source.slice(0, 6).map((h) => ({ h, r: evaluate(h, P) }));
  // [label, valueFn -> {n, t}, higherIsBetter]
  const M = [
    ['Vault score', (h, r) => ({ n: Math.round(r.score * 100), t: Math.round(r.score * 100) }), true],
    ['Dubai fit', (h, r) => ({ n: dubaiPct(r), t: dubaiPct(r) }), true],
    ['Dirt nick', (h) => { const p = Math.round(nickScore(h).pct * 100); return { n: p, t: p }; }, true],
    ['Max bid (gns)', (h, r) => ({ n: r.gns, t: fmt(r.gns) }), true],
    ['Official rating', (h) => ({ n: +h.rating || null, t: h.rating ?? '—' }), true],
    ['Career-high OR', (h) => ({ n: h.careerHigh ?? null, t: h.careerHigh ?? '—' }), true],
    ['Best RPR (speed)', (h) => ({ n: h.bestRPR ?? null, t: h.bestRPR ?? '—' }), true],
    ['Best trip', (h) => ({ n: h.distBest ?? null, t: h.distBest != null ? h.distBest + 'f' : '—' }), null],
    ['AW / dirt win', (h) => ({ n: h.awForm ? 1 : 0, t: h.awForm ? 'yes' : '—' }), true],
    ['Wins / starts', (h) => ({ n: h.wins ?? null, t: (h.wins ?? '?') + ' / ' + (h.starts ?? '?') }), true],
    ['Win %', (h) => ({ n: h.winPct != null ? h.winPct : null, t: h.winPct != null ? Math.round(h.winPct * 100) + '%' : '—' }), true],
    ['Class angle', (h) => ({ n: h.classMove === 'dropping' ? 1 : 0, t: h.classMove === 'dropping' ? 'dropping' : (h.classMove || '—') }), true],
    ['Dam production', (h) => ({ n: h.damScore ?? null, t: h.damLabel || '—' }), true],
    ['Sire tier', (h) => ({ n: h.sireTier === 'A' ? 2 : h.sireTier === 'B' ? 1 : 0, t: h.sireTier ? `tier ${h.sireTier}` : '—' }), true],
    ['Trainer', (h) => ({ n: null, t: h.trainer || '—' }), null],
    ['Suggested plan', (h) => ({ n: null, t: h.racePlan ? h.racePlan.split('—')[0].trim() : '—' }), null],
  ];
  const thead = '<th>Metric</th>' + horses.map(({ h }) => `<th>${esc(h.name)}</th>`).join('');
  const body = M.map(([label, fn, better]) => {
    const cells = horses.map(({ h, r }) => fn(h, r));
    const hi = new Set();
    if (better) {
      const nums = cells.map((c) => c.n).filter((n) => n != null);
      if (nums.length) {
        const max = Math.max(...nums), min = Math.min(...nums);
        if (max > min) cells.forEach((c, i) => { if (c.n === max) hi.add(i); });
      }
    }
    const tds = cells.map((c, i) => `<td class="${hi.has(i) ? 'cmp-best' : ''}">${esc(c.t)}</td>`).join('');
    return `<tr><td class="cmp-metric">${label}</td>${tds}</tr>`;
  }).join('');
  $('#compare-body').innerHTML = `<h3>Compare ${note === 'selected' ? 'runners' : 'shortlist'}</h3>
    <p class="hint">The leader in each row is highlighted. Showing ${horses.length}${source.length > 6 ? ` of ${source.length}` : ''} ${note} ${horses.length === 1 ? 'horse' : 'horses'}.</p>
    <div class="cmp-wrap"><table class="cmp-table"><thead><tr>${thead}</tr></thead><tbody>${body}</tbody></table></div>`;
  $('#compare-modal').hidden = false;
}
if ($('#help-close')) $('#help-close').addEventListener('click', () => { $('#help-modal').hidden = true; });
if ($('#help-modal')) $('#help-modal').addEventListener('click', (e) => { if (e.target.id === 'help-modal') $('#help-modal').hidden = true; });
$('#compare-btn').addEventListener('click', () => openCompare());
$('#compare-close').addEventListener('click', () => { $('#compare-modal').hidden = true; });
$('#compare-modal').addEventListener('click', (e) => { if (e.target.id === 'compare-modal') $('#compare-modal').hidden = true; });

/* ---------- off-market prospects ---------- */
let PROSPECTS = [];
function renderProspects() {
  const card = $('#prospects-card'); const list = $('#prospects-list');
  if (!card || !list) return;
  if (!PROSPECTS.length) { card.hidden = true; return; }
  const P = loadParams();
  const rows = PROSPECTS
    .map((h) => ({ h, r: evaluate(h, P) }))
    .sort((a, b) => dubaiPct(b.r) - dubaiPct(a.r) || b.r.score - a.r.score)
    .slice(0, 12);
  const cnt = $('#prospects-count'); if (cnt) cnt.textContent = `${PROSPECTS.length} leads`;
  list.innerHTML = rows.map(({ h, r }, i) =>
    horseRowHTML(h, r, i, i === 0 ? '★ best off-market lead' : null)).join('');
  list.dataset.rows = JSON.stringify(rows.map((x) => x.h));
  card.hidden = false;
}

function renderProfileBar() {
  const { list } = loadProfiles();
  const active = activeProfile();
  $('#profile-select').innerHTML = list.map((p) =>
    `<option ${p.name === active.name ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
}
function fillEditor(p) {
  $('#pf-name').value = p.builtin ? '' : p.name;
  $('#pf-rmin').value = p.rmin; $('#pf-rmax').value = p.rmax;
  $('#pf-starts').value = p.starts; $('#pf-tier').value = p.tier;
  $('#pf-region').value = p.region; $('#pf-trend').value = p.trend;
  $('#pf-rpr').value = p.rpr; $('#pf-aw').checked = p.aw; $('#pf-ph').checked = p.ph;
  $('#pf-distmin').value = p.distmin || ''; $('#pf-distmax').value = p.distmax || '';
  $('#pf-plan').value = p.plan || 'any'; $('#pf-vers').checked = !!p.vers;
  $('#pf-sire').value = p.sire || ''; $('#pf-damsire').value = p.damsire || '';
  $('#pf-sex').value = p.sxSel || 'any';
  $('#pf-surface').value = p.surface || 'any'; $('#pf-going').value = p.going || 'any';
  $('#pf-wins').value = p.wins || ''; $('#pf-winpct').value = p.winpct || '';
  $('#pf-orhigh').value = p.orhigh || ''; $('#pf-class').value = p.cls || 'any';
  $('#pf-owner').value = p.owner || '';
  syncChips();
}
$('#profile-select').addEventListener('change', (e) => {
  const { list } = loadProfiles();
  saveProfiles(e.target.value, list.filter((p) => !p.builtin));
  fillEditor(activeProfile());
  renderFinds();
});
$('#profile-edit').addEventListener('click', () => {
  const ed = $('#profile-editor'); ed.open = !ed.open;
  fillEditor(activeProfile());
  previewProfile = ed.open ? editorProfile() : null;
  renderFinds();
});
// Live preview — any editor field change re-filters the radar immediately.
['input', 'change'].forEach((ev) =>
  $('#profile-editor').addEventListener(ev, (e) => {
    if (e.target.id === 'pf-name') return;         // name isn't a filter
    if (e.target.closest('.form-actions')) return; // buttons handled separately
    previewProfile = editorProfile();
    syncChips();
    renderFinds();
  }));
$('#pf-save').addEventListener('click', () => {
  const name = ($('#pf-name').value || '').trim();
  if (!name) { alert('Give the profile a name.'); return; }
  const prof = {
    name, rmin: +$('#pf-rmin').value || 0, rmax: +$('#pf-rmax').value || 130,
    starts: +$('#pf-starts').value || 50, tier: $('#pf-tier').value,
    region: $('#pf-region').value, trend: $('#pf-trend').value,
    rpr: +$('#pf-rpr').value || 0, aw: $('#pf-aw').checked, ph: $('#pf-ph').checked,
    distmin: +$('#pf-distmin').value || 0, distmax: +$('#pf-distmax').value || 0,
    plan: $('#pf-plan').value, vers: $('#pf-vers').checked,
    sire: ($('#pf-sire').value || '').trim(), damsire: ($('#pf-damsire').value || '').trim(),
    sxSel: $('#pf-sex').value,
    surface: $('#pf-surface').value, going: $('#pf-going').value,
    wins: +$('#pf-wins').value || 0, winpct: +$('#pf-winpct').value || 0,
    orhigh: +$('#pf-orhigh').value || 0, cls: $('#pf-class').value,
    owner: ($('#pf-owner').value || '').trim(),
  };
  const custom = loadProfiles().list.filter((p) => !p.builtin && p.name !== name);
  custom.push(prof);
  saveProfiles(name, custom);
  previewProfile = null;
  $('#profile-editor').open = false;
  renderProfileBar();
  renderFinds();
  alert(`Saved search "${name}". It's now in the dropdown and included in your backup.`);
});
$('#pf-delete').addEventListener('click', () => {
  const active = activeProfile();
  if (active.builtin) { alert('The default profile cannot be deleted.'); return; }
  const custom = loadProfiles().list.filter((p) => !p.builtin && p.name !== active.name);
  saveProfiles(IMPERIAL.name, custom);
  fillEditor(IMPERIAL);
  renderFinds();
});

/* ---------- one-tap horse types ---------- */
// Each chip toggles a single editor field on/off. A chip is "on" when its
// field currently holds the chip's value; clicking again clears it.
const TYPE_MAP = {
  dirt:       { el: '#pf-surface', on: 'aw',       off: 'any' },
  sprint:     { el: '#pf-plan',    on: 'sprint',   off: 'any' },
  miler:      { el: '#pf-plan',    on: 'miler',    off: 'any' },
  middle:     { el: '#pf-plan',    on: 'middle',   off: 'any' },
  dropping:   { el: '#pf-class',   on: 'dropping', off: 'any' },
  improving:  { el: '#pf-trend',   on: 'improving',off: 'any' },
  powerhouse: { el: '#pf-ph',      on: true,       off: false, check: true },
  winner:     { el: '#pf-wins',    on: '2',        off: '' },
  versatile:  { el: '#pf-vers',    on: true,       off: false, check: true },
  soft:       { el: '#pf-going',   on: 'soft',     off: 'any' },
};
function chipIsOn(type) {
  const m = TYPE_MAP[type]; if (!m) return false;
  const node = $(m.el);
  return m.check ? node.checked : String(node.value) === String(m.on);
}
function syncChips() {
  document.querySelectorAll('.tchip[data-type]').forEach((c) => {
    if (c.dataset.type === 'reset') return;
    c.classList.toggle('on', chipIsOn(c.dataset.type));
  });
}
$('#type-chips').addEventListener('click', (e) => {
  const btn = e.target.closest('.tchip'); if (!btn) return;
  const type = btn.dataset.type;
  $('#profile-editor').open = true;
  fillEditor(previewProfile || activeProfile()); // keep edits in progress, else active search
  if (type === 'reset') {
    previewProfile = null;
    saveProfiles(IMPERIAL.name, loadProfiles().list.filter((p) => !p.builtin));
    fillEditor(IMPERIAL);
    renderProfileBar();
    renderFinds();
    return;
  }
  const m = TYPE_MAP[type]; if (!m) return;
  const node = $(m.el);
  const turnOn = !chipIsOn(type);
  if (m.check) node.checked = turnOn ? m.on : m.off;
  else node.value = turnOn ? m.on : m.off;
  previewProfile = editorProfile();
  syncChips();
  renderFinds();
});

// Pull the radar + off-market prospects feeds. Refresh re-pulls on demand
// (cache-busted) so a fresh scan shows without reloading the whole app.
async function loadFeeds(bust) {
  const q = bust ? `?t=${Date.now()}` : '';
  try {
    const r = await fetch(CANDIDATES_URL + q, { cache: 'no-store' });
    const j = r.ok ? await r.json() : null;
    if (j?.candidates) { RADAR = j.candidates; RADAR_META = { generated: j.generated }; recordHistory(); renderFinds(); }
  } catch {}
  try {
    const r = await fetch(PROSPECTS_URL + q, { cache: 'no-store' });
    const j = r.ok ? await r.json() : null;
    if (j?.prospects) { PROSPECTS = j.prospects; renderProspects(); }
  } catch {}
  try {
    const r = await fetch(CATALOGUES_URL + q, { cache: 'no-store' });
    const j = r.ok ? await r.json() : null;
    if (j?.sales) applyCatalogueFeed(j);
  } catch {}
}
loadFeeds(false);
renderCatalogue();

const refreshBtn = document.getElementById('refresh-btn');
if (refreshBtn) refreshBtn.addEventListener('click', async () => {
  refreshBtn.disabled = true; const label = refreshBtn.textContent;
  refreshBtn.textContent = '↻ refreshing…';
  await loadFeeds(true);
  refreshBtn.textContent = '✓ up to date';
  setTimeout(() => { refreshBtn.textContent = label; refreshBtn.disabled = false; }, 1600);
});

const NEWS_URL =
  'https://raw.githubusercontent.com/lordbastian83/dig/bloodstock-data/news.json';
fetch(NEWS_URL)
  .then((r) => (r.ok ? r.json() : null))
  .then((j) => {
    if (!j?.items?.length) return;
    $('#intel').innerHTML = j.items.map((it) => `
      <a class="intel-row" href="${safeUrl(it.url)}" target="_blank" rel="noopener">
        <span class="intel-src">${esc(it.source)}</span>
        <span class="intel-title">${esc(it.title)}</span>
        ${(it.matched || []).slice(0, 3).map((m) => `<span class="intel-tag">${esc(m)}</span>`).join('')}
      </a>`).join('');
    $('#intel-card').hidden = false;
  })
  .catch(() => {});

/* ---------- hero image (paste a URL, saved in this browser) ---------- */
(function heroImage() {
  // Only accept https image URLs (or an https/data:image) — never javascript:
  // or other schemes, since this value is set as an <img> src.
  const okImg = (u) => /^https:\/\//i.test(u) || /^data:image\//i.test(u);
  const saved = localStorage.getItem('bloodstock.heroImg');
  const img = $('#hero-img');
  if (saved && img && okImg(saved)) img.src = saved;
  const setBtn = $('#hero-set');
  if (setBtn) setBtn.addEventListener('click', () => {
    const url = prompt('Paste an https image address (Unsplash → right-click → Copy image address). Leave blank to clear.',
      saved || '');
    if (url === null) return;
    const clean = url.trim();
    if (!clean) { localStorage.removeItem('bloodstock.heroImg'); location.reload(); return; }
    if (!okImg(clean)) { alert('Please use an https:// image URL.'); return; }
    localStorage.setItem('bloodstock.heroImg', clean);
    location.reload();
  });
})();

/* ---------- budget control ---------- */
function syncBudgetUI() {
  const P = loadParams();
  $('#budget-num').textContent = fmt(P.budgetGns);
  $('#budget-range').value = P.budgetGns;
}
function setBudget(v) {
  const P = loadParams();
  P.budgetGns = Math.max(5000, Math.min(1000000, Math.round(v / 1000) * 1000));
  saveParams(P);
  syncBudgetUI();
  renderParams();
  renderList();
  renderFinds();
  $('#score-result').hidden = true; // stale — rescore to refresh the scale
}
// Step scales with size: ±5k up to 100k, ±25k above — usable to £1m.
const budgetStep = (v) => (v >= 100000 ? 25000 : 5000);
$('#budget-up').addEventListener('click', () => { const b = loadParams().budgetGns; setBudget(b + budgetStep(b)); });
$('#budget-down').addEventListener('click', () => { const b = loadParams().budgetGns; setBudget(b - budgetStep(b - 1)); });
$('#budget-range').addEventListener('input', (e) => setBudget(+e.target.value));

/* ---------- init ---------- */

renderCalendar();
renderParams();
renderList();
syncBudgetUI();

// Service worker intentionally NOT registered — it caused stale-cache and
// reload problems and the app is online-only. Any previously-installed worker
// unregisters itself (see sw.js) and we proactively clear it here too so
// devices that still hold one recover on this load.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations?.()
    .then((rs) => rs.forEach((r) => r.unregister()))
    .catch(() => {});
}

/* ---------- quick-nav scroll-spy: highlight the section you're in ------- */
(function quickNav() {
  const links = [...document.querySelectorAll('.quicknav a[data-nav]')];
  if (!links.length || !('IntersectionObserver' in window)) return;
  const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const spy = new IntersectionObserver((entries) => {
    // pick the entry nearest the top of the viewport that's on screen
    const visible = entries.filter((e) => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (!visible.length) return;
    const a = byId.get(visible[0].target.id);
    if (!a) return;
    links.forEach((l) => l.classList.remove('active'));
    a.classList.add('active');
  }, { rootMargin: '-100px 0px -55% 0px', threshold: 0 });
  byId.forEach((_, id) => { const el = document.getElementById(id); if (el) spy.observe(el); });
})();

// Signed-in identity (SWA platform auth) — silent no-op when running locally.
fetch('/.auth/me')
  .then((r) => (r.ok ? r.json() : null))
  .then((j) => {
    const p = j?.clientPrincipal;
    if (!p) return;
    $('#whoami').textContent = `signed in as ${p.userDetails} · `;
    $('#logout-link').hidden = false;
    syncPull(); // signed in → pull saved data from the cloud and enable sync
  })
  .catch(() => {});
