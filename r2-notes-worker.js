// Cloudflare Worker: authenticated gateway between the app and a PRIVATE R2 bucket.
// Bindings / secrets (never ship these to the browser):
//   R2                   -> R2 bucket binding (private; do NOT enable public access)
//   SUPABASE_URL         -> https://<project>.supabase.co
//   SUPABASE_ANON_KEY    (public anon key, used to validate the caller's JWT)
//   SUPABASE_SERVICE_KEY (secret; only used for confirm_upload / release_file)
//   ALLOWED_ORIGIN       -> your site origin, e.g. https://example.github.io
// Routes (all require "Authorization: Bearer <supabase access token>"):
//   GET    /quota                           -> authoritative usage numbers
//   POST   /reserve   {id,name,mime,size}   -> quota-checked reservation (RPC runs as the user)
//   PUT    /upload/:id                      -> streams body into R2, verifies size, confirms
//   GET    /download/:id                    -> streams object only if it belongs to the caller
//   DELETE /file/:id                        -> deletes object + row

const cors = (env) => ({
  'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization,content-type',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Vary': 'Origin',
});
const json = (env, o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors(env), 'content-type': 'application/json' } });

async function userFromJwt(env, jwt) {
  const r = await fetch(env.SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: 'Bearer ' + jwt },
  });
  return r.ok ? r.json() : null;
}
const rpcAsUser = (env, jwt, fn, body) =>
  fetch(env.SUPABASE_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: 'Bearer ' + jwt, 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
const rpcAsService = (env, fn, body) =>
  fetch(env.SUPABASE_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
// RLS guarantees this only ever returns the caller's own row.
async function fileRow(env, jwt, id) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/note_files?id=eq.${encodeURIComponent(id)}&select=*`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: 'Bearer ' + jwt },
  });
  const a = r.ok ? await r.json() : [];
  return a[0] || null;
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
    if (!jwt) return json(env, { error: 'unauthorized' }, 401);
    const user = await userFromJwt(env, jwt);
    if (!user) return json(env, { error: 'unauthorized' }, 401);
    const parts = new URL(req.url).pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && parts[0] === 'quota') {
      const r = await rpcAsUser(env, jwt, 'get_quota');
      return json(env, await r.json(), r.status);
    }
    if (req.method === 'POST' && parts[0] === 'reserve') {
      const b = await req.json();
      const r = await rpcAsUser(env, jwt, 'reserve_upload', {
        p_id: String(b.id), p_name: String(b.name || 'file'), p_mime: String(b.mime || ''), p_size: Number(b.size),
      });
      return json(env, await r.json(), r.status);
    }
    if (req.method === 'PUT' && parts[0] === 'upload' && parts[1]) {
      const row = await fileRow(env, jwt, parts[1]);
      if (row && row.status === 'ready') return json(env, { ok: true, already: true });   // repeat upload of a stored file is a no-op
      if (!row || row.status !== 'reserved') return json(env, { error: 'no reservation' }, 404);
      const len = Number(req.headers.get('content-length') || -1);
      if (len < 0 || len > row.size_bytes) return json(env, { error: 'size mismatch' }, 413);
      const put = await env.R2.put(row.r2_key, req.body, {
        httpMetadata: { contentType: row.mime || 'application/octet-stream' },
      });
      if (put.size > row.size_bytes) {
        await env.R2.delete(row.r2_key);
        await rpcAsService(env, 'release_file', { p_user: user.id, p_id: row.id });
        return json(env, { error: 'size mismatch' }, 413);
      }
      const c = await rpcAsService(env, 'confirm_upload', { p_user: user.id, p_id: row.id, p_actual: put.size });
      if (!c.ok) { await env.R2.delete(row.r2_key); return json(env, { error: 'confirm failed' }, 409); }
      return json(env, { ok: true, size: put.size });
    }
    if (req.method === 'GET' && parts[0] === 'download' && parts[1]) {
      const row = await fileRow(env, jwt, parts[1]);
      if (!row || row.status !== 'ready') return json(env, { error: 'not found' }, 404);
      const obj = await env.R2.get(row.r2_key);
      if (!obj) return json(env, { error: 'not found' }, 404);
      return new Response(obj.body, {
        headers: {
          ...cors(env),
          'content-type': row.mime || 'application/octet-stream',
          'cache-control': 'private, no-store',
          'content-disposition': "inline; filename*=UTF-8''" + encodeURIComponent(row.name),
        },
      });
    }
    if (req.method === 'DELETE' && parts[0] === 'file' && parts[1]) {
      const row = await fileRow(env, jwt, parts[1]);
      if (row) {
        await env.R2.delete(row.r2_key);
        await rpcAsService(env, 'release_file', { p_user: user.id, p_id: row.id });
      }
      return json(env, { ok: true });
    }
    return json(env, { error: 'not found' }, 404);
  },
};
