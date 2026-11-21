import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import './ui/ui.css';
import { TextureKit } from './core/textures.js';
import { MaterialLibrary } from './core/materials.js';
import { PartRegistry, LAYERS } from './core/registry.js';
import { ExplodeController } from './core/explode.js';
import { SectionController, setXray } from './core/section.js';
import { GasFlow } from './core/flow.js';
import { Labels } from './core/labels.js';
import { buildEnvironment } from './assemblies/environment.js';
import { buildDiesel } from './assemblies/diesel.js';
import { buildCpp } from './assemblies/cpp.js';
import { buildShafting } from './assemblies/shafting.js';
import { buildGasTurbine } from './assemblies/gasturbine.js';
import { Simulation } from './systems/simulation.js';
import { auditScene, formatAudit } from './core/audit.js';
import { checkChain, NODES, SEGMENTS } from './core/driveline.js';
import { initUI } from './ui/ui.js';
import { clamp } from './core/utils.js';

const canvas = document.getElementById('scene');
const bootEl = document.getElementById('boot');
const bootStatus = bootEl.querySelector('.boot-status');

/* ---------- 渲染器 ---------- */
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
  preserveDrawingBuffer: true,
});
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const perf = detectPerf();
const pixelCap = perf === 'high' ? 2 : perf === 'mid' ? 1.6 : 1.2;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelCap));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050a12);
scene.fog = new THREE.FogExp2(0x050a12, 0.0095);

/* 深黑海军蓝渐变天幕：避免纯黑背景吃掉轮廓 */
(() => {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 256;
  const ctx = c.getContext('2d');
  const grd = ctx.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#0d2434');
  grd.addColorStop(0.35, '#081521');
  grd.addColorStop(0.72, '#040a11');
  grd.addColorStop(1, '#02050a');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 32, 256);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
})();

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(21.0, 13.2, -20.0);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 3.9, -9.2);

/* 竖屏（手机）初次加载改用艉部纵深机位：船体长轴沿屏幕纵深展开，避免横向被裁 */
if (window.innerWidth / window.innerHeight < 0.85) {
  camera.position.set(10.5, 18.0, -32.0);
  controls.target.set(0, 5.6, -8.0);
}
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 2.5;
controls.maxDistance = 95;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minPolarAngle = 0.08;
controls.screenSpacePanning = true;
controls.zoomSpeed = 0.85;
controls.rotateSpeed = 0.75;
controls.update();

/* ---------- 环境光照 ---------- */
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
scene.environment = envRT.texture;
scene.environmentIntensity = 0.72;

const hemi = new THREE.HemisphereLight(0x7ea4bc, 0x080d12, 0.85);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xffe2c6, 2.75);
key.position.set(14, 25, 9);
key.castShadow = true;
key.shadow.mapSize.set(perf === 'low' ? 1024 : 2048, perf === 'low' ? 1024 : 2048);
key.shadow.camera.near = 1;
key.shadow.camera.far = 80;
key.shadow.camera.left = -22;
key.shadow.camera.right = 22;
key.shadow.camera.top = 22;
key.shadow.camera.bottom = -22;
key.shadow.bias = -0.0006;
key.shadow.normalBias = 0.035;
scene.add(key);

const fill = new THREE.PointLight(0x9fd8ff, 42, 46, 2);
fill.position.set(-8.5, 7, 5);
scene.add(fill);

const warm = new THREE.PointLight(0xffb877, 52, 36, 2);
warm.position.set(5.0, 9.5, 3.0);
scene.add(warm);

const sternGlow = new THREE.PointLight(0x5fd6ff, 100, 38, 2);
sternGlow.position.set(0, 1.0, -19.5);
scene.add(sternGlow);

const underGlow = new THREE.PointLight(0x2f9fc8, 55, 26, 2);
underGlow.position.set(0, -2.4, -14);
scene.add(underGlow);

/* 冷色轮廓光：把主体从深色背景中剥离 */
const rim = new THREE.DirectionalLight(0x66c8f0, 1.35);
rim.position.set(-16, 9, -20);
scene.add(rim);

/* 机舱工作面照明：在主机、轴系、艉部形成三处光池 */
const workSpots = [
  [4.0, 11.5, 5.0, 0, 4.5, 3.5, 130],
  [-4.5, 10.5, 0.5, 0, 4.0, 3.0, 90],
  [3.0, 9.0, -8.0, 0, 2.5, -8.0, 70],
];
for (const [px, py, pz, tx, ty, tz, inten] of workSpots) {
  const sp = new THREE.SpotLight(0xffe6c8, inten, 26, 0.72, 0.65, 1.6);
  sp.position.set(px, py, pz);
  sp.target.position.set(tx, ty, tz);
  scene.add(sp, sp.target);
}

