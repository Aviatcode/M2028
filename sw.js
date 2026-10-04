importScripts('reminders-sw.js'); // background task + medicine reminders (message / periodicsync / push)

// M2028 service worker.
//
// 1) SPEED: the app shell (index.html, icons, manifest) is saved on the device
//    and served instantly on every visit, then quietly refreshed in the
//    background ("stale-while-revalidate"). The page opens without waiting for
//    the network; a new deploy shows up on the next open after it downloads.
// 2) OFFLINE: the app opens even with no connection (your data is in
//    localStorage already). Cloud sync simply resumes when you're back online.
// 3) NOTIFICATIONS: the ongoing Pomodoro/tasks notification (tag 'm2028-live')
//    and tap-to-open behaviour from before are unchanged.
//
// 4) BACKGROUND SYNC: when the page can't (or may not be able to) finish
//    uploading your changes - offline, tab closed, app swiped away - it parks
//    them in an IndexedDB "outbox" and registers a Background Sync. The browser
//    wakes this worker as soon as there is a connection and it uploads them to
//    Supabase. Before overwriting anything it checks the cloud copy: if another
//    device saved a newer version in the meantime, that key is skipped and the
//    page merges it normally on next open, so nothing is ever clobbered.
//    (Background Sync is supported in Chrome/Edge/Android. Elsewhere the page
//    falls back to syncing on next open, exactly as before.)
//
// 5) REMINDERS: reminders-sw.js (imported on line 1) stores the upcoming task and
//    medicine reminders the page sends and shows them when the browser wakes
//    the worker (Periodic Background Sync or Web Push), even with the app closed.
//
// Never cached: Supabase / any API calls (always live data), audio and other
// range requests, non-GET requests.
//
// Background limits: a website, even installed as a PWA, doesn't get
// guaranteed background execution. This worker does NOT run its own countdown;
// it only shows what the page last told it to. If the browser suspends the
// page for a long time the notification stops updating until the app reopens.

const VERSION = 'v3';
const SHELL_CACHE = 'm2028-shell-' + VERSION;
const LIB_CACHE = 'm2028-lib-' + VERSION;
const SHELL_FILES = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'apple-touch-icon.png'];
const LIB_HOSTS = ['cdn.jsdelivr.net'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // add one by one so a missing optional file can never break the install
    await Promise.all(SHELL_FILES.map((f) =>
      fetch(new Request(f, { cache: 'reload' }))
        .then((r) => (r && r.ok ? cache.put(f, r) : null))
        .catch(() => null)
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // remove caches from older versions (including the old 'm2028-v1')
    const keep = [SHELL_CACHE, LIB_CACHE];
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('m2028') && !keep.includes(n)).map((n) => caches.delete(n)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (e) {}
    }
    await self.clients.claim();
  })());
});

// Serve from cache immediately, refresh the cache from the network in the background.
async function staleWhileRevalidate(event, cacheName, cacheKey) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(cacheKey || event.request, { ignoreSearch: !!cacheKey });
  const refresh = (async () => {
    try {
      const preload = event.preloadResponse ? await event.preloadResponse : null;
      const res = preload || (await fetch(event.request));
      if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
        await cache.put(cacheKey || event.request, res.clone());
      }
      return res;
    } catch (e) {
      return null;
    }
  })();
  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  const fresh = await refresh;
  if (fresh) return fresh;
  // nothing cached and offline: fall back to the app shell for page loads
  if (event.request.mode === 'navigate') {
    const shell = (await cache.match('index.html')) || (await cache.match('./'));
    if (shell) return shell;
  }
  return Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.headers.has('range')) return; // audio/video seeking must hit the network

  const url = new URL(req.url);

  // Pages: always answer with the cached shell (ignores ?query like utm tags)
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(event, SHELL_CACHE, 'index.html'));
    return;
  }

  // Same-origin static files that make up the app
  if (url.origin === self.location.origin) {
    if (/\.(png|jpg|jpeg|svg|webp|ico|json|css|js|woff2?)$/i.test(url.pathname) && !/\/sw\.js$/.test(url.pathname)) {
      event.respondWith(staleWhileRevalidate(event, SHELL_CACHE));
    }
    return; // everything else (e.g. mp3) goes straight to the network
  }

  // Supabase client library from the CDN: cache so cloud sync can start sooner
  if (LIB_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(event, LIB_CACHE));
    return;
  }
  // anything else cross-origin (Supabase API, etc.) is never touched
});

