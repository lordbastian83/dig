/* vault racing — per-user sync store.
   GET  /api/data  → returns this user's saved blob ({} if none)
   POST /api/data  → saves this user's blob (body is the JSON to store)

   The user is identified from the SWA-injected x-ms-client-principal header
   (their Entra/Microsoft id) — no id from the client is trusted. Data lives
   in one Azure Table row per user. Needs the app setting
   AZURE_STORAGE_CONNECTION (a storage account connection string). */

const { TableClient } = require('@azure/data-tables');

const TABLE = 'vaultracing';
const conn = process.env.AZURE_STORAGE_CONNECTION;

function userIdFrom(req) {
  const header = req.headers['x-ms-client-principal'];
  if (!header) return null;
  try {
    const p = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
    return p && p.userId ? p.userId : null;
  } catch { return null; }
}

module.exports = async function (context, req) {
  const uid = userIdFrom(req);
  if (!uid) { context.res = { status: 401, body: { error: 'not signed in' } }; return; }
  if (!conn) { context.res = { status: 503, body: { error: 'sync not configured (AZURE_STORAGE_CONNECTION missing)' } }; return; }

  const client = TableClient.fromConnectionString(conn, TABLE);
  try { await client.createTable(); } catch { /* exists */ }

  if (req.method === 'GET') {
    try {
      const e = await client.getEntity('user', uid);
      context.res = { status: 200, headers: { 'content-type': 'application/json' },
        body: e.blob ? JSON.parse(e.blob) : {} };
    } catch {
      context.res = { status: 200, body: {} }; // no row yet
    }
    return;
  }

  // POST — save
  try {
    const blob = JSON.stringify(req.body ?? {});
    if (blob.length > 900000) { context.res = { status: 413, body: { error: 'too large' } }; return; }
    await client.upsertEntity({ partitionKey: 'user', rowKey: uid, blob, updated: new Date().toISOString() }, 'Replace');
    context.res = { status: 200, body: { ok: true } };
  } catch (err) {
    context.res = { status: 500, body: { error: String(err && err.message || err) } };
  }
};
