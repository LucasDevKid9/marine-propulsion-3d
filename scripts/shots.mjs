/**
 * shots.mjs — 统一出图脚本（README 画廊 / 人工几何核对）
 *
 * 用法：
 *   npm run dev                     # 另开一个终端
 *   node scripts/shots.mjs          # 输出到 ./shots
 *   node scripts/shots.mjs --only 01,11
 *
 * 设计约定：
 *  - 相机位姿在动画帧稳定后再写一次，避免 controls 的阻尼把位姿拉回去；
 *  - 出图前统一 pause + progress=0 + 车钟归零，保证「同一套图描述同一台机器」；
 *  - UI 面板全部隐藏，只留 3D；
 *  - 每张图都回读一次真实相机/剖切状态，写进 stdout 供核对，不做无依据的标注。
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const URL = arg('url', 'http://127.0.0.1:5173/');
const OUT = arg('out', './shots');
const only = (arg('only', '') || '').split(',').filter(Boolean);

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
  { name: '10-piping', cam: [9.6, 7.4, 15.4], tgt: [-1.2, 3.2, 4.0], progress: 0, fov: 40 },
  { name: '11-drive-overview', cam: [7.0, 6.0, 7.5], tgt: [-2.2, 4.6, -1.6], progress: 0, config: 'gas', fov: 44 },
  { name: '12-drive-close', cam: [1.2, 3.4, 5.6], tgt: [-2.6, 3.4, -1.5], progress: 0, config: 'gas', fov: 46 },
  { name: '13-drive-top', cam: [-2.2, 12.5, 5.5], tgt: [-2.4, 3.6, -1.4], progress: 0, config: 'gas', fov: 44 },
  { name: '14-fpp-duct', cam: [8.6, 5.6, -23.0], tgt: [0, 1.95, -15.0], progress: 0, propulsor: 'fpp' },
  { name: '15-diesel-head', cam: [7.2, 10.4, 6.4], tgt: [0, 5.6, 3.2], progress: 0, fov: 42 },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__APP__, null, { timeout: 90000 });
await page.waitForTimeout(4000);
await page.evaluate(() => {
  for (const id of ['panel-left', 'panel-right', 'bottombar', 'topbar', 'labels', 'info']) {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  }
  const a = window.__APP__;
  a.explode.pause();
  a.explode.setProgress(0);
  a.sim.setTelegraph(0);
});

for (const s of SHOTS) {
  if (only.length && !only.some((k) => s.name.startsWith(k))) continue;
  await page.evaluate((cfg) => {
    const a = window.__APP__;
    a.setConfig(cfg.config || 'diesel');
    a.setPropulsor(cfg.propulsor || 'cpp');
    a.setSection(cfg.section || 'off');
    a.flow.toggle(!!cfg.flow);
    a.explode.pause();
    a.explode.setProgress(cfg.progress);
    a.camera.fov = cfg.fov || 46;
    a.camera.updateProjectionMatrix();
    a.focus = null;
  }, s);
  await page.waitForTimeout(650);
  await page.evaluate((cfg) => {
    const a = window.__APP__;
    a.focus = null;
    a.camera.position.set(...cfg.cam);
    a.controls.target.set(...cfg.tgt);
    a.controls.update();
  }, s);
  await page.waitForTimeout(320);
  const now = await page.evaluate(() => {
    const a = window.__APP__;
    return {
      cam: a.camera.position.toArray().map((n) => +n.toFixed(1)),
      tgt: a.controls.target.toArray().map((n) => +n.toFixed(1)),
      sec: a.section.active, prog: +a.explode.progress.toFixed(2),
      cfg: a.state.config, prop: a.state.propulsor,
    };
  });
  await page.screenshot({ path: `${OUT}/${s.name}.png` });
  console.log('shot', s.name.padEnd(20), JSON.stringify(now));
}

await browser.close();
if (errs.length) { console.log('\n页面报错：\n' + errs.join('\n')); process.exit(1); }
console.log('\n完成：' + OUT);
