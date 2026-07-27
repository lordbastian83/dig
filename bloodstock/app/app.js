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
function currentBlob() {
  return { v: 1, updated: Date.now(),
    watchlist: loadList(),
    params: JSON.parse(localStorage.getItem(LS_PARAMS) || '{}'),
    profiles: JSON.parse(localStorage.getItem(LS_PROFILES) || '{}'),
    heroImg: localStorage.getItem('bloodstock.heroImg') || '' };
}
function applyBlob(b) {
  if (!b || typeof b !== 'object') return false;
  if (Array.isArray(b.watchlist)) localStorage.setItem(LS_LIST, JSON.stringify(b.watchlist));
  if (b.params) localStorage.setItem(LS_PARAMS, JSON.stringify(b.params));
  if (b.profiles) localStorage.setItem(LS_PROFILES, JSON.stringify(b.profiles));
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

const { evaluate, expectedPrice: engineExpectedPrice } = globalThis.VaultRacingEngine;
const expectedPrice = (h) => engineExpectedPrice(h, MEDIANS);

/* ---------- rendering ---------- */

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => n.toLocaleString('en-GB', { maximumFractionDigits: 0 });
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
    <h3>${h.name} — <span class="${r.verdict === 'BID' ? 'verdict-bid' : 'verdict-reject'}">${r.verdict}</span>
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

function renderList() {
  const P = loadParams();
  const tbody = $('#watchlist tbody');
  const list = loadList();
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">Nothing scanned yet — score a lot above.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map((h, i) => {
    const r = evaluate(h, P);
    const exp = expectedPrice(h);
    const gap = exp ? r.gns - exp.gns : null;
    const opts = STATUSES.map((s) =>
      `<option ${h.status === s ? 'selected' : ''}>${s}</option>`).join('');
    return `<tr class="${r.verdict === 'BID' ? '' : 'row-reject'}">
      <td><b>${h.name}</b>${h.lot ? ' (lot ' + h.lot + ')' : ''}${h.grade ? ` <span class="grade-badge">${h.grade}</span>` : ''}<br>
          <small>${h.sire || '?'} × ${h.dam || '?'} · ${h.vendor || '?'}</small>
          ${h.notes ? `<small class="note-preview">✎ ${h.notes.slice(0, 70)}${h.notes.length > 70 ? '…' : ''}</small>` : ''}</td>
      <td>${h.sale}</td>
      <td>${h.rating}</td>
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
              placeholder="physical inspection, wind, walk, who else was looking…">${h.notes || ''}</textarea>
          </label>
          <button class="primary edit-save" data-i="${i}">Save</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

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
      <td><b>${h.name}</b>${h.grade ? ` <span class="g">${h.grade}</span>` : ''}<br>
        <span class="sub">${h.sire || '?'} × ${h.dam || '?'} · ${h.vendor || '?'}</span>
        ${h.racePlan ? `<br><span class="sub">🏁 ${h.racePlan}</span>` : ''}
        ${h.notes ? `<br><span class="note">${h.notes}</span>` : ''}</td>
      <td class="n">${h.rating}${h.rprEdge >= 5 ? `<br><span class="sub">RPR +${h.rprEdge}</span>` : ''}</td>
      <td>${r.verdict === 'BID' ? 'PASS 6/6' : (6 - r.fails.length) + '/6'}<br><span class="sub">vs ${Math.round(r.score * 100)}</span></td>
      <td class="n gold">${fmt(r.gns)}</td>
      <td class="n">${gap == null ? '—' : (gap >= 0 ? '+' : '') + fmt(gap)}</td>
      <td>${h.status}</td>
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
  if (p.sex && p.sex !== 'any' && h.sex) {
    const isFilly = /f|m/i.test(h.sex);
    if (p.sex === 'filly' && !isFilly) return false;
    if (p.sex === 'colt' && isFilly) return false;
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
    sex: $('#pf-sex').value,
    surface: $('#pf-surface').value, going: $('#pf-going').value,
    wins: +$('#pf-wins').value || 0, winpct: +$('#pf-winpct').value || 0,
    orhigh: +$('#pf-orhigh').value || 0, cls: $('#pf-class').value,
    owner: ($('#pf-owner').value || '').trim(),
  };
}

let RADAR = [];
let RADAR_META = {};
function renderFinds() {
  const card = $('#finds-card');
  if (!RADAR.length) { card.hidden = true; return; }
  const P = loadParams();
  const prof = previewProfile || activeProfile();
  const rows = RADAR
    .filter((h) => matchesProfile(h, prof))
    .map((h) => ({ h, r: evaluate(h, P) }))
    // Rank by vault score (the intelligence), then value gap, then bid —
    // so the best horse floats to the top and the order is meaningful.
    .sort((a, b) => {
      if (Math.round(b.r.score * 100) !== Math.round(a.r.score * 100))
        return b.r.score - a.r.score;
      const ga = a.r.gns - (expectedPrice(a.h)?.gns ?? a.r.gns);
      const gb = b.r.gns - (expectedPrice(b.h)?.gns ?? b.r.gns);
      return gb - ga;
    })
    .slice(0, 40);
  renderProfileBar();
  const scanDate = RADAR_META.generated || '—';
  const header = `<p class="finds-meta">Scanned <b>${scanDate}</b> · ${RADAR.length} horses swept ·
    showing ${rows.length} for "${prof.name}" ranked by vault score</p>`;
  if (!rows.length) {
    $('#finds').innerHTML = header +
      `<p class="empty">No radar finds match "${prof.name}". Loosen the filters (⚙ Profiles) or wait for tomorrow's scan.</p>`;
    card.hidden = false;
    return;
  }
  const statLine = (h) => {
    const bits = [];
    if (h.trainer || /trainer ([^·]+)/.exec(h.notes || '')) {
      const t = h.trainer || (/trainer ([^·]+)/.exec(h.notes)?.[1] || '').trim();
      if (t) bits.push(['Trainer', t]);
    }
    if (h.region) bits.push(['Region', h.region]);
    if (h.distMin != null) bits.push(['Trip range', `${h.distMin}–${h.distMax}f`]);
    if (h.distBest != null) bits.push(['Best trip', `${h.distBest}f`]);
    if (h.racePlan) bits.push(['Suggested', h.racePlan]);
    if (+h.rprEdge) bits.push(['RPR edge', `${h.rprEdge > 0 ? '+' : ''}${h.rprEdge} over OR`]);
    if (h.trend) bits.push(['OR trend', h.trend]);
    if (h.damLabel) bits.push(['Dam production', h.damLabel]);
    if (h.classMove) bits.push(['Class', h.classMove === 'dropping' ? 'dropping (well-in)' : h.classMove]);
    if (h.consistency != null) bits.push(['Consistency', `${Math.round(h.consistency * 100)}% placed`]);
    if (h.trainerSR != null) bits.push(['Trainer SR', `${Math.round(h.trainerSR * 100)}%`]);
    if (h.versatile) bits.push(['Note', 'versatile over a wide trip range']);
    return bits.map(([k, v]) => `<div><span class="sk">${k}</span> ${v}</div>`).join('');
  };
  const tier = (s) => s >= 0.85 ? ['★ diamond', 'tier-diamond']
    : s >= 0.7 ? ['strong', 'tier-strong']
    : s >= 0.5 ? ['live', 'tier-live'] : ['watch', 'tier-watch'];
  $('#finds').innerHTML = header + rows.map(({ h, r }, i) => {
    const [tl, tc] = tier(r.score);
    return `
    <div class="find-row">
      <div class="find-score ${tc}"><span class="fs-num">${Math.round(r.score * 100)}</span><span class="fs-lab">${tl}</span></div>
      <div class="find-main">
        <b class="find-name" data-i="${i}" title="Click for full profile">${h.name}</b> <small>${h.sire} × ${h.dam || '?'} · ${h.vendor || '?'}</small>
        <small>OR <span class="mono">${h.rating}</span>${h.trend && h.trend !== 'flat' ? ` <span class="trend-${h.trend}">${h.trend === 'improving' ? '▲' : '▼'}</span>` : ''}${+h.rprEdge >= 5 ? ` · <span class="rpr-edge">RPR +${h.rprEdge}</span>` : ''} · ${h.starts} starts${h.awForm ? ' · AW win' : ''}${h.distBest ? ` · ${h.distBest}f` : ''}</small>
        ${h.racePlan ? `<small class="race-plan">🏁 ${h.racePlan}</small>` : ''}
        <button class="find-profile" data-i="${i}">view full profile →</button>
      </div>
      <div class="find-bid">${fmt(r.gns)} <small>gns max</small></div>
      <button class="find-add" data-i="${i}">→ watchlist</button>
    </div>`; }).join('');
  $('#finds').dataset.rows = JSON.stringify(rows.map((x) => x.h));
  card.hidden = false;
}