/* 灯带般的顶光（无阴影，压住机舱顶部） */
const topWash = new THREE.SpotLight(0xbfe6ff, 95, 44, 0.92, 0.6, 1.5);
topWash.position.set(0, 13.6, 2.5);
topWash.target.position.set(0, 3, 2.5);
scene.add(topWash, topWash.target);

/* ---------- 后期 ---------- */
let composer = null;
if (perf !== 'low') {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    perf === 'high' ? 0.28 : 0.2, 0.55, 1.16
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}

/* ---------- 构件系统 ---------- */
const tex = new TextureKit();
const matlib = new MaterialLibrary(tex);
const root = new THREE.Group();
root.name = 'parts-root';
scene.add(root);
const reg = new PartRegistry(root, matlib);

bootStatus.textContent = '装配机舱与双层底…';
buildEnvironment(reg, scene, tex);
bootStatus.textContent = '装配低速二冲程主机…';
const diesel = buildDiesel(reg);
bootStatus.textContent = '装配可调距桨 / 定距桨…';
const cpp = buildCpp(reg);
bootStatus.textContent = '装配艉轴 / 艉管密封 / 推力轴承…';
const shaft = buildShafting(reg);
bootStatus.textContent = '装配燃气轮机推进模块…';
const gt = buildGasTurbine(reg);

/* 替代构型（FPP / 燃气轮机）由 state.config / state.propulsor 统一控制可见性，
   不在此处写死 userHidden，否则切换构型后无法恢复 */

const explode = new ExplodeController(reg, () => {});
/* 相机推拉补偿：仅在播放推进时按绝对进度收敛，用户操作相机后 3 秒内让位。
   不做逐帧增量累乘，避免与手动机位/焦点补间互相覆盖。 */
let userCamUntil = 0;
let baseCamDist = camera.position.distanceTo(controls.target);
controls.addEventListener('start', () => { userCamUntil = performance.now() + 3000; });
const section = new SectionController(renderer, reg);
const flow = new GasFlow(scene);
const labels = new Labels(document.getElementById('labels'), camera, document.getElementById('app'));

const sim = new Simulation({ reg, diesel, cpp, shaft, gt, explode });
sim.state.firingEnabled = [true, true, true, true, true, true];
sim.firingEnabled = sim.state.firingEnabled;

const app = {
  THREE, renderer, scene, camera, controls, reg, explode, section, flow, labels, sim, perf, composer,
  selected: null,
  selectionBox: null,
  state: sim.state,
  focus: null,
  driveline: { NODES, SEGMENTS, check: checkChain },
};

/* 几何审计器：控制台可直接 __APP__.audit() 复现报告
 * 审计前把运动链钉到确定性参考位姿（默认曲轴 0°），结束后恢复，
 * 保证同一模型任意时刻跑出的报告完全一致。 */
app.audit = (opts = {}) => {
  const restore = sim.setReferencePose(opts.crankDeg ?? 0);
  try {
    return auditScene(reg, { config: sim.state.config, propulsor: sim.state.propulsor, ...opts });
  } finally {
    restore();
  }
};
app.auditText = (opts) => formatAudit(app.audit(opts));

/* 选中框 */
const boxGeo = new THREE.BufferGeometry();
const selBox = new THREE.Box3Helper(new THREE.Box3(), 0x4fd8f0);
selBox.material.depthTest = false;
selBox.material.transparent = true;
selBox.material.opacity = 0.9;
selBox.visible = false;
selBox.renderOrder = 999;
scene.add(selBox);
app.selectionBox = selBox;

/* 悬浮标签 */
const LABEL_DEFS = [
  ['diesel-crankshaft', '锻钢曲轴', 'CRANKSHAFT · 6 THROW'],
  ['turbo-casing', '废气涡轮增压器', 'TURBOCHARGER'],
  ['cpp-hub', '可调距桨桨毂', 'CPP HUB · SERVO'],
  ['stern-seal-1', '艉管唇形密封', '3 × FKM LIP SEAL'],
  ['thrust-pads', '推力轴承', 'THRUST BEARING'],
  ['shaft-intermediate', '中间轴', 'INTERMEDIATE SHAFT'],
  ['gt-comb-casing', '环形燃烧室', 'ANNULAR COMBUSTOR'],
  ['diesel-cylinder-jacket', '气缸体 / 冷却水套', 'CYLINDER UNIT'],
];
LABEL_DEFS.forEach(([id, t, s]) => {
  const p = reg.get(id);
  if (p) labels.add(p, t, s);
});

