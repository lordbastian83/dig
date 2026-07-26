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

const SALES = [
  { name: 'Goffs UK Premier Yearling Sale, Doncaster', date: '2026-08-25',
    note: 'Opportunistic only — yearling EV cap £13,500 (see investment-analysis-2026-07.md)' },
  { name: 'Tattersalls Autumn HIT catalogue expected online', date: '2026-10-06',
    note: 'Run the 6-filter screen over the full catalogue the day it drops', est: true },
  { name: 'Tattersalls Autumn Horses-in-Training Sale', date: '2026-10-28',
    note: 'PRIMARY VENUE — Godolphin & powerhouse drafts. Hard limit 56,000 gns clean vet' },
  { name: 'Dubai World Cup Carnival opens, Meydan', date: '2026-11-06',
    note: 'Campaign destination for the export play', est: true },
];

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

/* ---------- valuation engine ---------- */

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

/* ---------- rendering ---------- */

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => n.toLocaleString('en-GB', { maximumFractionDigits: 0 });
const pct = (p) => (p * 100).toFixed(0) + '%';

function renderCalendar() {
  const now = Date.now();
  $('#calendar').innerHTML = SALES.map((s) => {
    const t = new Date(s.date + 'T00:00:00Z').getTime();
    const days = Math.ceil((t - now) / 86400000);
    const when = days > 0 ? `in ${days} day${days === 1 ? '' : 's'}`
               : days > -5 ? 'NOW' : 'past';
    return `<div class="cal-row ${days <= 0 && days > -5 ? 'live' : ''}">
      <span class="cal-date">${s.date}${s.est ? ' (est.)' : ''}</span>
      <span class="cal-name">${s.name}</span>
      <span class="cal-count">${when}</span>
      <span class="cal-note">${s.note}</span>
    </div>`;
  }).join('');
}

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
    tbody.innerHTML = '<tr><td colspan="7" class="empty">Nothing scanned yet — score a lot above.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map((h, i) => {
    const r = evaluate(h, P);
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
