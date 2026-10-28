/* M2028 iPhone "Save to Notes" add-on.
   Load AFTER notes.js:  <script src="ios-share.js"></script>
   - On iPhone/iPad it offers a one-tap install of the "Save to Notes" Share Sheet shortcut (user can decline).
   - Text/links handed over by the shortcut arrive as ?share-title/&share-text/&share-url (already read by notes.js drainShares).
   - Photos/files are saved by the shortcut into Files > M2028 Notes (on the phone only). "Import from Files" button lets the app pick them up. */
(function () {
  'use strict';
  var ua = navigator.userAgent || '';
  var isIOS = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIOS) return;

  /* After you build the shortcut once on your iPhone: Shortcuts > Save to Notes > Share > Copy iCloud Link, paste it here.
     Apple signs iCloud-linked shortcuts, so it installs with one tap. Leave '' to use the bundled save-to-notes.shortcut file. */
  var ICLOUD_LINK = '';
  var SHORTCUT_URL = 'save-to-notes.shortcut';
  var KEY_DONE = 'm2028_ios_shortcut_done', KEY_NO = 'm2028_ios_shortcut_no';
  var standalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} }

  /* ---- hand-off: the shortcut opens  index.html?share-text=...  ONLY when it cannot reach Supabase; nothing to do here,
         notes.js drainShares() already ingests it and cleans the URL. ---- */

  /* ---- offer card ---- */
  function css() {
    if (document.getElementById('m2028ShCss')) return;
    var s = document.createElement('style'); s.id = 'm2028ShCss';
    s.textContent = '#m2028Sh{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:99999;background:#111;color:#fff;border:1px solid #333;border-radius:16px;padding:14px 16px;font:500 15px system-ui,-apple-system,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5);display:none}' +
      '#m2028Sh.on{display:block}#m2028Sh b{display:block;font-size:16px;margin-bottom:4px}#m2028Sh p{margin:0 0 12px;opacity:.8;font-size:14px;line-height:1.35}' +
      '#m2028Sh .r{display:flex;gap:10px}#m2028Sh button{flex:1;border:0;border-radius:12px;padding:11px;font:600 15px system-ui;cursor:pointer}' +
      '#m2028ShY{background:#e61f19;color:#fff}#m2028ShN{background:#2a2a2a;color:#ddd}';
    document.head.appendChild(s);
  }
  function card() {
    var c = document.getElementById('m2028Sh'); if (c) return c;
    css(); c = document.createElement('div'); c.id = 'm2028Sh';
    c.innerHTML = '<b>Add "Save to Notes" to your Share button?</b>' +
      '<p>Share text, links, photos or files from any app straight into M2028 Notes without opening it. Takes one tap to add.</p>' +
      '<div class="r"><button id="m2028ShN">Not now</button><button id="m2028ShY">Add shortcut</button></div>';
    document.body.appendChild(c);
    document.getElementById('m2028ShN').onclick = function () { ls(KEY_NO, String(Date.now())); c.classList.remove('on'); };
    document.getElementById('m2028ShY').onclick = async function () { ls(KEY_DONE, '1'); c.classList.remove('on'); try { await window.M2028IosShare.secret(); } catch (e) {} installShortcut(); };
    return c;
  }
  function installShortcut() {
    /* Opening a .shortcut file in Safari triggers Apple's "Add Shortcut" screen. */
    location.href = ICLOUD_LINK || new URL(SHORTCUT_URL, location.href).href;
  }
  function maybeOffer() {
    if (ls(KEY_DONE)) return;
    var no = +ls(KEY_NO) || 0; if (Date.now() - no < 14 * 864e5) return;   // declined: ask again only after 14 days
    card().classList.add('on');
  }
  window.M2028IosShare = { offer: function () { ls(KEY_DONE, ''); try { localStorage.removeItem(KEY_DONE); localStorage.removeItem(KEY_NO); } catch (e) {} card().classList.add('on'); }, install: installShortcut };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(maybeOffer, 4000); });
  else setTimeout(maybeOffer, 4000);

  /* ---- pull text/links the shortcut parked in Supabase, turn them into notes via notes.js ingest ---- */
  function db() { return (typeof supa !== 'undefined' && supa) ? supa : null; }
  async function drainCloudInbox() {
    try {
      var c = db(); if (!c || !window.M2028Notes) return;
      var ses = await c.auth.getSession(); if (!ses.data || !ses.data.session) return;
      var r = await c.from('share_inbox').select('id,text').order('created_at'); if (r.error || !r.data || !r.data.length) return;
      var items = r.data.map(function (x) {
        var t = (x.text || '').trim(), m = t.match(/^https?:\/\/\S+$/);
        return m ? { title: '', text: '', url: t } : { title: '', text: t, url: '' };
      });
      await window.M2028Notes.ingest(items);
      await c.from('share_inbox').delete().in('id', r.data.map(function (x) { return x.id; }));   // delete only after notes are saved
    } catch (e) { console.warn('share inbox', e); }
  }
  async function showSecret() {
    var c = db(); if (!c) return alert('Sign in first.');
    var r = await c.rpc('share_secret_get'); if (r.error) return alert('Run share_inbox.sql in Supabase first.');
    try { await navigator.clipboard.writeText(r.data); } catch (e) {}
    alert('Your inbox secret (copied): ' + r.data + '\n\nPaste it when the shortcut asks for it.');
  }
  window.M2028IosShare.secret = showSecret;
  setTimeout(drainCloudInbox, 3000);
  setInterval(function () { if (!document.hidden) drainCloudInbox(); }, 20000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) drainCloudInbox(); });

  /* ---- "Import from Files": pick what the shortcut saved in Files > M2028 Notes; stays on the phone ---- */
  function addImportButton() {
    if (document.getElementById('m2028ImpBtn')) return;
    var b = document.createElement('button'); b.id = 'm2028ImpBtn'; b.textContent = 'Import shared files';
    b.style.cssText = 'position:fixed;right:12px;bottom:calc(76px + env(safe-area-inset-bottom));z-index:9999;border:0;border-radius:22px;padding:10px 14px;background:#e61f19;color:#fff;font:600 13px system-ui;box-shadow:0 4px 14px rgba(0,0,0,.4);display:none';
    var inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.style.display = 'none';
    inp.onchange = async function () {
      var fs = Array.prototype.slice.call(inp.files || []); if (!fs.length || !window.M2028Notes) return;
      await window.M2028Notes.ingest(fs.map(function (f) { return { title: '', text: '', url: '', file: f }; }));
      inp.value = '';
    };
    b.onclick = function () { inp.click(); };
    document.body.appendChild(b); document.body.appendChild(inp);
    // only show while the Notes tab is open
    setInterval(function () { var v = document.querySelector('[data-view="notes"].on,#notesView,#v-notes'); b.style.display = (v && v.offsetParent) ? 'block' : 'none'; }, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addImportButton); else addImportButton();
})();
