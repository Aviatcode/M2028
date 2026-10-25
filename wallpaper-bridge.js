/**
 * M2028 wallpaper bridge (content script, runs on the website only).
 *
 * The website keeps the wallpaper in its own localStorage. This script mirrors it
 * into chrome.storage.local under the logged-in account id, so the extension can
 * show a wallpaper only for the account that actually has one. It never writes a
 * global/default wallpaper.
 */
(function () {
  'use strict';
  if (window.__m2028WpBridge) return;
  window.__m2028WpBridge = true;

  var lastSig = null;
  var legacyCleared = false;

  function alive() {
    try { return !!(chrome && chrome.runtime && chrome.runtime.id && chrome.storage && chrome.storage.local); }
    catch (e) { return false; }
  }

  function readUid() {
    try {
      var raw = localStorage.getItem('sb-lvzcctsqcpikisdzztot-auth-token');
      if (raw) {
        try {
          var s = JSON.parse(raw);
          if (s && s.user && s.user.id) return String(s.user.id);
        } catch (e) {}
      }
      return localStorage.getItem('m2028_uid') || '';
    } catch (e) {
      return '';
    }
  }

  function readPage() {
    try {
      var wp = localStorage.getItem('m_wallpaper');
      var dim = parseFloat(localStorage.getItem('m_wpDim'));
      if (isNaN(dim)) dim = 0.3;
      if (wp && !/^data:image\//.test(wp)) wp = null;
      return { wp: wp || '', dim: dim };
    } catch (e) {
      return null;
    }
  }

  function clearLegacy() {
    if (legacyCleared || !alive()) return;
    legacyCleared = true;
    try {
      chrome.storage.local.remove(['m_wallpaper', 'wallpaper', 'm_wpDim', 'wpDim', 'm_wpSig']);
    } catch (e) {}
  }

  function sync() {
    if (!alive()) { stop(); return; }
    clearLegacy();
    var cur = readPage();
    if (!cur) return;
    var uid = readUid();
    var sig = uid + '|' + (cur.wp ? cur.wp.length + ':' + cur.wp.slice(-48) : '') + '|' + cur.dim;
    if (sig === lastSig) return;
    lastSig = sig;
    if (!uid) return;
    var wpKey = 'm2028_wallpaper_' + uid;
    var dimKey = 'm2028_wpDim_' + uid;
    try {
      if (cur.wp) {
        var obj = {};
        obj[wpKey] = cur.wp;
        obj[dimKey] = cur.dim;
        chrome.storage.local.set(obj);
      } else {
        chrome.storage.local.remove([wpKey, dimKey]);
      }
    } catch (e) {}
  }

  var timer = null;
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  sync();
  timer = setInterval(sync, 1500);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) sync(); });
  window.addEventListener('focus', sync);
  window.addEventListener('storage', function (e) {
    if (!e.key || e.key === 'm_wallpaper' || e.key === 'm_wpDim' || e.key === 'm2028_uid' || e.key === 'sb-lvzcctsqcpikisdzztot-auth-token') sync();
  });
})();
