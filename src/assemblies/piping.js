/**
 * piping.js — 机舱管系（管路即数据）
 *
 * 过去的做法是用 CatmullRom 穿过几个手写点，结果是斜向"s spaghetti"：
 * 管子斜穿设备、没有支吊架、没有法兰，不符合任何一家船厂的管装规范。
 *
 * 现在每根管子都写成「正交折线 + 管径 + 材质 + 支吊架间距」的数据：
 *  - 所有走向只允许 x / y / z 三轴方向（正交布管，斜段在实船机舱里是不存在的）；
 *  - 每个转角按管径生成圆滑弯头；
 *  - 直段每 ≤2.2 m 一个 U 形管夹 + 立杆支座；
 *  - 每 6 m 与每根管子两端设法兰。
 * 这样既符合管装规范，也让 geom-lint 能按折线精确校验「管不穿设备」。
 */
import * as THREE from 'three';
import {
  box, cyl, torus, pipe, mesh, hexBolt,
} from '../core/utils.js';

const HANGER_GAP = 2.2;
const FLANGE_GAP = 6.0;

/** 折线加密：让 CatmullRom 在转角处只做小幅圆角，而不是整段鼓包 */
function densify(pts, r) {
  const out = [];
  const bend = Math.max(0.12, r * 2.2);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = new THREE.Vector3(...pts[i]);
    const b = new THREE.Vector3(...pts[i + 1]);
    const len = a.distanceTo(b);
    if (len < 1e-6) continue;
    const dir = b.clone().sub(a).normalize();
    const start = a.clone();
    const end = b.clone();
    if (i > 0) start.addScaledVector(dir, bend);
    if (i < pts.length - 2) end.addScaledVector(dir, -bend);
    if (start.distanceTo(end) < 1e-3) continue;
    const n = Math.max(1, Math.ceil(start.distanceTo(end) / 0.55));
    for (let k = 0; k < n; k++) out.push(start.clone().lerp(end, k / n).toArray());
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function axisOf(a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const abs = d.map(Math.abs);
  if (abs[0] >= abs[1] && abs[0] >= abs[2]) return 'x';
  if (abs[1] >= abs[2]) return 'y';
  return 'z';
}

/** 一根管子：正交折线 → 管体 + 弯头 + 法兰 + 管夹 */
function buildRun(g, pts, r, mat, c, opts = {}) {
  const { hangers = true, flanges = true, clampMat = 'steelDark' } = opts;
  const dense = densify(pts, r);
  g.add(pipe(dense, r, c.m(mat), Math.max(24, dense.length * 3), 10));

  // 法兰：两端 + 每 6 m
  if (flanges) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const ax = axisOf(a, b);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const n = Math.max(1, Math.round(len / FLANGE_GAP));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const f = cyl(r * 1.75, r * 1.75, r * 0.7, 16, c.m(clampMat), ax);
        f.position.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
        g.add(f);
      }
    }
  }

  // 管夹：沿每个直段等距布置
  if (hangers) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const ax = axisOf(a, b);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      if (len < 1.2) continue;
      const n = Math.max(1, Math.floor(len / HANGER_GAP));
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const px = a[0] + (b[0] - a[0]) * t;
        const py = a[1] + (b[1] - a[1]) * t;
        const pz = a[2] + (b[2] - a[2]) * t;
        const clamp = torus(r * 1.28, r * 0.28, c.m(clampMat), Math.PI * 2, 14, 6);
        if (ax === 'x') clamp.rotation.y = Math.PI / 2;
        if (ax === 'z') clamp.rotation.x = Math.PI / 2;
        clamp.position.set(px, py, pz);
        g.add(clamp);
        if (ax !== 'y') {
          const rod = box(r * 0.5, 0.22, r * 0.5, c.m(clampMat));
          rod.position.set(px, py - r * 1.5 - 0.11, pz);
          g.add(rod);
          const base = box(r * 3.2, 0.03, r * 3.2, c.m(clampMat));
          base.position.set(px, py - r * 1.5 - 0.225, pz);
          g.add(base);
        }
      }
    }
  }
}