/* ---------- horse profile modal — everything we know ---------- */
function openHorseModal(h) {
  const P = loadParams();
  const r = evaluate(h, P);
  const exp = expectedPrice(h);
  const gap = exp ? r.gns - exp.gns : null;
  const row = (k, v) => v == null || v === '' ? '' : `<div class="mp-row"><span class="mp-k">${k}</span><span class="mp-v">${v}</span></div>`;
  const section = (title, rows) => rows.filter(Boolean).length
    ? `<h4>${title}</h4><div class="mp-grid">${rows.join('')}</div>` : '';
  const money = (n) => n ? '£' + fmt(n) : null;
  $('#modal-body').innerHTML = `
    <div class="mp-head">
      <h3>${h.name}</h3>
      <span class="mp-score">vault score ${Math.round(r.score * 100)}</span>
    </div>
    <p class="mp-sub">${h.sire || '?'} × ${h.dam || '?'} · ${h.vendor || '?'}${h.trainer ? ` · ${h.trainer}` : ''}</p>

    <div class="mp-headline">
      <div><span class="mp-big">${fmt(r.gns)}</span><span class="mp-lab">max bid (gns)</span></div>
      <div><span class="mp-big">${h.rating ?? '?'}</span><span class="mp-lab">official rating</span></div>
      <div><span class="mp-big">${h.bestRPR ?? h.careerHigh ?? '—'}</span><span class="mp-lab">${h.bestRPR != null ? 'best RPR (speed)' : 'career-high OR'}</span></div>
      <div><span class="mp-big ${r.verdict === 'BID' ? 'ok' : ''}">${r.verdict === 'BID' ? 'PASS' : (6 - r.fails.length) + '/6'}</span><span class="mp-lab">screen</span></div>
    </div>

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
      row('Versatile', h.versatile ? 'yes — wide trip range' : null),
    ])}
    ${section('Achievement &amp; record', [
      row('Starts', h.starts), row('Wins', h.wins), row('Placed', h.placed),
      row('Win %', h.winPct != null ? `${Math.round(h.winPct * 100)}%` : null),
      row('Consistency (placed)', h.consistency != null ? `${Math.round(h.consistency * 100)}%` : null),
      row('Best win', h.bestWin), row('Prize money', money(h.earnings)),
      row('AW win', h.awForm ? 'yes' : 'no'), row('Class', h.classMove === 'dropping' ? 'dropping (well-in)' : h.classMove),
    ])}
    ${section('Pedigree &amp; connections', [
      row('Sire', h.sire), row('Sire tier', h.sireTier === 'A' ? 'A — proven dirt' : h.sireTier === 'B' ? 'B — dirt damsire' : '—'),
      row('Dam', h.dam), row('Dam production', h.damLabel),
      row('Owner', h.vendor), row('Powerhouse', h.powerhouse ? 'yes' : 'no'),
      row('Trainer', h.trainer), row('Trainer strike-rate', h.trainerSR != null ? `${Math.round(h.trainerSR * 100)}%` : null),
      row('Region', h.region), row('Sex', h.sex),
    ])}
    ${section('Valuation', [
      row('Max bid', `${fmt(r.gns)} gns`), row('Expected hammer', exp ? `${fmt(exp.gns)} gns${exp.est ? ' (est)' : ''}` : '—'),
      row('Value gap', gap == null ? '—' : `${gap >= 0 ? '+' : ''}${fmt(gap)} gns`),
      row('Vet', h.vet === 'clean' ? 'clean' : '−20% applied (not clean)'),
    ])}

    <div class="mp-flags">
      ${r.fails.length ? `<b>Fails:</b> ${r.fails.join('; ')}. ` : '<b class="ok">Passes all six filters.</b> '}
      Black type &amp; availability need a human check.
    </div>
    <button class="primary mp-add" data-name="${encodeURIComponent(h.name)}">→ add to watchlist</button>`;
  $('#horse-modal').hidden = false;
}

