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
// Never cached: Supabase / any API calls (always live data), audio and other
// range requests, non-GET requests.
//
// Background limits: a website, even installed as a PWA, doesn't get
// guaranteed background execution. This worker does NOT run its own countdown;
// it only shows what the page last told it to. If the browser suspends the
// page for a long time the notification stops updating until the app reopens.

const VERSION = 'v2';
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
  } else if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