export function buildPiping(reg) {
  /* ---------------- 燃油：舱壁进舱 → 沿主机左舷走廊上行 → 六缸喷油泵 ---------------- */
  reg.add({
    id: 'aux-pipe-fuel', label: '燃油供给 / 回油管路', layer: 'aux', sub: '管系', shell: true,
    tags: ['diesel-only'],
    details: ['进舱燃油总管', '六缸分支', '回油总管', '法兰', 'U 形管夹', '泄放阀'],
    build: (g, c) => {
      // 供给总管：舱壁 → 左舷走廊 → 越过凸轮轴箱上方 → 各缸喷油泵入口
      // 凸轮轴箱占据 x∈[-3.36,-2.14] / y∈[2.44,3.66]，竖管必须走在 x<-3.4 才不穿轴箱。
      const supply = [
        [-5.6, 1.5, 12.2], [-5.6, 1.5, 9.2], [-3.75, 1.5, 9.2],
        [-3.75, 4.55, 9.2], [-3.75, 4.55, -0.3],
      ];
      buildRun(g, supply, 0.075, 'pipeFuel', c);
      // 六缸分支：从总管直接水平接入喷油泵泵体 -x 端面（泵体 x∈[-2.56,-2.14]）
      for (const z of [0, 1.55, 3.1, 4.65, 6.2, 7.75]) {
        buildRun(g, [[-3.75, 4.55, z], [-2.56, 4.55, z]], 0.045, 'pipeFuel', c, { hangers: false, flanges: false });
      }
      // 回油总管（泄油集管，平行布置在下方 0.35 m）
      buildRun(g, [
        [-5.25, 1.15, 12.2], [-5.25, 1.15, 9.6], [-4.1, 1.15, 9.6],
        [-4.1, 4.2, 9.6], [-4.1, 4.2, -0.3],
      ], 0.05, 'pipeFuel', c);
      // 各泵泄油支管 → 回油集管
      for (const z of [0, 1.55, 3.1, 4.65, 6.2, 7.75]) {
        buildRun(g, [[-2.56, 4.2, z], [-4.1, 4.2, z]], 0.03, 'pipeFuel', c, { hangers: false, flanges: false });
      }
      // 泄放阀
      for (const z of [2.0, 5.4]) {
        const v = cyl(0.07, 0.07, 0.14, 12, c.m('brass'), 'y');
        v.position.set(-3.75, 4.32, z);
        g.add(v);
      }
    },
  });

  /* ---------------- 滑油：泵 → 滤器 → 冷却器 → 主机 ---------------- */
  reg.add({
    id: 'aux-pipe-lo', label: '滑油系统管路 / 冷却器 / 滤器', layer: 'aux', sub: '管系', shell: true, pos: [-0.8, 0, 0],
    tags: ['diesel-only'],
    details: ['主滑油泵出口', '滑油冷却器', '双联滤器', '三通温控阀', '压力表', '管夹'],
    build: (g, c) => {
      // 起点落在滑油泵排出法兰面（泵组 pos x=-1.8，法兰面 z=10.97），不再从泵体内部穿出
      buildRun(g, [
        [-1.0, 1.0, 10.94], [-1.0, 1.0, 10.4], [5.4, 1.0, 10.4], [5.4, 1.0, 8.35],
      ], 0.09, 'pipeLO', c);
      const filt = cyl(0.22, 0.22, 0.8, 20, c.m('paintedWhite'), 'y');
      filt.position.set(5.4, 1.0, 8.0);
      g.add(filt);
      for (const y of [0.68, 1.32]) {
        const f = cyl(0.2, 0.2, 0.06, 18, c.m('machinedSteel'), 'y');
        f.position.set(5.4, y, 8.0);
        g.add(f);
      }
      // 滤器 → 冷却器（壳侧）
      buildRun(g, [
        [5.4, 1.4, 8.0], [5.4, 3.2, 8.0], [5.4, 3.2, 6.9],
      ], 0.09, 'pipeLO', c, { hangers: false });
      const cooler = new THREE.Group();
      const shell = cyl(0.42, 0.42, 1.5, 28, c.m('epoxyGrey'), 'z');
      cooler.add(shell);
      for (let i = 0; i < 7; i++) {
        const t = cyl(0.028, 0.028, 1.46, 8, c.m('copperMachined'), 'z');
        t.position.set(-0.24 + i * 0.08, 0, 0);
        cooler.add(t);
      }
      for (const z of [-0.78, 0.78]) {
        const f = cyl(0.44, 0.44, 0.07, 26, c.m('machinedSteel'), 'z');
        f.position.z = z;
        cooler.add(f);
      }
      cooler.position.set(5.4, 3.6, 6.2);
      g.add(cooler);
      // 冷却器出口 → 主机滑油进口
      buildRun(g, [
        [5.4, 3.6, 5.4], [5.4, 3.9, 5.4], [5.4, 3.9, 9.4], [2.95, 3.9, 9.4],
        [2.95, 3.9, 8.5], [2.62, 3.9, 8.5], [2.62, 2.6, 8.5], [2.55, 2.6, 8.5],
      ], 0.085, 'pipeLO', c);
      // 温控三通阀
      const valve = cyl(0.13, 0.13, 0.2, 16, c.m('brass'), 'y');
      valve.position.set(5.4, 3.9, 7.4);
      g.add(valve);
    },
  });

  /* ---------------- 海水 / 消防 ---------------- */
  reg.add({
    id: 'aux-pipe-sw', label: '海水冷却 / 消防总管', layer: 'aux', sub: '管系', shell: true,
    details: ['海底门', '海水吸入管', '主海水泵吸入', '消防总管', '消防栓', '滤器'],
    build: (g, c) => {
      // 海底门 → 右舷走廊 → 海水泵
      // 走廊中心线取 x=4.1：既避开 x=5.5 起的控制台，也与 x=4.6 的滤器 / 冷却器留出净距。
      // 海底门原在 z=-14.1，距桨盘仅 1.1 m，落在直径 6.9 m 的桨叶回转包络边上；
      // 移到 z=-9.8 的双层底区域，与桨盘拉开 5.4 m。
      buildRun(g, [
        [1.4, 0.6, -9.8], [4.1, 0.6, -9.8], [4.1, 0.6, 10.6], [0.2, 0.6, 10.6], [0.2, 1.0, 10.94],
      ], 0.11, 'pipeSW', c);
      const chest = box(0.8, 0.7, 0.8, c.m('hull'));
      chest.position.set(1.4, 0.35, -10.05);
      g.add(chest);
      const st = cyl(0.12, 0.12, 0.3, 14, c.m('steelDark'), 'y');
      st.position.set(1.4, 0.7, -9.8);
      g.add(st);
      // 消防总管（左舷高位）
      buildRun(g, [[-4.35, 3.35, 12.4], [-4.35, 3.35, -9.2]], 0.08, 'emissiveRed', c);
      for (const z of [-8, -2, 4, 10]) {
        const riser = cyl(0.07, 0.07, 0.45, 12, c.m('emissiveRed'), 'y');
        riser.position.set(-4.35, 3.57, z);
        g.add(riser);
        const hyd = cyl(0.12, 0.12, 0.16, 12, c.m('emissiveRed'), 'z');
        hyd.position.set(-4.35, 3.77, z);
        g.add(hyd);
      }
    },
  });

  /* ---------------- 压缩空气 ---------------- */
  reg.add({
    id: 'aux-pipe-air', label: '压缩空气启动管路 / 空气瓶', layer: 'aux', sub: '管系', shell: true, pos: [0.9, 0, 0],
    tags: ['diesel-only'],
    details: ['主启动空气瓶 ×3', '减压阀', '启动空气总管', '缸头支管', '安全阀'],
    build: (g, c) => {
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(new THREE.LatheGeometry([
          new THREE.Vector2(0, -1.4), new THREE.Vector2(0.34, -1.35), new THREE.Vector2(0.36, 1.35),
          new THREE.Vector2(0.26, 1.45), new THREE.Vector2(0, 1.45),
        ], 28), c.m('paintedWhite'));
        b.rotation.x = Math.PI / 2;
        b.position.set(-6.0, 3.9, 2.2 + i * 0.95);
        g.add(b);
        const cap = torus(0.3, 0.04, c.m('steelDark'), Math.PI * 2, 20, 6);
        cap.rotation.x = Math.PI / 2;
        cap.position.set(-6.0, 4.55, 2.2 + i * 0.95);
        g.add(cap);
        const shoe = box(0.62, 0.16, 0.5, c.m('steelDark'));
        shoe.position.set(-6.0, 2.48, 2.2 + i * 0.95);
        g.add(shoe);
      }
      // 瓶组 → 减压阀 → 主机启动空气总管
      buildRun(g, [
        [-5.66, 3.9, 3.15], [-4.95, 3.9, 3.15], [-4.95, 6.55, 3.15], [-2.75, 6.55, 3.15],
      ], 0.055, 'pipeAir', c);
      const red = cyl(0.11, 0.11, 0.2, 16, c.m('brass'), 'y');
      red.position.set(-4.95, 5.2, 3.15);
      g.add(red);
      // 缸头支管总管
      buildRun(g, [[-2.75, 6.55, 0], [-2.75, 6.55, 7.75]], 0.05, 'pipeAir', c);
      // 支管末端落在缸盖顶面 x=-0.62 处的启动阀座上（缸盖半径 0.76，早先 -2.45 直接接在空气里）
      for (const z of [0, 1.55, 3.1, 4.65, 6.2, 7.75]) {
        buildRun(g, [[-2.75, 6.55, z], [-0.62, 6.55, z]], 0.035, 'pipeAir', c, { hangers: false, flanges: false });
      }
    },
  });

  /* ---------------- 电缆托架 ---------------- */
  reg.add({
    id: 'aux-cabletray', label: '电缆托架 / 接线箱', layer: 'aux', sub: '控制系统',
    details: ['梯式桥架', '立柱支架', '动力/控制分隔', '接线箱', '接地跨接'],
    build: (g, c) => {
      const X = 5.75, Y = 4.55, Z0 = -9.5, Z1 = 9.5;
      for (const dx of [-0.22, 0.22]) {
        const side = box(0.04, 0.14, Z1 - Z0, c.m('paintedYellow'));
        side.position.set(X + dx, Y, (Z0 + Z1) / 2);
        g.add(side);
      }
      for (let z = Z0; z <= Z1; z += 0.35) {
        const rung = box(0.48, 0.03, 0.05, c.m('steelDark'));
        rung.position.set(X, Y - 0.05, z);
        g.add(rung);
      }
      for (let z = Z0; z <= Z1; z += 2.4) {
        const brk = box(0.06, 0.5, 0.06, c.m('steelDark'));
        brk.position.set(X, Y - 0.32, z);
        g.add(brk);
      }
      // 电缆束
      for (let i = 0; i < 3; i++) {
        const cab = cyl(0.05, 0.05, Z1 - Z0 - 0.4, 8, c.m('cable'), 'z');
        cab.position.set(X - 0.12 + i * 0.12, Y + 0.03, (Z0 + Z1) / 2);
        g.add(cab);
      }
      const jb = box(0.5, 0.6, 0.35, c.m('epoxyGrey'));
      jb.position.set(X, Y + 0.45, 6.0);
      g.add(jb);
    },
  });
}
