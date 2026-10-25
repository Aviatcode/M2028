/**
 * M2028 Options Page Controller
 */

'use strict';

const Storage = {
  get: (keys) => {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(keys, resolve);
      } else {
        const res = {};
        keys.forEach(k => {
          try {
            const v = localStorage.getItem('opts_' + k);
            if (v !== null) res[k] = JSON.parse(v);
          } catch(e) {}
        });
        resolve(res);
      }
    });
  },
  set: (items) => {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set(items, resolve);
      } else {
        Object.entries(items).forEach(([k, v]) => {
          try {
            localStorage.setItem('opts_' + k, JSON.stringify(v));
          } catch(e) {}
        });
        resolve();
      }
    });
  }
};

let currentRules = {};
let currentLimits = [];
let currentBlocklist = [];
let currentLock = null;
const LOCK_HOURS = 72;

const MAX_LIMITS = 10;
const MAX_BLOCKLIST = 10;
const BLOCK_CATEGORIES = [
  { key: 'adult', label: '🔞 Adult Content' },
  { key: 'gambling', label: '🎰 Gambling' },
  { key: 'social', label: '📱 Social Media' },
  { key: 'entertainment', label: '🎬 Entertainment / Video' },
  { key: 'communication', label: '💬 Chat & Messaging' }
];
const DEFAULT_LIMIT_REDIRECT = 'https://en.wikipedia.org/wiki/Special:Random';
const DEFAULT_BLOCK_REDIRECT = 'https://theuselessweb.com';

