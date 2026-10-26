/**
 * M2028 Background Service Worker (Manifest V3)
 * - Tracks where you spend time most (Active tab, domain, duration, category)
 * - Idle state detection (pauses tracking when away from desk)
 * - Window focus tracking (pauses tracking when user switches away from browser)
 * - One-stop timer alarm coordinator (fires notifications when timer completes even if popup is closed)
 * - Quick search helper (open tabs list & switcher)
 */

'use strict';

const STORAGE_KEY_STATS = 'm2028_time_stats';
const STORAGE_KEY_ACTIVE = 'm2028_active_session';
const STORAGE_KEY_TIMER = 'm2028_timer_state';
const STORAGE_KEY_STOPWATCH = 'm2028_stopwatch_state';

// Predefined domain categories
const CATEGORY_MAP = {
  // Productive / Work / Study / Dev
  'github.com': 'productive',
  'gitlab.com': 'productive',
  'stackoverflow.com': 'productive',
  'developer.mozilla.org': 'productive',
  'notion.so': 'productive',
  'docs.google.com': 'productive',
  'drive.google.com': 'productive',
  'chatgpt.com': 'productive',
  'claude.ai': 'productive',
  'deepmind.google': 'productive',
  'gemini.google.com': 'productive',
  'leetcode.com': 'productive',
  'hackerrank.com': 'productive',
  'coursera.org': 'productive',
  'edx.org': 'productive',
  'khanacademy.org': 'productive',
  'udemy.com': 'productive',
  'wikipedia.org': 'productive',
  'medium.com': 'productive',
  'dev.to': 'productive',
  'arxiv.org': 'productive',
  'w3schools.com': 'productive',
  'figma.com': 'productive',
  'canva.com': 'productive',
  'overleaf.com': 'productive',
  'codepen.io': 'productive',
  'replit.com': 'productive',
  'supabase.com': 'productive',
  'vercel.com': 'productive',
  'localhost': 'productive',
  '127.0.0.1': 'productive',

  // Entertainment / Video / Audio / Gaming
  'youtube.com': 'entertainment',
  'netflix.com': 'entertainment',
  'twitch.tv': 'entertainment',
  'spotify.com': 'entertainment',
  'disneyplus.com': 'entertainment',
  'hulu.com': 'entertainment',
  'primevideo.com': 'entertainment',
  'crunchyroll.com': 'entertainment',
  'soundcloud.com': 'entertainment',
  'steampowered.com': 'entertainment',
  'vimeo.com': 'entertainment',

  // Social
  'twitter.com': 'social',
  'x.com': 'social',
  'reddit.com': 'social',
  'instagram.com': 'social',
  'facebook.com': 'social',
  'tiktok.com': 'social',
  'linkedin.com': 'social',
  'threads.net': 'social',
  'pinterest.com': 'social',
  'snapchat.com': 'social',

  // Communication
  'mail.google.com': 'communication',
  'slack.com': 'communication',
  'discord.com': 'communication',
  'telegram.org': 'communication',
  'web.whatsapp.com': 'communication',
  'teams.microsoft.com': 'communication',
  'zoom.us': 'communication',
  'outlook.com': 'communication',
  'messenger.com': 'communication'
};

// ============================================================
// Website Time Limits & Blocking
// ============================================================

const STORAGE_KEY_LIMITS = 'm2028_limits';
const STORAGE_KEY_BLOCKLIST = 'm2028_blocklist';
const STORAGE_KEY_REDIRECTS = 'm2028_redirect_settings';
const STORAGE_KEY_LIMIT_CACHE = 'm2028_limit_blocked_cache';
const STORAGE_KEY_BLOCK_CACHE = 'm2028_block_rule_cache';

const DEFAULT_LIMIT_REDIRECT = 'https://en.wikipedia.org/wiki/Special:Random';
const DEFAULT_BLOCK_REDIRECT = 'https://theuselessweb.com';

// Domain lists for the block-only categories (adult, gambling) and extras that top up the
// categories already in CATEGORY_MAP (social, entertainment, communication).
const BLOCK_CATEGORY_DOMAINS = {
  adult: [
    'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'redtube.com', 'youporn.com', 'spankbang.com',
    'tube8.com', 'porn.com', 'eporner.com', 'tnaflix.com', 'beeg.com', 'motherless.com', 'brazzers.com',
    'chaturbate.com', 'livejasmin.com', 'stripchat.com', 'bongacams.com', 'camsoda.com', 'cam4.com',
    'myfreecams.com', 'onlyfans.com', 'fansly.com', 'rule34.xxx', 'rule34.xyz', 'nhentai.net', 'hentaihaven.xxx',
    'e-hentai.org', 'exhentai.org', 'fapello.com', 'erome.com', 'thothub.to', 'pornpics.com', 'porntrex.com',
    'sex.com', 'daftsex.com', 'hqporner.com', 'txxx.com', 'hclips.com', 'vporn.com', 'youjizz.com', '4tube.com',
    'sunporno.com', 'drtuber.com', 'gotporn.com', 'naughtyamerica.com', 'realitykings.com', 'bangbros.com',
    'literotica.com', 'missav.com', 'thisav.com', 'javhd.com', 'gelbooru.com', 'xvideos2.com', 'xhamster2.com',
    'pornone.com', 'ixxx.com', 'fuq.com', 'zbporn.com', 'xmoviesforyou.com', 'tubegalore.com', 'sexvid.xxx'
  ],
  gambling: [
    'bet365.com', 'draftkings.com', 'fanduel.com', 'stake.com', 'pokerstars.com', 'bovada.lv', 'betway.com',
    '888casino.com', '888poker.com', 'williamhill.com', 'paddypower.com', 'ladbrokes.com', 'coral.co.uk',
    'unibet.com', 'betfair.com', '1xbet.com', '22bet.com', 'melbet.com', 'mostbet.com', 'parimatch.com',
    'betmgm.com', 'pointsbet.com', 'bwin.com', 'partypoker.com', 'ggpoker.com', 'betano.com', 'bet9ja.com',
    'sportybet.com', 'dafabet.com', '10cric.com', 'betwinner.com', '1win.com', 'rummycircle.com', 'dream11.com',
    'my11circle.com', 'winzogames.com', 'mpl.live', 'pokerbaazi.com', 'adda52.com', 'casino.com', 'leovegas.com',
    'betsson.com', 'bodog.eu', 'ignitioncasino.eu', 'slotomania.com', 'jackpotcity.com', 'roobet.com',
    'bc.game', 'stake.us', 'betrivers.com', 'caesarscasino.com', 'sportsbet.com.au', 'tab.com.au', 'skybet.com'
  ]
};
const EXTRA_CATEGORY_DOMAINS = {
  social: ['tiktok.com', 'snapchat.com', 'pinterest.com', 'tumblr.com', 'threads.net', 'bsky.app', 'quora.com', '9gag.com', 'mastodon.social', 'bereal.com', 'x.com', 'twitter.com', 'reddit.com', 'instagram.com', 'facebook.com'],
  entertainment: ['youtube.com', 'netflix.com', 'twitch.tv', 'primevideo.com', 'hotstar.com', 'disneyplus.com', 'hulu.com', 'crunchyroll.com', 'dailymotion.com', 'jiocinema.com', 'sonyliv.com', 'zee5.com', 'max.com', 'hbomax.com', 'peacocktv.com', 'paramountplus.com', 'kick.com', 'rumble.com'],
  communication: ['whatsapp.com', 'telegram.org', 't.me', 'discord.com', 'discord.gg', 'messenger.com', 'signal.org', 'viber.com', 'line.me', 'wechat.com', 'omegle.com', 'ome.tv']
};

