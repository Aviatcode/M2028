/**
 * M2028 Productivity Hub & Time Tracker - Popup Controller
 * Full one-stop extension controller: Time Tracking, Clock, Stopwatch, Timer, Notes, Quick Search
 */

'use strict';

// Safe Chrome Storage & Runtime Wrapper with Web Fallback
const Storage = {
  get: async (keys) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
    }
    const result = {};
    keys.forEach(k => {
      try {
        const val = localStorage.getItem('ext_' + k);
        if (val !== null) result[k] = JSON.parse(val);
      } catch (e) {}
    });
    return result;
  },
  set: async (items) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => chrome.storage.local.set(items, resolve));
    }
    Object.entries(items).forEach(([k, v]) => {
      try {
        localStorage.setItem('ext_' + k, JSON.stringify(v));
      } catch (e) {}
    });
  }
};

const Runtime = {
  sendMessage: (msg) => {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(msg, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response || { success: false });
          }
        });
      } else {
        // Fallback simulation for local web preview
        handleLocalSimulatedMessage(msg, resolve);
      }
    });
  }
};

// Simulated mock data for web preview
function handleLocalSimulatedMessage(msg, resolve) {
  if (msg.type === 'GET_TRACKER_DATA') {
    const today = new Date().toISOString().slice(0, 10);
    resolve({
      success: true,
      today: today,
      todayTotal: 9420,
      todayDomains: {
        'github.com': { seconds: 4320, title: 'M2028 - Master Planner', favicon: 'https://github.githubassets.com/favicons/favicon.svg', category: 'productive' },
        'youtube.com': { seconds: 2100, title: 'Lofi Girl - Relaxing Beats', favicon: 'https://www.youtube.com/s/desktop/99cbfa75/img/favicon.ico', category: 'entertainment' },
        'chatgpt.com': { seconds: 1800, title: 'ChatGPT Assistant', favicon: 'https://oaistatic-subdomain.azureedge.net/chatgpt/favicon.ico', category: 'productive' },
        'reddit.com': { seconds: 1200, title: 'Reddit: Dive into anything', favicon: 'https://www.redditstatic.com/shreddit/assets/favicon/192x192.png', category: 'social' }
      },
      active: { domain: 'github.com', category: 'productive', todayTotal: 4320 },
      weekTotal: 45600,
      weekDomains: {}
    });
  } else if (msg.type === 'GET_OPEN_TABS') {
    resolve({
      success: true,
      tabs: [
        { id: 1, title: 'M2028 Planner & Habit Tracker', url: 'http://localhost:8080/index.html', favIconUrl: 'favicon-32.png' },
        { id: 2, title: 'GitHub - Aviatcode/M2028', url: 'https://github.com/Aviatcode/M2028', favIconUrl: 'https://github.githubassets.com/favicons/favicon.svg' },
        { id: 3, title: 'YouTube - Focus Beats', url: 'https://youtube.com', favIconUrl: 'https://www.youtube.com/s/desktop/99cbfa75/img/favicon.ico' }
      ]
    });
  } else {
    resolve({ success: true });
  }
}

// -------------------------------------------------------------
// App State
// -------------------------------------------------------------
let currentTab = 'tracker';
let trackerRange = 'today'; // 'today' or 'week'
let trackerRefreshTimer = null;

// Clock State
let clockIs12h = true;
let clockShowSec = true;

// Stopwatch State
let swRunning = false;
let swStartTime = 0;
let swAccumulatedTime = 0;
let swTimerId = null;
let swLaps = [];

// Timer State
let timerTotalSeconds = 25 * 60;
let timerRemainingSeconds = 25 * 60;
let timerRunning = false;
let timerIntervalId = null;
let timerSoundEnabled = true;

// Notes State
let notesDebounceTimer = null;

// -------------------------------------------------------------
// Initialization
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initNavigation();
  initTimeTracker();
  initClock();
  initStopwatch();
  initTimer();
  initNotes();
  initQuickSearch();
  initHeaderButtons();

  // Restore active tab
  const savedState = await Storage.get(['lastActiveTab']);
  if (savedState.lastActiveTab) {
    switchTab(savedState.lastActiveTab);
  }
});

// -------------------------------------------------------------
// Theme Management
// -------------------------------------------------------------
async function initTheme() {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const saved = await Storage.get(['hubTheme']);
  const theme = saved.hubTheme || 'dark';
  document.documentElement.setAttribute('data-theme', theme);

  themeToggleBtn.addEventListener('click', async () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    await Storage.set({ hubTheme: next });
  });
}

