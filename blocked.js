'use strict';

const params = new URLSearchParams(location.search);
const reason = params.get('reason') === 'limit' ? 'limit' : 'block';
const domain = params.get('domain') || 'this site';

const DEFAULTS = {
  block: 'https://theuselessweb.com',
  limit: 'https://en.wikipedia.org/wiki/Special:Random'
};

const emojiEl = document.getElementById('emoji');
const headEl = document.getElementById('headline');
const subEl = document.getElementById('subline');
const goBtn = document.getElementById('goNowBtn');

if (reason === 'limit') {
  emojiEl.textContent = '⏳';
  headEl.textContent = `Today's time on ${domain} is up`;
  subEl.textContent = 'Redirecting you somewhere worth learning from…';
} else {
  emojiEl.textContent = '🚫';
  headEl.textContent = `${domain} is blocked`;
  subEl.textContent = 'Redirecting you somewhere more fun…';
}

// Only http(s) destinations, and never one that is itself the blocked site (that would loop forever)
function safeTarget(raw, fallback) {
  try {
    const u = new URL(String(raw || '').trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return fallback;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const blocked = String(domain || '').toLowerCase().replace(/^www\./, '');
    if (blocked && (host === blocked || host.endsWith('.' + blocked))) return fallback;
    return u.href;
  } catch (e) {
    return fallback;
  }
}

function hostOf(raw) {
  try { return new URL(String(raw || '').trim()).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; }
}
function domainMatches(a, b) { return !!a && !!b && (a === b || a.slice(-(b.length + 1)) === '.' + b); }

let went = false;
function go() {
  if (went) return;
  went = true;
  chrome.storage.local.get(['m2028_redirect_settings', 'm2028_blocklist', 'm2028_redirect_rr'], (res) => {
    const settings = (res && res.m2028_redirect_settings) || {};
    const blocklist = (res && res.m2028_blocklist) || [];
    const fallback = reason === 'limit' ? DEFAULTS.limit : DEFAULTS.block;
    let candidates = reason === 'limit'
      ? (settings.limitRedirectUrls && settings.limitRedirectUrls.length ? settings.limitRedirectUrls : (settings.limitRedirectUrl ? [settings.limitRedirectUrl] : []))
      : (settings.blockRedirectUrls && settings.blockRedirectUrls.length ? settings.blockRedirectUrls : (settings.blockRedirectUrl ? [settings.blockRedirectUrl] : []));
    // Last line of defense: never land on something that's currently blocked, however it got saved.
    candidates = candidates.filter((u) => {
      const h = hostOf(u);
      if (!h) return false;
      return !blocklist.some((b) => b.target && b.target.indexOf('category:') !== 0 && (domainMatches(h, b.target) || domainMatches(b.target, h)));
    });
    if (!candidates.length) { location.replace(safeTarget(null, fallback)); return; }
    const rrKey = reason === 'limit' ? 'limit' : 'block';
    const rr = (res && res.m2028_redirect_rr) || {};
    const idx = (Number(rr[rrKey]) || 0) % candidates.length;
    chrome.storage.local.set({ m2028_redirect_rr: Object.assign({}, rr, { [rrKey]: idx + 1 }) });
    location.replace(safeTarget(candidates[idx], fallback));
  });
}

goBtn.addEventListener('click', (e) => {
  e.preventDefault();
  go();
});

// Auto-redirect as soon as the short progress bar finishes — just enough time to
// register what happened so it doesn't feel like a broken page, but effectively instant.
setTimeout(go, 1150);