// Keywords that mark a site as adult even if it is not on the list above (new domains, mirrors, etc.)
const ADULT_KEYWORDS = ['porn', 'xxx', 'hentai', 'xvideo', 'xnxx', 'xhamster', 'redtube', 'youporn', 'brazzers',
  'chaturbate', 'livejasmin', 'stripchat', 'bongacams', 'onlyfans', 'rule34', 'spankbang', 'eporner', 'tnaflix',
  'motherless', 'camsoda', 'nsfw'];
const ADULT_REGEX = '^https?://([a-z0-9-]+\\.)*[a-z0-9-]*(' + ADULT_KEYWORDS.join('|') + ')[a-z0-9-]*(\\.[a-z0-9-]+)+([:/?#]|$)';
const ADULT_RE_JS = new RegExp(ADULT_REGEX, 'i');
const DNR_ADULT_KEYWORD_ID = 3990;

// Rules we manage all live in these id ranges so we can safely wipe & rebuild them
const DNR_BLOCK_ID_BASE = 1;      // permanent blocklist
const DNR_LIMIT_ID_BASE = 2000;   // today's over-the-limit sites
const DNR_MANAGED_MAX_ID = 3999;

// Turn a stored target ("youtube.com" or "category:adult") into concrete domains
function expandTargetDomains(target, customRules) {
  if (!target) return [];
  if (target.startsWith('category:')) {
    const cat = target.slice('category:'.length);
    const out = new Set(BLOCK_CATEGORY_DOMAINS[cat] || []);
    (EXTRA_CATEGORY_DOMAINS[cat] || []).forEach(d => out.add(d));
    for (const [d, c] of Object.entries(CATEGORY_MAP)) if (c === cat) out.add(d);
    for (const [d, c] of Object.entries(customRules || {})) if (c === cat) out.add(d);
    return [...out];
  }
  return [target];
}

// ============================================================
// Commitment lock
// Everything on the blocklist / limit list is "committed". The UIs (popup, options page, website tab)
// can only ADD or TIGHTEN. Removing or loosening needs a request that waits COOLOFF_MS. This service
// worker is the single authority: if any other code edits the lists, they are put back immediately.
// ============================================================
const STORAGE_KEY_LOCK = 'm2028_lock';
const STORAGE_KEY_LOCK_MIRROR = 'm2028_lock_mirror';
const STORAGE_KEY_USAGE_TRACK = 'm2028_usage_track';
const STORAGE_KEY_LIMIT_USAGE = 'm2028_limit_usage';
const COOLOFF_MS = 72 * 60 * 60 * 1000; // how long a removal / loosening request must wait
const LOCK_MAX_ITEMS = 10;
const LOCK_CATEGORIES = ['adult', 'gambling', 'social', 'entertainment', 'communication'];

function lockTarget(t) {
  t = String(t || '').trim().toLowerCase();
  if (t.startsWith('category:')) return LOCK_CATEGORIES.includes(t.slice(9)) ? t : '';
  if (t.startsWith('www.')) t = t.slice(4);
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(t) ? t : '';
}
function lockUrl(u, fallback) {
  try { const x = new URL(String(u || '').trim()); if (x.protocol === 'http:' || x.protocol === 'https:') return x.href; } catch (e) {}
  return fallback;
}
function canonJson(v) {
  if (Array.isArray(v)) return v.map(canonJson);
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach(k => { o[k] = canonJson(v[k]); }); return o; }
  return v;
}
function sameJson(a, b) { return JSON.stringify(canonJson(a)) === JSON.stringify(canonJson(b)); }
function emptyLock() { return { v: 1, rev: 0, entries: {}, redirects: null }; }

function cleanLockObject(l, now) {
  if (!l || l.v !== 1 || !l.entries || typeof l.entries !== 'object' || Array.isArray(l.entries)) return null;
  const out = { v: 1, rev: Number(l.rev) || 0, entries: {}, redirects: null };
  for (const e of Object.values(l.entries)) {
    if (!e || (e.kind !== 'block' && e.kind !== 'limit')) continue;
    const target = lockTarget(e.target);
    if (!target) continue;
    const ne = { kind: e.kind, target, addedAt: Math.min(Number(e.addedAt) || now, now) };
    if (e.kind === 'limit') {
      const m = Math.round(Number(e.minutes));
      if (!(m >= 1 && m <= 1440)) continue;
      ne.minutes = m;
    }
    if (e.req && (e.req.op === 'remove' || (e.req.op === 'raise' && e.kind === 'limit'))) {
      ne.req = { op: e.req.op, requestedAt: Math.min(Number(e.req.requestedAt) || now, now) };
      if (e.req.op === 'raise') {
        const rm = Math.round(Number(e.req.minutes));
        if (!(rm > ne.minutes && rm <= 1440)) delete ne.req; else ne.req.minutes = rm;
      }
    }
    out.entries[ne.kind + ':' + ne.target] = ne;
  }
  if (l.redirects && typeof l.redirects === 'object') {
    out.redirects = {
      limitRedirectUrl: lockUrl(l.redirects.limitRedirectUrl, DEFAULT_LIMIT_REDIRECT),
      blockRedirectUrl: lockUrl(l.redirects.blockRedirectUrl, DEFAULT_BLOCK_REDIRECT)
    };
  }
  return out;
}
// Two copies are stored. If someone edits one, the other (equal revision) wins.
function pickLock(a, b, now) {
  const ca = cleanLockObject(a, now), cb = cleanLockObject(b, now);
  if (ca && cb) return ca.rev > cb.rev ? ca : cb;
  return ca || cb || emptyLock();
}
function cleanBlockList(list) {
  const seen = new Set(), out = [];
  for (const b of Array.isArray(list) ? list : []) {
    const t = lockTarget(b && b.target);
    if (t && !seen.has(t) && out.length < LOCK_MAX_ITEMS) { seen.add(t); out.push({ target: t }); }
  }
  return out;
}
function cleanLimitList(list) {
  const seen = new Set(), out = [];
  for (const l of Array.isArray(list) ? list : []) {
    const t = lockTarget(l && l.target);
    const m = Math.round(Number(l && l.minutes));
    if (t && m >= 1 && m <= 1440 && !seen.has(t) && out.length < LOCK_MAX_ITEMS) { seen.add(t); out.push({ target: t, minutes: m }); }
  }
  return out;
}