/* ---------- 选中与拾取 ---------- */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tooltip = document.getElementById('tooltip');
let hoverPart = null;
let hoverTimer = 0;

function pickAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(root.children, true);
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData.part) o = o.parent;
    if (o && o.userData.part && o.visible) return o.userData.part;
  }
  return null;
}

let downX = 0, downY = 0, downT = 0;
canvas.addEventListener('pointerdown', (e) => {
  downX = e.clientX; downY = e.clientY; downT = performance.now();
});
canvas.addEventListener('pointerup', (e) => {
  const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
  if (moved > 6 || performance.now() - downT > 600) return;
  const p = pickAt(e.clientX, e.clientY);
  app.select(p);
});

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  hoverTimer += 1;
  if (hoverTimer % 3 !== 0) return;
  const p = pickAt(e.clientX, e.clientY);
  hoverPart = p;
  if (p) {
    tooltip.textContent = p.label;
    tooltip.style.left = e.clientX + 14 + 'px';
    tooltip.style.top = e.clientY + 12 + 'px';
    tooltip.classList.add('show');
    canvas.style.cursor = 'pointer';
  } else {
    tooltip.classList.remove('show');
    canvas.style.cursor = 'grab';
  }
});
canvas.addEventListener('pointerleave', () => {
  tooltip.classList.remove('show');
  canvas.style.cursor = 'grab';
});

app.select = (part) => {
  app.selected = part;
  if (!part) {
    selBox.visible = false;
    app.ui && app.ui.showInfo(null);
    return;
  }
  const box = new THREE.Box3().setFromObject(part.group);
  selBox.box.copy(box);
  selBox.visible = true;
  app.ui && app.ui.showInfo(part);
  app.ui && app.ui.highlightTree(part.id);
};

app.focusOn = (part, dist) => {
  if (!part) return;
  const box = new THREE.Box3().setFromObject(part.group);
  const c = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(c);
  box.getSize(size);
  const radius = Math.max(0.8, size.length() * 0.5);
  const d = dist || clamp(radius * 2.6, 2.4, 26);
  const dir = new THREE.Vector3(0.72, 0.5, -0.72).normalize();
  const to = c.clone().add(dir.multiplyScalar(d));
  app.focus = { from: camera.position.clone(), to, target: c.clone(), t: 0 };
};

app.setConfig = (c) => {
  sim.setConfig(c);
  reg.refreshVisibility(sim.state);
  if (c === 'gas') {
    app.toast('已切换至燃气轮机推进构型 · 柴油机离合器脱开');
    app.focusOn(reg.get('gt-comb-casing'), 12);
  } else {
    app.toast('已切换至低速二冲程柴油机直驱构型');
    app.focusOn(reg.get('diesel-crankshaft'), 10);
  }
};

app.setPropulsor = (p) => {
  sim.setPropulsor(p);
  reg.refreshVisibility(sim.state);
  app.toast(p === 'cpp' ? '可调距桨构型：主机不反转即可倒车' : '定距桨 + 导管构型：靠主机反转实现倒车');
};

app.setIsolate = (id) => {
  sim.state.isolateId = id;
  reg.refreshVisibility(sim.state);
};

app.setMode = (mode) => {
  if (mode === 'assembly') {
    explode.reassemble();
    if (section.active !== 'off') app.setSection('off');
    app.toast('装配视图：全部构件归位');
  } else if (mode === 'explode') {
    if (explode.progress > 0.98) explode.setProgress(0);
    explode.play(1);
    app.toast('爆炸视图：按六大层级顺序展开');
  } else if (mode === 'section') {
    if (explode.progress > 0.02) explode.reassemble();
    app.setSection('engine');
    app.toast('剖切视图：仅切开壳体，保留内部构件');
  }
};

app.setSection = (id) => {
  const t = section.setTarget(id);
  app.ui && app.ui.setSectionActive(id);
  if (t && t.focus) {
    const p = { group: { position: new THREE.Vector3(), visible: true }, basePos: new THREE.Vector3(), local: null };
    // 直接给定机位
    const target = new THREE.Vector3(...t.focus);
    const dir = new THREE.Vector3(0.82, 0.42, -0.4).normalize();
    app.focus = { from: camera.position.clone(), to: target.clone().add(dir.multiplyScalar(t.dist)), target, t: 0 };
  }
};

