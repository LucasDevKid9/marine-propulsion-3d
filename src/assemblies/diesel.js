import * as THREE from 'three';
import {
  box, cyl, rbox, plateWithHoles, torus, pipe, boltCircle, mesh, gear,
  latheZ, lathe, tubeShell, ringFlat, extrudePoly, impeller, bladeRing, sphere, hexBolt,
} from '../core/utils.js';

export const ENGINE = {
  crankY: 2.15,
  R: 0.85,
  ROD: 1.6,
  pistonOffset: 0.95,
  zs: [0, 1.55, 3.1, 4.65, 6.2, 7.75],
  bedZ: 3.05,
  bedLen: 10.9,
};

const PHASE = ENGINE.zs.map((_, i) => (i * Math.PI) / 3);

/** 活塞 / 十字头位移：返回 {crossY, pinX, pinY, rodAngle} */
export function crankKinematics(theta, i) {
  const th = theta + PHASE[i];
  const xPin = -ENGINE.R * Math.sin(th);
  const yPin = ENGINE.crankY + ENGINE.R * Math.cos(th);
  const s = Math.max(-0.999, Math.min(0.999, xPin / ENGINE.ROD));
  const crossY = yPin + ENGINE.ROD * Math.cos(Math.asin(s));
  return {
    crossY, xPin, yPin,
    rodAngle: Math.asin(s),
  };
}

