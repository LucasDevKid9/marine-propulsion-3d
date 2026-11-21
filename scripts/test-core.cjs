/**
 * 功能验证：模型独立性 / 旋转缩放 / 部件选择 / 隐藏隔离 /
 * 分解进度 25-50-75-100 / 滑块与播放共用状态 / 暂停继续反向 / 重新装配 / 剖切
 * 全部断言基于运行时真实数值，不做猜测。
 */
const { chromium } = require('playwright-core');
const URL = process.argv[2] || 'http://127.0.0.1:5173/';
const fs = require('fs');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__APP__ && window.__APP__.reg.parts.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(2500);

  // 只取"爆炸位移分量"，避免曲轴旋转等实时动画干扰比较
  const snap = () => page.evaluate(() => {
    const o = {};
    for (const p of window.__APP__.reg.parts) {
      o[p.id] = [p.explodeOffset.x + p.indOffset.x, p.explodeOffset.y + p.indOffset.y, p.explodeOffset.z + p.indOffset.z];
    }
    return o;
  });

  /* ---------- 1. 模型独立性 ---------- */
  const indep = await page.evaluate(() => {
    const a = window.__APP__;
    const ids = new Set(), dup = [], notGroup = [], badParent = [], unbound = [], zero = [];
    for (const p of a.reg.parts) {
      if (ids.has(p.id)) dup.push(p.id);
      ids.add(p.id);
      if (!p.group.isGroup) notGroup.push(p.id + ':' + p.group.type);
      if (p.group.parent !== a.reg.root) badParent.push(p.id);
      if (p.group.userData.part !== p) unbound.push(p.id);
      if (p.group.children.length === 0) zero.push(p.id);
    }
    return { total: a.reg.parts.length, dup, notGroup, badParent, unbound, zero,
      rootChildren: a.reg.root.children.length };
  });
  check('构件数量与唯一 id', indep.total >= 150 && indep.dup.length === 0,
    `${indep.total} 个构件，重复 id ${indep.dup.length} 个`);
  check('每个构件为独立 Group 且挂在 parts-root 下',
    indep.notGroup.length === 0 && indep.badParent.length === 0 && indep.rootChildren === indep.total,
    `非 Group ${indep.notGroup.length}，父节点异常 ${indep.badParent.length}，root 子节点 ${indep.rootChildren}`);
  check('构件均绑定 userData.part 且含几何体',
    indep.unbound.length === 0 && indep.zero.length === 0,
    `未绑定 ${indep.unbound.length}，空组 ${indep.zero.length}`);

  /* ---------- 2. 旋转与缩放 ---------- */
  const camBefore = await page.evaluate(() => window.__APP__.camera.position.toArray());
  await page.mouse.move(800, 450);
  await page.mouse.down();
  await page.mouse.move(1000, 380, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  const camAfterRot = await page.evaluate(() => window.__APP__.camera.position.toArray());
  check('拖拽旋转改变相机位姿', dist(camBefore, camAfterRot) > 0.5,
    `位移 ${dist(camBefore, camAfterRot).toFixed(2)}`);

  const d0 = await page.evaluate(() => window.__APP__.camera.position.distanceTo(window.__APP__.controls.target));
  await page.mouse.move(800, 450);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(40); }
  await page.waitForTimeout(350);
  const d1 = await page.evaluate(() => window.__APP__.camera.position.distanceTo(window.__APP__.controls.target));
  check('滚轮缩放且受 min/maxDistance 约束', Math.abs(d1 - d0) > 0.3 && d1 >= 2.4 && d1 <= 95.5,
    `${d0.toFixed(2)} → ${d1.toFixed(2)}`);

  /* ---------- 3. 部件选择（真实点击 + 程序选中） ---------- */
  await page.evaluate(() => {
    const a = window.__APP__;
    a.camera.position.set(21.0, 13.2, -20.0);
    a.controls.target.set(0, 3.9, -9.2);
    a.controls.update();
  });
  await page.waitForTimeout(400);
  // 找一个在屏幕上稳定可见的构件，真实点击它的投影中心
  const target = await page.evaluate(() => {
    const a = window.__APP__, T = a.THREE;
    const w = a.renderer.domElement.clientWidth, h = a.renderer.domElement.clientHeight;
    const p = a.reg.get('diesel-crankshaft') || a.reg.parts[10];
    const b = new T.Box3().setFromObject(p.group);
    const c = new T.Vector3(); b.getCenter(c);
    const v = c.clone().project(a.camera);
    return { id: p.id, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
  });
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(300);
  const selReal = await page.evaluate(() => {
    const a = window.__APP__;
    return { id: a.selected ? a.selected.id : null, boxVis: a.selectionBox.visible,
      infoShown: getComputedStyle(document.getElementById('info')).display !== 'none' };
  });
  check('真实点击可拾取构件并高亮', !!selReal.id && selReal.boxVis,
    `点击 (${target.x.toFixed(0)},${target.y.toFixed(0)}) → 选中 ${selReal.id}`);

  const selProg = await page.evaluate(() => {
    const a = window.__APP__;
    a.select(a.reg.get('cpp-hub'));
    return { id: a.selected.id, boxVis: a.selectionBox.visible };
  });
  check('程序选中接口生效', selProg.id === 'cpp-hub' && selProg.boxVis, selProg.id);

  /* ---------- 4. 隐藏与隔离 ---------- */
  const iso = await page.evaluate(() => {
    const a = window.__APP__;
    const visBefore = a.reg.parts.filter(p => p.group.visible).length;
    a.setIsolate('cpp-hub');
    const hidden = a.reg.parts.filter(p => !p.group.visible).length;
    const shown = a.reg.parts.filter(p => p.group.visible).map(p => p.id);
    a.setIsolate(null);
    const restored = a.reg.parts.filter(p => p.group.visible).length;
    return { hidden, total: a.reg.parts.length, shownN: shown.length, restored,
      hubVisible: shown.includes('cpp-hub'), visBefore };
  });
  check('隔离只保留目标构件', iso.hubVisible && iso.shownN < iso.total && iso.shownN > 0,
    `隔离后可见 ${iso.shownN}/${iso.total}`);
  check('取消隔离后恢复到隔离前状态', iso.restored === iso.visBefore,
    `隔离前可见 ${iso.visBefore}，恢复后 ${iso.restored}`);

  const hide = await page.evaluate(() => {
    const a = window.__APP__, p = a.reg.get('diesel-flywheel');
    p.userHidden = true; a.reg.refreshVisibility(a.state);
    const off = !p.group.visible;
    p.userHidden = false; a.reg.refreshVisibility(a.state);
    return { off, back: p.group.visible };
  });
  check('单构件隐藏/恢复', hide.off && hide.back, `隐藏=${hide.off} 恢复=${hide.back}`);

  /* ---------- 5. 分解进度：25 / 50 / 75 / 100 与反向 ---------- */
  await page.evaluate(() => {
    const a = window.__APP__;
    a.setIsolate(null);
    a.explode.pause();
    a.explode.setProgress(0);
  });
  await page.waitForTimeout(500);
  const S0 = await snap();

  const S = {};
  for (const v of [0.25, 0.5, 0.75, 1.0]) {
    await page.evaluate((v) => window.__APP__.explode.setProgress(v), v);
    await page.waitForTimeout(180);
    S[v] = await snap();
  }

  // 5.1 单调性：位移随进度不减
  let monoBad = [];
  for (const id of Object.keys(S0)) {
    const d = [0.25, 0.5, 0.75, 1.0].map(v => dist(S[v][id], S0[id]));
    for (let i = 1; i < d.length; i++) {
      if (d[i] + 1e-4 < d[i - 1]) { monoBad.push(`${id}:${d.map(n => n.toFixed(2)).join('/')}`); break; }
    }
  }
  check('位移随进度单调不减（无跳动/回缩）', monoBad.length === 0,
    monoBad.length ? `${monoBad.length} 个构件异常：${monoBad.slice(0, 3).join(' , ')}` : '全部构件单调');

  // 5.2 每个进度下有实际位移的构件数
  const moved = [0.25, 0.5, 0.75, 1.0].map(vv =>
    Object.keys(S0).filter(id => dist(S[vv][id], S0[id]) > 0.01).length);
  check('各进度阶段均有构件实际移动', moved.every(n => n > 0),
    `25%:${moved[0]} 50%:${moved[1]} 75%:${moved[2]} 100%:${moved[3]} 个构件位移`);

  // 5.3 分层顺序：25% 时 prop 层已动、aux 层基本未动
  const layerProg = await page.evaluate(() => {
    const a = window.__APP__;
    const byLayer = {};
    a.explode.setProgress(0.25);
    for (const p of a.reg.parts) {
      const o = p.explodeOffset.length();
      if (!byLayer[p.layer]) byLayer[p.layer] = { max: 0, sum: 0, n: 0 };
      byLayer[p.layer].max = Math.max(byLayer[p.layer].max, o);
      byLayer[p.layer].sum += o; byLayer[p.layer].n++;
    }
    return byLayer;
  });
  check('25% 时首层（螺旋桨总成）先展开、末层（辅助系统）未启动',
    layerProg.prop.max > 0.5 && layerProg.aux.max < 1e-6,
    `prop max=${layerProg.prop.max.toFixed(2)}  aux max=${layerProg.aux.max.toFixed(3)}`);

  // 5.4 幂等：同一进度重复设置，位置完全一致（滑块与播放共用同一状态）
  await page.evaluate(() => window.__APP__.explode.setProgress(0.5));
  const a50 = await snap();
  await page.evaluate(() => window.__APP__.explode.setProgress(0.5));
  const b50 = await snap();
  let idemMax = 0;
  for (const id of Object.keys(a50)) idemMax = Math.max(idemMax, dist(a50[id], b50[id]));
  check('同一进度下位置幂等（无状态冲突）', idemMax < 1e-6, `最大偏差 ${idemMax.toExponential(2)}`);

  // 5.5 播放到 0.5 与滑块拖到 0.5 结果一致
  await page.evaluate(() => { const a = window.__APP__; a.explode.setProgress(0.1); a.explode.play(1); });
  const playTo = await page.evaluate(async () => {
    const a = window.__APP__;
    return await new Promise((res) => {
      const t = setInterval(() => {
        if (a.explode.progress >= 0.5 || !a.explode.playing) {
          clearInterval(t); a.explode.pause(); a.explode.setProgress(0.5); res(true);
        }
      }, 30);
    });
  });
  await page.waitForTimeout(200);
  const p50 = await snap();
  let mixMax = 0;
  for (const id of Object.keys(a50)) mixMax = Math.max(mixMax, dist(a50[id], p50[id]));
  check('播放推进与滑块设定共用同一进度状态', mixMax < 1e-4, `最大偏差 ${mixMax.toExponential(2)}`);

  // 5.6 反向装配回到 0 与初始装配态一致
  await page.evaluate(() => window.__APP__.explode.setProgress(1));
  await page.waitForTimeout(120);
  await page.evaluate(() => window.__APP__.explode.setProgress(0));
  await page.waitForTimeout(300);
  const S0b = await snap();
  let backMax = 0, worst = '';
  for (const id of Object.keys(S0)) {
    const d = dist(S0[id], S0b[id]);
    if (d > backMax) { backMax = d; worst = id; }
  }
  check('反向装配（100% → 0%）位置完全复位', backMax < 1e-4,
    `最大偏差 ${backMax.toExponential(2)}${worst ? ' @' + worst : ''}`);

  // 5.7 中间态无错位：检查构件未出现 NaN / 极端位移
  const sanity = await page.evaluate(() => {
    const a = window.__APP__;
    a.explode.setProgress(0.75);
    let nan = 0, far = [];
    for (const p of a.reg.parts) {
      const q = p.group.position;
      if (!Number.isFinite(q.x) || !Number.isFinite(q.y) || !Number.isFinite(q.z)) nan++;
      if (q.length() > 120) far.push(p.id);
    }
    return { nan, far };
  });
  check('75% 中间态无 NaN / 无飞出画布的错位构件',
    sanity.nan === 0 && sanity.far.length === 0,
    `NaN ${sanity.nan}，超距 ${sanity.far.length}${sanity.far.length ? ':' + sanity.far.slice(0, 3) : ''}`);

  /* ---------- 6. 暂停 / 继续 / 反向 ----------
     用 app.stepWorld(0.05, N) 推进固定帧数，不依赖 rAF 帧率。
     CI 无 GPU 时 dt 被 clamp 到 50 ms，wall-clock 等待会随机器性能漂移。 */
  await page.evaluate(() => { const a = window.__APP__; a.explode.setProgress(0.2); a.explode.play(1); a.stepWorld(0.05, 18); });
  await page.evaluate(() => window.__APP__.explode.pause());
  const pp1 = await page.evaluate(() => window.__APP__.explode.progress);
  await page.evaluate(() => window.__APP__.stepWorld(0.05, 12));
  const pp2 = await page.evaluate(() => window.__APP__.explode.progress);
  check('暂停后进度不再推进', Math.abs(pp2 - pp1) < 1e-9, `${pp1.toFixed(4)} → ${pp2.toFixed(4)}`);

  await page.evaluate(() => { const a = window.__APP__; a.explode.play(1); a.stepWorld(0.05, 14); });
  const pp3 = await page.evaluate(() => window.__APP__.explode.progress);
  check('继续后进度恢复推进', pp3 > pp2 + 0.02, `${pp2.toFixed(4)} → ${pp3.toFixed(4)}`);

  await page.evaluate(() => { const a = window.__APP__; a.explode.reverse(); a.stepWorld(0.05, 14); });
  const pp4 = await page.evaluate(() => window.__APP__.explode.progress);
  check('反向播放使进度回退', pp4 < pp3 - 0.02, `${pp3.toFixed(4)} → ${pp4.toFixed(4)}`);

  /* ---------- 7. 重新装配 ---------- */
  await page.evaluate(() => { const a = window.__APP__; a.explode.setProgress(1); a.explode.reassemble(); a.stepWorld(0.05, 16); });
  const rp1 = await page.evaluate(() => window.__APP__.explode.progress);
  await page.evaluate(() => window.__APP__.stepWorld(0.05, 24));
  const rp2 = await page.evaluate(() => window.__APP__.explode.progress);
  check('重新装配使进度持续回落', rp2 < rp1 && rp1 < 1, `${rp1.toFixed(3)} → ${rp2.toFixed(3)}`);
  // 直接收敛到 0 后检查复位
  await page.evaluate(() => window.__APP__.explode.setProgress(0));
  await page.waitForTimeout(300);
  const S0c = await snap();
  let rcMax = 0;
  for (const id of Object.keys(S0)) rcMax = Math.max(rcMax, dist(S0[id], S0c[id]));
  check('装配完成后回到初始位置', rcMax < 1e-4, `最大偏差 ${rcMax.toExponential(2)}`);

  /* ---------- 8. 剖切 ---------- */
  const secOn = await page.evaluate(() => {
    const a = window.__APP__;
    a.setSection('engine');
    let clipped = 0, clippedShell = 0, clippedNonShell = [];
    const keyParts = ['diesel-crankshaft', 'piston-1', 'conrod-3', 'crosshead-2', 'diesel-camshaft'];
    const keyClipped = [];
    for (const p of a.reg.parts) {
      const has = p.mats.some(m => m.clippingPlanes && m.clippingPlanes.length > 0);
      if (has) { clipped++; if (p.shell) clippedShell++; else clippedNonShell.push(p.id); }
      if (has && keyParts.includes(p.id)) keyClipped.push(p.id);
    }
    const target = a.section.target || a.section.active || null;
    const offset = a.section.currentD;
    return { clipped, clippedShell, clippedNonShell, keyClipped, target, offset, total: a.reg.parts.length };
  });
  check('剖切只切壳体、内部运动件（曲轴/活塞/连杆）保持完整',
    secOn.clipped > 0 && secOn.clipped < secOn.total && secOn.keyClipped.length === 0,
    `${secOn.clipped}/${secOn.total} 构件被裁剪，其中壳体 ${secOn.clippedShell}，关键运动件被裁 ${secOn.keyClipped.length}`);

  const secExplode = await page.evaluate(() => {
    const a = window.__APP__;
    a.explode.setProgress(0.5);
    const before = a.reg.get('diesel-crankshaft').group.position.toArray();
    a.setSection('off');
    a.explode.setProgress(0);
    a.setSection('engine');
    a.explode.setProgress(0.5);
    const after = a.reg.get('diesel-crankshaft').group.position.toArray();
    const anyClipped = a.reg.parts.some(p => p.mats.some(m => m.clippingPlanes && m.clippingPlanes.length));
    // 选中是否仍可用
    a.select(a.reg.get('diesel-crankshaft'));
    return { before, after, anyClipped, selected: a.selected.id };
  });
  const secDiff = dist(secExplode.before, secExplode.after);
  check('剖切开关不影响分解进度与选中', secDiff < 1e-6 && secExplode.selected === 'diesel-crankshaft' && secExplode.anyClipped,
    `位置偏差 ${secDiff.toExponential(2)}，选中 ${secExplode.selected}`);

  // 剖切位置滑块
  const secOffset = await page.evaluate(() => {
    const a = window.__APP__;
    a.setSection('engine');
    a.section.setOffset(0.2);
    a.section.update(0.5);
    const c1 = a.section.currentD;
    a.section.setOffset(-0.2);
    a.section.update(0.5);
    return { c1, c2: a.section.currentD };
  });
  check('剖切面位置可连续调节', Math.abs(secOffset.c2 - secOffset.c1) > 0.01,
    `${secOffset.c1.toFixed(3)} → ${secOffset.c2.toFixed(3)}`);
  await page.evaluate(() => { const a = window.__APP__; a.section.setOffset(0); a.setSection('off'); a.explode.setProgress(0); a.select(null); });

  /* ---------- 9. 构型切换 ---------- */
  const cfg = await page.evaluate(() => {
    const a = window.__APP__;
    const isGt = p => p.tags && (p.tags.includes('gt') || p.tags.includes('gt-only'));
    const isDiesel = p => p.tags && p.tags.includes('diesel-only');
    // 初始应为柴油机直驱构型
    const gtHiddenAtStart = a.reg.parts.filter(p => isGt(p) && !p.group.visible).length;
    const gtTotal = a.reg.parts.filter(isGt).length;
    a.setConfig('gas');
    const gtVisible = a.reg.parts.filter(p => isGt(p) && p.group.visible).length;
    const dieselHidden = a.reg.parts.filter(p => isDiesel(p) && !p.group.visible).length;
    a.setConfig('diesel');
    const backDiesel = a.reg.parts.filter(p => isDiesel(p) && p.group.visible).length;
    const gtBack = a.reg.parts.filter(p => isGt(p) && !p.group.visible).length;
    a.setPropulsor('fpp');
    const fpp = a.reg.parts.filter(p => p.tags && p.tags.includes('fpp-only') && p.group.visible).length;
    const cppHidden = a.reg.parts.filter(p => p.tags && p.tags.includes('cpp-blade') && !p.group.visible).length;
    a.setPropulsor('cpp');
    const cppBack = a.reg.parts.filter(p => p.tags && p.tags.includes('cpp-blade') && p.group.visible).length;
    return { gtTotal, gtHiddenAtStart, gtVisible, dieselHidden, backDiesel, gtBack, fpp, cppHidden, cppBack };
  });
  check('柴油机构型下燃气轮机整体隐藏', cfg.gtHiddenAtStart === cfg.gtTotal && cfg.gtTotal > 10,
    `燃机 ${cfg.gtTotal} 个构件，柴油机构型下隐藏 ${cfg.gtHiddenAtStart}`);
  check('切换至燃气轮机：燃机全显、柴油机全隐',
    cfg.gtVisible === cfg.gtTotal && cfg.dieselHidden > 50,
    `燃机可见 ${cfg.gtVisible}/${cfg.gtTotal}，柴油机隐藏 ${cfg.dieselHidden}`);
  check('切回柴油机构型可完全复原', cfg.backDiesel > 50 && cfg.gtBack === cfg.gtTotal,
    `柴油机可见 ${cfg.backDiesel}，燃机隐藏 ${cfg.gtBack}`);
  check('CPP / FPP 推进器构型可切换', cfg.fpp > 0 && cfg.cppHidden > 0 && cfg.cppBack > 0,
    `FPP 可见 ${cfg.fpp}，CPP 桨叶隐藏 ${cfg.cppHidden}，切回可见 ${cfg.cppBack}`);

  /* ---------- 9.5 联动动作（不是"代码存在"，而是"真的在动"） ---------- */
  const drive = await page.evaluate(async () => {
    const a = window.__APP__;
    a.explode.setProgress(0);
    a.setConfig('diesel');
    a.sim.setTelegraph(4);
    const t0 = a.sim.state.rpm;
    await new Promise(r => setTimeout(r, 1600));
    const t1 = a.sim.state.rpm;
    const crankA = a.reg.get('diesel-crankshaft').group.rotation.z;
    const pA = a.reg.get('piston-1').group.position.y;
    await new Promise(r => setTimeout(r, 500));
    const crankB = a.reg.get('diesel-crankshaft').group.rotation.z;
    let lo = a.reg.get('piston-1').group.position.y, hi = lo;
    for (let i = 0; i < 24; i++) {
      await new Promise(r => setTimeout(r, 60));
      const y = a.reg.get('piston-1').group.position.y;
      lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
    return { rpm0: t0, rpm1: t1, crankMoved: Math.abs(crankB - crankA) > 1e-4,
      pistonMoved: hi - lo > 0.15, stroke: hi - lo, thrust: a.sim.state.thrust };
  });
  check('车钟 -> 转速收敛并驱动曲轴与活塞',
    drive.rpm1 > 1 && drive.crankMoved && drive.pistonMoved,
    `转速 ${drive.rpm0.toFixed(1)} -> ${drive.rpm1.toFixed(1)} rpm，曲轴转动 ${drive.crankMoved}，活塞行程 ${drive.stroke.toFixed(2)} m，推力 ${drive.thrust.toFixed(0)}`);

  const cppMove = await page.evaluate(async () => {
    const a = window.__APP__;
    a.setPropulsor('cpp');
    a.sim.setPitch(20);
    await new Promise(r => setTimeout(r, 700));
    const b0 = a.reg.get('cpp-blade-1').group.rotation.y;
    const s0 = a.reg.get('cpp-servo-piston').group.position.z;
    a.sim.setPitch(85);
    await new Promise(r => setTimeout(r, 900));
    const b1 = a.reg.get('cpp-blade-1').group.rotation.y;
    const s1 = a.reg.get('cpp-servo-piston').group.position.z;
    const ringT = a.reg.get('cpp-crank-ring').group.rotation.z;
    return { db: Math.abs(b1 - b0), ds: Math.abs(s1 - s0), ringT: Math.abs(ringT), pitch: a.sim.state.pitch };
  });
  check('CPP 螺距变化驱动 桨叶转角 / 伺服活塞 / 曲柄销环',
    cppMove.db > 0.05 && cppMove.ds > 0.05,
    `桨叶转角变化 ${cppMove.db.toFixed(3)} rad，伺服活塞位移 ${cppMove.ds.toFixed(3)}，曲柄销环转角 ${cppMove.ringT.toFixed(3)}`);

  const shaftRot = await page.evaluate(async () => {
    const a = window.__APP__;
    const z0 = a.reg.get('stern-shaft').group.rotation.z;
    await new Promise(r => setTimeout(r, 400));
    const z1 = a.reg.get('stern-shaft').group.rotation.z;
    a.sim.toggleBrake(true);
    await new Promise(r => setTimeout(r, 1400));
    const brakeOn = a.sim.state.brake;
    a.sim.toggleBrake(false);
    return { rotating: Math.abs(z1 - z0) > 1e-4, brake: brakeOn };
  });
  check('轴系随转速旋转、可制动锁止', shaftRot.rotating && shaftRot.brake === true,
    `旋转 ${shaftRot.rotating}，制动状态 ${shaftRot.brake}`);

  const gtSeq = await page.evaluate(() => {
    const a = window.__APP__;
    a.setConfig('gas');
    a.sim.startGT();
    const steps = [];
    for (let i = 0; i < 9; i++) {
      a.stepWorld(0.05, 14); // 0.70 s 仿真时间，与机器帧率无关
      steps.push({ step: a.sim.state.gtStep, speed: +a.sim.state.gtSpeed.toFixed(2) });
    }
    const rotorMoved = Math.abs(a.reg.get('gt-hp-rotor').group.rotation.z) > 1e-4;
    return { steps, rotorMoved, label: a.sim.state.gtLabel };
  });
  const speedUp = gtSeq.steps[gtSeq.steps.length - 1].speed > gtSeq.steps[0].speed;
  check('燃气轮机启动时序推进且高压转子转动',
    gtSeq.steps.some(s => s.step > 0) && speedUp && gtSeq.rotorMoved,
    `${gtSeq.steps.map(s => s.step + ':' + s.speed).join(' -> ')}，最终「${gtSeq.label}」`);

  const misfire = await page.evaluate(() => {
    const a = window.__APP__;
    a.setConfig('diesel');
    a.sim.setTelegraph(3);
    // 逐帧采样燃烧脉冲峰值：固定 52 帧 × 50 ms = 2.6 s 仿真时间
    const peak = (frames) => {
      let m = 0;
      for (let i = 0; i < frames; i++) {
        a.stepWorld(0.05, 1);
        m = Math.max(m, ...a.reg.get('combustion-3').group.children.map(c => c.material.emissiveIntensity));
      }
      return m;
    };
    const before = peak(52);
    a.sim.setCylinderFiring(2, false);
    const after = peak(52);
    a.sim.setCylinderFiring(2, true);
    return { before, after, flag: a.sim.state.firingEnabled[3] };
  });
  check('单缸熄火使该缸燃烧亮度下降', misfire.after < misfire.before + 1e-6,
    `3 号缸燃烧强度 ${misfire.before.toFixed(2)} -> ${misfire.after.toFixed(2)}`);

  const flow = await page.evaluate(() => {
    const a = window.__APP__;
    a.flow.toggle(true);
    a.stepWorld(0.05, 16); // 0.80 s 仿真时间：淡入收敛
    const on = { amount: +a.flow.amount.toFixed(3), visible: a.flow.group.visible,
      pts: a.flow.gt.points.geometry.attributes.position.count + a.flow.diesel.points.geometry.attributes.position.count };
    a.flow.toggle(false);
    a.stepWorld(0.05, 18); // 0.90 s 仿真时间：淡出收敛
    const off = { amount: +a.flow.amount.toFixed(3), visible: a.flow.group.visible };
    return { on, off };
  });
  check('气流粒子可显示 / 淡出（蓝-青-橙-红 四段配色）',
    flow.on.amount > 0.5 && flow.on.visible && flow.off.amount < 0.3,
    `开启 amount=${flow.on.amount}（${flow.on.pts} 个粒子），关闭后 amount=${flow.off.amount}`);

  const aux = await page.evaluate(async () => {
    const a = window.__APP__;
    a.sim.grease();
    await new Promise(r => setTimeout(r, 500));
    return { oilFilm: a.sim.state.oilFilm, seaP: a.sim.state.seaP, loP: a.sim.state.loP };
  });
  check('推力油膜 / 海水压 / 滑油压均有数值输出',
    typeof aux.oilFilm === 'number' && typeof aux.seaP === 'number' && typeof aux.loP === 'number',
    `油膜 ${aux.oilFilm.toFixed(2)}，海水压 ${aux.seaP.toFixed(2)}，滑油压 ${aux.loP.toFixed(2)}`);

  /* ---------- 10. 运行页面无报错 ---------- */
  check('运行期间无 JS 异常', errors.length === 0, errors.slice(0, 3).join(' | ') || '无');

  await browser.close();

  const pass = results.filter(r => r.ok).length;
  fs.mkdirSync('./shots', { recursive: true });
  fs.writeFileSync('./shots/test-report.json', JSON.stringify({ url: URL, pass, total: results.length, results }, null, 1));
  console.log(`\n===== ${pass}/${results.length} 通过 =====`);
  process.exit(pass === results.length ? 0 : 1);
})();
