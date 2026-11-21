/**
 * 确定性验收的独立门禁：证明回归断言不依赖页面帧率。
 *
 * 同一个状态推进序列分别在
 *   A. 主循环正常（rAF 按真实帧率驱动）
 *   B. requestAnimationFrame 完全停摆（等同于「机器慢到没有帧」）
 * 两种页面下执行，要求结果逐位相同。
 *
 * 背景：主循环用 Math.min(0.05, clock.getDelta()) 防止切标签页后的大跳，
 * 无 GPU 的 CI 上 wall-clock 与仿真时间可以差一个数量级。交互回归因此改用
 * app.stepWorld(0.05, frames) 推进固定仿真时间，并把每组收进单次 evaluate。
 * 本脚本就是对这条设计的反向验证：把 rAF 拿掉，结论也不许变。
 *
 * 用法：node scripts/test-determinism.mjs [url]
 * 退出码：0 = 逐位一致；1 = 出现漂移或页面异常。
 */
import { chromium } from 'playwright-core';

const URL = process.argv[2] || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ channel: 'msedge', headless: true });

async function run(label, freezeRAF) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (freezeRAF) await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__APP__ && !!window.__APP__.stepWorld, null, { timeout: 90000 });

  const r = await page.evaluate(() => {
    const a = window.__APP__;
    const rd = (v) => +v.toFixed(6);
    /* 分解：暂停 / 继续 / 反向 / 重新装配，全部在单次同步执行内完成 */
    a.explode.setProgress(0.2); a.explode.play(1); a.stepWorld(0.05, 18);
    a.explode.pause(); const pp1 = a.explode.progress;
    a.stepWorld(0.05, 12); const pp2 = a.explode.progress;
    a.explode.play(1); a.stepWorld(0.05, 14); const pp3 = a.explode.progress;
    a.explode.reverse(); a.stepWorld(0.05, 14); const pp4 = a.explode.progress;
    a.explode.setProgress(1); a.explode.reassemble(); a.stepWorld(0.05, 16);
    const rp1 = a.explode.progress;
    a.stepWorld(0.05, 24); const rp2 = a.explode.progress;
    /* 粒子淡入 / 淡出 */
    a.flow.toggle(true); a.stepWorld(0.05, 16); const on = a.flow.amount;
    a.flow.toggle(false); a.stepWorld(0.05, 18); const off = a.flow.amount;
    /* 燃机启动时序：9 × 0.70 s 仿真时间 */
    a.setConfig('gas'); a.sim.startGT();
    const steps = [];
    for (let i = 0; i < 9; i++) {
      a.stepWorld(0.05, 14);
      steps.push(a.sim.state.gtStep + ':' + a.sim.state.gtSpeed.toFixed(3));
    }
    return {
      explode: [pp1, pp2, pp3, pp4, rp1, rp2].map(rd),
      particles: [on, off].map(rd),
      gtSteps: steps,
    };
  });
  if (errors.length) throw new Error(label + ' 页面报错：' + errors.join(' | '));
  console.log(label, JSON.stringify(r));
  await page.close();
  return r;
}

const normal = await run('rAF 正常  ', false);
const frozen = await run('rAF 停摆  ', true);
await browser.close();

const same = JSON.stringify(normal) === JSON.stringify(frozen);
if (!same) {
  console.error('FAIL  确定性验收：两种帧率下状态推进结果不一致');
  console.error('  rAF 正常 ', JSON.stringify(normal));
  console.error('  rAF 停摆 ', JSON.stringify(frozen));
  process.exit(1);
}
console.log('PASS  确定性验收：rAF 正常 / 停摆两种页面下 8 组数值逐位一致（IDENTICAL true）');
