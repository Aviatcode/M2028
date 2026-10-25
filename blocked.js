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

let went = false;
function go() {
  if (went) return;
  went = true;
  chrome.storage.local.get(['m2028_redirect_settings'], (res) => {
    const settings = (res && res.m2028_redirect_settings) || {};
    const fallback = reason === 'limit' ? DEFAULTS.limit : DEFAULTS.block;
    const wanted = reason === 'limit' ? settings.limitRedirectUrl : settings.blockRedirectUrl;
    location.replace(safeTarget(wanted, fallback));
  });
}

goBtn.addEventListener('click', (e) => {
  e.preventDefault();
  go();
});

// Auto-redirect as soon as the short progress bar finishes — just enough time to
// register what happened so it doesn't feel like a broken page, but effectively instant.
setTimeout(go, 1150);
