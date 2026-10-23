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
          <button class="hub-btn danger sm" onclick="deleteRule('${escapeHtml(domain)}')">Delete</button>
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
  const data = await Storage.get(['m2028_limits', 'm2028_blocklist', 'm2028_redirect_settings']);
  currentLimits = Array.isArray(data.m2028_limits) ? data.m2028_limits : [];
  currentBlocklist = Array.isArray(data.m2028_blocklist) ? data.m2028_blocklist : [];
  const redirects = data.m2028_redirect_settings || {};

  document.getElementById('limitRedirectUrl').value = redirects.limitRedirectUrl || DEFAULT_LIMIT_REDIRECT;
  document.getElementById('blockRedirectUrl').value = redirects.blockRedirectUrl || DEFAULT_BLOCK_REDIRECT;

  populateCategorySelects();
  renderLimitsTable();
  renderBlocklistTable();
}

function renderLimitsTable() {
  const tbody = document.getElementById('limitsTableBody');
  document.getElementById('limitCountHint').textContent = `${currentLimits.length} / ${MAX_LIMITS} used`;
  if (!currentLimits.length) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--mt);padding:16px">No time limits set yet.</td></tr>';
    return;
  }
  tbody.innerHTML = currentLimits.map((l, i) => `
    <tr>
      <td style="font-weight:600">${escapeHtml(targetLabel(l.target))}</td>
      <td>${escapeHtml(String(l.minutes))} min/day</td>
      <td><button class="hub-btn danger sm" onclick="deleteLimit(${i})">Delete</button></td>
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
  tbody.innerHTML = currentBlocklist.map((b, i) => `
    <tr>
      <td style="font-weight:600">${escapeHtml(targetLabel(b.target))}</td>
      <td><button class="hub-btn danger sm" onclick="deleteBlockEntry(${i})">Delete</button></td>
    </tr>
  `).join('');
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

window.deleteLimit = function(i) {
  currentLimits.splice(i, 1);
  saveLimits();
  renderLimitsTable();
};

window.deleteBlockEntry = function(i) {
  currentBlocklist.splice(i, 1);
  saveBlocklist();
  renderBlocklistTable();
};

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
