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
    { key: 'adult', icon: 'adult', name: 'Adult content', desc: 'Every known adult site, plus any site with adult keywords in its address' },
    { key: 'gambling', icon: 'gambling', name: 'Gambling', desc: 'Betting, casino, poker and fantasy-cash sites' },
    { key: 'social', icon: 'social', name: 'Social media', desc: 'Instagram, X, Reddit, TikTok, Snapchat and more' },
    { key: 'entertainment', icon: 'entertainment', name: 'Entertainment & video', desc: 'YouTube, Netflix, Twitch and other streaming' },
    { key: 'communication', icon: 'communication', name: 'Chat & messaging', desc: 'WhatsApp, Telegram, Discord and more' }
  ];
  var PRESETS = [15, 30, 60, 120];

  var ICONS = {
    adult: '<path d="M12 3.2l7 2.9v5.1c0 4.3-2.9 8.1-7 9.6-4.1-1.5-7-5.3-7-9.6V6.1z"/><path d="M12 8v4.2M12 15.6v.2"/>',
    gambling: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r=".7"/><circle cx="15.5" cy="8.5" r=".7"/><circle cx="12" cy="12" r=".7"/><circle cx="8.5" cy="15.5" r=".7"/><circle cx="15.5" cy="15.5" r=".7"/>',
    social: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19.5c.6-3.1 2.8-5 5.5-5s4.9 1.9 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.8 14.6c2.5.1 4.2 1.8 4.7 4.4"/>',
    entertainment: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M10 9.2l5 2.8-5 2.8z"/>',
    communication: '<path d="M20 11.6a8 8 0 0 1-11.7 7.1L4 20l1.2-4.2A8 8 0 1 1 20 11.6z"/><path d="M8.5 12h.1M12 12h.1M15.5 12h.1"/>',
    shield: '<path d="M12 3.2l7 2.9v5.1c0 4.3-2.9 8.1-7 9.6-4.1-1.5-7-5.3-7-9.6V6.1z"/><path d="M8.6 12.2l2.3 2.3 4.5-4.6"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.8 12h16.4M12 3.5c2.2 2.3 3.4 5.3 3.4 8.5s-1.2 6.2-3.4 8.5c-2.2-2.3-3.4-5.3-3.4-8.5S9.8 5.8 12 3.5z"/>',
    layers: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
    link: '<path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.4 6"/><path d="M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.4-1.4"/>',
    compass: '<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.2l-1.6 4-4 1.6 1.6-4z"/>',
    check: '<path d="M5.5 12.5l4.2 4.2L18.5 7.5"/>',
    chev: '<path d="M9 5.5l6.5 6.5L9 18.5"/>',
    alert: '<path d="M12 4l8.5 15h-17z"/><path d="M12 9v4.2M12 16.4v.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>'
  };

  var CSS = '' +
    '.mbk{font-size:13px;line-height:1.45;color:inherit}.mbk *{box-sizing:border-box}' +
    '.mbk svg{width:16px;height:16px;display:block;flex:0 0 auto}' +
    '.mbk-hero{display:flex;gap:11px;align-items:flex-start;padding:14px;border-radius:16px;border:1px solid var(--ai,#4fd8a0);background:linear-gradient(135deg,var(--a2,rgba(79,216,160,.14)),transparent 72%);margin-bottom:12px}' +
    '.mbk-hero .ico{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:var(--a2,rgba(79,216,160,.16));color:var(--ai-text,var(--ai,#4fd8a0));flex:0 0 auto}' +
    '.mbk-hero .ico svg{width:19px;height:19px}' +
    '.mbk-hero-b{flex:1;min-width:0}.mbk-hero b{display:block;font-size:13.5px;margin-bottom:2px}' +
    '.mbk-hero p{margin:0;font-size:11.5px;color:var(--m2,#8a8f98)}' +
    '.mbk-stats{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}' +
    '.mbk-stat{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;padding:3px 8px;border-radius:999px;background:var(--s2,rgba(128,128,128,.1));border:1px solid var(--b,rgba(128,128,128,.24));color:var(--m2,#8a8f98)}' +
    '.mbk-stat svg{width:11px;height:11px}' +
    '.mbk-stat.ok{color:var(--ai-text,var(--ai,#4fd8a0));border-color:var(--ai,#4fd8a0);background:var(--a2,rgba(79,216,160,.12))}' +
    '.mbk-card{border:1px solid var(--b,rgba(128,128,128,.28));border-radius:16px;padding:14px;margin-bottom:12px;background:var(--s1,transparent)}' +
    '.mbk-card-h{display:flex;align-items:flex-start;gap:9px;margin-bottom:10px}' +
    '.mbk-card-h .mbk-ico{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--s2,rgba(128,128,128,.1));color:var(--ai-text,var(--ai,#4fd8a0));flex:0 0 auto}' +
    '.mbk-card-h h3{font-size:13.5px;font-weight:700;margin:0;line-height:1.2}' +
    '.mbk-card-h p{font-size:11px;color:var(--m2,#8a8f98);margin:2px 0 0}' +
    '.mbk-cnt{font-size:10.5px;color:var(--m2,#8a8f98);background:var(--s2,rgba(128,128,128,.1));border:1px solid var(--b,rgba(128,128,128,.24));border-radius:999px;padding:2px 7px;white-space:nowrap;margin-left:auto}' +
    '.mbk-sub{font-size:11.5px;color:var(--m2,#8a8f98);margin:0 0 10px}' +
    '.mbk-cats{display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:8px}' +
    '.mbk-cat{position:relative;border:1px solid var(--b,rgba(128,128,128,.28));border-radius:14px;padding:11px;display:flex;flex-direction:column;gap:7px;background:var(--s2,rgba(128,128,128,.07));transition:border-color .15s,background .15s}' +
    '.mbk-cat:hover{border-color:var(--ai,#4fd8a0)}' +
    '.mbk-cat.on{border-color:var(--ai,#4fd8a0);background:var(--a2,rgba(79,216,160,.1))}' +
    '.mbk-cat .ci{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--s1,rgba(128,128,128,.12));color:var(--ai-text,var(--ai,#4fd8a0))}' +
    '.mbk-cat .t{font-weight:700;font-size:12.5px;line-height:1.2}' +
    '.mbk-cat .d{font-size:10.5px;color:var(--m2,#8a8f98);flex:1;line-height:1.35}' +
    '.mbk-cat .mbk-cat-dot{position:absolute;top:9px;right:9px;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;background:var(--ai,#4fd8a0);color:var(--on-ai-solid,#04281c)}' +
    '.mbk-cat .mbk-cat-dot svg{width:11px;height:11px;stroke-width:2.4}' +
    '.mbk-cat .mbk-cat-foot{display:flex;gap:6px;flex-wrap:wrap;align-items:center}' +
    '.mbk-cat > .mbk-btn{justify-content:center}' +
    '.mbk-row{display:flex;align-items:center;gap:9px;padding:10px 0;border-top:1px solid var(--b,rgba(128,128,128,.28))}' +
    '.mbk-row .mbk-ico{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--s2,rgba(128,128,128,.1));color:var(--m2,#8a8f98);flex:0 0 auto}' +
    '.mbk-row .mbk-ico.accent{color:var(--ai-text,var(--ai,#4fd8a0))}' +
    '.mbk-row .m{flex:1;min-width:0}.mbk-row .n{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.mbk-row .s{font-size:11px;color:var(--m2,#8a8f98);margin-top:2px}' +
    '.mbk-row .a{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;align-items:center}' +
    '.mbk-bar{height:5px;border-radius:3px;background:rgba(128,128,128,.22);margin-top:6px;overflow:hidden}' +
    '.mbk-bar i{display:block;height:100%;border-radius:3px;background:var(--ai,#4fd8a0)}' +
    '.mbk-bar i.hot{background:var(--bd,#e8965a)}.mbk-bar i.full{background:var(--rd,#e86060)}' +
    '.mbk-form{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:8px;align-items:center}' +
    '.mbk-input-wrap{flex:1;min-width:130px;display:flex;align-items:center;gap:6px;padding:0 9px;border:1px solid var(--b,rgba(128,128,128,.28));border-radius:10px;background:var(--s2,rgba(128,128,128,.08))}' +
    '.mbk-input-wrap svg{width:14px;height:14px;color:var(--m2,#8a8f98)}' +
    '.mbk-input-wrap .mbk-in{border:0;background:transparent;padding:8px 0;border-radius:0;flex:1;min-width:0;outline:none}' +
    '.mbk-in{flex:1;min-width:110px;padding:8px 10px;border-radius:10px;border:1px solid var(--b,rgba(128,128,128,.28));background:var(--s2,rgba(128,128,128,.08));color:inherit;font:inherit}' +
    '.mbk-in.sm{flex:0 0 108px;min-width:0}' +
    '.mbk-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:8px 12px;border-radius:9px;border:1px solid var(--b,rgba(128,128,128,.28));background:transparent;color:inherit;font:inherit;font-size:12px;font-weight:600;line-height:1.1;cursor:pointer}' +
    '.mbk-btn.p{background:var(--ai,#4fd8a0);border-color:var(--ai,#4fd8a0);color:var(--on-ai-solid,#04281c)}' +
    '.mbk-btn.p:hover{filter:brightness(1.05)}' +
    '.mbk-btn.s{font-size:11px;padding:5px 8px;font-weight:500;color:var(--m2,#8a8f98)}' +
    '.mbk-btn.s:hover{color:inherit;border-color:var(--ai,#4fd8a0)}' +
    '.mbk-btn:disabled{opacity:.55;cursor:not-allowed}' +
    '.mbk-seg{display:inline-flex;padding:2px;gap:2px;border:1px solid var(--b,rgba(128,128,128,.28));border-radius:9px;background:var(--s2,rgba(128,128,128,.08))}' +
    '.mbk-seg button{border:0;background:transparent;color:var(--m2,#8a8f98);font:inherit;font-size:11.5px;font-weight:600;padding:5px 10px;border-radius:7px;cursor:pointer}' +
    '.mbk-seg button.on{background:var(--ai,#4fd8a0);color:var(--on-ai-solid,#04281c)}' +
    '.mbk-chip{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;padding:3px 8px;border-radius:999px;font-weight:600;background:var(--a2,rgba(79,216,160,.14));color:var(--ai-text,var(--ai,#4fd8a0))}' +
    '.mbk-chip svg{width:11px;height:11px}' +
    '.mbk-chip.w{background:rgba(232,150,90,.14);color:var(--bd,#e8965a)}' +
    '.mbk-pre{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}' +
    '.mbk-pre button{padding:4px 10px;border-radius:999px;border:1px solid var(--b,rgba(128,128,128,.28));background:transparent;color:inherit;font:inherit;font-size:11px;cursor:pointer}' +
    '.mbk-pre button:hover{border-color:var(--ai,#4fd8a0);color:var(--ai-text,var(--ai,#4fd8a0))}' +
    '.mbk-empty{display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--mt,#8a8f98);padding:10px 0 2px}' +
    '.mbk-empty svg{width:14px;height:14px}' +
    '.mbk-msg{padding:16px;border-radius:14px;border:1px solid var(--b,rgba(128,128,128,.28));color:var(--m2,#8a8f98)}' +
    '.mbk-confirm{padding:12px 14px;border-radius:14px;border:1px solid var(--bd,#e8965a);background:rgba(232,150,90,.1);margin-bottom:12px}' +
    '.mbk-confirm-h{display:flex;align-items:center;gap:6px;font-weight:700;font-size:12.5px;margin-bottom:5px;color:var(--bd,#e8965a)}' +
    '.mbk-confirm-h svg{width:14px;height:14px}' +
    '.mbk-confirm p{margin:0 0 8px;font-size:11.5px}' +
    '.mbk-confirm .f{display:flex;gap:6px;flex-wrap:wrap;align-items:center}' +
    '.mbk-adv{padding:0;overflow:hidden}' +
    '.mbk-adv summary{list-style:none;display:flex;align-items:center;gap:9px;padding:13px 14px;cursor:pointer;font-size:12.5px;font-weight:700}' +
    '.mbk-adv summary::-webkit-details-marker{display:none}' +
    '.mbk-adv summary .mbk-ico{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--s2,rgba(128,128,128,.1));color:var(--ai-text,var(--ai,#4fd8a0));flex:0 0 auto}' +
    '.mbk-adv summary .sum{flex:1;min-width:0}' +
    '.mbk-adv summary .sum-sub{display:block;font-size:10.5px;font-weight:500;color:var(--m2,#8a8f98);margin-top:1px}' +
    '.mbk-adv summary .chev{color:var(--m2,#8a8f98);transition:transform .2s}' +
    '.mbk-adv[open] summary .chev{transform:rotate(90deg)}' +
    '.mbk-adv-b{padding:0 14px 14px}';

  function injectStyle() {
    if (document.getElementById('mbk-style')) return;
    var s = document.createElement('style');
    s.id = 'mbk-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  function svg(name) {
    var body = ICONS[name] || ICONS.globe;
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function catForTarget(t) {
    var key = String(t).replace('category:', '');
    for (var i = 0; i < CATS.length; i++) if (CATS[i].key === key) return CATS[i];
    return null;
  }
  function label(t) {
    var c = catForTarget(t);
    return c ? c.name : t;
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

    function statusChip(e, r) {
      if (!e) return '<span class="mbk-chip w">' + svg('clock') + ' Locking in…</span>';
      if (r) {
        var txt = r.op === 'raise' ? 'Limit rises in ' : 'Removed in ';
        return '<span class="mbk-chip w">' + svg('clock') + ' ' + txt + fmtLeft(r.left) + '</span>';
      }
      return '<span class="mbk-chip">' + svg('lock') + ' Locked</span>';
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
      var html = '<div class="mbk-confirm" id="mbkConfirm"><div class="mbk-confirm-h">' + svg('alert') + '<span>Confirm change</span></div><p>' + c.msg + '</p><div class="f">';
      if (c.op === 'raise') html += '<input id="mbkRaiseMin" class="mbk-in sm" type="number" min="1" max="1440" placeholder="New min/day">';
      if (needPhrase) html += '<input id="mbkPhrase" class="mbk-in" placeholder="Type: ' + PHRASE + '" autocomplete="off">';
      html += '<button class="mbk-btn p" data-act="confirm-yes">' + esc(c.yes) + '</button><button class="mbk-btn" data-act="confirm-no">Cancel</button></div></div>';
      return html;
    }

    function syncLimTypeUi() {
      var lt = document.getElementById('mbkLimType');
      if (!lt) return;
      var cat = lt.value === 'c';
      var wrap = document.getElementById('mbkLimDomWrap');
      var dom = document.getElementById('mbkLimDom');
      var catSel = document.getElementById('mbkLimCat');
      if (wrap) wrap.style.display = cat ? 'none' : '';
      else if (dom) dom.style.display = cat ? 'none' : '';
      if (catSel) catSel.style.display = cat ? '' : 'none';
      var seg = root.querySelectorAll('[data-act="lim-type"]');
      for (var i = 0; i < seg.length; i++) {
        seg[i].classList.toggle('on', seg[i].getAttribute('data-type') === lt.value);
      }
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

      var limType = (document.getElementById('mbkLimType') || {}).value || 'd';
      var catOpts = CATS.map(function (c) { return '<option value="category:' + c.key + '">' + esc(c.name) + '</option>'; }).join('');
      var cats = CATS.map(function (c) {
        var t = 'category:' + c.key, on = isBlocked(t), e = entry('block', t), r = reqInfo(e);
        return '<div class="mbk-cat' + (on ? ' on' : '') + '">' +
          (on ? '<span class="mbk-cat-dot">' + svg('check') + '</span>' : '') +
          '<div class="ci">' + svg(c.icon) + '</div>' +
          '<div class="t">' + esc(c.name) + '</div>' +
          '<div class="d">' + esc(c.desc) + '</div>' +
          (on ? '<div class="mbk-cat-foot">' + statusChip(e, r) + removeBtn('block', t, e, r) + '</div>'
              : '<button class="mbk-btn p" data-act="ask-add-cat" data-target="' + t + '">Block category</button>') + '</div>';
      }).join('');

      var sites = state.blocklist.filter(function (b) { return String(b.target).indexOf('category:') !== 0; });
      var siteRows = sites.length ? sites.map(function (b) {
        var e = entry('block', b.target), r = reqInfo(e);
        return '<div class="mbk-row"><span class="mbk-ico">' + svg('globe') + '</span><div class="m"><div class="n">' + esc(b.target) + '</div><div class="s">Website</div></div><div class="a">' + statusChip(e, r) + removeBtn('block', b.target, e, r) + '</div></div>';
      }).join('') : '<div class="mbk-empty">' + svg('globe') + ' No individual websites blocked yet.</div>';

      var limRows = state.limits.length ? state.limits.map(function (l) {
        var e = entry('limit', l.target), r = reqInfo(e);
        var mins = e && e.minutes ? e.minutes : l.minutes;
        var used = Math.floor((state.usage[l.target] || 0) / 60);
        var pct = Math.min(100, Math.round(used / mins * 100));
        var cls = pct >= 100 ? 'full' : pct >= 75 ? 'hot' : '';
        var raiseBtn = (e && !r) ? '<button class="mbk-btn s" data-act="ask-raise" data-target="' + esc(l.target) + '">Raise limit</button>' : '';
        var sub = used + ' of ' + mins + ' min used today' + (r && r.op === 'raise' ? ' · rises to ' + r.minutes + ' min in ' + fmtLeft(r.left) : '');
        var cat = catForTarget(l.target);
        return '<div class="mbk-row"><span class="mbk-ico accent">' + svg(cat ? cat.icon : 'clock') + '</span><div class="m"><div class="n">' + esc(label(l.target)) + '</div><div class="s">' + sub + '</div>' +
          '<div class="mbk-bar"><i class="' + cls + '" style="width:' + pct + '%"></i></div></div>' +
          '<div class="a">' + statusChip(e, r) + raiseBtn + removeBtn('limit', l.target, e, r) + '</div></div>';
      }).join('') : '<div class="mbk-empty">' + svg('clock') + ' No daily limits set yet.</div>';

      var presets = PRESETS.map(function (m) { return '<button data-act="preset" data-min="' + m + '">' + m + ' min</button>'; }).join('');

      var redirect;
      if (hasLockedItems()) {
        redirect = '<div class="mbk-sub" style="margin:0">Redirect pages are locked together with your blocks, so they cannot be pointed somewhere else.</div>';
      } else {
        var r0 = state.redirects || {};
        redirect = '<p class="mbk-sub" style="margin-top:0">You can change these only until your first block or limit is added.</p>' +
          '<div class="mbk-form"><div class="mbk-input-wrap">' + svg('compass') + '<input id="mbkRdLimit" class="mbk-in" type="url" placeholder="After a limit: https://en.wikipedia.org/wiki/Special:Random" value="' + esc(r0.limitRedirectUrl || '') + '"></div></div>' +
          '<div class="mbk-form"><div class="mbk-input-wrap">' + svg('compass') + '<input id="mbkRdBlock" class="mbk-in" type="url" placeholder="Blocked site: https://theuselessweb.com" value="' + esc(r0.blockRedirectUrl || '') + '"></div>' +
          '<button class="mbk-btn" data-act="save-redirects">Save</button></div>';
      }

      root.innerHTML = '<div class="mbk">' +
        '<div class="mbk-hero"><div class="ico">' + svg('shield') + '</div><div class="mbk-hero-b"><b>Commitment lock is on</b>' +
        '<p>Anything you add stays for at least ' + COOLOFF_H + ' hours. Removing or loosening it needs a request you can cancel anytime.</p>' +
        '<div class="mbk-stats"><span class="mbk-stat">' + state.blocklist.length + ' blocks</span><span class="mbk-stat">' + state.limits.length + ' limits</span>' +
        (hasLockedItems() ? '<span class="mbk-stat ok">' + svg('lock') + ' Protected</span>' : '<span class="mbk-stat">' + svg('clock') + ' Setting up</span>') + '</div></div></div>' +
        renderConfirm() +
        '<div class="mbk-card"><div class="mbk-card-h"><span class="mbk-ico">' + svg('layers') + '</span><div><h3>Block a whole category</h3><p>One tap covers every site in the group, including ones you have not visited yet.</p></div></div><div class="mbk-cats">' + cats + '</div></div>' +
        '<div class="mbk-card"><div class="mbk-card-h"><span class="mbk-ico">' + svg('globe') + '</span><div><h3>Block a website</h3><p>Subdomains are blocked too.</p></div><span class="mbk-cnt">' + sites.length + ' / ' + MAX + '</span></div>' +
        '<div class="mbk-form"><div class="mbk-input-wrap">' + svg('link') + '<input id="mbkBlockDom" class="mbk-in" placeholder="e.g. instagram.com" autocomplete="off"></div><button class="mbk-btn p" data-act="ask-add-block">Block</button></div>' + siteRows + '</div>' +
        '<div class="mbk-card"><div class="mbk-card-h"><span class="mbk-ico">' + svg('clock') + '</span><div><h3>Daily time limits</h3><p>Once today\'s minutes run out, the site is blocked until tomorrow.</p></div><span class="mbk-cnt">' + state.limits.length + ' / ' + MAX + '</span></div>' +
        '<div class="mbk-form"><div class="mbk-seg" role="group" aria-label="Limit type"><button type="button" data-act="lim-type" data-type="d" class="' + (limType === 'd' ? 'on' : '') + '">Website</button><button type="button" data-act="lim-type" data-type="c" class="' + (limType === 'c' ? 'on' : '') + '">Category</button></div>' +
        '<select id="mbkLimType" class="mbk-in sm" style="display:none"><option value="d">Website</option><option value="c">Category</option></select></div>' +
        '<div class="mbk-form"><div class="mbk-input-wrap" id="mbkLimDomWrap" style="' + (limType === 'c' ? 'display:none' : '') + '">' + svg('link') + '<input id="mbkLimDom" class="mbk-in" placeholder="e.g. youtube.com" autocomplete="off"></div>' +
        '<select id="mbkLimCat" class="mbk-in" style="display:' + (limType === 'c' ? '' : 'none') + '">' + catOpts + '</select></div>' +
        '<div class="mbk-pre">' + presets + '</div>' +
        '<div class="mbk-form"><input id="mbkLimMin" class="mbk-in sm" type="number" min="1" max="1440" placeholder="Min / day"><button class="mbk-btn p" data-act="ask-add-limit">Set limit</button></div>' + limRows + '</div>' +
        '<details class="mbk-card mbk-adv"><summary><span class="mbk-ico">' + svg('compass') + '</span><span class="sum"><b>Where blocked pages send you</b><span class="sum-sub">Optional redirects</span></span><span class="chev">' + svg('chev') + '</span></summary><div class="mbk-adv-b">' + redirect + '</div></details>' +
        '</div>';

      Object.keys(keep).forEach(function (id) { var el = document.getElementById(id); if (el) el.value = keep[id]; });
      syncLimTypeUi();
      if (ui.confirm && ui.confirm.fresh) {
        ui.confirm.fresh = false;
        var cf = document.getElementById('mbkConfirm');
        if (cf && cf.scrollIntoView) cf.scrollIntoView({ block: 'nearest' });
      }
    }

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
      if (act === 'lim-type') {
        var lt = document.getElementById('mbkLimType');
        if (!lt) return;
        lt.value = el.getAttribute('data-type') || 'd';
        syncLimTypeUi();
        return;
      }

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
        var blockInput = document.getElementById('mbkBlockDom');
        if (blockInput) blockInput.value = '';
      } else if (c.op === 'add-limit') {
        var found = false;
        state.limits = state.limits.map(function (l) { if (l.target === c.target) { found = true; return { target: l.target, minutes: c.minutes }; } return l; });
        if (!found) state.limits = state.limits.concat([{ target: c.target, minutes: c.minutes }]);
        saveLists();
        var limitDomain = document.getElementById('mbkLimDom');
        var limitMinutes = document.getElementById('mbkLimMin');
        if (limitDomain) limitDomain.value = '';
        if (limitMinutes) limitMinutes.value = '';
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
      if (ev.target && ev.target.id === 'mbkLimType') syncLimTypeUi();
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

    setInterval(function () { if (root.isConnected && !typing()) render(); }, 30000);

    render();
    return { refresh: function () { transport.requestState(); render(); } };
  }

  global.M2028BlockUI = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
