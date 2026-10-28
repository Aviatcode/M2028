/* M2028 Notes — local-first notes with folders, lists, labels, share ingest and optional cloud sync.
   Local store: IndexedDB "m2028_notes". Cloud: Supabase (metadata) + Cloudflare R2 via Worker (files).
   Config (optional, set BEFORE this script): window.M2028_NOTES_CONFIG = { workerUrl:'https://…workers.dev' } */
(function () {
'use strict';
if (window.M2028Notes) return;
const CFG = Object.assign({ workerUrl: '', maxFile: 25000000 }, window.M2028_NOTES_CONFIG || {}); // 25 MB = Gmail send limit
const $ = (s, r) => (r || document).querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const fmt = b => b < 1e3 ? b + ' B' : b < 1e6 ? Math.round(b / 1e3) + ' KB' : b < 1e9 ? (b / 1e6).toFixed(b < 1e7 ? 1 : 0).replace(/\.0$/, '') + ' MB' : (b / 1e9).toFixed(2) + ' GB'; // decimal units, matching provider/Gmail wording
const URLRE = /(https?:\/\/[^\s<>"']+)/g;
const ICON = {
  search: '<path d="M11 19a8 8 0 1 1 5.3-14A8 8 0 0 1 11 19zM21 21l-4.3-4.3"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
  img: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4 4 3 3-2 4 3"/>',
  pin: '<path d="M9 4h6l-1 6 3 3v2H7v-2l3-3zM12 15v6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  sel: '<circle cx="12" cy="12" r="8"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
  notes: '<path d="M6 3.5h9l3 3V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20z"/><path d="M9 11h6M9 15h6"/>'
};
const svg = k => '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[k] + '</svg>';

/* ---------- settings ---------- */
const SK = 'm2028_notes_settings';
const settings = () => Object.assign({ view: 'grid', sort: 'modified', defaultDest: 'ask', defaultFolder: 'inbox', cloudOn: false }, (() => { try { return JSON.parse(localStorage.getItem(SK)) || {}; } catch (e) { return {}; } })());
const setSetting = (k, v) => { const s = settings(); s[k] = v; try { localStorage.setItem(SK, JSON.stringify(s)); } catch (e) {} };

/* ---------- IndexedDB (persistent, local-first) ---------- */
let _db;
const db = () => _db || (_db = new Promise((res, rej) => {
  const r = indexedDB.open('m2028_notes', 1);
  r.onupgradeneeded = () => { const d = r.result; ['notes', 'folders', 'labels', 'blobs'].forEach(s => d.createObjectStore(s, { keyPath: 'id' })); d.createObjectStore('meta', { keyPath: 'k' }); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
}));
const tx = (store, mode, fn) => db().then(d => new Promise((res, rej) => { const t = d.transaction(store, mode); const q = fn(t.objectStore(store)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }));
const idb = { get: (s, k) => tx(s, 'readonly', o => o.get(k)), put: (s, v) => tx(s, 'readwrite', o => o.put(v)), del: (s, k) => tx(s, 'readwrite', o => o.delete(k)), all: s => tx(s, 'readonly', o => o.getAll()) };
const meta = { get: async k => { const r = await idb.get('meta', k); return r ? r.v : undefined; }, set: (k, v) => idb.put('meta', { k, v }) };

/* ---------- state ---------- */
const st = { notes: [], folders: [], labels: [], view: 'all', q: '', sel: new Set(), selMode: false, quota: null, quotaErr: '', up: null, busy: false, promptShown: false };
const urls = new Map();
const folderName = id => id === 'inbox' ? 'Inbox' : ((st.folders.find(f => f.id === id) || {}).name || 'Inbox');
const labelName = id => (st.labels.find(l => l.id === id) || {}).name || '';
const mk = o => { const t = Date.now(); return Object.assign({ id: uid(), title: '', body: '', listStyle: 'none', items: [], url: '', attachments: [], folderId: 'inbox', labels: [], pinned: false, starred: false, archived: false, trashed: false, reminder: '', remFired: false, dest: 'local', sync: 'local', err: '', created: t, updated: t, source: 'app' }, o); };
const isEmpty = n => !n.title.trim() && !n.body.trim() && !n.items.some(i => i.text.trim()) && !n.attachments.length && !n.url;
const canCloud = () => { try { return typeof supa !== 'undefined' && !!supa && typeof _user !== 'undefined' && !!_user; } catch (e) { return false; } };
const hasWorker = () => !!CFG.workerUrl;
const kindOf = n => n.listStyle === 'check' ? 'Checklist' : n.listStyle === 'bullet' ? 'Bullets' : n.listStyle === 'number' ? 'Numbered' : n.attachments.some(a => /^image\//.test(a.mime)) ? 'Photo' : n.attachments.length ? 'File' : n.url ? 'Link' : 'Note';

async function loadAll() {
  [st.notes, st.folders, st.labels] = await Promise.all([idb.all('notes'), idb.all('folders'), idb.all('labels')]);
  st.folders.sort((a, b) => a.created - b.created);
}
async function save(n, touch) {
  if (touch !== false) n.updated = Date.now();
  if (n.dest === 'cloud') n.sync = 'dirty';
  if (!st.notes.includes(n)) st.notes.push(n);
  await idb.put('notes', n);
  if (n.dest === 'cloud') queueSync();
}
const byId = id => st.notes.find(n => n.id === id);
const gone = new WeakSet();   // permanently deleted notes: pending editor saves must not bring them back

/* ---------- toast / dialog ---------- */
let toastT;
function toast(msg, undo) {
  const old = $('.nt-toast'); if (old) old.remove();
  const t = document.createElement('div'); t.className = 'nt-toast'; t.setAttribute('role', 'status');
  t.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button type="button">Undo</button>' : '');
  if (undo) t.querySelector('button').onclick = () => { undo(); t.remove(); };
  document.body.appendChild(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), undo ? 6000 : 3500);
}
function dlg(html, onClose) {
  const ov = document.createElement('div'); ov.className = 'nt-ov';
  ov.innerHTML = '<div class="nt-dlg" role="dialog" aria-modal="true">' + html + '</div>';
  const close = () => { if (!ov.isConnected) return; ov.remove(); onClose && onClose(); };
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  document.body.appendChild(ov); ov.close = close; return ov;
}

/* ---------- blobs ---------- */
async function blobURL(a) {
  if (urls.has(a.id)) return urls.get(a.id);
  const r = await idb.get('blobs', a.id); if (!r) return null;
  const u = URL.createObjectURL(r.blob); urls.set(a.id, u); return u;
}
async function addFiles(n, files) {
  let skipped = 0;
  for (const f of files) {
    if (f.size > CFG.maxFile) { skipped++; toast('"' + f.name + '" is ' + fmt(f.size) + ' — the limit is ' + fmt(CFG.maxFile) + ' per file. Nothing was changed.'); continue; }
    const a = { id: uid(), name: f.name || 'file', mime: f.type || 'application/octet-stream', size: f.size, local: true, remote: false, state: 'local', err: '' };
    await idb.put('blobs', { id: a.id, blob: f }); n.attachments.push(a);
  }
  return skipped;
}

/* ---------- cloud: worker + supabase ---------- */
async function token() { try { const r = await supa.auth.getSession(); return r && r.data && r.data.session ? r.data.session.access_token : null; } catch (e) { return null; } }
async function W(path, opt) {
  const t = await token(); if (!t) throw new Error('Please sign in to use cloud storage.');
  const r = await fetch(CFG.workerUrl.replace(/\/$/, '') + path, Object.assign({}, opt, { headers: Object.assign({ authorization: 'Bearer ' + t }, (opt && opt.headers) || {}) }));
  return r;
}
let quotaAt = 0, lastPullAt = 0;
async function refreshQuota(force) {
  if (!force && st.quota && Date.now() - quotaAt < 60000) { paintBar(); return; }
  st.quotaErr = '';
  if (!canCloud() || !hasWorker()) { st.quota = null; return; }
  try { const r = await W('/quota'); if (!r.ok) throw new Error('quota ' + r.status); st.quota = await r.json(); quotaAt = Date.now(); }
  catch (e) { st.quota = null; st.quotaErr = 'Could not read cloud usage (' + (e.message || 'offline') + ').'; }
  paintBar();
}
function xhrUpload(path, blob, mime, onp) {
  return token().then(t => new Promise((res, rej) => {
    const x = new XMLHttpRequest(); x.open('PUT', CFG.workerUrl.replace(/\/$/, '') + path);
    x.setRequestHeader('authorization', 'Bearer ' + t); x.setRequestHeader('content-type', mime || 'application/octet-stream');
    x.upload.onprogress = e => onp && onp(e.loaded, e.total);
    x.onload = () => x.status < 300 ? res() : rej(new Error('upload ' + x.status)); x.onerror = () => rej(new Error('network'));
    x.send(blob);
  }));
}
async function uploadAtt(n, a) {
  const rec = await idb.get('blobs', a.id); if (!rec) throw new Error('local copy missing');
  const rr = await W('/reserve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: a.id, name: a.name, mime: a.mime, size: rec.blob.size }) });
  const j = await rr.json();
  if (j.ok && j.status === 'ready') { markRemote(a.id); return; }   // already stored (e.g. a duplicated note shares this file)
  if (!j.ok) { const e = new Error(j.reason === 'quota_exceeded' ? 'Not enough cloud space (' + fmt(j.remaining || 0) + ' left).' : j.reason === 'file_too_large' ? 'File exceeds the ' + fmt(j.max_file) + ' limit.' : j.reason === 'service_full' ? 'Cloud storage is temporarily full for everyone. Keep this item on your device for now.' : 'Reservation refused.'); e.fatal = true; throw e; }
  a.state = 'uploading'; st.up = { name: a.name, loaded: 0, total: rec.blob.size }; paintBar();
  await xhrUpload('/upload/' + encodeURIComponent(a.id), rec.blob, a.mime, (l, t) => { st.up = { name: a.name, loaded: l, total: t }; paintBar(); });
  a.state = 'synced'; a.remote = true; a.err = ''; st.up = null; markRemote(a.id);
}
function markRemote(id) { st.notes.forEach(n => n.attachments.forEach(x => { if (x.id === id) { x.remote = true; x.state = 'synced'; x.err = ''; idb.put('notes', n); } })); }
let syncing = false, syncQ = false;
function queueSync() { if (syncQ) return; syncQ = true; setTimeout(() => { syncQ = false; sync(); }, 600); }
const stripNote = n => { const c = JSON.parse(JSON.stringify(n)); c.sync = 'synced'; c.err = ''; c.attachments.forEach(a => { a.local = false; a.state = a.remote ? 'synced' : a.state; }); return c; };
async function sync() {
  if (syncing || !canCloud() || !navigator.onLine) return; syncing = true; let worked = false;
  try {
    const pf = (await meta.get('pfiles')) || [];
    if (pf.length && hasWorker()) { worked = true; const left = []; for (const id of pf) { try { const r = await W('/file/' + encodeURIComponent(id), { method: 'DELETE' }); if (!r.ok) left.push(id); } catch (e) { left.push(id); } } await meta.set('pfiles', left); }
    for (const n of st.notes.filter(x => x.dest === 'cloud' && x.sync !== 'synced')) {
      try {
        for (const a of n.attachments.filter(a => !a.remote)) {
          if (!hasWorker()) { const e = new Error('File cloud storage is not configured for this app yet — files stay on this device.'); e.fatal = true; throw e; }
          try { worked = true; await uploadAtt(n, a); } catch (e) { a.state = 'error'; a.err = e.message; st.up = null; throw e; }
          await idb.put('notes', n);
        }
        const { error } = await supa.from('notes').upsert({ id: n.id, data: stripNote(n), updated_at: new Date(n.updated).toISOString(), deleted: false });
        if (error) throw new Error(/relation|does not exist|schema/i.test(error.message) ? 'Cloud tables are not set up yet (run notes_schema.sql).' : error.message);
        n.sync = 'synced'; n.err = '';
      } catch (e) { n.sync = 'error'; n.err = e.message || 'Sync failed'; }
      await idb.put('notes', n);
    }
    if (settings().cloudOn) await syncMeta();
    const pd = (await meta.get('pdel')) || [];
    if (pd.length) { const left = []; for (const id of pd) { const { error } = await supa.from('notes').update({ deleted: true, data: {} }).eq('id', id); if (error) left.push(id); } await meta.set('pdel', left); }
    if (settings().cloudOn && Date.now() - lastPullAt > 60000) await pull();   // incoming changes: at most once a minute
  } catch (e) { /* local data is never touched on failure */ }
  syncing = false; if (worked) await refreshQuota(true); render();
}
let metaSig = '';
async function syncMeta() {
  const sig = JSON.stringify([st.folders, st.labels]); if (sig === metaSig) return;   // nothing changed since last push
  metaSig = sig;
  for (const [tbl, list] of [['note_folders', st.folders], ['note_labels', st.labels]]) {
    if (!list.length) continue;
    await supa.from(tbl).upsert(list.map(x => ({ id: x.id, data: x, updated_at: new Date(x.updated || x.created).toISOString(), deleted: !!x.deleted })));
  }
}
async function pull() {
  lastPullAt = Date.now();
  const last = (await meta.get('lastPull')) || '1970-01-01T00:00:00Z'; let newest = last;
  const { data, error } = await supa.from('notes').select('*').gt('updated_at', last); if (error) return;
  for (const row of data || []) {
    if (row.updated_at > newest) newest = row.updated_at;
    const l = byId(row.id);
    if (row.deleted) { if (l && l.dest === 'cloud') { st.notes.splice(st.notes.indexOf(l), 1); await idb.del('notes', l.id); for (const a of l.attachments) await dropBlobIfUnused(a); } continue; }
    const r = row.data; if (!r || !r.id) continue;
    if (!l) { r.attachments.forEach(a => a.local = false); r.dest = 'cloud'; r.sync = 'synced'; st.notes.push(r); await idb.put('notes', r); continue; }
    if (r.updated > l.updated) {
      if (l.sync === 'dirty') { const c = mk(JSON.parse(JSON.stringify(l))); c.id = uid(); c.title = (c.title || 'Untitled') + ' (conflict copy)'; c.dest = 'local'; c.sync = 'local'; c.attachments = c.attachments.filter(a => a.local); await save(c, false); }
      const keep = new Map(l.attachments.map(a => [a.id, a.local]));
      r.attachments.forEach(a => a.local = !!keep.get(a.id)); Object.assign(l, r, { dest: 'cloud', sync: 'synced' }); await idb.put('notes', l);
    }
  }
  const fl = await supa.from('note_folders').select('*').gt('updated_at', last); if (fl.data) for (const row of fl.data) { if (row.deleted) { st.folders = st.folders.filter(f => f.id !== row.id); await idb.del('folders', row.id); } else if (!st.folders.some(f => f.id === row.id)) { st.folders.push(row.data); await idb.put('folders', row.data); } }
  const ll = await supa.from('note_labels').select('*').gt('updated_at', last); if (ll.data) for (const row of ll.data) { if (row.deleted) { st.labels = st.labels.filter(f => f.id !== row.id); await idb.del('labels', row.id); } else if (!st.labels.some(f => f.id === row.id)) { st.labels.push(row.data); await idb.put('labels', row.data); } }
  await meta.set('lastPull', newest);
}
async function downloadAtt(a) {
  if (!hasWorker()) return toast('File cloud storage is not configured.');
  try { const r = await W('/download/' + encodeURIComponent(a.id)); if (!r.ok) throw new Error(r.status); const b = await r.blob(); await idb.put('blobs', { id: a.id, blob: b }); a.local = true; urls.delete(a.id); return true; }
  catch (e) { toast('Download failed: ' + (e.message || 'offline')); return false; }
}

/* ---------- storage destination ---------- */
async function setDest(ids, dest, quiet) {
  const ns = ids.map(byId).filter(Boolean);
  if (dest === 'local') {
    const wasCloud = ns.filter(n => n.dest === 'cloud');
    if (wasCloud.length) { if (!confirm('Remove ' + (wasCloud.length > 1 ? 'these notes' : 'this note') + ' from the cloud? A copy stays on this device and the cloud space is freed.')) return false; if (!(await unCloud(wasCloud))) return false; }
    for (const n of ns) { n.dest = 'local'; n.sync = 'local'; await save(n, false); } render(); if (!quiet) toast(ns.length + ' kept on this device'); return true;
  }
  if (!canCloud()) { toast('Sign in to use cloud storage. Your items are safe on this device.'); return false; }
  const needFiles = ns.some(n => n.attachments.some(a => !a.remote));
  if (needFiles && !hasWorker()) { toast('File cloud storage is not set up in this deployment. Notes can sync, files stay local.'); return false; }
  if (needFiles) {
    await refreshQuota(true);
    const seen = new Set(); let need = 0; ns.forEach(n => n.attachments.forEach(a => { if (!a.remote && !seen.has(a.id)) { seen.add(a.id); need += a.size; } }));
    if (!st.quota) { toast(st.quotaErr || 'Cloud usage unavailable right now. Nothing was uploaded.'); return false; }
    if (need > st.quota.remaining) return await noSpace(need, ids);
  }
  for (const n of ns) { n.dest = 'cloud'; n.sync = 'dirty'; await idb.put('notes', n); }
  setSetting('cloudOn', true); render(); sync(); toast('Uploading ' + ns.length + ' item' + (ns.length > 1 ? 's' : '') + '…'); return true;
}
async function unCloud(ns) {
  // Safe order: 1) every file is on this device, 2) delete from cloud, 3) tombstone the row. Aborts (changing nothing) if step 1 fails.
  for (const n of ns) for (const a of n.attachments) if (a.remote && !a.local && !(await downloadAtt(a))) { toast('Could not keep a local copy of "' + a.name + '", so nothing was removed from the cloud.'); return false; }
  for (const n of ns) {
    for (const a of n.attachments) if (a.remote) { const shared = st.notes.some(x => x !== n && x.dest === 'cloud' && x.attachments.some(y => y.id === a.id)); if (!shared) { try { await W('/file/' + encodeURIComponent(a.id), { method: 'DELETE' }); } catch (e) { toast('Could not reach the cloud; nothing was removed.'); return false; } } a.remote = false; a.state = 'local'; }
    try { if (canCloud()) await supa.from('notes').update({ deleted: true, data: {} }).eq('id', n.id); } catch (e) {}
    n.dest = 'local'; n.sync = 'local'; await idb.put('notes', n);
  }
  await refreshQuota(true); return true;
}
function noSpace(need, ids) {
  return new Promise(res => {
    const q = st.quota, o = dlg('<h3>Not enough cloud space</h3><div class="nt-warn">These items need <b>' + fmt(need) + '</b> but only <b>' + fmt(q.remaining) + '</b> of ' + fmt(q.quota) + ' remains. Nothing was uploaded and nothing was deleted.</div><div class="row"><button class="nt-btn" data-x="c">Cancel</button><button class="nt-btn" data-x="m">Manage cloud files</button><button class="nt-btn p" data-x="l">Keep on device</button></div>', () => res(false));
    o.onclick = async e => { const x = e.target.dataset && e.target.dataset.x; if (!x) return; o.close(); if (x === 'l') { await setDest(ids, 'local'); } if (x === 'm') openSettings(); res(false); };
  });
}

/* ---------- ingest (share targets, native inbox, manual) ---------- */
async function ingest(items) {
  const s = settings(); const made = [];
  for (const it of items) {
    const n = mk({ source: 'share', folderId: s.defaultFolder || 'inbox', title: (it.title || '').trim() });
    const txt = (it.text || '').trim(); const u = (it.url || '').trim() || ((txt.match(URLRE) || [])[0] || '');
    if (u) n.url = u;
    if (txt && txt !== u) n.body = txt;
    if (it.file) { if (await addFiles(n, [it.file])) continue; if (!n.title) n.title = it.file.name || ''; }
    if (isEmpty(n)) continue;
    n.dest = s.defaultDest === 'local' ? 'local' : s.defaultDest === 'cloud' ? (canCloud() && (!n.attachments.length || hasWorker()) ? 'cloud' : 'pending') : 'pending';
    await save(n); made.push(n);
  }
  render(); return made;
}
async function drainShares() {
  const got = [], done = [];
  try { // 1) PWA share target (Android/Chrome) via service worker inbox
    const idbReq = indexedDB.open('m2028_share_inbox', 1);
    const d = await new Promise((res, rej) => { idbReq.onupgradeneeded = () => idbReq.result.createObjectStore('items', { keyPath: 'id', autoIncrement: true }); idbReq.onsuccess = () => res(idbReq.result); idbReq.onerror = () => rej(idbReq.error); });
    const all = await new Promise(res => { const r = d.transaction('items').objectStore('items').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => res([]); });
    for (const x of all) got.push({ title: x.title, text: x.text, url: x.url, file: x.blob ? new File([x.blob], x.name || 'shared', { type: x.type || x.blob.type }) : null });
    done.push(() => { if (!all.length) return d.close(); const t = d.transaction('items', 'readwrite'); all.forEach(x => t.objectStore('items').delete(x.id)); t.oncomplete = t.onerror = () => d.close(); });
  } catch (e) {}
  try { // 2) GET share_target params (text / links)
    const p = new URLSearchParams(location.search);
    if (p.has('share-title') || p.has('share-text') || p.has('share-url')) { got.push({ title: p.get('share-title'), text: p.get('share-text'), url: p.get('share-url') }); done.push(() => history.replaceState(null, '', location.pathname + location.hash)); }
  } catch (e) {}
  try { // 3) Native shells (Capacitor ShareInbox plugin: Android receiver / iOS Share Extension)
    const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ShareInbox;
    if (P) { const r = await P.drain(); const its = (r && r.items) || []; for (const x of its) { let file = null; if (x.base64) { const bin = atob(x.base64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); file = new File([u8], x.name || 'shared', { type: x.mime || '' }); } got.push({ title: x.title, text: x.text, url: x.url, file }); } if (its.length) done.push(() => P.ack()); }
  } catch (e) {}
  if (!got.length) { done.forEach(f => { try { f(); } catch (e) {} }); return; }
  let m; try { m = await ingest(got); } catch (e) { console.error('Saving shared items failed; they stay in the inbox', e); toast('Could not save shared items yet — they are kept and will be retried.'); return; }
  done.forEach(f => { try { f(); } catch (e) {} });   // acknowledge only after the notes are written to IndexedDB
  if (m.length) { try { showV('notes'); } catch (e) {} st.view = 'inbox'; render(); toast(m.length + ' shared item' + (m.length > 1 ? 's' : '') + ' saved to Notes'); }
}

/* ---------- filtering / sorting ---------- */
function visible() {
  const q = st.q.trim().toLowerCase(), v = st.view;
  let a = st.notes.filter(n => {
    if (v === 'trash') return n.trashed; if (n.trashed) return false;
    if (q) {
      const hay = [n.title, n.body, n.url, folderName(n.folderId), ...n.items.map(i => i.text), ...n.attachments.map(x => x.name), ...n.labels.map(labelName)].join(' ').toLowerCase();
      return hay.includes(q);
    }
    if (v === 'archive') return n.archived; if (n.archived) return false;
    if (v === 'inbox') return n.folderId === 'inbox'; if (v === 'starred') return n.starred; if (v === 'reminders') return !!n.reminder;
    if (v[0] === 'f') return n.folderId === v.slice(2); if (v[0] === 'l') return n.labels.includes(v.slice(2));
    if (v === 'type:photo') return n.attachments.some(x => /^image\//.test(x.mime)); if (v === 'type:file') return n.attachments.some(x => !/^image\//.test(x.mime));
    if (v === 'type:link') return !!n.url; if (v === 'type:list') return n.listStyle !== 'none';
    return true;
  });
  const so = settings().sort;
  a.sort((x, y) => so === 'title' ? (x.title || '~').localeCompare(y.title || '~') : so === 'created' ? y.created - x.created : y.updated - x.updated);
  return a;
}

/* ---------- rendering ---------- */
const safeHref = u => /^(https?:\/\/|mailto:|tel:)/i.test(String(u).trim()) ? String(u).trim() : '';
const linkify = t => { let out = '', last = 0, m; const re = new RegExp(URLRE.source, 'g'); const raw = String(t); while ((m = re.exec(raw))) { let u = m[0], tail = ''; const tr = u.match(/[.,;:!?)\]]+$/); if (tr) { tail = tr[0]; u = u.slice(0, -tail.length); } out += esc(raw.slice(last, m.index)) + '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(u) + '</a>' + esc(tail); last = m.index + m[0].length; } return out + esc(raw.slice(last)); };
async function openAtt(a) { const u = await blobURL(a); if (!u) return; const l = document.createElement('a'); l.href = u; if (/^(image\/|application\/pdf|text\/)/.test(a.mime)) { l.target = '_blank'; l.rel = 'noopener'; } else l.download = a.name; document.body.appendChild(l); l.click(); l.remove(); }
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
const ext = a => (a.name.split('.').pop() || '').slice(0, 4);
function badge(n) { // only show storage state when it needs attention
  if (n.dest === 'pending') return '<span class="nt-tag bd">Choose storage</span>';
  if (n.dest === 'cloud' && n.sync === 'error') return '<span class="nt-tag rd" title="' + esc(n.err) + '">Sync error</span>';
  if (n.dest === 'cloud' && n.sync !== 'synced') return '<span class="nt-tag">Syncing…</span>';
  return '';
}
function card(n) {
  const img = n.attachments.find(a => /^image\//.test(a.mime));
  const act = n.items.filter(i => !i.done), done = n.items.filter(i => i.done);
  let body = '';
  if (n.listStyle === 'check') body = act.slice(0, 8).map(i => '<div class="nt-it"><button class="nt-cb" data-a="tick" data-i="' + i.id + '" aria-label="Mark done"></button><span class="t">' + esc(i.text) + '</span>' + (i.due ? '<span class="nt-tag bd">' + esc(i.due) + '</span>' : '') + '</div>').join('') + (done.length ? '<div class="nt-it" style="color:var(--m2)">' + done.length + ' completed</div>' : '');
  else if (n.listStyle !== 'none') body = n.items.slice(0, 10).map((i, k) => '<div class="nt-it"><span style="color:var(--m2)">' + (n.listStyle === 'number' ? (k + 1) + '.' : '•') + '</span><span class="t">' + esc(i.text) + '</span></div>').join('');
  else body = n.body ? '<div class="nt-body">' + linkify(n.body) + '</div>' : '';
  const files = n.attachments.filter(a => a !== img).slice(0, 3).map(a => '<div class="nt-file"><span class="x">' + esc(ext(a)) + '</span><span class="nm">' + esc(a.name) + '</span><span class="sz">' + fmt(a.size) + '</span></div>').join('');
  const tags = n.labels.map(l => '<span class="nt-tag">' + esc(labelName(l)) + '</span>').join('') + (n.reminder ? '<span class="nt-tag bd">⏰ ' + esc(new Date(n.reminder).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })) + '</span>' : '') + (n.starred ? '<span class="nt-tag">★</span>' : '') + (n.archived && st.q ? '<span class="nt-tag">Archived</span>' : '') + badge(n);
  return '<div class="nt-card' + (n.pinned ? ' pinned' : '') + (st.sel.has(n.id) ? ' sel' : '') + '" data-id="' + n.id + '" tabindex="0">' +
    (img ? '<img class="nt-img" data-aid="' + img.id + '" alt="' + esc(img.name) + '">' : '') +
    (n.title ? '<h4>' + esc(n.title) + '</h4>' : '') + body +
    (n.url ? '<div class="nt-file" style="margin-top:8px"><span class="x">URL</span>' + (safeHref(n.url) ? '<a class="nm" href="' + esc(safeHref(n.url)) + '" target="_blank" rel="noopener noreferrer" style="color:var(--up)">' + esc(host(n.url)) + '</a>' : '<span class="nm">' + esc(n.url) + '</span>') + '</div>' : '') + files +
    '<div class="nt-meta">' + tags + '</div>' +
    (st.view !== 'trash' ? '<button class="nt-pin" data-a="pin" title="' + (n.pinned ? 'Unpin' : 'Pin') + '" aria-label="Pin">' + svg('pin') + '</button>' : '') + '</div>';
}
function barHtml(full) {
  const loc = st.notes.filter(n => !n.trashed && n.dest !== 'cloud').length;
  const localLine = loc + ' item' + (loc === 1 ? '' : 's') + ' on this device only (not counted in cloud usage)';
  if (!canCloud()) return full ? '<div><b>Cloud storage</b> · sign in to sync across devices. Notes work fully offline without an account.</div><div style="margin-top:3px">' + localLine + '</div>' : '';
  if (!hasWorker()) return full ? '<div><b>Cloud storage</b> · file storage is not enabled for this deployment yet (note text can still sync).</div><div style="margin-top:3px">' + localLine + '</div>' : '';
  if (!st.quota) return full ? '<div>' + esc(st.quotaErr || 'Checking cloud usage…') + '</div>' : '';
  if (!full && !settings().cloudOn && !st.up) return '';   // main screen shows usage only once cloud is actually in use
  const q = st.quota, used = q.used + q.reserved, left = Math.max(0, q.quota - used), p = Math.min(100, Math.round(used / q.quota * 100));
  let h = '<div>Cloud: <b>' + fmt(q.used) + '</b> of <b>' + fmt(q.quota) + '</b> used · <b>' + fmt(left) + '</b> left</div><div class="nt-prog"><i class="' + (p >= 100 ? 'full' : p > 80 ? 'hot' : '') + '" style="width:' + p + '%"></i></div>';
  if (st.up) { const pc = st.up.total ? Math.round(st.up.loaded / st.up.total * 100) : 0; h += '<div>Uploading ' + esc(st.up.name) + ' (' + fmt(st.up.total) + ') — ' + pc + '% · about ' + fmt(Math.max(0, left - Math.max(0, st.up.total - st.up.loaded))) + ' will be left</div>'; }
  else if (full) h += '<div>Max file size ' + fmt(q.max_file) + '</div><div style="margin-top:3px">' + localLine + '</div>';
  return h;
}
function paintBar() { document.querySelectorAll('.nt-barx').forEach(el => { const h = barHtml(el.dataset.full === '1'); if (el.__h !== h) { el.__h = h; el.innerHTML = h; } }); }
const VIEWS = { all: 'All notes', inbox: 'Inbox', starred: 'Starred', reminders: 'Reminders', 'type:photo': 'Photos', 'type:file': 'Files', 'type:link': 'Links', 'type:list': 'Lists', archive: 'Archive', trash: 'Trash' };
const viewTitle = () => st.q.trim() ? 'Search results' : VIEWS[st.view] || (st.view[0] === 'f' ? folderName(st.view.slice(2)) : st.view[0] === 'l' ? '# ' + labelName(st.view.slice(2)) : 'Notes');
function render() {
  const root = $('#nt-root'); if (!root) return;
  const act = document.activeElement, keepQ = act && act.id === 'nt-q';
  const live = st.notes.filter(n => !n.trashed), pend = live.filter(n => n.dest === 'pending');
  const list = visible(), pinned = st.view === 'trash' ? [] : list.filter(n => n.pinned), rest = list.filter(n => !pinned.includes(n));
  let h = '<div class="nt-head"><button class="nt-ib" data-a="menu" title="Menu" aria-label="Menu">' + svg('menu') + '</button><h2 class="nt-title">' + esc(viewTitle()) + '</h2></div>';
  h += '<div class="nt-search">' + svg('search') + '<input id="nt-q" type="search" placeholder="Search" value="' + esc(st.q) + '" aria-label="Search notes"></div>';
  { const so = settings().sort, lv = settings().view;
    h += '<div class="nt-tb"><select class="nt-pill" data-a="sort" aria-label="Sort notes"><option value="modified"' + (so === 'modified' ? ' selected' : '') + '>Sort: last modified</option><option value="created"' + (so === 'created' ? ' selected' : '') + '>Sort: date created</option><option value="title"' + (so === 'title' ? ' selected' : '') + '>Sort: title</option></select>' +
      '<button class="nt-pill" data-a="layout">' + (lv === 'grid' ? 'List view' : 'Grid view') + '</button>' +
      '<button class="nt-pill' + (st.selMode ? ' act' : '') + '" data-a="selmode">Select</button>' +
      '<button class="nt-pill" data-a="folders">Folders</button><button class="nt-pill" data-a="labels">Labels</button><button class="nt-pill" data-a="settings">Storage &amp; settings</button></div>'; }
  if (st.view !== 'trash' && st.view !== 'archive') h += '<div class="nt-quick"><input id="nt-new" placeholder="Take a note…" aria-label="Take a note"><button class="nt-ib" style="border:0;background:none" data-a="plus" title="New checklist or attachment" aria-label="More ways to add">' + svg('plus') + '</button><input id="nt-file" type="file" multiple style="display:none"></div>';
  if (pend.length) h += '<div class="nt-banner"><span>' + pend.length + ' item' + (pend.length > 1 ? 's' : '') + ' waiting for a storage choice</span><button class="nt-btn" data-a="pending">Choose</button></div>';
  if (st.selMode) h += '<div class="nt-selbar"><b style="font-size:13px">' + st.sel.size + ' selected</b>' + ['archive:Archive', 'del:Delete'].map(x => { const [k, l] = x.split(':'); return '<button class="nt-btn' + (k === 'del' ? ' d' : '') + '" data-a="bulk" data-k="' + k + '"' + (st.sel.size ? '' : ' disabled') + '>' + l + '</button>'; }).join('') + '<button class="nt-btn" data-a="bulkmore"' + (st.sel.size ? '' : ' disabled') + '>⋯</button><button class="nt-btn" data-a="selmode" style="margin-left:auto">Done</button></div>';
  h += '<div class="nt-bar nt-barx" data-full="0"></div>';
  if (st.view === 'trash' && list.length) h += '<div class="row" style="margin-bottom:8px;display:flex;gap:8px;align-items:center"><button class="nt-btn d" data-a="emptytrash">Empty Trash</button><span style="color:var(--m2);font-size:12px">Open a note to restore it.</span></div>';
  if (!list.length) h += '<div class="nt-empty">' + (st.q ? 'No notes match “' + esc(st.q) + '”.' : st.view === 'trash' ? 'Trash is empty.' : st.view === 'archive' ? 'Archived notes appear here.' : 'Notes you add — or share from other apps — appear here.') + '</div>';
  const gcls = 'nt-grid' + (settings().view === 'list' ? ' list' : '');
  if (pinned.length) h += '<div class="nt-sec">Pinned</div><div class="' + gcls + '">' + pinned.map(card).join('') + '</div>' + (rest.length ? '<div class="nt-sec">Others</div>' : '');
  if (rest.length) h += '<div class="' + gcls + '">' + rest.map(card).join('') + '</div>';
  // Skip the DOM rewrite when nothing visible changed: stops flicker when the app or sync asks for repeated redraws.
  if (root.__h === h) { paintBar(); return; }
  root.__h = h; root.innerHTML = h; paintBar();
  if (keepQ) { const q = $('#nt-q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  root.querySelectorAll('img[data-aid]').forEach(async im => { const a = st.notes.flatMap(n => n.attachments).find(x => x.id === im.dataset.aid); const u = a && await blobURL(a); if (u) im.src = u; else im.remove(); });
}
async function newChecklist() { const n = mk({ listStyle: 'check', items: [{ id: uid(), text: '', done: false, due: '' }], folderId: curFolder() }); n.dest = defDest(); openEditor(n, true); }

/* ---------- editor ---------- */
function openEditor(n, isNew) {
  let timer, changed = false;
  const flush = async () => { if (gone.has(n) || !changed) return; changed = false; n.title = $('.nt-t', box).value; if (n.listStyle === 'none') n.body = $('.nt-ta', box).value; if (!(isNew && isEmpty(n))) await save(n); };
  const o = dlg('', async () => { clearTimeout(timer); await flush(); if (isNew && isEmpty(n)) { st.notes = st.notes.filter(x => x !== n); await idb.del('notes', n.id); } render(); });
  const box = o.firstChild;
  const auto = () => { changed = true; clearTimeout(timer); timer = setTimeout(flush, 400); };
  const itemsHtml = () => n.items.map(i => '<div class="nt-li' + (i.done ? ' done' : '') + '" data-i="' + i.id + '">' + (n.listStyle === 'check' ? '<button class="nt-cb" data-k="tick" aria-label="Toggle">' + (i.done ? '✓' : '') + '</button>' : '<span style="color:var(--m2);width:16px">' + (n.listStyle === 'number' ? (n.items.indexOf(i) + 1) + '.' : '•') + '</span>') + '<input class="tx" value="' + esc(i.text) + '" data-k="txt" placeholder="List item">' + (n.listStyle === 'check' ? (i.due ? '<input class="nt-inp dd" type="date" value="' + esc(i.due) + '" data-k="due" title="Due date">' : '<button class="nt-x" data-k="adddue" title="Add due date" aria-label="Add due date">📅</button>') : '') + '<button class="nt-x" data-k="rm" aria-label="Remove item">×</button></div>').join('');
  const attHtml = () => n.attachments.map(a => '<div class="nt-file" data-a="' + a.id + '"><span class="x">' + esc(ext(a)) + '</span><span class="nm">' + esc(a.name) + '<br><span class="sz">' + fmt(a.size) + (a.remote ? ' · cloud' : '') + (a.local ? '' : ' · not on device') + (a.err ? ' · ' + esc(a.err) : '') + '</span></span>' + (a.local ? '<button class="nt-btn" data-k="open">Open</button>' : '<button class="nt-btn" data-k="dl">Download</button>') + '<button class="nt-x" data-k="rmatt" aria-label="Remove attachment">×</button></div>').join('');
  const summary = () => [n.folderId !== 'inbox' ? '📁 ' + folderName(n.folderId) : '', ...n.labels.map(l => '# ' + labelName(l)), n.reminder ? '⏰ ' + new Date(n.reminder).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '', n.pinned ? 'Pinned' : '', n.starred ? '★' : '', n.dest === 'pending' ? 'Storage: not chosen' : n.dest === 'cloud' ? (n.sync === 'synced' ? 'Cloud' : n.sync === 'error' ? 'Sync error: ' + n.err : 'Syncing…') : ''].filter(Boolean).join('  ·  ');
  const paint = () => {
    const tr = n.trashed, sm = summary();
    box.innerHTML = '<input class="nt-t" placeholder="Title" value="' + esc(n.title) + '" ' + (tr ? 'readonly' : '') + '>' +
      (n.listStyle === 'none' ? '<textarea class="nt-ta" placeholder="Take a note…" ' + (tr ? 'readonly' : '') + '>' + esc(n.body) + '</textarea>' : '<div id="ed-items">' + itemsHtml() + '</div><div class="row"><button class="nt-btn" data-k="additem">+ List item</button></div>') +
      '<div id="ed-att">' + attHtml() + '</div>' +
      (n.url ? '<div class="nt-file"><span class="x">URL</span>' + (safeHref(n.url) ? '<a class="nm" href="' + esc(safeHref(n.url)) + '" target="_blank" rel="noopener noreferrer" style="color:var(--up)">' + esc(n.url) + '</a>' : '<span class="nm">' + esc(n.url) + '</span>') + '</div>' : '') +
      (sm ? '<div class="nt-sum">' + esc(sm) + '</div>' : '') +
      '<div class="nt-tools">' + (tr ? '<button class="nt-btn" data-k="restore">Restore</button><button class="nt-btn d" data-k="purge">Delete forever</button>' : '<button class="nt-ib" data-k="attach" title="Attach photo or file" aria-label="Attach">' + svg('img') + '</button><button class="nt-ib" data-k="togglecheck" title="Checklist" aria-label="Toggle checklist">' + svg('check') + '</button><button class="nt-ib" data-k="emenu" title="More" aria-label="More options">' + svg('more') + '</button><input id="ed-file" type="file" multiple style="display:none">') + '<button class="nt-btn p" style="margin-left:auto" data-k="done">Done</button></div>';
  };
  paint();
  const setFormat = async f => {
    await flush();
    if (f !== 'none' && n.listStyle === 'none') { n.items = n.body.split('\n').filter(x => x.trim()).map(x => ({ id: uid(), text: x.replace(/^[-•*\d.\s]+/, ''), done: false, due: '' })); n.body = ''; }
    if (f === 'none' && n.listStyle !== 'none') { n.body = n.items.map(x => x.text).join('\n'); n.items = []; }
    n.listStyle = f; if (f !== 'none' && !n.items.length) n.items.push({ id: uid(), text: '', done: false, due: '' }); await save(n); paint();
  };
  const sheet = (title, html, handler) => { const d = dlg('<h3>' + title + '</h3>' + html); d.firstChild.classList.add('nt-menu'); d.onclick = async e => { const b = e.target.closest('[data-s]'); if (!b) return; if (await handler(b.dataset.s, d, b) !== false) d.close(); }; return d; };
  const mi = (k, label, on) => '<button class="nt-mi" data-s="' + k + '"><span>' + label + '</span>' + (on ? '<span>✓</span>' : '') + '</button>';
  const sub = {
    format: () => sheet('Format', [['none', 'Plain text'], ['bullet', 'Bullet list'], ['number', 'Numbered list'], ['check', 'Checklist']].map(x => mi(x[0], x[1], n.listStyle === x[0])).join(''), f => setFormat(f)),
    folder: () => sheet('Move to folder', mi('inbox', 'Inbox', n.folderId === 'inbox') + st.folders.map(f => mi(f.id, esc(f.name), n.folderId === f.id)).join(''), async f => { n.folderId = f; await save(n); paint(); }),
    labels: () => sheet('Labels', (st.labels.map(l => mi(l.id, '# ' + esc(l.name), n.labels.includes(l.id))).join('') || '<div style="font-size:12px;color:var(--m2);padding:8px 4px">No labels yet.</div>') + mi('@edit', 'Create / edit labels…'), async (k, d, b) => { if (k === '@edit') { manage('labels'); return; } n.labels = n.labels.includes(k) ? n.labels.filter(x => x !== k) : n.labels.concat(k); await save(n); paint(); d.close(); sub.labels(); return false; }),
    link: () => { const d = dlg('<h3>Link</h3><div class="row"><input id="lk" class="nt-inp" style="flex:1" placeholder="https://…" value="' + esc(n.url) + '"></div><div class="row"><button class="nt-btn" data-s="clear">Remove</button><button class="nt-btn p" style="margin-left:auto" data-s="save">Save</button></div>'); d.onclick = async e => { const k = e.target.dataset.s; if (!k) return; n.url = k === 'save' ? ($('#lk', d).value || '').trim() : ''; await save(n); paint(); d.close(); }; },
    reminder: () => { const d = dlg('<h3>Reminder</h3><div class="row"><input id="rm" type="datetime-local" class="nt-inp" style="flex:1" value="' + (n.reminder ? new Date(new Date(n.reminder).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '') + '"></div><div class="row"><button class="nt-btn" data-s="clear">Remove</button><button class="nt-btn p" style="margin-left:auto" data-s="save">Save</button></div>'); d.onclick = async e => { const k = e.target.dataset.s; if (!k) return; const v = $('#rm', d).value; n.reminder = k === 'save' && v ? new Date(v).toISOString() : ''; n.remFired = false; await save(n); paint(); d.close(); }; },
    storage: () => sheet('Storage', mi('pending', 'Undecided (kept on device)', n.dest === 'pending') + mi('local', 'This device only', n.dest === 'local') + mi('cloud', 'Cloud sync', n.dest === 'cloud') + '<div style="font-size:11px;color:var(--m2);padding:8px 4px">Device-only notes never count toward cloud usage.</div>', async v => { await flush(); if (v === 'cloud') await setDest([n.id], 'cloud'); else if (v === 'local') await setDest([n.id], 'local', true); else { n.dest = 'pending'; n.sync = 'local'; await save(n, false); } paint(); }),
    due: () => 0
  };
  const emenu = () => sheet('Note options',
    mi('pin', n.pinned ? 'Unpin' : 'Pin') + mi('star', n.starred ? 'Remove star' : 'Star') + mi('arch', n.archived ? 'Unarchive' : 'Archive') +
    '<div class="nt-sec">Edit</div>' + mi('format', 'Format…') + mi('link', n.url ? 'Edit link…' : 'Add link…') + mi('reminder', n.reminder ? 'Edit reminder…' : 'Add reminder…') + mi('folder', 'Move to folder…') + mi('labels', 'Labels…') + mi('storage', 'Storage…') +
    '<div class="nt-sec">Manage</div>' + mi('dup', 'Duplicate') + mi('del', 'Delete'),
    async k => {
      if (['format', 'link', 'reminder', 'folder', 'labels', 'storage'].includes(k)) { setTimeout(() => sub[k](), 0); return; }
      await flush();
      if (k === 'pin') { n.pinned = !n.pinned; await save(n); paint(); }
      else if (k === 'star') { n.starred = !n.starred; await save(n); paint(); }
      else if (k === 'arch') { n.archived = !n.archived; if (n.archived) n.pinned = false; await save(n); o.close(); toast(n.archived ? 'Note archived' : 'Note restored'); }
      else if (k === 'dup') { await duplicate(n); o.close(); toast('Duplicated'); }
      else if (k === 'del') { o.close(); trash(n); }
    });
  box.addEventListener('input', e => {
    const li = e.target.closest('.nt-li'); if (li) { const it = n.items.find(x => x.id === li.dataset.i); if (it) { if (e.target.dataset.k === 'txt') it.text = e.target.value; if (e.target.dataset.k === 'due') it.due = e.target.value; } }
    auto();
  });
  box.addEventListener('change', async e => { if (e.target.id === 'ed-file') { await addFiles(n, [...e.target.files]); e.target.value = ''; await save(n); paint(); } });
  box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.k === 'txt') { e.preventDefault(); const li = e.target.closest('.nt-li'), idx = n.items.findIndex(x => x.id === li.dataset.i); const ni = { id: uid(), text: '', done: false, due: '' }; n.items.splice(idx + 1, 0, ni); $('#ed-items', box).innerHTML = itemsHtml(); const inp = box.querySelector('[data-i="' + ni.id + '"] .tx'); inp && inp.focus(); auto(); } });
  box.addEventListener('click', async e => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    const k = b.dataset.k, li = b.closest('.nt-li'), it = li && n.items.find(x => x.id === li.dataset.i);
    if (k === 'tick' && it) { it.done = !it.done; $('#ed-items', box).innerHTML = itemsHtml(); auto(); }
    else if (k === 'adddue' && it) { it.due = new Date().toISOString().slice(0, 10); $('#ed-items', box).innerHTML = itemsHtml(); auto(); }
    else if (k === 'rm' && it) { n.items = n.items.filter(x => x !== it); $('#ed-items', box).innerHTML = itemsHtml(); auto(); }
    else if (k === 'additem') { n.items.push({ id: uid(), text: '', done: false, due: '' }); $('#ed-items', box).innerHTML = itemsHtml(); const t = box.querySelectorAll('.nt-li .tx'); t[t.length - 1].focus(); }
    else if (k === 'togglecheck') setFormat(n.listStyle === 'check' ? 'none' : 'check');
    else if (k === 'emenu') emenu();
    else if (k === 'attach') $('#ed-file', box).click();
    else if (k === 'open' || k === 'dl') { const a = n.attachments.find(x => x.id === b.closest('[data-a]').dataset.a); if (k === 'dl' && !(await downloadAtt(a))) return; if (k === 'dl') { await save(n, false); paint(); } if (k === 'open') await openAtt(a); }
    else if (k === 'rmatt') { const id = b.closest('[data-a]').dataset.a, a = n.attachments.find(x => x.id === id); n.attachments = n.attachments.filter(x => x !== a); await save(n); await dropBlobIfUnused(a); await dropRemote(a); paint(); }
    else if (k === 'restore') { n.trashed = false; await save(n); o.close(); toast('Restored'); }
    else if (k === 'purge') { o.close(); await purge([n.id]); }
    else if (k === 'done') o.close();
  });
  setTimeout(() => { const t = $('.nt-t', box); if (isNew && t) t.focus(); }, 30);
}
async function dropRemote(a) {
  if (!a || !a.remote || st.notes.some(n => n.attachments.some(y => y.id === a.id))) return;
  try { if (!canCloud() || !hasWorker()) throw 0; const r = await W('/file/' + encodeURIComponent(a.id), { method: 'DELETE' }); if (!r.ok) throw 0; refreshQuota(true); }
  catch (e) { const pf = (await meta.get('pfiles')) || []; if (!pf.includes(a.id)) { pf.push(a.id); await meta.set('pfiles', pf); } }
}
async function dropBlobIfUnused(a) { if (!a) return; if (st.notes.some(n => n.attachments.some(x => x.id === a.id))) return; await idb.del('blobs', a.id); const u = urls.get(a.id); if (u) { URL.revokeObjectURL(u); urls.delete(a.id); } }
async function duplicate(n) {
  const c = JSON.parse(JSON.stringify(n)); c.id = uid(); c.title = (n.title || 'Untitled') + ' (copy)'; c.created = c.updated = Date.now(); c.pinned = false; c.trashed = false; c.items.forEach(i => i.id = uid());
  // attachments are shared by reference (same file id) so a file is stored — and counted — only once
  c.sync = c.dest === 'cloud' ? 'dirty' : 'local'; await save(c); render(); return c;
}
async function trash(n) { n.trashed = true; n.pinned = false; await save(n); render(); toast('Moved to Trash', async () => { n.trashed = false; await save(n); render(); }); }
async function purge(ids) {
  for (const id of ids) {
    const n = byId(id); if (!n) continue; gone.add(n); st.notes.splice(st.notes.indexOf(n), 1); await idb.del('notes', id);
    for (const a of n.attachments) { const shared = st.notes.some(x => x.attachments.some(y => y.id === a.id)); if (!shared) { await dropBlobIfUnused(a); await dropRemote(a); } }
    if (n.dest === 'cloud') { const pd = (await meta.get('pdel')) || []; pd.push(id); await meta.set('pdel', pd); }
  }
  render(); queueSync(); refreshQuota();
}

/* ---------- folders & labels ---------- */
function manage(kind) {
  const isF = kind === 'folders', list = () => isF ? st.folders : st.labels, tbl = isF ? 'folders' : 'labels';
  const o = dlg('', () => render()); const box = o.firstChild;
  const paint = () => { box.innerHTML = '<h3>' + (isF ? 'Folders' : 'Edit labels') + '</h3><div class="row"><input id="m-new" class="nt-inp" style="flex:1" placeholder="' + (isF ? 'Create new folder' : 'Create new label') + '"><button class="nt-btn p" data-k="add" aria-label="Add">✓</button></div>' + list().map(x => '<div class="nt-li" data-id="' + x.id + '"><input class="tx" value="' + esc(x.name) + '" data-k="ren"><button class="nt-x" data-k="del" aria-label="Delete">🗑</button></div>').join('') + '<div class="row" style="justify-content:flex-end"><button class="nt-btn p" data-k="done">Done</button></div>'; };
  paint();
  const add = async () => { const v = $('#m-new', box).value.trim(); if (!v) return; if (list().some(x => x.name.toLowerCase() === v.toLowerCase())) return toast('That name already exists'); const x = { id: uid(), name: v, created: Date.now(), updated: Date.now() }; list().push(x); await idb.put(tbl, x); paint(); $('#m-new', box).focus(); if (canCloud() && settings().cloudOn) queueSync(); };
  box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'm-new') add(); });
  box.addEventListener('change', async e => { if (e.target.dataset.k !== 'ren') return; const x = list().find(y => y.id === e.target.closest('.nt-li').dataset.id), v = e.target.value.trim(); if (x && v) { x.name = v; x.updated = Date.now(); await idb.put(tbl, x); queueSync(); } });
  box.addEventListener('click', async e => {
    const k = e.target.dataset.k; if (k === 'done') o.close(); else if (k === 'add') add();
    else if (k === 'del') {
      const id = e.target.closest('.nt-li').dataset.id, x = list().find(y => y.id === id); if (!confirm('Delete "' + x.name + '"? ' + (isF ? 'Its notes move to Inbox — no notes are deleted.' : 'The label is removed from notes; notes are kept.'))) return;
      for (const n of st.notes) { if (isF && n.folderId === id) { n.folderId = 'inbox'; await save(n); } if (!isF && n.labels.includes(id)) { n.labels = n.labels.filter(l => l !== id); await save(n); } }
      if (isF) st.folders = st.folders.filter(y => y.id !== id); else st.labels = st.labels.filter(y => y.id !== id);
      await idb.del(tbl, id); if (st.view === (isF ? 'f:' : 'l:') + id) st.view = 'all';
      if (canCloud() && settings().cloudOn) { try { await supa.from(isF ? 'note_folders' : 'note_labels').update({ deleted: true }).eq('id', id); } catch (er) {} } paint();
    }
  });
}

/* ---------- pending-choice prompt ---------- */
function openPending() {
  if ($('[data-pending-dlg]')) return;
  const pend = st.notes.filter(n => n.dest === 'pending' && !n.trashed); if (!pend.length) return;
  const size = n => n.attachments.reduce((s, a) => s + a.size, 0);
  const o = dlg('<h3 data-pending-dlg>Where should these be kept?</h3><div style="font-size:12px;color:var(--m2);margin-bottom:6px">They are already safe on this device. Local items work offline and use no cloud space. Nothing is uploaded unless you choose Cloud.</div><div id="pl">' + pend.map(n => '<label class="nt-pl"><input type="checkbox" checked data-id="' + n.id + '"><span>' + esc(n.title || n.body.slice(0, 40) || n.url || (n.attachments[0] || {}).name || 'Untitled') + '</span><span class="s">' + (size(n) ? fmt(size(n)) : 'text') + '</span></label>').join('') + '</div><div class="row"><label class="l"><input type="checkbox" id="rem"> Remember my choice for future shared items</label></div><div class="row"><button class="nt-btn" data-x="later">Decide later</button><button class="nt-btn" data-x="local">Save locally</button><button class="nt-btn p" data-x="cloud">Save to cloud</button></div>');
  o.onclick = async e => {
    const x = e.target.dataset && e.target.dataset.x; if (!x) return; if (x === 'later') return o.close();
    const ids = [...o.querySelectorAll('#pl input:checked')].map(i => i.dataset.id); if (!ids.length) return toast('Select at least one item');
    const ok = await setDest(ids, x); if (ok && $('#rem', o).checked) setSetting('defaultDest', x); if (ok) o.close();
  };
}

/* ---------- settings / cloud management ---------- */
function openSettings() {
  refreshQuota(true);
  const s = settings(); const cloud = st.notes.filter(n => n.dest === 'cloud' && !n.trashed);
  const files = cloud.flatMap(n => n.attachments.filter(a => a.remote).map(a => ({ n, a })));
  const o = dlg('<h3>Notes storage</h3><div class="nt-bar nt-barx" data-full="1"></div>' +
    '<div class="row"><label class="l">Default for new shared items</label><select id="s-dest" class="nt-inp"><option value="ask">Ask me</option><option value="local">Keep on device</option><option value="cloud">Send to cloud</option></select></div>' +
    '<div class="row"><label class="l">Default folder</label><select id="s-folder" class="nt-inp"><option value="inbox">Inbox</option>' + st.folders.map(f => '<option value="' + f.id + '">' + esc(f.name) + '</option>').join('') + '</select></div>' +
    '<div class="nt-warn">Choosing Cloud never moves existing local notes by itself — only items you select (or that a default you set applies to). Per-file limit: ' + fmt(CFG.maxFile) + '.</div>' +
    '<div class="nt-sec">Cloud content (' + cloud.length + ' notes, ' + files.length + ' files)</div>' +
    (files.length ? files.map(x => '<div class="nt-pl" data-a="' + x.a.id + '" data-n="' + x.n.id + '"><span>' + esc(x.a.name) + '</span><span class="s">' + fmt(x.a.size) + '</span>' + (x.a.local ? '' : '<button class="nt-btn" data-x="dl">Download</button>') + '<button class="nt-btn d" data-x="rm">Remove note from cloud</button></div>').join('') : '<div style="font-size:12px;color:var(--m2)">No files in the cloud.</div>') +
    '<div class="row"><button class="nt-btn" data-x="sync">Sync now</button><button class="nt-btn" data-x="notif">Enable reminders</button><button class="nt-btn p" style="margin-left:auto" data-x="done">Done</button></div>', () => render());
  $('#s-dest', o).value = s.defaultDest; $('#s-folder', o).value = s.defaultFolder; paintBar();
  o.addEventListener('change', e => { if (e.target.id === 's-dest') setSetting('defaultDest', e.target.value); if (e.target.id === 's-folder') setSetting('defaultFolder', e.target.value); });
  o.addEventListener('click', async e => {
    const x = e.target.dataset.x; if (!x) return; const row = e.target.closest('[data-a]');
    if (x === 'done') o.close(); else if (x === 'sync') { sync(); toast('Syncing…'); } else if (x === 'notif') { try { const r = await Notification.requestPermission(); toast('Reminders: ' + r); } catch (er) { toast('Notifications unsupported here'); } }
    else if (x === 'dl') { const n = byId(row.dataset.n), a = n.attachments.find(y => y.id === row.dataset.a); if (await downloadAtt(a)) { await idb.put('notes', n); toast('Available offline'); o.close(); openSettings(); } }
    else if (x === 'rm') { const n = byId(row.dataset.n); if (n && confirm('Remove this note and its files from the cloud? A copy stays on this device.') && await unCloud([n])) { o.close(); openSettings(); } }
  });
}

/* ---------- menus (keeps the main screen uncluttered) ---------- */
function openMenu(kind) {
  const so = settings().sort, lv = settings().view; const live = st.notes.filter(n => !n.trashed);
  const it = (k, label, on, n) => '<button class="nt-mi" data-m="' + k + '"><span>' + label + '</span><span style="color:var(--m2)">' + (on ? '✓' : (n != null ? n : '')) + '</span></button>';
  let h;
  if (kind === 'add') h = '<h3>Add</h3>' + it('newlist', 'New checklist') + it('newfile', 'Note with photo or file');
  else if (kind === 'bulk') h = '<h3>' + st.sel.size + ' selected</h3>' + it('b:pin', 'Pin / unpin') + it('b:star', 'Star / unstar') + it('b:move', 'Move to folder…') + it('b:local', 'Keep on this device') + it('b:cloud', 'Upload to cloud');
  else h = '<h3>Notes</h3>' + it('v:all', 'All notes', st.view === 'all') + it('v:inbox', 'Inbox', st.view === 'inbox', live.filter(n => n.folderId === 'inbox' && !n.archived).length || '') + it('v:starred', 'Starred', st.view === 'starred') + it('v:reminders', 'Reminders', st.view === 'reminders') +
    (st.folders.length ? '<div class="nt-sec">Folders</div>' + st.folders.map(f => it('v:f:' + f.id, '📁 ' + esc(f.name), st.view === 'f:' + f.id)).join('') : '') +
    (st.labels.length ? '<div class="nt-sec">Labels</div>' + st.labels.map(l => it('v:l:' + l.id, '# ' + esc(l.name), st.view === 'l:' + l.id)).join('') : '') +
    '<div class="nt-sec">Filter</div>' + it('v:type:photo', 'Photos', st.view === 'type:photo') + it('v:type:file', 'Files', st.view === 'type:file') + it('v:type:link', 'Links', st.view === 'type:link') + it('v:type:list', 'Lists', st.view === 'type:list') + it('v:archive', 'Archive', st.view === 'archive') + it('v:trash', 'Trash', st.view === 'trash');
  const o = dlg(h); o.firstChild.classList.add('nt-menu');
  if (kind === 'main') { o.classList.add('left'); o.firstChild.classList.add('drawer'); }
  o.onclick = e => { const b = e.target.closest('[data-m]'); if (!b) return; const m = b.dataset.m; o.close();
    if (m.startsWith('v:')) { st.view = m.slice(2); st.q = ''; st.sel.clear(); render(); }
    else if (m.startsWith('sort:')) { setSetting('sort', m.slice(5)); render(); }
    else if (m.startsWith('b:')) bulk(m.slice(2));
    else if (m === 'layout') { setSetting('view', settings().view === 'grid' ? 'list' : 'grid'); render(); }
    else if (m === 'selmode') { st.selMode = !st.selMode; st.sel.clear(); render(); }
    else if (m === 'newlist') newChecklist(); else if (m === 'newfile') $('#nt-file').click();
    else if (m === 'folders') manage('folders'); else if (m === 'labels') manage('labels'); else if (m === 'settings') openSettings(); };
}

/* ---------- bulk ---------- */
async function bulk(k) {
  const ids = [...st.sel]; const ns = ids.map(byId).filter(Boolean); if (!ns.length) return;
  if (k === 'cloud') { await setDest(ids, 'cloud'); } else if (k === 'local') { await setDest(ids, 'local'); }
  else if (k === 'move') { const o = dlg('<h3>Move to</h3>' + ['inbox:Inbox'].concat(st.folders.map(f => f.id + ':' + f.name)).map(x => { const i = x.indexOf(':'); return '<div class="row"><button class="nt-btn" style="width:100%;text-align:left" data-f="' + x.slice(0, i) + '">' + esc(x.slice(i + 1)) + '</button></div>'; }).join('')); o.onclick = async e => { const f = e.target.dataset.f; if (!f) return; for (const n of ns) { n.folderId = f; await save(n); } o.close(); st.sel.clear(); render(); toast('Moved'); }; return; }
  else if (k === 'del') { for (const n of ns) { n.trashed = true; n.pinned = false; await save(n); } toast(ns.length + ' moved to Trash', async () => { for (const n of ns) { n.trashed = false; await save(n); } render(); }); }
  else for (const n of ns) { if (k === 'pin') n.pinned = !ns.every(x => x.pinned); if (k === 'star') n.starred = !ns.every(x => x.starred); if (k === 'archive') { n.archived = true; n.pinned = false; } await save(n); }
  st.sel.clear(); render();
}

/* ---------- events ---------- */
function bind() {
  const root = $('#nt-root');
  root.addEventListener('input', e => { if (e.target.id === 'nt-q') { st.q = e.target.value; clearTimeout(bind.t); bind.t = setTimeout(render, 150); } });
  root.addEventListener('change', async e => {
    if (e.target.dataset.a === 'sort') { setSetting('sort', e.target.value); render(); }
    if (e.target.id === 'nt-file') { const n = mk({ folderId: curFolder() }); await addFiles(n, [...e.target.files]); e.target.value = ''; if (!n.attachments.length) return; n.title = n.attachments[0].name; n.dest = defDest(); if (n.dest === 'cloud' && !hasWorker()) n.dest = 'pending'; await save(n); render(); }
  });
  root.addEventListener('keydown', e => {
    if (e.target.id === 'nt-new' && e.key === 'Enter' && !e.isComposing) { const t = e.target.value.trim(); if (t) quickAdd(t); }
    if (e.target.classList.contains('nt-card') && e.key === 'Enter') openEditor(byId(e.target.dataset.id));
  });
  root.addEventListener('click', async e => {
    const cardEl0 = e.target.closest('.nt-card');
    if (st.selMode && cardEl0) { e.preventDefault(); const n0 = byId(cardEl0.dataset.id); st.sel.has(n0.id) ? st.sel.delete(n0.id) : st.sel.add(n0.id); render(); return; }
    if (e.target.closest('a')) return;
    const b = e.target.closest('[data-a]'); const cardEl = e.target.closest('.nt-card');
    if (b && b.dataset.a === 'tick') { const n = byId(cardEl.dataset.id), it = n.items.find(i => i.id === b.dataset.i); it.done = true; await save(n); render(); return; }
    if (b && b.dataset.a === 'pin') { const n = byId(cardEl.dataset.id); n.pinned = !n.pinned; await save(n); render(); return; }
    if (cardEl && !b) { const n = byId(cardEl.dataset.id); if (st.selMode) { st.sel.has(n.id) ? st.sel.delete(n.id) : st.sel.add(n.id); render(); } else openEditor(n); return; }
    if (!b) return; const a = b.dataset.a;
    if (a === 'view') { st.view = b.dataset.v; st.q = ''; st.sel.clear(); render(); }
    else if (a === 'layout') { setSetting('view', settings().view === 'grid' ? 'list' : 'grid'); render(); }
    else if (a === 'selmode') { st.selMode = !st.selMode; st.sel.clear(); render(); }
    else if (a === 'menu') openMenu('main'); else if (a === 'plus') openMenu('add'); else if (a === 'bulkmore') openMenu('bulk');
    else if (a === 'settings') openSettings(); else if (a === 'folders') manage('folders'); else if (a === 'labels') manage('labels'); else if (a === 'pending') openPending();
    else if (a === 'newlist') newChecklist();
    else if (a === 'newfile') $('#nt-file').click();
    else if (a === 'bulk') bulk(b.dataset.k);
    else if (a === 'emptytrash') { if (confirm('Permanently delete everything in Trash? This cannot be undone.')) purge(st.notes.filter(n => n.trashed).map(n => n.id)); }
  });
}
const curFolder = () => st.view[0] === 'f' && st.view[1] === ':' ? st.view.slice(2) : (settings().defaultFolder || 'inbox');
const defDest = () => { const d = settings().defaultDest; return d === 'local' ? 'local' : d === 'cloud' && canCloud() ? 'cloud' : 'pending'; };
async function quickAdd(t) {
  const inp = $('#nt-new'); if (inp) inp.value = '';
  const n = mk({ folderId: curFolder(), body: t, dest: defDest() }); const u = (t.match(URLRE) || [])[0]; if (u && t.trim() === u) { n.url = u; n.body = ''; }
  if (st.view === 'starred') n.starred = true;                                   // so the new note is visible where you added it
  if (st.view[0] === 'l' && st.view[1] === ':') n.labels = [st.view.slice(2)];
  await save(n); render();
}

/* ---------- reminders ---------- */
setInterval(async () => { const now = Date.now(); for (const n of st.notes) { if (n.reminder && !n.remFired && !n.trashed && new Date(n.reminder).getTime() <= now) { n.remFired = true; await idb.put('notes', n); const msg = '⏰ ' + (n.title || n.body.slice(0, 40) || 'Note reminder'); try { if (window.Notification && Notification.permission === 'granted') new Notification('Reminder', { body: msg.slice(2) }); } catch (e) {} try { banner(msg); } catch (e) { toast(msg); } } } }, 30000);

/* ---------- Home cleanup + migration (non-destructive, re-checked) ---------- */
const hsh = t => { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return String(h); };
let migBusy = false;
async function migrateHome() {
  if (migBusy || typeof S === 'undefined') return; migBusy = true;
  try {
    const m = (await meta.get('mig')) || { hub: null, cw: {} }; let changed = false;
    const txt = S.go('hubNotes', '') || '';
    if (typeof txt === 'string' && txt.trim() && (!m.hub || m.hub.h !== hsh(txt))) {
      const ex = m.hub && byId(m.hub.id);
      if (ex && !ex.trashed && ex.body === m.hub.t) { ex.body = txt; await save(ex); }
      else { const n = mk({ title: 'Home scratchpad', body: txt, source: 'home', dest: 'local' }); await save(n); m.hub = { id: n.id }; }
      m.hub.h = hsh(txt); m.hub.t = txt; changed = true;
    }
    const cws = (S.go('customWidgets', []) || []).filter(w => w && w.type === 'note' && w.id);
    for (const w of cws) {
      const sig = hsh((w.title || '') + '\u0001' + (w.note || '') + '\u0001' + (w.images || []).map(i => i.id || '').join(','));
      const prev = m.cw[w.id]; if (prev && prev.h === sig) continue;
      const ex = prev && byId(prev.id);
      if (ex && !ex.trashed && ex.body === prev.t && ex.title === prev.ti) { ex.title = w.title || 'Note'; ex.body = w.note || ''; await save(ex); m.cw[w.id] = { id: ex.id, h: sig, t: ex.body, ti: ex.title }; }
      else {
        const n = mk({ title: w.title || 'Note', body: w.note || '', source: 'home', dest: 'local' });
        for (const im of (w.images || [])) { try { const bl = await (await fetch(im.src)).blob(); const a = { id: uid(), name: 'image-' + (im.id || uid()) + '.jpg', mime: bl.type || 'image/jpeg', size: bl.size, local: true, remote: false, state: 'local', err: '' }; await idb.put('blobs', { id: a.id, blob: bl }); n.attachments.push(a); } catch (e) {} }
        if (!isEmpty(n)) await save(n);
        m.cw[w.id] = { id: n.id, h: sig, t: n.body, ti: n.title };
      }
      changed = true;
    }
    if (changed) await meta.set('mig', m);   // originals (m_hubNotes, m_customWidgets) are never modified or deleted
    hideHomeNotes(m);
    if (changed) render();
  } catch (e) { console.warn('Notes migration', e); }
  migBusy = false;
}
function hideHomeNotes(m) {
  // Hide the hub Notes tab, and ONLY those Note Pad widgets whose content is already safe in Notes.
  let el = document.getElementById('nt-home-hide'); if (!el) { el = document.createElement('style'); el.id = 'nt-home-hide'; document.head.appendChild(el); }
  const ids = Object.keys((m && m.cw) || {}).filter(id => /^[\w-]+$/.test(id));
  const css = '#hmt-notes,#hmp-notes,#cwt-note,button[onclick*="openExtensionHubModal(\'notes\')"]{display:none!important}' + ids.map(id => '.dash-w[data-wid="cw:' + id + '"]{display:none!important}').join('');
  if (el.textContent !== css) el.textContent = css;
}

/* ---------- navigation integration ---------- */
function integrate() {
  if (!$('#v-notes')) { const host = document.getElementById('v-pomo'); const v = document.createElement('div'); v.id = 'v-notes'; v.className = 'vw'; v.innerHTML = '<div id="nt-root"></div>'; host.parentNode.appendChild(v); }
  try {
    if (!NAV_TABS.some(t => t.id === 'notes')) NAV_TABS.splice(2, 0, { id: 'notes', label: 'Notes', icon: svg('notes').replace('<svg ', '<svg width="1.1em" height="1.1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-.2em" '), group: 'Today', primary: true, shortLabel: 'Notes' });
    const sv = window.showV; if (!sv.__nt) { const w = function (id) { const vn = document.getElementById('v-notes'); if (id === 'notes' && vn && vn.classList.contains('on')) { render(); return; } /* already open: re-running the app's view switch would restart its fade animation (visible flicker) */ const r = sv.apply(this, arguments); if (id === 'notes') { render(); refreshQuota(); promptOnce(); } return r; }; w.__nt = 1; window.showV = w; }
    // Minimal defaults for first-time guests: Home, Pomodoro, Calendar only (everything else is opt-in in tab settings)
    const gm = window.guestMode; if (typeof gm === 'function' && !gm.__nt) { const w = function () { const fresh = localStorage.getItem('m_navHidden') === null; const r = gm.apply(this, arguments); if (fresh && localStorage.getItem('m_navInit') === null) { const h = {}; NAV_TABS.forEach(t => { if (!['dash', 'pomo', 'sched'].includes(t.id)) h[t.id] = true; }); S.s('navHidden', h); S.s('navInit', true); try { renderNavAll(); } catch (e) {} } return r; }; w.__nt = 1; window.guestMode = w; }
    const oh = window.openExtensionHubModal; if (typeof oh === 'function' && !oh.__nt) { const w = function (t) { if (t === 'notes') { showV('notes'); return; } return oh.apply(this, arguments); }; w.__nt = 1; window.openExtensionHubModal = w; }   // any leftover 'Notes' hub shortcut lands on the real Notes tab
    renderNavAll();
  } catch (e) { console.warn('Notes nav integration failed', e); }
}
function promptOnce() { if (st.promptShown) return; if (settings().defaultDest !== 'ask') return; if (!st.notes.some(n => n.dest === 'pending' && !n.trashed)) return; st.promptShown = true; setTimeout(openPending, 500); }

/* ---------- boot ---------- */
async function boot() {
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { const o = [...document.querySelectorAll('.nt-ov')].pop(); if (o && o.close) o.close(); } });
  integrate(); bind(); await loadAll(); hideHomeNotes((await meta.get('mig')) || null); await migrateHome(); await drainShares(); render(); setInterval(() => { if (!document.hidden) migrateHome(); }, 10000);
  window.addEventListener('online', queueSync); setInterval(() => { if (!document.hidden && st.notes.some(n => n.dest === 'cloud' && n.sync === 'dirty')) sync(); }, 60000); setInterval(() => { if (!document.hidden && st.notes.some(n => n.dest === 'cloud' && n.sync === 'error')) sync(); }, 600000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { drainShares(); queueSync(); } });
  if (canCloud() && settings().cloudOn) { queueSync(); }
  setTimeout(() => { if (canCloud() && settings().cloudOn) refreshQuota(); }, 2500);
}
window.M2028Notes = { ingest, sync, refreshQuota, state: st, open: () => showV('notes') };
const go = () => boot().catch(e => { console.error('Notes failed to start', e); const r = $('#nt-root'); if (r) r.innerHTML = '<div class="nt-empty">Notes could not open local storage in this browser (private browsing or blocked site data?). Allow site data for this page and reload — nothing has been lost.</div>'; });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
