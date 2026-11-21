const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const fileUrl = 'file:///' + path.resolve('./dist/index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto(fileUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__APP__ && window.__APP__.reg.parts.length > 0, null, { timeout: 90000 });
  await page.waitForTimeout(3000);

  const info = await page.evaluate(() => {
    const a = window.__APP__;
    return {
      parts: a.reg.parts.length,
      hasComposer: !!a.composer,
      perf: a.perf,
      bootGone: getComputedStyle(document.getElementById('boot')).opacity === '0' ||
        getComputedStyle(document.getElementById('boot')).display === 'none',
      drawCalls: a.renderer.info.render.calls,
      triangles: a.renderer.info.render.triangles,
      textures: a.renderer.info.memory.textures,
    };
  });
  console.log('dist 加载:', JSON.stringify(info));

  // 分解到 50% 并截图
  await page.evaluate(() => { window.__APP__.explode.setProgress(0.5); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: './shots/d-dist-50.png' });
  const p50 = await page.evaluate(() => window.__APP__.explode.progress);
  console.log('进度:', p50);

  // 交互：播放 / 反向。用确定性步进，不依赖软件光栅 CI 的帧率
  // （主循环 dt 被 clamp 到 50 ms，wall-clock 1200 ms 不等于 1.2 s 仿真时间）。
  const motion = await page.evaluate(() => {
    const a = window.__APP__;
    a.explode.setProgress(0); a.explode.play(1); a.stepWorld(0.05, 24); // 1.20 s 仿真时间
    const moving = a.explode.progress;
    a.explode.reverse(); a.stepWorld(0.05, 12);                          // 0.60 s
    const reversed = a.explode.progress;
    return { moving, reversed };
  });
  const { moving, reversed } = motion;
  console.log(`播放后 ${moving.toFixed(3)} → 反向后 ${reversed.toFixed(3)}`);

  // 重置到装配态并出图
  await page.evaluate(() => { window.__APP__.explode.setProgress(0); window.__APP__.setSection('off'); });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    for (const id of ['panel-left', 'panel-right', 'bottombar', 'topbar', 'labels']) {
      const el = document.getElementById(id); if (el) el.style.display = 'none';
    }
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: './shots/d-dist-assembly.png' });

  const bytes = fs.statSync('./dist/index.html').size;
  console.log('单文件体积:', (bytes / 1024).toFixed(0) + ' kB');
  console.log('运行报错:', errs.length ? errs.slice(0, 5) : '无');
  await browser.close();
  const ok = info.parts >= 150 && errs.length === 0 && moving > 0.05 && reversed < moving;
  console.log(ok ? '\nDIST PASS' : '\nDIST FAIL');
  process.exit(ok ? 0 : 1);
})();
