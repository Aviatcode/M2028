# Web/PWA share target (Android Chrome only — OPENS the app)

This is the best a website can do. It is NOT the "save without opening the app" requirement:
a PWA share target always launches the app window. iOS Safari does not support Web Share Target at all.
Use the native shells in `native/` for the true no-open behaviour.

## 1. Add to `app.webmanifest`
```json
"share_target": {
  "action": "./",
  "method": "GET",
  "params": { "title": "share-title", "text": "share-text", "url": "share-url" }
}
```
`notes.js` reads `?share-title=&share-text=&share-url=` on load, creates one note per share, and cleans the URL.
(Text and links only. Files need the POST variant below and a service worker.)

## 2. Files (POST share target) — add to your service worker
Manifest: `"share_target": { "action": "./share-receive", "method": "POST", "enctype": "multipart/form-data", "params": { "title":"title","text":"text","url":"url", "files":[{"name":"media","accept":["*/*"]}] } }`
```js
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method === 'POST' && u.pathname.endsWith('/share-receive')) {
    e.respondWith((async () => {
      const f = await e.request.formData();
      const db = await new Promise((res, rej) => { const r = indexedDB.open('m2028_share_inbox', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const tx = db.transaction('items', 'readwrite'), st = tx.objectStore('items');
      const files = f.getAll('media');
      if (files.length) files.forEach(x => st.add({ title: f.get('title'), text: f.get('text'), url: f.get('url'), blob: x, name: x.name, type: x.type }));
      else st.add({ title: f.get('title'), text: f.get('text'), url: f.get('url') });
      await new Promise(r => tx.oncomplete = r);
      return Response.redirect('./', 303);
    })());
  }
});
```
`notes.js` drains `m2028_share_inbox` on startup and when the app regains focus.