// Tapping the live notification (or any notification) opens the app if it's
// closed, or focuses the existing tab if it's already open.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});

// The page can ask the worker to update or clear the live notification via
// postMessage, as a fallback alongside direct registration.showNotification().
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SHOW_LIVE_NOTIF') {
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: 'm2028-live',
      renotify: false,
      silent: true,
      icon: data.icon,
      badge: data.icon,
    });
  } else if (data.type === 'CLOSE_LIVE_NOTIF') {
    self.registration.getNotifications({ tag: 'm2028-live' }).then((list) => {
      list.forEach((n) => n.close());
    });
  } else if (data.type === 'FLUSH_OUTBOX') {
    event.waitUntil(flushOutbox().catch(() => {}));
  } else if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ---------------------------------------------------------------------------
// Background Sync: deliver the page's outbox to Supabase.
// ---------------------------------------------------------------------------
function obDB() {
  return new Promise((ok, no) => {
    const r = indexedDB.open('m2028-outbox', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}
async function obGet() {
  const db = await obDB();
  return new Promise((ok, no) => {
    const q = db.transaction('kv').objectStore('kv').get('outbox');
    q.onsuccess = () => { db.close(); ok(q.result || null); };
    q.onerror = () => no(q.error);
  });
}
async function obClear() {
  const db = await obDB();
  return new Promise((ok, no) => {
    const t = db.transaction('kv', 'readwrite');
    t.objectStore('kv').delete('outbox');
    t.oncomplete = () => { db.close(); ok(); };
    t.onerror = () => no(t.error);
  });
}

async function flushOutbox() {
  const rec = await obGet();
  if (!rec || !rec.rows || !rec.rows.length) return;
  const H = { apikey: rec.key, Authorization: 'Bearer ' + rec.token, 'Content-Type': 'application/json' };
  const keys = rec.rows.map((x) => x.r.data_key);

  // 1) what does the cloud currently hold for these keys?
  const inList = keys.map((k) => '"' + k.replace(/"/g, '') + '"').join(',');
  const chk = await fetch(
    rec.url + '/rest/v1/user_data?select=data_key,updated_at&user_id=eq.' + encodeURIComponent(rec.uid) +
    '&data_key=in.(' + encodeURIComponent(inList) + ')',
    { headers: H }
  );
  // expired / invalid login: give up quietly - the page still has every change
  // marked unsent and will upload them after you open the app and sign in
  if (chk.status === 401 || chk.status === 403) { await obClear(); return; }
  if (!chk.ok) throw new Error('outbox check failed ' + chk.status); // browser retries later
  const cloud = {};
  (await chk.json()).forEach((c) => { cloud[c.data_key] = new Date(c.updated_at).getTime(); });

  // 2) only upload keys nobody else has changed since the page last saw them
  const send = rec.rows.filter((x) => !cloud[x.r.data_key] || cloud[x.r.data_key] <= x.base).map((x) => x.r);
  if (send.length) {
    const up = await fetch(rec.url + '/rest/v1/user_data?on_conflict=user_id,data_key', {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(send),
    });
    if (up.status === 401 || up.status === 403) { await obClear(); return; }
    if (!up.ok) throw new Error('outbox upload failed ' + up.status);
  }
  await obClear();
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'm2028-sync') event.waitUntil(flushOutbox());
});