// -------------------------------------------------------------
// Navigation Tabs
// -------------------------------------------------------------
function initNavigation() {
  const navTabs = document.querySelectorAll('.nav-tab');
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      switchTab(target);
    });
  });
}

function switchTab(tabId) {
  currentTab = tabId;
  Storage.set({ lastActiveTab: tabId });

  // Update tabs UI
  document.querySelectorAll('.nav-tab').forEach(t => {
    const isTarget = t.getAttribute('data-tab') === tabId;
    t.classList.toggle('active', isTarget);
    t.setAttribute('aria-selected', isTarget ? 'true' : 'false');
  });

  // Update panels UI
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === `panel-${tabId}`);
  });

  // Tab-specific trigger
  if (tabId === 'tracker') {
    loadTrackerData();
  } else if (tabId === 'search') {
    loadOpenTabs();
    setTimeout(() => {
      const inp = document.getElementById('quickSearchInput');
      if (inp) inp.focus();
    }, 50);
  }
}

// -------------------------------------------------------------
// 1. Time Tracker Module
// -------------------------------------------------------------
function initTimeTracker() {
  const rangeTodayBtn = document.getElementById('rangeTodayBtn');
  const rangeWeekBtn = document.getElementById('rangeWeekBtn');
  const resetBtn = document.getElementById('resetTrackerBtn');

  rangeTodayBtn.addEventListener('click', () => {
    trackerRange = 'today';
    rangeTodayBtn.classList.add('active');
    rangeWeekBtn.classList.remove('active');
    loadTrackerData();
  });

  rangeWeekBtn.addEventListener('click', () => {
    trackerRange = 'week';
    rangeWeekBtn.classList.add('active');
    rangeTodayBtn.classList.remove('active');
    loadTrackerData();
  });

  resetBtn.addEventListener('click', async () => {
    if (confirm("Reset today's tracking data?")) {
      await Runtime.sendMessage({ type: 'RESET_TRACKER_DATA' });
      loadTrackerData();
    }
  });

  loadTrackerData();
  // Auto refresh every 3 seconds while popup is active
  trackerRefreshTimer = setInterval(() => {
    if (currentTab === 'tracker') loadTrackerData();
  }, 3000);
}

