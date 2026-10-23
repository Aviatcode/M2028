/**
 * M2028 Chrome Extension Content Script
 * Bridges M2028 Web App (localhost, 127.0.0.1, GitHub Pages) and Extension Storage
 * Enables real-time bi-directional Pomodoro & Data Synchronization for Guest and Logged-in users.
 */

(function () {
  'use strict';

  // Lets the website know the extension is installed (used by the "Open Hub" widget)
  try { document.documentElement.setAttribute('data-m2028-ext', '1'); } catch (e) {}

  const mirrorSigs = {};
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
    } else if (event.data.type === 'OPEN_EXT_HUB') {
      // Website widget -> open the extension hub (popup.html) in a tab on the requested section
      const allowed = ['time', 'habits', 'tasks', 'pomo', 'countdown', 'notes', 'search'];
      const tab = allowed.indexOf(event.data.tab) >= 0 ? event.data.tab : 'time';
      try {
        window.open(chrome.runtime.getURL('popup.html?tab=' + tab), '_blank');
      } catch (e) {}
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

      // NOTE: lists (habits, habit ticks, tasks, session log, daily counts) are deliberately NOT written into the
      // website from here. The website merges them itself from the cloud, by timestamp. Writing the extension's
      // copy straight into the page's storage is what brought old items back.

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
      if (changes.m_stickers || changes.stickers) {
        const stk = (changes.m_stickers && changes.m_stickers.newValue !== undefined) ? changes.m_stickers.newValue : (changes.stickers && changes.stickers.newValue);
        if (stk !== undefined) {
          try {
            window.localStorage.setItem('m_stickers', JSON.stringify(stk));
            window.localStorage.setItem('stickers', JSON.stringify(stk));
            document.body.classList.toggle('no-stickers', stk === false);
          } catch (e) {}
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
        // Also check stickers setting
        const stkRaw = window.localStorage.getItem('m_stickers') || window.localStorage.getItem('stickers');
        if (stkRaw !== null) {
          try {
            const stk = JSON.parse(stkRaw);
            syncObj.stickers = stk;
            syncObj.m_stickers = stk;
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
      if (request.type === 'GET_M2028_PAGE_DATA') {
        const out = {};
        ['hd', 'habs', 'bestSt'].forEach(function (k) {
          try {
            const raw = window.localStorage.getItem('m_' + k);
            if (raw !== null) out[k] = JSON.parse(raw);
          } catch (e) {}
        });
        let wpLen = 0;
        try { wpLen = (window.localStorage.getItem('m_wallpaper') || '').length; } catch (e) {}
        sendResponse({ success: true, data: out, wallpaperLen: wpLen });
        return true;
      }
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

  // 5. Mirror website-side changes into extension storage while a website tab is open.
  //    (The website writes wallpaper / theme straight to localStorage and never announces it, so poll for changes.)
  const MIRROR_JSON = ['hd', 'habs', 'bestSt', 'theme', 'customColors'];
  const MIRROR_RAW = ['wallpaper', 'wpDim'];
  const SUPA_TOKEN_KEY = 'sb-lvzcctsqcpikisdzztot-auth-token';
  let mirrorFirstRun = true;

  function readPage(key) {
    try { return window.localStorage.getItem('m_' + key); } catch (e) { return null; }
  }

  function mirrorFromPage() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    const first = mirrorFirstRun;
    const run = function (existing) {
      const setObj = {};
      const rmKeys = [];

      MIRROR_JSON.forEach(function (k) {
        const raw = readPage(k);
        if (raw === null) return;
        const missingInExt = first && existing && existing['m_' + k] === undefined && existing[k] === undefined;
        const changed = !first && raw !== mirrorSigs[k];
        mirrorSigs[k] = raw;
        if (!changed && !missingInExt) return;
        try {
          const v = JSON.parse(raw);
          setObj[k] = v;
          setObj['m_' + k] = v;
        } catch (e) {}
      });

      MIRROR_RAW.forEach(function (k) {
        const raw = readPage(k);
        const prev = mirrorSigs[k];
        mirrorSigs[k] = raw;
        if (first || raw === prev) return;
        if (raw === null) {
          rmKeys.push(k, 'm_' + k);
        } else {
          setObj[k] = raw;
          setObj['m_' + k] = raw;
        }
      });

      // Keep the extension's login token as fresh as the website's (the website refreshes it hourly)
      let tokRaw = null;
      try { tokRaw = window.localStorage.getItem(SUPA_TOKEN_KEY); } catch (e) {}
      if (tokRaw) {
        const prevTok = mirrorSigs.__tok;
        mirrorSigs.__tok = tokRaw;
        if (!first && tokRaw !== prevTok) {
          try {
            const sess = JSON.parse(tokRaw);
            if (sess && sess.access_token && sess.user) setObj.m_authSession = sess;
          } catch (e) {}
        }
      }

      if (Object.keys(setObj).length) chrome.storage.local.set(setObj);
      if (rmKeys.length) chrome.storage.local.remove(rmKeys);
    };

    mirrorFirstRun = false;
    if (first) {
      chrome.storage.local.get(['m_hd', 'hd', 'm_habs', 'habs', 'm_bestSt', 'bestSt', 'm_theme', 'theme', 'm_customColors', 'customColors'], run);
    } else {
      run(null);
    }
  }

  setInterval(mirrorFromPage, 2000);
  mirrorFromPage();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialSync);
  } else {
    initialSync();
  }
})();

