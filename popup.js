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
      return isNaN(n) ? [0, 0, 0] : [n >> 16 & 255, n >> 8 & 255, 255 & n];
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
        --a2: ${A(ac, 0.16)} !important;
        --dn: ${R(ac)} !important;
        --card-bg: ${dk ? `linear-gradient(135deg, ${A(ac, 0.24)} 0%, ${R(s1)} 38%, ${R(s)} 100%)` : '#ffffff'} !important;
        --card-bd: ${A(ac, 0.35)} !important;
        --card-sh: 0 14px 44px rgba(0,0,0,0.65), 0 0 32px ${A(ac, 0.2)} !important;
        --pill-bg: ${R(ac)} !important;
        --pill-tx: ${L(ac) > 0.4 ? '#0b0f1a' : '#ffffff'} !important;
      }
      body { background: ${R(s)} !important; color: ${R(d)} !important; }
      .tb { background: ${A(s, 0.95)} !important; }
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
        themeBtn.title = 'Current: Light ☀️ (Click for Girl Mode 🌸)';
        themeBtn.innerHTML = '<span style="font-size:14px;line-height:1">🌸</span>';
      } else if (validTheme === 'pink') {
        themeBtn.title = 'Current: Girl Mode 🌸 (Click for Dark Mode 🌙)';
        themeBtn.innerHTML = '<span style="font-size:14px;line-height:1">🌙</span>';
      } else {
        themeBtn.title = 'Current: Dark 🌙 (Click for Light Mode ☀️)';
        themeBtn.innerHTML = '<span style="font-size:14px;line-height:1">☀️</span>';
      }
    }

    // Check account holder's custom palette
    S.get('customColors', null, function (custom) {
      if (!custom) {
        applyCustomColors(null, validTheme);
        return;
      }
      let cfg = null;
      if (custom.bg && custom.tx) {
        if (!custom.t || custom.t === validTheme) cfg = custom;
      } else if (custom[validTheme]) {
        cfg = custom[validTheme];
      }
      applyCustomColors(cfg, validTheme);
    });

    if (activeTabName === 'habits') renderHabits();
    if (activeTabName === 'tasks') renderTasks();
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
    function openFullApp() {
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
      } else {
        window.open('index.html', '_blank');
      }
    }
    if (openPlannerBtn) openPlannerBtn.addEventListener('click', openFullApp);
    if (openHubInsideBtn) openHubInsideBtn.addEventListener('click', openFullApp);
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
          activeTimeEl.textContent = `Active today: ${formatDuration(domSec)}`;
        }
      } else {
        currentActiveTabDomain = '';
        if (activeDomainEl) activeDomainEl.textContent = 'No active webpage';
        if (activeBadgeEl) {
          activeBadgeEl.textContent = 'Idle';
          activeBadgeEl.className = 'active-site-badge badge-other';
        }
        if (activeFaviconEl) activeFaviconEl.textContent = '⏸️';
        if (activeTimeEl) activeTimeEl.textContent = 'Browser idle or non-web tab';
      }

      // 2. Metrics Cards
      const screenTimeEl = document.getElementById('todayScreenTime');
      const siteCountEl = document.getElementById('todaySiteCount');
      const prodScoreEl = document.getElementById('prodScore');
      const prodBreakdownEl = document.getElementById('prodBreakdown');

      if (screenTimeEl) screenTimeEl.textContent = formatDuration(totalSec);

      const domainEntries = Object.entries(domains || {});
      if (siteCountEl) siteCountEl.textContent = `${domainEntries.length} ${isToday ? 'visited today' : 'in 7 days'}`;

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
        if (prodScore >= 75) prodBreakdownEl.textContent = 'High focus 🔥';
        else if (prodScore >= 50) prodBreakdownEl.textContent = 'Moderate focus ⚡';
        else prodBreakdownEl.textContent = 'Distractions present ⚠️';
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
        bar.children[1].style.width = cPct + '%';
        bar.children[2].style.width = sPct + '%';
        bar.children[3].style.width = ePct + '%';
        bar.children[4].style.width = oPct + '%';
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

          listEl.innerHTML = topList.map(([dom, data]) => {
            const pct = Math.round((data.seconds / maxSec) * 100);
            const cat = data.category || 'other';
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
                    <div class="site-bar-fill seg-${cat.slice(0, 4)}" style="width: ${pct}%"></div>
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
                ${r > 0 ? `<span class="hr-streak">🔥 ${r}</span>` : ''}
                <button class="ract del-hab" data-delhid="${h.id}" title="Delete Habit">✕</button>
              </div>
            `;
          }).join('');

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
          listEl.innerHTML = '<div class="empty-msg">🎉 All tasks done! Add a new item above.</div>';
        } else {
          listEl.innerHTML = pending.map(t => {
            let dueChip = '';
            if (t.date) {
              const cls = t.date < today ? 'chip bad' : t.date === today ? 'chip warn' : 'chip set';
              dueChip = `<span class="${cls}">📅 ${t.date}</span>`;
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
      const raw = localStorage.getItem('pom_state') || localStorage.getItem('m_pom_state');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { run: false, mode: 'focus', rem: 50 * 60, phaseLen: 50 * 60, tot: 4, cur: 1 };
  }

  function savePomoState(st) {
    try {
      localStorage.setItem('pom_state', JSON.stringify(st));
      localStorage.setItem('m_pom_state', JSON.stringify(st));
    } catch (e) {}
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ pom_state: st, m_pom_state: st });
    }
  }

  function syncPomoFromStorage() {
    clearInterval(pomoInterval);
    const st = getPomoSavedState();
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
      st.endTs = null;
      savePomoState(st);
      clearInterval(pomoInterval);
      updatePomoDisplay(st);
    }
  }

  function pomoTick() {
    const st = getPomoSavedState();
    if (!st.run || !st.endTs) return;
    st.rem = Math.max(0, Math.round((st.endTs - Date.now()) / 1000));
    if (st.rem <= 0) {
      clearInterval(pomoInterval);
      handlePomoCompletion(st);
    } else {
      updatePomoDisplay(st);
    }
  }

  function handlePomoCompletion(st) {
    st.run = false;
    st.endTs = null;
    playAlertChime();
    if (st.mode === 'focus') {
      st.mode = 'break';
      const bMin = st.phaseLen === 50 * 60 ? 10 : 5;
      st.phaseLen = bMin * 60;
      st.rem = st.phaseLen;
      showChromeNotification('Focus Session Complete! 🎉', 'Enjoy a ' + bMin + ' minute break. Step away and refresh.');
    } else {
      st.mode = 'focus';
      st.cur = (st.cur || 1) + 1;
      const fMin = 50;
      st.phaseLen = fMin * 60;
      st.rem = st.phaseLen;
      showChromeNotification('Break Over! ⚡', 'Ready for session ' + st.cur + '? Let\'s focus!');
    }
    savePomoState(st);
    updatePomoDisplay(st);
  }

  function resetPomo() {
    clearInterval(pomoInterval);
    const activeChip = document.querySelector('.pomo-presets .pomo-chip.on');
    const fMin = activeChip ? parseInt(activeChip.getAttribute('data-focus'), 10) : 50;
    const st = {
      run: false,
      mode: 'focus',
      endTs: null,
      rem: fMin * 60,
      phaseLen: fMin * 60,
      tot: 4,
      cur: 1
    };
    savePomoState(st);
    updatePomoDisplay(st);
  }

  function updatePomoDisplay(st) {
    if (!st) st = getPomoSavedState();
    const min = Math.floor(st.rem / 60);
    const sec = st.rem % 60;

    const mEl = document.getElementById('pomoM');
    const sEl = document.getElementById('pomoS');
    const sessEl = document.getElementById('pomoSess');
    const badgeEl = document.getElementById('pomoModeBadge');
    const startTxt = document.getElementById('pomoStartText');
    const startIco = document.getElementById('pomoStartIcon');
    const ring = document.getElementById('pomoRing');

    if (mEl) mEl.textContent = String(min).padStart(2, '0');
    if (sEl) sEl.textContent = ':' + String(sec).padStart(2, '0');
    if (sessEl) sessEl.textContent = st.cur || 1;
    if (badgeEl) badgeEl.textContent = st.mode === 'focus' ? 'FOCUS SESSION' : 'BREAK TIME';

    if (startTxt) startTxt.textContent = st.run ? 'Pause' : 'Start Focus';
    if (startIco) startIco.textContent = st.run ? '⏸' : '▶';

    if (ring && st.phaseLen > 0) {
      const elapsed = st.phaseLen - st.rem;
      const progress = elapsed / st.phaseLen;
      const deg = Math.round(progress * 360);
      const color = st.mode === 'focus' ? 'var(--ai)' : 'var(--up)';
      ring.style.background = `conic-gradient(${color} ${deg}deg, var(--s3) 0deg)`;
    }
  }

  function initPomo() {
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
        if (st.cur > 1) {
          st.cur--;
          savePomoState(st);
          updatePomoDisplay(st);
        }
      });
    }

    const stepUp = document.getElementById('pomoStepUp');
    if (stepUp) {
      stepUp.addEventListener('click', function () {
        const st = getPomoSavedState();
        st.cur = (st.cur || 1) + 1;
        savePomoState(st);
        updatePomoDisplay(st);
      });
    }

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
                <span class="cd-time-label">${isPast ? 'Goal Reached 🎉' : `${hours}h ${mins}m ${secs}s left`}</span>
              </div>
              <div class="cd-footer-row">
                <span>📅 Target: ${c.date}</span>
                <span class="tag t-ai">${isPast ? 'Completed' : 'T-' + days}</span>
              </div>
            </div>
          `;
        }).join('');

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
  // 10. Real-Time Two-Way Storage Synchronizer
  // =====================================================================
  window.addEventListener('storage', function (e) {
    if (e.key === 'm_theme' || e.key === 'm_customColors' || e.key === 'theme') {
      initTheme();
    } else if (e.key === 'm_habs' || e.key === 'm_hd') {
      renderHabits();
    } else if (e.key === 'm_tasks') {
      renderTasks();
    } else if (e.key === 'm_customWidgets') {
      renderCountdowns();
    } else if (e.key === 'pom_state' || e.key === 'm_pom_state') {
      syncPomoFromStorage();
    }
  });

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'local') {
        if (changes.m_theme || changes.theme || changes.m_customColors || changes.customColors) {
          initTheme();
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
      }
    });
  }

  // =====================================================================
  // Initialization
  // =====================================================================
  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initNav();
    initPomo();
    initTimeTracker();
    renderHabits();
    renderTasks();
    renderCountdowns();
    initNotes();
    initQuickSearch();
  });

})();