let lockQueue = Promise.resolve();
function queueLock(fn) {
  const run = lockQueue.then(fn, fn);
  lockQueue = run.catch(() => {});
  return run;
}

async function doEnforceLock() {
  const data = await chrome.storage.local.get([
    STORAGE_KEY_LIMITS, STORAGE_KEY_BLOCKLIST, STORAGE_KEY_REDIRECTS, STORAGE_KEY_LOCK, STORAGE_KEY_LOCK_MIRROR
  ]);
  const now = Date.now();
  const lock = pickLock(data[STORAGE_KEY_LOCK], data[STORAGE_KEY_LOCK_MIRROR], now);
  const E = lock.entries;
  let changed = !sameJson(lock, data[STORAGE_KEY_LOCK]) || !sameJson(lock, data[STORAGE_KEY_LOCK_MIRROR]);
  const count = kind => Object.values(E).filter(e => e.kind === kind).length;

  // 1. Register anything new that was added (adding is always allowed) and accept tightened limits
  for (const b of cleanBlockList(data[STORAGE_KEY_BLOCKLIST])) {
    const k = 'block:' + b.target;
    if (!E[k] && count('block') < LOCK_MAX_ITEMS) { E[k] = { kind: 'block', target: b.target, addedAt: now }; changed = true; }
  }
  for (const l of cleanLimitList(data[STORAGE_KEY_LIMITS])) {
    const k = 'limit:' + l.target, e = E[k];
    if (!e) {
      if (count('limit') < LOCK_MAX_ITEMS) { E[k] = { kind: 'limit', target: l.target, minutes: l.minutes, addedAt: now }; changed = true; }
    } else if (l.minutes < e.minutes) {
      e.minutes = l.minutes;
      if (e.req && e.req.op === 'raise' && e.req.minutes <= e.minutes) delete e.req;
      changed = true;
    }
  }

  // 2. Apply requests whose waiting period is over
  for (const k of Object.keys(E)) {
    const e = E[k];
    if (e.req && e.req.requestedAt + COOLOFF_MS <= now) {
      if (e.req.op === 'remove') delete E[k];
      else { e.minutes = e.req.minutes; delete e.req; }
      changed = true;
    }
  }

  // 3. Redirect pages are locked as soon as anything is locked
  if (Object.keys(E).length) {
    if (!lock.redirects) {
      const r = data[STORAGE_KEY_REDIRECTS] || {};
      lock.redirects = {
        limitRedirectUrl: lockUrl(r.limitRedirectUrl, DEFAULT_LIMIT_REDIRECT),
        blockRedirectUrl: lockUrl(r.blockRedirectUrl, DEFAULT_BLOCK_REDIRECT)
      };
      changed = true;
    }
  } else if (lock.redirects) { lock.redirects = null; changed = true; }

  // 4. Make the live lists match the lock exactly (puts back anything deleted or loosened)
  const entries = Object.values(E).sort((a, b) => a.addedAt - b.addedAt);
  const wantBlock = entries.filter(e => e.kind === 'block').map(e => ({ target: e.target }));
  const wantLimits = entries.filter(e => e.kind === 'limit').map(e => ({ target: e.target, minutes: e.minutes }));
  const out = {};
  if (!sameJson(data[STORAGE_KEY_BLOCKLIST] || [], wantBlock)) out[STORAGE_KEY_BLOCKLIST] = wantBlock;
  if (!sameJson(data[STORAGE_KEY_LIMITS] || [], wantLimits)) out[STORAGE_KEY_LIMITS] = wantLimits;
  if (lock.redirects && !sameJson(data[STORAGE_KEY_REDIRECTS], lock.redirects)) out[STORAGE_KEY_REDIRECTS] = lock.redirects;
  if (changed) {
    lock.rev = (lock.rev || 0) + 1;
    out[STORAGE_KEY_LOCK] = lock;
    out[STORAGE_KEY_LOCK_MIRROR] = lock;
  }
  if (Object.keys(out).length) await chrome.storage.local.set(out);
}
function enforceLock() { return queueLock(doEnforceLock).catch(e => console.warn('enforceLock error:', e)); }

// op: 'remove' | 'raise' | 'cancel'. Removal/raising only schedules a change; it applies after COOLOFF_MS.
async function doLockRequest(m) {
  await doEnforceLock();
  const data = await chrome.storage.local.get([STORAGE_KEY_LOCK, STORAGE_KEY_LOCK_MIRROR]);
  const now = Date.now();
  const lock = pickLock(data[STORAGE_KEY_LOCK], data[STORAGE_KEY_LOCK_MIRROR], now);
  const target = lockTarget(m.target);
  const e = lock.entries[(m.kind === 'limit' ? 'limit' : 'block') + ':' + target];
  if (!e) return { ok: false, error: 'Not found' };
  if (m.op === 'cancel') {
    if (!e.req) return { ok: true };
    delete e.req;
  } else if (m.op === 'remove') {
    if (e.req) return { ok: false, error: 'A request is already waiting. Cancel it first.' };
    e.req = { op: 'remove', requestedAt: now };
  } else if (m.op === 'raise') {
    const nm = Math.round(Number(m.minutes));
    if (e.kind !== 'limit' || !(nm > e.minutes && nm <= 1440)) return { ok: false, error: 'Invalid new limit' };
    if (e.req) return { ok: false, error: 'A request is already waiting. Cancel it first.' };
    e.req = { op: 'raise', requestedAt: now, minutes: nm };
  } else {
    return { ok: false, error: 'Unknown request' };
  }
  lock.rev = (lock.rev || 0) + 1;
  await chrome.storage.local.set({ [STORAGE_KEY_LOCK]: lock, [STORAGE_KEY_LOCK_MIRROR]: lock });
  return { ok: true };
}
function lockRequest(m) { return queueLock(() => doLockRequest(m)).catch(e => ({ ok: false, error: String(e) })); }