$('#finds').addEventListener('click', (e) => {
  const t = e.target.closest('.find-name, .find-profile');
  if (!t) return;
  const rows = JSON.parse($('#finds').dataset.rows || '[]');
  const h = rows[+t.dataset.i];
  if (h) openHorseModal(h);
});
$('#modal-close').addEventListener('click', () => { $('#horse-modal').hidden = true; });
$('#horse-modal').addEventListener('click', (e) => {
  if (e.target.id === 'horse-modal') $('#horse-modal').hidden = true; // click backdrop
  if (e.target.matches('.mp-add')) {
    const name = decodeURIComponent(e.target.dataset.name);
    const rows = JSON.parse($('#finds').dataset.rows || '[]');
    const h = rows.find((x) => x.name === name);
    if (!h) return;
    const list = loadList();
    if (list.some((x) => x.name.toLowerCase() === h.name.toLowerCase())) { alert(`${h.name} is already on the watchlist.`); return; }
    list.unshift(h); saveList(list); renderList();
    e.target.textContent = '✓ added to watchlist';
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.matches('.find-add')) return;
  const rows = JSON.parse($('#finds').dataset.rows || '[]');
  const h = rows[+e.target.dataset.i];
  if (!h) return;
  const list = loadList();
  if (list.some((x) => x.name.toLowerCase() === h.name.toLowerCase())) {
    alert(`${h.name} is already on the watchlist.`); return;
  }
  list.unshift(h);
  saveList(list);
  renderList();
  e.target.textContent = '✓ added';
});

