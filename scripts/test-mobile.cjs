const { chromium } = require('playwright-core');
const URL = process.argv[2] || 'http://127.0.0.1:5173/';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true,
  });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__APP__, null, { timeout: 60000 });
  await page.waitForTimeout(3500);

  const info = await page.evaluate(() => {
    const de = document.documentElement;
    const chips = [...document.querySelectorAll('#topbar .chip, .mobile-only')].map(e => e.id || e.className);
    return {
      scrollW: de.scrollWidth, clientW: de.clientWidth,
      overflowX: de.scrollWidth > de.clientWidth + 2,
      chips,
      chipsVisible: ['btn-panel-left', 'btn-panel-right'].filter(id => {
      const e = document.getElementById(id); return e && getComputedStyle(e).display !== 'none';
    }),
      canvasW: document.querySelector('canvas').clientWidth,
      parts: window.__APP__.reg.parts.length,
      fov: window.__APP__.camera.fov,
    };
  });
  console.log(JSON.stringify(info, null, 1));

  await page.screenshot({ path: './shots/m1-mobile.png' });

  // 打开构件抽屉
  const opened = await page.evaluate(() => {
    const btn = document.getElementById('btn-panel-left');
    if (!btn) return { found: false };
    btn.click();
    return { found: true, open: document.getElementById('panel-left').classList.contains('open') };
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: './shots/m2-mobile-panel.png' });
  console.log('panel toggle:', JSON.stringify(opened));

  // 关闭抽屉，点底栏播放
  const barbtn = await page.evaluate(() => {
    const c = document.querySelector('[data-close="left"]'); if (c) c.click();
    const b = document.getElementById('btn-play');
    if (!b) return { found: false };
    const r = b.getBoundingClientRect();
    return { found: true, x: r.x, y: r.y, w: r.width, h: r.height, inView: r.y > 0 && r.y < innerHeight };
  });
  await page.waitForTimeout(600);
  console.log('play btn:', JSON.stringify(barbtn));
  if (barbtn.found && barbtn.inView) {
    await page.mouse.click(barbtn.x + barbtn.w / 2, barbtn.y + barbtn.h / 2);
    await page.waitForTimeout(1200);
    const p = await page.evaluate(() => window.__APP__.explode.progress);
    console.log('progress after tap play:', p.toFixed(3));
    await page.screenshot({ path: './shots/m3-mobile-explode.png' });
  }
  console.log('pageerrors:', errs.length ? errs : 'none');
  await browser.close();
})();
