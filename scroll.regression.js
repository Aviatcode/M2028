// Run: APP_FILE=file:///path/index.html node scroll.regression.js
const {open, prepare, widgetIds} = require('./lib'); const {swipe} = require('./touch');
const results = []; const rec = (name, ok, note = '') => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (note ? '  — ' + note : '')); };
const scrollY = p => p.evaluate(() => scrollY);
(async () => {
  // 1. page scrolls top->bottom with wheel, all viewports; no horizontal overflow
  for (const [n, vp, touch] of [['phone 390x844', {width: 390, height: 844}, true], ['tablet 820x1180', {width: 820, height: 1180}, true], ['desktop 1280x800', {width: 1280, height: 800}, false]]) {
    const {browser, page} = await open({viewport: vp, touch, sized: true});
    await page.mouse.move(vp.width / 2, 300);
    for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 900);
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => ({y: scrollY, max: document.scrollingElement.scrollHeight - innerHeight, h: document.scrollingElement.scrollWidth - innerWidth}));
    rec(`${n}: wheel reaches page bottom`, r.y >= r.max - 2, `${r.y}/${r.max}`);
    rec(`${n}: no horizontal overflow`, r.h <= 1, `${r.h}px`);
    await browser.close();
  }
  // 2. keyboard scrolling (End / PageDown / Home)
  { const {browser, page} = await open({viewport: {width: 1280, height: 800}, touch: false, sized: true});
    await page.evaluate(() => document.activeElement && document.activeElement.blur()); await page.mouse.click(5, 400);
    await page.keyboard.press('PageDown'); await page.waitForTimeout(700); const a = await scrollY(page);
    await page.keyboard.press('End'); await page.waitForTimeout(1500); const b = await scrollY(page);
    const max = await page.evaluate(() => document.scrollingElement.scrollHeight - innerHeight);
    await page.keyboard.press('Home'); await page.waitForTimeout(1500); const c = await scrollY(page);
    rec('keyboard PageDown/End/Home', a > 0 && b >= max - 2 && c <= 2, `pgdn=${a} end=${b}/${max} home=${c}`); await browser.close(); }
  // 3. wheel over each widget at inner boundary eventually reaches page (spaced ticks beat latching)
  { const {browser, page} = await open({viewport: {width: 1280, height: 800}, touch: false, sized: true});
    for (const id of await widgetIds(page)) { const r = await prepare(page, id, 'bottom', 150); if (r.maxY - r.y0 < 60) continue;
      await page.mouse.move(r.x, r.y); let moved = 0; for (let i = 0; i < 3 && !moved; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(800); moved = (await scrollY(page)) - r.y0; }
      rec(`desktop wheel chains out of widget "${id}"`, moved > 0); }
    await browser.close(); }
  // 4. phone touch: repeated swipes over each widget eventually move the page
  { const {browser, ctx, page} = await open({viewport: {width: 390, height: 844}, touch: true, sized: true}); const cdp = await ctx.newCDPSession(page);
    for (const id of await widgetIds(page)) { const y0 = await page.evaluate(id => { document.documentElement.style.scrollBehavior = 'auto'; const w = document.querySelector(`#dashWidgets > .dash-w[data-wid="${CSS.escape(id)}"]`); scrollTo(0, Math.max(0, w.getBoundingClientRect().top + scrollY - 380)); return scrollY; }, id);
      const room = await page.evaluate(() => document.scrollingElement.scrollHeight - innerHeight - scrollY); if (room < 60) continue; let moved = 0;
      for (let i = 0; i < 60 && moved < 20; i++) { const p = await page.evaluate(id => { const b = document.querySelector(`#dashWidgets > .dash-w[data-wid="${CSS.escape(id)}"]`).getBoundingClientRect(); return {x: Math.round(b.left + b.width / 2), y: Math.round(Math.min(Math.max(b.top + b.height / 2, 330), 600))}; }, id);
        await swipe(cdp, p.x, p.y, -200, {steps: 8, hold: 8}); await page.waitForTimeout(100); moved = (await scrollY(page)) - y0; }
      rec(`phone touch scrolls out of widget "${id}"`, moved >= 20); }
    await browser.close(); }
  // 5. touch must not permanently disable wheel chaining (touchscreen laptop)
  { const {browser, ctx, page} = await open({viewport: {width: 1280, height: 800}, touch: true, sized: true}); const cdp = await ctx.newCDPSession(page);
    let r = await prepare(page, 'habits', 'top', 150); await swipe(cdp, r.x, r.y, -60);
    r = await prepare(page, 'habits', 'bottom', 150); await page.mouse.move(r.x, r.y); let moved = 0;
    for (let i = 0; i < 3 && !moved; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(900); moved = (await scrollY(page)) - r.y0; }
    rec('touch then wheel: widget does not trap wheel', moved > 0, 'ob-y=' + await page.evaluate(() => getComputedStyle(document.querySelector('#dw-habits > .wc')).overscrollBehaviorY)); await browser.close(); }
  // 6. phone touch does not double-scroll (page moves ~ finger distance, not 2x) on a plain widget
  { const {browser, ctx, page} = await open({viewport: {width: 390, height: 844}, touch: true, sized: true}); const cdp = await ctx.newCDPSession(page);
    const r = await prepare(page, 'habits', 'bottom', 430); await swipe(cdp, r.x, r.y, -150); await page.waitForTimeout(700); await swipe(cdp, r.x, 560, -150); await page.waitForTimeout(700);
    const m = (await scrollY(page)) - r.y0; rec('touch scroll distance proportional to finger (no double scroll)', m <= 330, `${m}px for 2x150px swipes`); await browser.close(); }
  // 7. modals open/close without leaving the page locked
  { const {browser, page} = await open({viewport: {width: 1280, height: 800}, touch: false, sized: true});
    for (const id of ['acctMo', 'colorMo', 'planMo']) { await page.evaluate(id => openMo(id), id); await page.waitForTimeout(400); await page.evaluate(id => closeMo(id), id); await page.waitForTimeout(500); }
    const st = await page.evaluate(() => ({o: getComputedStyle(document.body).overflowY, ho: getComputedStyle(document.documentElement).overflowY, ov: [...document.querySelectorAll('.ov.op')].length}));
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, 0); }); await page.mouse.move(640, 400); await page.mouse.wheel(0, 500); await page.waitForTimeout(500);
    rec('modals open/close leave page scrollable', (await scrollY(page)) > 0 && st.ov === 0, JSON.stringify(st)); await browser.close(); }
  // 8. widgets still functional: add task, toggle habit, type in note
  { const {browser, page, errors} = await open({viewport: {width: 1280, height: 800}, touch: false, sized: true});
    const before = await page.evaluate(() => getTasks().length);
    await page.evaluate(() => { document.getElementById('tskInp').value = 'regression task'; addTask(); }); await page.evaluate(() => closeMo('tskDtMo'));
    const after = await page.evaluate(() => getTasks().length);
    const h = await page.evaluate(() => { const id = getTHabs()[0].id; togH(id); return !!(S.go('hd', {})[TK()] || {})[id]; });
    await page.evaluate(() => { const t = document.querySelector('#dashWidgets textarea.ta'); t.focus(); t.value = 'abc'; t.blur(); });
    rec('widgets functional (add task, toggle habit, note input)', after === before + 1 && h, `tasks ${before}→${after}, habit=${h}, pageerrors=${errors.length}`); await browser.close(); }
  const f = results.filter(x => !x).length; console.log(`\n${results.length - f}/${results.length} passed, ${f} failed`); process.exit(f ? 1 : 0);
})();