function formatDuration(totalSec) {
  if (!totalSec || totalSec < 1) return '0m';
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

async function loadTrackerData() {
  const resp = await Runtime.sendMessage({ type: 'GET_TRACKER_DATA' });
  if (!resp || !resp.success) return;

  const isToday = trackerRange === 'today';
  const totalSec = isToday ? resp.todayTotal : resp.weekTotal;
  const domains = isToday ? resp.todayDomains : resp.weekDomains;
  const active = resp.active;

  // Active site banner
  const activeDomainEl = document.getElementById('activeSiteDomain');
  const activeFaviconEl = document.getElementById('activeSiteFavicon');
  const activeBadgeEl = document.getElementById('activeSiteCategory');

  if (active && active.domain) {
    activeDomainEl.textContent = active.domain;
    activeBadgeEl.textContent = active.category || 'other';
    activeBadgeEl.className = `active-site-badge badge-${active.category || 'other'}`;
    if (active.favicon) {
      activeFaviconEl.innerHTML = `<img src="${escapeHtml(active.favicon)}" onerror="this.src='';this.parentNode.innerHTML='🌐';">`;
    } else {
      activeFaviconEl.textContent = '🌐';
    }
  } else {
    activeDomainEl.textContent = 'No active webpage';
    activeBadgeEl.textContent = 'Idle';
    activeFaviconEl.textContent = '⏸️';
  }

  // Summary Metrics
  const screenTimeEl = document.getElementById('todayScreenTime');
  const siteCountEl = document.getElementById('todaySiteCount');
  const prodScoreEl = document.getElementById('prodScore');
  const prodBreakdownEl = document.getElementById('prodBreakdown');

  screenTimeEl.textContent = formatDuration(totalSec);

  const domainEntries = Object.entries(domains || {});
  siteCountEl.textContent = `${domainEntries.length} ${isToday ? 'visited today' : 'in 7 days'}`;

  // Calculate Productivity & Category Distribution
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
  prodScoreEl.textContent = `${prodScore}%`;

  if (prodScore >= 75) prodBreakdownEl.textContent = 'High focus 🔥';
  else if (prodScore >= 50) prodBreakdownEl.textContent = 'Moderate focus ⚡';
  else prodBreakdownEl.textContent = 'Distractions present ⚠️';

  // Category bar widths
  const pPct = ((prodSec / validTotal) * 100).toFixed(1);
  const cPct = ((commSec / validTotal) * 100).toFixed(1);
  const sPct = ((socSec / validTotal) * 100).toFixed(1);
  const ePct = ((entSec / validTotal) * 100).toFixed(1);
  const oPct = ((othSec / validTotal) * 100).toFixed(1);

  const bar = document.getElementById('catProgressBar');
  if (bar) {
    bar.children[0].style.width = pPct + '%';
    bar.children[1].style.width = cPct + '%';
    bar.children[2].style.width = sPct + '%';
    bar.children[3].style.width = ePct + '%';
    bar.children[4].style.width = oPct + '%';
  }

  // Top Sites List
  const listEl = document.getElementById('topSitesList');
  if (!listEl) return;

  if (domainEntries.length === 0) {
    listEl.innerHTML = '<div class="empty-state">No browsing time recorded yet. Start surfing and your stats will appear!</div>';
    return;
  }

  // Sort descending by seconds
  domainEntries.sort((a, b) => b[1].seconds - a[1].seconds);

  const maxSec = domainEntries[0][1].seconds || 1;
  const topList = domainEntries.slice(0, 8);

  listEl.innerHTML = topList.map(([dom, data]) => {
    const pct = Math.round((data.seconds / maxSec) * 100);
    const cat = data.category || 'other';
    const fav = data.favicon || `https://www.google.com/s2/favicons?domain=${dom}&sz=32`;

    return `
      <div class="site-row">
        <img class="site-favicon" src="${escapeHtml(fav)}" onerror="this.style.display='none';">
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

// -------------------------------------------------------------
// 2. Clock Module
// -------------------------------------------------------------
function initClock() {
  const formatBtn = document.getElementById('clockFormatBtn');
  const secBtn = document.getElementById('clockSecondsBtn');

  formatBtn.addEventListener('click', () => {
    clockIs12h = !clockIs12h;
    formatBtn.classList.toggle('active', clockIs12h);
    formatBtn.textContent = clockIs12h ? '12-Hour' : '24-Hour';
    updateClock();
  });

  secBtn.addEventListener('click', () => {
    clockShowSec = !clockShowSec;
    secBtn.classList.toggle('active', clockShowSec);
    updateClock();
  });

  updateClock();
  setInterval(updateClock, 1000);
}

function updateClock() {
  const now = new Date();
  const timeEl = document.getElementById('clockTime');
  const ampmEl = document.getElementById('clockAmPm');
  const dateEl = document.getElementById('clockDate');
  const greetingEl = document.getElementById('headerGreeting');

  if (!timeEl) return;

  let h = now.getHours();
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  let ampm = '';

  if (clockIs12h) {
    ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
  }
  const hStr = String(h).padStart(2, '0');

  timeEl.textContent = clockShowSec ? `${hStr}:${m}:${s}` : `${hStr}:${m}`;
  ampmEl.textContent = ampm;

  // Formatted Date
  const dateOpts = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
  dateEl.textContent = now.toLocaleDateString('en-US', dateOpts);

  // Dynamic Greeting
  const rawH = now.getHours();
  if (rawH < 5) greetingEl.textContent = '🌙 Night Focus';
  else if (rawH < 12) greetingEl.textContent = '🌅 Good Morning';
  else if (rawH < 17) greetingEl.textContent = '☀️ Good Afternoon';
  else if (rawH < 22) greetingEl.textContent = '🌇 Good Evening';
  else greetingEl.textContent = '✨ Late Night Grind';

  // World Clocks
  const tzs = [
    { id: 'wc-utc', tz: 'UTC' },
    { id: 'wc-ny', tz: 'America/New_York' },
    { id: 'wc-lon', tz: 'Europe/London' },
    { id: 'wc-tko', tz: 'Asia/Tokyo' }
  ];

  tzs.forEach(({ id, tz }) => {
    const el = document.getElementById(id);
    if (el) {
      try {
        const timeStr = now.toLocaleTimeString('en-US', {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: clockIs12h
        });
        el.textContent = timeStr;
      } catch (e) {
        el.textContent = '--:--';
      }
    }
  });
}

// -------------------------------------------------------------
// 3. Stopwatch Module
// -------------------------------------------------------------
async function initStopwatch() {
  const startBtn = document.getElementById('swStartBtn');
  const lapBtn = document.getElementById('swLapBtn');
  const resetBtn = document.getElementById('swResetBtn');

  // Restore saved stopwatch state
  const saved = await Storage.get(['m2028_stopwatch_state']);
  if (saved.m2028_stopwatch_state) {
    const st = saved.m2028_stopwatch_state;
    swAccumulatedTime = st.accumulatedTime || 0;
    swLaps = st.laps || [];
    renderLaps();

    if (st.running && st.startTime) {
      swRunning = true;
      swStartTime = st.startTime;
      startStopwatchTimer();
      startBtn.textContent = 'Pause';
      startBtn.classList.remove('primary');
      startBtn.classList.add('secondary');
      lapBtn.disabled = false;
      resetBtn.disabled = false;
    } else {
      renderStopwatchTime(swAccumulatedTime);
      if (swAccumulatedTime > 0) {
        resetBtn.disabled = false;
      }
    }
  }

  startBtn.addEventListener('click', () => {
    if (!swRunning) {
      // Start / Resume
      swRunning = true;
      swStartTime = Date.now();
      startStopwatchTimer();
      startBtn.textContent = 'Pause';
      startBtn.classList.remove('primary');
      startBtn.classList.add('secondary');
      lapBtn.disabled = false;
      resetBtn.disabled = false;
      persistStopwatch();
    } else {
      // Pause
      swRunning = false;
      swAccumulatedTime += (Date.now() - swStartTime);
      clearInterval(swTimerId);
      startBtn.textContent = 'Resume';
      startBtn.classList.add('primary');
      startBtn.classList.remove('secondary');
      lapBtn.disabled = true;
      persistStopwatch();
    }
  });

  lapBtn.addEventListener('click', () => {
    if (!swRunning) return;
    const currentElapsed = swAccumulatedTime + (Date.now() - swStartTime);
    const lastLapTotal = swLaps.length > 0 ? swLaps[swLaps.length - 1].totalTime : 0;
    const split = currentElapsed - lastLapTotal;

    swLaps.push({
      lapNum: swLaps.length + 1,
      splitTime: split,
      totalTime: currentElapsed
    });
    renderLaps();
    persistStopwatch();
  });

  resetBtn.addEventListener('click', () => {
    swRunning = false;
    clearInterval(swTimerId);
    swAccumulatedTime = 0;
    swStartTime = 0;
    swLaps = [];
    renderStopwatchTime(0);
    renderLaps();

    startBtn.textContent = 'Start';
    startBtn.classList.add('primary');
    startBtn.classList.remove('secondary');
    lapBtn.disabled = true;
    resetBtn.disabled = true;
    persistStopwatch();
  });
}

function startStopwatchTimer() {
  clearInterval(swTimerId);
  swTimerId = setInterval(() => {
    const elapsed = swAccumulatedTime + (Date.now() - swStartTime);
    renderStopwatchTime(elapsed);
  }, 35);
}

function renderStopwatchTime(ms) {
  const timeEl = document.getElementById('swDisplay');
  const msEl = document.getElementById('swMs');
  if (!timeEl || !msEl) return;

  const totalHundredths = Math.floor(ms / 10);
  const hundredths = totalHundredths % 100;
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  const hStr = String(hours).padStart(2, '0');
  const mStr = String(minutes).padStart(2, '0');
  const sStr = String(seconds).padStart(2, '0');
  const csStr = String(hundredths).padStart(2, '0');

  timeEl.textContent = `${hStr}:${mStr}:${sStr}`;
  msEl.textContent = `.${csStr}`;
}

function formatLapTime(ms) {
  const totalHundredths = Math.floor(ms / 10);
  const hundredths = totalHundredths % 100;
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

function renderLaps() {
  const container = document.getElementById('swLapsList');
  const countEl = document.getElementById('swLapCount');
  if (!container) return;

  countEl.textContent = `${swLaps.length} ${swLaps.length === 1 ? 'lap' : 'laps'}`;

  if (swLaps.length === 0) {
    container.innerHTML = '<div class="empty-state">Press Start and then Lap to log split times.</div>';
    return;
  }

  let minSplit = Infinity;
  let maxSplit = -Infinity;
  if (swLaps.length > 1) {
    swLaps.forEach(l => {
      if (l.splitTime < minSplit) minSplit = l.splitTime;
      if (l.splitTime > maxSplit) maxSplit = l.splitTime;
    });
  }

  // Reverse list to show newest on top
  const rows = [...swLaps].reverse().map(lap => {
    let extraCls = '';
    if (swLaps.length > 1) {
      if (lap.splitTime === minSplit) extraCls = 'lap-fastest';
      else if (lap.splitTime === maxSplit) extraCls = 'lap-slowest';
    }

    return `
      <div class="lap-row ${extraCls}">
        <span class="lap-num">Lap ${lap.lapNum}</span>
        <span class="lap-split">+${formatLapTime(lap.splitTime)}</span>
        <span class="lap-total">${formatLapTime(lap.totalTime)}</span>
      </div>
    `;
  }).join('');

  container.innerHTML = rows;
}

function persistStopwatch() {
  Storage.set({
    m2028_stopwatch_state: {
      running: swRunning,
      startTime: swStartTime,
      accumulatedTime: swAccumulatedTime,
      laps: swLaps
    }
  });
}

// -------------------------------------------------------------
// 4. Timer Module (Pomodoro & Countdown)
// -------------------------------------------------------------
async function initTimer() {
  const countdownEl = document.getElementById('timerCountdown');
  const stateLabel = document.getElementById('timerStateLabel');
  const startBtn = document.getElementById('timerStartBtn');
  const resetBtn = document.getElementById('timerResetBtn');
  const soundBtn = document.getElementById('timerSoundBtn');
  const chips = document.querySelectorAll('.preset-chip');
  const setCustomBtn = document.getElementById('setCustomTimerBtn');
  const customInp = document.getElementById('customTimerMin');

  // Check running timer from background service worker
  const resp = await Runtime.sendMessage({ type: 'GET_TIMER_STATE' });
  if (resp && resp.timer && resp.timer.running && resp.timer.endTime) {
    const remaining = Math.max(0, Math.round((resp.timer.endTime - Date.now()) / 1000));
    if (remaining > 0) {
      timerRunning = true;
      timerTotalSeconds = resp.timer.totalSeconds || (25 * 60);
      timerRemainingSeconds = remaining;
      startLocalTimerTick();
      startBtn.textContent = 'Pause';
      startBtn.classList.remove('primary');
      startBtn.classList.add('secondary');
      stateLabel.textContent = resp.timer.label || 'Focusing...';
    }
  }

  // Presets
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const mins = Number(chip.getAttribute('data-min')) || 25;
      setTimerDuration(mins);
    });
  });

  setCustomBtn.addEventListener('click', () => {
    const mins = parseInt(customInp.value, 10);
    if (!isNaN(mins) && mins > 0 && mins <= 360) {
      chips.forEach(c => c.classList.remove('active'));
      setTimerDuration(mins);
    }
  });

  startBtn.addEventListener('click', async () => {
    if (!timerRunning) {
      // Start Timer
      timerRunning = true;
      startLocalTimerTick();
      startBtn.textContent = 'Pause';
      startBtn.classList.remove('primary');
      startBtn.classList.add('secondary');
      stateLabel.textContent = 'Focusing...';

      // Tell background worker
      const minsRemaining = timerRemainingSeconds / 60;
      await Runtime.sendMessage({
        type: 'START_TIMER',
        minutes: minsRemaining,
        label: 'Focus Session'
      });
    } else {
      // Pause
      timerRunning = false;
      clearInterval(timerIntervalId);
      startBtn.textContent = 'Resume';
      startBtn.classList.add('primary');
      startBtn.classList.remove('secondary');
      stateLabel.textContent = 'Paused';
      await Runtime.sendMessage({ type: 'CANCEL_TIMER' });
    }
  });

  resetBtn.addEventListener('click', async () => {
    timerRunning = false;
    clearInterval(timerIntervalId);
    timerRemainingSeconds = timerTotalSeconds;
    renderTimerDisplay();
    startBtn.textContent = 'Start Focus';
    startBtn.classList.add('primary');
    startBtn.classList.remove('secondary');
    stateLabel.textContent = 'Ready to Focus';
    await Runtime.sendMessage({ type: 'CANCEL_TIMER' });
  });

  soundBtn.addEventListener('click', () => {
    timerSoundEnabled = !timerSoundEnabled;
    soundBtn.style.opacity = timerSoundEnabled ? '1' : '0.4';
    if (timerSoundEnabled) playTimerChime();
  });

  renderTimerDisplay();
}

function setTimerDuration(minutes) {
  timerTotalSeconds = minutes * 60;
  timerRemainingSeconds = timerTotalSeconds;
  timerRunning = false;
  clearInterval(timerIntervalId);

  const startBtn = document.getElementById('timerStartBtn');
  const stateLabel = document.getElementById('timerStateLabel');
  if (startBtn) {
    startBtn.textContent = 'Start Focus';
    startBtn.classList.add('primary');
    startBtn.classList.remove('secondary');
  }
  if (stateLabel) stateLabel.textContent = 'Ready to Focus';

  renderTimerDisplay();
  Runtime.sendMessage({ type: 'CANCEL_TIMER' });
}

function startLocalTimerTick() {
  clearInterval(timerIntervalId);
  timerIntervalId = setInterval(() => {
    if (timerRemainingSeconds > 0) {
      timerRemainingSeconds--;
      renderTimerDisplay();

      if (timerRemainingSeconds === 0) {
        // Finished!
        timerRunning = false;
        clearInterval(timerIntervalId);
        const startBtn = document.getElementById('timerStartBtn');
        const stateLabel = document.getElementById('timerStateLabel');
        if (startBtn) startBtn.textContent = 'Start Focus';
        if (stateLabel) stateLabel.textContent = 'Completed! 🎉';
        if (timerSoundEnabled) playTimerChime();
      }
    }
  }, 1000);
}

function renderTimerDisplay() {
  const countdownEl = document.getElementById('timerCountdown');
  const circleFg = document.getElementById('timerCircleFg');
  if (!countdownEl) return;

  const m = Math.floor(timerRemainingSeconds / 60);
  const s = timerRemainingSeconds % 60;
  countdownEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  // Update SVG radial ring (circumference for r=88 is 2 * PI * 88 ~= 552.92)
  if (circleFg) {
    const circum = 553;
    const progress = timerTotalSeconds > 0 ? (timerRemainingSeconds / timerTotalSeconds) : 0;
    const offset = circum * (1 - progress);
    circleFg.style.strokeDashoffset = offset;
  }
}

// Web Audio API Synthesized Chime (100% offline, crystal clear bell)
function playTimerChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;

    const chords = [523.25, 659.25, 783.99, 1046.50]; // C5 major arpeggio
    chords.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      gain.gain.setValueAtTime(0, now + idx * 0.12);
      gain.gain.linearRampToValueAtTime(0.3, now + idx * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 1.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 1.3);
    });
  } catch (e) {
    console.warn('Audio playback not supported:', e);
  }
}

// -------------------------------------------------------------
// 5. Notes / Scratchpad Module
// -------------------------------------------------------------
async function initNotes() {
  const input = document.getElementById('notesInput');
  const preview = document.getElementById('notesPreview');
  const modeBtn = document.getElementById('notesModeBtn');
  const copyBtn = document.getElementById('notesCopyBtn');
  const downloadBtn = document.getElementById('notesDownloadBtn');
  const clearBtn = document.getElementById('notesClearBtn');
  const saveStatus = document.getElementById('notesSaveStatus');
  const wordCountEl = document.getElementById('notesWordCount');
  const charCountEl = document.getElementById('notesCharCount');

  // Load saved notes
  const saved = await Storage.get(['m2028_scratchpad']);
  if (saved.m2028_scratchpad) {
    input.value = saved.m2028_scratchpad;
    updateNotesCount(input.value);
  }

  // Auto-save on input
  input.addEventListener('input', () => {
    updateNotesCount(input.value);
    saveStatus.textContent = 'Saving...';
    clearTimeout(notesDebounceTimer);
    notesDebounceTimer = setTimeout(async () => {
      await Storage.set({ m2028_scratchpad: input.value });
      saveStatus.textContent = 'Saved automatically';
    }, 350);
  });

  // Preview Mode Toggle
  modeBtn.addEventListener('click', () => {
    const isEditing = preview.classList.contains('hidden');
    if (isEditing) {
      // Switch to preview
      preview.innerHTML = renderMarkdown(input.value);
      preview.classList.remove('hidden');
      input.classList.add('hidden');
      modeBtn.textContent = 'Edit Mode';
      modeBtn.classList.add('active');
    } else {
      // Switch to edit
      preview.classList.add('hidden');
      input.classList.remove('hidden');
      modeBtn.textContent = 'Preview Mode';
      modeBtn.classList.remove('active');
      input.focus();
    }
  });

  // Copy Note
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(input.value);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => copyBtn.textContent = 'Copy', 1500);
    } catch (e) {
      input.select();
      document.execCommand('copy');
      copyBtn.textContent = 'Copied!';
      setTimeout(() => copyBtn.textContent = 'Copy', 1500);
    }
  });

  // Download Note
  downloadBtn.addEventListener('click', () => {
    const blob = new Blob([input.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `m2028-notes-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Clear Note
  clearBtn.addEventListener('click', async () => {
    if (input.value.trim() && confirm('Clear your scratchpad note?')) {
      input.value = '';
      updateNotesCount('');
      await Storage.set({ m2028_scratchpad: '' });
      saveStatus.textContent = 'Cleared';
    }
  });
}

function updateNotesCount(text) {
  const wordCountEl = document.getElementById('notesWordCount');
  const charCountEl = document.getElementById('notesCharCount');
  if (!wordCountEl || !charCountEl) return;

  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  wordCountEl.textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
  charCountEl.textContent = `${chars} chars`;
}

// Lightweight Markdown Renderer (No external library)
function renderMarkdown(md) {
  if (!md || !md.trim()) return '<div class="empty-state">Empty note. Type something in Edit Mode!</div>';

  let html = escapeHtml(md);

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h4 style="margin:8px 0 4px;font-weight:700;">$1</h4>');
  html = html.replace(/^## (.*$)/gim, '<h3 style="margin:10px 0 4px;font-weight:700;">$1</h3>');
  html = html.replace(/^# (.*$)/gim, '<h2 style="margin:12px 0 6px;font-weight:800;color:var(--accent);">$1</h2>');

  // Bold & Italic
  html = html.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  html = html.replace(/\*(.*?)\*/g, '<i>$1</i>');

  // Checkboxes
  html = html.replace(/\[x\]\s*(.*)/gi, '<div style="display:flex;align-items:center;gap:6px;margin:2px 0;"><span style="color:var(--accent)">✓</span> <s style="opacity:0.6">$1</s></div>');
  html = html.replace(/\[ \]\s*(.*)/g, '<div style="display:flex;align-items:center;gap:6px;margin:2px 0;"><span style="opacity:0.4">○</span> <span>$1</span></div>');

  // Bullet Lists
  html = html.replace(/^- (.*$)/gim, '<li style="margin-left:16px;">$1</li>');

  // Code snippets
  html = html.replace(/`([^`]+)`/g, '<code style="background:var(--bg-input);padding:2px 5px;border-radius:4px;font-size:11px;">$1</code>');

  // Line breaks
  html = html.replace(/\n/g, '<br>');

  return html;
}

// -------------------------------------------------------------
// 6. Quick Search & Launcher Module
// -------------------------------------------------------------
let allOpenTabs = [];

function initQuickSearch() {
  const input = document.getElementById('quickSearchInput');
  const clearBtn = document.getElementById('searchClearBtn');
  const chips = document.querySelectorAll('.engine-chip');
  const refreshBtn = document.getElementById('refreshTabsBtn');

  input.addEventListener('input', () => {
    const val = input.value;
    clearBtn.classList.toggle('hidden', val.length === 0);
    filterSearchResults(val);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.add('hidden');
    filterSearchResults('');
    input.focus();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      executeQuickSearch(input.value.trim());
    }
  });

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const prefix = chip.getAttribute('data-prefix');
      input.value = `${prefix} `;
      input.focus();
      clearBtn.classList.remove('hidden');
    });
  });

  refreshBtn.addEventListener('click', () => {
    loadOpenTabs();
  });
}

async function loadOpenTabs() {
  const resp = await Runtime.sendMessage({ type: 'GET_OPEN_TABS' });
  if (resp && resp.success && Array.isArray(resp.tabs)) {
    allOpenTabs = resp.tabs;
    filterSearchResults(document.getElementById('quickSearchInput').value);
  }
}

function filterSearchResults(query) {
  const resultsList = document.getElementById('searchResultsList');
  const heading = document.getElementById('resultsHeading');
  if (!resultsList) return;

  const q = query.trim().toLowerCase();

  // If query starts with search prefix like "yt ", "gh ", "g "
  const prefixMatch = q.match(/^(g|yt|gh|w|r|ddg)\s+(.*)/i);
  if (prefixMatch) {
    const engine = prefixMatch[1].toLowerCase();
    const searchTerm = prefixMatch[2];
    heading.textContent = `Web Search: ${engine.toUpperCase()}`;
    resultsList.innerHTML = `
      <div class="tab-result-item" id="executeSearchAction">
        <span style="font-size:18px;">🚀</span>
        <div class="tab-result-title">Search <b>"${escapeHtml(searchTerm)}"</b> on ${getEngineName(engine)}</div>
        <span class="tab-result-action">Press Enter ↵</span>
      </div>
    `;
    document.getElementById('executeSearchAction').addEventListener('click', () => {
      executeQuickSearch(query);
    });
    return;
  }

  // Tabs Search
  let matchedTabs = allOpenTabs;
  if (q.length > 0) {
    matchedTabs = allOpenTabs.filter(t => 
      t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q)
    );
    heading.textContent = `Open Tabs (${matchedTabs.length} found)`;
  } else {
    heading.textContent = `Open Tabs (${allOpenTabs.length})`;
  }

  if (matchedTabs.length === 0) {
    resultsList.innerHTML = `
      <div class="tab-result-item" id="defaultSearchAction">
        <span style="font-size:18px;">🔍</span>
        <div class="tab-result-title">Google Search <b>"${escapeHtml(query)}"</b></div>
        <span class="tab-result-action">Press Enter ↵</span>
      </div>
    `;
    document.getElementById('defaultSearchAction').addEventListener('click', () => {
      executeQuickSearch(query);
    });
    return;
  }

  resultsList.innerHTML = matchedTabs.slice(0, 10).map(tab => `
    <div class="tab-result-item" data-tabid="${tab.id}" data-winid="${tab.windowId}">
      <img class="tab-result-favicon" src="${escapeHtml(tab.favIconUrl || 'favicon-32.png')}" onerror="this.src='favicon-32.png'">
      <div class="tab-result-title">${escapeHtml(tab.title)}</div>
      <span class="tab-result-action">Switch ➔</span>
    </div>
  `).join('');

  // Attach click listeners to switch tabs
  resultsList.querySelectorAll('.tab-result-item').forEach(item => {
    item.addEventListener('click', async () => {
      const tabId = Number(item.getAttribute('data-tabid'));
      const winId = Number(item.getAttribute('data-winid'));
      await Runtime.sendMessage({ type: 'SWITCH_TO_TAB', tabId, windowId: winId });
      window.close(); // Close popup after switching
    });
  });
}

function getEngineName(prefix) {
  switch (prefix) {
    case 'g': return 'Google';
    case 'yt': return 'YouTube';
    case 'gh': return 'GitHub';
    case 'w': return 'Wikipedia';
    case 'r': return 'Reddit';
    case 'ddg': return 'DuckDuckGo';
    default: return 'Web';
  }
}

function executeQuickSearch(rawQuery) {
  if (!rawQuery) return;
  const m = rawQuery.match(/^(g|yt|gh|w|r|ddg)\s+(.*)/i);
  let url = '';

  if (m) {
    const engine = m[1].toLowerCase();
    const q = encodeURIComponent(m[2].trim());
    switch (engine) {
      case 'g': url = `https://www.google.com/search?q=${q}`; break;
      case 'yt': url = `https://www.youtube.com/results?search_query=${q}`; break;
      case 'gh': url = `https://github.com/search?q=${q}`; break;
      case 'w': url = `https://en.wikipedia.org/wiki/Special:Search?search=${q}`; break;
      case 'r': url = `https://www.reddit.com/search/?q=${q}`; break;
      case 'ddg': url = `https://duckduckgo.com/?q=${q}`; break;
    }
  } else {
    // Default search
    const q = encodeURIComponent(rawQuery.trim());
    url = `https://www.google.com/search?q=${q}`;
  }

  if (url) {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: url });
      window.close();
    } else {
      window.open(url, '_blank');
    }
  }
}

// -------------------------------------------------------------
// Header & Quick Launcher Links
// -------------------------------------------------------------
function initHeaderButtons() {
  const openPlannerBtn = document.getElementById('openPlannerBtn');
  const tasksBtn = document.getElementById('quickTasksBtn');
  const habitsBtn = document.getElementById('quickHabitsBtn');
  const pomoBtn = document.getElementById('quickPomoBtn');

  function openPlanner(hash = '') {
    const targetUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL('index.html' + hash)
      : 'index.html' + hash;

    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: targetUrl });
      window.close();
    } else {
      window.open(targetUrl, '_blank');
    }
  }

  openPlannerBtn.addEventListener('click', () => openPlanner(''));
  tasksBtn.addEventListener('click', () => openPlanner('?action=add-task'));
  habitsBtn.addEventListener('click', () => openPlanner('#habits'));
  pomoBtn.addEventListener('click', () => openPlanner('#pomo'));
}

// Utility: HTML Escaper
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