document.addEventListener('DOMContentLoaded', async () => {
  // Sync Theme
  const themeData = await Storage.get(['m_theme', 'theme', 'm_customColors', 'customColors']);
  const activeTheme = themeData.m_theme || themeData.theme || 'dark';
  document.documentElement.setAttribute('data-theme', activeTheme);

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.m_theme || changes.theme) {
        const t = (changes.m_theme && changes.m_theme.newValue) || (changes.theme && changes.theme.newValue);
        if (t) document.documentElement.setAttribute('data-theme', t);
      }
    });
  }

  // Load settings
  const data = await Storage.get(['m2028_opts', 'm2028_custom_rules']);
  const opts = data.m2028_opts || {
    dailyLimitHours: '1',
    targetFocusScore: '80',
    idleTimeout: '60',
    chimeEnabled: true,
    defaultPomoMin: '25'
  };

  currentRules = data.m2028_custom_rules || {
    'leetcode.com': 'productive',
    'coursera.org': 'productive',
    'twitch.tv': 'entertainment',
    'twitter.com': 'social'
  };

  document.getElementById('dailyLimitHours').value = opts.dailyLimitHours || '1';
  document.getElementById('targetFocusScore').value = opts.targetFocusScore || '80';
  document.getElementById('idleTimeout').value = opts.idleTimeout || '60';
  document.getElementById('chimeEnabled').checked = opts.chimeEnabled !== false;
  document.getElementById('defaultPomoMin').value = opts.defaultPomoMin || '25';

  renderRulesTable();

  // Save changes on change
  ['dailyLimitHours', 'targetFocusScore', 'idleTimeout', 'defaultPomoMin'].forEach(id => {
    document.getElementById(id).addEventListener('change', saveOptions);
  });
  document.getElementById('chimeEnabled').addEventListener('change', saveOptions);

  // Add rule button
  document.getElementById('addRuleBtn').addEventListener('click', () => {
    const domainInput = document.getElementById('customDomainInput');
    const catSelect = document.getElementById('customCategorySelect');
    let raw = domainInput.value.trim().toLowerCase();
    if (!raw) return;

    try {
      if (raw.includes('://')) raw = new URL(raw).hostname;
    } catch(e) {}
    if (raw.startsWith('www.')) raw = raw.slice(4);

    currentRules[raw] = catSelect.value;
    domainInput.value = '';
    saveRules();
    renderRulesTable();
  });

  // Export Data
  document.getElementById('exportDataBtn').addEventListener('click', async () => {
    const all = await Storage.get(['m2028_time_stats', 'm2028_opts', 'm2028_custom_rules', 'm2028_scratchpad']);
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `m2028-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Clear Stats
  document.getElementById('clearAllStatsBtn').addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all recorded screen-time history? This cannot be undone.')) {
      await Storage.set({ m2028_time_stats: {} });
      alert('Screen-time history cleared!');
    }
  });

  // Time Limits & Blocking
  await loadBlockingSettings();
  initBlockingUI();
});

async function saveOptions() {
  const opts = {
    dailyLimitHours: document.getElementById('dailyLimitHours').value,
    targetFocusScore: document.getElementById('targetFocusScore').value,
    idleTimeout: document.getElementById('idleTimeout').value,
    chimeEnabled: document.getElementById('chimeEnabled').checked,
    defaultPomoMin: document.getElementById('defaultPomoMin').value
  };
  await Storage.set({ m2028_opts: opts });
}

async function saveRules() {
  await Storage.set({ m2028_custom_rules: currentRules });
}

function renderRulesTable() {
  const tbody = document.getElementById('rulesTableBody');
  const entries = Object.entries(currentRules);

  if (entries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--mt);padding:16px">No custom rules added yet.</td></tr>';
    return;
  }

  tbody.innerHTML = entries.map(([domain, category]) => {
    return `
      <tr>
        <td style="font-weight:600">${escapeHtml(domain)}</td>
        <td style="text-transform:capitalize"><span class="badge" style="color:var(--accent)">${escapeHtml(category)}</span></td>
        <td>
          <button class="hub-btn danger sm" data-del-rule="${escapeHtml(domain)}">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.deleteRule = function(domain) {
  delete currentRules[domain];
  saveRules();
  renderRulesTable();
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================
// Website Time Limits & Blocking
// ============================================================

function normalizeDomainInput(raw) {
  let d = (raw || '').trim().toLowerCase();
  if (!d) return '';
  try {
    if (d.includes('://')) d = new URL(d).hostname;
  } catch (e) {}
  if (d.startsWith('www.')) d = d.slice(4);
  return d;
}

function targetLabel(target) {
  if (target.startsWith('category:')) {
    const key = target.slice('category:'.length);
    const found = BLOCK_CATEGORIES.find(c => c.key === key);
    return found ? found.label : key;
  }
  return target;
}

function populateCategorySelects() {
  [document.getElementById('limitCategorySelect'), document.getElementById('blockCategorySelect')].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = BLOCK_CATEGORIES.map(c => `<option value="category:${c.key}">${c.label}</option>`).join('');
  });
}

function wireTargetTypeToggle(typeSelId, domainInputId, categorySelId) {
  const typeSel = document.getElementById(typeSelId);
  const domainInput = document.getElementById(domainInputId);
  const catSel = document.getElementById(categorySelId);
  typeSel.addEventListener('change', () => {
    const isCategory = typeSel.value === 'category';
    domainInput.style.display = isCategory ? 'none' : '';
    catSel.style.display = isCategory ? '' : 'none';
  });
}

async function loadBlockingSettings() {
  const data = await Storage.get(['m2028_limits', 'm2028_blocklist', 'm2028_redirect_settings', 'm2028_lock']);
  currentLock = data.m2028_lock || null;
  currentLimits = Array.isArray(data.m2028_limits) ? data.m2028_limits : [];
  currentBlocklist = Array.isArray(data.m2028_blocklist) ? data.m2028_blocklist : [];
  const redirects = data.m2028_redirect_settings || {};

  document.getElementById('limitRedirectUrl').value = redirects.limitRedirectUrl || DEFAULT_LIMIT_REDIRECT;
  document.getElementById('blockRedirectUrl').value = redirects.blockRedirectUrl || DEFAULT_BLOCK_REDIRECT;

  populateCategorySelects();
  renderLimitsTable();
  renderBlocklistTable();
  applyLockUi();
}

function lockEntry(kind, target) {
  return currentLock && currentLock.entries ? currentLock.entries[kind + ':' + target] || null : null;
}
function leftText(e) {
  if (!e || !e.req) return '';
  const ms = (e.req.requestedAt || 0) + LOCK_HOURS * 3600000 - Date.now();
  if (ms <= 0) return 'any moment';
  const m = Math.ceil(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return d > 0 ? d + 'd ' + h + 'h' : h + 'h ' + (m % 60) + 'm';
}
function lockCell(kind, target) {
  const e = lockEntry(kind, target);
  const t = escapeHtml(target);
  if (!e) return '<span class="badge">Locking in…</span>';
  if (e.req) {
    const what = e.req.op === 'raise' ? 'Limit rises in ' : 'Removed in ';
    return '<span class="badge" style="color:var(--accent)">' + what + leftText(e) + '</span> ' +
      '<button class="hub-btn sm" data-cancel-req="' + kind + '|' + t + '">Keep it</button>';
  }
  return '<span class="badge" style="color:var(--accent)">🔒 Locked</span> ' +
    '<button class="hub-btn danger sm" data-req-remove="' + kind + '|' + t + '">Request removal</button>';
}

function renderLimitsTable() {
  const tbody = document.getElementById('limitsTableBody');
  document.getElementById('limitCountHint').textContent = `${currentLimits.length} / ${MAX_LIMITS} used`;
  if (!currentLimits.length) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--mt);padding:16px">No time limits set yet.</td></tr>';
    return;
  }
  tbody.innerHTML = currentLimits.map(l => `
    <tr>
      <td style="font-weight:600">${escapeHtml(targetLabel(l.target))}</td>
      <td>${escapeHtml(String(l.minutes))} min/day</td>
      <td>${lockCell('limit', l.target)}</td>
    </tr>
  `).join('');
}

