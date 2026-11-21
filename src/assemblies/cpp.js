import * as THREE from 'three';
import {
  box, cyl, rbox, torus, pipe, boltCircle, hexBolt, latheZ, ringFlat, mesh,
} from '../core/utils.js';

export const PROP = { y: 1.95, z: -15.2, R: 3.45 };

/** 参数化大侧斜桨叶：径向 x 弦向网格 + 螺距角扭转 + 侧斜 + 收边 */
function bladeGeometry({
  r0 = 0.92, R = 3.45, pitch = 5.0, skew = 0.62, chordRoot = 1.78, chordTip = 1.02,
  thick = 0.18, rake = 0.16,
}) {
  const NR = 30, NC = 12;
  const pos = [], uv = [], idx = [];
  const twoPi = Math.PI * 2;
  const pushSurface = (sign) => {
    const base = pos.length / 3;
    for (let i = 0; i <= NR; i++) {
      const u = i / NR;
      const r = r0 + (R - r0) * u;
      const chord = chordRoot + (chordTip - chordRoot) * Math.pow(u, 0.75);
      const beta = Math.atan2(pitch, twoPi * Math.max(0.55, r)) * (1.0 - 0.06 * u);
      const phi = skew * Math.pow(u, 1.35);
      const rz = rake * u * u;
      for (let j = 0; j <= NC; j++) {
        const v = j / NC;
        const s = (v - 0.5) * chord;
        // 椭圆厚度律 + 最小厚度基底：导边/随边留钝边，避免零厚度薄刃在侧光下呈现尖刺
        const lens = 0.16 + 0.84 * Math.sqrt(Math.max(0.0001, 1 - Math.pow((v - 0.5) * 2, 2)));
        const t = sign * thick * 0.5 * lens * (1 - Math.pow(u, 2.2) * 0.72);
        // 截面坐标：弦向 s 绕切向轴转 beta，厚度 t 沿桨轴
        const along = s * Math.cos(beta) - t * Math.sin(beta);
        const across = -s * Math.sin(beta) - t * Math.cos(beta);
        // 侧斜：截面中心绕桨轴旋转 phi；切向单位向量 (cosφ, -sinφ, 0)
        pos.push(
          Math.sin(phi) * r + along * Math.cos(phi),
          Math.cos(phi) * r - along * Math.sin(phi),
          rz + across
        );
        uv.push(v, u);
      }
    }
    for (let i = 0; i < NR; i++) {
      for (let j = 0; j < NC; j++) {
        const a = base + i * (NC + 1) + j;
        const b = a + 1;
        const c = a + (NC + 1);
        const d = c + 1;
        if (sign > 0) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
    }
  };
  pushSurface(1);
  pushSurface(-1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildCpp(reg) {
  const refs = { blades: [], hub: null, servo: null, crankRing: null, linkDisc: null, slider: null, oilA: null, oilB: null, sensor: null, fppBlades: [], duct: null };
  const Y = PROP.y, Z = PROP.z;
  const AZ = [Math.PI / 4, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];

  /* ---------------- 桨毂壳体（可剖切） ---------------- */
  refs.hub = reg.add({
    id: 'cpp-hub', label: '可调距桨桨毂 / 叶片法兰座', layer: 'prop', sub: 'CPP 桨毂', shell: true,
    pos: [0, Y, Z], dir: [0, 0.2, -1], dist: 8.0, tags: ['cpp-only'],
    details: ['桨毂铸钢件', '叶片法兰座（4 处）', '伺服缸筒', '密封端盖', '阳极块'],
    build: (g, c) => {
      const mat = c.m('copperAlloy');
      const outer = latheZ([
        [0.28, -1.30], [0.95, -1.28], [1.12, -1.05], [1.15, -0.6],
        [1.15, 0.55], [1.02, 0.95], [0.62, 1.18], [0.34, 1.22],
      ], mat, 48);
      g.add(outer);
      const inner = latheZ([
        [0.16, -1.2], [0.86, -1.18], [1.02, -0.98], [1.05, -0.55],
        [1.05, 0.5], [0.93, 0.87], [0.56, 1.08], [0.3, 1.12],
      ], mat, 48);
      inner.material.side = THREE.DoubleSide;
      inner.scale.set(0.985, 0.985, 1);
      g.add(inner);
      // 叶片法兰座
      for (let i = 0; i < 4; i++) {
        const a = AZ[i];
        const boss = cyl(0.5, 0.56, 0.42, 28, c.m('copperMachined'), 'y');
        boss.position.set(Math.cos(a) * 1.02, Math.sin(a) * 1.02, 0);
        boss.rotation.z = a - Math.PI / 2;
        g.add(boss);
        const ring = torus(0.5, 0.05, c.m('bronze'), Math.PI * 2, 28, 8);
        ring.position.copy(boss.position);
        ring.rotation.x = Math.PI / 2;
        ring.rotation.z = a;
        g.add(ring);
      }
      // 阳极块
      for (let i = 0; i < 4; i++) {
        const a = AZ[i] + Math.PI / 4;
        const an = box(0.16, 0.06, 0.3, c.m('whiteMetal'));
        an.position.set(Math.cos(a) * 1.12, Math.sin(a) * 1.12, 0.2);
        an.rotation.z = a;
        g.add(an);
      }
    },
  });

  /* ---------------- 桨叶 ×4 ---------------- */
  for (let i = 0; i < 4; i++) {
    const a = AZ[i];
    const dir = [Math.sin(a), Math.cos(a), 0];
    const p = reg.add({
      id: `cpp-blade-${i + 1}`, label: `可调距桨桨叶 ${i + 1} / 叶根法兰`, layer: 'prop', sub: 'CPP 桨叶',
      pos: [0, Y, Z], dir, dist: 4.6, tags: ['cpp-only', 'cpp-blade'], rotOrder: 'ZYX',
      details: ['大侧斜铜合金桨叶（Ni-Al-Bronze）', '叶根法兰', '法兰螺栓 12×', '根部密封环', '导边/随边', '螺距角基准线'],
      build: (g, c) => {
        const geo = bladeGeometry({});
        const blade = mesh(geo, c.m('copperAlloy'));
        g.add(blade);
        // 叶根法兰与螺栓
        const flange = cyl(0.48, 0.5, 0.1, 32, c.m('copperMachined'), 'y');
        flange.position.y = 0.95;
        g.add(flange);
        for (let k = 0; k < 12; k++) {
          const ang = (k / 12) * Math.PI * 2;
          const b = hexBolt(0.042, 0.055, c.m('bronze'));
          b.position.set(Math.cos(ang) * 0.4, 1.02, Math.sin(ang) * 0.4);
          g.add(b);
        }
        // 根部密封环
        const seal = torus(0.43, 0.028, c.m('rubberSeal'), Math.PI * 2, 28, 8);
        seal.rotation.x = Math.PI / 2;
        seal.position.y = 0.9;
        g.add(seal);
      },
    });
    refs.blades.push(p);
  }

  /* ---------------- 桨毂内部液压机构 ---------------- */
  refs.servo = reg.add({
    id: 'cpp-servo-piston', label: '桨毂伺服活塞 / 活塞杆', layer: 'prop', sub: 'CPP 液压', shell: false,
    pos: [0, Y, Z], dir: [0, 1.05, -0.4], dist: 3.4, tags: ['cpp-only'],
    details: ['伺服活塞', '活塞杆', '活塞环', '正车油腔侧', '倒车油腔侧'],
    build: (g, c) => {
      const piston = cyl(0.6, 0.6, 0.5, 32, c.m('machinedSteel'), 'z');
      g.add(piston);
      for (const z of [-0.18, 0.05]) {
        const ring = torus(0.6, 0.022, c.m('rubberSeal'), Math.PI * 2, 32, 8);
        ring.position.z = z;
        g.add(ring);
      }
      const rod = cyl(0.13, 0.13, 1.7, 18, c.m('chrome'), 'z');
      g.add(rod);
      const nut = cyl(0.2, 0.2, 0.12, 8, c.m('machinedSteel'), 'z');
      nut.position.z = 0.32;
      g.add(nut);
    },
  });

  refs.crankRing = reg.add({
    id: 'cpp-crank-ring', label: '曲柄销环 / 偏心销', layer: 'prop', sub: 'CPP 液压',
    pos: [0, Y, Z], dir: [0, 1.25, 0.1], dist: 3.8, tags: ['cpp-only'],
    details: ['曲柄销环', '偏心销（4 处）', '滑块销', '止推面', '润滑油孔'],
    build: (g, c) => {
      const ring = torus(0.62, 0.09, c.m('machinedSteel'), Math.PI * 2, 40, 10);
      ring.position.z = 0.5;
      g.add(ring);
      for (let i = 0; i < 4; i++) {
        const a = AZ[i];
        const pin = cyl(0.09, 0.09, 0.34, 14, c.m('chrome'), 'z');
        pin.position.set(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0.5);
        g.add(pin);
      }
      const hub = cyl(0.16, 0.16, 0.3, 20, c.m('forgedSteel'), 'z');
      hub.position.z = 0.5;
      g.add(hub);
    },
  });

  reg.add({
    id: 'cpp-slider', label: '滑块 / 滑块凹槽', layer: 'prop', sub: 'CPP 液压',
    pos: [0, Y, Z], dir: [0, 0.9, 0.8], dist: 3.6, tags: ['cpp-only'],
    details: ['滑块', '滑块凹槽', '销轴', '耐磨衬板', '润滑槽'],
    build: (g, c) => {
      for (let i = 0; i < 4; i++) {
        const a = AZ[i];
        const slot = box(0.3, 0.16, 0.4, c.m('machinedSteel'));
        slot.position.set(Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0.5);
        slot.rotation.z = a;
        g.add(slot);
        const pin = cyl(0.06, 0.06, 0.3, 12, c.m('chrome'), 'z');
        pin.position.set(Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0.5);
        g.add(pin);
      }
    },
  });

  refs.linkDisc = reg.add({
    id: 'cpp-link-disc', label: '联动盘 / 桨叶转臂', layer: 'prop', sub: 'CPP 液压',
    pos: [0, Y, Z], dir: [0, 1.4, 0.5], dist: 4.0, tags: ['cpp-only'],
    details: ['联动盘', '桨叶转臂（4 处）', '连杆销', '止推垫圈', '锁紧螺母'],
    build: (g, c) => {
      const disc = cyl(0.78, 0.78, 0.1, 40, c.m('machinedSteel'), 'z');
      disc.position.z = 0.85;
      g.add(disc);
      for (let i = 0; i < 4; i++) {
        const a = AZ[i];
        const arm = box(0.5, 0.14, 0.08, c.m('forgedSteel'));
        arm.position.set(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0.85);
        arm.rotation.z = a;
        g.add(arm);
        const pin = cyl(0.05, 0.05, 0.16, 10, c.m('chrome'), 'z');
        pin.position.set(Math.cos(a) * 0.78, Math.sin(a) * 0.78, 0.85);
        g.add(pin);
      }
      const nut = cyl(0.11, 0.11, 0.1, 6, c.m('bronze'), 'z');
      nut.position.z = 0.92;
      g.add(nut);
    },
  });

  /* 正/倒车油腔（可视化油液） */
  refs.oilA = reg.add({
    id: 'cpp-oil-ahead', label: '正车油腔（Ahead）', layer: 'prop', sub: 'CPP 液压',
    pos: [0, Y, Z], dir: [0, 1.55, 1.2], dist: 3.2, tags: ['cpp-only'],
    details: ['正车工作油腔', '进油道', '密封环', '压力传感器'],
    build: (g, c) => {
      const t = torus(0.42, 0.12, c.m('oilGlow'), Math.PI * 2, 32, 12);
      t.position.z = -0.28;
      g.add(t);
      const plate = ringFlat(0.2, 0.62, c.m('oilGlow'));
      plate.position.z = -0.4;
      plate.rotation.x = 0;
      g.add(plate);
    },
  });

  refs.oilB = reg.add({
    id: 'cpp-oil-astern', label: '倒车油腔（Astern）', layer: 'prop', sub: 'CPP 液压',
    pos: [0, Y, Z], dir: [0, 1.55, -1.4], dist: 3.2, tags: ['cpp-only'],
    details: ['倒车工作油腔', '回油道', '密封环', '压力传感器'],
    build: (g, c) => {
      const t = torus(0.42, 0.12, c.m('waterGlow'), Math.PI * 2, 32, 12);
      t.position.z = 0.18;
      g.add(t);
      const plate = ringFlat(0.2, 0.62, c.m('waterGlow'));
      plate.position.z = 0.3;
      plate.rotation.x = 0;
      g.add(plate);
    },
  });

  /* 双层输油管 */
  reg.add({
    id: 'cpp-oil-pipes', label: '双层输油管 / 油分配器', layer: 'prop', sub: 'CPP 液压', shell: true,
    pos: [0, Y, -12.2], dir: [0, 1.2, 1], dist: 4.4, tags: ['cpp-only'],
    details: ['内层高压油管', '外层回油管', '油分配器', '旋转接头', '密封圈'],
    build: (g, c) => {
      const outer = cyl(0.16, 0.16, 4.6, 24, c.m('stainless'), 'z');
      g.add(outer);
      const inner = cyl(0.085, 0.085, 4.9, 18, c.m('chrome'), 'z');
      g.add(inner);
      const box = cyl(0.34, 0.34, 0.55, 28, c.m('castIron'), 'z');
      box.position.z = 2.1;
      g.add(box);
      for (const z of [1.85, 2.35]) {
        const fl = cyl(0.42, 0.42, 0.06, 28, c.m('steelDark'), 'z');
        fl.position.z = z;
        g.add(fl);
      }
      const fl2 = cyl(0.2, 0.2, 0.12, 20, c.m('bronze'), 'z');
      fl2.position.z = -2.3;
      g.add(fl2);
    },
  });

  reg.add({
    id: 'cpp-pitch-sensor', label: '螺距反馈传感器 / 桨毂密封', layer: 'prop', sub: 'CPP 液压',
    pos: [0, Y + 1.1, Z + 0.9], dir: [0, 1.5, 0.8], dist: 3.4, tags: ['cpp-only'],
    details: ['螺距反馈环', '位移传感器', '桨毂端面密封', 'O 形圈', '接线盒'],
    build: (g, c) => {
      const ring = torus(0.3, 0.045, c.m('machinedSteel'), Math.PI * 2, 28, 8);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      const sens = cyl(0.08, 0.08, 0.3, 14, c.m('emissiveCyan'), 'y');
      sens.position.set(0.32, 0.18, 0);
      g.add(sens);
      const seal = torus(0.42, 0.04, c.m('rubberSeal'), Math.PI * 2, 28, 8);
      seal.rotation.x = Math.PI / 2;
      seal.position.y = -0.1;
      g.add(seal);
    },
  });

  /* 整流罩 */
  reg.add({
    id: 'cpp-nose-cone', label: '桨毂整流罩 / 导流帽', layer: 'prop', sub: 'CPP 桨毂', shell: true,
    pos: [0, Y, Z - 1.42], dir: [0, 0.1, -1], dist: 5.0, tags: ['cpp-only'],
    details: ['玻璃钢导流帽', '紧固螺栓', '密封圈', '排水孔'],
    build: (g, c) => {
      // 细长导流锥，与桨毂同为铜合金色
      const cone = latheZ([
        [0.0, -0.86], [0.1, -0.8], [0.21, -0.62], [0.33, -0.4],
        [0.46, -0.18], [0.56, -0.02], [0.6, 0.06],
      ], c.m('copperMachined'), 40);
      g.add(cone);
      const ring = torus(0.62, 0.035, c.m('steelDark'), Math.PI * 2, 40, 8);
      ring.position.z = 0.02;
      g.add(ring);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const b = hexBolt(0.04, 0.05, c.m('steelDark'));
        b.rotation.x = Math.PI / 2;
        b.position.set(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.06);
        g.add(b);
      }
    },
  });

  /* ================= 定距桨替代构型 ================= */
  for (let i = 0; i < 4; i++) {
    const a = AZ[i] + 0.1;
    const p = reg.add({
      id: `fpp-blade-${i + 1}`, label: `定距桨桨叶 ${i + 1} / 锥孔键槽`, layer: 'prop', sub: 'FPP 桨叶',
      pos: [0, Y, Z], dir: [Math.sin(a), Math.cos(a), 0], dist: 4.4, tags: ['fpp-only'], rotOrder: 'ZYX',
      details: ['定距桨叶（镍铝青铜）', '锥孔', '键槽', '压盖螺母', '叶根圆角'],
      build: (g, c) => {
        const geo = bladeGeometry({ pitch: 4.6, skew: 0.28, chordRoot: 1.55, chordTip: 0.9 });
        g.add(mesh(geo, c.m('copperAlloy')));
        const root = cyl(0.46, 0.5, 0.42, 30, c.m('copperMachined'), 'y');
        root.position.y = 0.9;
        g.add(root);
        const nut = cyl(0.26, 0.26, 0.16, 6, c.m('bronze'), 'y');
        nut.position.y = 1.12;
        g.add(nut);
      },
    });
    refs.fppBlades.push(p);
  }

  refs.duct = reg.add({
    id: 'fpp-duct', label: '导管（Kort Nozzle）/ 导管支撑', layer: 'prop', sub: '导管', shell: true,
    pos: [0, Y, Z], dir: [0, 0.4, -1], dist: 10.0, tags: ['fpp-only'],
    details: ['导管内壳', '导管外壳', '导叶（定子）', '支撑臂', '防腐涂层', '排水孔'],
    build: (g, c) => {
      const prof = [
        [3.72, -1.15], [3.80, -0.7], [3.86, 0], [3.80, 0.7], [3.68, 1.15],
        [4.10, 1.15], [4.16, 0.6], [4.18, 0], [4.14, -0.6], [4.05, -1.15],
      ].map(([r, z]) => new THREE.Vector2(r, z));
      const duct = mesh(new THREE.LatheGeometry(prof, 64), c.m('hullWet'));
      duct.rotation.x = Math.PI / 2;
      g.add(duct);
      // 支撑臂（定子导叶）必须与桨叶留出轴向间隙：桨叶侧斜 + 拱度使桨叶
      // 轴向包络约 ±0.35 m，定子放在 z=0.95 之后才有净距（早先放 0.4 直接插进桨叶）。
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const strut = box(0.16, 1.9, 0.14, c.m('steelDark'));
        strut.position.set(Math.cos(a) * 3.1, Math.sin(a) * 3.1, 0.95);
        strut.rotation.z = a;
        strut.rotation.x = 0.2;
        g.add(strut);
      }
    },
  });

  return refs;
}
