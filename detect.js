/**
 * M2028 content detector (all categories).
 * It does NOTHING unless you have blocked at least one category in the Block tab. For every category you have turned on
 * it reads the page - address, title, description, headings, visible text, page type labels (og:type, JSON-LD, rating
 * labels) and video elements - scores it, and when the page is clearly that kind of site it asks the background worker
 * to block it and remember the site, so it is blocked instantly next time without you adding anything by hand.
 */
(function () {
  'use strict';
  if (window.top !== window) return;                       // top page only
  if (!/^https?:$/.test(location.protocol)) return;
  var HOST = location.hostname.toLowerCase().replace(/^www\./, '');

  // Never scanned: search engines, reference, news, schools, government, work tools, and the big sites that are already
  // handled by the built-in domain lists of their own category.
  var SAFE = ['google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'wikipedia.org', 'wikimedia.org', 'github.com', 'stackoverflow.com',
    'stackexchange.com', 'reddit.com', 'x.com', 'twitter.com', 'facebook.com', 'instagram.com', 'tiktok.com', 'youtube.com', 'medium.com',
    'quora.com', 'linkedin.com', 'nih.gov', 'who.int', 'bbc.com', 'bbc.co.uk', 'nytimes.com', 'theguardian.com', 'cnn.com', 'thehindu.com',
    'hindustantimes.com', 'ndtv.com', 'indianexpress.com', 'timesofindia.indiatimes.com', 'livemint.com', 'anthropic.com', 'claude.ai',
    'openai.com', 'chatgpt.com', 'gemini.google.com', 'harvard.edu', 'coursera.org', 'khanacademy.org', 'zoom.us', 'meet.google.com',
    'slack.com', 'notion.so', 'drive.google.com', 'docs.google.com', 'mail.google.com', 'outlook.com', 'aviatcode.github.io', 'localhost', '127.0.0.1'];
  function safeHost(h) {
    if (/\.(gov|edu|ac)(\.[a-z]{2})?$/.test(h) || /\.gov\.in$|\.nic\.in$/.test(h)) return true;
    for (var i = 0; i < SAFE.length; i++) { if (h === SAFE[i] || h.slice(-(SAFE[i].length + 1)) === '.' + SAFE[i]) return true; }
    return false;
  }
  if (safeHost(HOST)) return;

  // Word lists per category. A page needs a hit in its title/description/headings AND enough total evidence.
  var WORDS = {
    adult: ['porn', 'porno', 'pornstar', 'pornography', 'xxx', 'hentai', 'nude', 'nudes', 'naked', 'erotic', 'erotica', 'nsfw',
      'sex video', 'sex videos', 'sex tape', 'sex cam', 'sex cams', 'live sex', 'adult video', 'adult videos', 'hardcore', 'milf', 'blowjob',
      'handjob', 'camgirl', 'camgirls', 'webcam girls', 'fetish', 'stripper', 'escort', 'escorts', 'onlyfans', 'adults only'],
    gambling: ['casino', 'online casino', 'live casino', 'sportsbook', 'betting', 'bet now', 'place a bet', 'slots', 'slot machine', 'jackpot',
      'roulette', 'blackjack', 'poker', 'free spins', 'welcome bonus', 'deposit bonus', 'wager', 'bookmaker', 'teen patti', 'satta', 'matka', 'rummy'],
    entertainment: ['watch online', 'watch free', 'watch now', 'full movie', 'free movies', 'movies', 'web series', 'tv shows', 'tv series', 'episodes',
      'season', 'streaming', 'stream live', 'live stream', 'anime', 'subtitles', 'hd movies', 'download movies', 'trailer', 'binge'],
    social: ['followers', 'following', 'news feed', 'who to follow', 'create post', 'retweet', 'repost', 'reels', 'stories', 'social network',
      'social media', 'join the conversation', 'direct messages', 'meet singles', 'dating', 'friend requests', 'add friend', 'your timeline', 'mutual friends'],
    communication: ['chat room', 'chat rooms', 'chatroom', 'random chat', 'video chat', 'group chat', 'instant messaging', 'messenger', 'direct message',
      'talk to strangers', 'chat with strangers', 'free chat', 'voice chat', 'join server', 'online users', 'chat now', 'start chatting']
  };
  var NEED = { adult: 8, gambling: 9, entertainment: 9, social: 9, communication: 9 };
  function compile(list) {
    return list.map(function (t) { return new RegExp('(^|[^a-z0-9])' + t.replace(/ /g, '\\s+') + '([^a-z0-9]|$)', 'g'); });
  }
  var RE = {};
  Object.keys(WORDS).forEach(function (k) { RE[k] = compile(WORDS[k]); });

  function meta(n) { var e = document.querySelector('meta[name="' + n + '"],meta[property="' + n + '"]'); return e ? (e.getAttribute('content') || '') : ''; }
  function features() {
    var f = { ogType: meta('og:type').toLowerCase(), ld: '', videos: 0 };
    try {
      f.ld = Array.prototype.slice.call(document.querySelectorAll('script[type="application/ld+json"]')).map(function (s) { return s.textContent || ''; }).join(' ').slice(0, 20000);
      f.videos = document.querySelectorAll('video').length;
    } catch (e) {}
    return f;
  }
  // extra evidence that is not a word: what the page says it is
  function structural(cat, f, rating) {
    var s = 0;
    if (cat === 'adult' && /rta-5042-1996-1400-1577-rta|(^|\W)(adult|mature)(\W|$)/.test(rating)) s += 100;
    if (cat === 'entertainment') {
      if (/^video\./.test(f.ogType)) s += 5;
      if (/"@type"\s*:\s*"(VideoObject|Movie|TVSeries|TVEpisode)"/i.test(f.ld)) s += 5;
      if (f.videos > 0) s += 2;
    }
    if (cat === 'social') {
      if (f.ogType === 'profile') s += 4;
      if (/"@type"\s*:\s*"(SocialMediaPosting|ProfilePage|DiscussionForumPosting)"/i.test(f.ld)) s += 5;
    }
    return s;
  }
  function wordScore(cat, headText, bodyText) {
    var s = 0, head = 0;
    RE[cat].forEach(function (re) {
      re.lastIndex = 0; if (re.test(headText)) { s += 3; head++; }
      re.lastIndex = 0; var m = bodyText.match(re); if (m) s += Math.min(m.length, 3);
    });
    return { s: s, head: head };
  }
  function scan(cats) {
    var rating = (meta('rating') + ' ' + meta('rta')).toLowerCase();
    var f = features(), heads = '';
    try { heads = Array.prototype.slice.call(document.querySelectorAll('h1,h2')).slice(0, 12).map(function (e) { return e.textContent; }).join(' '); } catch (e) {}
    var headText = (document.title + ' ' + meta('description') + ' ' + meta('keywords') + ' ' + meta('og:title') + ' ' + heads + ' ' + location.pathname).toLowerCase();
    var bodyText = '';
    try { bodyText = ((document.body && document.body.innerText) || '').slice(0, 7000).toLowerCase(); } catch (e) {}
    var best = null;
    for (var i = 0; i < cats.length; i++) {
      var c = cats[i]; if (!RE[c]) continue;
      var st = structural(c, f, rating);
      if (st >= 100) return { cat: c, why: 'rating label', s: st };
      var w = wordScore(c, headText, bodyText), total = w.s + st;
      if (total >= NEED[c] && w.head >= 1 && (!best || total > best.s)) best = { cat: c, why: 'page content', s: total };
    }
    return best;
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
        cats = Object.keys(WORDS).filter(function (c) { return list.some(function (b) { return b && b.target === 'category:' + c; }); });
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
