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
