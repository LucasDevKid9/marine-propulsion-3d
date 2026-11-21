import * as THREE from 'three';
import { buildPiping } from './piping.js';
import {
  box, cyl, rbox, plateWithHoles, torus, pipe, boltCircle, mesh, gear,
  ringFlat, latheZ, canvasTexture, roundRect,
} from '../core/utils.js';

/** 艉部机舱剖切展示环境：双层底、花钢板走道、栏杆、行车、控制箱、照明、管系 */
export function buildEnvironment(reg, scene, tex) {
  const DECK_Y = 0;

  /* ---------- 展示基座：环形平台 + 径向网格 ---------- */
  const dais = new THREE.Group();
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(24, 24.6, 0.5, 96),
    new THREE.MeshStandardMaterial({ color: 0x0a121a, metalness: 0.6, roughness: 0.7 })
  );
  plate.position.y = -5.0;
  plate.receiveShadow = true;
  dais.add(plate);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(23.8, 0.075, 8, 128),
    new THREE.MeshBasicMaterial({ color: 0x2fa8cf })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -4.72;
  dais.add(ring);

  const ring2 = new THREE.Mesh(
    new THREE.TorusGeometry(16.5, 0.035, 6, 128),
    new THREE.MeshBasicMaterial({ color: 0x1d5f78, transparent: true, opacity: 0.8 })
  );
  ring2.rotation.x = Math.PI / 2;
  ring2.position.y = -4.72;
  dais.add(ring2);

  const grid = new THREE.PolarGridHelper(24, 16, 12, 96, 0x14384a, 0x0e2431);
  grid.position.y = -4.7;
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  dais.add(grid);

  // 刻度环（尺度感）
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const len = i % 6 === 0 ? 1.1 : 0.45;
    const t = new THREE.Mesh(
      new THREE.BoxGeometry(len, 0.02, 0.06),
      new THREE.MeshBasicMaterial({ color: i % 6 === 0 ? 0x3fc6e8 : 0x1c5568 })
    );
    t.position.set(Math.cos(a) * 22.6, -4.68, Math.sin(a) * 22.6);
    t.rotation.y = -a;
    dais.add(t);
  }
  scene.add(dais);

  /* ---------- 双层底 / 花钢板走道 ---------- */
  reg.add({
    id: 'env-tanktop', label: '双层底 tank top / 花钢板走道', layer: 'aux', sub: '环境', explode: false, cast: false,
    tags: ['env'],
    build: (g, c) => {
      const deck = box(12.8, 0.3, 27.4, c.m('chequer'));
      deck.position.set(0, DECK_Y - 0.15, 0.1);
      deck.receiveShadow = true;
      g.add(deck);
      // 走道边梁
      for (const x of [-6.4, 6.4]) {
        const beam = box(0.16, 0.42, 27.4, c.m('epoxyDeck'));
        beam.position.set(x, -0.35, 0.1);
        g.add(beam);
      }
      // 花钢板拼缝
      for (let z = -13; z <= 13; z += 4) {
        const seam = box(12.6, 0.01, 0.04, c.m('castIronDark'));
        seam.position.set(0, DECK_Y + 0.005, z);
        g.add(seam);
      }
      // 积油 / 水渍（低粗糙度贴片，制造湿润反光）
      const puddleMat = new THREE.MeshPhysicalMaterial({
        color: 0x0a0f12, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.72,
        clearcoat: 1, clearcoatRoughness: 0.05,
      });
      const spots = [[-2.1, 4.2, 1.5, 0.9], [1.9, 6.6, 1.2, 0.7], [-3.6, -2.4, 2.2, 1.0], [2.6, -6.2, 1.6, 0.8], [0.4, 9.4, 1.3, 0.6]];
      for (const [x, z, sx, sz] of spots) {
        const pd = new THREE.Mesh(new THREE.CircleGeometry(1, 28), puddleMat);
        pd.rotation.x = -Math.PI / 2;
        pd.scale.set(sx, sz, 1);
        pd.position.set(x, DECK_Y + 0.012, z);
        g.add(pd);
      }
    },
  });

  reg.add({
    id: 'env-doublebottom', label: '双层底结构与肋板', layer: 'aux', sub: '环境', explode: false,
    tags: ['env'],
    build: (g, c) => {
      const m = c.m('hull');
      for (const x of [-5.4, -2.7, 0, 2.7, 5.4]) {
        const lg = box(0.14, 2.7, 27.0, m);
        lg.position.set(x, -1.7, 0.1);
        g.add(lg);
      }
      for (let z = -13; z <= 13; z += 2.6) {
        const fl = box(12.6, 2.7, 0.13, m);
        fl.position.set(0, -1.7, z);
        g.add(fl);
      }
      const bottom = box(12.8, 0.18, 27.4, c.m('hullWet'));
      bottom.position.set(0, -3.1, 0.1);
      g.add(bottom);
      // 人孔
      for (let i = 0; i < 4; i++) {
        const h = torus(0.32, 0.05, c.m('steelDark'), Math.PI * 2, 24, 8);
        h.rotation.x = Math.PI / 2;
        h.position.set(-4.2 + i * 2.8, -3.0, 2.0);
        g.add(h);
      }
    },
  });

  reg.add({
    id: 'env-hull-port', label: '舷侧外板（左舷）', layer: 'aux', sub: '环境', explode: false, tags: ['env'],
    build: (g, c) => {
      const wall = box(0.3, 5.9, 27.4, c.m('hull'));
      wall.position.set(-6.42, 2.85, 0.1);
      g.add(wall);
      for (let z = -13; z <= 13; z += 2.6) {
        const fr = box(0.22, 5.1, 0.22, c.m('steelDark'));
        fr.position.set(-6.18, 2.95, z);
        g.add(fr);
      }
      // 舷侧管系支架
      for (let z = -14; z <= 12; z += 4) {
        const br = box(0.5, 0.08, 0.1, c.m('steelDark'));
        br.position.set(-5.95, 5.2, z);
        g.add(br);
      }
    },
  });

  reg.add({
    id: 'env-hull-stbd', label: '舷侧外板（右舷剖切边）', layer: 'aux', sub: '环境', explode: false, tags: ['env'],
    build: (g, c) => {
      const wall = box(0.3, 1.0, 27.4, c.m('hull'));
      wall.position.set(6.42, 0.45, 0.1);
      g.add(wall);
      const edge = box(0.26, 0.04, 27.4, c.m('emissiveCyan'));
      edge.position.set(6.42, 0.97, 0.1);
      edge.material.emissiveIntensity = 0.4;
      g.add(edge);
      // 被剖开的肋骨与甲板边梁：只保留骨架，不挡视线
      for (let z = -13; z <= 13; z += 2.6) {
        const fr = box(0.24, 2.6, 0.22, c.m('steelDark'));
        fr.position.set(6.3, 1.65, z);
        g.add(fr);
        const knee = box(0.7, 0.16, 0.22, c.m('steelDark'));
        knee.position.set(6.0, 2.9, z);
        g.add(knee);
      }
      const stringer = box(0.18, 0.18, 27.4, c.m('steelDark'));
      stringer.position.set(6.3, 2.95, 0.1);
      g.add(stringer);
    },
  });

  reg.add({
    id: 'env-transom', label: '艉封板 / 艉轴穿舱', layer: 'aux', sub: '环境', explode: false, tags: ['env'],
    build: (g, c) => {
      // 剖切式艉舱壁：仅保留左舷侧板与上部横梁，右舷一侧敞开（观察侧）
      const ZT = -13.35, T = 0.3;
      const side = box(2.9, 6.2, T, c.m('hull'));
      side.position.set(-4.95, 2.9, ZT);
      g.add(side);
      for (const zz of [-0.6, 0.6, 1.8]) {
        const web = box(0.12, 5.9, 0.16, c.m('steelDark'));
        web.position.set(-(3.55 + zz), 2.9, ZT + 0.22);
        g.add(web);
      }
      const flat = box(2.9, 0.16, 0.34, c.m('steelDark'));
      flat.position.set(-4.95, 0.15, ZT);
      g.add(flat);
      const top = box(5.4, 1.55, T, c.m('hull'));
      top.position.set(-1.55, 5.27, ZT);
      g.add(top);
      // 上板下缘横梁 + 斜撑至轴孔座
      const beam = box(6.9, 0.18, 0.34, c.m('steelDark'));
      beam.position.set(-0.6, 4.52, ZT + 0.06);
      g.add(beam);
      for (const sx of [-1, 1]) {
        const strut = box(0.14, 1.9, 0.3, c.m('steelDark'));
        strut.position.set(sx * 1.05, 2.75, ZT + 0.06);
        strut.rotation.z = sx * 0.28;
        g.add(strut);
      }
      // 轴穿舱座 + 填料函压盖
      const seat = rbox(2.5, 2.0, 0.42, 0.1, c.m('epoxyGrey'));
      seat.position.set(0, 1.95, ZT + 0.1);
      g.add(seat);
      const ring = torus(1.0, 0.09, c.m('steelDark'), Math.PI * 2, 34, 10);
      ring.position.set(0, 1.95, ZT - 0.14);
      g.add(ring);
      const bc = boltCircle({ R: 1.12, n: 12, r: 0.045, h: 0.06, mat: c.m('steelDark'), axis: 'z' });
      [...bc.children].forEach((b) => { b.position.z = ZT - 0.18; g.add(b); });
      // 检修人孔
      const man = torus(0.42, 0.06, c.m('steelDark'), Math.PI * 2, 24, 8);
      man.position.set(-4.9, 4.6, ZT - 0.16);
      g.add(man);
    },
  });

  /* ---------- 机座与隔振支撑 ---------- */
  reg.add({
    id: 'found-seating', label: '主机机座支承 / 环氧浇注垫块', layer: 'found', sub: '支撑', shell: false,
    dir: [0, -1, 0], dist: 1.4,
    details: ['铸铁机座支承梁', '环氧树脂浇注垫块', ' Holding-down 螺栓', '横向止推键'],
    build: (g, c) => {
      for (const x of [-2.3, 2.3]) {
        const rail = box(0.55, 0.22, 11.4, c.m('epoxyGrey'));
        rail.position.set(x, 0.11, 3.1);
        g.add(rail);
        for (let z = -0.6; z <= 8.8; z += 1.55) {
          const chock = box(0.75, 0.12, 0.5, c.m('epoxy'));
          chock.position.set(x, 0.06, z);
          g.add(chock);
          const b = cyl(0.07, 0.07, 0.5, 10, c.m('forgedSteel'), 'y');
          b.position.set(x, 0.3, z);
          g.add(b);
        }
      }
      const key = box(6.0, 0.18, 0.25, c.m('steelDark'));
      key.position.set(0, 0.14, 8.4);
      g.add(key);
    },
  });

  reg.add({
    id: 'found-isolators', label: '泵组隔振支座', layer: 'found', sub: '支撑',
    details: ['橡胶-钢复合隔振垫', '限位挡块', '调平垫片'],
    build: (g, c) => {
      for (const [x, z] of [[-1.8, 11.6], [0.2, 11.6], [2.2, 11.6]]) {
        const base = box(1.0, 0.1, 0.66, c.m('steelDark'));
        base.position.set(x, 0.05, z);
        g.add(base);
        for (let i = 0; i < 4; i++) {
          const rub = cyl(0.09, 0.09, 0.08, 12, c.m('rubber'), 'y');
          rub.position.set(x + (i % 2 ? 0.4 : -0.4), 0.14, z + (i < 2 ? 0.24 : -0.24));
          g.add(rub);
        }
      }
    },
  });

  reg.add({
    id: 'found-gt-platform', label: '燃气轮机层平台与支柱', layer: 'found', sub: '支撑',
    details: ['格栅平台', 'H 型钢支柱', '斜撑', '踢脚板'],
    build: (g, c) => {
      const deck = box(4.4, 0.18, 8.4, c.m('chequer'));
      deck.position.set(-4.2, 6.15, -5.4);
      g.add(deck);
      for (let z = -9.2; z <= -1.8; z += 1.85) {
        const beam = box(4.4, 0.22, 0.12, c.m('steelDark'));
        beam.position.set(-4.2, 6.02, z);
        g.add(beam);
      }
      for (const [x, z] of [[-6.2, -9.2], [-2.2, -9.2], [-6.2, -1.8], [-2.2, -1.8]]) {
        const col = box(0.24, 6.1, 0.24, c.m('steelDark'));
        col.position.set(x, 3.0, z);
        g.add(col);
        const brace = box(0.14, 3.4, 0.14, c.m('steelDark'));
        brace.position.set(x + (x < -4 ? 0.5 : -0.5), 4.5, z + (z < -5 ? 0.9 : -0.9));
        brace.rotation.x = z < -5 ? 0.55 : -0.55;
        g.add(brace);
      }
      // 栏杆
      for (const x of [-6.25, -2.15]) {
        const railTop = box(0.06, 0.06, 8.2, c.m('paintedYellow'));
        railTop.position.set(x, 7.25, -5.4);
        g.add(railTop);
        for (let z = -9.2; z <= -1.8; z += 1.5) {
          const post = box(0.06, 1.0, 0.06, c.m('paintedYellow'));
          post.position.set(x, 6.75, z);
          g.add(post);
        }
      }
    },
  });

  reg.add({
    id: 'found-sterntube', label: '艉管基座 / 艉柱结构', layer: 'found', sub: '支撑',
    details: ['艉管前支座', '艉管后支座', '艉柱铸钢件', '焊接肘板'],
    build: (g, c) => {
      for (const z of [-7.2, -11.6]) {
        const sad = rbox(2.1, 0.3, 0.9, 0.06, c.m('steelDark'));
        sad.position.set(0, 1.05, z);
        g.add(sad);
        const web = box(0.18, 0.85, 0.7, c.m('hull'));
        web.position.set(0, 0.5, z);
        g.add(web);
      }
      const boss = latheZ([[0.95, 0], [1.15, -0.15], [1.4, -0.55], [1.35, -1.0], [0.95, -1.15]], c.m('hullWet'), 40);
      boss.position.set(0, 1.95, -12.6);
      g.add(boss);
    },
  });

  /* ---------- 机舱行车 ---------- */
  reg.add({
    id: 'aux-crane', label: '机舱行车（双梁 + 电动葫芦）', layer: 'aux', sub: '检修设施',
    details: ['双主梁', '端梁', '电动小车', '钢丝绳', '吊钩', '运行轨道'],
    build: (g, c) => {
      for (const z of [5.4, 7.6]) {
        const beam = box(12.6, 0.55, 0.35, c.m('paintedYellow'));
        beam.position.set(0, 12.4, z);
        g.add(beam);
        for (const x of [-6.2, 6.2]) {
          const end = box(0.4, 0.7, 2.6, c.m('steelDark'));
          end.position.set(x, 12.3, 6.5);
          g.add(end);
        }
      }
      const trolley = box(1.3, 0.45, 1.7, c.m('steelDark'));
      trolley.position.set(1.2, 11.95, 6.5);
      g.add(trolley);
      const drum = cyl(0.28, 0.28, 1.1, 20, c.m('machinedSteel'), 'z');
      drum.position.set(1.2, 11.75, 6.5);
      g.add(drum);
      // 吊钩停放在排气集管（最高点 y≈7.5）之上，避免钩头插进管路
      for (const x of [0.95, 1.45]) {
        const cable = cyl(0.02, 0.02, 2.6, 6, c.m('steelDark'), 'y');
        cable.position.set(x, 10.3, 6.5);
        g.add(cable);
      }
      const block = box(0.4, 0.5, 0.5, c.m('paintedYellow'));
      block.position.set(1.2, 8.85, 6.5);
      g.add(block);
      const hook = torus(0.2, 0.05, c.m('forgedSteel'), Math.PI * 1.4, 20, 8);
      hook.position.set(1.2, 8.4, 6.5);
      g.add(hook);
      // 轨道
      for (const x of [-6.3, 6.3]) {
        const rail = box(0.16, 0.2, 16, c.m('steelDark'));
        rail.position.set(x, 12.1, 5.2);
        g.add(rail);
      }
    },
  });

  /* ---------- 通风筒 ---------- */
  /* 通风筒按筒体拆成独立构件：跨区域的合并件会破坏干涉检测的空间语义
   * 舷别与坐标必须一致：x>0 为右舷、x<0 为左舷（早先三条标签的舷别全写反了）。
   * 后部左舷风筒原在 z=-6.0，正好落在燃机隔声罩（x∈[-5.78,-2.22]）内、
   * 且穿过燃烧室机匣（x∈[-5.18,-2.82] / y∈[7.12,9.48]）——移到隔声罩之后的空舱段。 */
  const VENTS = [
    ['aux-vent-port-fwd', '通风筒 · 左舷前部', -5.2, 7.6],
    ['aux-vent-stbd-fwd', '通风筒 · 右舷前部', 5.2, 11.6],
    ['aux-vent-port-aft', '通风筒 · 左舷后部（燃机舱之后）', -5.4, -11.0],
  ];
  for (const [id, label, X, Z] of VENTS) {
    reg.add({
      id, label, layer: 'aux', sub: '辅助系统', shell: true,
      details: ['圆形风筒', '可调百叶', '防鼠网', '支吊架'],
      build: (g, c) => {
        const duct = cyl(0.55, 0.55, 7.4, 28, c.m('paintedWhite'), 'y');
        duct.position.set(X, 3.7, Z);
        g.add(duct);
        const flange = torus(0.56, 0.06, c.m('steelDark'), Math.PI * 2, 28, 8);
        flange.rotation.x = Math.PI / 2;
        flange.position.set(X, 5.4, Z);
        g.add(flange);
        const hood = cyl(0.85, 0.6, 0.4, 28, c.m('paintedWhite'), 'y');
        hood.position.set(X, 7.6, Z);
        g.add(hood);
        for (let i = 0; i < 8; i++) {
          const lv = box(1.4, 0.03, 0.12, c.m('steelDark'));
          lv.position.set(X, 7.42, Z);
          lv.rotation.y = (i / 8) * Math.PI;
          g.add(lv);
        }
        const br = box(0.1, 0.1, 1.4, c.m('steelDark'));
        br.position.set(X, 6.4, Z + 0.7);
        g.add(br);
      },
    });
  }

  reg.add({
    id: 'aux-lighting', label: '机舱照明灯具 / 应急灯', layer: 'aux', sub: '辅助系统',
    details: ['LED 泛光灯', '防爆灯', '灯架', '应急指示'],
    build: (g, c) => {
      const spots = [[-4.5, 10.5, 3.0], [4.5, 10.5, 0.5], [0, 10.2, 9.5], [-2.0, 9.6, -6.5], [3.6, 9.0, -9.5]];
      for (const [x, y, z] of spots) {
        const housing = rbox(0.7, 0.16, 0.34, 0.04, c.m('steelDark'));
        housing.position.set(x, y, z);
        g.add(housing);
        const lens = box(0.62, 0.03, 0.26, c.m('emissiveWarm'));
        lens.position.set(x, y - 0.1, z);
        g.add(lens);
        const rod = cyl(0.02, 0.02, 1.0, 6, c.m('steelDark'), 'y');
        rod.position.set(x, y + 0.55, z);
        g.add(rod);
        const bracket = box(0.5, 0.05, 0.05, c.m('steelDark'));
        bracket.position.set(x, y + 1.0, z);
        g.add(bracket);
      }
    },
  });

  /* ---------- 控制箱 ---------- */
  reg.add({
    id: 'aux-console', label: '机舱控制台 / 仪表屏', layer: 'aux', sub: '控制系统',
    details: ['主控制箱', '转速表', '螺距指示器', '报警灯板', '操纵手柄', '接线端子'],
    build: (g, c) => {
      // 贴右舷纵置：纵深沿 x（0.8 m），长度沿 z（2.6 m），屏面朝舱内（-x）
      const body = rbox(0.8, 1.65, 2.6, 0.05, c.m('epoxyGrey'));
      body.position.set(5.9, 0.9, 2.0);
      g.add(body);
      const panel = box(0.06, 0.95, 2.35, c.m('polymer'));
      panel.position.set(5.46, 1.2, 2.0);
      panel.rotation.z = 0.18;
      g.add(panel);
      for (let i = 0; i < 4; i++) {
        const z = 1.15 + i * 0.55;
        const dial = cyl(0.14, 0.14, 0.03, 24, c.m('paintedWhite'), 'x');
        dial.position.set(5.42, 1.38, z);
        g.add(dial);
        const rim = torus(0.145, 0.012, c.m('chrome'), Math.PI * 2, 24, 6);
        rim.position.set(5.40, 1.38, z);
        rim.rotation.y = Math.PI / 2;
        g.add(rim);
      }
      for (let i = 0; i < 5; i++) {
        const lamp = cyl(0.055, 0.055, 0.05, 12, c.m(i === 0 ? 'emissiveGreen' : i < 3 ? 'emissiveCyan' : 'emissiveRed'), 'x');
        lamp.position.set(5.42, 0.92, 1.2 + i * 0.16);
        g.add(lamp);
      }
      const handle = cyl(0.045, 0.045, 0.34, 10, c.m('steelDark'), 'x');
      handle.position.set(5.38, 1.02, 3.0);
      g.add(handle);
      const knob = cyl(0.07, 0.07, 0.06, 12, c.m('paintedYellow'), 'x');
      knob.position.set(5.22, 1.02, 3.0);
      g.add(knob);
      const base = box(0.95, 0.1, 2.8, c.m('steelDark'));
      base.position.set(5.9, 0.1, 2.0);
      g.add(base);
    },
  });

  reg.add({
    id: 'aux-pumps', label: '滑油泵 / 海水泵 / 淡水泵组', layer: 'aux', sub: '辅助系统',
    details: ['离心泵蜗壳', '泵轴', '机械密封', '联轴器', '电机', '底座', '吸入/排出法兰'],
    build: (g, c) => {
      const pumps = [[-1.8, 0.9, 11.6, 'pipeLO'], [0.2, 0.9, 11.6, 'pipeSW'], [2.2, 0.9, 11.6, 'pipeFW']];
      pumps.forEach(([x, y, z, pipeMat], i) => {
        const base = box(1.1, 0.22, 0.8, c.m('steelDark'));
        base.position.set(x, 0.11, z);
        g.add(base);
        const volute = latheZ([[0, -0.26], [0.34, -0.24], [0.44, -0.05], [0.4, 0.18], [0.18, 0.26], [0, 0.26]], c.m('epoxyGrey'), 28);
        volute.position.set(x, y, z - 0.35);
        g.add(volute);
        const motor = cyl(0.28, 0.28, 0.85, 24, c.m('paintedWhite'), 'z');
        motor.position.set(x, y, z + 0.4);
        g.add(motor);
        for (let f = 0; f < 6; f++) {
          const fin = box(0.04, 0.56, 0.06, c.m('paintedWhite'));
          fin.position.set(x + Math.cos((f / 6) * Math.PI * 2) * 0.27, y + Math.sin((f / 6) * Math.PI * 2) * 0.27, z + 0.4);
          g.add(fin);
        }
        const coup = cyl(0.11, 0.11, 0.16, 16, c.m('machinedSteel'), 'z');
        coup.position.set(x, y, z + 0.02);
        g.add(coup);
        // 排出法兰开在蜗壳 -z 端面（面向机舱通道），管系从法兰面接管，
        // 而不是像早先那样把 -x 侧法兰和 -z 向管道硬接在一起。
        const fl = cyl(0.18, 0.18, 0.05, 20, c.m(pipeMat), 'z');
        fl.position.set(x, y + 0.1, z - 0.63);
        g.add(fl);
      });
    },
  });

  /* ---------- 管系 ---------- */
  reg.add({
    id: 'aux-silencer', label: '排气消音器 / 排气管', layer: 'aux', sub: '管系', shell: true,
    details: ['消音器筒体', '膨胀节', '支吊架', '排气管', '泄放口'],
    build: (g, c) => {
      const body = cyl(1.15, 1.15, 3.4, 32, c.m('lagging'), 'y');
      body.position.set(4.6, 10.6, 10.6);
      g.add(body);
      const cap = cyl(1.22, 1.05, 0.35, 32, c.m('steelDark'), 'y');
      cap.position.set(4.6, 12.45, 10.6);
      g.add(cap);
      g.add(pipe([[2.7, 9.6, 12.6], [3.6, 9.8, 12.4], [4.6, 10.0, 11.8], [4.6, 9.0, 10.6]], 0.55, c.m('pipeExhaust'), 30));
      for (const y of [9.4, 11.2]) {
        const band = torus(1.18, 0.05, c.m('steelDark'), Math.PI * 2, 32, 6);
        band.rotation.x = Math.PI / 2;
        band.position.set(4.6, y, 10.6);
        g.add(band);
      }
    },
  });

  reg.add({
    id: 'aux-gravity-tank', label: '艉轴管重力油柜', layer: 'aux', sub: '管系', shell: true, pos: [-0.5, 0, 0],
    details: ['重力油柜', '液位计', '低液位报警', '补油阀', '透气管'],
    build: (g, c) => {
      const tank = rbox(1.3, 1.5, 1.05, 0.07, c.m('paintedWhite'));
      tank.position.set(5.5, 3.6, -11.9);
      g.add(tank);
      // 柜顶透气管 + 补油口
      const vent = cyl(0.035, 0.035, 1.0, 8, c.m('steelDark'), 'y');
      vent.position.set(5.5, 4.8, -11.9);
      g.add(vent);
      const sight = cyl(0.045, 0.045, 1.1, 10, c.m('glass'), 'y');
      sight.position.set(4.81, 3.6, -11.9);
      g.add(sight);
      for (const y of [3.05, 4.15]) {
        const br = box(0.42, 0.05, 0.08, c.m('steelDark'));
        br.position.set(5.0, y, -11.9);
        g.add(br);
      }
      const legY = box(0.1, 1.4, 0.1, c.m('steelDark'));
      legY.position.set(6.05, 2.25, -12.35);
      g.add(legY);
      const legY2 = legY.clone();
      legY2.position.set(6.05, 2.25, -11.45);
      g.add(legY2);
      // 至艉管密封的静压供油管
      g.add(pipe([[5.5, 2.9, -11.9], [5.5, 2.6, -12.15], [3.2, 2.4, -12.2], [1.15, 2.35, -12.35]], 0.055, c.m('pipeLO'), 50));
    },
  });

  /* ---------- 消防 / 电缆 ---------- */
  reg.add({
    id: 'aux-fire', label: '机舱固定灭火系统 / 灭火器', layer: 'aux', sub: '安全', pos: [1.1, 0, 0],
    details: ['CO₂ 瓶组', '瓶头阀', '集流管', '喷放管', '声光报警'],
    build: (g, c) => {
      for (let i = 0; i < 4; i++) {
        const b = latheZ([[0, -0.6], [0.16, -0.58], [0.17, 0.55], [0.1, 0.66], [0, 0.66]], c.m('emissiveRed'), 20);
        b.position.set(-6.9, 1.0, -8.4 + i * 0.42);
        g.add(b);
      }
      const manifold = cyl(0.07, 0.07, 1.9, 12, c.m('steelDark'), 'z');
      manifold.position.set(-6.9, 1.75, -7.75);
      g.add(manifold);
      const alarm = cyl(0.09, 0.09, 0.12, 14, c.m('emissiveRed'), 'y');
      alarm.position.set(-6.2, 3.0, -6.8);
      g.add(alarm);
    },
  });


  /* ---------- 管系：正交布管 + 管夹 + 法兰（详见 piping.js） ---------- */
  buildPiping(reg);

  return { DECK_Y, dais };
}