function makeRedirectRule(id, domain, reason) {
  return {
    id,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: { extensionPath: `/blocked.html?reason=${reason}&domain=${encodeURIComponent(domain)}` }
    },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes: ['main_frame']
    }
  };
}

// Instantly send any already-open tab away from a domain that just became blocked
async function redirectOpenTabs(entries) {
  if (!entries.length) return;
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.url || !tab.id) continue;
      const domain = extractDomain(tab.url);
      if (!domain) continue;
      const hit = entries.find(e => domain === e.d || domain.endsWith('.' + e.d));
      if (hit) {
        const dest = chrome.runtime.getURL(`blocked.html?reason=${hit.reason}&domain=${encodeURIComponent(domain)}`);
        chrome.tabs.update(tab.id, { url: dest }).catch(() => {});
      }
    }
  } catch (e) {}
}

// Recompute the full blocking picture (permanent blocklist + today's over-limit sites)
// and sync it to declarativeNetRequest. Dynamic DNR rules work at the network layer,
// so once a rule exists, Chrome enforces it instantly even if this service worker is asleep.
async function syncBlocking() {
  if (!chrome.declarativeNetRequest) return;

  try {
    await enforceLock();
    const data = await chrome.storage.local.get([
      STORAGE_KEY_LIMITS, STORAGE_KEY_BLOCKLIST, STORAGE_KEY_STATS,
      'm2028_custom_rules', STORAGE_KEY_LIMIT_CACHE, STORAGE_KEY_BLOCK_CACHE, STORAGE_KEY_USAGE_TRACK
    ]);

    const limits = data[STORAGE_KEY_LIMITS] || [];
    const blocklist = data[STORAGE_KEY_BLOCKLIST] || [];
    const customRules = data.m2028_custom_rules || {};
    const stats = data[STORAGE_KEY_STATS] || {};
    const today = getTodayKey();
    const todayData = stats[today] || { totalSeconds: 0, domains: {} };

    // 1. Permanent blocklist domains
    const blockedDomains = new Set();
    let adultKeywords = false;
    for (const entry of blocklist) {
      if (entry.target === 'category:adult') adultKeywords = true;
      expandTargetDomains(entry.target, customRules).forEach(d => blockedDomains.add(d));
    }

    // 2. Domains over today's limit. Usage is counted cumulatively so wiping the history
    //    in the middle of the day cannot reset a limit.
    let track = data[STORAGE_KEY_USAGE_TRACK];
    if (!track || track.day !== today) track = { day: today, t: {} };
    const usageOut = {};
    const overLimitDomains = new Set();
    for (const limit of limits) {
      const limitSeconds = (Number(limit.minutes) || 0) * 60;
      if (limitSeconds <= 0) continue;
      const domains = expandTargetDomains(limit.target, customRules);
      let computed = 0;
      for (const d of domains) {
        const rec = todayData.domains && todayData.domains[d];
        if (rec) computed += rec.seconds;
      }
      const prev = track.t[limit.target] || { last: 0, cum: 0 };
      prev.cum += computed >= prev.last ? computed - prev.last : computed;
      prev.last = computed;
      track.t[limit.target] = prev;
      usageOut[limit.target] = prev.cum;
      if (prev.cum >= limitSeconds) domains.forEach(d => overLimitDomains.add(d));
    }
    // Permanent blocks take priority — don't double-handle as a "limit" redirect
    for (const d of [...overLimitDomains]) {
      if (blockedDomains.has(d)) overLimitDomains.delete(d);
    }

    // 3. Diff against the last sync so we know what just became blocked
    const prevBlocked = new Set(data[STORAGE_KEY_BLOCK_CACHE] || []);
    const prevLimited = new Set(data[STORAGE_KEY_LIMIT_CACHE] || []);
    const newlyBlocked = [...blockedDomains].filter(d => !prevBlocked.has(d));
    const newlyLimited = [...overLimitDomains].filter(d => !prevLimited.has(d));
    const newlyAdultKeywords = adultKeywords && !prevBlocked.has('#adult-keywords');

    await chrome.storage.local.set({
      [STORAGE_KEY_BLOCK_CACHE]: [...blockedDomains, ...(adultKeywords ? ['#adult-keywords'] : [])],
      [STORAGE_KEY_LIMIT_CACHE]: [...overLimitDomains],
      [STORAGE_KEY_USAGE_TRACK]: track,
      [STORAGE_KEY_LIMIT_USAGE]: usageOut
    });

    // 4. Rebuild our managed dynamic rules
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existing
      .map(r => r.id)
      .filter(id => id >= DNR_BLOCK_ID_BASE && id <= DNR_MANAGED_MAX_ID);

    const addRules = [];
    let blockId = DNR_BLOCK_ID_BASE;
    for (const domain of blockedDomains) addRules.push(makeRedirectRule(blockId++, domain, 'block'));
    let limitId = DNR_LIMIT_ID_BASE;
    for (const domain of overLimitDomains) addRules.push(makeRedirectRule(limitId++, domain, 'limit'));
    if (adultKeywords) {
      let ok = true;
      try {
        const sup = await chrome.declarativeNetRequest.isRegexSupported({ regex: ADULT_REGEX });
        ok = !!(sup && sup.isSupported);
      } catch (e) { ok = false; }
      if (ok) {
        addRules.push({
          id: DNR_ADULT_KEYWORD_ID,
          priority: 1,
          action: { type: 'redirect', redirect: { extensionPath: '/blocked.html?reason=block&domain=' + encodeURIComponent('adult site') } },
          condition: { regexFilter: ADULT_REGEX, resourceTypes: ['main_frame'] }
        });
      }
    }

    if (removeRuleIds.length || addRules.length) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
    }

    // 5. Boot any tab already sitting on something that just got blocked
    const toRedirect = [
      ...newlyBlocked.map(d => ({ d, reason: 'block' })),
      ...newlyLimited.map(d => ({ d, reason: 'limit' }))
    ];
    if (toRedirect.length) await redirectOpenTabs(toRedirect);
    if (adultKeywords && (newlyAdultKeywords || true)) {
      try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (tab.url && tab.id && ADULT_RE_JS.test(tab.url)) {
            chrome.tabs.update(tab.id, { url: chrome.runtime.getURL('blocked.html?reason=block&domain=' + encodeURIComponent('adult site')) }).catch(() => {});
          }
        }
      } catch (e) {}
    }
  } catch (err) {
    console.warn('syncBlocking error:', err);
  }
}

