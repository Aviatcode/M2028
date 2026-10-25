/**
 * M2028 Block tab UI (shared by the extension popup and the website).
 * Both pages mount it with a small "transport" that moves data to/from the extension.
 * Everything that is added becomes locked by background.js: removing or loosening needs a
 * request that only takes effect after the cooling-off period.
 */
(function (global) {
  'use strict';

  var MAX = 10;
  var COOLOFF_H = 72;
  var PHRASE = 'I want to remove this';
  var CATS = [
    { key: 'adult', icon: '🔞', name: 'Adult content', desc: 'Every known adult site, plus any site with adult keywords in its address' },
    { key: 'gambling', icon: '🎰', name: 'Gambling', desc: 'Betting, casino, poker and fantasy-cash sites' },
    { key: 'social', icon: '📱', name: 'Social media', desc: 'Instagram, X, Reddit, TikTok, Snapchat and more' },
    { key: 'entertainment', icon: '🎬', name: 'Entertainment & video', desc: 'YouTube, Netflix, Twitch and other streaming' },
    { key: 'communication', icon: '💬', name: 'Chat & messaging', desc: 'WhatsApp, Telegram, Discord and more' }
  ];
  var PRESETS = [15, 30, 60, 120];

  var CSS = '' +
    '.mbk{font-size:13px;line-height:1.4}.mbk *{box-sizing:border-box}' +
    '.mbk-note{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:12px;background:var(--a2,rgba(79,216,160,.12));border:1px solid var(--ai,#4fd8a0);margin-bottom:12px}' +
    '.mbk-note .i{font-size:18px;line-height:1}.mbk-note b{display:block;margin-bottom:2px}' +
    '.mbk-confirm{padding:12px 14px;border-radius:12px;border:1px solid var(--bd,#e8965a);background:rgba(232,150,90,.12);margin-bottom:12px}' +
    '.mbk-confirm p{margin:0 0 8px}.mbk-confirm .f{display:flex;gap:6px;flex-wrap:wrap}' +
    '.mbk-card{border:1px solid var(--b,rgba(128,128,128,.28));border-radius:14px;padding:14px;margin-bottom:12px}' +
    '.mbk-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:2px}' +
    '.mbk-h h3{font-size:14px;font-weight:700;margin:0}.mbk-cnt{font-size:11px;color:var(--m2,#8a8f98)}' +
    '.mbk-sub{font-size:11.5px;color:var(--m2,#8a8f98);margin:0 0 10px}' +
    '.mbk-cats{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}' +
    '.mbk-cat{border:1px solid var(--b,rgba(128,128,128,.28));border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px;background:var(--s2,rgba(128,128,128,.08))}' +
    '.mbk-cat.on{border-color:var(--ai,#4fd8a0);background:var(--a2,rgba(79,216,160,.12))}' +
    '.mbk-cat .t{font-weight:700}.mbk-cat .d{font-size:11px;color:var(--m2,#8a8f98);flex:1}' +
    '.mbk-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--b,rgba(128,128,128,.28))}' +
    '.mbk-row .m{flex:1;min-width:0}.mbk-row .n{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.mbk-row .s{font-size:11px;color:var(--m2,#8a8f98);margin-top:2px}' +
    '.mbk-row .a{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}' +
    '.mbk-bar{height:5px;border-radius:3px;background:rgba(128,128,128,.22);margin-top:6px;overflow:hidden}' +
    '.mbk-bar i{display:block;height:100%;border-radius:3px;background:var(--ai,#4fd8a0)}' +
    '.mbk-bar i.hot{background:var(--bd,#e8965a)}.mbk-bar i.full{background:var(--rd,#e86060)}' +
    '.mbk-form{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}' +
    '.mbk-in{flex:1;min-width:110px;padding:8px 10px;border-radius:9px;border:1px solid var(--b,rgba(128,128,128,.28));background:var(--s2,rgba(128,128,128,.08));color:inherit;font:inherit}' +
    '.mbk-in.sm{flex:0 0 108px;min-width:0}' +
    '.mbk-btn{padding:8px 13px;border-radius:9px;border:1px solid var(--b,rgba(128,128,128,.28));background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer}' +
    '.mbk-btn.p{background:var(--ai,#4fd8a0);border-color:var(--ai,#4fd8a0);color:#04281c}' +
    '.mbk-btn.s{font-size:11.5px;padding:5px 9px;font-weight:500;color:var(--m2,#8a8f98)}' +
    '.mbk-chip{display:inline-block;font-size:10.5px;padding:2px 8px;border-radius:10px;font-weight:600;background:var(--a2,rgba(79,216,160,.14));color:var(--ai,#4fd8a0)}' +
    '.mbk-chip.w{background:rgba(232,150,90,.16);color:var(--bd,#e8965a)}' +
    '.mbk-pre{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}' +
    '.mbk-pre button{padding:4px 10px;border-radius:14px;border:1px solid var(--b,rgba(128,128,128,.28));background:transparent;color:inherit;font:inherit;font-size:11.5px;cursor:pointer}' +
    '.mbk-empty{font-size:12px;color:var(--mt,#8a8f98);padding:8px 0}' +
    '.mbk-msg{padding:16px;border-radius:12px;border:1px solid var(--b,rgba(128,128,128,.28));color:var(--m2,#8a8f98)}';

  function injectStyle() {
    if (document.getElementById('mbk-style')) return;
    var s = document.createElement('style');
    s.id = 'mbk-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function label(t) {
    if (String(t).indexOf('category:') === 0) {
      for (var i = 0; i < CATS.length; i++) if ('category:' + CATS[i].key === t) return CATS[i].icon + ' ' + CATS[i].name;
    }
    return t;
  }
  function fmtLeft(ms) {
    if (ms <= 0) return 'any moment';
    var m = Math.ceil(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + (m % 60) + 'm';
    return (m % 60) + 'm';
  }
  function normDomain(raw) {
    var d = String(raw || '').trim().toLowerCase();
    try { if (d.indexOf('://') > -1) d = new URL(d).hostname; } catch (e) {}
    if (d.indexOf('www.') === 0) d = d.slice(4);
    return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(d) ? d : '';
  }

  function mount(root, transport, opts) {
    opts = opts || {};
    injectStyle();
    var state = { limits: [], blocklist: [], redirects: {}, lock: null, usage: {} };
    var ready = false;
    var ui = { confirm: null };

    function entry(kind, target) {
      var E = state.lock && state.lock.entries;
      return E ? E[kind + ':' + target] || null : null;
    }
    function reqInfo(e) {
      if (!e || !e.req) return null;
      var at = (e.req.requestedAt || 0) + COOLOFF_H * 3600000;
      return { op: e.req.op, minutes: e.req.minutes, left: at - Date.now() };
    }
    function hasLockedItems() {
      var E = state.lock && state.lock.entries;
      return !!E && Object.keys(E).length > 0;
    }
    function isBlocked(t) { return state.blocklist.some(function (b) { return b.target === t; }); }
    function saveLists() { transport.saveLists({ limits: state.limits, blocklist: state.blocklist, redirects: state.redirects }); }
    function typing() {
      var a = document.activeElement;
      return !!(a && root.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName));
    }

    // ---------- rendering ----------
    function statusChip(e, r) {
      if (!e) return '<span class="mbk-chip w">Locking in…</span>';
      if (r) {
        var txt = r.op === 'raise' ? 'Limit rises in ' : 'Removed in ';
        return '<span class="mbk-chip w">' + txt + fmtLeft(r.left) + '</span>';
      }
      return '<span class="mbk-chip">🔒 Locked</span>';
    }
    function removeBtn(kind, target, e, r) {
      if (!e) return '';
      if (r) return '<button class="mbk-btn s" data-act="cancel" data-kind="' + kind + '" data-target="' + esc(target) + '">Keep it (cancel request)</button>';
      return '<button class="mbk-btn s" data-act="ask-remove" data-kind="' + kind + '" data-target="' + esc(target) + '">Request removal</button>';
    }

    function renderConfirm() {
      var c = ui.confirm;
      if (!c) return '';
      var needPhrase = c.op === 'remove' || c.op === 'raise';
      var html = '<div class="mbk-confirm" id="mbkConfirm"><p>' + c.msg + '</p><div class="f">';
      if (c.op === 'raise') html += '<input id="mbkRaiseMin" class="mbk-in sm" type="number" min="1" max="1440" placeholder="New min/day">';
      if (needPhrase) html += '<input id="mbkPhrase" class="mbk-in" placeholder="Type: ' + PHRASE + '" autocomplete="off">';
      html += '<button class="mbk-btn p" data-act="confirm-yes">' + esc(c.yes) + '</button><button class="mbk-btn" data-act="confirm-no">Cancel</button></div></div>';
      return html;
    }

    function render() {
      if (!root) return;
      if (opts.available && !opts.available()) {
        root.innerHTML = '<div class="mbk"><div class="mbk-msg">' + esc(opts.unavailableMsg || 'Install and enable the M2028 extension to block websites and set daily limits.') + '</div></div>';
        return;
      }
      if (!ready) {
        root.innerHTML = '<div class="mbk"><div class="mbk-msg">Connecting to the extension…</div></div>';
        return;
      }
      var keep = {};
      ['mbkBlockDom', 'mbkLimType', 'mbkLimDom', 'mbkLimCat', 'mbkLimMin'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el && root.contains(el)) keep[id] = el.value;
      });

      var catOpts = CATS.map(function (c) { return '<option value="category:' + c.key + '">' + c.icon + ' ' + c.name + '</option>'; }).join('');
      var cats = CATS.map(function (c) {
        var t = 'category:' + c.key, on = isBlocked(t), e = entry('block', t), r = reqInfo(e);
        return '<div class="mbk-cat' + (on ? ' on' : '') + '"><div class="t">' + c.icon + ' ' + c.name + '</div><div class="d">' + c.desc + '</div>' +
          (on ? '<div>' + statusChip(e, r) + '</div><div>' + removeBtn('block', t, e, r) + '</div>'
              : '<button class="mbk-btn p" data-act="ask-add-cat" data-target="' + t + '">Block all</button>') + '</div>';
      }).join('');

      var sites = state.blocklist.filter(function (b) { return String(b.target).indexOf('category:') !== 0; });
      var siteRows = sites.length ? sites.map(function (b) {
        var e = entry('block', b.target), r = reqInfo(e);
        return '<div class="mbk-row"><div class="m"><div class="n">' + esc(b.target) + '</div></div><div class="a">' + statusChip(e, r) + removeBtn('block', b.target, e, r) + '</div></div>';
      }).join('') : '<div class="mbk-empty">No individual websites blocked yet.</div>';

      var limRows = state.limits.length ? state.limits.map(function (l) {
        var e = entry('limit', l.target), r = reqInfo(e);
        var mins = e && e.minutes ? e.minutes : l.minutes;
        var used = Math.floor((state.usage[l.target] || 0) / 60);
        var pct = Math.min(100, Math.round(used / mins * 100));
        var cls = pct >= 100 ? 'full' : pct >= 75 ? 'hot' : '';
        var raiseBtn = (e && !r) ? '<button class="mbk-btn s" data-act="ask-raise" data-target="' + esc(l.target) + '">Raise limit</button>' : '';
        var sub = used + ' of ' + mins + ' min used today' + (r && r.op === 'raise' ? ' · rises to ' + r.minutes + ' min in ' + fmtLeft(r.left) : '');
        return '<div class="mbk-row"><div class="m"><div class="n">' + esc(label(l.target)) + '</div><div class="s">' + sub + '</div>' +
          '<div class="mbk-bar"><i class="' + cls + '" style="width:' + pct + '%"></i></div></div>' +
          '<div class="a">' + statusChip(e, r) + raiseBtn + removeBtn('limit', l.target, e, r) + '</div></div>';
      }).join('') : '<div class="mbk-empty">No daily limits set yet.</div>';

      var presets = PRESETS.map(function (m) { return '<button data-act="preset" data-min="' + m + '">' + m + ' min</button>'; }).join('');

      var redirect;
      if (hasLockedItems()) {
        redirect = '<div class="mbk-sub" style="margin:0">Redirect pages are locked together with your blocks, so they cannot be pointed somewhere else.</div>';
      } else {
        var r0 = state.redirects || {};
        redirect = '<div class="mbk-sub">You can change these only until your first block or limit is added.</div>' +
          '<div class="mbk-form"><input id="mbkRdLimit" class="mbk-in" type="url" placeholder="After a limit: https://en.wikipedia.org/wiki/Special:Random" value="' + esc(r0.limitRedirectUrl || '') + '"></div>' +
          '<div class="mbk-form"><input id="mbkRdBlock" class="mbk-in" type="url" placeholder="Blocked site: https://theuselessweb.com" value="' + esc(r0.blockRedirectUrl || '') + '">' +
          '<button class="mbk-btn" data-act="save-redirects">Save</button></div>';
      }

      root.innerHTML = '<div class="mbk">' +
        '<div class="mbk-note"><div class="i">🔒</div><div><b>Commitment lock is on</b>Anything you add here stays for at least ' + COOLOFF_H + ' hours. Removing or loosening it needs a request that only takes effect after ' + COOLOFF_H + ' hours, and you can cancel the request at any time.</div></div>' +
        renderConfirm() +
        '<div class="mbk-card"><div class="mbk-h"><h3>Block a whole category</h3></div><p class="mbk-sub">One tap blocks every site in the group, including ones you have never heard of.</p><div class="mbk-cats">' + cats + '</div></div>' +
        '<div class="mbk-card"><div class="mbk-h"><h3>Block a website</h3><span class="mbk-cnt">' + state.blocklist.length + ' / ' + MAX + ' blocks used</span></div><p class="mbk-sub">Subdomains are blocked too.</p>' +
        '<div class="mbk-form"><input id="mbkBlockDom" class="mbk-in" placeholder="e.g. instagram.com" autocomplete="off"><button class="mbk-btn p" data-act="ask-add-block">Block</button></div>' + siteRows + '</div>' +
        '<div class="mbk-card"><div class="mbk-h"><h3>Daily time limits</h3><span class="mbk-cnt">' + state.limits.length + ' / ' + MAX + ' used</span></div><p class="mbk-sub">Once the minutes for the day are used up, the site is blocked until tomorrow.</p>' +
        '<div class="mbk-form"><select id="mbkLimType" class="mbk-in sm"><option value="d">Website</option><option value="c">Category</option></select>' +
        '<input id="mbkLimDom" class="mbk-in" placeholder="e.g. youtube.com" autocomplete="off"><select id="mbkLimCat" class="mbk-in" style="display:none">' + catOpts + '</select></div>' +
        '<div class="mbk-pre">' + presets + '</div>' +
        '<div class="mbk-form"><input id="mbkLimMin" class="mbk-in sm" type="number" min="1" max="1440" placeholder="Min / day"><button class="mbk-btn p" data-act="ask-add-limit">Set limit</button></div>' + limRows + '</div>' +
        '<div class="mbk-card"><div class="mbk-h"><h3>Where blocked pages send you</h3></div>' + redirect + '</div></div>';

      Object.keys(keep).forEach(function (id) { var el = document.getElementById(id); if (el) el.value = keep[id]; });
      var lt = document.getElementById('mbkLimType');
      if (lt) lt.dispatchEvent(new Event('change', { bubbles: true }));
      if (ui.confirm && ui.confirm.fresh) {
        ui.confirm.fresh = false;
        var cf = document.getElementById('mbkConfirm');
        if (cf && cf.scrollIntoView) cf.scrollIntoView({ block: 'nearest' });
      }
    }

    // ---------- actions ----------
    function ask(op, data) {
      ui.confirm = Object.assign({ op: op, fresh: true }, data);
      render();
    }
    function msgAdd(what) {
      return 'Lock in <b>' + esc(what) + '</b>? You will not be able to remove or loosen it for at least ' + COOLOFF_H + ' hours.';
    }

    function onClick(ev) {
      var el = ev.target.closest ? ev.target.closest('[data-act]') : null;
      if (!el || !root.contains(el)) return;
      var act = el.getAttribute('data-act');
      var kind = el.getAttribute('data-kind');
      var target = el.getAttribute('data-target');

      if (act === 'preset') { document.getElementById('mbkLimMin').value = el.getAttribute('data-min'); return; }

      if (act === 'ask-add-cat') {
        if (state.blocklist.length >= MAX) { global.alert('You can have up to ' + MAX + ' blocks.'); return; }
        ask('add-block', { target: target, yes: 'Lock it in', msg: msgAdd('Block all ' + label(target)) });
        return;
      }
      if (act === 'ask-add-block') {
        var d = normDomain(document.getElementById('mbkBlockDom').value);
        if (!d) { global.alert('Enter a valid website, like example.com'); return; }
        if (isBlocked(d)) { global.alert('Already blocked.'); return; }
        if (state.blocklist.length >= MAX) { global.alert('You can have up to ' + MAX + ' blocks.'); return; }
        ask('add-block', { target: d, yes: 'Lock it in', msg: msgAdd('Block ' + d) });
        return;
      }
      if (act === 'ask-add-limit') {
        var isCat = document.getElementById('mbkLimType').value === 'c';
        var t = isCat ? document.getElementById('mbkLimCat').value : normDomain(document.getElementById('mbkLimDom').value);
        var m = Math.round(Number(document.getElementById('mbkLimMin').value));
        if (!t) { global.alert('Enter a valid website, like example.com'); return; }
        if (!m || m < 1 || m > 1440) { global.alert('Enter minutes per day (1 to 1440).'); return; }
        var existing = state.limits.filter(function (l) { return l.target === t; })[0];
        if (existing) {
          if (m >= existing.minutes) { global.alert('That already has a limit of ' + existing.minutes + ' min. Use "Raise limit" on it if you need more (it takes ' + COOLOFF_H + ' hours). You can lower it right away.'); return; }
        } else if (state.limits.length >= MAX) { global.alert('You can have up to ' + MAX + ' limits.'); return; }
        ask('add-limit', { target: t, minutes: m, yes: 'Lock it in', msg: msgAdd(label(t) + ' to ' + m + ' min per day') });
        return;
      }
      if (act === 'ask-remove') {
        ask('remove', { kind: kind, target: target, yes: 'Start the ' + COOLOFF_H + 'h countdown',
          msg: 'Remove <b>' + esc(label(target)) + '</b>? It stays fully active for ' + COOLOFF_H + ' hours before it is removed. Type the sentence to confirm.' });
        return;
      }
      if (act === 'ask-raise') {
        ask('raise', { kind: 'limit', target: target, yes: 'Start the ' + COOLOFF_H + 'h countdown',
          msg: 'Raise the limit for <b>' + esc(label(target)) + '</b>? The new limit applies after ' + COOLOFF_H + ' hours. Enter the new minutes and type the sentence.' });
        return;
      }
      if (act === 'cancel') { transport.lockRequest({ op: 'cancel', kind: kind, target: target }); return; }
      if (act === 'confirm-no') { ui.confirm = null; render(); return; }
      if (act === 'save-redirects') {
        state.redirects = {
          limitRedirectUrl: document.getElementById('mbkRdLimit').value.trim(),
          blockRedirectUrl: document.getElementById('mbkRdBlock').value.trim()
        };
        saveLists();
        return;
      }
      if (act === 'confirm-yes') doConfirm();
    }

    function doConfirm() {
      var c = ui.confirm;
      if (!c) return;
      if (c.op === 'remove' || c.op === 'raise') {
        var typed = (document.getElementById('mbkPhrase').value || '').trim().toLowerCase();
        if (typed !== PHRASE.toLowerCase()) { global.alert('Type the sentence exactly: ' + PHRASE); return; }
      }
      if (c.op === 'add-block') {
        if (!isBlocked(c.target)) state.blocklist = state.blocklist.concat([{ target: c.target }]);
        saveLists();
      } else if (c.op === 'add-limit') {
        var found = false;
        state.limits = state.limits.map(function (l) { if (l.target === c.target) { found = true; return { target: l.target, minutes: c.minutes }; } return l; });
        if (!found) state.limits = state.limits.concat([{ target: c.target, minutes: c.minutes }]);
        saveLists();
      } else if (c.op === 'remove') {
        transport.lockRequest({ op: 'remove', kind: c.kind, target: c.target });
      } else if (c.op === 'raise') {
        var nm = Math.round(Number(document.getElementById('mbkRaiseMin').value));
        var cur = state.limits.filter(function (l) { return l.target === c.target; })[0];
        if (!nm || nm < 1 || nm > 1440 || (cur && nm <= cur.minutes)) { global.alert('Enter a number of minutes higher than the current limit (max 1440).'); return; }
        transport.lockRequest({ op: 'raise', kind: 'limit', target: c.target, minutes: nm });
      }
      ui.confirm = null;
      render();
    }

    root.addEventListener('click', onClick);
    root.addEventListener('change', function (ev) {
      if (ev.target && ev.target.id === 'mbkLimType') {
        var cat = ev.target.value === 'c';
        document.getElementById('mbkLimDom').style.display = cat ? 'none' : '';
        document.getElementById('mbkLimCat').style.display = cat ? '' : 'none';
      }
    });

    transport.onState(function (s) {
      state = {
        limits: Array.isArray(s.limits) ? s.limits : [],
        blocklist: Array.isArray(s.blocklist) ? s.blocklist : [],
        redirects: s.redirects || {},
        lock: s.lock || null,
        usage: s.usage || {}
      };
      ready = true;
      if (!typing()) render();
    });

    // keep countdowns and usage bars fresh
    setInterval(function () { if (root.isConnected && !typing()) render(); }, 30000);

    render();
    return { refresh: function () { transport.requestState(); render(); } };
  }

  global.M2028BlockUI = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
