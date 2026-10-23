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

let went = false;
function go() {
  if (went) return;
  went = true;
  chrome.storage.local.get(['m2028_redirect_settings'], (res) => {
    const settings = (res && res.m2028_redirect_settings) || {};
    const url = reason === 'limit'
      ? (settings.limitRedirectUrl || DEFAULTS.limit)
      : (settings.blockRedirectUrl || DEFAULTS.block);
    location.replace(url);
  });
}

goBtn.addEventListener('click', (e) => {
  e.preventDefault();
  go();
});

// Auto-redirect as soon as the short progress bar finishes — just enough time to
// register what happened so it doesn't feel like a broken page, but effectively instant.
setTimeout(go, 1150);