// State variables
let currentDomain = null;
let currentTitle = '';
let currentFavicon = '';
let sessionStartTime = Date.now();
let isWindowFocused = true;
let isUserActive = true;

// Helper: Get Today's Date String YYYY-MM-DD
function getTodayKey() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper: Extract domain from URL
function extractDomain(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (['http:', 'https:'].includes(u.protocol)) {
      let hostname = u.hostname.toLowerCase();
      if (hostname.startsWith('www.')) hostname = hostname.slice(4);
      return hostname;
    }
    if (u.protocol === 'chrome:') {
      return 'chrome://' + u.hostname;
    }
    if (u.protocol === 'file:') {
      return 'local-file';
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Helper: Get category for domain
function getCategory(domain) {
  if (!domain) return 'other';
  if (CATEGORY_MAP[domain]) return CATEGORY_MAP[domain];
  // Check parent domains (e.g. sub.github.com -> github.com)
  const parts = domain.split('.');
  if (parts.length > 2) {
    const parent = parts.slice(-2).join('.');
    if (CATEGORY_MAP[parent]) return CATEGORY_MAP[parent];
  }
  return 'other';
}

// Flush current tracking delta into chrome.storage.local
async function flushTime() {
  if (!currentDomain || !isWindowFocused || !isUserActive) {
    sessionStartTime = Date.now();
    return;
  }

  const now = Date.now();
  const deltaSeconds = Math.floor((now - sessionStartTime) / 1000);
  if (deltaSeconds < 1) return;

  sessionStartTime = now;
  const today = getTodayKey();
  const domain = currentDomain;
  const category = getCategory(domain);

  try {
    const res = await chrome.storage.local.get([STORAGE_KEY_STATS]);
    const stats = res[STORAGE_KEY_STATS] || {};

    if (!stats[today]) {
      stats[today] = {
        totalSeconds: 0,
        domains: {}
      };
    }

    stats[today].totalSeconds = (stats[today].totalSeconds || 0) + deltaSeconds;

    if (!stats[today].domains[domain]) {
      stats[today].domains[domain] = {
        seconds: 0,
        title: currentTitle || domain,
        favicon: currentFavicon || '',
        category: category
      };
    }

    stats[today].domains[domain].seconds += deltaSeconds;
    if (currentTitle) stats[today].domains[domain].title = currentTitle;
    if (currentFavicon) stats[today].domains[domain].favicon = currentFavicon;

    // Prune stats older than 14 days
    const days = Object.keys(stats).sort();
    if (days.length > 14) {
      const toRemove = days.slice(0, days.length - 14);
      toRemove.forEach(k => delete stats[k]);
    }

    await chrome.storage.local.set({
      [STORAGE_KEY_STATS]: stats,
      [STORAGE_KEY_ACTIVE]: {
        domain: currentDomain,
        title: currentTitle,
        favicon: currentFavicon,
        category: category,
        startedAt: sessionStartTime,
        todayTotal: stats[today].domains[domain].seconds
      }
    });
  } catch (err) {
    console.error('Error flushing time stats:', err);
  }
}

// Switch active tracking target
async function updateActiveTarget(url, title, favicon) {
  await flushTime();

  const domain = extractDomain(url);
  currentDomain = domain;
  currentTitle = title || '';
  currentFavicon = favicon || '';
  sessionStartTime = Date.now();

  try {
    if (currentDomain) {
      await chrome.storage.local.set({
        [STORAGE_KEY_ACTIVE]: {
          domain: currentDomain,
          title: currentTitle,
          favicon: currentFavicon,
          category: getCategory(currentDomain),
          startedAt: sessionStartTime
        }
      });
    } else {
      await chrome.storage.local.remove([STORAGE_KEY_ACTIVE]);
    }
  } catch (e) {}
}

// Check current active tab in focused window
async function checkCurrentTab() {
  try {
    let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) {
      const curTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tab = curTabs && curTabs[0];
    }
    if (!tab) {
      const anyTabs = await chrome.tabs.query({ active: true });
      tab = anyTabs && anyTabs[0];
    }
    if (tab && tab.url) {
      await updateActiveTarget(tab.url, tab.title, tab.favIconUrl);
    } else {
      await updateActiveTarget(null, '', '');
    }
  } catch (e) {
    // Ignore query errors
  }
}

// Work out once whether the browser window is focused and the user is active,
// so a service-worker restart never starts counting time in the background.
async function initTrackingState() {
  try {
    const win = await chrome.windows.getLastFocused();
    isWindowFocused = !!(win && win.focused);
  } catch (e) {}
  if (chrome.idle && chrome.idle.queryState) {
    try {
      const state = await chrome.idle.queryState(60);
      isUserActive = state === 'active';
    } catch (e) {}
  }
  await checkCurrentTab();
  sessionStartTime = Date.now();
}

// Tab activated listener
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url) {
      await updateActiveTarget(tab.url, tab.title, tab.favIconUrl);
    }
  } catch (e) {}
});

// Tab updated listener (URL changed or page finished loading)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab && tab.active && (changeInfo.url || changeInfo.title || changeInfo.favIconUrl)) {
    await updateActiveTarget(tab.url, tab.title, tab.favIconUrl);
  }
});

// Window focus changed listener
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await flushTime();
    isWindowFocused = false;
    sessionStartTime = Date.now();
  } else {
    // Don't count the time the browser spent unfocused: reset the
    // session clock before flushing/rebasing on the newly focused tab.
    sessionStartTime = Date.now();
    isWindowFocused = true;
    await checkCurrentTab();
  }
});

