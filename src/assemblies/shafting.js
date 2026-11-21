import * as THREE from 'three';
import {
  box, cyl, rbox, torus, pipe, boltCircle, hexBolt, latheZ, tubeShell, ringFlat, plateWithHoles, mesh,
} from '../core/utils.js';

export const SHAFT = {
  y: 1.95,
  couplingZ: -2.45,
  brakeZ: -4.2,
  thrustZ: -5.4,
  imdBearZ: -6.9,
  tubeFront: -7.6,
  tubeAft: -12.9,
  hubZ: -14.6,
};

export function buildShafting(reg) {
  const Y = SHAFT.y;
  const refs = { rotating: [], brake: null, oilFilm: null, sealParts: [], oilRing: null, caliper: null };

  /* ---------------- 弹性联轴器 ---------------- */
  refs.rotating.push(reg.add({
    id: 'shaft-flex-coupling', label: '高弹性联轴器 / 法兰螺栓', layer: 'shaft', sub: '联轴器',
    pos: [0, Y, SHAFT.couplingZ], dir: [0, 0.9, 0.3], dist: 4.2,
    details: ['主动法兰', '从动法兰', '橡胶块组', '高强度螺栓', '定心环', '轴向限位'],
    build: (g, c) => {
      const f1 = cyl(0.55, 0.55, 0.12, 40, c.m('forgedSteel'), 'z');
      f1.position.z = -0.16;
      g.add(f1);
      const f2 = cyl(0.55, 0.55, 0.12, 40, c.m('forgedSteel'), 'z');
      f2.position.z = 0.16;
      g.add(f2);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const rub = rbox(0.12, 0.16, 0.16, 0.03, c.m('rubber'));
        rub.position.set(Math.cos(a) * 0.34, Math.sin(a) * 0.34, 0);
        rub.rotation.z = a;
        g.add(rub);
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const b = hexBolt(0.05, 0.3, c.m('steelDark'));
        b.rotation.x = Math.PI / 2;
        b.position.set(Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0);
        g.add(b);
      }
      const ring = torus(0.22, 0.035, c.m('bronze'), Math.PI * 2, 32, 8);
      ring.rotation.x = Math.PI / 2;
      ring.position.z = 0.24;
      g.add(ring);
    },
  }));

  /* ---------------- 中间轴 ---------------- */
  refs.rotating.push(reg.add({
    id: 'shaft-intermediate', label: '中间轴 / 联轴器法兰', layer: 'shaft', sub: '轴段',
    pos: [0, Y, -4.95], dir: [0, 0.8, 0.6], dist: 5.8,
    details: ['锻钢中间轴', '两端联轴器法兰', '键', '防腐涂层', '轴系接地滑环'],
    build: (g, c) => {
      const shaft = cyl(0.26, 0.26, 4.75, 28, c.m('stainless'), 'z');
      g.add(shaft);
      for (const z of [-2.32, 2.32]) {
        const fl = cyl(0.5, 0.5, 0.16, 36, c.m('machinedSteel'), 'z');
        fl.position.z = z;
        g.add(fl);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const b = hexBolt(0.05, 0.22, c.m('steelDark'));
          b.rotation.x = Math.PI / 2;
          b.position.set(Math.cos(a) * 0.39, Math.sin(a) * 0.39, z + 0.12);
          g.add(b);
        }
      }
      // 轴系接地滑环
      const slip = cyl(0.3, 0.3, 0.1, 28, c.m('bronze'), 'z');
      slip.position.z = -1.8;
      g.add(slip);
    },
  }));

  /* ---------------- 轴系接地 ---------------- */
  reg.add({
    id: 'shaft-grounding', label: '轴系接地装置 / 碳刷', layer: 'shaft', sub: '附件',
    pos: [0, Y + 0.42, -4.25], dir: [0.6, 1, 0], dist: 3.2,
    details: ['接地滑环', '碳刷', '刷架', '弹簧压紧', '接地电缆'],
    build: (g, c) => {
      const holder = rbox(0.26, 0.2, 0.5, 0.03, c.m('polymer'));
      g.add(holder);
      for (const z of [-0.16, 0.16]) {
        const brush = box(0.1, 0.22, 0.1, c.m('steelDark'));
        brush.position.set(-0.08, -0.18, z);
        g.add(brush);
        const spring = torus(0.05, 0.012, c.m('steelDark'), Math.PI * 2, 12, 6);
        spring.rotation.x = Math.PI / 2;
        spring.position.set(0.05, 0.02, z);
        g.add(spring);
      }
      g.add(pipe([[0.1, 0.05, 0.2], [0.3, 0.2, 0.4], [0.45, 0.3, 0.6]], 0.03, c.m('cable'), 14, 6));
    },
  });

  /* ---------------- 轴系制动器 ---------------- */
  refs.brake = reg.add({
    id: 'shaft-brake-disc', label: '轴系制动盘', layer: 'shaft', sub: '制动',
    pos: [0, Y, SHAFT.brakeZ], dir: [0, 0.6, 0.4], dist: 4.0,
    details: ['制动盘', '盘毂', '通风槽', '磨损指示'],
    build: (g, c) => {
      const disc = cyl(0.66, 0.66, 0.12, 48, c.m('machinedSteel'), 'z');
      g.add(disc);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const slot = box(0.16, 0.28, 0.13, c.m('steelDark'));
        slot.position.set(Math.cos(a) * 0.44, Math.sin(a) * 0.44, 0);
        slot.rotation.z = a;
        g.add(slot);
      }
      const hub = cyl(0.28, 0.28, 0.2, 28, c.m('forgedSteel'), 'z');
      g.add(hub);
    },
  });

  refs.caliper = reg.add({
    id: 'shaft-brake-caliper', label: '制动钳 / 液压缸', layer: 'shaft', sub: '制动',
    pos: [0, Y + 0.82, SHAFT.brakeZ], dir: [0, 1, 0.5], dist: 3.2,
    details: ['制动钳体', '摩擦片', '液压缸', '弹簧释放', '限位开关'],
    build: (g, c) => {
      const body = rbox(0.5, 0.34, 0.26, 0.04, c.m('paintedYellow'));
      g.add(body);
      for (const z of [-0.1, 0.1]) {
        const pad = box(0.4, 0.1, 0.06, c.m('rubber'));
        pad.position.set(0, -0.2, z);
        g.add(pad);
      }
      const cylH = cyl(0.1, 0.1, 0.3, 16, c.m('machinedSteel'), 'y');
      cylH.position.y = 0.28;
      g.add(cylH);
      const hose = pipe([[0.15, 0.3, 0], [0.4, 0.35, 0.1], [0.5, 0.2, 0.3]], 0.03, c.m('cable'), 16, 6);
      g.add(hose);
    },
  });

  /* ---------------- 推力轴承 ---------------- */
  refs.rotating.push(reg.add({
    id: 'thrust-collar', label: '推力环 / 推力轴', layer: 'shaft', sub: '推力轴承',
    pos: [0, Y, SHAFT.thrustZ], dir: [0, 0.8, 0.2], dist: 4.0,
    details: ['推力环（锻钢）', '推力轴', '工作面研磨', '油孔', '温度测点'],
    build: (g, c) => {
      const collar = cyl(0.72, 0.72, 0.2, 48, c.m('machinedSteel'), 'z');
      g.add(collar);
      const shaft = cyl(0.3, 0.3, 1.5, 28, c.m('forgedSteel'), 'z');
      g.add(shaft);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const b = hexBolt(0.04, 0.08, c.m('steelDark'));
        b.rotation.x = Math.PI / 2;
        b.position.set(Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0.12);
        g.add(b);
      }
    },
  }));

  reg.add({
    id: 'thrust-pads', label: '推力块组 / 轴承壳体', layer: 'shaft', sub: '推力轴承', shell: true,
    pos: [0, Y, SHAFT.thrustZ], dir: [0, 1.1, -0.5], dist: 4.4,
    details: ['推力块（8 块）', '白合金工作面', '球面支承', '轴承壳体', '进油环', '回油管'],
    build: (g, c) => {
      const housing = latheZ([
        [0.75, -0.4], [1.05, -0.4], [1.05, 0.4], [0.75, 0.4], [0.75, -0.4],
      ], c.m('castIron'), 48);
      g.add(housing);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const pad = box(0.26, 0.34, 0.12, c.m('whiteMetal'));
        pad.position.set(Math.cos(a) * 0.84, Math.sin(a) * 0.84, 0.16);
        pad.rotation.z = a;
        g.add(pad);
        const back = box(0.24, 0.32, 0.1, c.m('forgedSteel'));
        back.position.set(Math.cos(a) * 0.84, Math.sin(a) * 0.84, 0.25);
        back.rotation.z = a;
        g.add(back);
      }
      const ring = torus(0.9, 0.06, c.m('pipeLO'), Math.PI * 2, 48, 8);
      ring.rotation.x = Math.PI / 2;
      ring.position.z = -0.42;
      g.add(ring);
    },
  });

  refs.oilFilm = reg.add({
    id: 'thrust-oil-film', label: '推力油膜（压力可视化）', layer: 'shaft', sub: '推力轴承',
    pos: [0, Y, SHAFT.thrustZ], dir: [0, 1.3, 0.9], dist: 3.4,
    details: ['油膜间隙 0.05–0.12 mm', '动压油楔', '油膜压力分布', '油温测点'],
    build: (g, c) => {
      const m = c.m('oilGlow');
      const t = torus(0.66, 0.035, m, Math.PI * 2, 64, 8);
      t.scale.z = 0.3;
      g.add(t);
      const disc = ringFlat(0.36, 0.72, m);
      disc.rotation.x = Math.PI / 2;
      g.add(disc);
    },
    merge: false,
  });

  /* ---------------- 中间轴承 ---------------- */
  reg.add({
    id: 'shaft-intermediate-bearing', label: '中间轴承 / 轴瓦 / 油环', layer: 'shaft', sub: '中间轴承', shell: true,
    pos: [0, Y, SHAFT.imdBearZ], dir: [0, 1.0, -0.3], dist: 4.2,
    details: ['轴承壳体', '上/下轴瓦（白合金）', '油环', '油位视镜', '冷却水腔', '温度传感器'],
    build: (g, c) => {
      const housing = latheZ([
        [0.44, -0.42], [0.72, -0.42], [0.78, -0.2], [0.78, 0.2], [0.72, 0.42], [0.44, 0.42], [0.44, -0.42],
      ], c.m('castIron'), 44);
      g.add(housing);
      const shellB = tubeShell(0.44, 0.32, 0.8, c.m('whiteMetal'), 'z', 36);
      g.add(shellB);
      for (const z of [-0.28, 0, 0.28]) {
        const groove = torus(0.36, 0.02, c.m('brass'), Math.PI * 2, 32, 6);
        groove.position.z = z;
        g.add(groove);
      }
      const sight = cyl(0.06, 0.06, 0.06, 12, c.m('glass'), 'z');
      sight.position.set(0.55, 0.3, 0.35);
      g.add(sight);
    },
  });

  refs.oilRing = reg.add({
    id: 'shaft-oil-ring', label: '中间轴承油环', layer: 'shaft', sub: '中间轴承',
    pos: [0, Y, SHAFT.imdBearZ + 0.5], dir: [0, 1.2, 0.6], dist: 3.0,
    details: ['油环', '油环槽', '携油孔'],
    build: (g, c) => {
      const ring = torus(0.42, 0.045, c.m('bronze'), Math.PI * 2, 48, 8);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      const hub = cyl(0.36, 0.36, 0.05, 32, c.m('bronze'), 'z');
      g.add(hub);
    },
  });

  /* ---------------- 艉轴 ---------------- */
  refs.rotating.push(reg.add({
    id: 'stern-shaft', label: '艉轴 / 螺旋桨轴', layer: 'stern', sub: '艉轴',
    pos: [0, Y, -10.4], dir: [0, 0.6, -0.6], dist: 5.0,
    details: ['锻钢艉轴', '锥形前端', '键槽', '包覆防腐层', '轴端螺纹'],
    build: (g, c) => {
      const s = cyl(0.33, 0.33, 7.0, 30, c.m('stainlessWet'), 'z');
      g.add(s);
      const taper = cyl(0.28, 0.33, 0.6, 30, c.m('stainlessWet'), 'z');
      taper.position.z = -3.7;
      g.add(taper);
      const key = box(0.14, 0.08, 1.1, c.m('forgedSteel'));
      key.position.set(0, 0.33, -3.3);
      g.add(key);
      // 包覆层
      for (const z of [-3.0, -1.4]) {
        const band = torus(0.335, 0.02, c.m('rubberSeal'), Math.PI * 2, 32, 6);
        band.position.z = z;
        g.add(band);
      }
    },
  }));

  /* ---------------- 艉管 ---------------- */
  reg.add({
    id: 'stern-tube', label: '艉管本体 / 前后法兰', layer: 'stern', sub: '艉管', shell: true,
    pos: [0, Y, -10.25], dir: [0, 0.9, -0.4], dist: 5.4,
    details: ['艉管筒体', '前/后法兰', '冷却水腔', '防腐涂层', '人孔盖'],
    build: (g, c) => {
      const tube = tubeShell(0.64, 0.46, 5.3, c.m('epoxy'), 'z', 40);
      g.add(tube);
      for (const z of [-2.6, 2.6]) {
        const fl = cyl(0.82, 0.82, 0.12, 44, c.m('castIron'), 'z');
        fl.position.z = z;
        g.add(fl);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const b = hexBolt(0.045, 0.1, c.m('steelDark'));
          b.rotation.x = Math.PI / 2;
          b.position.set(Math.cos(a) * 0.72, Math.sin(a) * 0.72, z + 0.1);
          g.add(b);
        }
      }
      const manhole = cyl(0.16, 0.16, 0.06, 20, c.m('castIronDark'), 'y');
      manhole.position.set(0, 0.63, 0.4);
      g.add(manhole);
      // 阳极
      for (const z of [-2.0, 0.8]) {
        const an = box(0.3, 0.06, 0.16, c.m('whiteMetal'));
        an.position.set(0, -0.66, z);
        g.add(an);
      }
    },
  });

  /* ---------------- 白合金轴承 ---------------- */
  reg.add({
    id: 'stern-bearings', label: '艉管前 / 后白合金轴承', layer: 'stern', sub: '轴承',
    pos: [0, Y, -10.2], dir: [0, 0.6, 0], dist: 4.6,
    details: ['前白合金轴承', '后白合金轴承', '螺旋油槽', '轴承衬套', '止推凸缘'],
    build: (g, c) => {
      const fore = tubeShell(0.45, 0.335, 1.25, c.m('whiteMetal'), 'z', 36);
      fore.position.z = 2.1;
      g.add(fore);
      const aft = tubeShell(0.45, 0.335, 1.15, c.m('whiteMetal'), 'z', 36);
      aft.position.z = -2.1;
      g.add(aft);
      // 螺旋油槽
      for (const [zc, len] of [[2.1, 1.2], [-2.1, 1.1]]) {
        for (let i = 0; i < 26; i++) {
          const t = i / 26;
          const a = t * Math.PI * 2.2;
          const gs = box(0.035, 0.02, len / 26, c.m('brass'));
          gs.position.set(Math.cos(a) * 0.39, Math.sin(a) * 0.39, zc - len / 2 + t * len);
          gs.rotation.z = a;
          gs.rotation.x = 0.5;
          g.add(gs);
        }
      }
    },
  });

  /* ---------------- 三道唇形密封 ---------------- */
  for (let i = 0; i < 3; i++) {
    const z = -12.35 - i * 0.28;
    refs.sealParts.push(reg.add({
      id: `stern-seal-${i + 1}`, label: `艉管唇形密封 · 第 ${i + 1} 道（FKM）`, layer: 'stern', sub: '密封',
      pos: [0, Y, z], dir: [0, 0.5, -1], dist: 3.6 + i * 0.5,
      details: ['氟橡胶唇形密封圈', '环形弹簧（garter spring）', '骨架', '唇口', '防尘副唇', '注脂通道'],
      build: (g, c) => {
        const prof = [
          [0.345, -0.055], [0.47, -0.06], [0.5, -0.02], [0.5, 0.06],
          [0.44, 0.075], [0.36, 0.04], [0.335, 0.0], [0.345, -0.055],
        ].map(([r, y]) => new THREE.Vector2(r, y));
        const seal = mesh(new THREE.LatheGeometry(prof, 48), c.m('rubberSeal'));
        seal.rotation.x = Math.PI / 2;
        g.add(seal);
        const spring = torus(0.352, 0.012, c.m('machinedSteel'), Math.PI * 2, 48, 6);
        spring.rotation.x = Math.PI / 2;
        spring.position.z = -0.03;
        g.add(spring);
      },
      merge: false,
    }));
  }

  reg.add({
    id: 'stern-gland', label: '密封压盖 / 防松螺栓', layer: 'stern', sub: '密封', shell: true,
    pos: [0, Y, -13.05], dir: [0, 0.4, -1], dist: 4.6,
    details: ['压盖本体', '压盖防松螺栓', '调整垫片', '注脂嘴', '泄放口'],
    build: (g, c) => {
      const gland = latheZ([
        [0.4, -0.06], [0.56, -0.06], [0.58, 0.0], [0.58, 0.1], [0.4, 0.1], [0.4, -0.06],
      ], c.m('bronze'), 44);
      g.add(gland);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const b = hexBolt(0.04, 0.05, c.m('machinedSteel'));
        b.rotation.x = Math.PI / 2;
        b.position.set(Math.cos(a) * 0.5, Math.sin(a) * 0.5, -0.06);
        g.add(b);
      }
      const grease = cyl(0.035, 0.035, 0.12, 10, c.m('brass'), 'y');
      grease.position.set(0, 0.58, 0);
      g.add(grease);
    },
  });

  /* ---------------- 压力平衡 / 海水腔 ---------------- */
  reg.add({
    id: 'stern-balance-ring', label: '压力平衡环 / 滑油腔', layer: 'stern', sub: '密封',
    pos: [0, Y, -11.75], dir: [0, 0.9, 0.4], dist: 3.8,
    details: ['压力平衡环', '环形油腔', '滑油进油口', '压力表接头', '回油口'],
    build: (g, c) => {
      const ring = torus(0.5, 0.075, c.m('brass'), Math.PI * 2, 48, 10);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      const port = cyl(0.05, 0.05, 0.16, 10, c.m('pipeLO'), 'y');
      port.position.set(0, 0.55, 0);
      g.add(port);
    },
  });

  reg.add({
    id: 'stern-seawater-chamber', label: '海水平衡腔 / 冷却水腔', layer: 'stern', sub: '密封',
    pos: [0, Y, -11.35], dir: [0, 0.7, 0.7], dist: 3.4,
    details: ['海水平衡腔', '海水进/出口', '滤网', '防海生物电极', '压力传感器'],
    build: (g, c) => {
      const t = torus(0.47, 0.05, c.m('waterGlow'), Math.PI * 2, 40, 8);
      t.rotation.x = Math.PI / 2;
      g.add(t);
      const inlet = cyl(0.06, 0.06, 0.18, 10, c.m('pipeSW'), 'y');
      inlet.position.set(0, 0.55, 0);
      g.add(inlet);
    },
    merge: false,
  });

  /* ---------------- 滑油管路 ---------------- */
  reg.add({
    id: 'stern-lube-line', label: '艉管滑油管路 / 注脂管', layer: 'stern', sub: '密封',
    pos: [0, 0, 0], dir: [0, 0.8, 0.4], dist: 5.0,
    details: ['滑油供油管', '注脂管', '压力表', '截止阀', '管夹'],
    build: (g, c) => {
      // 艉管壁为 0.46/0.64 的筒体，油管必须走在筒体之外（半径 >0.64），
      // 末端以一段短的径向注入管接到管壁注油口上；早先油管直接埋进管壁 0.3 m。
      g.add(pipe([
        [5.2, 8.2, -8.6], [5.2, 6.2, -8.6], [1.0, 5.9, -8.6],
        [0.05, 2.95, -8.2], [0.05, 2.95, -9.6], [0.0, 2.95, -11.4],
      ], 0.045, c.m('pipeLO'), 60, 8));
      g.add(pipe([[0.0, 2.95, -11.4], [0.0, 2.62, -11.4]], 0.03, c.m('pipeLO'), 8, 6));
      g.add(pipe([[1.1, 3.4, -12.0], [0.8, 2.9, -12.1], [0.62, 2.9, -12.2]], 0.03, c.m('brass'), 30, 6));
      const valve = cyl(0.07, 0.07, 0.12, 12, c.m('paintedYellow'), 'y');
      valve.position.set(0.9, 5.8, -8.6);
      g.add(valve);
    },
  });

  return refs;
}
