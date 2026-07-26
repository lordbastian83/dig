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
function saveParams(p) { localStorage.setItem(LS_PARAMS, JSON.stringify(p)); }

function loadList() { return JSON.parse(localStorage.getItem(LS_LIST) || '[]'); }
function saveList(list) { localStorage.setItem(LS_LIST, JSON.stringify(list)); }

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
    <h3>${h.name} — <span class="${r.verdict === 'BID' ? 'verdict-bid' : 'verdict-reject'}">${r.verdict}</span></h3>
    <ul class="check-list">${checkRows}</ul>
    ${r.verdict === 'BID'
      ? `<p class="max-bid">Hard max bid: <b>${fmt(r.gns)} gns</b></p>`
      : `<p class="max-bid">Fails: ${r.fails.join('; ')}. Reference value if filters cleared: ${fmt(r.gns)} gns.</p>`}
    ${(() => {
      const exp = expectedPrice(h);
      if (!exp) return '<p class="hint">No sire comp yet — expected price unavailable (add via comps pipeline).</p>';
      const gap = r.gns - exp.gns;
      return `<p>Expected hammer: ~${fmt(exp.gns)} gns${exp.est ? ' (est)' : ''} →
        value gap <b class="${gap >= 0 ? 'verdict-bid' : 'verdict-reject'}">${gap >= 0 ? '+' : ''}${fmt(gap)} gns</b>
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
      <td><b>${h.name}</b>${h.lot ? ' (lot ' + h.lot + ')' : ''}<br>
          <small>${h.sire || '?'} × ${h.dam || '?'} · ${h.vendor || '?'}</small></td>
      <td>${h.sale}</td>
      <td>${h.rating}</td>
      <td class="${r.verdict === 'BID' ? 'verdict-bid' : 'verdict-reject'}">
          ${r.verdict === 'BID' ? 'PASS 6/6' : (6 - r.fails.length) + '/6'}</td>
      <td class="bid-cell">${fmt(r.gns)}${r.vetClean ? '' : ' ⚠'}</td>
      <td class="gap-cell">${gap == null ? '<small>no comp</small>'
        : `<span class="${gap >= 0 ? 'verdict-bid' : 'verdict-reject'}">${gap >= 0 ? '+' : ''}${fmt(gap)}</span>
           <small>exp ${fmt(exp.gns)}${exp.est ? ' est' : ''}</small>`}</td>
      <td><select data-i="${i}" class="status-sel">${opts}</select></td>
      <td><button data-i="${i}" class="del-btn" title="Remove">✕</button></td>
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

function readForm(form) {
  const f = new FormData(form);
  return {
    name: (f.get('name') || '').trim(),
    sale: f.get('sale'), lot: (f.get('lot') || '').trim(),
    sire: (f.get('sire') || '').trim(), dam: (f.get('dam') || '').trim(),
    vendor: (f.get('vendor') || '').trim(),
    rating: +f.get('rating'), starts: +f.get('starts'),
    sireTier: f.get('sireTier'), vet: f.get('vet'),
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
  form.sireTier.value = 'A';
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
    'sireTier','vet','powerhouse','blackType','awForm','screen','maxBidGns','status','notes'];
  const rows = loadList().map((h) => {
    const r = evaluate(h, P);
    return [h.name, h.lot, h.sale, h.sire, h.dam, h.vendor, h.rating, h.starts,
      h.sireTier, h.vet, h.powerhouse, h.blackType, h.awForm,
      r.verdict === 'BID' ? 'PASS' : 'FAIL: ' + r.fails.join('|'),
      r.gns, h.status, h.notes]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
  });
  download('bloodstock-watchlist.csv', 'text/csv', [head.join(','), ...rows].join('\n'));
});

$('#export-json').addEventListener('click', () =>
  download('bloodstock-watchlist.json', 'application/json',
    JSON.stringify({ params: loadParams(), watchlist: loadList() }, null, 2)));

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
    renderParams();
    renderList();
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

/* ---------- init ---------- */

renderCalendar();
renderParams();
renderList();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