// Idle state changed listener (pauses tracking when away from computer)
if (chrome.idle) {
  chrome.idle.setDetectionInterval(60); // 60 seconds
  chrome.idle.onStateChanged.addListener(async (newState) => {
    if (newState === 'active') {
      sessionStartTime = Date.now();
      isUserActive = true;
    } else {
      await flushTime();
      isUserActive = false;
      sessionStartTime = Date.now();
    }
  });
}

// Pomodoro Helper: log session to shared history
async function logPomoSession(sub, dur) {
  const d = getTodayKey();
  const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const res = await chrome.storage.local.get(['m_pomSessions', 'pomSessions', 'm_pd', 'pd']);
  let sessions = res.m_pomSessions || res.pomSessions || [];
  if (!Array.isArray(sessions)) sessions = [];
  sessions.push({
    d: d,
    sub: sub || 'General',
    dur: dur || 3000,
    t: timeStr
  });

  let pd = res.m_pd || res.pd || {};
  if (typeof pd !== 'object' || pd === null) pd = {};
  pd[d] = (pd[d] || 0) + 1;

  await chrome.storage.local.set({
    m_pomSessions: sessions,
    pomSessions: sessions,
    m_pd: pd,
    pd: pd
  });
}

// Pomodoro Helper: update extension action badge
function updatePomoBadge(st) {
  try {
    if (!chrome.action) return;
    if (st && st.run && st.endTs) {
      const remSec = Math.max(0, Math.round((st.endTs - Date.now()) / 1000));
      // Badge runs 2 minutes ahead: 36 min left shows 34m
      const min = Math.ceil(Math.max(0, remSec - 120) / 60);
      chrome.action.setBadgeText({ text: min > 0 ? String(min) + 'm' : '0m' });
      chrome.action.setBadgeBackgroundColor({
        color: st.mode === 'focus' ? '#4fd8a0' : '#e8965a'
      });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (e) {}
}

// ---- Pomodoro sound (played through a hidden offscreen page, because a service worker cannot play audio) ----
let _offscreenPromise = null;

async function ensureOffscreen() {
  if (!chrome.offscreen || !chrome.runtime.getContexts) return false;
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (existing && existing.length) return true;
  if (!_offscreenPromise) {
    _offscreenPromise = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play the Pomodoro break and end sounds while the popup is closed'
    }).catch(function () {}).then(function () { _offscreenPromise = null; });
  }
  await _offscreenPromise;
  return true;
}

// Only one place (popup or background) may play the sound for a given phase end
async function claimPomoSound(phaseEnd) {
  try {
    const r = await chrome.storage.local.get('m2028_pomoSoundClaim');
    if (phaseEnd && r.m2028_pomoSoundClaim === phaseEnd) return false;
    await chrome.storage.local.set({ m2028_pomoSoundClaim: phaseEnd || Date.now() });
  } catch (e) {}
  return true;
}

// True when this browser can play the sound itself (then the system notification sound is switched off)
const CAN_PLAY_SOUND = !!(chrome.offscreen && chrome.runtime.getContexts);

// kind: 'session' = focus finished, break starts | 'end' = break finished
async function playPomoSound(kind, phaseEnd) {
  try {
    if (!(await claimPomoSound(phaseEnd))) return true; // the popup already played it
    if (!(await ensureOffscreen())) return false;
    const r = await chrome.storage.local.get(['m_pomSoundStyle', 'pomSoundStyle']);
    let style = r.m_pomSoundStyle || r.pomSoundStyle || 'bell';
    if (typeof style !== 'string') style = 'bell';
    const res = await chrome.runtime.sendMessage({ target: 'm2028-offscreen', type: 'PLAY_POMO_SOUND', kind: kind, style: style });
    try { await chrome.offscreen.closeDocument(); } catch (e) {}
    const ok = !!(res && res.ok);
    try { await chrome.storage.local.set({ m2028_lastPomoSound: { kind: kind, style: style, ok: ok, at: Date.now() } }); } catch (e) {}
    return ok;
  } catch (e) {
    console.warn('Pomo sound error:', e);
    return false;
  }
}

// Pomodoro notifications arrive 2 minutes BEFORE a phase ends (a heads-up), never late.
const POMO_NOTIFY_LEAD_MS = 2 * 60 * 1000;
const POMO_ON_TIME_MS = 15 * 1000;

async function schedulePomoAlarms(st) {
  try {
    await chrome.alarms.clear('m2028_pomo_alarm');
    await chrome.alarms.clear('m2028_pomo_warn');
    if (!st || !st.run || !st.endTs) return;
    const now = Date.now();
    const warnAt = st.endTs - POMO_NOTIFY_LEAD_MS;
    if (warnAt > now + 2000) chrome.alarms.create('m2028_pomo_warn', { when: warnAt });
    chrome.alarms.create('m2028_pomo_alarm', { when: Math.max(st.endTs, now + 1000) });
  } catch (e) {}
}

// Chain the next phase from the phase's SCHEDULED end, not from "now" after a late alarm.
// This removes the drift that made notifications fall minutes behind.
function nextPomoPhaseEnd(phaseEnd, lenMs) {
  const now = Date.now();
  const next = (Number(phaseEnd) || now) + lenMs;
  return next <= now + 1000 ? now + lenMs : next;
}