function renderProfileBar() {
  const { list } = loadProfiles();
  const active = activeProfile();
  $('#profile-select').innerHTML = list.map((p) =>
    `<option ${p.name === active.name ? 'selected' : ''}>${p.name}</option>`).join('');
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
  $('#pf-sex').value = p.sex || 'any';
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
    sex: $('#pf-sex').value,
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

fetch(CANDIDATES_URL)
  .then((r) => (r.ok ? r.json() : null))
  .then((j) => { if (j?.candidates) { RADAR = j.candidates; RADAR_META = { generated: j.generated }; renderFinds(); } })
  .catch(() => {}); // offline / not yet published — card stays hidden

const NEWS_URL =
  'https://raw.githubusercontent.com/lordbastian83/dig/bloodstock-data/news.json';
fetch(NEWS_URL)
  .then((r) => (r.ok ? r.json() : null))
  .then((j) => {
    if (!j?.items?.length) return;
    $('#intel').innerHTML = j.items.map((it) => `
      <a class="intel-row" href="${it.url}" target="_blank" rel="noopener">
        <span class="intel-src">${it.source}</span>
        <span class="intel-title">${it.title}</span>
        ${(it.matched || []).slice(0, 3).map((m) => `<span class="intel-tag">${m}</span>`).join('')}
      </a>`).join('');
    $('#intel-card').hidden = false;
  })
  .catch(() => {});

/* ---------- hero image (paste a URL, saved in this browser) ---------- */
(function heroImage() {
  const saved = localStorage.getItem('bloodstock.heroImg');
  const img = $('#hero-img');
  if (saved && img) img.src = saved;
  const setBtn = $('#hero-set');
  if (setBtn) setBtn.addEventListener('click', () => {
    const url = prompt('Paste an image address (Unsplash → right-click → Copy image address, or any https image URL). Leave blank to clear.',
      saved || '');
    if (url === null) return;
    if (!url.trim()) { localStorage.removeItem('bloodstock.heroImg'); location.reload(); return; }
    localStorage.setItem('bloodstock.heroImg', url.trim());
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

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

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