function renderBlocklistTable() {
  const tbody = document.getElementById('blocklistTableBody');
  document.getElementById('blockCountHint').textContent = `${currentBlocklist.length} / ${MAX_BLOCKLIST} used`;
  if (!currentBlocklist.length) {
    tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:var(--mt);padding:16px">Nothing blocked yet.</td></tr>';
    return;
  }
  tbody.innerHTML = currentBlocklist.map(b => `
    <tr>
      <td style="font-weight:600">${escapeHtml(targetLabel(b.target))}</td>
      <td>${lockCell('block', b.target)}</td>
    </tr>
  `).join('');
}

// Redirect pages are locked once anything is locked, so they cannot be pointed somewhere else
function applyLockUi() {
  const locked = !!(currentLock && currentLock.entries && Object.keys(currentLock.entries).length);
  ['limitRedirectUrl', 'blockRedirectUrl'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.disabled = locked; el.title = locked ? 'Locked together with your blocks and limits' : ''; }
  });
  document.querySelectorAll('[data-preset-limit],[data-preset-block]').forEach(b => { b.disabled = locked; });
}

async function saveLimits() { await Storage.set({ m2028_limits: currentLimits }); }
async function saveBlocklist() { await Storage.set({ m2028_blocklist: currentBlocklist }); }

async function saveRedirectSettings() {
  await Storage.set({
    m2028_redirect_settings: {
      limitRedirectUrl: document.getElementById('limitRedirectUrl').value.trim() || DEFAULT_LIMIT_REDIRECT,
      blockRedirectUrl: document.getElementById('blockRedirectUrl').value.trim() || DEFAULT_BLOCK_REDIRECT
    }
  });
}