// Alarms: Heartbeat every 30 seconds to persist time continuously
chrome.alarms.create('m2028_tracker_flush', { periodInMinutes: 0.5 });
// Keeps the toolbar badge (minutes left) counting down while the popup is closed
chrome.alarms.create('m2028_pomo_tick', { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'm2028_tracker_flush') {
    // Re-read the active tab every heartbeat so the tracker can never stay
    // stuck on a stale tab if a tab/window event was missed.
    await checkCurrentTab();
    await flushTime();
    await syncBlocking();
  } else if (alarm.name === 'm2028_pomo_tick') {
    try {
      const res = await chrome.storage.local.get(['pom_state', 'm_pomLive']);
      updatePomoBadge(res.pom_state || res.m_pomLive || null);
    } catch (e) {}
  } else if (alarm.name === 'm2028_pomo_warn') {
    // Heads-up fired 2 minutes before the phase end.
    try {
      const res = await chrome.storage.local.get(['pom_state', 'm_pomLive']);
      const st = res.pom_state || res.m_pomLive;
      if (!st || !st.run || !st.endTs) return;
      const left = st.endTs - Date.now();
      // Ignore stale warnings (phase already changed or restarted).
      if (left < 3000 || left > POMO_NOTIFY_LEAD_MS + 8000) return;
      chrome.notifications.create('m2028_pomo_warn_' + st.endTs, {
        type: 'basic',
        iconUrl: 'icon-192.png',
        title: st.mode === 'focus' ? '⏳ Focus ends in 2 minutes' : '⏳ Break ends in 2 minutes',
        message: st.mode === 'focus'
          ? 'Wrap up what you are doing — your break starts soon.'
          : 'Get ready — the next focus session starts soon.',
        priority: 2,
        requireInteraction: false
      });
    } catch (e) {
      console.warn('Pomo warning error:', e);
    }
  } else if (alarm.name === 'm2028_timer_alarm') {
    // Timer reached 0!
    try {
      chrome.notifications.create('m2028_timer_ended', {
        type: 'basic',
        iconUrl: 'icon-192.png',
        title: '⏰ M2028 Timer Finished!',
        message: 'Your timer countdown has ended. Great focus session!',
        priority: 2,
        requireInteraction: true
      });
      await chrome.storage.local.set({
        [STORAGE_KEY_TIMER]: { running: false, remaining: 0, total: 0, label: 'Finished' }
      });
    } catch (e) {
      console.warn('Notification error:', e);
    }
  } else if (alarm.name === 'm2028_pomo_alarm') {
    // Pomodoro phase reached 0!
    try {
      const res = await chrome.storage.local.get(['pom_state', 'm_pomLive']);
      let st = res.pom_state || res.m_pomLive;
      if (!st || !st.run) return;

      // Stale alarm: the popup or website already moved this timer to its next phase, so do nothing
      if (st.endTs && st.endTs - Date.now() > 2000) {
        schedulePomoAlarms(st);
        updatePomoBadge(st);
        return;
      }

      const tot = st.tot || 4;
      const phaseEnd = st.endTs;
      const onTime = !phaseEnd || Math.abs(Date.now() - phaseEnd) <= POMO_ON_TIME_MS;
      if (st.mode === 'focus') {
        st.cur = (st.cur || 0) + 1;
        await logPomoSession(st.sub || 'General', st.phaseLen || 3000);

        const isLong = st.cur % tot === 0;
        const breakLen = isLong ? 1800 : (st.phaseLen === 1500 ? 300 : 600);

        // Break sound: starts right away and plays alongside the phase change (it never delays it)
        playPomoSound('session', phaseEnd);
        if (onTime) {
          chrome.notifications.create('m2028_pomo_end_' + Date.now(), {
            type: 'basic',
            iconUrl: 'icon-192.png',
            title: isLong ? `🏆 All ${tot} Sessions Complete!` : '✅ Focus Session Done!',
            message: isLong ? 'Awesome work! Take a 30-min long break.' : `Take a ${breakLen / 60}-min break. Refresh and stretch!`,
            priority: 2,
            requireInteraction: true,
            silent: CAN_PLAY_SOUND
          });
        }

        st.mode = 'break';
        st.phaseLen = breakLen;
        st.rem = breakLen;
        st.run = true;
        st.endTs = nextPomoPhaseEnd(phaseEnd, breakLen * 1000);
        st.u = Date.now();
        st.dev = 'extension';

        await schedulePomoAlarms(st);
        await chrome.storage.local.set({ pom_state: st, m_pomLive: st });
        updatePomoBadge(st);
      } else {
        // Break over
        if (st.cur >= tot) {
          playPomoSound('end', phaseEnd);
          if (onTime) {
            chrome.notifications.create('m2028_pomo_cycle_' + Date.now(), {
              type: 'basic',
              iconUrl: 'icon-192.png',
              title: '🎉 Daily Pomodoro Cycle Complete!',
              message: 'All scheduled sessions finished! Great discipline today.',
              priority: 2,
              requireInteraction: true,
              silent: CAN_PLAY_SOUND
            });
          }

          st.run = false;
          st.mode = 'focus';
          st.cur = 0;
          st.phaseLen = 3000;
          st.rem = 3000;
          st.endTs = null;
          st.u = Date.now();
          st.dev = 'extension';

          await schedulePomoAlarms(st);
          await chrome.storage.local.set({ pom_state: st, m_pomLive: st });
          updatePomoBadge(st);
        } else {
          playPomoSound('end', phaseEnd);
          if (onTime) {
            chrome.notifications.create('m2028_pomo_next_' + Date.now(), {
              type: 'basic',
              iconUrl: 'icon-192.png',
              title: '☕ Break Over!',
              message: `Starting focus session ${(st.cur || 0) + 1} of ${tot}. Let's dive in!`,
              priority: 2,
              requireInteraction: true,
              silent: CAN_PLAY_SOUND
            });
          }

          st.mode = 'focus';
          st.phaseLen = 3000;
          st.rem = 3000;
          st.run = true;
          st.endTs = nextPomoPhaseEnd(phaseEnd, 3000 * 1000);
          st.u = Date.now();
          st.dev = 'extension';

          await schedulePomoAlarms(st);
          await chrome.storage.local.set({ pom_state: st, m_pomLive: st });
          updatePomoBadge(st);
        }
      }
    } catch (e) {
      console.warn('Pomo alarm error:', e);
    }
  }
});

// Keyboard Commands handler
// Always open the hosted website, never the copy of index.html inside the extension: that copy runs on a different
// origin with its own login, and it used to refresh the website's session and sign the website out.
const M2028_APP_URL = 'https://aviatcode.github.io/M2028/';
function openHostedApp() {
  chrome.tabs.query({ url: M2028_APP_URL + '*' }, (tabs) => {
    if (!chrome.runtime.lastError && tabs && tabs.length) {
      chrome.tabs.update(tabs[0].id, { active: true });
      if (chrome.windows && chrome.windows.update) chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: M2028_APP_URL });
    }
  });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open_full_planner') {
    openHostedApp();
  }
});

