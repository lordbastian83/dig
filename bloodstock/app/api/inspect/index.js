/* vault racing — AI conformation inspection.
   POST /api/inspect  { image: "data:image/jpeg;base64,..." }
     → sends the photo to a vision model and returns a structured
       conformation assessment the app's scorer can consume.

   The user is identified from the SWA-injected x-ms-client-principal header
   (their Entra/Microsoft id) — the endpoint is sign-in gated, same as /data.

   The model key NEVER touches the client. Configure via app settings:
     INSPECT_API_URL  — OpenAI-compatible chat/completions endpoint, e.g.
                        https://api.openai.com/v1/chat/completions
                        or an Azure OpenAI deployment URL
                        (…/openai/deployments/<name>/chat/completions?api-version=…)
     INSPECT_API_KEY  — the API key / Azure key
     INSPECT_MODEL    — model name (default 'gpt-4o-mini'); ignored by Azure
                        OpenAI, which takes the model from the deployment URL
     INSPECT_AUTH     — 'bearer' (default, OpenAI) or 'api-key' (Azure OpenAI)

   Returns 503 (not an error) when unconfigured, so the app degrades to the
   manual conformation scorer without breaking. */

const API_URL = process.env.INSPECT_API_URL;
const API_KEY = process.env.INSPECT_API_KEY;
const MODEL   = process.env.INSPECT_MODEL || 'gpt-4o-mini';
const AUTH    = (process.env.INSPECT_AUTH || 'bearer').toLowerCase();

// The six conformation items the app already scores, and the grades it expects.
const ITEMS = ['shoulder', 'pasterns', 'hoofpastern', 'limb', 'walk', 'balance'];
const GRADES = ['ideal', 'mild', 'notable'];

const SYSTEM_PROMPT = [
  'You are an experienced thoroughbred bloodstock inspector assessing conformation',
  'from a single photograph for a flat-racing (dirt/all-weather) purchase.',
  'Grade what is VISIBLE ONLY. If a feature cannot be judged from the photo, mark it "unseen".',
  'Be conservative: do not invent faults you cannot see, and do not over-praise.',
  '',
  'Return STRICT JSON only (no prose, no markdown fences) with this exact shape:',
  '{',
  '  "conf": {',
  '    "shoulder": "ideal|mild|notable|unseen",',
  '    "pasterns": "ideal|mild|notable|unseen",',
  '    "hoofpastern": "ideal|mild|notable|unseen",',
  '    "limb": "ideal|mild|notable|unseen",',
  '    "walk": "ideal|mild|notable|unseen",',
  '    "balance": "ideal|mild|notable|unseen"',
  '  },',
  '  "summary": "one or two plain sentences on the horse\'s physical stamp",',
  '  "notes": { "shoulder": "short reason", "pasterns": "...", "hoofpastern": "...", "limb": "...", "walk": "...", "balance": "..." }',
  '}',
  'Grades: "ideal" = correct/athletic, "mild" = minor deviation, "notable" = a real concern.',
  'A still photo cannot show the walk — grade "walk" only if a video frame implies action, else "unseen".',
].join('\n');

function userIdFrom(req) {
  const header = req.headers['x-ms-client-principal'];
  if (!header) return null;
  try {
    const p = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
    return p && p.userId ? p.userId : null;
  } catch { return null; }
}

// Pull the first JSON object out of a model reply, tolerating ```json fences
// or leading/trailing prose.
function parseModelJSON(text) {
  if (!text) return null;
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch { return null; }
}

// Coerce whatever the model returned into the exact shape the app expects,
// dropping anything unrecognised so a stray grade can't corrupt the scorer.
function normalise(obj) {
  const src = (obj && typeof obj === 'object') ? obj : {};
  const rawConf = (src.conf && typeof src.conf === 'object') ? src.conf : {};
  const rawNotes = (src.notes && typeof src.notes === 'object') ? src.notes : {};
  const conf = {};
  const notes = {};
  for (const k of ITEMS) {
    const g = String(rawConf[k] || '').toLowerCase();
    if (GRADES.includes(g)) conf[k] = g;      // 'unseen' / unknown → leave unset
    const n = rawNotes[k];
    if (typeof n === 'string' && n.trim()) notes[k] = n.trim().slice(0, 240);
  }
  const summary = (typeof src.summary === 'string') ? src.summary.trim().slice(0, 600) : '';
  return { conf, notes, summary };
}

module.exports = async function (context, req) {
  const uid = userIdFrom(req);
  if (!uid) { context.res = { status: 401, body: { error: 'not signed in' } }; return; }

  if (!API_URL || !API_KEY) {
    context.res = { status: 503, body: { error: 'photo inspection not configured (INSPECT_API_URL / INSPECT_API_KEY missing)' } };
    return;
  }

  const image = req.body && req.body.image;
  if (typeof image !== 'string' || !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image)) {
    context.res = { status: 400, body: { error: 'send { image: "data:image/jpeg;base64,..." }' } };
    return;
  }
  // ~7MB data-URL ceiling (roughly a 5MB photo) — the client resizes first.
  if (image.length > 7_000_000) {
    context.res = { status: 413, body: { error: 'image too large — resize before sending' } };
    return;
  }

  const payload = {
    model: MODEL,
    max_tokens: 700,
    temperature: 0.2,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: [
        { type: 'text', text: 'Assess this thoroughbred\'s conformation for a dirt/all-weather flat purchase. JSON only.' },
        { type: 'image_url', image_url: { url: image, detail: 'high' } },
      ] },
    ],
  };

  const headers = { 'content-type': 'application/json' };
  if (AUTH === 'api-key') headers['api-key'] = API_KEY;       // Azure OpenAI
  else headers['authorization'] = 'Bearer ' + API_KEY;        // OpenAI-compatible

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    let resp;
    try {
      resp = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(payload), signal: ctrl.signal });
    } finally { clearTimeout(timer); }

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      context.log('inspect: model error', resp.status, detail.slice(0, 300));
      context.res = { status: 502, body: { error: 'vision model error (' + resp.status + ')' } };
      return;
    }

    const data = await resp.json();
    const text = data && data.choices && data.choices[0] &&
      data.choices[0].message && data.choices[0].message.content;
    const parsed = parseModelJSON(text);
    if (!parsed) {
      context.res = { status: 502, body: { error: 'could not parse model response' } };
      return;
    }

    const result = normalise(parsed);
    result.model = MODEL;
    context.res = { status: 200, headers: { 'content-type': 'application/json' }, body: result };
  } catch (err) {
    const aborted = err && (err.name === 'AbortError');
    context.log('inspect: exception', String(err && err.message || err));
    context.res = { status: aborted ? 504 : 500, body: { error: aborted ? 'vision model timed out' : 'inspection failed' } };
  }
};