// Extension pages (MV3) block inline click handlers, so buttons use data attributes + one delegated listener
document.addEventListener('click', function (e) {
  const t = e.target && e.target.closest ? e.target.closest('[data-del-rule],[data-req-remove],[data-cancel-req]') : null;
  if (!t) return;
  if (t.hasAttribute('data-del-rule')) { window.deleteRule(t.getAttribute('data-del-rule')); return; }
  const raw = t.getAttribute('data-req-remove') || t.getAttribute('data-cancel-req');
  const sep = raw.indexOf('|');
  const kind = raw.slice(0, sep), target = raw.slice(sep + 1);
  if (t.hasAttribute('data-cancel-req')) { sendLockRequest({ op: 'cancel', kind, target }); return; }
  if (!confirm('Request removal of "' + targetLabel(target) + '"?\n\nIt stays fully active for ' + LOCK_HOURS + ' hours before it is removed. You can cancel the request any time.')) return;
  const phrase = 'I want to remove this';
  const typed = prompt('Type exactly: ' + phrase);
  if (!typed || typed.trim().toLowerCase() !== phrase.toLowerCase()) { alert('That did not match, so nothing was changed.'); return; }
  sendLockRequest({ op: 'remove', kind, target });
});

function sendLockRequest(req) {
  try {
    chrome.runtime.sendMessage(Object.assign({ type: 'LOCK_REQUEST' }, req), function () {
      void chrome.runtime.lastError;
      loadBlockingSettings();
    });
  } catch (e) {}
}

if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    if (changes.m2028_limits || changes.m2028_blocklist || changes.m2028_lock) loadBlockingSettings();
  });
}

function initBlockingUI() {
  wireTargetTypeToggle('limitTargetType', 'limitDomainInput', 'limitCategorySelect');
  wireTargetTypeToggle('blockTargetType', 'blockDomainInput', 'blockCategorySelect');

  document.getElementById('addLimitBtn').addEventListener('click', () => {
    if (currentLimits.length >= MAX_LIMITS) {
      alert(`You can track up to ${MAX_LIMITS} time limits. Delete one first.`);
      return;
    }
    const type = document.getElementById('limitTargetType').value;
    const minutes = Number(document.getElementById('limitMinutesInput').value);
    if (!minutes || minutes <= 0) { alert('Enter a daily limit in minutes.'); return; }

    let target;
    if (type === 'category') {
      target = document.getElementById('limitCategorySelect').value;
    } else {
      target = normalizeDomainInput(document.getElementById('limitDomainInput').value);
      if (!target) { alert('Enter a website domain.'); return; }
    }
    if (currentLimits.some(l => l.target === target)) { alert('That site or category already has a limit.'); return; }

    if (!confirm('Lock in ' + targetLabel(target) + ' at ' + minutes + ' min per day?\n\nYou will not be able to remove or loosen it for at least ' + LOCK_HOURS + ' hours.')) return;
    currentLimits.push({ target, minutes });
    document.getElementById('limitDomainInput').value = '';
    document.getElementById('limitMinutesInput').value = '';
    saveLimits();
    renderLimitsTable();
  });

  document.getElementById('addBlockBtn').addEventListener('click', () => {
    if (currentBlocklist.length >= MAX_BLOCKLIST) {
      alert(`You can block up to ${MAX_BLOCKLIST} sites or categories. Delete one first.`);
      return;
    }
    const type = document.getElementById('blockTargetType').value;
    let target;
    if (type === 'category') {
      target = document.getElementById('blockCategorySelect').value;
    } else {
      target = normalizeDomainInput(document.getElementById('blockDomainInput').value);
      if (!target) { alert('Enter a website domain.'); return; }
    }
    if (currentBlocklist.some(b => b.target === target)) { alert('Already on the blocklist.'); return; }

    if (!confirm('Block ' + targetLabel(target) + '?\n\nYou will not be able to remove it for at least ' + LOCK_HOURS + ' hours.')) return;
    currentBlocklist.push({ target });
    document.getElementById('blockDomainInput').value = '';
    saveBlocklist();
    renderBlocklistTable();
  });

  document.getElementById('limitRedirectUrl').addEventListener('change', saveRedirectSettings);
  document.getElementById('blockRedirectUrl').addEventListener('change', saveRedirectSettings);

  document.querySelectorAll('[data-preset-limit]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('limitRedirectUrl').value = btn.getAttribute('data-preset-limit');
      saveRedirectSettings();
    });
  });
  document.querySelectorAll('[data-preset-block]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('blockRedirectUrl').value = btn.getAttribute('data-preset-block');
      saveRedirectSettings();
    });
  });
}
