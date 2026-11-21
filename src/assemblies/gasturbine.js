import * as THREE from 'three';
import {
  box, cyl, rbox, torus, pipe, boltCircle, hexBolt, latheZ, tubeShell, ringFlat, bladeRing, impeller, mesh, gear,
} from '../core/utils.js';
import { NODES } from '../core/driveline.js';

export const GT = { x: -4.0, y: 8.3, zFront: -2.6, zRear: -9.2 };

function casing(profile, mat, seg = 48) {
  const m = latheZ(profile, mat, seg);
  m.material.side = THREE.DoubleSide;
  return m;
}

export function buildGasTurbine(reg) {
  const refs = { hpRotor: null, ptRotor: null, igv: [], flames: [], igniters: [], nozzles: [], fuelValve: null, output: null, starter: null };
  const X = GT.x, Y = GT.y;

  /* ---------------- 进气滤清器 ---------------- */
  reg.add({
    id: 'gt-intake-filter', label: '进气滤清器 / 防冰格栅', layer: 'engine', sub: 'GT 进气', shell: true,
    pos: [X, Y, -9.35], dir: [-0.3, 1, -1], dist: 7.0, tags: ['gt', 'gt-shell', 'gt-comp'],
    details: ['三级滤清器', '防雨百叶', '防冰格栅', '压差变送器', '滤芯框架'],
    build: (g, c) => {
      const body = rbox(2.6, 2.2, 1.3, 0.1, c.m('epoxyGrey'));
      g.add(body);
      for (let i = 0; i < 12; i++) {
        const louver = box(2.4, 0.05, 0.14, c.m('steelDark'));
        louver.position.set(0, -0.9 + i * 0.16, -0.66);
        louver.rotation.x = 0.5;
        g.add(louver);
      }
      const duct = cyl(0.95, 0.95, 0.9, 36, c.m('paintedWhite'), 'z');
      duct.position.z = 1.0;
      g.add(duct);
      const dp = cyl(0.05, 0.05, 0.1, 8, c.m('emissiveGreen'), 'x');
      dp.position.set(1.3, 0.9, 0.4);
      g.add(dp);
    },
  });

  /* ---------------- 压气机 ---------------- */
  reg.add({
    id: 'gt-lp-casing', label: '低压压气机机匣 / 静叶', layer: 'engine', sub: 'GT 压气机', shell: true,
    pos: [X, Y, -8.0], dir: [-1, 0.6, -0.6], dist: 6.6, tags: ['gt', 'gt-shell', 'gt-comp'],
    details: ['低压机匣', '4 级静叶', '可调进口导叶（IGV）', '级间放气口', '篦齿封严', '进气温度测点'],
    build: (g, c) => {
      const body = casing([
        [0.62, -0.95], [0.92, -0.85], [1.0, -0.5], [1.0, 0.4], [0.92, 0.9], [0.78, 1.0],
      ], c.m('forgedSteel'), 48);
      g.add(body);
      for (let i = 0; i < 4; i++) {
        const z = -0.75 + i * 0.42;
        const ring = bladeRing(0.86, 0.62, 34, c.m('machinedSteel'), 0.14, 0.022, 0.6);
        ring.position.z = z;
        g.add(ring);
        const groove = torus(0.98, 0.02, c.m('steelDark'), Math.PI * 2, 48, 6);
        groove.position.z = z + 0.1;
        g.add(groove);
      }
      const flange = cyl(1.02, 1.02, 0.06, 44, c.m('steelDark'), 'z');
      flange.position.z = 1.0;
      g.add(flange);
    },
  });

  /* 可调进口导叶（单独零件，可旋转） */
  const igv = reg.add({
    id: 'gt-igv', label: '可调进口导叶（IGV）', layer: 'engine', sub: 'GT 压气机',
    pos: [X, Y, -8.55], dir: [-1, 1, -1], dist: 7.4, tags: ['gt'],
    details: ['可调导叶 16 片', '联动环', '执行机构', '角度反馈', '轴承衬套'],
    merge: false,
    build: (g, c) => {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const holder = new THREE.Group();
        holder.rotation.z = a;
        const vane = mesh(new THREE.BoxGeometry(0.05, 0.26, 0.14), c.m('machinedSteel'));
        vane.position.set(0.78, 0, 0);
        holder.add(vane);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.03), c.m('brass'));
        arm.position.set(0.66, 0, 0.14);
        holder.add(arm);
        g.add(holder);
        refs.igv.push(vane);
      }
      const ring = torus(0.68, 0.025, c.m('bronze'), Math.PI * 2, 48, 6);
      ring.rotation.x = Math.PI / 2;
      ring.position.z = 0.15;
      g.add(ring);
    },
  });

  reg.add({
    id: 'gt-hp-casing', label: '高压压气机机匣 / 静叶', layer: 'engine', sub: 'GT 压气机', shell: true,
    pos: [X, Y, -6.55], dir: [-1, 0.7, -0.2], dist: 6.2, tags: ['gt', 'gt-shell', 'gt-comp'],
    details: ['高压机匣', '3 级静叶', '级间封严', '放气活门', '冷却空气引出口'],
    build: (g, c) => {
      const body = casing([[0.58, -0.72], [0.8, -0.62], [0.84, -0.2], [0.84, 0.35], [0.72, 0.72]], c.m('forgedSteel'), 48);
      g.add(body);
      for (let i = 0; i < 3; i++) {
        const ring = bladeRing(0.72, 0.55, 30, c.m('machinedSteel'), 0.11, 0.02, 0.7);
        ring.position.z = -0.5 + i * 0.4;
        g.add(ring);
      }
      const bleed = pipe([[0.6, 0.4, 0.2], [0.9, 0.6, 0.5], [1.1, 0.7, 0.9]], 0.06, c.m('pipeAir'), 24, 8);
      g.add(bleed);
    },
  });

  /* ---------------- 燃烧室 ---------------- */
  reg.add({
    id: 'gt-comb-casing', label: '环形燃烧室机匣 / 扩压器', layer: 'engine', sub: 'GT 燃烧室', shell: true,
    pos: [X, Y, -5.35], dir: [-1, 0.9, 0.4], dist: 6.6, tags: ['gt', 'gt-shell', 'gt-comb'],
    details: ['环形燃烧室机匣', '扩压器', '火焰筒安装座', '燃油总管', '点火器座', '观察孔'],
    build: (g, c) => {
      const body = casing([
        [0.62, -0.85], [1.05, -0.75], [1.18, -0.4], [1.18, 0.45], [1.05, 0.8], [0.66, 0.9],
      ], c.m('castIron'), 48);
      g.add(body);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const mount = cyl(0.14, 0.14, 0.16, 16, c.m('steelDark'), 'z');
        mount.position.set(Math.cos(a) * 0.88, Math.sin(a) * 0.88, -0.8);
        g.add(mount);
      }
      const manifold = torus(1.0, 0.035, c.m('pipeFuel'), Math.PI * 2, 48, 8);
      manifold.position.z = -0.9;
      g.add(manifold);
    },
  });

  reg.add({
    id: 'gt-flametubes', label: '火焰筒 ×6 / 气膜冷却孔', layer: 'engine', sub: 'GT 燃烧室',
    pos: [X, Y, -5.35], dir: [-1, 1.1, 0.9], dist: 7.2, tags: ['gt'],
    merge: false,
    details: ['火焰筒', '旋流器', '掺混孔', '气膜冷却孔', '联焰管', '出口过渡段'],
    build: (g, c) => {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const tube = cyl(0.21, 0.24, 0.95, 24, c.m('forgedSteel'), 'z');
        tube.position.set(Math.cos(a) * 0.88, Math.sin(a) * 0.88, 0);
        g.add(tube);
        const inner = cyl(0.17, 0.2, 0.9, 22, c.m('flame'), 'z');
        inner.position.copy(tube.position);
        inner.position.z = 0.02;
        inner.material.side = THREE.DoubleSide;
        g.add(inner);
        refs.flames.push(inner.material);
        for (let k = 0; k < 10; k++) {
          const hole = cyl(0.012, 0.012, 0.02, 6, c.m('steelDark'), 'y');
          hole.position.set(Math.cos(a) * 0.88 + Math.cos(k) * 0.19, Math.sin(a) * 0.88 + Math.sin(k) * 0.19, 0.25);
          g.add(hole);
        }
      }
    },
  });

  reg.add({
    id: 'gt-fuel-nozzles', label: '燃油喷嘴 / 分区供油', layer: 'engine', sub: 'GT 燃烧室',
    pos: [X, Y, -5.9], dir: [-1, 0.6, 1.2], dist: 7.0, tags: ['gt'],
    merge: false,
    details: ['双油路喷嘴', '旋流雾化器', '主/副油路', '分区供油阀', '喷嘴积碳检查'],
    build: (g, c) => {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const stem = cyl(0.045, 0.045, 0.32, 10, c.m('pipeFuel'), 'z');
        stem.position.set(Math.cos(a) * 0.88, Math.sin(a) * 0.88, 0.2);
        g.add(stem);
        const tip = cyl(0.07, 0.05, 0.1, 12, c.m('brass'), 'z');
        tip.position.copy(stem.position);
        tip.position.z = -0.02;
        g.add(tip);
        const line = pipe([
          [Math.cos(a) * 1.15, Math.sin(a) * 1.15, 0.5],
          [Math.cos(a) * 1.05, Math.sin(a) * 1.05, 0.3],
          [Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0.22],
        ], 0.02, c.m('pipeFuel'), 12, 6);
        g.add(line);
        refs.nozzles.push(tip);
      }
    },
  });

  reg.add({
    id: 'gt-igniters', label: '点火器 / 火焰探测器', layer: 'engine', sub: 'GT 燃烧室',
    pos: [X, Y + 0.95, -5.2], dir: [-1, 1.2, 0.2], dist: 6.4, tags: ['gt'],
    merge: false,
    details: ['高能点火器 ×2', '点火电缆', '火焰探测器', '紫外探头'],
    build: (g, c) => {
      for (const [a, z] of [[0.3, -0.1], [Math.PI + 0.3, 0.2]]) {
        const plug = cyl(0.06, 0.06, 0.3, 12, c.m('machinedSteel'), 'y');
        plug.position.set(Math.cos(a) * 0.85, Math.sin(a) * 0.85, z);
        g.add(plug);
        const tip = cyl(0.03, 0.03, 0.1, 8, c.m('emissiveCyan'), 'y');
        tip.position.copy(plug.position);
        tip.position.y -= 0.18;
        g.add(tip);
        refs.igniters.push(tip.material);
        const cable = pipe([
          [Math.cos(a) * 0.85, Math.sin(a) * 0.85 + 0.2, z],
          [Math.cos(a) * 1.1, Math.sin(a) * 1.1 + 0.3, z + 0.3],
          [Math.cos(a) * 1.25, Math.sin(a) * 1.25 + 0.2, z + 0.7],
        ], 0.025, c.m('cable'), 16, 6);
        g.add(cable);
      }
    },
  });

  /* ---------------- 涡轮 ---------------- */
  reg.add({
    id: 'gt-hp-turbine-casing', label: '高压涡轮机匣 / 导向叶片', layer: 'engine', sub: 'GT 涡轮', shell: true,
    pos: [X, Y, -4.25], dir: [-1, 1, 0.8], dist: 6.2, tags: ['gt', 'gt-shell', 'gt-turb'],
    details: ['高压涡轮机匣', '导向叶片（气冷）', '2 级', '封严环', '冷却空气腔', '温度测点'],
    build: (g, c) => {
      const body = casing([[0.6, -0.45], [0.86, -0.4], [0.92, 0], [0.86, 0.4], [0.6, 0.45]], c.m('forgedSteel'), 44);
      g.add(body);
      for (let i = 0; i < 2; i++) {
        const ring = bladeRing(0.76, 0.56, 28, c.m('machinedSteel'), 0.12, 0.03, -0.5);
        ring.position.z = -0.18 + i * 0.34;
        g.add(ring);
      }
      const cool = torus(0.7, 0.03, c.m('emissiveCyan'), Math.PI * 2, 44, 6);
      cool.position.z = -0.4;
      g.add(cool);
    },
  });

  reg.add({
    id: 'gt-pt-casing', label: '动力涡轮机匣 / 排气扩压器', layer: 'engine', sub: 'GT 涡轮', shell: true,
    pos: [X, Y, -3.35], dir: [-1, 0.9, 0.2], dist: 6.0, tags: ['gt', 'gt-shell', 'gt-turb'],
    details: ['动力涡轮机匣', '2 级静叶', '排气扩压器', '支撑环', '振动测点'],
    build: (g, c) => {
      const body = casing([[0.6, -0.5], [0.9, -0.45], [1.02, 0], [0.98, 0.5], [0.72, 0.55]], c.m('castIron'), 44);
      g.add(body);
      for (let i = 0; i < 2; i++) {
        const ring = bladeRing(0.86, 0.6, 30, c.m('lagging'), 0.13, 0.03, -0.4);
        ring.position.z = -0.2 + i * 0.33;
        g.add(ring);
      }
    },
  });

  /* 高压转子 */
  refs.hpRotor = reg.add({
    id: 'gt-hp-rotor', label: '高压转子 / 压气机 + 涡轮叶轮', layer: 'engine', sub: 'GT 转子',
    pos: [X, Y, -6.6], dir: [-1, 0.4, 0.4], dist: 7.0, tags: ['gt'],
    details: ['高压压气机转子', '7 级动叶', '2 级高压涡轮', '气冷涡轮叶片', '转子轴', '篦齿封严', '平衡配重'],
    build: (g, c) => {
      const shaft = cyl(0.14, 0.14, 3.9, 20, c.m('machinedSteel'), 'z');
      g.add(shaft);
      // 压气机轮盘
      for (let i = 0; i < 7; i++) {
        const disc = cyl(0.5 + i * 0.015, 0.5 + i * 0.015, 0.1, 28, c.m('forgedSteel'), 'z');
        disc.position.z = -1.7 + i * 0.28;
        g.add(disc);
        const ring = bladeRing(0.52 + i * 0.015, 0.3, 30, c.m('machinedSteel'), 0.13, 0.02, 0.45);
        ring.position.z = -1.7 + i * 0.28;
        g.add(ring);
      }
      // 高压涡轮盘
      for (let i = 0; i < 2; i++) {
        const disc = cyl(0.56, 0.56, 0.12, 30, c.m('forgedSteel'), 'z');
        disc.position.z = 1.1 + i * 0.28;
        g.add(disc);
        const ring = bladeRing(0.66, 0.4, 34, c.m('chrome'), 0.16, 0.03, -0.5);
        ring.position.z = 1.1 + i * 0.28;
        g.add(ring);
        // 气膜冷却孔
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          const hole = cyl(0.012, 0.012, 0.03, 6, c.m('emissiveCyan'), 'y');
          hole.position.set(Math.cos(a) * 0.68, Math.sin(a) * 0.68, 1.1 + i * 0.28);
          g.add(hole);
        }
      }
      const nut = cyl(0.1, 0.1, 0.12, 6, c.m('brass'), 'z');
      nut.position.z = 1.75;
      g.add(nut);
    },
  });

  /* 动力涡轮转子 */
  refs.ptRotor = reg.add({
    id: 'gt-pt-rotor', label: '自由动力涡轮 / 输出轴', layer: 'engine', sub: 'GT 转子',
    pos: [X, Y, -3.35], dir: [-1, 0.3, -0.4], dist: 6.6, tags: ['gt'],
    details: ['动力涡轮 2 级', '自由涡轮盘', '输出轴', '输出法兰', '联轴器', '测速齿盘'],
    build: (g, c) => {
      // 输出轴向 +z（船首方向）穿过排气扩压器中心整流罩引出，
      // 末端法兰位置 = driveline 节点 'pt-flange'，不得在本文件另写绝对坐标。
      const P = NODES['pt-flange'].p;
      const zEnd = P[2] - (-3.35); // 法兰在局部坐标中的 z
      const shaft = cyl(0.12, 0.12, zEnd - 0.38, 18, c.m('machinedSteel'), 'z');
      shaft.position.z = (zEnd + 0.38) / 2;
      g.add(shaft);
      for (let i = 0; i < 2; i++) {
        const disc = cyl(0.62, 0.62, 0.12, 30, c.m('forgedSteel'), 'z');
        disc.position.z = -0.15 + i * 0.33;
        g.add(disc);
        const ring = bladeRing(0.8, 0.45, 36, c.m('chrome'), 0.18, 0.03, -0.45);
        ring.position.z = -0.15 + i * 0.33;
        g.add(ring);
      }
      const fl = cyl(0.3, 0.3, 0.07, 28, c.m('machinedSteel'), 'z');
      fl.position.z = zEnd - 0.035;
      g.add(fl);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const b = hexBolt(0.033, 0.09, c.m('steelDark'));
        b.rotation.x = Math.PI / 2;
        b.position.set(Math.cos(a) * 0.22, Math.sin(a) * 0.22, zEnd + 0.02);
        g.add(b);
      }
      const teeth = gear(0.19, 0.06, 24, c.m('machinedSteel'), 0.03, 'z');
      teeth.position.z = 0.62;
      g.add(teeth);
    },
  });

  /* ---------------- 排气蜗壳 / 烟囱 ---------------- */
  reg.add({
    id: 'gt-exhaust', label: '排气蜗壳 / 烟囱', layer: 'engine', sub: 'GT 排气', shell: true,
    pos: [X, Y, -2.2], dir: [-0.6, 1.2, 0.6], dist: 7.0, tags: ['gt', 'gt-shell', 'gt-turb'],
    details: ['排气蜗壳', '膨胀节', '排气烟囱', '隔热层', '消音器', '排气温度测点'],
    build: (g, c) => {
      const volute = latheZ([
        [0.72, -0.55], [1.15, -0.45], [1.35, -0.1], [1.3, 0.3], [0.95, 0.5], [0.72, 0.45], [0.72, -0.55],
      ], c.m('lagging'), 44);
      g.add(volute);
      // 中心整流罩：动力涡轮输出轴由此穿过排气扩压器，避免轴裸露在燃气通道里
      const fair = latheZ([
        [0.0, -0.62], [0.2, -0.6], [0.36, -0.5], [0.38, -0.3], [0.38, 0.12], [0.3, 0.18], [0.0, 0.18],
      ], c.m('lagging'), 36);
      g.add(fair);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        const st = box(0.06, 0.36, 0.06, c.m('steelDark'));
        st.position.set(Math.cos(a) * 0.54, Math.sin(a) * 0.54, -0.34);
        st.rotation.z = a;
        g.add(st);
      }
      const elbow = pipe([[0, 0.2, -2.0], [0, 1.4, -2.2], [0, 1.9, -1.6], [0, 2.4, -1.2]], 0.72, c.m('pipeExhaust'), 30, 16);
      g.add(elbow);
      const stack = cyl(0.72, 0.72, 4.2, 28, c.m('lagging'), 'y');
      stack.position.set(0, 4.3, -1.0);
      g.add(stack);
      const cap = cyl(0.78, 0.7, 0.3, 28, c.m('steelDark'), 'y');
      cap.position.set(0, 6.5, -1.0);
      g.add(cap);
      for (const y of [1.2, 4.0, 6.0]) {
        const band = torus(0.74, 0.04, c.m('steelDark'), Math.PI * 2, 30, 6);
        band.rotation.x = Math.PI / 2;
        band.position.set(0, y, -1.0);
        g.add(band);
      }
    },
  });

  /* ---------------- 传动链：几何全部由 driveline 节点表生成 ----------------
     真实构型：动力涡轮输出轴经排气扩压器中心整流罩引出 → 膜片联轴器 →
     上直角传动箱 → 竖直传动轴 → 下直角传动箱 → 横向传动轴 → 主减速齿轮箱 →
     SSS 离合器 → 高弹性联轴器 → 中间轴。
     每一段的端面坐标都取自 NODES，本文件不手写绝对坐标，从结构上杜绝接缝断裂。 */
  refs.output = reg.add({
    id: 'gt-flex-coupling', label: '燃机输出膜片联轴器', layer: 'engine', sub: 'GT 传动',
    pos: [-4.0, 8.3, -1.725], dir: [-0.6, 0.8, 0.4], dist: 3.2, tags: ['gt'],
    details: ['膜片组', '中间轴', '法兰', '高强度螺栓', '定心环', '防护罩'],
    build: (g, c) => {
      const fa = cyl(0.3, 0.3, 0.05, 30, c.m('machinedSteel'), 'z');
      fa.position.z = -0.15;
      g.add(fa);
      for (const z of [-0.075, -0.005]) {
        const d = cyl(0.3, 0.3, 0.03, 30, c.m('stainless'), 'z');
        d.position.z = z;
        g.add(d);
      }
      const hub = cyl(0.15, 0.15, 0.12, 20, c.m('machinedSteel'), 'z');
      hub.position.z = 0.07;
      g.add(hub);
      const fb = cyl(0.28, 0.28, 0.05, 28, c.m('machinedSteel'), 'z');
      fb.position.z = 0.155;
      g.add(fb);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const b = hexBolt(0.028, 0.26, c.m('steelDark'));
        b.rotation.x = Math.PI / 2;
        b.position.set(Math.cos(a) * 0.23, Math.sin(a) * 0.23, -0.04);
        g.add(b);
      }
      const guard = torus(0.34, 0.028, c.m('paintedYellow'), Math.PI * 2, 30, 8);
      guard.position.z = -0.04;
      g.add(guard);
    },
  });

  reg.add({
    id: 'gt-angle-drive', label: '上直角传动箱 / 输出换向', layer: 'engine', sub: 'GT 传动', shell: true,
    pos: [-4.0, 7.9, -1.135], dir: [-0.8, 0.6, 0.3], dist: 3.0, tags: ['gt'],
    details: ['锥齿轮副', '输入法兰', '输出法兰', '油位视镜', '支承腿', '吊耳'],
    build: (g, c) => {
      const body = rbox(0.72, 0.92, 0.83, 0.05, c.m('epoxyGrey'));
      g.add(body);
      const fin = cyl(0.28, 0.28, 0.08, 28, c.m('machinedSteel'), 'z');
      fin.position.set(0, 0.4, -0.375);
      g.add(fin);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const b = hexBolt(0.026, 0.09, c.m('steelDark'));
        b.rotation.x = Math.PI / 2;
        b.position.set(Math.cos(a) * 0.215, 0.4 + Math.sin(a) * 0.215, -0.41);
        g.add(b);
      }
      const boss = cyl(0.19, 0.19, 0.18, 24, c.m('epoxyGrey'), 'y');
      boss.position.set(0, -0.42, 0.085);
      g.add(boss);
      const fout = cyl(0.155, 0.155, 0.05, 22, c.m('machinedSteel'), 'y');
      fout.position.set(0, -0.5, 0.085);
      g.add(fout);
      for (const sx of [-1, 1]) {
        const rib = box(0.05, 0.5, 0.5, c.m('castIronDark'));
        rib.position.set(sx * 0.36, -0.1, 0.1);
        g.add(rib);
      }
      const sg = cyl(0.05, 0.05, 0.04, 12, c.m('glass'), 'x');
      sg.position.set(0.37, 0.18, 0.0);
      g.add(sg);
      const eye = torus(0.06, 0.018, c.m('steelDark'), Math.PI * 2, 14, 6);
      eye.rotation.y = Math.PI / 2;
      eye.position.set(0, 0.5, 0.1);
      g.add(eye);
      const plate = box(0.16, 0.1, 0.02, c.m('paintedYellow'));
      plate.position.set(-0.3, 0.1, 0.42);
      g.add(plate);
      const leg = box(0.2, 1.29, 0.2, c.m('steelDark'));
      leg.position.set(0, -1.105, 0);
      g.add(leg);
      const foot = box(0.62, 0.06, 0.62, c.m('steelDark'));
      foot.position.set(0, -1.72, 0);
      g.add(foot);
      for (const sx of [-1, 1]) {
        const br = box(0.08, 0.8, 0.08, c.m('steelDark'));
        br.position.set(sx * 0.2, -0.95, 0);
        g.add(br);
      }
    },
  });

  reg.add({
    id: 'gt-drop-shaft', label: '竖直传动轴 / 膜片联轴器 ×2', layer: 'engine', sub: 'GT 传动',
    pos: [-4.0, 5.15, -1.05], dir: [-0.9, 0.4, 0.3], dist: 4.6, tags: ['gt'],
    details: ['竖直传动轴', '膜片联轴器 ×2', '卡箍'],
    build: (g, c) => {
      const sh = cyl(0.1, 0.1, 4.74, 18, c.m('machinedSteel'), 'y');
      g.add(sh);
      for (const y of [2.27, -2.27]) {
        const f = cyl(0.17, 0.17, 0.05, 22, c.m('stainless'), 'y');
        f.position.y = y;
        g.add(f);
      }
      for (const y of [1.5, -1.5]) {
        const collar = cyl(0.13, 0.13, 0.06, 18, c.m('steelDark'), 'y');
        collar.position.y = y;
        g.add(collar);
      }
    },
  });

  /**
   * 中间支承是独立的可拆件（轴承座 + 悬臂支架 + 地脚），不该埋在竖直轴的构件里：
   *  - 采购与安装上它是单独一项；
   *  - 几何审计要判断「长跨轴有没有支承」，也需要能在构件级定位到它。
   * 埋在一起的结果是审计只能靠 id 关键字猜，猜不到就报「4.74 m 悬空轴」。
   */
  reg.add({
    id: 'gt-drop-shaft-bearing', label: '竖直轴中间支承轴承座 / 悬臂支架', layer: 'engine', sub: 'GT 传动',
    pos: [-4.0, 6.6, -1.05], dir: [-0.9, 0.5, 0.4], dist: 3.2, tags: ['gt'],
    details: ['双列球面滚子轴承', '轴承座', '悬臂横臂', '立柱', '地脚板', '注油嘴'],
    build: (g, c) => {
      const hz = rbox(0.34, 0.3, 0.26, 0.03, c.m('steelDark'));
      g.add(hz);
      const bore = cyl(0.115, 0.115, 0.3, 20, c.m('bronze'), 'y');
      g.add(bore);
      const nipple = cyl(0.028, 0.028, 0.1, 10, c.m('brass'), 'y');
      nipple.position.set(0.19, -0.1, 0);
      nipple.rotation.z = Math.PI / 2;
      g.add(nipple);
      // 悬臂支架：横臂伸到平台边梁上方，立柱落在格栅平台上
      const arm = box(0.12, 0.12, 0.5, c.m('steelDark'));
      arm.position.set(0, 0, -0.2);
      g.add(arm);
      const leg = box(0.14, 0.42, 0.14, c.m('steelDark'));
      leg.position.set(0, -0.32, -0.3);
      g.add(leg);
      const foot = box(0.4, 0.05, 0.4, c.m('steelDark'));
      foot.position.set(0, -0.53, -0.3);
      g.add(foot);
    },
  });

  reg.add({
    id: 'gt-cross-connect', label: '下直角传动箱 / 传动支座', layer: 'engine', sub: 'GT 传动', shell: true,
    pos: [-4.0, 2.28, -1.05], dir: [-1, 0.2, 0.2], dist: 2.8, tags: ['gt'],
    details: ['锥齿轮副', '输入法兰', '输出法兰', '钢制支座', '地脚螺栓', '放油塞'],
    build: (g, c) => {
      const body = rbox(0.78, 1.1, 0.72, 0.05, c.m('epoxyGrey'));
      g.add(body);
      const bin = cyl(0.19, 0.19, 0.14, 24, c.m('epoxyGrey'), 'y');
      bin.position.set(0, 0.56, 0);
      g.add(bin);
      const fin = cyl(0.155, 0.155, 0.05, 22, c.m('machinedSteel'), 'y');
      fin.position.set(0, 0.63, 0);
      g.add(fin);
      const fout = cyl(0.18, 0.18, 0.08, 24, c.m('machinedSteel'), 'x');
      fout.position.set(0.41, -0.33, 0);
      g.add(fout);
      const ped = box(0.92, 1.48, 0.86, c.m('steelDark'));
      ped.position.set(0, -1.29, 0);
      g.add(ped);
      const plate = box(1.06, 0.06, 1.0, c.m('steelDark'));
      plate.position.set(0, -2.0, 0);
      g.add(plate);
      for (const sx of [-1, 1]) {
        const br = box(0.08, 0.9, 0.08, c.m('steelDark'));
        br.position.set(sx * 0.38, -0.95, 0);
        g.add(br);
      }
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const b = hexBolt(0.05, 0.1, c.m('machinedSteel'));
          b.position.set(sx * 0.42, -1.92, sz * 0.38);
          g.add(b);
        }
      }
    },
  });

  reg.add({
    id: 'gt-cross-shaft', label: '横向传动轴 / 轴承座', layer: 'engine', sub: 'GT 传动',
    pos: [-2.31, 1.95, -1.05], dir: [-1, 0.5, 0.4], dist: 3.4, tags: ['gt'],
    details: ['横向传动轴', '膜片联轴器', '轴承座 ×2', '钢支架', '卡箍'],
    build: (g, c) => {
      const sh = cyl(0.11, 0.11, 2.56, 18, c.m('machinedSteel'), 'x');
      g.add(sh);
      for (const x of [-0.68, -0.6]) {
        const d = cyl(0.19, 0.19, 0.03, 22, c.m('stainless'), 'x');
        d.position.x = x;
        g.add(d);
      }
      for (const lx of [-0.74, 0.61]) {
        const hz = rbox(0.3, 0.28, 0.26, 0.03, c.m('steelDark'));
        hz.position.set(lx, 0, 0);
        g.add(hz);
        const st = box(0.18, 1.62, 0.18, c.m('steelDark'));
        st.position.set(lx, -0.89, 0);
        g.add(st);
        const bp = box(0.46, 0.06, 0.46, c.m('steelDark'));
        bp.position.set(lx, -1.7, 0);
        g.add(bp);
      }
    },
  });

  reg.add({
    id: 'gt-main-gear', label: '主减速齿轮箱 / 输出法兰', layer: 'engine', sub: 'GT 传动', shell: true,
    pos: [-0.1, 1.95, -1.375], dir: [-0.4, 0.7, 0.6], dist: 4.4, tags: ['gt'],
    details: ['锥齿轮副 90° 换向', '输入法兰', '输出法兰', '油底壳', '观察盖', '呼吸器', '吊耳', '钢支座'],
    build: (g, c) => {
      const body = rbox(1.8, 1.4, 1.35, 0.06, c.m('epoxyGrey'));
      g.add(body);
      const fin = cyl(0.18, 0.18, 0.08, 24, c.m('machinedSteel'), 'x');
      fin.position.set(-0.94, 0, 0.325);
      g.add(fin);
      const sh = cyl(0.2, 0.2, 0.2, 22, c.m('machinedSteel'), 'z');
      sh.position.set(0.1, 0, -0.755);
      g.add(sh);
      const fout = cyl(0.5, 0.5, 0.1, 40, c.m('machinedSteel'), 'z');
      fout.position.set(0.1, 0, -0.8);
      g.add(fout);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const b = hexBolt(0.045, 0.12, c.m('steelDark'));
        b.rotation.x = Math.PI / 2;
        b.position.set(0.1 + Math.cos(a) * 0.4, Math.sin(a) * 0.4, -0.86);
        g.add(b);
      }
      const ring = gear(0.5, 0.16, 44, c.m('machinedSteel'), 0.05, 'z');
      ring.position.set(0.1, 0, 0.255);
      g.add(ring);
      const pinion = gear(0.18, 0.14, 20, c.m('machinedSteel'), 0.04, 'x');
      pinion.position.set(-0.72, 0, 0.255);
      g.add(pinion);
      const sump = box(1.24, 0.22, 1.04, c.m('castIronDark'));
      sump.position.set(0.1, -0.72, 0.05);
      g.add(sump);
      const ped = box(1.5, 0.9, 1.15, c.m('steelDark'));
      ped.position.set(0.1, -1.25, 0.05);
      g.add(ped);
      for (let i = 0; i < 6; i++) {
        const b = hexBolt(0.05, 0.1, c.m('machinedSteel'));
        b.position.set(-0.55 + i * 0.26, -1.66, 0.55);
        g.add(b);
      }
      const cover = cyl(0.24, 0.24, 0.05, 26, c.m('epoxyGrey'), 'x');
      cover.position.set(0.92, 0.3, 0.2);
      g.add(cover);
      const br = cyl(0.05, 0.05, 0.24, 10, c.m('steelDark'), 'y');
      br.position.set(-0.45, 0.8, 0.3);
      g.add(br);
      for (const sx of [-1, 1]) {
        const eye = torus(0.07, 0.02, c.m('steelDark'), Math.PI * 2, 14, 6);
        eye.position.set(sx * 0.62, 0.7, 0.0);
        g.add(eye);
      }
      const plate = box(0.3, 0.16, 0.02, c.m('paintedYellow'));
      plate.position.set(0.3, 0.1, 0.68);
      g.add(plate);
    },
  });

  reg.add({
    id: 'gt-sss-clutch', label: '轴系接入离合器（SSS）', layer: 'engine', sub: 'GT 传动',
    pos: [0, 1.95, -1.85], dir: [0.2, 1, 0.4], dist: 2.2, tags: ['gt'],
    details: ['同步自移位离合器', '摩擦片组', '气动执行环', '接合指示', '进气管'],
    build: (g, c) => {
      const body = cyl(0.3, 0.3, 0.3, 32, c.m('machinedSteel'), 'z');
      g.add(body);
      for (const z of [-0.16, 0.16]) {
        const d = cyl(0.34, 0.34, 0.03, 32, c.m('bronze'), 'z');
        d.position.z = z;
        g.add(d);
      }
      const act = torus(0.31, 0.045, c.m('steelDark'), Math.PI * 2, 30, 8);
      g.add(act);
      const ind = cyl(0.04, 0.04, 0.04, 10, c.m('emissiveGreen'), 'y');
      ind.position.set(0, 0.36, 0);
      g.add(ind);
      g.add(pipe([[0, 0.36, 0], [0, 0.5, 0], [0, 0.5, 0.3], [0, 0.75, 0.3]], 0.018, c.m('pipeAir'), 12, 6));
    },
  });

  /* ---------------- 附件 / 支承 ---------------- */
  reg.add({
    id: 'gt-accessory-gearbox', label: '附件齿轮箱 / 起动机', layer: 'engine', sub: 'GT 附件', shell: true,
    pos: [X - 0.9, 7.0, -6.9], dir: [-1, -0.6, 0.4], dist: 4.8, tags: ['gt'],
    details: ['附件齿轮箱', '起动机', '滑油泵', '燃油泵', '液压泵', '转速传感器'],
    build: (g, c) => {
      const body = rbox(1.0, 0.6, 1.0, 0.08, c.m('castIron'));
      g.add(body);
      const starter = cyl(0.22, 0.22, 0.7, 22, c.m('paintedWhite'), 'z');
      starter.position.set(0.1, 0.15, -0.8);
      g.add(starter);
      const pump = cyl(0.15, 0.15, 0.4, 18, c.m('epoxyGrey'), 'y');
      pump.position.set(-0.4, 0.5, 0.2);
      g.add(pump);
      const pump2 = cyl(0.12, 0.12, 0.36, 18, c.m('epoxyGrey'), 'y');
      pump2.position.set(-0.1, 0.5, 0.35);
      g.add(pump2);
      const sens = cyl(0.05, 0.05, 0.12, 10, c.m('emissiveCyan'), 'x');
      sens.position.set(0.55, 0.1, 0.2);
      g.add(sens);
    },
  });

  reg.add({
    id: 'gt-mounts', label: '燃机隔振支座 / 机脚', layer: 'engine', sub: 'GT 支承',
    pos: [X, 6.65, -5.9], dir: [0, -0.6, 0], dist: 3.4, tags: ['gt'],
    details: ['橡胶隔振垫', '限位挡块', '调平垫片', '机脚', '接地线'],
    build: (g, c) => {
      for (const [dx, dz] of [[-1.0, -2.6], [1.0, -2.6], [-1.0, 1.4], [1.0, 1.4]]) {
        const foot = box(0.5, 0.18, 0.5, c.m('steelDark'));
        foot.position.set(dx, 0.42, dz);
        g.add(foot);
        for (let i = 0; i < 4; i++) {
          const rub = cyl(0.09, 0.09, 0.08, 12, c.m('rubber'), 'y');
          rub.position.set(dx + (i % 2 ? 0.13 : -0.13), 0.3, dz + (i < 2 ? 0.13 : -0.13));
          g.add(rub);
        }
        const base = box(0.6, 0.1, 0.6, c.m('machinedSteel'));
        base.position.set(dx, 0.12, dz);
        g.add(base);
      }
    },
  });

  reg.add({
    id: 'gt-enclosure', label: '燃机隔声罩 / 检修平台栏杆', layer: 'engine', sub: 'GT 支承', shell: true,
    pos: [X, 7.925, -5.45], dir: [-1, 0.2, 0], dist: 8.0, tags: ['gt'],
    details: ['隔声罩骨架', '快开检修门', '观察窗', '通风百叶', '消防接口'],
    build: (g, c) => {
      // 笼式骨架：立柱落在燃机平台上，底梁低于机脚（机脚顶面 y≈7.16），
      // 尾端止于进气滤清器前端，避免骨架穿过机脚与滤清器。
      const L = 6.3, HW = 1.78, H0 = -1.775, H1 = 1.775; // 相对 pos：y 6.15~9.70
      for (const dx of [-HW, HW]) {
        for (const dz of [-L / 2, 0, L / 2]) {
          const post = box(0.08, H1 - H0, 0.08, c.m('paintedYellow'));
          post.position.set(dx, (H0 + H1) / 2, dz);
          g.add(post);
        }
        for (const y of [H0 + 0.15, H1 - 0.08]) {
          const beam = box(0.08, 0.08, L, c.m('paintedYellow'));
          beam.position.set(dx, y, 0);
          g.add(beam);
        }
      }
      for (const dz of [-L / 2, 0, L / 2]) {
        for (const y of [H0 + 0.15, H1 - 0.08]) {
          const beam = box(HW * 2, 0.08, 0.08, c.m('paintedYellow'));
          beam.position.set(0, y, dz);
          g.add(beam);
        }
      }
      // 顶部纵梁
      for (const dx of [-0.6, 0.6]) {
        const rail = box(0.06, 0.06, L, c.m('paintedYellow'));
        rail.position.set(dx, H1 - 0.08, 0);
        g.add(rail);
      }
      // 观察窗（两侧各一）
      for (const dx of [-HW, HW]) {
        const win = box(0.02, 0.7, 1.0, c.m('glass'));
        win.position.set(dx + Math.sign(dx) * 0.03, 0.15, 0.9);
        g.add(win);
      }
    },
  });

  reg.add({
    id: 'gt-fuel-skid', label: '燃机燃油模块 / 滤器', layer: 'engine', sub: 'GT 附件', shell: true,
    pos: [-6.3, 6.7, -3.0], dir: [-1, 0.4, 0.6], dist: 5.2, tags: ['gt'],
    details: ['燃油泵', '双联滤器', '流量计', '截止阀', '压力表', '控制箱'],
    build: (g, c) => {
      const skid = box(1.4, 0.12, 1.4, c.m('steelDark'));
      g.add(skid);
      const pump = cyl(0.2, 0.2, 0.5, 20, c.m('epoxyGrey'), 'y');
      pump.position.set(-0.3, 0.35, 0);
      g.add(pump);
      for (const z of [-0.3, 0.3]) {
        const filt = cyl(0.16, 0.16, 0.6, 20, c.m('paintedWhite'), 'y');
        filt.position.set(0.35, 0.4, z);
        g.add(filt);
      }
      const gauge = cyl(0.09, 0.09, 0.03, 16, c.m('paintedWhite'), 'z');
      gauge.position.set(0, 0.25, 0.7);
      g.add(gauge);
    },
  });

  return refs;
}
