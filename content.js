/**
 * M2028 Chrome Extension Content Script
 * Bridges M2028 Web App (localhost, 127.0.0.1, GitHub Pages) and Extension Storage
 * Enables real-time bi-directional Pomodoro & Data Synchronization for Guest and Logged-in users.
 */

(function () {
  'use strict';

  let lastAppliedExtTs = 0;
  let lastSentPageTs = 0;

  // 1. Listen for Pomodoro & Data updates dispatched by M2028 web page
  window.addEventListener('message', function (event) {
    if (!event.data || event.data.from !== 'M2028_PAGE') return;

    if (event.data.type === 'POMO_UPDATE' && event.data.state) {
      const st = event.data.state;
      const ts = st.u || Date.now();
      if (ts <= lastAppliedExtTs) return;
      lastSentPageTs = ts;

      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          pom_state: st,
          m_pomLive: st
        });
        chrome.runtime.sendMessage({
          type: 'POMO_STATE_CHANGED',
          state: st,
          origin: 'web_page'
        }).catch(() => {});
      }
    } else if (event.data.type === 'DATA_UPDATE' && event.data.key && event.data.value !== undefined) {
      // Sync other M2028 keys (habits, tasks, pd, pomSessions)
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const obj = {};
        obj[event.data.key] = event.data.value;
        obj['m_' + event.data.key] = event.data.value;
        chrome.storage.local.set(obj);
      }
    }
  });

  // 2. Listen for Extension storage changes and push them into the Web Page
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName !== 'local') return;

      // Pomodoro state change
      if (changes.pom_state || changes.m_pomLive) {
        const newSt = (changes.pom_state && changes.pom_state.newValue) ||
                      (changes.m_pomLive && changes.m_pomLive.newValue);

        if (newSt) {
          const ts = newSt.u || 0;
          if (ts <= lastSentPageTs) return;
          lastAppliedExtTs = ts;

          try {
            window.localStorage.setItem('pom_state', JSON.stringify(newSt));
            window.localStorage.setItem('m_pomLive', JSON.stringify(newSt));
          } catch (e) {}

          window.postMessage({
            from: 'M2028_EXT',
            type: 'POMO_UPDATE',
            state: newSt
          }, '*');
        }
      }

      // Pomodoro Sessions log change
      if (changes.m_pomSessions || changes.pomSessions) {
        const sessions = (changes.m_pomSessions && changes.m_pomSessions.newValue) ||
                         (changes.pomSessions && changes.pomSessions.newValue);
        if (sessions) {
          try {
            window.localStorage.setItem('m_pomSessions', JSON.stringify(sessions));
          } catch (e) {}
          window.postMessage({
            from: 'M2028_EXT',
            type: 'SESSIONS_UPDATE',
            sessions: sessions
          }, '*');
        }
      }

      // Daily session counts change
      if (changes.m_pd || changes.pd) {
        const pd = (changes.m_pd && changes.m_pd.newValue) ||
                   (changes.pd && changes.pd.newValue);
        if (pd) {
          try {
            window.localStorage.setItem('m_pd', JSON.stringify(pd));
          } catch (e) {}
          window.postMessage({
            from: 'M2028_EXT',
            type: 'PD_UPDATE',
            pd: pd
          }, '*');
        }
      }

      // Habits & Tasks live sync
      if (changes.m_habs || changes.habs) {
        const habs = (changes.m_habs && changes.m_habs.newValue) || (changes.habs && changes.habs.newValue);
        if (habs) {
          try { window.localStorage.setItem('m_habs', JSON.stringify(habs)); } catch (e) {}
          window.postMessage({ from: 'M2028_EXT', type: 'REFRESH_SECTION', section: 'habits' }, '*');
        }
      }
      if (changes.m_hd || changes.hd) {
        const hd = (changes.m_hd && changes.m_hd.newValue) || (changes.hd && changes.hd.newValue);
        if (hd) {
          try { window.localStorage.setItem('m_hd', JSON.stringify(hd)); } catch (e) {}
          window.postMessage({ from: 'M2028_EXT', type: 'REFRESH_SECTION', section: 'habits' }, '*');
        }
      }
      if (changes.m_tasks || changes.tasks) {
        const tasks = (changes.m_tasks && changes.m_tasks.newValue) || (changes.tasks && changes.tasks.newValue);
        if (tasks) {
          try { window.localStorage.setItem('m_tasks', JSON.stringify(tasks)); } catch (e) {}
          window.postMessage({ from: 'M2028_EXT', type: 'REFRESH_SECTION', section: 'tasks' }, '*');
        }
      }
      if (changes.m_profilePic || changes.profilePic) {
        const pic = (changes.m_profilePic && changes.m_profilePic.newValue) || (changes.profilePic && changes.profilePic.newValue);
        if (pic) {
          try {
            window.localStorage.setItem('m_profilePic', JSON.stringify(pic));
            window.localStorage.setItem('profilePic', JSON.stringify(pic));
          } catch (e) {}
          window.postMessage({ from: 'M2028_EXT', type: 'REFRESH_PROFILE' }, '*');
        }
      }
    });
  }

  // 3. Initial Boot Sync between Extension and Web App
  function initialSync() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;

    chrome.storage.local.get(['pom_state', 'm_pomLive', 'm_pomSessions', 'm_pd'], function (res) {
      let pageSt = null;
      try {
        const raw = window.localStorage.getItem('pom_state') || window.localStorage.getItem('m_pomLive');
        if (raw) pageSt = JSON.parse(raw);
      } catch (e) {}

      const extSt = res.pom_state || res.m_pomLive;

      if (extSt && (!pageSt || (extSt.u || 0) > (pageSt.u || 0))) {
        // Extension state is newer or running
        try {
          window.localStorage.setItem('pom_state', JSON.stringify(extSt));
          window.localStorage.setItem('m_pomLive', JSON.stringify(extSt));
        } catch (e) {}
        window.postMessage({
          from: 'M2028_EXT',
          type: 'POMO_UPDATE',
          state: extSt
        }, '*');
      } else if (pageSt && (!extSt || (pageSt.u || 0) > (extSt.u || 0))) {
        // Page state is newer
        chrome.storage.local.set({
          pom_state: pageSt,
          m_pomLive: pageSt
        });
        chrome.runtime.sendMessage({
          type: 'POMO_STATE_CHANGED',
          state: pageSt,
          origin: 'web_page_boot'
        }).catch(() => {});
      }

      // Sync sessions & pd if present
      if (res.m_pomSessions && !window.localStorage.getItem('m_pomSessions')) {
        try { window.localStorage.setItem('m_pomSessions', JSON.stringify(res.m_pomSessions)); } catch (e) {}
      }
      if (res.m_pd && !window.localStorage.getItem('m_pd')) {
        try { window.localStorage.setItem('m_pd', JSON.stringify(res.m_pd)); } catch (e) {}
      }

      // Sync theme & customColors from page to extension storage
      try {
        const themeRaw = window.localStorage.getItem('m_theme') || window.localStorage.getItem('theme');
        const customRaw = window.localStorage.getItem('m_customColors') || window.localStorage.getItem('customColors');
        const syncObj = {};
        if (themeRaw) {
          const t = JSON.parse(themeRaw);
          syncObj.theme = t;
          syncObj.m_theme = t;
        }
        if (customRaw) {
          const cc = JSON.parse(customRaw);
          syncObj.customColors = cc;
          syncObj.m_customColors = cc;
        }
        // Sync wallpaper & wpDim from page
        const wp = window.localStorage.getItem('m_wallpaper') || window.localStorage.getItem('wallpaper');
        if (wp) {
          syncObj.wallpaper = wp;
          syncObj.m_wallpaper = wp;
        }
        const wpDim = window.localStorage.getItem('m_wpDim') || window.localStorage.getItem('wpDim');
        if (wpDim) {
          syncObj.wpDim = wpDim;
          syncObj.m_wpDim = wpDim;
        }

        // Sync pomSubjects from page
        const pSubs = window.localStorage.getItem('m_pomSubjects') || window.localStorage.getItem('pomSubjects');
        if (pSubs) {
          try {
            const parsedSubs = JSON.parse(pSubs);
            if (Array.isArray(parsedSubs)) {
              syncObj.pomSubjects = parsedSubs;
              syncObj.m_pomSubjects = parsedSubs;
            }
          } catch (e) {}
        }

        // Also check profile photo / app logo
        const picRaw = window.localStorage.getItem('m_profilePic') || window.localStorage.getItem('profilePic');
        if (picRaw) {
          try {
            const p = JSON.parse(picRaw);
            syncObj.profilePic = p;
            syncObj.m_profilePic = p;
          } catch (e) {}
        }
        // Also check if user is logged into Supabase on web app
        const supaTok = window.localStorage.getItem('sb-lvzcctsqcpikisdzztot-auth-token');
        if (supaTok) {
          try {
            const sess = JSON.parse(supaTok);
            if (sess && sess.access_token && sess.user) {
              syncObj.m_authSession = sess;
            }
          } catch (e) {}
        }
        if (Object.keys(syncObj).length > 0) {
          chrome.storage.local.set(syncObj);
        }
      } catch (e) {}
    });
  }

  // 4. Listen for tab auth queries from extension popup
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
      if (request.type === 'GET_M2028_TAB_AUTH') {
        try {
          const supaTok = window.localStorage.getItem('sb-lvzcctsqcpikisdzztot-auth-token');
          if (supaTok) {
            const sess = JSON.parse(supaTok);
            if (sess && sess.access_token && sess.user) {
              sendResponse({ success: true, session: sess });
              return true;
            }
          }
        } catch (e) {}
        sendResponse({ success: false, error: 'No active session found in web tab' });
        return true;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialSync);
  } else {
    initialSync();
  }
})();