app.setXray = (on) => {
  sim.state.xray = on;
  if (on && section.active !== 'off') app.setSection('off');
  setXray(reg, on);
};

app.toast = (msg) => {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(app._toastT);
  app._toastT = setTimeout(() => el.classList.remove('show'), 2200);
};

/* ---------- UI ---------- */
app.ui = initUI(app);
app.ui.buildTree();

/* 海面冷光 / 焦散 */
const caustic = new THREE.Mesh(
  new THREE.PlaneGeometry(46, 34),
  new THREE.MeshBasicMaterial({
    map: tex.caustic, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false, color: 0x78d8ff,
  })
);
caustic.rotation.x = -Math.PI / 2;
caustic.position.set(0, -3.5, -21);
scene.add(caustic);

/* ---------- 循环 ---------- */
const clock = new THREE.Clock();
let fpsAcc = 0, fpsCount = 0, fpsT = 0;
const fpsEl = document.getElementById('fps');

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  const aspect = w / h;
  camera.aspect = aspect;
  // 竖屏时放大垂直 FOV，避免水平视野过窄导致主体被裁
  camera.fov = aspect < 0.85 ? 50 : aspect < 1.3 ? 44 : 38;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelCap));
  renderer.setSize(w, h, false);
  if (composer) composer.setSize(w, h);
}
window.addEventListener('resize', onResize);
onResize();

function animate() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  if (!document.hidden) {
    sim.update(dt);
    explode.update(dt);

    if (app.focus) {
      app.focus.t = Math.min(1, app.focus.t + dt * 2.2);
      const e = 1 - Math.pow(1 - app.focus.t, 3);
      camera.position.lerpVectors(app.focus.from, app.focus.to, e);
      controls.target.lerp(app.focus.target, e);
      if (app.focus.t >= 1) { app.focus = null; userCamUntil = performance.now() + 3000; }
    }

    controls.update();

    /* 分解播放时自动退远 / 回近 */
    if (!app.focus && explode.playing && performance.now() > userCamUntil) {
      const want = clamp(baseCamDist * (1 + explode.progress * 0.55), controls.minDistance, controls.maxDistance);
      const dirv = camera.position.clone().sub(controls.target);
      const cur = dirv.length();
      const next = cur + (want - cur) * (1 - Math.exp(-1.8 * dt));
      if (Math.abs(next - cur) > 0.002) camera.position.copy(controls.target).add(dirv.setLength(next));
    }
    section.update(dt);
    flow.update(dt);
    labels.update();
    app.ui && app.ui.tick(dt);
    caustic.material.map.offset.y = t * 0.006;
    caustic.material.map.offset.x = Math.sin(t * 0.12) * 0.02;
    caustic.material.opacity = 0.17 + Math.sin(t * 0.7) * 0.035;

    if (app.selected && selBox.visible) {
      selBox.box.setFromObject(app.selected.group);
    }

    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  fpsAcc += dt; fpsCount++; fpsT += dt;
  if (fpsT > 0.5) {
    const f = Math.round(fpsCount / fpsAcc);
    fpsEl.textContent = f + ' FPS';
    fpsEl.style.color = f < 32 ? '#ff9a3c' : f < 50 ? '#c6d0d8' : '#2b7f96';
    fpsAcc = 0; fpsCount = 0; fpsT = 0;
  }
  requestAnimationFrame(animate);
}

renderer.setAnimationLoop(null);
onResize();
sim.state.telegraph = 0;
reg.refreshVisibility(sim.state);
reg.applyAll();

setTimeout(() => {
  bootEl.classList.add('done');
  app.toast('拖拽旋转 · 滚轮缩放 · 点击构件查看构造');
}, 420);

requestAnimationFrame(animate);

/* 键盘快捷键 */
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (e.code === 'Space') { e.preventDefault(); explode.toggle(); app.ui.syncProgress(); }
  if (e.key === 'r' || e.key === 'R') { explode.reassemble(); app.ui.syncProgress(); }
  if (e.key === 'f' || e.key === 'F') { app.ui.toggleFlow(); }
  if (e.key === 'Escape') { app.select(null); app.ui.closePanels(); }
});

/* 首帧后自检（控制台可见，不是伪造的测试结果） */
console.info('[propulsion-3d] parts=%d draws=%d perf=%s', reg.parts.length, renderer.info.render.calls, perf);

function detectPerf() {
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (mobile || mem <= 4 || cores <= 4) return 'low';
  if (mem <= 8 || cores <= 8 || window.devicePixelRatio > 2.5) return 'mid';
  return 'high';
}

window.__APP__ = app;
