/**
 * M2028 Chrome Extension Content Script
 * Bridges M2028 Web App (localhost, 127.0.0.1, GitHub Pages) and Extension Storage
 * Enables real-time bi-directional Pomodoro & Data Synchronization for Guest and Logged-in users.
 */

(function () {
  'use strict';

  // Injected again after install/update? Only the first live copy runs.
  try { if (window.__m2028CS && chrome.runtime && chrome.runtime.id) return; } catch (e) {}
  window.__m2028CS = true;

  // Lets the website know the extension is installed (used by the "Open Hub" widget)
  try { document.documentElement.setAttribute('data-m2028-ext', '1'); } catch (e) {}

  const mirrorSigs = {};
  let lastNotes = null; // last notes text passed between page and extension (stops echo loops)

  // The extension only needs the access token. The website's refresh token stays in the website, so nothing
  // else can ever use it up and sign the website out.
  function safeSession(s) {
    const c = Object.assign({}, s);
    delete c.refresh_token;
    return c;
  }
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
      if (event.data.key === 'hubNotes') {
        if (event.data.value === lastNotes) return;
        lastNotes = event.data.value;
      }
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const obj = {};
        obj[event.data.key] = event.data.value;
        obj['m_' + event.data.key] = event.data.value;
        if (event.data.key === 'hubNotes') obj['m_hubNotesTs'] = Date.now();
        chrome.storage.local.set(obj);
      }
    } else if (event.data.type === 'OPEN_EXT_HUB') {
      // Website widget -> open the extension hub (popup.html) in a tab on the requested section
      const allowed = ['time', 'habits', 'tasks', 'pomo', 'countdown', 'notes', 'search', 'block'];
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

      // Notes written in the extension popup -> show them on the open website right away
      if (changes.m_hubNotes || changes.hubNotes) {
        const nv = (changes.m_hubNotes && changes.m_hubNotes.newValue !== undefined) ? changes.m_hubNotes.newValue : (changes.hubNotes && changes.hubNotes.newValue);
        if (typeof nv === 'string' && nv !== lastNotes) {
          lastNotes = nv;
          window.postMessage({ from: 'M2028_EXT', type: 'NOTES_UPDATE', value: nv }, '*');
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

    chrome.storage.local.get(['pom_state', 'm_pomLive', 'm_pomSessions', 'm_pd', 'm_hubNotes', 'm_hubNotesTs'], function (res) {
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

      // Notes: whichever side was edited last wins when the website opens
      try {
        const rawN = window.localStorage.getItem('m_hubNotes');
        let pageNotes = null;
        try { pageNotes = rawN === null ? null : JSON.parse(rawN); } catch (e) {}
        let pageTs = 0;
        try { pageTs = (JSON.parse(window.localStorage.getItem('m_sync_ts') || '{}') || {}).hubNotes || 0; } catch (e) {}
        const extNotes = res.m_hubNotes;
        const extTs = res.m_hubNotesTs || 0;
        if (typeof extNotes === 'string' && extNotes !== pageNotes && (typeof pageNotes !== 'string' || pageNotes === '' || extTs > pageTs)) {
          lastNotes = extNotes;
          window.postMessage({ from: 'M2028_EXT', type: 'NOTES_UPDATE', value: extNotes }, '*');
        } else if (typeof pageNotes === 'string' && pageNotes !== '' && pageNotes !== extNotes) {
          lastNotes = pageNotes;
          chrome.storage.local.set({ m_hubNotes: pageNotes, hubNotes: pageNotes, m_hubNotesTs: pageTs || Date.now() });
        }
      } catch (e) {}

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
              syncObj.m_authSession = safeSession(sess);
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


  // 6. Block websites & usage limits  <->  website "Block" tab
  //    Page -> extension : { from:'M2028_PAGE', type:'BLOCK_UPDATE', limits, blocklist, redirects }
  //    Page -> extension : { from:'M2028_PAGE', type:'BLOCK_REQUEST' }  (ask for the current state)
  //    Extension -> page : { from:'M2028_EXT',  type:'BLOCK_UPDATE', limits, blocklist, redirects, usage }
  const BLOCK_KEYS = ['m2028_limits', 'm2028_blocklist', 'm2028_redirect_settings', 'm2028_lock'];
  const BLOCK_MAX = 10;
  const DEF_LIMIT_REDIRECT = 'https://en.wikipedia.org/wiki/Special:Random';
  const DEF_BLOCK_REDIRECT = 'https://theuselessweb.com';
  let lastBlockSig = '';
  let lastUsagePush = 0;

  function cleanTarget(t) {
    t = String(t || '').trim().toLowerCase();
    if (t.indexOf('category:') === 0) return /^category:[a-z]+$/.test(t) ? t : '';
    if (t.indexOf('://') > -1) { try { t = new URL(t).hostname; } catch (e) { return ''; } }
    if (t.indexOf('www.') === 0) t = t.slice(4);
    return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(t) ? t : '';
  }
  function cleanUrl(u, fallback) {
    try {
      const x = new URL(String(u || '').trim());
      if (x.protocol === 'http:' || x.protocol === 'https:') return x.href;
    } catch (e) {}
    return fallback;
  }
  function cleanBlockPayload(p) {
    const seen = {};
    const limits = [];
    (Array.isArray(p.limits) ? p.limits : []).forEach(function (l) {
      const t = cleanTarget(l && l.target);
      const m = Math.round(Number(l && l.minutes));
      if (t && m > 0 && m <= 1440 && !seen[t] && limits.length < BLOCK_MAX) { seen[t] = 1; limits.push({ target: t, minutes: m }); }
    });
    const seenB = {};
    const blocklist = [];
    (Array.isArray(p.blocklist) ? p.blocklist : []).forEach(function (b) {
      const t = cleanTarget(b && b.target);
      if (t && !seenB[t] && blocklist.length < BLOCK_MAX) { seenB[t] = 1; blocklist.push({ target: t }); }
    });
    const r = p.redirects || {};
    return {
      limits: limits,
      blocklist: blocklist,
      redirects: {
        limitRedirectUrl: cleanUrl(r.limitRedirectUrl, DEF_LIMIT_REDIRECT),
        blockRedirectUrl: cleanUrl(r.blockRedirectUrl, DEF_BLOCK_REDIRECT)
      }
    };
  }
  function localDayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function readBlockState(cb) {
    chrome.storage.local.get(BLOCK_KEYS.concat(['m2028_limit_usage']), function (res) {
      cb({
        limits: res.m2028_limits || [],
        blocklist: res.m2028_blocklist || [],
        redirects: res.m2028_redirect_settings || {},
        lock: res.m2028_lock || null,
        usage: res.m2028_limit_usage || {}
      });
    });
  }
  function pushBlockToPage(skipIfSame) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    readBlockState(function (s) {
      const sig = JSON.stringify([s.limits, s.blocklist, s.redirects, s.lock]);
      if (skipIfSame && sig === lastBlockSig) return;
      lastBlockSig = sig;
      window.postMessage({ from: 'M2028_EXT', type: 'BLOCK_UPDATE', limits: s.limits, blocklist: s.blocklist, redirects: s.redirects, lock: s.lock, usage: s.usage }, '*');
    });
  }

  window.addEventListener('message', function (event) {
    if (!event.data || event.data.from !== 'M2028_PAGE') return;
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    if (event.data.type === 'BLOCK_REQUEST') {
      pushBlockToPage(false);
    } else if (event.data.type === 'BLOCK_UPDATE') {
      // Adds and tightenings are accepted; the background script puts back anything loosened or removed.
      const clean = cleanBlockPayload(event.data);
      chrome.storage.local.set({
        m2028_limits: clean.limits,
        m2028_blocklist: clean.blocklist,
        m2028_redirect_settings: clean.redirects
      }, function () { setTimeout(function () { pushBlockToPage(false); }, 400); });
    } else if (event.data.type === 'BLOCK_LOCK') {
      // Removal / raise / cancel requests are handled (and delayed) by the background script
      try {
        chrome.runtime.sendMessage({
          type: 'LOCK_REQUEST',
          op: String(event.data.op || ''),
          kind: event.data.kind === 'limit' ? 'limit' : 'block',
          target: String(event.data.target || ''),
          minutes: Number(event.data.minutes) || 0
        }, function () { void chrome.runtime.lastError; setTimeout(function () { pushBlockToPage(false); }, 300); });
      } catch (e) {}
    }
  });

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName !== 'local') return;
      if (BLOCK_KEYS.some(function (k) { return changes[k]; })) {
        pushBlockToPage(true); // changed from the popup / options page / lock engine
      } else if (changes.m2028_limit_usage && Date.now() - lastUsagePush > 15000) {
        lastUsagePush = Date.now();
        pushBlockToPage(false); // refresh today's usage numbers
      }
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
              sendResponse({ success: true, session: safeSession(sess) });
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
  const MIRROR_JSON = ['hd', 'habs', 'bestSt', 'theme', 'customColors', 'tasks', 'pd', 'plog', 'pomSessions', 'pomSubjects', 'cd', 'customWidgets', 'dashCfg'];
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
            if (sess && sess.access_token && sess.user) { setObj.m_authSession = safeSession(sess); setTimeout(announce, 400); }
          } catch (e) {}
        }
      }

      if (Object.keys(setObj).length) chrome.storage.local.set(setObj);
      if (rmKeys.length) chrome.storage.local.remove(rmKeys);
    };

    mirrorFirstRun = false;
    if (first) {
      chrome.storage.local.get(['m_hd', 'hd', 'm_habs', 'habs', 'm_bestSt', 'bestSt', 'm_theme', 'theme', 'm_customColors', 'customColors', 'm_tasks', 'tasks', 'm_pd', 'pd', 'm_plog', 'plog', 'm_pomSessions', 'pomSessions', 'm_pomSubjects', 'pomSubjects', 'm_cd', 'cd', 'm_customWidgets', 'customWidgets', 'm_dashCfg', 'dashCfg'], run);
    } else {
      run(null);
    }
  }


  // 7. Handshake, full data mirror, and edits made inside the extension -> website
  //    Page -> extension : { from:'M2028_PAGE', type:'EXT_PING' }
  //    Extension -> page : { from:'M2028_EXT',  type:'EXT_READY', version, loggedIn }
  //    Extension -> page : { from:'M2028_EXT',  type:'EXT_DATA', key, value }   (edits made in the popup)
  const BRIDGE_KEYS = ['habs', 'hd', 'tasks', 'pd', 'plog', 'bestSt', 'pomSessions', 'pomSubjects', 'cd', 'customWidgets', 'dashCfg'];
  const FWD_ALWAYS = ['tasks', 'pomSubjects'];                                   // the website never sends these through the cloud
  const FWD_UNSYNCED = ['habs', 'hd', 'cd', 'customWidgets', 'pd', 'pomSessions']; // only forwarded when the cloud is not carrying them

  function storageOK() { return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local; }
  function pageHasSession() { try { return !!window.localStorage.getItem('sb-lvzcctsqcpikisdzztot-auth-token'); } catch (e) { return false; } }

  function announce() {
    if (!storageOK()) return;
    chrome.storage.local.get(['m_authSession'], function (r) {
      const s = r && r.m_authSession;
      let version = '';
      try { version = chrome.runtime.getManifest().version; } catch (e) {}
      window.postMessage({ from: 'M2028_EXT', type: 'EXT_READY', version: version, loggedIn: !!(s && s.access_token && s.user) }, '*');
    });
  }

  // The website is the source of truth at handshake time; if it has nothing for a key the extension still has, send that over.
  function fullMirror() {
    if (!storageOK()) return;
    const want = ['m_authSession'];
    BRIDGE_KEYS.forEach(function (k) { want.push('m_' + k, k, 'm_' + k + '_ets'); });
    chrome.storage.local.get(want, function (res) {
      const setObj = {};
      let pageTs = {};
      try { pageTs = JSON.parse(window.localStorage.getItem('m_sync_ts') || '{}') || {}; } catch (e) {}
      const extAuthed = !!(res.m_authSession && res.m_authSession.access_token);
      const pageAuthed = pageHasSession();
      BRIDGE_KEYS.forEach(function (k) {
        // An edit made in the extension while the website was closed is newer than the website's copy: send it over instead of overwriting it.
        const extEdited = res['m_' + k + '_ets'] || 0;
        const forwardable = FWD_ALWAYS.indexOf(k) > -1 || (FWD_UNSYNCED.indexOf(k) > -1 && !(extAuthed && pageAuthed));
        const extNow = res['m_' + k] !== undefined ? res['m_' + k] : res[k];
        if (forwardable && extEdited && extEdited > (pageTs[k] || 0) && extNow !== undefined) {
          let r0 = null;
          try { r0 = window.localStorage.getItem('m_' + k); } catch (e) {}
          if (r0 !== JSON.stringify(extNow)) {
            window.postMessage({ from: 'M2028_EXT', type: 'EXT_DATA', key: k, value: extNow }, '*');
            return;
          }
        }
        let raw = null;
        try { raw = window.localStorage.getItem('m_' + k); } catch (e) {}
        const extVal = res['m_' + k] !== undefined ? res['m_' + k] : res[k];
        if (raw !== null && raw !== 'null') {
          try {
            const v = JSON.parse(raw);
            if (JSON.stringify(v) !== JSON.stringify(extVal)) { setObj[k] = v; setObj['m_' + k] = v; }
            mirrorSigs[k] = raw;
          } catch (e) {}
        } else if (FWD_ALWAYS.indexOf(k) > -1 && Array.isArray(extVal) && extVal.length) {
          window.postMessage({ from: 'M2028_EXT', type: 'EXT_DATA', key: k, value: extVal }, '*');
        }
      });
      if (Object.keys(setObj).length) chrome.storage.local.set(setObj);
    });
  }

  window.addEventListener('message', function (event) {
    if (!event.data || event.data.from !== 'M2028_PAGE' || event.data.type !== 'EXT_PING') return;
    if (!storageOK()) return;
    fullMirror();
    announce();
    pushBlockToPage(false);
  });

  if (storageOK() && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return;
      const cand = [];
      Object.keys(changes).forEach(function (name) {
        const k = name.replace(/^m_/, '');
        if ((FWD_ALWAYS.indexOf(k) > -1 || FWD_UNSYNCED.indexOf(k) > -1) && cand.indexOf(k) < 0) cand.push(k);
      });
      if (!cand.length) return;
      const want = ['m_authSession'];
      cand.forEach(function (k) { want.push('m_' + k, k); });
      chrome.storage.local.get(want, function (res) {
        const extAuthed = !!(res.m_authSession && res.m_authSession.access_token);
        const pageAuthed = pageHasSession();
        cand.forEach(function (k) {
          if (FWD_UNSYNCED.indexOf(k) > -1 && extAuthed && pageAuthed) return; // the cloud carries it
          const v = res['m_' + k] !== undefined ? res['m_' + k] : res[k];
          if (v === undefined) return;
          let pageRaw = null;
          try { pageRaw = window.localStorage.getItem('m_' + k); } catch (e) {}
          const extRaw = JSON.stringify(v);
          if (pageRaw === extRaw) return;
          try { if (pageRaw !== null && JSON.stringify(JSON.parse(pageRaw)) === extRaw) return; } catch (e) {}
          window.postMessage({ from: 'M2028_EXT', type: 'EXT_DATA', key: k, value: v }, '*');
        });
      });
    });
  }

  // announce on load (and again once the website has restored its login)
  setTimeout(function () { fullMirror(); announce(); }, 500);
  setTimeout(function () { fullMirror(); announce(); }, 2500);

  setInterval(mirrorFromPage, 2000);
  mirrorFromPage();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialSync);
  } else {
    initialSync();
  }
})();

