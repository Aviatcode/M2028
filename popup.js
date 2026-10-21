/**
 * M2028 Chrome Extension Hub — Synchronized Controller
 * Fully synced with M2028 Web App Data Models, Themes & Real-Time Storage
 */

(function () {
  'use strict';

  // --- Storage Helper Bridge (Syncs chrome.storage.local & localStorage) ---
  const S = {
    get: function (key, defVal, callback) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['m_' + key, key], function (res) {
          let val = res['m_' + key] !== undefined ? res['m_' + key] : res[key];
          if (val === undefined) {
            try {
              const local = localStorage.getItem('m_' + key);
              val = local ? JSON.parse(local) : defVal;
            } catch (e) {
              val = defVal;
            }
          }
          callback(val !== undefined ? val : defVal);
        });
      } else {
        try {
          const local = localStorage.getItem('m_' + key);
          callback(local ? JSON.parse(local) : defVal);
        } catch (e) {
          callback(defVal);
        }
      }
    },
    set: function (key, val) {
      try {
        localStorage.setItem('m_' + key, JSON.stringify(val));
      } catch (e) {}
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const obj = {};
        obj['m_' + key] = val;
        obj[key] = val;
        chrome.storage.local.set(obj);
      }
      if (typeof pushCloudData === 'function') {
        pushCloudData(key, val);
      }
    }
  };

  function getTodayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return h + 'h ' + (m < 10 ? '0' : '') + m + 'm';
    return m + 'm';
  }

  function playAlertChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const start = ctx.currentTime + idx * 0.12;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.9);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 1.0);
      });
    } catch (e) {}
  }

  // =====================================================================
  // 1. Theme Engine: Dark, Light, Girl Mode (Pink) & Account Custom Palette
  // =====================================================================
  const THEME_NEXT = { dark: 'light', light: 'pink', pink: 'dark' };
  const THEME_ICON = { dark: '🌙', light: '☀️', pink: '🌸' };

  function applyCustomColors(colors, theme) {
    const existing = document.getElementById('m2028-custom-theme-style');
    if (existing) existing.remove();

    if (!colors || !(colors.bg || colors.tx || colors.ac)) {
      return;
    }

    const P = hex => {
      hex = (hex || '').replace('#', '');
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      const n = parseInt(hex, 16);
      return isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, 255 & n];
    };
    const M = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
    const R = a => 'rgb(' + a.join(',') + ')';
    const A = (a, k) => 'rgba(' + a.join(',') + ',' + k + ')';
    const L = a => {
      const f = v => (v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      return 0.2126 * f(a[0]) + 0.7152 * f(a[1]) + 0.0722 * f(a[2]);
    };

    const s = P(colors.bg || (theme === 'light' ? '#faf4f2' : theme === 'pink' ? '#ffb7ce' : '#0a0000'));
    const d = P(colors.tx || (theme === 'light' ? '#2b0b09' : theme === 'pink' ? '#4a1230' : '#fff1ee'));
    const dk = L(s) < 0.25;
    const s1 = dk ? M(s, d, 0.06) : M(s, [255, 255, 255], 0.7);
    const s2 = dk ? M(s, d, 0.09) : M(s, d, 0.04);
    const s3 = dk ? M(s, d, 0.15) : M(s, d, 0.11);
    const ac = P(colors.ac || (theme === 'pink' ? '#ff6eb4' : theme === 'light' ? '#fd2a1f' : '#c42018'));
    const pillTx = L(ac) > 0.4 ? '#0b0f1a' : '#ffffff';

    // Boosted vibrant accent for category breakdown productive bar
    const segProd = dk ? (L(ac) < 0.25 ? M(ac, [255, 255, 255], 0.35) : ac) : (L(ac) > 0.65 ? M(ac, [0, 0, 0], 0.3) : ac);

    let css = `
      :root {
        --bg: ${R(s)} !important;
        --s1: ${R(s1)} !important;
        --s2: ${R(s2)} !important;
        --s3: ${R(s3)} !important;
        --tx: ${R(d)} !important;
        --m2: ${R(M(d, s, 0.28))} !important;
        --mt: ${R(M(d, s, 0.5))} !important;
        --b: ${A(d, 0.12)} !important;
        --b2: ${A(d, 0.24)} !important;
        --ai: ${R(ac)} !important;
        --a2: ${A(ac, 0.18)} !important;
        --dn: ${R(ac)} !important;
        --card-bg: ${dk ? `linear-gradient(135deg, ${A(ac, 0.24)} 0%, ${R(s1)} 38%, ${R(s)} 100%)` : '#ffffff'} !important;
        --card-bd: ${A(ac, 0.35)} !important;
        --card-sh: 0 14px 44px rgba(0,0,0,0.65), 0 0 32px ${A(ac, 0.2)} !important;
        --pill-bg: ${R(ac)} !important;
        --pill-tx: ${pillTx} !important;
        --seg-prod: ${R(segProd)} !important;
      }
      body { background: ${R(s)} !important; color: ${R(d)} !important; }
      .tb { background: ${A(s, 0.95)} !important; border-bottom: none !important; }
      .tnb { background: ${A(s, 0.95)} !important; border-bottom: 1px solid ${A(d, 0.12)} !important; }
      .tnb-track {
        background: ${dk ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)'} !important;
        border: 1px solid ${A(ac, 0.25)} !important;
      }
      body::before {
        background-image:
          radial-gradient(55% 45% at 10% 8%, ${A(ac, dk ? 0.24 : 0.16)}, transparent 70%),
          radial-gradient(50% 45% at 90% 92%, ${A(ac, dk ? 0.18 : 0.12)}, transparent 70%),
          linear-gradient(180deg, ${A(s, 0.7)} 0%, ${R(s)} 100%) !important;
      }
      .btn.b-ai {
        background: ${R(ac)} !important;
        color: ${pillTx} !important;
        box-shadow: 0 4px 14px ${A(ac, 0.28)} !important;
      }
      .nb.on {
        background: ${A(ac, 0.16)} !important;
        color: ${R(ac)} !important;
        border: 1px solid ${A(ac, 0.45)} !important;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35), 0 0 10px ${A(ac, 0.25)} !important;
        font-weight: 650 !important;
      }
      .range-btn.active, .time-sub-btn.active, .pomo-chip.on {
        background: ${R(ac)} !important;
        color: ${pillTx} !important;
        border-color: ${R(ac)} !important;
      }
      .pomo-btn.primary, #pomoStartBtn:not(.is-run) {
        background: ${R(ac)} !important;
        color: ${pillTx} !important;
        box-shadow: 0 4px 16px ${A(ac, 0.3)} !important;
      }
      .pf, #habProgressFill, #taskProgressFill, .cd-bar-fill {
        background: ${R(ac)} !important;
      }
      .hc.ck, .rck.on {
        background: ${R(ac)} !important;
        border-color: ${R(ac)} !important;
        color: ${pillTx} !important;
      }
      #pomoProgressCircle {
        stroke: ${R(ac)} !important;
      }
      .cat-seg.seg-prod {
        background: ${R(segProd)} !important;
      }
      .dot-prod {
        background: ${R(segProd)} !important;
        box-shadow: 0 0 6px ${R(segProd)} !important;
      }
      .site-bar-fill.seg-prod {
        background: ${R(segProd)} !important;
      }
    `;

    const st = document.createElement('style');
    st.id = 'm2028-custom-theme-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function paintTheme(themeName) {
    const validTheme = THEME_NEXT[themeName] ? themeName : 'dark';
    document.documentElement.setAttribute('data-theme', validTheme);
    document.body.classList.remove('light', 'pink');
    
    if (validTheme === 'light') {
      document.documentElement.className = 'ucolors ucac redx';
      document.body.classList.add('light');
    } else if (validTheme === 'pink') {
      document.documentElement.className = 'm-ready';
      document.body.classList.add('pink');
    } else {
      document.documentElement.className = 'ucolors ucac redx m-ready';
    }

    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      if (validTheme === 'light') {
        themeBtn.title = 'Current: Light (Click for Girl Mode)';
        themeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.5"/><path d="M12 9.5c-2-3-1-5.5 0-6.5 1 1 2 3.5 0 6.5zM14.5 12c3-2 5.5-1 6.5 0-1 1-3.5 2-6.5 0zM12 14.5c2 3 1 5.5 0 6.5-1-1-2-3.5 0-6.5zM9.5 12c-3 2-5.5 1-6.5 0 1-1 3.5-2 6.5 0z"/></svg>';
      } else if (validTheme === 'pink') {
        themeBtn.title = 'Current: Girl Mode (Click for Dark Mode)';
        themeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
      } else {
        themeBtn.title = 'Current: Dark (Click for Light Mode)';
        themeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg>';
      }
    }

    // Check account holder's custom palette
    S.get('customColors', null, function (custom) {
      if (typeof custom === 'string') {
        try { custom = JSON.parse(custom); } catch (e) { custom = null; }
      }
      if (!custom) {
        applyCustomColors(null, validTheme);
        return;
      }
      let cfg = null;
      if (custom.bg || custom.tx || custom.ac) {
        if (!custom.t || custom.t === validTheme) cfg = custom;
      } else if (custom[validTheme]) {
        cfg = custom[validTheme];
      }
      applyCustomColors(cfg, validTheme);
    });

    if (activeTabName === 'habits') renderHabits();
    if (activeTabName === 'tasks') renderTasks();
    if (activeTabName === 'time') loadTrackerData();
    if (typeof updatePomoDisplay === 'function') {
      try { updatePomoDisplay(); } catch (_) {}
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = THEME_NEXT[current] || 'light';
    S.set('theme', next);
    paintTheme(next);
  }

  function initTheme() {
    S.get('theme', 'dark', function (t) {
      paintTheme(t);
    });
  }

  // =====================================================================
  // 2. Navigation Tabs
  // =====================================================================
  let activeTabName = 'time';

  function initNav() {
    document.querySelectorAll('.tnb .nb').forEach(btn => {
      btn.addEventListener('click', function () {
        switchTab(this.getAttribute('data-tab'));
      });
    });

    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    const openPlannerBtn = document.getElementById('openPlannerBtn');
    const openHubInsideBtn = document.getElementById('openHubInsideBtn');
    const extLogoBtn = document.getElementById('extLogoBtn');
    function openFullApp() {
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
      } else {
        window.open('index.html', '_blank');
      }
    }
    if (openPlannerBtn) openPlannerBtn.addEventListener('click', openFullApp);
    if (openHubInsideBtn) openHubInsideBtn.addEventListener('click', openFullApp);
    if (extLogoBtn) extLogoBtn.addEventListener('click', openFullApp);

    try {
      const p = new URLSearchParams(window.location.search);
      const t = p.get('tab') || window.location.hash.replace('#', '');
      if (t) switchTab(t);
    } catch (e) {}
  }

  function switchTab(tab) {
    activeTabName = tab;
    document.querySelectorAll('.tnb .nb').forEach(b => {
      const match = b.getAttribute('data-tab') === tab;
      b.classList.toggle('on', match);
      b.setAttribute('aria-selected', match ? 'true' : 'false');
    });

    document.querySelectorAll('.main-content .vw').forEach(view => {
      view.classList.toggle('on', view.id === 'tab-' + tab);
    });

    if (tab === 'time') loadTrackerData();
    else if (tab === 'habits') renderHabits();
    else if (tab === 'tasks') renderTasks();
    else if (tab === 'pomo') syncPomoFromStorage();
    else if (tab === 'countdown') renderCountdowns();
    else if (tab === 'notes') initNotes();
    else if (tab === 'search') loadOpenTabs();
  }

  // =====================================================================
  // 3. Time Tracker & Active Tab Controller (Restored Rich Mode)
  // =====================================================================
  let trackerRange = 'today'; // 'today' or 'week'
  let trackerTimer = null;

  function formatDuration(totalSec) {
    if (!totalSec || totalSec < 1) return '0m';
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  function sendBgMessage(msg, callback) {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(msg, function (res) {
        if (chrome.runtime.lastError || !res) {
          callback(getMockTrackerData());
        } else {
          callback(res);
        }
      });
    } else {
      callback(getMockTrackerData());
    }
  }

  function getMockTrackerData() {
    const today = getTodayKey();
    return {
      success: true,
      today: today,
      todayTotal: 8640,
      todayDomains: {
        'github.com': { seconds: 4320, title: 'M2028 - Master Planner', favicon: 'https://github.githubassets.com/favicons/favicon.svg', category: 'productive' },
        'youtube.com': { seconds: 2160, title: 'Lofi Girl - Relaxing Beats', favicon: 'https://www.youtube.com/s/desktop/99cbfa75/img/favicon.ico', category: 'entertainment' },
        'localhost:8080': { seconds: 1440, title: 'M2028 Web Dashboard', favicon: 'favicon-32.png', category: 'productive' },
        'reddit.com': { seconds: 720, title: 'Reddit: Dive into anything', favicon: 'https://www.redditstatic.com/shreddit/assets/favicon/192x192.png', category: 'social' }
      },
      active: {
        domain: 'localhost:8080',
        category: 'productive',
        favicon: 'favicon-32.png',
        todayTotal: 1440
      },
      weekTotal: 46800,
      weekDomains: {
        'github.com': { seconds: 21000, category: 'productive' },
        'youtube.com': { seconds: 12000, category: 'entertainment' },
        'localhost:8080': { seconds: 8000, category: 'productive' },
        'reddit.com': { seconds: 5800, category: 'social' }
      }
    };
  }

  let cachedDomainsData = {};
  let currentActiveTabDomain = '';

  function initTimeTracker() {
    const rangeTodayBtn = document.getElementById('rangeTodayBtn');
    const rangeWeekBtn = document.getElementById('rangeWeekBtn');
    const resetBtn = document.getElementById('resetTrackerBtn');
    const subTopBtn = document.getElementById('subTabTopSites');
    const subTabsBtn = document.getElementById('subTabOpenTabs');
    const topListEl = document.getElementById('topSitesList');
    const openListEl = document.getElementById('openTabsTimeList');

    if (rangeTodayBtn) {
      rangeTodayBtn.addEventListener('click', function () {
        trackerRange = 'today';
        rangeTodayBtn.classList.add('active');
        if (rangeWeekBtn) rangeWeekBtn.classList.remove('active');
        loadTrackerData();
      });
    }

    if (rangeWeekBtn) {
      rangeWeekBtn.addEventListener('click', function () {
        trackerRange = 'week';
        rangeWeekBtn.classList.add('active');
        if (rangeTodayBtn) rangeTodayBtn.classList.remove('active');
        loadTrackerData();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        if (confirm("Reset today's tracking data?")) {
          sendBgMessage({ type: 'RESET_TRACKER_DATA' }, function () {
            loadTrackerData();
          });
        }
      });
    }

    if (subTopBtn && subTabsBtn) {
      subTopBtn.addEventListener('click', function () {
        subTopBtn.classList.add('active');
        subTabsBtn.classList.remove('active');
        if (topListEl) topListEl.style.display = 'flex';
        if (openListEl) openListEl.style.display = 'none';
      });

      subTabsBtn.addEventListener('click', function () {
        subTabsBtn.classList.add('active');
        subTopBtn.classList.remove('active');
        if (topListEl) topListEl.style.display = 'none';
        if (openListEl) openListEl.style.display = 'flex';
        loadOpenTabsTimeBreakdown();
      });
    }

    loadTrackerData();
    // Live update every 2 seconds while viewing Time tab
    clearInterval(trackerTimer);
    trackerTimer = setInterval(function () {
      if (activeTabName === 'time') loadTrackerData();
    }, 2000);
  }

  function getDomainFromUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      if (['http:', 'https:'].includes(u.protocol)) {
        let h = u.hostname.toLowerCase();
        if (h.startsWith('www.')) h = h.slice(4);
        return h;
      }
      if (u.protocol === 'chrome:') return 'chrome://' + u.hostname;
      if (u.protocol === 'file:') return 'local-file';
      return '';
    } catch (e) {
      return '';
    }
  }

  function loadTrackerData() {
    sendBgMessage({ type: 'GET_TRACKER_DATA' }, function (resp) {
      if (!resp || !resp.success) return;

      const isToday = trackerRange === 'today';
      const totalSec = isToday ? resp.todayTotal : resp.weekTotal;
      const domains = isToday ? resp.todayDomains : resp.weekDomains;
      cachedDomainsData = domains || {};
      const active = resp.active;

      // 1. Live Active Site Banner
      const activeDomainEl = document.getElementById('activeSiteDomain');
      const activeFaviconEl = document.getElementById('activeSiteFavicon');
      const activeBadgeEl = document.getElementById('activeSiteCategory');
      const activeTimeEl = document.getElementById('activeSiteTime');

      if (active && active.domain) {
        currentActiveTabDomain = active.domain;
        if (activeDomainEl) {
          activeDomainEl.textContent = active.title ? `${active.domain} — ${active.title}` : active.domain;
          activeDomainEl.title = active.title || active.domain;
        }
        if (activeBadgeEl) {
          activeBadgeEl.textContent = active.category || 'productive';
          activeBadgeEl.className = `active-site-badge badge-${active.category || 'other'}`;
        }
        if (activeFaviconEl) {
          if (active.favicon) {
            activeFaviconEl.innerHTML = `<img src="${escapeHtml(active.favicon)}" onerror="this.onerror=null;this.parentNode.innerHTML='🌐';">`;
          } else {
            activeFaviconEl.textContent = '🌐';
          }
        }
        if (activeTimeEl) {
          const domSec = (domains && domains[active.domain]) ? domains[active.domain].seconds : (active.todayTotal || 0);
          activeTimeEl.textContent = `${formatDuration(domSec)} today`;
        }
      } else {
        currentActiveTabDomain = '';
        if (activeDomainEl) activeDomainEl.textContent = 'No active webpage';
        if (activeBadgeEl) {
          activeBadgeEl.textContent = 'Idle';
          activeBadgeEl.className = 'active-site-badge badge-other';
        }
        if (activeFaviconEl) activeFaviconEl.textContent = '⏸️';
        if (activeTimeEl) activeTimeEl.textContent = 'Browser idle';
      }

      // 2. Metrics Cards
      const screenTimeEl = document.getElementById('todayScreenTime');
      const siteCountEl = document.getElementById('todaySiteCount');
      const prodScoreEl = document.getElementById('prodScore');
      const prodBreakdownEl = document.getElementById('prodBreakdown');

      if (screenTimeEl) screenTimeEl.textContent = formatDuration(totalSec);

      const domainEntries = Object.entries(domains || {});
      if (siteCountEl) siteCountEl.textContent = `${domainEntries.length} ${isToday ? 'visited' : 'in 7d'}`;

      let prodSec = 0, commSec = 0, socSec = 0, entSec = 0, othSec = 0;
      domainEntries.forEach(([_, item]) => {
        const s = item.seconds || 0;
        const cat = item.category || 'other';
        if (cat === 'productive') prodSec += s;
        else if (cat === 'communication') commSec += s;
        else if (cat === 'social') socSec += s;
        else if (cat === 'entertainment') entSec += s;
        else othSec += s;
      });

      const validTotal = Math.max(totalSec, 1);
      const prodScore = Math.round((prodSec / validTotal) * 100);
      if (prodScoreEl) prodScoreEl.textContent = `${prodScore}%`;

      if (prodBreakdownEl) {
        if (prodScore >= 75) prodBreakdownEl.textContent = 'High focus';
        else if (prodScore >= 50) prodBreakdownEl.textContent = 'Moderate focus';
        else prodBreakdownEl.textContent = 'Distractions detected';
      }

      // 3. Category Bar Distribution
      const pPct = ((prodSec / validTotal) * 100).toFixed(1);
      const cPct = ((commSec / validTotal) * 100).toFixed(1);
      const sPct = ((socSec / validTotal) * 100).toFixed(1);
      const ePct = ((entSec / validTotal) * 100).toFixed(1);
      const oPct = ((othSec / validTotal) * 100).toFixed(1);

      const bar = document.getElementById('catProgressBar');
      if (bar && bar.children.length >= 5) {
        bar.children[0].style.width = pPct + '%';
        bar.children[0].title = `Work/Study: ${pPct}% (${formatDuration(prodSec)})`;
        bar.children[1].style.width = cPct + '%';
        bar.children[1].title = `Communication: ${cPct}% (${formatDuration(commSec)})`;
        bar.children[2].style.width = sPct + '%';
        bar.children[2].title = `Social: ${sPct}% (${formatDuration(socSec)})`;
        bar.children[3].style.width = ePct + '%';
        bar.children[3].title = `Entertainment/Media: ${ePct}% (${formatDuration(entSec)})`;
        bar.children[4].style.width = oPct + '%';
        bar.children[4].title = `Other: ${oPct}% (${formatDuration(othSec)})`;
      }

      // 4. Sites List with Relative Progress Bars & Favicons
      const listEl = document.getElementById('topSitesList');
      if (listEl) {
        if (domainEntries.length === 0) {
          listEl.innerHTML = '<div class="empty-state">No browsing time recorded yet. Start surfing and your stats will appear!</div>';
        } else {
          domainEntries.sort((a, b) => b[1].seconds - a[1].seconds);
          const maxSec = domainEntries[0][1].seconds || 1;
          const topList = domainEntries.slice(0, 10);
          const catPrefixMap = {
            productive: 'prod',
            communication: 'comm',
            social: 'soc',
            entertainment: 'ent',
            other: 'oth'
          };

          listEl.innerHTML = topList.map(([dom, data]) => {
            const pct = Math.round((data.seconds / maxSec) * 100);
            const cat = data.category || 'other';
            const catPrefix = catPrefixMap[cat] || 'oth';
            const fav = data.favicon || `https://www.google.com/s2/favicons?domain=${dom}&sz=32`;

            return `
              <div class="site-row">
                <img class="site-favicon" src="${escapeHtml(fav)}" onerror="this.onerror=null;this.style.display='none';">
                <div class="site-info">
                  <div class="site-name-wrap">
                    <span class="site-name" title="${escapeHtml(data.title || dom)}">${escapeHtml(dom)}</span>
                    <span class="site-time">${formatDuration(data.seconds)}</span>
                  </div>
                  <div class="site-bar-track">
                    <div class="site-bar-fill seg-${catPrefix}" style="width: ${pct}%"></div>
                  </div>
                </div>
              </div>
            `;
          }).join('');
        }
      }

      // 5. Update Open Tabs List with Live Time Breakdown
      loadOpenTabsTimeBreakdown();
    });
  }

  function loadOpenTabsTimeBreakdown() {
    const listEl = document.getElementById('openTabsTimeList');
    const countEl = document.getElementById('openTabsCount');
    if (!listEl) return;

    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({}, function (tabs) {
        if (!tabs || tabs.length === 0) {
          listEl.innerHTML = '<div class="empty-state">No open tabs detected.</div>';
          if (countEl) countEl.textContent = '0';
          return;
        }
        if (countEl) countEl.textContent = tabs.length;
        renderOpenTabsTimeRows(tabs, listEl);
      });
    } else {
      // Mock open tabs for web preview
      const mockTabs = [
        { id: 1, windowId: 1, title: 'M2028 Web Workspace & Hub', url: 'http://localhost:8080/index.html', favIconUrl: 'favicon-32.png', active: true },
        { id: 2, windowId: 1, title: 'GitHub - Aviatcode/M2028: Master Productivity', url: 'https://github.com/Aviatcode/M2028', favIconUrl: 'https://github.githubassets.com/favicons/favicon.svg', active: false },
        { id: 3, windowId: 1, title: 'YouTube - Lofi Hip Hop Beats to Relax/Study to', url: 'https://youtube.com', favIconUrl: 'https://www.youtube.com/s/desktop/99cbfa75/img/favicon.ico', active: false },
        { id: 4, windowId: 1, title: 'Reddit: The front page of the internet', url: 'https://reddit.com', favIconUrl: 'https://www.redditstatic.com/shreddit/assets/favicon/192x192.png', active: false }
      ];
      if (countEl) countEl.textContent = mockTabs.length;
      renderOpenTabsTimeRows(mockTabs, listEl);
    }
  }

  function renderOpenTabsTimeRows(tabs, container) {
    container.innerHTML = tabs.map(tab => {
      const dom = getDomainFromUrl(tab.url);
      const timeData = cachedDomainsData[dom];
      const timeStr = timeData && timeData.seconds ? formatDuration(timeData.seconds) + ' today' : 'New tab';
      const fav = tab.favIconUrl || (dom ? `https://www.google.com/s2/favicons?domain=${dom}&sz=32` : 'favicon-32.png');
      const isActive = !!tab.active || (currentActiveTabDomain && dom === currentActiveTabDomain);

      return `
        <div class="tab-row ${isActive ? 'is-active' : ''}" data-tabid="${tab.id}" data-winid="${tab.windowId}">
          <img class="tab-row-favicon" src="${escapeHtml(fav)}" onerror="this.onerror=null;this.src='favicon-32.png';">
          <div class="tab-row-info">
            <div class="tab-row-title" title="${escapeHtml(tab.title || tab.url)}">${escapeHtml(tab.title || tab.url || 'Untitled Tab')}</div>
            <div class="tab-row-meta">
              <span>${escapeHtml(dom || 'local')}</span>
              <span>•</span>
              <span class="tab-row-time">${timeStr}</span>
              ${isActive ? '<span class="tag t-ai sm" style="font-size:9px;padding:1px 5px">Active</span>' : ''}
            </div>
          </div>
          <button class="tab-row-action">Switch ➔</button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.tab-row').forEach(row => {
      row.addEventListener('click', function () {
        const tid = parseInt(this.getAttribute('data-tabid'), 10);
        const wid = parseInt(this.getAttribute('data-winid'), 10);
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.update) {
          chrome.tabs.update(tid, { active: true });
          if (chrome.windows && chrome.windows.update) {
            chrome.windows.update(wid, { focused: true });
          }
        }
      });
    });
  }

  // =====================================================================
  // 4. Daily Habits Controller (M2028 Core with Authentic Streak)
  // =====================================================================
  const DEF_HABS = [
    { id: 'hindu', label: '📰 Read The Hindu', days: 'daily' },
    { id: 'ai', label: '🤖 AI/Python — 1 Pomodoro', days: 'daily' },
    { id: 'ncert', label: '📚 NCERT — 1 Pomodoro', days: 'daily' },
    { id: 'rev', label: '🔄 Revise yesterday notes', days: 'daily' },
    { id: 'workout', label: '💪 Workout', days: 'mwf' },
    { id: 'film', label: '🎬 Max 1 film', days: 'sat' }
  ];

  function getScheduledHabits(allHabits) {
    const dow = new Date().getDay();
    return allHabits.filter(h => {
      if (!h.days || h.days === 'daily') return true;
      if (h.days === 'mwf') return dow === 1 || dow === 3 || dow === 5;
      if (h.days === 'sat') return dow === 6;
      return true;
    });
  }

  function calcM2028Streak(hdMap) {
    let count = 0;
    let n = new Date();
    n.setHours(0, 0, 0, 0);
    const todayK = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
    const todayData = hdMap[todayK] || {};
    // If no habit checked today yet, start checking from yesterday so streak doesn't drop to 0 mid-day
    if (!(Object.values(todayData).filter(Boolean).length > 0)) {
      n = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1);
    }
    for (; count < 36000; ) {
      const k = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
      const dayObj = hdMap[k] || {};
      if (!(Object.values(dayObj).filter(v => v === true).length > 0)) break;
      count++;
      n = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1);
    }
    return count;
  }

  function calcHabitItemStreak(hid, hdMap) {
    let count = 0;
    let n = new Date();
    n.setHours(0, 0, 0, 0);
    const todayK = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
    if (!hdMap[todayK] || !hdMap[todayK][hid]) {
      n = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1);
    }
    for (; count < 365; ) {
      const k = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
      if (!hdMap[k] || !hdMap[k][hid]) break;
      count++;
      n = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1);
    }
    return count;
  }

  function deleteHabit(hid) {
    S.get('habs', DEF_HABS, function (allHabits) {
      const updated = allHabits.filter(h => h.id !== hid);
      S.set('habs', updated);
      renderHabits();
    });
  }

  function renderHabits() {
    S.get('habs', DEF_HABS, function (allHabits) {
      S.get('hd', {}, function (hdMap) {
        const today = getTodayKey();
        const todayDone = hdMap[today] || {};
        const scheduled = getScheduledHabits(allHabits);

        const dateSubtitle = document.getElementById('habDateSubtitle');
        if (dateSubtitle) {
          const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const now = new Date();
          dateSubtitle.textContent = days[now.getDay()] + ', ' + now.getDate() + ' ' + months[now.getMonth()];
        }

        let doneCount = 0;
        scheduled.forEach(h => {
          if (todayDone[h.id]) doneCount++;
        });

        const totalCount = scheduled.length;
        const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

        const doneEl = document.getElementById('habDoneCount');
        const totEl = document.getElementById('habTotalCount');
        const pctEl = document.getElementById('habPercentText');
        const fillEl = document.getElementById('habProgressFill');
        if (doneEl) doneEl.textContent = doneCount;
        if (totEl) totEl.textContent = totalCount;
        if (pctEl) pctEl.textContent = pct + '%';
        if (fillEl) fillEl.style.width = pct + '%';

        // Update streak badge in top header
        const streak = calcM2028Streak(hdMap);
        const streakEl = document.getElementById('streakCount');
        if (streakEl) streakEl.textContent = streak + 'd';

        const listEl = document.getElementById('habListContainer');
        if (listEl) {
          const isPink = document.body.classList.contains('pink');
          listEl.innerHTML = scheduled.map(h => {
            const isDone = !!todayDone[h.id];
            const r = calcHabitItemStreak(h.id, hdMap);
            return `
              <div class="hr ${isDone ? 'ck' : ''}" data-hid="${h.id}">
                <button class="hc ${isDone ? 'ck' : ''}" data-hid="${h.id}" title="Toggle Done">
                  ${isDone ? '✓' : ''}
                </button>
                <div class="hr-label">
                  <span class="hr-text">${escapeHtml(h.label)}</span>
                </div>
                ${r > 0 ? `<span class="hr-streak"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-1px;margin-right:2px"><path d="M12 3c.5 3-2.5 4.5-2.5 8a2.5 2.5 0 0 0 5 0c0-1-.4-1.8-1-2.5 3 1 5 3.5 5 6.5a6.5 6.5 0 0 1-13 0c0-4 3-6 6.5-12z"/></svg>${r}</span>` : ''}
                <button class="ract del-hab" data-delhid="${h.id}" title="Delete Habit">✕</button>
              </div>
            `;
          }).join('');

          procEmojiNodes(listEl);

          listEl.querySelectorAll('.hc').forEach(btn => {
            btn.addEventListener('click', function (e) {
              e.stopPropagation();
              toggleHabit(this.getAttribute('data-hid'));
            });
          });

          listEl.querySelectorAll('.del-hab').forEach(btn => {
            btn.addEventListener('click', function (e) {
              e.stopPropagation();
              deleteHabit(this.getAttribute('data-delhid'));
            });
          });
        }
      });
    });
  }

  function toggleHabit(hid) {
    S.get('hd', {}, function (hdMap) {
      const today = getTodayKey();
      if (!hdMap[today]) hdMap[today] = {};
      hdMap[today][hid] = !hdMap[today][hid];
      S.set('hd', hdMap);
      renderHabits();
    });
  }

  const habMarkAllBtn = document.getElementById('habMarkAllBtn');
  if (habMarkAllBtn) {
    habMarkAllBtn.addEventListener('click', function () {
      S.get('habs', DEF_HABS, function (allHabits) {
        S.get('hd', {}, function (hdMap) {
          const today = getTodayKey();
          if (!hdMap[today]) hdMap[today] = {};
          getScheduledHabits(allHabits).forEach(h => {
            hdMap[today][h.id] = true;
          });
          S.set('hd', hdMap);
          renderHabits();
        });
      });
    });
  }

  const habAddBtn = document.getElementById('habAddBtn');
  const habAddForm = document.getElementById('habAddForm');
  const newHabInput = document.getElementById('newHabInput');
  const saveNewHabBtn = document.getElementById('saveNewHabBtn');
  const cancelNewHabBtn = document.getElementById('cancelNewHabBtn');

  if (habAddBtn && habAddForm) {
    habAddBtn.addEventListener('click', function () {
      habAddForm.style.display = habAddForm.style.display === 'none' ? 'block' : 'none';
      if (newHabInput) newHabInput.focus();
    });
  }

  if (cancelNewHabBtn && habAddForm) {
    cancelNewHabBtn.addEventListener('click', function () {
      habAddForm.style.display = 'none';
      if (newHabInput) newHabInput.value = '';
    });
  }

  if (saveNewHabBtn && newHabInput) {
    saveNewHabBtn.addEventListener('click', function () {
      const label = newHabInput.value.trim();
      if (!label) return;
      S.get('habs', DEF_HABS, function (allHabits) {
        allHabits.push({ id: 'hab_' + Date.now(), label: label, days: 'daily' });
        S.set('habs', allHabits);
        newHabInput.value = '';
        if (habAddForm) habAddForm.style.display = 'none';
        renderHabits();
      });
    });
  }

  // =====================================================================
  // 5. Tasks & Checklist Controller (M2028 Core with Due Chips)
  // =====================================================================
  function renderTasks() {
    S.get('tasks', [
      { id: '1', text: 'Daily Planning & Calendar Review', done: true, created: new Date().toISOString() },
      { id: '2', text: 'Deep Work: 2x Pomodoro sessions', done: false, created: new Date().toISOString() },
      { id: '3', text: 'Review lecture notes & flashcards', done: false, created: new Date().toISOString() }
    ], function (tasks) {
      const today = getTodayKey();
      const pending = tasks.filter(t => !t.done);
      const completed = tasks.filter(t => t.done);
      const isPink = document.body.classList.contains('pink');

      const countEl = document.getElementById('tskCount');
      if (countEl) countEl.textContent = pending.length + ' to do';

      const listEl = document.getElementById('tskList');
      if (listEl) {
        if (pending.length === 0) {
          listEl.innerHTML = '<div class="empty-msg">All tasks done! Add a new item above.</div>';
        } else {
          listEl.innerHTML = pending.map(t => {
            let dueChip = '';
            if (t.date) {
              const cls = t.date < today ? 'chip bad' : t.date === today ? 'chip warn' : 'chip set';
              dueChip = `<span class="${cls}">${t.date}</span>`;
            }
            return `
              <div class="row" data-tid="${t.id}">
                <button class="rck" data-tid="${t.id}" title="Mark done"></button>
                <input type="text" class="rtext" data-tid="${t.id}" value="${escapeHtml(t.text)}">
                ${dueChip}
                <button class="ract del" data-tid="${t.id}" title="Delete task">✕</button>
              </div>
            `;
          }).join('');
          procEmojiNodes(listEl);
        }

        listEl.querySelectorAll('.rck').forEach(btn => {
          btn.addEventListener('click', function () {
            toggleTask(this.getAttribute('data-tid'));
          });
        });
        listEl.querySelectorAll('.ract.del').forEach(btn => {
          btn.addEventListener('click', function () {
            deleteTask(this.getAttribute('data-tid'));
          });
        });
        listEl.querySelectorAll('.rtext').forEach(inp => {
          inp.addEventListener('change', function () {
            updateTaskText(this.getAttribute('data-tid'), this.value);
          });
        });
      }

      const doneTog = document.getElementById('taskDoneToggle');
      const doneLabel = document.getElementById('taskDoneLabel');
      const doneList = document.getElementById('tskDoneList');
      if (doneTog && doneLabel && doneList) {
        if (completed.length > 0) {
          doneTog.style.display = 'flex';
          doneLabel.textContent = 'Completed (' + completed.length + ')';
          doneList.innerHTML = completed.map(t => `
            <div class="row is-done" data-tid="${t.id}">
              <button class="rck on" data-tid="${t.id}" title="Mark undone">✓</button>
              <span class="rtext">${escapeHtml(t.text)}</span>
              <button class="ract del" data-tid="${t.id}" title="Delete task">✕</button>
            </div>
          `).join('');
          procEmojiNodes(doneList);

          doneList.querySelectorAll('.rck').forEach(btn => {
            btn.addEventListener('click', function () {
              toggleTask(this.getAttribute('data-tid'));
            });
          });
          doneList.querySelectorAll('.ract.del').forEach(btn => {
            btn.addEventListener('click', function () {
              deleteTask(this.getAttribute('data-tid'));
            });
          });
        } else {
          doneTog.style.display = 'none';
          doneList.style.display = 'none';
        }
      }
    });
  }

  function toggleTask(id) {
    S.get('tasks', [], function (tasks) {
      const item = tasks.find(t => t.id === id);
      if (item) {
        item.done = !item.done;
        S.set('tasks', tasks);
        renderTasks();
      }
    });
  }

  function deleteTask(id) {
    S.get('tasks', [], function (tasks) {
      const filtered = tasks.filter(t => t.id !== id);
      S.set('tasks', filtered);
      renderTasks();
    });
  }

  function updateTaskText(id, newText) {
    S.get('tasks', [], function (tasks) {
      const item = tasks.find(t => t.id === id);
      if (item) {
        item.text = newText;
        S.set('tasks', tasks);
      }
    });
  }

  const tskInp = document.getElementById('tskInp');
  const tskAddBtn = document.getElementById('tskAddBtn');
  function submitNewTask() {
    if (!tskInp) return;
    const txt = tskInp.value.trim();
    if (!txt) return;
    S.get('tasks', [], function (tasks) {
      tasks.unshift({
        id: Date.now().toString(),
        text: txt,
        done: false,
        created: new Date().toISOString()
      });
      S.set('tasks', tasks);
      tskInp.value = '';
      renderTasks();
    });
  }

  if (tskAddBtn) tskAddBtn.addEventListener('click', submitNewTask);
  if (tskInp) {
    tskInp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitNewTask();
    });
  }

  const taskDoneToggle = document.getElementById('taskDoneToggle');
  if (taskDoneToggle) {
    taskDoneToggle.addEventListener('click', function () {
      const doneList = document.getElementById('tskDoneList');
      if (doneList) {
        const isOpen = doneList.style.display !== 'none';
        doneList.style.display = isOpen ? 'none' : 'flex';
        taskDoneToggle.classList.toggle('open', !isOpen);
      }
    });
  }

  // =====================================================================
  // 6. Pomodoro Timer Controller (Persistent Shared M2028 State)
  // =====================================================================
  let pomoInterval = null;

  function getPomoSavedState() {
    try {
      const raw = localStorage.getItem('pom_state') ||
                  localStorage.getItem('m_pomLive') ||
                  localStorage.getItem('m_pom_state');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      run: false,
      mode: 'focus',
      rem: 3000,
      phaseLen: 3000,
      tot: 2,
      cur: 0,
      sub: 'DA/PY',
      u: Date.now(),
      dev: 'extension'
    };
  }

  function savePomoState(st) {
    st.u = Date.now();
    st.dev = 'extension';
    try {
      localStorage.setItem('pom_state', JSON.stringify(st));
      localStorage.setItem('m_pomLive', JSON.stringify(st));
      localStorage.setItem('m_pom_state', JSON.stringify(st));
    } catch (e) {}
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        pom_state: st,
        m_pomLive: st,
        m_pom_state: st
      });
      chrome.runtime.sendMessage({
        type: st.run ? 'START_POMO' : 'PAUSE_POMO',
        state: st
      }).catch(() => {});
    }
    if (typeof pushCloudData === 'function') {
      pushCloudData('pomLive', st);
    }
  }

  function syncPomoFromStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['pom_state', 'm_pomLive'], function (res) {
        const extSt = res.pom_state || res.m_pomLive;
        if (extSt) {
          try {
            localStorage.setItem('pom_state', JSON.stringify(extSt));
            localStorage.setItem('m_pomLive', JSON.stringify(extSt));
          } catch (e) {}
        }
        applyPomoSync(extSt || getPomoSavedState());
      });
    } else {
      applyPomoSync(getPomoSavedState());
    }
  }

  function applyPomoSync(st) {
    clearInterval(pomoInterval);
    if (st.run && st.endTs) {
      const now = Date.now();
      st.rem = Math.max(0, Math.round((st.endTs - now) / 1000));
      if (st.rem === 0) {
        handlePomoCompletion(st);
        return;
      }
      pomoInterval = setInterval(pomoTick, 1000);
    }
    updatePomoDisplay(st);
  }

  function togglePomo() {
    const st = getPomoSavedState();
    if (!st.run) {
      st.run = true;
      st.endTs = Date.now() + st.rem * 1000;
      savePomoState(st);
      clearInterval(pomoInterval);
      pomoInterval = setInterval(pomoTick, 1000);
      updatePomoDisplay(st);
    } else {
      st.run = false;
      st.rem = Math.max(0, Math.round((st.endTs - Date.now()) / 1000));
      st.endTs = null;
      savePomoState(st);
      clearInterval(pomoInterval);
      updatePomoDisplay(st);
    }
  }

  function pomoTick() {
    const st = getPomoSavedState();
    if (!st.run || !st.endTs) {
      clearInterval(pomoInterval);
      return;
    }
    st.rem = Math.max(0, Math.round((st.endTs - Date.now()) / 1000));
    if (st.rem <= 0) {
      clearInterval(pomoInterval);
      handlePomoCompletion(st);
    } else {
      updatePomoDisplay(st);
    }
  }

  function logPomoSessionLocal(sub, dur) {
    const d = getTodayKey();
    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    S.get('pomSessions', [], function (sessions) {
      if (!Array.isArray(sessions)) sessions = [];
      sessions.push({
        d: d,
        sub: sub || 'General',
        dur: dur || 3000,
        t: timeStr
      });
      S.set('pomSessions', sessions);
    });
    S.get('pd', {}, function (pd) {
      if (!pd || typeof pd !== 'object') pd = {};
      pd[d] = (pd[d] || 0) + 1;
      S.set('pd', pd);
      const todayEl = document.getElementById('pomoToday');
      if (todayEl) todayEl.textContent = pd[d] || 0;
    });
  }

  function handlePomoCompletion(st) {
    playAlertChime();
    const tot = st.tot || 4;

    if (st.mode === 'focus') {
      st.cur = (st.cur || 0) + 1;
      logPomoSessionLocal(st.sub || 'General', st.phaseLen || 3000);

      const isLong = st.cur % tot === 0;
      const breakLen = isLong ? 1800 : (st.phaseLen === 1500 ? 300 : 600);

      st.mode = 'break';
      st.phaseLen = breakLen;
      st.rem = breakLen;
      st.run = true;
      st.endTs = Date.now() + breakLen * 1000;

      showChromeNotification(
        isLong ? `🏆 All ${tot} Sessions Complete!` : '✅ Focus Session Done!',
        isLong ? 'Take a 30-min long break.' : `Take a ${breakLen / 60}-min break. Step away and refresh.`
      );
      savePomoState(st);
      clearInterval(pomoInterval);
      pomoInterval = setInterval(pomoTick, 1000);
      updatePomoDisplay(st);
    } else {
      // Break over
      if (st.cur >= tot) {
        showChromeNotification('🎉 All sessions complete!', 'Great work today! Starting a fresh focus cycle.');
        st.run = false;
        st.mode = 'focus';
        st.cur = 0;
        st.phaseLen = 3000;
        st.rem = 3000;
        st.endTs = null;
        savePomoState(st);
        clearInterval(pomoInterval);
        updatePomoDisplay(st);
      } else {
        showChromeNotification('☕ Break Over!', `Starting focus session ${st.cur + 1} of ${tot}. Let's focus!`);
        st.mode = 'focus';
        st.phaseLen = 3000;
        st.rem = 3000;
        st.run = true;
        st.endTs = Date.now() + 3000 * 1000;
        savePomoState(st);
        clearInterval(pomoInterval);
        pomoInterval = setInterval(pomoTick, 1000);
        updatePomoDisplay(st);
      }
    }
  }

  // Default subjects matching M2028 authentic subjects
  const DEFAULT_POM_SUBJECTS = ['DA/PY', 'AI/Python', 'Polity', 'History', 'Economics', 'Geography', 'General', 'Other'];
  let _pomSubjects = [...DEFAULT_POM_SUBJECTS];

  function resetPomo() {
    clearInterval(pomoInterval);
    const activeChip = document.querySelector('.pomo-presets .pomo-chip.on');
    const fMin = activeChip ? parseInt(activeChip.getAttribute('data-focus'), 10) : 50;
    const durSec = fMin * 60;
    const prev = getPomoSavedState();
    const st = {
      run: false,
      mode: 'focus',
      endTs: null,
      rem: durSec,
      phaseLen: durSec,
      tot: prev.tot || 2,
      cur: 0,
      sub: prev.sub || 'DA/PY',
      u: Date.now(),
      dev: 'extension'
    };
    savePomoState(st);
    updatePomoDisplay(st);
  }

  function updatePomoDisplay(st) {
    if (!st) st = getPomoSavedState();
    if (st.run && st.endTs) {
      st.rem = Math.max(0, Math.round((st.endTs - Date.now()) / 1000));
    }
    const min = Math.floor(st.rem / 60);
    const sec = st.rem % 60;

    const mEl = document.getElementById('pomoM');
    const sEl = document.getElementById('pomoS');
    const sessEl = document.getElementById('pomoSess');
    const totEl = document.getElementById('pomoTot');
    const subEl = document.getElementById('pomoSub');
    const badgeEl = document.getElementById('pomoModeBadge');
    const startBtn = document.getElementById('pomoStartBtn');
    const startTxt = document.getElementById('pomoStartText');
    const startIco = document.getElementById('pomoStartIcon');
    const ring = document.getElementById('pomoRing');

    if (mEl) mEl.textContent = String(min).padStart(2, '0');
    if (sEl) sEl.textContent = ':' + String(sec).padStart(2, '0');
    if (sessEl) sessEl.textContent = Math.min((st.cur || 0) + 1, st.tot || 2);
    if (totEl) totEl.textContent = st.tot || 2;
    if (subEl) subEl.textContent = st.sub || 'DA/PY';

    if (badgeEl) {
      badgeEl.textContent = st.mode === 'focus' ? 'FOCUS SESSION' : 'BREAK TIME';
      badgeEl.setAttribute('data-mode', st.mode === 'focus' ? 'focus' : 'break');
    }

    if (startBtn) {
      startBtn.classList.toggle('is-run', !!st.run);
    }
    if (startTxt) startTxt.textContent = st.run ? 'Pause' : 'Start Focus';
    if (startIco) {
      startIco.innerHTML = st.run
        ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="display:inline-block;vertical-align:-1px"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`
        : `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="display:inline-block;vertical-align:-1px"><path d="M8 5v14l11-7z"/></svg>`;
    }

    // Highlight matching preset chip
    const curFocusMin = Math.round((st.phaseLen || 3000) / 60);
    document.querySelectorAll('.pomo-presets .pomo-chip').forEach(c => {
      const chipMin = parseInt(c.getAttribute('data-focus'), 10);
      c.classList.toggle('on', chipMin === curFocusMin);
    });

    // Circular Conic Ring with 2 separate clock modes: Dark/Light and Girl Mode
    if (ring && st.phaseLen > 0) {
      const elapsed = Math.max(0, st.phaseLen - st.rem);
      const pct = Math.min(100, Math.max(0, (elapsed / st.phaseLen) * 100));
      ring.style.setProperty('--pomo-pct', pct.toFixed(1) + '%');

      const isPink = document.body.classList.contains('pink');
      const isLight = document.body.classList.contains('light');

      if (isPink) {
        // Girl Mode Clock
        const col = st.mode === 'focus' ? '#ff6eb4' : '#ff9de0';
        ring.style.background = `conic-gradient(${col} ${pct}%, rgba(255, 110, 180, 0.16) 0%)`;
      } else if (isLight) {
        // Light Mode Clock
        const col = st.mode === 'focus' ? 'var(--ai, #0b9a63)' : 'var(--bd, #e8965a)';
        ring.style.background = `conic-gradient(${col} ${pct}%, rgba(0, 0, 0, 0.08) 0%)`;
      } else {
        // Dark Mode Clock
        const col = st.mode === 'focus' ? 'var(--ai, #8b5cf6)' : 'var(--bd, #e8965a)';
        ring.style.background = `conic-gradient(${col} ${pct}%, rgba(255, 255, 255, 0.08) 0%)`;
      }
    }

    // Refresh Today count
    S.get('pd', {}, function (pd) {
      const todayEl = document.getElementById('pomoToday');
      if (todayEl) {
        const d = getTodayKey();
        todayEl.textContent = (pd && pd[d]) || 0;
      }
    });

    // Disable step buttons while running
    const downBtn = document.getElementById('pomoStepDown');
    const upBtn = document.getElementById('pomoStepUp');
    const disabled = st.run || (st.cur && st.cur > 0);
    if (downBtn) {
      downBtn.disabled = !!disabled;
      downBtn.style.opacity = disabled ? '0.35' : '1';
    }
    if (upBtn) {
      upBtn.disabled = !!disabled;
      upBtn.style.opacity = disabled ? '0.35' : '1';
    }
  }

  // --- Subject Selection Modal Logic ---
  function renderPomSubList() {
    const listEl = document.getElementById('pomSubModalList');
    if (!listEl) return;
    listEl.innerHTML = '';
    const st = getPomoSavedState();
    const cur = st.sub || 'DA/PY';

    _pomSubjects.forEach(s => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pomo-sub-chip' + (s === cur ? ' selected' : '');
      chip.textContent = (s === cur ? '✓ ' : '') + s;
      chip.addEventListener('click', function () {
        selectPomSubject(s);
      });
      listEl.appendChild(chip);
    });
  }

  function openPomSubModal() {
    const m = document.getElementById('pomSubModal');
    if (m) {
      renderPomSubList();
      m.classList.add('op');
      m.style.display = 'flex';
      const inp = document.getElementById('pomNewSubInput');
      if (inp) {
        inp.value = '';
        setTimeout(() => inp.focus(), 60);
      }
    }
  }

  function closePomSubModal() {
    const m = document.getElementById('pomSubModal');
    if (m) {
      m.classList.remove('op');
      m.style.display = 'none';
    }
  }

  function selectPomSubject(subName) {
    const st = getPomoSavedState();
    st.sub = subName;
    st.u = Date.now();
    st.dev = 'extension';
    savePomoState(st);
    updatePomoDisplay(st);
    closePomSubModal();

    // Broadcast update so any open web tabs instantly update
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({}, function (tabs) {
        if (!tabs) return;
        tabs.forEach(t => {
          if (t.id) {
            chrome.tabs.sendMessage(t.id, {
              type: 'POMO_STATE_CHANGED',
              state: st,
              origin: 'extension_subject_picker'
            }).catch(() => {});
          }
        });
      });
    }
  }

  function addCustomSubject() {
    const inp = document.getElementById('pomNewSubInput');
    if (!inp) return;
    const name = inp.value.trim();
    if (!name) return;
    if (!_pomSubjects.includes(name)) {
      _pomSubjects.push(name);
      S.set('pomSubjects', _pomSubjects);
    }
    inp.value = '';
    selectPomSubject(name);
  }

  // --- Wallpaper Synchronization Logic ---
  function applyWallpaperSync(wp, dim) {
    const existing = document.getElementById('m2028-ext-wallpaper-style');
    if (existing) existing.remove();

    const root = document.documentElement;
    const body = document.body;

    if (wp && typeof wp === 'string' && wp.trim().length > 0) {
      root.classList.add('haswp');
      body.classList.add('haswp');
      const d = parseFloat(dim);
      root.style.setProperty('--wpdim', isNaN(d) ? '0.3' : String(d));

      const style = document.createElement('style');
      style.id = 'm2028-ext-wallpaper-style';
      style.textContent = `
        html.haswp body::before {
          background-image: url("${wp}") !important;
        }
      `;
      document.head.appendChild(style);
    } else {
      root.classList.remove('haswp');
      body.classList.remove('haswp');
      root.style.removeProperty('--wpdim');
    }
  }

  function initWallpaperSync() {
    S.get('wallpaper', null, function (wp) {
      S.get('wpDim', 0.3, function (dim) {
        if (!wp) {
          try {
            wp = localStorage.getItem('m_wallpaper') || localStorage.getItem('wallpaper');
            dim = localStorage.getItem('m_wpDim') || localStorage.getItem('wpDim') || 0.3;
          } catch (e) {}
        }
        applyWallpaperSync(wp, dim);
      });
    });

    // Also scan open M2028 tabs for active wallpaper
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({}, function (tabs) {
        if (!tabs || !tabs.length) return;
        const appTab = tabs.find(t => t.url && (t.url.includes('localhost') || t.url.includes('127.0.0.1') || t.url.includes('m2028') || t.url.includes('index.html')));
        if (appTab && appTab.id && chrome.scripting && chrome.scripting.executeScript) {
          chrome.scripting.executeScript({
            target: { tabId: appTab.id },
            func: () => {
              return {
                wallpaper: localStorage.getItem('m_wallpaper') || localStorage.getItem('wallpaper'),
                wpDim: localStorage.getItem('m_wpDim') || localStorage.getItem('wpDim'),
                pomSubjects: localStorage.getItem('m_pomSubjects') || localStorage.getItem('pomSubjects'),
                pom_state: localStorage.getItem('pom_state') || localStorage.getItem('m_pomLive')
              };
            }
          }).then(results => {
            if (results && results[0] && results[0].result) {
              const res = results[0].result;
              if (res.wallpaper) {
                applyWallpaperSync(res.wallpaper, res.wpDim || 0.3);
                S.set('wallpaper', res.wallpaper);
                S.set('wpDim', res.wpDim || 0.3);
              }
              if (res.pomSubjects) {
                try {
                  const subs = JSON.parse(res.pomSubjects);
                  if (Array.isArray(subs)) {
                    _pomSubjects = subs.map(s => typeof s === 'string' ? s : (s.n || s.name || s.id));
                    if (!_pomSubjects.includes('DA/PY')) _pomSubjects.unshift('DA/PY');
                    S.set('pomSubjects', _pomSubjects);
                  }
                } catch (e) {}
              }
              if (res.pom_state) {
                try {
                  const st = JSON.parse(res.pom_state);
                  if (st && st.u && (!getPomoSavedState().u || st.u > getPomoSavedState().u)) {
                    savePomoState(st);
                    updatePomoDisplay(st);
                  }
                } catch (e) {}
              }
            }
          }).catch(() => {});
        }
      });
    }
  }

  function initPomo() {
    // Load subjects
    S.get('pomSubjects', null, function (subs) {
      if (Array.isArray(subs) && subs.length) {
        _pomSubjects = subs.map(s => typeof s === 'string' ? s : (s.n || s.name || s.id));
      }
      if (!_pomSubjects.includes('DA/PY')) _pomSubjects.unshift('DA/PY');
    });

    document.querySelectorAll('.pomo-presets .pomo-chip').forEach(chip => {
      chip.addEventListener('click', function () {
        document.querySelectorAll('.pomo-presets .pomo-chip').forEach(c => c.classList.remove('on'));
        this.classList.add('on');
        const fMin = parseInt(this.getAttribute('data-focus'), 10) || 50;
        const st = getPomoSavedState();
        st.run = false;
        st.endTs = null;
        st.mode = 'focus';
        st.phaseLen = fMin * 60;
        st.rem = fMin * 60;
        savePomoState(st);
        clearInterval(pomoInterval);
        updatePomoDisplay(st);
      });
    });

    const startBtn = document.getElementById('pomoStartBtn');
    if (startBtn) startBtn.addEventListener('click', togglePomo);

    const resetBtn = document.getElementById('pomoResetBtn');
    if (resetBtn) resetBtn.addEventListener('click', resetPomo);

    const stepDown = document.getElementById('pomoStepDown');
    if (stepDown) {
      stepDown.addEventListener('click', function () {
        const st = getPomoSavedState();
        if (st.run || st.cur > 0) return;
        st.tot = Math.max(1, (st.tot || 2) - 1);
        savePomoState(st);
        updatePomoDisplay(st);
      });
    }

    const stepUp = document.getElementById('pomoStepUp');
    if (stepUp) {
      stepUp.addEventListener('click', function () {
        const st = getPomoSavedState();
        if (st.run || st.cur > 0) return;
        st.tot = Math.min(12, (st.tot || 2) + 1);
        savePomoState(st);
        updatePomoDisplay(st);
      });
    }

    // Subject button & modal handlers
    const subBtn = document.getElementById('pomoSubBtn');
    if (subBtn) subBtn.addEventListener('click', openPomSubModal);

    const subCloseBtn = document.getElementById('pomSubModalCloseBtn');
    if (subCloseBtn) subCloseBtn.addEventListener('click', closePomSubModal);

    const subModal = document.getElementById('pomSubModal');
    if (subModal) {
      subModal.addEventListener('click', function (e) {
        if (e.target === subModal) closePomSubModal();
      });
    }

    const addSubBtn = document.getElementById('pomAddSubBtn');
    if (addSubBtn) addSubBtn.addEventListener('click', addCustomSubject);

    const newSubInp = document.getElementById('pomNewSubInput');
    if (newSubInp) {
      newSubInp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          addCustomSubject();
        } else if (e.key === 'Escape') {
          closePomSubModal();
        }
      });
    }

    // Storage change listener: when web app or background changes pom_state, sync popup immediately
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') return;
        if (changes.pom_state || changes.m_pomLive) {
          syncPomoFromStorage();
        }
        if (changes.m_pd || changes.pd) {
          const pd = (changes.m_pd && changes.m_pd.newValue) || (changes.pd && changes.pd.newValue) || {};
          const todayEl = document.getElementById('pomoToday');
          if (todayEl) todayEl.textContent = pd[getTodayKey()] || 0;
        }
        if (changes.m_pomSubjects || changes.pomSubjects) {
          const subs = (changes.m_pomSubjects && changes.m_pomSubjects.newValue) || (changes.pomSubjects && changes.pomSubjects.newValue);
          if (Array.isArray(subs)) {
            _pomSubjects = subs.map(s => typeof s === 'string' ? s : (s.n || s.name || s.id));
            if (!_pomSubjects.includes('DA/PY')) _pomSubjects.unshift('DA/PY');
            renderPomSubList();
          }
        }
        if (changes.m_wallpaper || changes.wallpaper || changes.m_wpDim || changes.wpDim) {
          initWallpaperSync();
        }
      });
    }

    window.addEventListener('storage', function (e) {
      if (e.key === 'pom_state' || e.key === 'm_pomLive') {
        syncPomoFromStorage();
      } else if (e.key === 'm_pomSubjects' || e.key === 'pomSubjects') {
        try {
          const subs = JSON.parse(e.newValue);
          if (Array.isArray(subs)) {
            _pomSubjects = subs.map(s => typeof s === 'string' ? s : (s.n || s.name || s.id));
            if (!_pomSubjects.includes('DA/PY')) _pomSubjects.unshift('DA/PY');
            renderPomSubList();
          }
        } catch (_) {}
      } else if (e.key === 'm_wallpaper' || e.key === 'wallpaper' || e.key === 'm_wpDim' || e.key === 'wpDim') {
        initWallpaperSync();
      }
    });

    syncPomoFromStorage();
  }

  function showChromeNotification(title, message) {
    if (typeof chrome !== 'undefined' && chrome.notifications && chrome.notifications.create) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon-192.png',
        title: title,
        message: message,
        priority: 2
      });
    }
  }

  // =====================================================================
  // 7. Countdown Controller (Live Ticker)
  // =====================================================================
  let cdInterval = null;

  function renderCountdowns() {
    S.get('customWidgets', [
      { id: 'cw_prelims', type: 'countdown', title: 'Target Milestone 2028', date: '2028-05-28' },
      { id: 'cw_exam', type: 'countdown', title: 'End-Term & Project Review', date: '2026-12-15' }
    ], function (widgets) {
      const cds = widgets.filter(w => w.type === 'countdown');
      const listEl = document.getElementById('countdownListContainer');
      if (!listEl) return;

      if (cds.length === 0) {
        listEl.innerHTML = '<div class="empty-msg">No target countdowns yet. Click "+ Countdown" to create one!</div>';
        return;
      }

      function updateCdCards() {
        const now = Date.now();
        listEl.innerHTML = cds.map(c => {
          const target = new Date(c.date + 'T00:00:00').getTime();
          const diff = target - now;
          const isPast = diff <= 0;

          const totalSec = Math.max(0, Math.floor(diff / 1000));
          const days = Math.floor(totalSec / 86400);
          const hours = Math.floor((totalSec % 86400) / 3600);
          const mins = Math.floor((totalSec % 3600) / 60);
          const secs = totalSec % 60;

          return `
            <div class="cd-card" data-cdid="${c.id}">
              <div class="cd-top-row">
                <span class="cd-title">${escapeHtml(c.title)}</span>
                <button class="ract del" data-cdid="${c.id}" title="Remove countdown">×</button>
              </div>
              <div class="cd-days-row">
                <span class="cd-big-days">${isPast ? '0' : days}d</span>
                <span class="cd-time-label">${isPast ? 'Goal Reached' : `${hours}h ${mins}m ${secs}s left`}</span>
              </div>
              <div class="cd-footer-row">
                <span>Target: ${c.date}</span>
                <span class="tag t-ai">${isPast ? 'Completed' : 'T-' + days}</span>
              </div>
            </div>
          `;
        }).join('');
        procEmojiNodes(listEl);

        listEl.querySelectorAll('.ract.del').forEach(btn => {
          btn.addEventListener('click', function () {
            deleteCountdown(this.getAttribute('data-cdid'));
          });
        });
      }

      updateCdCards();
      clearInterval(cdInterval);
      cdInterval = setInterval(updateCdCards, 1000);
    });
  }

  function deleteCountdown(id) {
    S.get('customWidgets', [], function (widgets) {
      const filtered = widgets.filter(w => w.id !== id);
      S.set('customWidgets', filtered);
      renderCountdowns();
    });
  }

  const cdAddToggleBtn = document.getElementById('cdAddToggleBtn');
  const cdAddForm = document.getElementById('cdAddForm');
  const cdTitleInput = document.getElementById('cdTitleInput');
  const cdDateInput = document.getElementById('cdDateInput');
  const saveCountdownBtn = document.getElementById('saveCountdownBtn');
  const cancelCountdownBtn = document.getElementById('cancelCountdownBtn');

  if (cdAddToggleBtn && cdAddForm) {
    cdAddToggleBtn.addEventListener('click', function () {
      cdAddForm.style.display = cdAddForm.style.display === 'none' ? 'block' : 'none';
      if (cdTitleInput) cdTitleInput.focus();
    });
  }

  if (cancelCountdownBtn && cdAddForm) {
    cancelCountdownBtn.addEventListener('click', function () {
      cdAddForm.style.display = 'none';
      if (cdTitleInput) cdTitleInput.value = '';
      if (cdDateInput) cdDateInput.value = '';
    });
  }

  if (saveCountdownBtn) {
    saveCountdownBtn.addEventListener('click', function () {
      const title = (cdTitleInput ? cdTitleInput.value : '').trim();
      const date = cdDateInput ? cdDateInput.value : '';
      if (!title || !date) {
        alert('Please enter both a title and target date.');
        return;
      }
      S.get('customWidgets', [], function (widgets) {
        widgets.push({
          id: 'cw_' + Date.now(),
          type: 'countdown',
          title: title,
          date: date
        });
        S.set('customWidgets', widgets);
        if (cdTitleInput) cdTitleInput.value = '';
        if (cdDateInput) cdDateInput.value = '';
        if (cdAddForm) cdAddForm.style.display = 'none';
        renderCountdowns();
      });
    });
  }

  // =====================================================================
  // 8. Notes Scratchpad Controller
  // =====================================================================
  let isNotesPreview = false;

  function initNotes() {
    const area = document.getElementById('notesInput');
    const preview = document.getElementById('notesPreview');
    const copyBtn = document.getElementById('notesCopyBtn');
    const modeBtn = document.getElementById('notesModeBtn');

    if (!area) return;

    S.get('hubNotes', '# Deep Work Goals\n\n- [x] Launch Chrome Extension\n- [x] Screen Time Tracker\n- [ ] 2x 25min Pomodoro sessions\n\n*Synced in real-time!*', function (val) {
      area.value = val;
      updateNotesStats(val);
    });

    area.oninput = function () {
      const val = area.value;
      S.set('hubNotes', val);
      updateNotesStats(val);
    };

    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        navigator.clipboard.writeText(area.value).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => copyBtn.textContent = 'Copy', 1500);
        });
      });
    }

    if (modeBtn && preview) {
      modeBtn.addEventListener('click', function () {
        isNotesPreview = !isNotesPreview;
        if (isNotesPreview) {
          preview.innerHTML = renderMarkdown(area.value);
          preview.style.display = 'block';
          area.style.display = 'none';
          modeBtn.textContent = 'Edit';
        } else {
          preview.style.display = 'none';
          area.style.display = 'block';
          modeBtn.textContent = 'Preview';
          area.focus();
        }
      });
    }
  }

  function updateNotesStats(txt) {
    const stats = document.getElementById('notesStats');
    if (!stats) return;
    const words = txt.trim() ? txt.trim().split(/\s+/).length : 0;
    stats.textContent = words + ' words · ' + txt.length + ' chars';
  }

  function renderMarkdown(md) {
    if (!md) return '<p style="color:var(--mt)">Empty note.</p>';
    let html = escapeHtml(md);
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    html = html.replace(/^\- \[x\] (.*$)/gim, '<div style="color:var(--ai)">✓ $1</div>');
    html = html.replace(/^\- \[ \] (.*$)/gim, '<div style="color:var(--m2)">☐ $1</div>');
    html = html.replace(/^\- (.*$)/gim, '<li>$1</li>');
    html = html.replace(/\*\*(.*?)\*\*/gim, '<b>$1</b>');
    html = html.replace(/\*(.*?)\*/gim, '<i>$1</i>');
    html = html.replace(/\n/gim, '<br>');
    return html;
  }

  // =====================================================================
  // 9. Quick Search & Open Tabs Controller
  // =====================================================================
  let allLoadedOpenTabs = [];

  function initQuickSearch() {
    const inp = document.getElementById('quickSearchInput');
    const refreshBtn = document.getElementById('refreshTabsBtn');

    if (refreshBtn) refreshBtn.addEventListener('click', loadOpenTabs);

    document.querySelectorAll('.engine-chips-row .engine-pill').forEach(btn => {
      btn.addEventListener('click', function () {
        const p = this.getAttribute('data-prefix');
        if (inp) {
          inp.value = p + ' ';
          inp.focus();
          filterOpenTabs(inp.value);
        }
      });
    });

    if (inp) {
      inp.addEventListener('input', function () {
        filterOpenTabs(this.value);
      });

      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          executeSearch(this.value);
        }
      });
    }

    loadOpenTabs();
  }

  function loadOpenTabs() {
    const listEl = document.getElementById('searchResultsList');
    if (!listEl) return;

    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({}, function (tabs) {
        allLoadedOpenTabs = tabs || [];
        const inp = document.getElementById('quickSearchInput');
        filterOpenTabs(inp ? inp.value : '');
      });
    } else {
      allLoadedOpenTabs = [
        { id: 1, windowId: 1, title: 'M2028 Web Workspace & Hub', url: 'http://localhost:8080/index.html', favIconUrl: 'favicon-32.png', active: true },
        { id: 2, windowId: 1, title: 'GitHub - Aviatcode/M2028: Master Productivity', url: 'https://github.com/Aviatcode/M2028', favIconUrl: 'https://github.githubassets.com/favicons/favicon.svg', active: false },
        { id: 3, windowId: 1, title: 'YouTube - Lofi Hip Hop Beats to Relax/Study to', url: 'https://youtube.com', favIconUrl: 'https://www.youtube.com/s/desktop/99cbfa75/img/favicon.ico', active: false },
        { id: 4, windowId: 1, title: 'Reddit: The front page of the internet', url: 'https://reddit.com', favIconUrl: 'https://www.redditstatic.com/shreddit/assets/favicon/192x192.png', active: false }
      ];
      const inp = document.getElementById('quickSearchInput');
      filterOpenTabs(inp ? inp.value : '');
    }
  }

  function filterOpenTabs(rawQuery) {
    const listEl = document.getElementById('searchResultsList');
    if (!listEl) return;

    const q = (rawQuery || '').trim().toLowerCase();

    // Search engine prefix detection
    const match = q.match(/^(g|yt|gh|w|r|ddg)\s+(.*)/i);
    if (match) {
      const eng = match[1].toLowerCase();
      const term = match[2];
      const engNames = { g: 'Google', yt: 'YouTube', gh: 'GitHub', w: 'Wikipedia', r: 'Reddit', ddg: 'DuckDuckGo' };
      listEl.innerHTML = `
        <div class="tab-row" id="executeCustomSearchItem" style="border-color:var(--ai)">
          <span style="font-size:18px">🚀</span>
          <div class="tab-row-info">
            <div class="tab-row-title">Search <b>"${escapeHtml(term)}"</b> on ${engNames[eng] || 'Web'}</div>
            <div class="tab-row-meta"><span style="color:var(--ai)">Press Enter ↵ to launch search</span></div>
          </div>
          <button class="tab-row-action">Search ➔</button>
        </div>
      `;
      const actionItem = document.getElementById('executeCustomSearchItem');
      if (actionItem) actionItem.addEventListener('click', () => executeSearch(rawQuery));
      return;
    }

    let matched = allLoadedOpenTabs;
    if (q) {
      matched = allLoadedOpenTabs.filter(t => {
        const title = (t.title || '').toLowerCase();
        const url = (t.url || '').toLowerCase();
        return title.includes(q) || url.includes(q);
      });
    }

    if (matched.length === 0) {
      listEl.innerHTML = `
        <div class="tab-row" id="executeDefaultGoogleItem" style="border-color:var(--b2)">
          <span style="font-size:18px">🔍</span>
          <div class="tab-row-info">
            <div class="tab-row-title">Google Search <b>"${escapeHtml(rawQuery)}"</b></div>
            <div class="tab-row-meta"><span style="color:var(--m2)">Press Enter ↵ or click to open</span></div>
          </div>
          <button class="tab-row-action">Search ➔</button>
        </div>
      `;
      const actionItem = document.getElementById('executeDefaultGoogleItem');
      if (actionItem) actionItem.addEventListener('click', () => executeSearch(rawQuery));
      return;
    }

    renderOpenTabsTimeRows(matched, listEl);
  }

  function executeSearch(raw) {
    const q = raw.trim();
    if (!q) return;
    const match = q.match(/^(g|yt|gh|w|r|ddg)\s+(.*)/i);
    let url = '';
    if (match) {
      const eng = match[1].toLowerCase();
      const term = encodeURIComponent(match[2].trim());
      if (eng === 'yt') url = 'https://www.youtube.com/results?search_query=' + term;
      else if (eng === 'gh') url = 'https://github.com/search?q=' + term;
      else if (eng === 'w') url = 'https://en.wikipedia.org/wiki/Special:Search?search=' + term;
      else if (eng === 'r') url = 'https://www.reddit.com/search/?q=' + term;
      else if (eng === 'ddg') url = 'https://duckduckgo.com/?q=' + term;
      else url = 'https://www.google.com/search?q=' + term;
    } else {
      url = 'https://www.google.com/search?q=' + encodeURIComponent(q);
    }

    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: url });
    } else {
      window.open(url, '_blank');
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // =====================================================================
  // 10. Auth & Cloud Synchronization Controller (Supabase Direct REST API)
  // Supports Independent Offline/Guest Mode & Full Cloud Sync with Web App
  // =====================================================================
  const SUPA_URL = "https://lvzcctsqcpikisdzztot.supabase.co";
  const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2emNjdHNxY3Bpa2lzZHp6dG90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MDk4OTQsImV4cCI6MjA5NzI4NTg5NH0.Z1GejKEAkFuJmum-amd5zin8TFEIaeptroRtjFmojdw";
  const SUPA_AUTH_STORE_KEY = "sb-" + SUPA_URL.replace("https://", "").split(".")[0] + "-auth-token";

  let _authSession = null;
  const SYNC_KEYS = ['habs', 'hd', 'tasks', 'cd', 'customWidgets', 'pomSessions', 'pd', 'pomLive', 'theme', 'customColors', 'profilePic'];
  const _pushTimers = {};

  function setAuthAlert(msg, isSuccess) {
    const el = document.getElementById('authAlertMsg');
    if (!el) return;
    if (!msg) {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }
    el.className = 'auth-alert ' + (isSuccess ? 'success' : 'error');
    el.textContent = msg;
    el.style.display = 'block';
  }

  function updateAuthUI() {
    const authBtn = document.getElementById('authBtn');
    const authBtnText = document.getElementById('authBtnText');
    const authLiveDot = document.getElementById('authLiveDot');
    const quickSignOutBtn = document.getElementById('quickSignOutBtn');
    const signedOutView = document.getElementById('authSignedOutView');
    const signedInView = document.getElementById('authSignedInView');
    const cardEmail = document.getElementById('authCardEmail');

    if (_authSession && _authSession.user) {
      // User is signed in
      const email = _authSession.user.email || 'User';
      if (authBtn) {
        authBtn.classList.add('logged-in');
        authBtn.title = 'Account: ' + email + ' (Click to view & sync)';
      }
      if (authLiveDot) authLiveDot.style.display = 'block';
      if (authBtnText) authBtnText.textContent = '';
      if (quickSignOutBtn) quickSignOutBtn.style.display = 'none';
      if (signedOutView) signedOutView.style.display = 'none';
      if (signedInView) signedInView.style.display = 'block';
      if (cardEmail) cardEmail.textContent = email;
    } else {
      // Offline / Guest mode
      if (authBtn) {
        authBtn.classList.remove('logged-in');
        authBtn.title = 'Sign In to sync habits, tasks, countdowns, pomo & theme';
      }
      if (authLiveDot) authLiveDot.style.display = 'none';
      if (authBtnText) authBtnText.textContent = '';
      if (quickSignOutBtn) quickSignOutBtn.style.display = 'none';
      if (signedOutView) signedOutView.style.display = 'block';
      if (signedInView) signedInView.style.display = 'none';
    }
  }

  function openAuthModal() {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    modal.classList.add('op');
    setAuthAlert('');
  }

  function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    modal.classList.remove('op');
    setAuthAlert('');
  }

  function saveAuthSession(session) {
    _authSession = session;
    if (session) {
      try {
        localStorage.setItem('m_authSession', JSON.stringify(session));
        localStorage.setItem(SUPA_AUTH_STORE_KEY, JSON.stringify(session));
      } catch (e) {}
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const obj = { m_authSession: session };
        obj[SUPA_AUTH_STORE_KEY] = session;
        chrome.storage.local.set(obj);
      }
    } else {
      try {
        localStorage.removeItem('m_authSession');
        localStorage.removeItem(SUPA_AUTH_STORE_KEY);
      } catch (e) {}
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.remove(['m_authSession', SUPA_AUTH_STORE_KEY]);
      }
    }
    updateAuthUI();
  }

  function initAuth(callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['m_authSession', SUPA_AUTH_STORE_KEY], function (res) {
        let sess = res.m_authSession || res[SUPA_AUTH_STORE_KEY];
        if (!sess) {
          try {
            const raw = localStorage.getItem('m_authSession') || localStorage.getItem(SUPA_AUTH_STORE_KEY);
            if (raw) sess = JSON.parse(raw);
          } catch (e) {}
        }
        if (sess && sess.user && sess.access_token) {
          _authSession = sess;
          updateAuthUI();
          pullCloudData(true);
        } else {
          // Check if an open web app tab already has an active login session
          checkOpenTabForAuth();
        }
        if (callback) callback();
      });
    } else {
      try {
        const raw = localStorage.getItem('m_authSession') || localStorage.getItem(SUPA_AUTH_STORE_KEY);
        if (raw) {
          const sess = JSON.parse(raw);
          if (sess && sess.user && sess.access_token) {
            _authSession = sess;
          }
        }
      } catch (e) {}
      updateAuthUI();
      if (_authSession) pullCloudData(true);
      if (callback) callback();
    }
  }

  function checkOpenTabForAuth() {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) return;
    chrome.tabs.query({ url: ['*://localhost/*', '*://127.0.0.1/*', '*://aviatcode.github.io/M2028/*'] }, function (tabs) {
      if (!tabs || tabs.length === 0) return;
      for (let t of tabs) {
        chrome.tabs.sendMessage(t.id, { type: 'GET_M2028_TAB_AUTH' }, function (res) {
          if (chrome.runtime.lastError || !res || !res.success || !res.session) return;
          if (!_authSession && res.session.access_token) {
            saveAuthSession(res.session);
            pullCloudData(true);
          }
        });
      }
    });
  }

  async function apiSignIn(email, password) {
    setAuthAlert('');
    const btn = document.getElementById('authSubmitSignIn');
    if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }

    try {
      const resp = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'apikey': SUPA_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: email.trim(), password: password })
      });
      const data = await resp.json();
      if (!resp.ok) {
        const err = data.msg || data.error_description || data.message || 'Invalid login credentials';
        setAuthAlert(err, false);
        return;
      }
      saveAuthSession(data);
      setAuthAlert('Signed in successfully! Syncing cloud data...', true);
      await pullCloudData(false);
      setTimeout(function () {
        closeAuthModal();
      }, 1200);
    } catch (e) {
      setAuthAlert('Network error: ' + (e.message || 'Could not connect to Supabase'), false);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
    }
  }

  async function apiSignUp(email, password) {
    setAuthAlert('');
    const btn = document.getElementById('authSubmitSignUp');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

    try {
      const resp = await fetch(`${SUPA_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          'apikey': SUPA_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: email.trim(), password: password })
      });
      const data = await resp.json();
      if (!resp.ok) {
        const err = data.msg || data.error_description || data.message || 'Could not create account';
        setAuthAlert(err, false);
        return;
      }
      if (data.access_token && data.user) {
        saveAuthSession(data);
        setAuthAlert('Account created & signed in! Syncing cloud data...', true);
        await pullCloudData(false);
        setTimeout(closeAuthModal, 1200);
      } else {
        setAuthAlert('Account created! Please check your email to confirm before signing in.', true);
      }
    } catch (e) {
      setAuthAlert('Network error: ' + (e.message || 'Could not connect'), false);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Create Account'; }
    }
  }

  async function doSignOut() {
    if (_authSession && _authSession.access_token) {
      try {
        fetch(`${SUPA_URL}/auth/v1/logout`, {
          method: 'POST',
          headers: {
            'apikey': SUPA_KEY,
            'Authorization': `Bearer ${_authSession.access_token}`
          }
        }).catch(() => {});
      } catch (e) {}
    }
    saveAuthSession(null);
    closeAuthModal();
    setAuthAlert('');
  }

  async function pullCloudData(silent) {
    if (!_authSession || !_authSession.user || !_authSession.access_token) return;
    const statusEl = document.getElementById('authSyncStatusText');
    const syncBtn = document.getElementById('authManualSyncBtn');
    if (!silent && syncBtn) {
      syncBtn.disabled = true;
      syncBtn.textContent = '⏳ Syncing...';
    }
    if (statusEl) statusEl.textContent = 'Fetching latest data from cloud...';

    try {
      const resp = await fetch(`${SUPA_URL}/rest/v1/user_data?user_id=eq.${_authSession.user.id}&select=*`, {
        method: 'GET',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${_authSession.access_token}`
        }
      });
      if (!resp.ok) throw new Error('Cloud fetch status ' + resp.status);
      const rows = await resp.json();
      if (!Array.isArray(rows)) return;

      const dataMap = {};
      rows.forEach(r => {
        if (r && r.data_key) dataMap[r.data_key] = r.data_value;
      });

      // 1. Habits
      if (dataMap.habs !== undefined) {
        try { localStorage.setItem('m_habs', JSON.stringify(dataMap.habs)); } catch (e) {}
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ m_habs: dataMap.habs, habs: dataMap.habs });
        }
      }
      if (dataMap.hd !== undefined) {
        try { localStorage.setItem('m_hd', JSON.stringify(dataMap.hd)); } catch (e) {}
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ m_hd: dataMap.hd, hd: dataMap.hd });
        }
      }

      // 2. Tasks
      if (dataMap.tasks !== undefined) {
        try { localStorage.setItem('m_tasks', JSON.stringify(dataMap.tasks)); } catch (e) {}
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ m_tasks: dataMap.tasks, tasks: dataMap.tasks });
        }
      }

      // 3. Countdowns
      if (dataMap.customWidgets !== undefined) {
        try { localStorage.setItem('m_customWidgets', JSON.stringify(dataMap.customWidgets)); } catch (e) {}
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ m_customWidgets: dataMap.customWidgets, customWidgets: dataMap.customWidgets });
        }
      }
      if (dataMap.cd !== undefined) {
        try { localStorage.setItem('m_cd', JSON.stringify(dataMap.cd)); } catch (e) {}
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ m_cd: dataMap.cd, cd: dataMap.cd });
        }
      }

      // 4. Pomodoro
      if (dataMap.pomSessions !== undefined) {
        try { localStorage.setItem('m_pomSessions', JSON.stringify(dataMap.pomSessions)); } catch (e) {}
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ m_pomSessions: dataMap.pomSessions, pomSessions: dataMap.pomSessions });
        }
      }
      if (dataMap.pd !== undefined) {
        try { localStorage.setItem('m_pd', JSON.stringify(dataMap.pd)); } catch (e) {}
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ m_pd: dataMap.pd, pd: dataMap.pd });
        }
      }
      if (dataMap.pomLive !== undefined) {
        try {
          localStorage.setItem('pom_state', JSON.stringify(dataMap.pomLive));
          localStorage.setItem('m_pomLive', JSON.stringify(dataMap.pomLive));
        } catch (e) {}
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ pom_state: dataMap.pomLive, m_pomLive: dataMap.pomLive });
        }
      }

      // 5. Theme & Colors
      if (dataMap.theme !== undefined) {
        try {
          localStorage.setItem('m_theme', JSON.stringify(dataMap.theme));
          localStorage.setItem('theme', JSON.stringify(dataMap.theme));
        } catch (e) {}
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ m_theme: dataMap.theme, theme: dataMap.theme });
        }
      }
      if (dataMap.customColors !== undefined) {
        try {
          localStorage.setItem('m_customColors', JSON.stringify(dataMap.customColors));
          localStorage.setItem('customColors', JSON.stringify(dataMap.customColors));
        } catch (e) {}
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ m_customColors: dataMap.customColors, customColors: dataMap.customColors });
        }
      }

      // 6. Profile Photo & Logo Sync
      if (dataMap.profilePic !== undefined) {
        try {
          localStorage.setItem('m_profilePic', JSON.stringify(dataMap.profilePic));
          localStorage.setItem('profilePic', JSON.stringify(dataMap.profilePic));
        } catch (e) {}
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ m_profilePic: dataMap.profilePic, profilePic: dataMap.profilePic });
        }
        syncLogoAndAvatar();
      }

      // Refresh popup UI views with cloud data
      initTheme();
      renderHabits();
      renderTasks();
      renderCountdowns();
      syncPomoFromStorage();
      syncLogoAndAvatar();

      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (statusEl) statusEl.textContent = `All items synced with cloud at ${timeStr}`;
    } catch (e) {
      console.warn('Cloud sync error:', e);
      if (statusEl) statusEl.textContent = 'Sync notice: offline or connection issue';
    } finally {
      if (!silent && syncBtn) {
        syncBtn.disabled = false;
        syncBtn.textContent = '🔄 Sync Now';
      }
    }
  }

  function pushCloudData(key, val) {
    if (!_authSession || !_authSession.user || !_authSession.access_token) return;
    if (!SYNC_KEYS.includes(key)) return;

    // Debounce rapid bursts
    clearTimeout(_pushTimers[key]);
    _pushTimers[key] = setTimeout(async function () {
      try {
        await fetch(`${SUPA_URL}/rest/v1/user_data?on_conflict=user_id,data_key`, {
          method: 'POST',
          headers: {
            'apikey': SUPA_KEY,
            'Authorization': `Bearer ${_authSession.access_token}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify({
            user_id: _authSession.user.id,
            data_key: key,
            data_value: val,
            updated_at: new Date().toISOString()
          })
        });
        const statusEl = document.getElementById('authSyncStatusText');
        if (statusEl) {
          const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          statusEl.textContent = `Saved ${key} to cloud at ${timeStr}`;
        }
      } catch (e) {
        console.warn('Push error for ' + key, e);
      }
    }, 400);
  }

  function syncWithOpenWebTab() {
    setAuthAlert('Searching for open M2028 tab...', true);
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) {
      setAuthAlert('Chrome Tabs API unavailable. Please sign in with email directly.', false);
      return;
    }
    chrome.tabs.query({ url: ['*://localhost/*', '*://127.0.0.1/*', '*://aviatcode.github.io/M2028/*'] }, function (tabs) {
      if (!tabs || tabs.length === 0) {
        setAuthAlert('No open M2028 tab found. Open M2028 in your browser or sign in with your email & password above.', false);
        return;
      }
      let found = false;
      let checked = 0;
      tabs.forEach(t => {
        chrome.tabs.sendMessage(t.id, { type: 'GET_M2028_TAB_AUTH' }, function (res) {
          checked++;
          if (!chrome.runtime.lastError && res && res.success && res.session) {
            found = true;
            saveAuthSession(res.session);
            setAuthAlert('Found active account from web tab! Syncing...', true);
            pullCloudData(false).then(() => {
              setTimeout(closeAuthModal, 1000);
            });
          }
          if (checked === tabs.length && !found) {
            setAuthAlert('Tab found, but no logged-in account was detected. Please log into M2028 in that tab or sign in above.', false);
          }
        });
      });
    });
  }

  function initAuthListeners() {
    const authBtn = document.getElementById('authBtn');
    if (authBtn) authBtn.addEventListener('click', openAuthModal);

    const quickSignOutBtn = document.getElementById('quickSignOutBtn');
    if (quickSignOutBtn) {
      quickSignOutBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (confirm('Sign out of your M2028 account? Extension will continue working in offline mode.')) {
          doSignOut();
        }
      });
    }

    const authModalClose = document.getElementById('authModalClose');
    if (authModalClose) authModalClose.addEventListener('click', closeAuthModal);

    const authModal = document.getElementById('authModal');
    if (authModal) {
      authModal.addEventListener('click', function (e) {
        if (e.target === authModal) closeAuthModal();
      });
    }

    const authSubmitSignIn = document.getElementById('authSubmitSignIn');
    if (authSubmitSignIn) {
      authSubmitSignIn.addEventListener('click', function () {
        const em = document.getElementById('authEmailInp').value;
        const pw = document.getElementById('authPwInp').value;
        if (!em || !pw) {
          setAuthAlert('Please enter both email and password', false);
          return;
        }
        apiSignIn(em, pw);
      });
    }

    const authSubmitSignUp = document.getElementById('authSubmitSignUp');
    if (authSubmitSignUp) {
      authSubmitSignUp.addEventListener('click', function () {
        const em = document.getElementById('authEmailInp').value;
        const pw = document.getElementById('authPwInp').value;
        if (!em || !pw) {
          setAuthAlert('Please enter both email and password', false);
          return;
        }
        apiSignUp(em, pw);
      });
    }

    const authPwInp = document.getElementById('authPwInp');
    if (authPwInp) {
      authPwInp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          const em = document.getElementById('authEmailInp').value;
          const pw = authPwInp.value;
          if (em && pw) apiSignIn(em, pw);
        }
      });
    }

    const authPwToggle = document.getElementById('authPwToggle');
    if (authPwToggle && authPwInp) {
      authPwToggle.addEventListener('click', function () {
        const isPw = authPwInp.type === 'password';
        authPwInp.type = isPw ? 'text' : 'password';
        authPwToggle.innerHTML = isPw 
          ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
          : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
      });
    }

    const authSyncWebBtn = document.getElementById('authSyncWebBtn');
    if (authSyncWebBtn) authSyncWebBtn.addEventListener('click', syncWithOpenWebTab);

    const authContinueGuestBtn = document.getElementById('authContinueGuestBtn');
    if (authContinueGuestBtn) authContinueGuestBtn.addEventListener('click', closeAuthModal);

    const authManualSyncBtn = document.getElementById('authManualSyncBtn');
    if (authManualSyncBtn) {
      authManualSyncBtn.addEventListener('click', function () {
        pullCloudData(false);
      });
    }

    const authOpenAppBtn = document.getElementById('authOpenAppBtn');
    if (authOpenAppBtn) {
      authOpenAppBtn.addEventListener('click', function () {
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
          chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
        } else {
          window.open('index.html', '_blank');
        }
      });
    }

    const authSignOutBtn = document.getElementById('authSignOutBtn');
    if (authSignOutBtn) {
      authSignOutBtn.addEventListener('click', function () {
        doSignOut();
      });
    }
  }

  // =====================================================================
  // 11. App Logo & User Avatar Sync Controller
  // =====================================================================
  function syncLogoAndAvatar() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['m_profilePic', 'profilePic'], function (res) {
        const p = res.m_profilePic || res.profilePic;
        applyAvatarData(p);
      });
    } else {
      try {
        const raw = localStorage.getItem('m_profilePic') || localStorage.getItem('profilePic');
        if (raw) {
          const p = JSON.parse(raw);
          applyAvatarData(p);
        }
      } catch (e) {}
    }
  }

  function applyAvatarData(p) {
    const authIcon = document.getElementById('authBtnIcon');
    const cardAvatar = document.getElementById('authCardAvatar');
    if (p && p.d && typeof p.d === 'string' && p.d.indexOf('data:image/') === 0) {
      if (authIcon) authIcon.innerHTML = `<img src="${p.d}" style="width:16px;height:16px;border-radius:50%;object-fit:cover;display:block" alt="">`;
      if (cardAvatar) cardAvatar.innerHTML = `<img src="${p.d}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block" alt="">`;
    }
  }

  // =====================================================================
  // 12. Minimal Vector Icon Engine & Emoji Converter (Copied from index.html)
  // Replaces all raw emojis with minimal 1.8-stroke SVG vector icons
  // =====================================================================
  const IC = {
    "pen":"<path d='M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z'/><path d='M14.5 6.5l3 3'/>",
    "flame":"<path d='M12 3c.5 3-2.5 4.5-2.5 8a2.5 2.5 0 0 0 5 0c0-1-.4-1.8-1-2.5 3 1 5 3.5 5 6.5a6.5 6.5 0 0 1-13 0c0-4 3-6 6.5-12z'/>",
    "dumbbell":"<path d='M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11'/>",
    "check":"<path d='M5 12.5l4.5 4.5L19 7.5'/>",
    "checkc":"<circle cx='12' cy='12' r='9'/><path d='M8 12.5l2.8 2.8L16 9.5'/>",
    "checksq":"<rect x='3.5' y='3.5' width='17' height='17' rx='4'/><path d='M8 12.5l2.8 2.8L16 9.5'/>",
    "chart":"<path d='M4 20V10M10 20V4M16 20v-7M21 20H3'/>",
    "book":"<path d='M12 6.5C10.3 5.2 8 4.5 4 4.5v13c4 0 6.3.7 8 2 1.7-1.3 4-2 8-2v-13c-4 0-6.3.7-8 2z'/><path d='M12 6.5v13'/>",
    "cpu":"<rect x='6' y='6' width='12' height='12' rx='2.5'/><rect x='9.5' y='9.5' width='5' height='5' rx='1'/><path d='M9 2.5v3M15 2.5v3M9 18.5v3M15 18.5v3M2.5 9h3M2.5 15h3M18.5 9h3M18.5 15h3'/>",
    "refresh":"<path d='M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4'/>",
    "bell":"<path d='M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z'/><path d='M10 21h4'/>",
    "trash":"<path d='M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3'/>",
    "trophy":"<path d='M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a2.5 2.5 0 0 0 3 3.5M16 6h3.5a2.5 2.5 0 0 1-3 3.5M12 13v4M8.5 20h7M9.5 17h5'/>",
    "image":"<rect x='3.5' y='4.5' width='17' height='15' rx='3'/><circle cx='9' cy='10' r='1.5'/><path d='M4 17l5-4.5 3.5 3L16 12l4 4'/>",
    "clock":"<circle cx='12' cy='13' r='7.5'/><path d='M12 9.5V13l2.5 1.5M9.5 3h5'/>",
    "alarm":"<circle cx='12' cy='13' r='7.5'/><path d='M12 9.5V13l2.5 1.5M4.5 5.5l3-2M19.5 5.5l-3-2'/>",
    "sparkle":"<path d='M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z'/>",
    "flower":"<circle cx='12' cy='12' r='2.5'/><path d='M12 9.5c-2-3-1-5.5 0-6.5 1 1 2 3.5 0 6.5zM14.5 12c3-2 5.5-1 6.5 0-1 1-3.5 2-6.5 0zM12 14.5c2 3 1 5.5 0 6.5-1-1-2-3.5 0-6.5zM9.5 12c-3 2-5.5 1-6.5 0 1-1 3.5-2 6.5 0z'/>",
    "cal":"<rect x='3.5' y='5' width='17' height='15.5' rx='3'/><path d='M8 3v4M16 3v4M3.5 10h17'/>",
    "calg":"<rect x='3.5' y='5' width='17' height='15.5' rx='3'/><path d='M8 3v4M16 3v4M3.5 10h17M8 14h2M14 14h2M8 17.5h2'/>",
    "timer":"<circle cx='12' cy='13.5' r='7.5'/><path d='M12 9.5v4l2.5 1.5M9.5 3h5M12 3v2'/>",
    "heart":"<path d='M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.5 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z'/>",
    "moon":"<path d='M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'/>",
    "gear":"<circle cx='12' cy='12' r='3'/><path d='M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8'/>",
    "news":"<rect x='4' y='4.5' width='16' height='15' rx='3'/><path d='M8 9h8M8 12.5h8M8 16h5'/>",
    "rocket":"<path d='M12 3c3.5 2 5 5.5 4.5 10l-2 2h-5l-2-2C7 8.5 8.5 5 12 3zM9.5 15l-3 1.5.5-3.5M14.5 15l3 1.5-.5-3.5M12 18v3'/><circle cx='12' cy='10' r='1.5'/>",
    "coffee":"<path d='M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2M11.5 3.5v2'/>",
    "play":"<path d='M8 5.5v13l11-6.5z'/>",
    "hourglass":"<path d='M7 3.5h10M7 20.5h10M8 3.5c0 5 8 5 8 8.5s-8 3.5-8 8.5M16 3.5c0 5-8 5-8 8.5s8 3.5 8 8.5'/>",
    "link":"<path d='M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'/>",
    "map":"<path d='M9 4.5L3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5zM9 4.5v13M15 6.5v13'/>",
    "x":"<path d='M6 6l12 12M18 6L6 18'/>",
    "eye":"<path d='M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z'/><circle cx='12' cy='12' r='3'/>",
    "user":"<circle cx='12' cy='8' r='3.8'/><path d='M4.5 20c.7-3.8 3.7-6 7.5-6s6.8 2.2 7.5 6'/>",
    "home":"<path d='M4 11l8-7 8 7v8.5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 19.5zM10 21v-6h4v6'/>",
    "warn":"<path d='M12 4l9 16H3zM12 10v4.5M12 17.5v.5'/>",
    "palette":"<path d='M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.5-2.2-.5-1.2.2-2.3 1.5-2.3H17a3.5 3.5 0 0 0 3.5-3.5C20.5 7 16.7 3.5 12 3.5z'/><circle cx='8' cy='11' r='1'/><circle cx='11.5' cy='7.5' r='1'/><circle cx='16' cy='9' r='1'/>",
    "bolt":"<path d='M13 3L5 13.5h6L10 21l8-10.5h-6z'/>",
    "star":"<path d='M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8L3.6 9.6l5.8-.8z'/>",
    "gem":"<path d='M6 4h12l3.5 5L12 20.5 2.5 9zM2.5 9h19M9 4l-1.5 5L12 20.5 16.5 9 15 4'/>",
    "crown":"<path d='M3.5 8l4.5 4 4-6.5 4 6.5 4.5-4-1.5 11h-14z'/>",
    "target":"<circle cx='12' cy='12' r='8.5'/><circle cx='12' cy='12' r='4.5'/><circle cx='12' cy='12' r='1'/>",
    "note":"<path d='M6 3.5h9l3.5 3.5v13.5H6zM14.5 3.5V7.5h4M9 12h6M9 16h6'/>",
    "film":"<rect x='3.5' y='4.5' width='17' height='15' rx='2.5'/><path d='M8 4.5v15M16 4.5v15M3.5 9.5H8M3.5 14.5H8M16 9.5h4.5M16 14.5h4.5'/>",
    "medal":"<circle cx='12' cy='15' r='5'/><path d='M8.5 3.5L10.5 10.5M15.5 3.5L13.5 10.5'/>",
    "sun":"<circle cx='12' cy='12' r='4'/><path d='M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4'/>",
    "globe":"<circle cx='12' cy='12' r='8.5'/><path d='M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z'/>",
    "search":"<circle cx='11' cy='11' r='7'/><line x1='21' y1='21' x2='16.65' y2='16.65'/>"
  };

  const EM = {
    "✓":"check","✗":"x","✕":"x","✏":"pen","🔥":"flame","💪":"dumbbell","✅":"checkc","📊":"chart","📚":"book",
    "🤖":"cpu","🔄":"refresh","🔔":"bell","🗑":"trash","🏆":"trophy","🖼":"image","⏰":"alarm","✨":"sparkle",
    "🌺":"flower","🌸":"flower","☑":"checksq","☑️":"checksq","📅":"cal","🗓":"calg","⏱":"timer","⏱️":"timer","💗":"heart","💕":"heart",
    "💖":"heart","🌙":"moon","⚙":"gear","📰":"news","🚀":"rocket","☕":"coffee","▶":"play","⏳":"hourglass",
    "🔗":"link","🗺":"map","🎉":"sparkle","👁":"eye","👤":"user","🏠":"home","⚠":"warn","⚠️":"warn","🎨":"palette",
    "⚡":"bolt","🌟":"star","💎":"gem","👑":"crown","⭐":"star","❌":"x","📖":"book","🎯":"target","📝":"note",
    "🎬":"film","☀":"sun","☀️":"sun","🌷":"flower","🌻":"flower","💐":"flower","🌼":"flower","🌐":"globe","🔍":"search","⏸️":"play","⏸":"play"
  };

  const KEYS = Object.keys(EM).sort(function(a,b){return b.length-a.length});
  const RX = new RegExp("(?:"+KEYS.map(function(k){return k.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}).join("|")+")\\uFE0F?|[\\uD83C-\\uD83E][\\uDC00-\\uDFFF]\\uFE0F?|[\\u2600-\\u27BF\\u2B00-\\u2BFF\\u23E9-\\u23FA]\\uFE0F?","g");
  const SKIP_TAGS = {SCRIPT:1,STYLE:1,TEXTAREA:1,INPUT:1,SELECT:1,OPTION:1,SVG:1,svg:1,NOSCRIPT:1,TITLE:1,CODE:1};

  function svgIcon(k){
    const b = IC[k];
    return b ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+b+'</svg>' : '';
  }

  function convEmojiToSvg(txt){
    return txt.replace(RX, function(m){
      const base = m.replace(/\uFE0F/g,"");
      const k = EM[base] || EM[m];
      return '\u0001' + escapeHtml(m) + '\u0002' + (k !== undefined ? k : "") + '\u0003';
    });
  }

  function procEmojiNodes(root){
    if (!root) return;
    const isPink = document.body && document.body.classList.contains('pink');
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function(n){
        const p = n.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS[p.nodeName]) return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest('.ei,[contenteditable="true"],select')) return NodeFilter.FILTER_REJECT;
        RX.lastIndex = 0;
        return RX.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const list = [];
    let n;
    while ((n = w.nextNode())) list.push(n);
    list.forEach(function(t){
      const out = convEmojiToSvg(t.nodeValue);
      const frag = document.createElement("span");
      const parts = out.split("\u0001");
      frag.className = "eiw";
      if (parts[0]) frag.appendChild(document.createTextNode(parts[0]));
      for (let i = 1; i < parts.length; i++) {
        const a = parts[i].split("\u0002");
        const b = a[1].split("\u0003");
        const sp = document.createElement("span");
        sp.className = "ei";
        sp.innerHTML = '<span class="ec">' + a[0] + '</span>' + svgIcon(b[0]);
        frag.appendChild(sp);
        if (b[1]) frag.appendChild(document.createTextNode(b[1]));
      }
      if (t.parentNode) t.parentNode.replaceChild(frag, t);
    });
  }

  // =====================================================================
  // 13. Real-Time Two-Way Storage Synchronizer
  // =====================================================================
  window.addEventListener('storage', function (e) {
    if (e.key === 'm_theme' || e.key === 'm_customColors' || e.key === 'theme') {
      initTheme();
    } else if (e.key === 'm_wallpaper' || e.key === 'wallpaper' || e.key === 'm_wpDim' || e.key === 'wpDim') {
      initWallpaperSync();
    } else if (e.key === 'm_habs' || e.key === 'm_hd') {
      renderHabits();
    } else if (e.key === 'm_tasks') {
      renderTasks();
    } else if (e.key === 'm_customWidgets') {
      renderCountdowns();
    } else if (e.key === 'pom_state' || e.key === 'm_pom_state') {
      syncPomoFromStorage();
    } else if (e.key === 'm_authSession' || e.key === SUPA_AUTH_STORE_KEY) {
      initAuth();
    } else if (e.key === 'm_profilePic' || e.key === 'profilePic') {
      syncLogoAndAvatar();
    }
  });

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'local') {
        if (changes.m_theme || changes.theme || changes.m_customColors || changes.customColors) {
          initTheme();
        }
        if (changes.m_wallpaper || changes.wallpaper || changes.m_wpDim || changes.wpDim) {
          initWallpaperSync();
        }
        if (changes.m_habs || changes.m_hd) {
          renderHabits();
        }
        if (changes.m_tasks) {
          renderTasks();
        }
        if (changes.m_customWidgets) {
          renderCountdowns();
        }
        if (changes.pom_state || changes.m_pom_state) {
          syncPomoFromStorage();
        }
        if (changes.m_profilePic || changes.profilePic) {
          syncLogoAndAvatar();
        }
        if (changes.m_authSession) {
          _authSession = (changes.m_authSession && changes.m_authSession.newValue) || null;
          updateAuthUI();
          if (_authSession) pullCloudData(true);
        }
      }
    });
  }

  // =====================================================================
  // Initialization
  // =====================================================================
  document.addEventListener('DOMContentLoaded', function () {
    syncLogoAndAvatar();
    initTheme();
    initWallpaperSync();
    initNav();
    initAuthListeners();
    initAuth();
    initPomo();
    initTimeTracker();
    renderHabits();
    renderTasks();
    renderCountdowns();
    initNotes();
    initQuickSearch();
    procEmojiNodes(document.body);

    // Continuous dynamic observer to guarantee NO raw emojis ever display
    const iconObs = new MutationObserver(function () {
      iconObs.disconnect();
      try {
        procEmojiNodes(document.body);
      } finally {
        iconObs.observe(document.body, { childList: true, subtree: true, characterData: true });
      }
    });
    iconObs.observe(document.body, { childList: true, subtree: true, characterData: true });
  });

})();
