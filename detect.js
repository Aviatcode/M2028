/**
 * M2028 content detector.
 * Runs on every page but does NOTHING unless you have blocked the "Adult content" or "Gambling" category.
 * It reads the page (address, title, description, headings, visible text, and the adult-site "RTA" rating label),
 * scores it, and when it is clearly that kind of site it asks the background worker to block it and remember the
 * site, so it is blocked instantly next time without you adding anything by hand.
 */
(function () {
  'use strict';
  if (window.top !== window) return;                       // top page only
  if (!/^https?:$/.test(location.protocol)) return;
  var HOST = location.hostname.toLowerCase().replace(/^www\./, '');

  // Never scan: big mixed-content sites (covered by their own categories), search engines, news, reference, schools, government.
  var SAFE = ['google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'wikipedia.org', 'wikimedia.org', 'github.com', 'stackoverflow.com',
    'stackexchange.com', 'reddit.com', 'x.com', 'twitter.com', 'facebook.com', 'instagram.com', 'tiktok.com', 'youtube.com', 'medium.com',
    'quora.com', 'linkedin.com', 'nih.gov', 'who.int', 'bbc.com', 'bbc.co.uk', 'nytimes.com', 'theguardian.com', 'cnn.com', 'thehindu.com',
    'hindustantimes.com', 'ndtv.com', 'indianexpress.com', 'timesofindia.indiatimes.com', 'livemint.com', 'anthropic.com', 'claude.ai',
    'openai.com', 'chatgpt.com', 'harvard.edu', 'coursera.org', 'khanacademy.org', 'aviatcode.github.io', 'localhost', '127.0.0.1'];
  function safeHost(h) {
    if (/\.(gov|edu|ac)(\.[a-z]{2})?$/.test(h) || /\.gov\.in$|\.nic\.in$/.test(h)) return true;
    for (var i = 0; i < SAFE.length; i++) { if (h === SAFE[i] || h.slice(-(SAFE[i].length + 1)) === '.' + SAFE[i]) return true; }
    return false;
  }
  if (safeHost(HOST)) return;

  var ADULT = ['porn', 'porno', 'pornstar', 'pornography', 'xxx', 'hentai', 'nude', 'nudes', 'naked', 'erotic', 'erotica', 'nsfw',
    'sex video', 'sex videos', 'sex tape', 'sex cam', 'sex cams', 'live sex', 'adult video', 'adult videos', 'hardcore', 'milf', 'blowjob',
    'handjob', 'camgirl', 'camgirls', 'webcam girls', 'fetish', 'stripper', 'escort', 'escorts', 'onlyfans', 'adults only'];
  var GAMBLING = ['casino', 'online casino', 'live casino', 'sportsbook', 'betting', 'bet now', 'place a bet', 'slots', 'slot machine', 'jackpot',
    'roulette', 'blackjack', 'poker', 'free spins', 'welcome bonus', 'deposit bonus', 'wager', 'bookmaker', 'teen patti', 'satta', 'matka', 'rummy'];
  function compile(list) {
    return list.map(function (t) { return { t: t, re: new RegExp('(^|[^a-z0-9])' + t.replace(/ /g, '\\s+') + '([^a-z0-9]|$)', 'g') }; });
  }
  var DET = { adult: { terms: compile(ADULT), need: 8 }, gambling: { terms: compile(GAMBLING), need: 9 } };

  function score(cat, headText, bodyText) {
    var d = DET[cat], s = 0, distinctHead = 0;
    d.terms.forEach(function (x) {
      x.re.lastIndex = 0; var h = x.re.test(headText);
      if (h) { s += 3; distinctHead++; }
      x.re.lastIndex = 0; var m = bodyText.match(x.re), n = m ? Math.min(m.length, 3) : 0;
      s += n;
    });
    return { s: s, head: distinctHead, need: d.need };
  }
  function meta(n) { var e = document.querySelector('meta[name="' + n + '"],meta[property="' + n + '"]'); return e ? (e.getAttribute('content') || '') : ''; }
  function scan(cats) {
    var rating = (meta('rating') + ' ' + meta('rta')).toLowerCase();
    if (cats.indexOf('adult') !== -1 && /rta-5042-1996-1400-1577-rta|(^|\W)(adult|mature)(\W|$)/.test(rating)) return { cat: 'adult', why: 'rating label', s: 100 };
    var heads = '';
    try { heads = Array.prototype.slice.call(document.querySelectorAll('h1,h2')).slice(0, 12).map(function (e) { return e.textContent; }).join(' '); } catch (e) {}
    var headText = (document.title + ' ' + meta('description') + ' ' + meta('keywords') + ' ' + meta('og:title') + ' ' + heads + ' ' + location.pathname).toLowerCase();
    var bodyText = '';
    try { bodyText = ((document.body && document.body.innerText) || '').slice(0, 7000).toLowerCase(); } catch (e) {}
    for (var i = 0; i < cats.length; i++) {
      var c = cats[i]; if (!DET[c]) continue;
      var r = score(c, headText, bodyText);
      if (r.s >= r.need && r.head >= 1) return { cat: c, why: 'page content', s: r.s };
    }
    return null;
  }

  var cats = [], scans = 0, sent = false, lastHref = location.href, timer = null;
  function run() {
    if (sent || !cats.length || scans >= 8) return;
    scans++;
    var hit = scan(cats);
    if (!hit) return;
    sent = true;
    try { chrome.runtime.sendMessage({ type: 'CONTENT_DETECTED', category: hit.cat, why: hit.why, score: hit.s, url: location.href }); } catch (e) {}
  }
  function later(ms) { clearTimeout(timer); timer = setTimeout(run, ms); }
  function load() {
    try {
      chrome.storage.local.get('m2028_blocklist', function (r) {
        var list = (r && r.m2028_blocklist) || [];
        cats = ['adult', 'gambling'].filter(function (c) { return list.some(function (b) { return b && b.target === 'category:' + c; }); });
        if (cats.length) { scans = 0; sent = false; later(700); }
      });
    } catch (e) {}
  }
  load();
  try { chrome.storage.onChanged.addListener(function (ch, area) { if (area === 'local' && ch.m2028_blocklist) load(); }); } catch (e) {}
  // single-page sites and lazy content: look again when the title or address changes
  try { new MutationObserver(function () { if (cats.length && !sent) later(1200); }).observe(document.querySelector('title') || document.documentElement, { childList: true, subtree: true, characterData: true }); } catch (e) {}
  setInterval(function () { if (location.href !== lastHref) { lastHref = location.href; if (cats.length && !sent) later(900); } }, 2000);
  window.addEventListener('load', function () { if (cats.length && !sent) later(1500); });
})();
