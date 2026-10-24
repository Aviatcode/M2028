/**
 * M2028 wallpaper bridge (content script, runs on the website only).
 *
 * The website keeps the wallpaper only in its own localStorage (m_wallpaper = data URL,
 * m_wpDim = 0..0.8). The popup lives on a different origin and cannot see that, so this
 * script mirrors both values into chrome.storage.local, where the popup already looks.
 * It runs by itself: the popup does not need to be open, and no other script is involved.
 */
(function () {
  'use strict';
  if (window.__m2028WpBridge) return;
  window.__m2028WpBridge = true;

  var lastSig = null;

  function alive() {
    try { return !!(chrome && chrome.runtime && chrome.runtime.id && chrome.storage && chrome.storage.local); }
    catch (e) { return false; }
  }

  function readPage() {
    try {
      var wp = localStorage.getItem('m_wallpaper');
      var dim = parseFloat(localStorage.getItem('m_wpDim'));
      if (isNaN(dim)) dim = 0.3;
      if (wp && !/^data:image\//.test(wp)) wp = null;
      return { wp: wp || '', dim: dim };
    } catch (e) {
      return null; // storage not readable: change nothing
    }
  }

  function sync() {
    if (!alive()) { stop(); return; }
    var cur = readPage();
    if (!cur) return;
    var sig = cur.wp ? cur.wp.length + ':' + cur.wp.slice(-48) + '|' + cur.dim : '|' + cur.dim;
    if (sig === lastSig) return;
    lastSig = sig;
    try {
      if (cur.wp) {
        chrome.storage.local.set({
          m_wallpaper: cur.wp, wallpaper: cur.wp,
          m_wpDim: cur.dim, wpDim: cur.dim
        });
      } else {
        chrome.storage.local.remove(['m_wallpaper', 'wallpaper', 'm_wpDim', 'wpDim', 'm_wpSig']);
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
    if (!e.key || e.key === 'm_wallpaper' || e.key === 'm_wpDim') sync();
  });
})();