// Message dispatch listener for popup and dashboard
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'GET_TRACKER_DATA': {
        await checkCurrentTab();
        await flushTime();
        const today = getTodayKey();
        const res = await chrome.storage.local.get([STORAGE_KEY_STATS, STORAGE_KEY_ACTIVE]);
        const stats = res[STORAGE_KEY_STATS] || {};
        const todayData = stats[today] || { totalSeconds: 0, domains: {} };
        const active = res[STORAGE_KEY_ACTIVE] || null;
        if (active && active.domain && todayData.domains && todayData.domains[active.domain]) {
          active.todayTotal = todayData.domains[active.domain].seconds;
        }

        // Calculate 7-day stats
        let weekTotalSeconds = 0;
        const weekDomains = {};
        const past7Days = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const key = `${y}-${m}-${day}`;
          past7Days.push(key);
          const dayObj = stats[key];
          if (dayObj) {
            weekTotalSeconds += dayObj.totalSeconds || 0;
            for (const [dom, data] of Object.entries(dayObj.domains || {})) {
              if (!weekDomains[dom]) {
                weekDomains[dom] = { seconds: 0, title: data.title, favicon: data.favicon, category: data.category };
              }
              weekDomains[dom].seconds += data.seconds;
            }
          }
        }

        sendResponse({
          success: true,
          today: today,
          todayTotal: todayData.totalSeconds,
          todayDomains: todayData.domains,
          active: active,
          weekTotal: weekTotalSeconds,
          weekDomains: weekDomains
        });
        break;
      }

      case 'RESET_TRACKER_DATA': {
        const today = getTodayKey();
        const res = await chrome.storage.local.get([STORAGE_KEY_STATS]);
        const stats = res[STORAGE_KEY_STATS] || {};
        stats[today] = { totalSeconds: 0, domains: {} };
        await chrome.storage.local.set({ [STORAGE_KEY_STATS]: stats });
        sendResponse({ success: true });
        break;
      }

      case 'GET_OPEN_TABS': {
        try {
          const tabs = await chrome.tabs.query({});
          const tabList = tabs.map(t => ({
            id: t.id,
            windowId: t.windowId,
            title: t.title || 'Untitled',
            url: t.url || '',
            favIconUrl: t.favIconUrl || '',
            active: t.active
          }));
          sendResponse({ success: true, tabs: tabList });
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }

      case 'SWITCH_TO_TAB': {
        try {
          if (message.tabId) {
            await chrome.tabs.update(message.tabId, { active: true });
            if (message.windowId) {
              await chrome.windows.update(message.windowId, { focused: true });
            }
          }
          sendResponse({ success: true });
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }

      case 'CLOSE_TAB': {
        try {
          if (message.tabId) {
            await chrome.tabs.remove(message.tabId);
          }
          sendResponse({ success: true });
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }

      case 'START_TIMER': {
        // Starts countdown timer and registers alarm
        const minutes = Number(message.minutes) || 25;
        const seconds = minutes * 60;
        const endTime = Date.now() + seconds * 1000;

        await chrome.alarms.clear('m2028_timer_alarm');
        chrome.alarms.create('m2028_timer_alarm', { when: endTime });

        await chrome.storage.local.set({
          [STORAGE_KEY_TIMER]: {
            running: true,
            totalSeconds: seconds,
            endTime: endTime,
            label: message.label || 'Focus Session'
          }
        });
        sendResponse({ success: true, endTime: endTime });
        break;
      }

      case 'CANCEL_TIMER': {
        await chrome.alarms.clear('m2028_timer_alarm');
        await chrome.storage.local.set({
          [STORAGE_KEY_TIMER]: { running: false, totalSeconds: 0, endTime: 0, label: '' }
        });
        sendResponse({ success: true });
        break;
      }

      case 'GET_TIMER_STATE': {
        const res = await chrome.storage.local.get([STORAGE_KEY_TIMER]);
        sendResponse({ success: true, timer: res[STORAGE_KEY_TIMER] || null });
        break;
      }

      case 'OPEN_FULL_PLANNER': {
        openHostedApp();
        sendResponse({ success: true });
        break;
      }

      case 'START_POMO': {
        const st = message.state;
        if (st && st.run && st.endTs) {
          await schedulePomoAlarms(st);
          updatePomoBadge(st);
        }
        sendResponse({ success: true });
        break;
      }

      case 'PAUSE_POMO':
      case 'CLEAR_POMO': {
        await schedulePomoAlarms(null);
        updatePomoBadge(null);
        sendResponse({ success: true });
        break;
      }

      case 'POMO_STATE_CHANGED': {
        const st = message.state;
        await schedulePomoAlarms(st);
        updatePomoBadge(st && st.run && st.endTs ? st : null);
        sendResponse({ success: true });
        break;
      }

      case 'LOCK_REQUEST': {
        const result = await lockRequest(message);
        await syncBlocking();
        sendResponse(result);
        break;
      }
      case 'SYNC_BLOCKING': {
        // Called right after a list save so the DNR rule exists immediately,
        // instead of waiting for the 30-second tracker heartbeat.
        await enforceLock();
        await syncBlocking();
        sendResponse({ success: true });
        break;
      }
      case 'GET_POMO_STATE': {
        const res = await chrome.storage.local.get(['pom_state', 'm_pomLive']);
        sendResponse({ success: true, state: res.pom_state || res.m_pomLive || null });
        break;
      }

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  })();
  return true; // Keep message channel open for async response
});

// Initial boot check
initTrackingState();
syncBlocking();

// Sync storage changes with background alarms and extension badges
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[STORAGE_KEY_LIMITS] || changes[STORAGE_KEY_BLOCKLIST] || changes[STORAGE_KEY_REDIRECTS] ||
      changes[STORAGE_KEY_LOCK] || changes[STORAGE_KEY_LOCK_MIRROR]) {
    syncBlocking();
  }
  if (changes.pom_state || changes.m_pomLive) {
    const st = (changes.pom_state && changes.pom_state.newValue) ||
               (changes.m_pomLive && changes.m_pomLive.newValue);
    if (st && st.run && st.endTs) {
      schedulePomoAlarms(st);
      updatePomoBadge(st);
    } else {
      schedulePomoAlarms(null);
      updatePomoBadge(null);
    }
  }
});

// Initial Pomodoro badge restore
chrome.storage.local.get(['pom_state', 'm_pomLive'], (res) => {
  const st = res.pom_state || res.m_pomLive;
  if (st && st.run && st.endTs) {
    updatePomoBadge(st);
    schedulePomoAlarms(st);
  }
});
