/**
 * 出图脚本：装配 / 爆炸 50% / 爆炸 100% / 主机剖切 / 燃气轮机 / 螺旋桨特写
 * 用法：node scripts/screenshot.cjs [url]
 */
const { chromium } = require('playwright-core');
const URL = process.argv[2] || 'http://127.0.0.1:5173/';

const SHOTS = [
  { name: '01-assembly', cam: [21.0, 13.2, -20.0], tgt: [0, 3.9, -9.2], progress: 0 },
  { name: '02-explode-50', cam: [30.0, 20.0, -30.0], tgt: [0, 4.5, -7.0], progress: 0.5 },
  { name: '03-explode-100', cam: [38.0, 24.0, -36.0], tgt: [0, 4.5, -6.0], progress: 1 },
  { name: '04-section-engine', cam: [15.5, 12.5, 17.0], tgt: [0, 4.6, 3.4], progress: 0, section: 'engine' },
  { name: '05-gasturbine', cam: [-13.0, 14.0, -14.0], tgt: [-4.0, 8.4, -6.0], progress: 0, config: 'gas' },
  { name: '06-cpp', cam: [7.5, 5.0, -22.0], tgt: [0, 1.95, -15.2], progress: 0 },
  { name: '07-stern-section', cam: [10.5, 6.5, -9.5], tgt: [0, 2.0, -10.4], progress: 0, section: 'stern' },
  { name: '08-gas-flow', cam: [-14.0, 15.0, -16.0], tgt: [-4.0, 8.4, -5.0], progress: 0, config: 'gas', flow: true },
  { name: '09-diesel-flow', cam: [16.0, 15.0, -12.0], tgt: [0, 6.0, 1.0], progress: 0, flow: true },
];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('[err]', e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__APP__, null, { timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    for (const id of ['panel-left', 'panel-right', 'bottombar', 'topbar']) {
      const el = document.getElementById(id); if (el) el.style.display = 'none';
    }
  });

  for (const s of SHOTS) {
    await page.evaluate((cfg) => {
      const a = window.__APP__;
      a.setConfig(cfg.config || 'diesel');
      a.setPropulsor('cpp');
      a.setSection(cfg.section || 'off');
      a.flow.toggle(!!cfg.flow);
      a.explode.pause();
      a.explode.setProgress(cfg.progress);
      a.focus = null;
      a.camera.position.set(cfg.cam[0], cfg.cam[1], cfg.cam[2]);
      a.controls.target.set(cfg.tgt[0], cfg.tgt[1], cfg.tgt[2]);
      a.controls.update();
    }, s);
    await page.waitForTimeout(900);
    const camNow = await page.evaluate(() => {
      const a = window.__APP__;
      return { p: a.camera.position.toArray().map(n => +n.toFixed(1)),
        t: a.controls.target.toArray().map(n => +n.toFixed(1)),
        focus: !!a.focus, sec: a.section.active };
    });
    await page.screenshot({ path: `./shots/${s.name}.png` });
    console.log('shot', s.name, JSON.stringify(camNow));
  }
  await browser.close();
})();
