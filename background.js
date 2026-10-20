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
  await flushTime();
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    isWindowFocused = false;
  } else {
    isWindowFocused = true;
    await checkCurrentTab();
  }
});

// Idle state changed listener (pauses tracking when away from computer)
if (chrome.idle) {
  chrome.idle.setDetectionInterval(60); // 60 seconds
  chrome.idle.onStateChanged.addListener(async (newState) => {
    await flushTime();
    isUserActive = (newState === 'active');
  });
}

// Alarms: Heartbeat every 30 seconds to persist time continuously
chrome.alarms.create('m2028_tracker_flush', { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'm2028_tracker_flush') {
    await flushTime();
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
  }
});

// Keyboard Commands handler
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open_full_planner') {
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
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
        const url = chrome.runtime.getURL('index.html');
        chrome.tabs.create({ url: url });
        sendResponse({ success: true });
        break;
      }

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  })();
  return true; // Keep message channel open for async response
});

// Initial boot check
checkCurrentTab();