export function buildDiesel(reg) {
  const refs = {
    pistons: [], rods: [], crossheads: [], valves: [], rockers: [],
    pumps: [], injectors: [], rotators: [], racks: [], plungers: [], needles: [], combustion: [],
    crank: null, cam: null, flywheel: null, turboRotor: null, turning: null,
  };
  const { crankY, zs } = ENGINE;

  /* ============================ 机座 ============================ */
  reg.add({
    id: 'diesel-bedplate', label: '铸铁机座（焊接结构床身）', layer: 'engine', sub: '机座', shell: false,
    pos: [0, 0.7, ENGINE.bedZ], dir: [0, -1, 0], dist: 2.2,
    details: ['纵向主梁', '横向隔板', '主轴承座', '油底壳', '机脚螺栓', '曲轴箱道门'],
    tags: ['diesel-only'],
    build: (g, c) => {
      const body = box(4.9, 1.1, ENGINE.bedLen, c.m('castIron'));
      g.add(body);
      const top = box(5.2, 0.14, ENGINE.bedLen, c.m('castIron'));
      top.position.y = 0.55;
      g.add(top);
      for (const x of [-2.4, 2.4]) {
        const rail = box(0.22, 0.34, ENGINE.bedLen, c.m('castIronDark'));
        rail.position.set(x, 0.68, 0);
        g.add(rail);
      }
      // 横向隔板
      for (let z = -4.9; z <= 4.9; z += 1.55) {
        const rib = box(4.7, 1.0, 0.14, c.m('castIronDark'));
        rib.position.set(0, 0, z);
        g.add(rib);
      }
      // 油底壳
      const sump = box(3.9, 0.32, 9.4, c.m('castIronDark'));
      sump.position.set(0, -0.62, 0);
      g.add(sump);
      const drain = cyl(0.13, 0.16, 0.35, 14, c.m('brass'), 'y');
      drain.position.set(0, -0.85, 3.6);
      g.add(drain);
      // 机脚
      for (const x of [-2.55, 2.55]) {
        for (const z of [-4.6, -1.5, 1.55, 4.65]) {
          const foot = box(0.6, 0.16, 0.72, c.m('castIron'));
          foot.position.set(x, -0.5, z);
          g.add(foot);
        }
      }
    },
  });

  /* 曲轴箱道门 */
  reg.add({
    id: 'diesel-doors', label: '曲轴箱道门 / 检查盖', layer: 'engine', sub: '机座', shell: true,
    pos: [0, 0, 0], dir: [1, 0.15, 0], dist: 4.2, tags: ['diesel-only'],
    details: ['铰链式道门', '密封垫', '快速锁紧螺母', '观察窗'],
    build: (g, c) => {
      for (const z of [-2.3, 0.4, 3.1, 5.8]) {
        const door = plateWithHoles(1.2, 0.9, 0.06, [], c.m('epoxyGrey'), 0.16);
        door.rotation.y = Math.PI / 2;
        door.position.set(2.46, 0.72, z);
        g.add(door);
        const frame = plateWithHoles(1.34, 1.04, 0.07, [{ x: 0, y: 0, r: 0.34 }], c.m('castIronDark'), 0.12);
        frame.rotation.y = Math.PI / 2;
        frame.position.set(2.48, 0.72, z);
        g.add(frame);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const b = hexBolt(0.035, 0.05, c.m('steelDark'));
          b.rotation.z = Math.PI / 2;
          b.position.set(2.53, 0.72 + Math.sin(a) * 0.5, z + Math.cos(a) * 0.62);
          g.add(b);
        }
      }
    },
  });

  /* 防爆门 */
  reg.add({
    id: 'diesel-explosion-doors', label: '曲轴箱防爆门', layer: 'engine', sub: '机座', shell: true,
    pos: [0, 0, 0], dir: [-1, 0.3, 0], dist: 4.0, tags: ['diesel-only'],
    details: ['防爆膜片', '铰链', '限位弹簧', '泄压方向指示'],
    build: (g, c) => {
      for (let i = 0; i < 6; i++) {
        const z = zs[i];
        const flange = cyl(0.26, 0.26, 0.08, 24, c.m('castIronDark'), 'x');
        flange.position.set(-2.48, 1.6, z);
        g.add(flange);
        const cap = cyl(0.22, 0.24, 0.09, 24, c.m('paintedYellow'), 'x');
        cap.position.set(-2.54, 1.6, z);
        g.add(cap);
        const grill = box(0.02, 0.3, 0.3, c.m('steelDark'));
        grill.position.set(-2.59, 1.6, z);
        g.add(grill);
        for (let k = 0; k < 6; k++) {
          const b = hexBolt(0.028, 0.04, c.m('steelDark'));
          b.rotation.z = Math.PI / 2;
          b.position.set(-2.6, 1.6 + Math.sin((k / 6) * Math.PI * 2) * 0.2, z + Math.cos((k / 6) * Math.PI * 2) * 0.2);
          g.add(b);
        }
      }
    },
  });

  /* ============================ A 字架 ============================ */
  reg.add({
    id: 'diesel-column', label: 'A 字架 / 机架', layer: 'engine', sub: '机座', shell: true,
    pos: [0, 0, 0], dir: [1, 0.4, 0], dist: 5.0, tags: ['diesel-only'],
    details: ['A 形机架板', '减重孔', '贯穿螺栓孔', '中间隔板', '曲轴箱通风口'],
    build: (g, c) => {
      for (let i = 0; i < 7; i++) {
        const z = -1.45 + i * 1.55;
        const wall = plateWithHoles(4.3, 2.45, 0.12, [
          { x: 0, y: 0.15, r: 0.72 }, { x: -1.55, y: -0.55, r: 0.28 }, { x: 1.55, y: -0.55, r: 0.28 },
        ], c.m('castIron'), 0.18);
        wall.position.set(0, 2.45, z);
        g.add(wall);
      }
      for (const x of [-2.12, 2.12]) {
        const side = plateWithHoles(9.6, 2.4, 0.1, [], c.m('castIron'), 0.1);
        side.rotation.y = Math.PI / 2;
        side.position.set(x, 2.45, 3.05);
        g.add(side);
      }
      // 顶部围板
      for (const x of [-2.2, 2.2]) {
        const cap = box(0.28, 0.12, 9.8, c.m('castIronDark'));
        cap.position.set(x, 3.68, 3.05);
        g.add(cap);
      }
    },
  });

  /* 贯穿螺栓 */
  reg.add({
    id: 'diesel-tie-rods', label: '贯穿螺栓 / 液压拉伸螺母', layer: 'engine', sub: '气缸体',
    pos: [0, 0, 0], dir: [0.9, 0.9, 0], dist: 5.5, tags: ['diesel-only'],
    details: ['长贯穿螺栓', '液压拉伸器螺母', '垫圈', '防腐涂层'],
    build: (g, c) => {
      for (const z of zs) {
        for (const x of [-0.82, 0.82]) {
          for (const dz of [-0.62, 0.62]) {
            const rod = cyl(0.038, 0.038, 5.5, 10, c.m('forgedSteel'), 'y');
            rod.position.set(x, 3.65, z + dz);
            g.add(rod);
            const nut = cyl(0.085, 0.085, 0.14, 6, c.m('machinedSteel'), 'y');
            nut.position.set(x, 6.38, z + dz);
            g.add(nut);
            const nut2 = nut.clone(); nut2.position.y = 0.92; g.add(nut2);
          }
        }
      }
    },
  });

  /* ============================ 气缸体 ============================ */
  reg.add({
    id: 'diesel-cylinder-jacket', label: '气缸体 / 冷却水套', layer: 'engine', sub: '气缸体', shell: true,
    pos: [0, 0, 0], dir: [-0.8, 0.8, 0], dist: 5.2, tags: ['diesel-only'],
    details: ['气缸套安装孔', '冷却水腔', '扫气箱接口', '缸盖螺栓', '加强筋'],
    build: (g, c) => {
      for (const z of zs) {
        const jacket = tubeShell(0.66, 0.5, 2.3, c.m('castIron'), 'y', 36);
        jacket.position.set(0, 4.85, z);
        g.add(jacket);
        const flange = cyl(0.78, 0.72, 0.16, 36, c.m('castIronDark'), 'y');
        flange.position.set(0, 6.0, z);
        g.add(flange);
        const base = cyl(0.72, 0.66, 0.18, 36, c.m('castIronDark'), 'y');
        base.position.set(0, 3.74, z);
        g.add(base);
        // 缸盖螺栓
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + 0.2;
          const b = cyl(0.05, 0.05, 0.22, 10, c.m('machinedSteel'), 'y');
          b.position.set(Math.cos(a) * 0.63, 6.12, z + Math.sin(a) * 0.63);
          g.add(b);
        }
        // 加强筋
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          const rib = box(0.06, 2.1, 0.22, c.m('castIron'));
          rib.position.set(Math.cos(a) * 0.66, 4.85, z + Math.sin(a) * 0.66);
          rib.rotation.y = -a;
          g.add(rib);
        }
      }
    },
  });

  /* 气缸套（可剖切观察） */
  reg.add({
    id: 'diesel-liner', label: '气缸套 / 扫气口', layer: 'engine', sub: '气缸体', shell: true,
    pos: [0, 0, 0], dir: [0, 1, 0], dist: 5.6, tags: ['diesel-only'],
    details: ['离心铸造缸套', '扫气口（一圈）', '注油点', '冷却水侧', '镜面珩磨'],
    build: (g, c) => {
      for (const z of zs) {
        const liner = tubeShell(0.47, 0.31, 2.45, c.m('machinedSteel'), 'y', 40);
        liner.position.set(0, 4.78, z);
        g.add(liner);
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          const port = box(0.1, 0.26, 0.1, c.m('castIronDark'));
          port.position.set(Math.cos(a) * 0.4, 4.22, z + Math.sin(a) * 0.4);
          port.rotation.y = -a;
          g.add(port);
        }
        for (const y of [4.9, 5.4, 5.9]) {
          const lub = cyl(0.03, 0.03, 0.14, 8, c.m('brass'), 'x');
          lub.position.set(0.48, y, z + 0.18);
          g.add(lub);
        }
      }
    },
  });

  /* 扫气箱 */
  reg.add({
    id: 'diesel-scavenge', label: '扫气箱 / 扫气集管', layer: 'engine', sub: '扫气', shell: true,
    pos: [0, 0, 0], dir: [0, 1, 0.2], dist: 5.0, tags: ['diesel-only'],
    details: ['扫气箱', '止回阀片', '扫气支管', '泄放旋塞', '压力传感器'],
    build: (g, c) => {
      const rec = box(1.0, 1.0, 9.7, c.m('castIron'));
      rec.position.set(1.85, 3.45, 3.05);
      g.add(rec);
      for (const z of zs) {
        const branch = cyl(0.22, 0.22, 1.0, 18, c.m('castIron'), 'x');
        branch.position.set(0.95, 4.06, z);
        g.add(branch);
        const flange = cyl(0.28, 0.28, 0.06, 18, c.m('castIronDark'), 'x');
        flange.position.set(0.36, 4.1, z);
        g.add(flange);
      }
      const gauge = cyl(0.07, 0.07, 0.05, 16, c.m('emissiveCyan'), 'y');
      gauge.position.set(1.85, 4.0, 0.4);
      g.add(gauge);
      for (const z of [-1.0, 3.05, 7.0]) {
        const band = box(1.06, 1.06, 0.06, c.m('castIronDark'));
        band.position.set(1.85, 3.45, z);
        g.add(band);
      }
    },
  });

  /* ============================ 往复运动件 ============================ */
  for (let i = 0; i < 6; i++) {
    const z = zs[i];
    /* 活塞总成 */
    reg.add({
      id: `piston-${i + 1}`, label: `活塞总成 · 第 ${i + 1} 缸`, layer: 'engine', sub: '运动件',
      pos: [0, 5.55, z], dir: [-0.9, 0.55, 0], dist: 5.4, tags: ['diesel-only'],
      details: ['活塞头（耐热合金钢）', '活塞环 4 道', '活塞裙', '冷却腔', '活塞杆', '填料函'],
      build: (g, c) => {
        const crown = latheZ([
          [0, 0.29], [0.18, 0.29], [0.26, 0.24], [0.30, 0.14], [0.305, -0.1], [0.3, -0.28], [0, -0.3],
        ], c.m('forgedSteel'), 40);
        g.add(crown);
        // 燃烧室凹坑
        const bowl = latheZ([[0, 0.22], [0.1, 0.2], [0.15, 0.12], [0.15, 0.29]], c.m('steelDark'), 28);
        bowl.position.y = 0.0;
        g.add(bowl);
        for (let r = 0; r < 4; r++) {
          const ring = torus(0.303, 0.018, c.m('steelDark'), Math.PI * 2, 40, 6);
          ring.rotation.x = Math.PI / 2;
          ring.position.y = 0.2 - r * 0.075;
          g.add(ring);
        }
        const skirt = cyl(0.29, 0.27, 0.2, 32, c.m('castIron'));
        skirt.position.y = -0.36;
        g.add(skirt);
        const rod = cyl(0.085, 0.085, 0.95, 16, c.m('machinedSteel'), 'y');
        rod.position.y = -0.86;
        g.add(rod);
        const flange = cyl(0.17, 0.17, 0.06, 20, c.m('forgedSteel'), 'y');
        flange.position.y = -1.3;
        g.add(flange);
      },
    });
    refs.pistons.push(reg.get(`piston-${i + 1}`));

    /* 十字头 */
    reg.add({
      id: `crosshead-${i + 1}`, label: `十字头 · 滑块 · 销`, layer: 'engine', sub: '运动件',
      pos: [0, 4.6, z], dir: [-1, 0.1, 0], dist: 5.2, tags: ['diesel-only'],
      details: ['十字头本体', '十字头销', '上/下滑块（白合金）', '销端盖', '油孔'],
      build: (g, c) => {
        const body = rbox(0.52, 0.46, 0.4, 0.05, c.m('castIron'));
        g.add(body);
        const pin = cyl(0.15, 0.15, 0.72, 24, c.m('machinedSteel'), 'x');
        g.add(pin);
        for (const x of [-0.32, 0.32]) {
          const slipper = box(0.12, 0.62, 0.52, c.m('whiteMetal'));
          slipper.position.set(x, 0, 0);
          g.add(slipper);
          const shoe = box(0.05, 0.7, 0.6, c.m('steelDark'));
          shoe.position.set(x * 1.02, 0, 0);
          g.add(shoe);
        }
        const cap = cyl(0.09, 0.09, 0.06, 16, c.m('forgedSteel'), 'x');
        cap.position.x = 0.38;
        g.add(cap);
      },
    });
    refs.crossheads.push(reg.get(`crosshead-${i + 1}`));

    /* 导板 */
    reg.add({
      id: `guide-${i + 1}`, label: `十字头导板 · 第 ${i + 1} 缸`, layer: 'engine', sub: '运动件', shell: true,
      pos: [0, 0, z], dir: [-1, 0.2, 0], dist: 4.6, tags: ['diesel-only'],
      details: ['导板（铸铁）', '调整垫片', '润滑油槽', '紧固螺栓'],
      build: (g, c) => {
        for (const x of [-0.42, 0.42]) {
          const gp = box(0.08, 1.9, 0.64, c.m('castIron'));
          gp.position.set(x, 3.75, 0);
          g.add(gp);
          const oil = box(0.02, 1.6, 0.05, c.m('brass'));
          oil.position.set(x * 1.06, 3.75, 0.24);
          g.add(oil);
          for (let k = 0; k < 4; k++) {
            const b = hexBolt(0.035, 0.05, c.m('steelDark'));
            b.rotation.z = Math.PI / 2;
            b.position.set(x * 1.1, 3.0 + k * 0.5, 0.26);
            g.add(b);
          }
        }
      },
    });

    /* 连杆 */
    reg.add({
      id: `conrod-${i + 1}`, label: `剖分式连杆 · 第 ${i + 1} 缸`, layer: 'engine', sub: '运动件',
      pos: [0, 3.7, z], dir: [-0.9, 0, 0], dist: 5.0, tags: ['diesel-only'],
      details: ['连杆杆身', '大头瓦', '小头瓦', '连杆螺栓', '大头端盖', '甩油孔'],
      build: (g, c) => {
        const shank = box(0.2, 1.42, 0.18, c.m('forgedSteel'));
        g.add(shank);
        const big = cyl(0.34, 0.34, 0.4, 26, c.m('forgedSteel'), 'z');
        big.position.y = -0.8;
        g.add(big);
        const bigBore = cyl(0.24, 0.24, 0.42, 26, c.m('whiteMetal'), 'z');
        bigBore.position.y = -0.8;
        g.add(bigBore);
        const cap = box(0.56, 0.22, 0.4, c.m('forgedSteel'));
        cap.position.y = -1.08;
        g.add(cap);
        const small = cyl(0.19, 0.19, 0.32, 22, c.m('forgedSteel'), 'z');
        small.position.y = 0.8;
        g.add(small);
        const bush = cyl(0.145, 0.145, 0.34, 22, c.m('bronze'), 'z');
        bush.position.y = 0.8;
        g.add(bush);
        for (const x of [-0.2, 0.2]) {
          const bolt = cyl(0.045, 0.045, 0.55, 10, c.m('machinedSteel'), 'y');
          bolt.position.set(x, -1.0, 0);
          g.add(bolt);
          const nut = cyl(0.08, 0.08, 0.09, 6, c.m('machinedSteel'), 'y');
          nut.position.set(x, -0.72, 0);
          g.add(nut);
        }
      },
    });
    refs.rods.push(reg.get(`conrod-${i + 1}`));

    /* 排气阀 */
    reg.add({
      id: `exvalve-${i + 1}`, label: `排气阀 · 阀盘 / 阀杆`, layer: 'engine', sub: '配气机构',
      pos: [0, 6.75, z], dir: [0, 1, 0], dist: 6.4, tags: ['diesel-only'],
      details: ['阀盘（耐热钢）', '阀杆', '阀座锥面', '空气弹簧', '旋阀器', '水冷阀座'],
      build: (g, c) => {
        const disc = latheZ([[0, -0.2], [0.2, -0.2], [0.27, -0.12], [0.28, -0.02], [0.1, 0.04], [0, 0.04]], c.m('forgedSteel'), 32);
        disc.position.y = -0.55;
        g.add(disc);
        const stem = cyl(0.05, 0.05, 1.5, 14, c.m('machinedSteel'), 'y');
        stem.position.y = 0.25;
        g.add(stem);
        const top = cyl(0.1, 0.1, 0.1, 14, c.m('machinedSteel'), 'y');
        top.position.y = 0.98;
        g.add(top);
        const guide = cyl(0.11, 0.11, 0.3, 16, c.m('bronze'), 'y');
        guide.position.y = 0.55;
        g.add(guide);
      },
    });
    refs.valves.push(reg.get(`exvalve-${i + 1}`));

    /* 空气弹簧 */
    reg.add({
      id: `airspring-${i + 1}`, label: `排气阀空气弹簧`, layer: 'engine', sub: '配气机构', shell: true,
      pos: [0, 7.95, z], dir: [0, 1, 0.6], dist: 6.8, tags: ['diesel-only'],
      details: ['气缸体', '活塞', '密封圈', '空气管路', '压力表接头'],
      build: (g, c) => {
        const body = cyl(0.19, 0.19, 0.42, 22, c.m('epoxyGrey'), 'y');
        g.add(body);
        const cap = cyl(0.21, 0.19, 0.07, 22, c.m('castIronDark'), 'y');
        cap.position.y = 0.24;
        g.add(cap);
        const hose = pipe([[0.14, 0.24, 0], [0.34, 0.3, 0], [0.4, 0.12, 0.1], [0.4, -0.4, 0.2]], 0.025, c.m('cable'), 20, 6);
        g.add(hose);
      },
    });

    /* 旋阀器 */
    reg.add({
      id: `rotator-${i + 1}`, label: `旋阀器 / 阀杆密封`, layer: 'engine', sub: '配气机构',
      pos: [0, 7.28, z], dir: [0.5, 1, 0], dist: 6.2, tags: ['diesel-only'],
      details: ['旋阀器本体', '棘轮机构', '回位弹簧', '密封圈'],
      build: (g, c) => {
        const body = cyl(0.14, 0.14, 0.16, 20, c.m('brass'), 'y');
        g.add(body);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const vane = box(0.05, 0.04, 0.06, c.m('machinedSteel'));
          vane.position.set(Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15);
          g.add(vane);
        }
        const seal = torus(0.1, 0.022, c.m('rubberSeal'), Math.PI * 2, 20, 8);
        seal.rotation.x = Math.PI / 2;
        seal.position.y = -0.09;
        g.add(seal);
      },
    });
    refs.rotators.push(reg.get(`rotator-${i + 1}`));

    /* 气缸盖 */
    reg.add({
      id: `cover-${i + 1}`, label: `气缸盖 / 阀座水冷腔`, layer: 'engine', sub: '配气机构', shell: true,
      pos: [0, 6.32, z], dir: [0, 1, -0.3], dist: 5.8, tags: ['diesel-only'],
      details: ['气缸盖铸件', '阀座水冷腔', '排气通道', '启动阀孔', '示功阀孔', '冷却水接头'],
      build: (g, c) => {
        // 缸盖是坐在缸套顶面的回转体，轴线必须沿 y（与缸套同轴）。
        // 早先误用 latheZ 把轴线放平到 z，缸盖变成一块竖立圆盘，
        // 顶面的示功阀 / 螺栓圈全部悬在盘外，排气支管也必然从盖体内部穿出。
        const body = lathe([[0, 0.3], [0.3, 0.3], [0.42, 0.26], [0.72, 0.24], [0.76, 0.1], [0.76, -0.24], [0, -0.26]], c.m('castIron'), 40);
        g.add(body);
        const water = torus(0.58, 0.06, c.m('pipeFW'), Math.PI * 2, 40, 8);
        water.rotation.x = Math.PI / 2;
        water.position.y = 0.0;
        g.add(water);
        const port = cyl(0.2, 0.2, 0.5, 20, c.m('castIronDark'), 'y');
        port.position.set(-0.28, 0.16, 0);
        g.add(port);
        // 启动阀 / 示功阀
        const sv = cyl(0.07, 0.07, 0.24, 12, c.m('brass'), 'y');
        sv.position.set(0.42, 0.36, 0.3);
        g.add(sv);
        const iv = cyl(0.05, 0.05, 0.2, 12, c.m('brass'), 'y');
        iv.position.set(0.42, 0.36, -0.3);
        g.add(iv);
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          const b = hexBolt(0.042, 0.07, c.m('machinedSteel'));
          b.position.set(Math.cos(a) * 0.62, 0.33, Math.sin(a) * 0.62);
          g.add(b);
        }
      },
    });
  }

  /* ============================ 曲轴 ============================ */
  refs.crank = reg.add({
    id: 'diesel-crankshaft', label: '锻钢曲轴 / 主轴颈 · 曲柄销 · 平衡重', layer: 'engine', sub: '曲轴',
    pos: [0, crankY, ENGINE.bedZ], dir: [0, 0.4, 0], dist: 5.0, tags: ['diesel-only'],
    details: ['主轴颈（7 道）', '曲柄销（6 个）', '曲柄臂', '平衡重', '油孔', '轴端法兰'],
    build: (g, c) => {
      // 主轴颈与曲柄臂
      for (let i = 0; i < 6; i++) {
        const th = PHASE[i];
        const pin = new THREE.Vector3(Math.sin(th) * ENGINE.R, Math.cos(th) * ENGINE.R, 0);
        // 曲柄臂（前后各一）
        for (const dz of [-0.3, 0.3]) {
          // 曲柄臂：梯形臂板 + 轮毂 + 平衡重
          const arm = new THREE.Group();
          const plate = extrudePoly([
            [-0.42, 0.1], [0.42, 0.1], [0.44, 0.9], [0.18, 1.02], [-0.18, 1.02], [-0.44, 0.9],
          ], 0.16, c.m('forgedSteel'));
          arm.add(plate);
          const hub = cyl(0.46, 0.46, 0.18, 28, c.m('forgedSteel'), 'z');
          arm.add(hub);
          const cw = extrudePoly([
            [-0.46, -0.1], [0.46, -0.1], [0.5, -0.55], [0.36, -0.78], [-0.36, -0.78], [-0.5, -0.55],
          ], 0.2, c.m('forgedSteel'));
          arm.add(cw);
          arm.position.set(0, 0, ENGINE.zs[i] - ENGINE.bedZ + dz);
          arm.rotation.z = -th;
          g.add(arm);
        }
        // 曲柄销
        const p = cyl(0.4, 0.4, 0.44, 28, c.m('machinedSteel'), 'z');
        p.position.set(Math.sin(th) * ENGINE.R, Math.cos(th) * ENGINE.R, ENGINE.zs[i] - ENGINE.bedZ);
        g.add(p);
        // 油孔
        const oil = cyl(0.05, 0.05, 0.46, 8, c.m('brass'), 'z');
        oil.position.set(Math.sin(th) * ENGINE.R, Math.cos(th) * ENGINE.R, ENGINE.zs[i] - ENGINE.bedZ);
        g.add(oil);
      }
      // 主轴颈
      for (let i = 0; i <= 6; i++) {
        const z = -1.45 + i * 1.55 - ENGINE.bedZ;
        const j = cyl(0.42, 0.42, 1.0, 28, c.m('machinedSteel'), 'z');
        j.position.z = z;
        g.add(j);
        const collar = cyl(0.5, 0.5, 0.1, 28, c.m('forgedSteel'), 'z');
        collar.position.z = z + 0.5;
        g.add(collar);
      }
      // 轴端法兰
      const fl = cyl(0.62, 0.62, 0.18, 32, c.m('machinedSteel'), 'z');
      fl.position.z = -1.45 - ENGINE.bedZ - 0.3;
      g.add(fl);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const b = hexBolt(0.055, 0.09, c.m('steelDark'));
        b.rotation.x = Math.PI / 2;
        b.position.set(Math.cos(a) * 0.5, Math.sin(a) * 0.5, -1.45 - ENGINE.bedZ - 0.4);
        g.add(b);
      }
    },
  });

  /* 主轴承盖 */
  reg.add({
    id: 'diesel-main-bearings', label: '主轴承盖 / 轴瓦', layer: 'engine', sub: '曲轴', shell: true,
    pos: [0, 0, 0], dir: [0, -0.6, 0], dist: 3.6, tags: ['diesel-only'],
    details: ['主轴承盖', '白合金轴瓦', '液压螺母', '定位销', '间隙测量点'],
    build: (g, c) => {
      for (let i = 0; i <= 6; i++) {
        const z = -1.45 + i * 1.55;
        const arch = new THREE.Group();
        const half = new THREE.Mesh(
          new THREE.CylinderGeometry(0.52, 0.52, 0.42, 28, 1, false, 0, Math.PI),
          c.m('castIron')
        );
        half.rotation.x = Math.PI / 2;
        half.rotation.z = Math.PI;
        half.position.set(0, crankY, z);
        g.add(half);
        const shellB = new THREE.Mesh(
          new THREE.CylinderGeometry(0.44, 0.44, 0.4, 28, 1, true, 0, Math.PI),
          c.m('whiteMetal')
        );
        shellB.rotation.x = Math.PI / 2;
        shellB.rotation.z = Math.PI;
        shellB.position.set(0, crankY, z);
        shellB.material.side = THREE.DoubleSide;
        g.add(shellB);
        for (const x of [-0.34, 0.34]) {
          const stud = cyl(0.055, 0.055, 0.5, 10, c.m('machinedSteel'), 'y');
          stud.position.set(x, crankY + 0.3, z);
          g.add(stud);
          const nut = cyl(0.1, 0.1, 0.1, 6, c.m('machinedSteel'), 'y');
          nut.position.set(x, crankY + 0.56, z);
          g.add(nut);
        }
      }
    },
  });

  /* 飞轮 */
  refs.flywheel = reg.add({
    id: 'diesel-flywheel', label: '飞轮 / 盘车齿圈', layer: 'engine', sub: '曲轴',
    pos: [0, crankY, -1.85], dir: [0, 0.1, -1], dist: 4.2, tags: ['diesel-only'],
    details: ['飞轮本体', '盘车齿圈', '飞轮螺栓', '平衡孔', '转速信号齿'],
    build: (g, c) => {
      const body = cyl(1.42, 1.42, 0.34, 64, c.m('castIron'), 'z');
      g.add(body);
      const rim = torus(1.4, 0.1, c.m('forgedSteel'), Math.PI * 2, 64, 10);
      rim.position.z = 0.1; // torus 默认位于 XY 平面、轴向 z，与飞轮盘面一致，不可再绕 x 旋转
      g.add(rim);
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const tooth = box(0.1, 0.12, 0.16, c.m('machinedSteel'));
        tooth.position.set(Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0);
        tooth.rotation.z = a;
        g.add(tooth);
      }
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const b = hexBolt(0.085, 0.1, c.m('steelDark'));
        b.rotation.x = Math.PI / 2;
        b.position.set(Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0.2);
        g.add(b);
      }
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.3;
        const hole = cyl(0.13, 0.13, 0.36, 18, c.m('steelDark'), 'z');
        hole.position.set(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0);
        g.add(hole);
      }
    },
  });

  /* 盘车机构 */
  refs.turning = reg.add({
    id: 'diesel-turning-gear', label: '盘车机构 / 电动盘车机', layer: 'engine', sub: '曲轴',
    pos: [1.95, 1.05, -1.9], dir: [1, -0.4, -0.3], dist: 3.4, tags: ['diesel-only'],
    details: ['盘车电机', '减速齿轮', '盘车小齿轮', '离合手柄', '限位开关'],
    build: (g, c) => {
      const motor = cyl(0.26, 0.26, 0.7, 24, c.m('epoxyGrey'), 'x');
      motor.position.set(0.45, 0, 0.2);
      g.add(motor);
      const gearbox = rbox(0.55, 0.55, 0.45, 0.05, c.m('castIron'));
      gearbox.position.set(0, 0, 0.2);
      g.add(gearbox);
      const pinion = gear(0.24, 0.12, 18, c.m('machinedSteel'), 0.07, 'z');
      pinion.position.set(-0.42, 0.32, 0);
      g.add(pinion);
      const handle = cyl(0.03, 0.03, 0.4, 8, c.m('paintedYellow'), 'y');
      handle.position.set(0.2, 0.36, 0.2);
      g.add(handle);
    },
  });

  /* ============================ 配气/燃油/凸轮 ============================ */
  refs.cam = reg.add({
    id: 'diesel-camshaft', label: '凸轮轴 / 排气凸轮 · 燃油凸轮', layer: 'engine', sub: '配气机构',
    pos: [-2.75, 3.05, ENGINE.bedZ], dir: [-1, 0.2, 0], dist: 5.0, tags: ['diesel-only'],
    details: ['凸轮轴', '排气凸轮（6）', '燃油凸轮（6）', '传动齿轮', '轴承座', '链轮'],
    build: (g, c) => {
      const shaft = cyl(0.1, 0.1, 9.6, 18, c.m('forgedSteel'), 'z');
      g.add(shaft);
      for (let i = 0; i < 6; i++) {
        const z = ENGINE.zs[i] - ENGINE.bedZ;
        for (const [dz, h, w] of [[-0.16, 0.28, 0.2], [0.16, 0.2, 0.16]]) {
          const cam = new THREE.Group();
          const base = cyl(h * 0.78, h * 0.78, w, 24, c.m('machinedSteel'), 'z');
          cam.add(base);
          const lobe = box(h * 1.1, h * 0.6, w * 0.96, c.m('machinedSteel'));
          lobe.position.y = h * 0.52;
          cam.add(lobe);
          cam.position.z = z + dz;
          g.add(cam);
        }
        const brg = cyl(0.17, 0.17, 0.14, 18, c.m('bronze'), 'z');
        brg.position.z = z - 0.48;
        g.add(brg);
      }
      const gearBig = gear(0.55, 0.16, 30, c.m('machinedSteel'), 0.1, 'z');
      gearBig.position.z = 9.35 - ENGINE.bedZ;
      g.add(gearBig);
    },
  });

  reg.add({
    id: 'diesel-cam-drive', label: '凸轮轴传动齿轮系', layer: 'engine', sub: '配气机构',
    pos: [0, 0, 0], dir: [-1, 0.4, 0.4], dist: 4.4, tags: ['diesel-only'],
    details: ['曲轴齿轮', '中间齿轮', '凸轮轴齿轮', '齿轮箱罩', '润滑油喷嘴'],
    build: (g, c) => {
      const g1 = gear(0.62, 0.18, 34, c.m('machinedSteel'), 0.12, 'z');
      g1.position.set(0, crankY, 9.55);
      g.add(g1);
      const g2 = gear(0.42, 0.18, 22, c.m('machinedSteel'), 0.1, 'z');
      g2.position.set(-1.55, 3.1, 9.55);
      g.add(g2);
      const hub = cyl(0.1, 0.1, 0.3, 14, c.m('steelDark'), 'z');
      hub.position.set(-1.55, 3.1, 9.55);
      g.add(hub);
      const cover = plateWithHoles(2.4, 2.2, 0.08, [], c.m('epoxyGrey'), 0.2);
      cover.position.set(-0.8, 2.6, 9.72);
      g.add(cover);
    },
  });

  /* 排气阀摇臂 + 顶杆 */
  for (let i = 0; i < 6; i++) {
    const z = zs[i];
    reg.add({
      id: `rocker-${i + 1}`, label: `排气阀摇臂 / 顶杆 / 滚轮`, layer: 'engine', sub: '配气机构',
      pos: [0, 0, z], dir: [-1, 1, 0], dist: 5.8, tags: ['diesel-only'],
      details: ['摇臂', '顶杆', '滚轮', '调整螺钉', '摇臂轴'],
      build: (g, c) => {
        const push = cyl(0.035, 0.035, 3.3, 10, c.m('machinedSteel'), 'y');
        push.position.set(-1.32, 4.9, 0);
        g.add(push);
        const roller = cyl(0.09, 0.09, 0.12, 14, c.m('machinedSteel'), 'z');
        roller.position.set(-1.32, 3.22, 0);
        g.add(roller);
        const arm = box(1.25, 0.09, 0.12, c.m('forgedSteel'));
        arm.position.set(-0.72, 6.55, 0);
        arm.rotation.z = 0.16;
        g.add(arm);
        const pivot = cyl(0.1, 0.1, 0.26, 16, c.m('bronze'), 'z');
        pivot.position.set(-1.28, 6.62, 0);
        g.add(pivot);
        const pad = cyl(0.09, 0.09, 0.06, 14, c.m('machinedSteel'), 'y');
        pad.position.set(-0.12, 6.42, 0);
        g.add(pad);
        const spring = torus(0.06, 0.015, c.m('steelDark'), Math.PI * 2, 12, 6);
        spring.rotation.x = Math.PI / 2;
        spring.position.set(-1.32, 6.3, 0);
        g.add(spring);
      },
    });
    refs.rockers.push(reg.get(`rocker-${i + 1}`));
  }

  /* 燃油喷射泵 */
  for (let i = 0; i < 6; i++) {
    const z = zs[i];
    reg.add({
      id: `fuelpump-${i + 1}`, label: `燃油喷射泵 · 柱塞偶件 · 齿条`, layer: 'engine', sub: '燃油系统', shell: true,
      pos: [-2.35, 4.55, z], dir: [-1, 0.5, 0], dist: 5.6, tags: ['diesel-only'],
      details: ['泵体', '柱塞偶件', '出油阀', '齿条（供油量调节）', '滚轮挺柱', '泄油管'],
      build: (g, c) => {
        const body = rbox(0.42, 0.62, 0.34, 0.05, c.m('castIron'));
        g.add(body);
        const barrel = cyl(0.09, 0.09, 0.5, 16, c.m('machinedSteel'), 'y');
        barrel.position.y = 0.58;
        g.add(barrel);
        const plunger = cyl(0.055, 0.055, 0.55, 12, c.m('chrome'), 'y');
        plunger.position.y = 0.62;
        plunger.userData.keep = true;
        g.add(plunger);
        refs.plungers.push(plunger);
        const valve = cyl(0.075, 0.075, 0.16, 14, c.m('machinedSteel'), 'y');
        valve.position.y = 0.9;
        g.add(valve);
        const rack = box(0.5, 0.05, 0.05, c.m('brass'));
        rack.position.set(0, 0.28, 0.19);
        rack.userData.keep = true;
        g.add(rack);
        refs.racks.push(rack);
        const roller = cyl(0.08, 0.08, 0.12, 14, c.m('machinedSteel'), 'z');
        roller.position.y = -0.36;
        g.add(roller);
        const pipeIn = cyl(0.035, 0.035, 0.32, 10, c.m('pipeFuel'), 'x');
        pipeIn.position.set(-0.3, 0.4, 0);
        g.add(pipeIn);
      },
    });
    refs.pumps.push(reg.get(`fuelpump-${i + 1}`));

    /* 喷油器 */
    reg.add({
      id: `injector-${i + 1}`, label: `喷油器 · 针阀偶件 · 冷却腔`, layer: 'engine', sub: '燃油系统', shell: true,
      pos: [0.2, 6.75, z], dir: [0.9, 1, 0], dist: 6.0, tags: ['diesel-only'],
      details: ['喷油器体', '针阀偶件', '冷却腔', '高压油管接头', '回油管', '雾化喷孔'],
      build: (g, c) => {
        const body = cyl(0.075, 0.075, 0.55, 16, c.m('forgedSteel'), 'y');
        body.position.y = 0.25;
        g.add(body);
        const nut = cyl(0.1, 0.1, 0.2, 6, c.m('machinedSteel'), 'y');
        nut.position.y = 0.0;
        g.add(nut);
        const needle = cyl(0.025, 0.012, 0.36, 10, c.m('chrome'), 'y');
        needle.position.y = -0.3;
        needle.userData.keep = true;
        g.add(needle);
        refs.needles.push(needle);
        const cool = torus(0.09, 0.022, c.m('pipeFW'), Math.PI * 2, 18, 8);
        cool.rotation.x = Math.PI / 2;
        cool.position.y = 0.05;
        g.add(cool);
        const hp = cyl(0.03, 0.03, 0.4, 8, c.m('pipeFuel'), 'x');
        hp.position.set(-0.2, 0.32, 0);
        g.add(hp);
      },
    });
    refs.injectors.push(reg.get(`injector-${i + 1}`));

    /* 缸内燃烧可视化 */
    reg.add({
      id: `combustion-${i + 1}`, label: `缸内燃烧 / 喷雾可视化`, layer: 'engine', sub: '工作循环',
      pos: [0, 6.0, z], dir: [0, 1, 0], dist: 6.6, tags: ['diesel-only'], merge: false,
      details: ['燃烧火焰核心', '燃油喷雾锥', '缸内压力波', '火焰传播'],
      build: (g, c) => {
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 14), c.m('flame'));
        flame.material.emissiveIntensity = 0;
        flame.material.opacity = 0;
        flame.userData.keep = true;
        g.add(flame);
        refs.combustion.push(flame);
        const spray = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 14, 1, true), c.m('flame'));
        spray.rotation.x = Math.PI;
        spray.position.y = 0.16;
        spray.material = flame.material;
        spray.userData.keep = true;
        g.add(spray);
      },
    });

    reg.add({
      id: `hp-pipe-${i + 1}`, label: `高压油管 · 第 ${i + 1} 缸`, layer: 'engine', sub: '燃油系统',
      pos: [0, 0, 0], dir: [0, 1, 0], dist: 5.4, tags: ['diesel-only'],
      details: ['双层高压油管', '法兰接头', '管夹', '泄漏报警'],
      build: (g, c) => {
        g.add(pipe([[-2.2, 4.95, z], [-1.9, 5.6, z], [-1.2, 6.4, z], [-0.6, 6.7, z], [0.05, 6.95, z], [0.2, 7.0, z]], 0.028, c.m('pipeFuel'), 40, 8));
        const clamp = box(0.1, 0.1, 0.26, c.m('steelDark'));
        clamp.position.set(-1.2, 6.42, z);
        g.add(clamp);
      },
    });
  }

  /* 排气集管 */
  reg.add({
    id: 'diesel-exhaust-manifold', label: '排气集管 / 波纹补偿器', layer: 'engine', sub: '排气', shell: true,
    pos: [0, 0, 0], dir: [1, 0.6, 0], dist: 5.2, tags: ['diesel-only'],
    details: ['排气集管', '波纹补偿器', '隔热层', '支座', '温度传感器'],
    build: (g, c) => {
      g.add(pipe([[0.35, 7.98, 0], [1.15, 8.12, 0], [1.95, 8.12, 1.3], [1.95, 8.12, 6.35], [2.35, 7.98, 7.0], [2.72, 7.72, 7.38]], 0.20, c.m('pipeExhaust'), 64, 16));
      for (const z of zs) {
        g.add(pipe([[0.1, 6.75, z], [0.72, 7.55, z], [1.5, 8.06, z]], 0.125, c.m('pipeExhaust'), 20, 12));
        const bellows = torus(0.17, 0.045, c.m('machinedSteel'), Math.PI * 2, 20, 8);
        bellows.rotation.z = Math.PI / 2;
        bellows.position.set(0.92, 7.78, z);
        g.add(bellows);
      }
    },
  });

  /* ============================ 涡轮增压器 ============================ */
  const TX = 2.85, TY = 7.55, TZ = 7.55;
  reg.add({
    id: 'turbo-casing', label: '废气涡轮增压器 · 涡壳 / 压气机壳', layer: 'engine', sub: '增压', shell: true,
    pos: [TX, TY, TZ], dir: [1, 0.9, 0.2], dist: 6.2, tags: ['diesel-only'],
    details: ['涡轮涡壳', '压气机蜗壳', '轴承壳体', '隔热罩', '进口消音器', '出口扩压器'],
    build: (g, c) => {
      const turbine = latheZ([
        [0.0, -1.0], [0.55, -1.0], [0.86, -0.8], [0.95, -0.45], [0.85, -0.1], [0.55, 0.05], [0.42, 0.0],
      ], c.m('castIron'), 40);
      turbine.position.z = 0.55;
      g.add(turbine);
      const comp = latheZ([
        [0.0, 0.9], [0.5, 0.9], [0.78, 0.72], [0.86, 0.42], [0.72, 0.1], [0.44, 0.05], [0.36, 0.12],
      ], c.m('castIron'), 40);
      comp.position.z = -0.55;
      g.add(comp);
      const bearing = cyl(0.36, 0.36, 1.0, 28, c.m('castIronDark'), 'z');
      g.add(bearing);
      // 进口喇叭
      const inlet = latheZ([[0.36, 0], [0.52, 0.1], [0.66, 0.3], [0.72, 0.42]], c.m('machinedSteel'), 32);
      inlet.position.z = -1.05;
      g.add(inlet);
      // 出口法兰
      const out = cyl(0.5, 0.5, 0.1, 28, c.m('castIronDark'), 'z');
      out.position.z = 0.95;
      g.add(out);
      const bc = boltCircle({ R: 0.42, n: 10, r: 0.045, h: 0.06, mat: c.m('steelDark'), axis: 'z' });
      [...bc.children].forEach((b) => { b.position.z = 1.0; g.add(b); });
      // 支架
      const leg = box(0.3, 1.15, 0.4, c.m('castIronDark'));
      leg.position.set(0, -0.95, 0);
      g.add(leg);
    },
  });

  refs.turboRotor = reg.add({
    id: 'turbo-rotor', label: '增压器转子 · 涡轮叶轮 / 压气机叶轮', layer: 'engine', sub: '增压',
    pos: [TX, TY, TZ], dir: [1, 1, 0.6], dist: 6.8, tags: ['diesel-only'],
    details: ['涡轮叶轮', '压气机叶轮', '转子轴', '浮动轴承', '密封环', '锁紧螺母'],
    build: (g, c) => {
      const shaft = cyl(0.075, 0.075, 2.2, 14, c.m('machinedSteel'), 'z');
      g.add(shaft);
      const tw = impeller(0.42, 0.12, 14, c.m('chrome'), 0.16);
      tw.position.z = 0.55;
      tw.scale.z = 1.4;
      g.add(tw);
      const cw = impeller(0.34, 0.1, 16, c.m('machinedSteel'), 0.13);
      cw.position.z = -0.55;
      cw.rotation.y = Math.PI;
      cw.scale.z = 1.5;
      g.add(cw);
      const nut = cyl(0.09, 0.09, 0.1, 6, c.m('brass'), 'z');
      nut.position.z = -0.95;
      g.add(nut);
      // 轴承
      for (const z of [-0.22, 0.22]) {
        const b = cyl(0.12, 0.12, 0.12, 16, c.m('bronze'), 'z');
        b.position.z = z;
        g.add(b);
      }
    },
  });

  reg.add({
    id: 'turbo-aircooler', label: '空冷器 / 辅助鼓风机', layer: 'engine', sub: '增压', shell: true,
    pos: [TX - 0.55, 6.5, 8.75], dir: [1, 0.4, 0.8], dist: 5.6, tags: ['diesel-only'],
    details: ['空冷器壳体', '冷却水管束', '翅片', '凝水泄放', '辅助鼓风机', '进出口法兰'],
    build: (g, c) => {
      const body = rbox(1.4, 0.95, 1.0, 0.08, c.m('epoxyGrey'));
      g.add(body);
      for (let i = 0; i < 8; i++) {
        const t = cyl(0.03, 0.03, 0.95, 8, c.m('copperMachined'), 'y');
        t.position.set(-0.55 + i * 0.16, 0, 0);
        g.add(t);
      }
      const duct = cyl(0.3, 0.3, 0.9, 22, c.m('epoxyGrey'), 'x');
      duct.position.set(1.05, 0.1, 0.2);
      g.add(duct);
      const blower = cyl(0.36, 0.3, 0.55, 24, c.m('epoxyGrey'), 'z');
      blower.position.set(0.2, -0.9, 0.6);
      g.add(blower);
      const motor = cyl(0.16, 0.16, 0.3, 18, c.m('epoxyGrey'), 'z');
      motor.position.set(0.2, -0.9, 1.0);
      g.add(motor);
    },
  });

  /* 调速器 / 转向机构 */
  reg.add({
    id: 'diesel-governor', label: '调速器 / 燃油齿条执行机构', layer: 'engine', sub: '燃油系统', shell: true,
    pos: [-2.6, 5.4, 9.0], dir: [-1, 0.4, 0.4], dist: 4.2, tags: ['diesel-only'],
    details: ['液压调速器', '伺服马达', '反馈连杆', '停车电磁阀', '转速设定'],
    build: (g, c) => {
      const body = rbox(0.7, 0.8, 0.55, 0.06, c.m('epoxyGrey'));
      g.add(body);
      const cap = cyl(0.22, 0.22, 0.16, 20, c.m('brass'), 'y');
      cap.position.y = 0.46;
      g.add(cap);
      const link = box(0.06, 0.06, 1.9, c.m('chrome'));
      link.position.set(0.1, -0.2, -0.9);
      g.add(link);
      const actuator = cyl(0.1, 0.1, 0.42, 16, c.m('machinedSteel'), 'z');
      actuator.position.set(0.2, -0.4, 0.4);
      g.add(actuator);
      const light = cyl(0.04, 0.04, 0.04, 8, c.m('emissiveGreen'), 'y');
      light.position.set(0.25, 0.3, 0.3);
      g.add(light);
    },
  });

  /* 曲轴箱呼吸器 / 滑油滤器 */
  reg.add({
    id: 'diesel-breather', label: '曲轴箱呼吸器 / 滑油滤器', layer: 'engine', sub: '辅助', shell: true,
    pos: [-1.9, 1.15, 8.6], dir: [-1, -0.2, 0.5], dist: 3.8, tags: ['diesel-only'],
    details: ['呼吸器筒体', '油气分离滤芯', '滑油滤器', '差压报警'],
    build: (g, c) => {
      const b = cyl(0.2, 0.2, 0.8, 20, c.m('paintedWhite'), 'y');
      g.add(b);
      const f = cyl(0.22, 0.22, 0.9, 20, c.m('epoxyGrey'), 'y');
      f.position.set(-0.65, 0, 0);
      g.add(f);
      for (const y of [-0.3, 0.3]) {
        const r = torus(0.22, 0.03, c.m('steelDark'), Math.PI * 2, 20, 6);
        r.rotation.x = Math.PI / 2;
        r.position.set(-0.65, y, 0);
        g.add(r);
      }
      g.add(pipe([[-0.65, 0.45, 0], [-0.65, 0.9, 0], [-0.2, 1.1, 0], [0, 1.2, 0]], 0.04, c.m('pipeLO'), 20));
    },
  });

  return { refs };
}
