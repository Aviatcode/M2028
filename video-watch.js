/**
 * M2028 video watcher (content script, every page and frame).
 * Tells the extension when a real video is playing on the page, so time spent watching a stream, a lecture or a movie counts
 * as screen time even when you are not moving the mouse. It only reports "playing / not playing": no page content, no URL.
 */
(function () {
  'use strict';
  if (window.__m2028VW) return; window.__m2028VW = true;
  var last = false, lastSent = 0;
  function bigAndVisible(v) {
    try {
      var r = v.getBoundingClientRect();
      if (r.width < 200 || r.height < 110) return false;               // thumbnails / hover previews are not "watching"
      return r.bottom > 0 && r.right > 0 && r.top < (window.innerHeight || 1e5) && r.left < (window.innerWidth || 1e5);
    } catch (e) { return false; }
  }
  function playing() {
    var vs = document.getElementsByTagName('video');
    for (var i = 0; i < vs.length; i++) {
      var v = vs[i];
      if (!v.paused && !v.ended && v.readyState >= 2 && bigAndVisible(v)) return true;
    }
    return false;
  }
  function report(force) {
    var p = playing(), now = Date.now();
    if (p !== last || force || (p && now - lastSent >= 10000)) {
      last = p; lastSent = now;
      try { chrome.runtime.sendMessage({ type: 'M2028_VIDEO', playing: p }, function () { void (chrome.runtime && chrome.runtime.lastError); }); } catch (e) {}
    }
  }
  ['playing', 'pause', 'ended', 'emptied', 'waiting'].forEach(function (ev) {
    document.addEventListener(ev, function () { report(false); }, true);     // media events do not bubble: capture them
  });
  document.addEventListener('visibilitychange', function () { report(false); });
  setInterval(function () { report(false); }, 5000);
  report(false);
})();
