/**
 * audit.js — 场景几何审计器（geometric linter）
 *
 * 为什么要有它：视觉截图的分辨率不足以判定 0.3 m 的间隙或 5 cm 的穿入，
 * 「看起来对」与「算得对」是两件事。审计器把工程合理性转成可断言的几何量：
 *
 *  1. 干涉   两个构件是否部分相交（穿模）。包含关系视为正常（壳体包转子）。
 *  2. 走管   管系顶点是否深入其他设备实体内部（穿设备，而非穿过舱壁板）。
 *  3. 传动链 传动链中心线是否连续（有没有悬空段），节点图是否单链无支路。
 *  4. 支承   长跨旋转件附近是否有轴承/支座。
 *
 * 只在「静止装配态、指定构型」下审计，避免实时运动与爆炸位移污染结果。
 */
import * as THREE from 'three';
import { NODES, SEGMENTS, NODE_IDS, node, checkChain } from './driveline.js';
import { allowReason } from './audit-allow.js';
import { partVisible } from './registry.js';

// 注意：不能用 line 直接匹配，否则 diesel-liner（缸套）会被当成管线
const PIPE_RE = /(pipe|conduit|manifold|duct|hose|tray)/i;
const PIPE_ID = (id) => PIPE_RE.test(id) || /-line$/.test(id) || /lube/.test(id);
const STRUCT_RE = /^env-/;
// 骨架/格栅类构件（平台、隔声罩、行车、桥架）是镂空结构，包围盒不能代表实体
const LATTICE_RE = /(platform|enclosure|crane|rail|tray|rack|guard|cage|frame|ladder|stair)/i;
const SHRINK = 0.02; // 面接触容差：两侧各缩 2 cm
const PENETRATE = 0.18; // 管线「穿设备」判定：顶点深入实体 18 cm 以上
const CHAIN_TOL = 0.12; // 传动链中心线空洞判定容差
const SPRAWL_VOL = 60; // 体积超过此值的构件（通风筒/行车/船体）AABB 无意义，不参与干涉比对

const _v = new THREE.Vector3();

function restBox(part) {
  // 用当前已应用的位姿取包围盒：部分构件（如 CPP 桨叶）的静止姿态本身就带旋转，
  // 若强行清零会把四片桨叶折叠到同一方位，产生假干涉。
  part.group.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(part.group, true);
}

function depthInside(box, p) {
  // 点到盒体六面的最小内距（在盒内为正）
  return Math.min(p.x - box.min.x, box.max.x - p.x, p.y - box.min.y, box.max.y - p.y, p.z - box.min.z, box.max.z - p.z);
}

/** 交集体积占较小盒体的比例 */
function insideRatio(iv, a, b) {
  const s = iv.getSize(new THREE.Vector3());
  const vIv = s.x * s.y * s.z;
  const va = (a.max.x - a.min.x) * (a.max.y - a.min.y) * (a.max.z - a.min.z);
  const vb = (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z);
  return vIv / Math.min(va, vb);
}

/** 小盒在几个轴向上被大盒完全包住（容差 5 cm） */
function enclosedAxes(small, big) {
  let n = 0;
  for (const ax of ['x', 'y', 'z']) {
    if (small.min[ax] >= big.min[ax] - 0.05 && small.max[ax] <= big.max[ax] + 0.05) n++;
  }
  return n;
}

function worldVerts(part, stride = 1) {
  const out = [];
  part.group.updateMatrixWorld(true);
  part.group.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    if (!pos) return;
    for (let i = 0; i < pos.count; i += stride) {
      out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
    }
  });
  return out;
}

/**
 * @param {PartRegistry} reg
 * @param {{config:'diesel'|'gas', propulsor:'cpp'|'fpp', minVol?:number, minRatio?:number}} opts
 */
export function auditScene(reg, opts = {}) {
  /** 管壁顶点落入对方实体的最大深度（用于 AABB 假阳性的顶点级复核） */
  const pipePenetration = (pipePart, solids) => {
    let worst = 0;
    for (const v of worldVerts(pipePart, 3)) {
      for (const b of solids) {
        if (!b.containsPoint(v)) continue;
        worst = Math.max(worst, depthInside(b, v));
        if (worst >= PENETRATE) return worst;
      }
    }
    return worst;
  };  const config = opts.config || 'diesel';
  const propulsor = opts.propulsor || 'cpp';
  const minVol = opts.minVol ?? 0.006;
  const minRatio = opts.minRatio ?? 0.04;

  const state = { config, propulsor, isolateId: null };
  const visible = reg.parts.filter((p) => partVisible(p, state));

  const boxes = new Map();
  const sprawling = [];
  for (const p of visible) {
    const b = restBox(p);
    boxes.set(p.id, b);
    const s = b.getSize(new THREE.Vector3());
    if (s.x * s.y * s.z > SPRAWL_VOL) sprawling.push(p.id);
  }

  /* ---------- 1. 干涉 ----------
     下沉到「子网格 × 子网格」：合并件（整段管系、框架、拉杆）的整件包围盒会把
     整台机器套住，整件级判定必然误报。
     子网格盒优先取构件构建时留档的 solidBoxes（构件局部坐标，随 matrixWorld 变换），
     这样渲染合批粒度可以随便放大，审计精度不受影响；
     未留档（merge:false 的构件）时退回遍历真实网格。 */
  const solidBoxes = new Map();
  const solidsOf = (p) => {
    if (solidBoxes.has(p.id)) return solidBoxes.get(p.id);
    const arr = [];
    p.group.updateMatrixWorld(true);
    const archived = p.group.userData?.solidBoxes;
    const raw = archived && archived.length
      ? archived.map((b) => b.clone().applyMatrix4(p.group.matrixWorld))
      : (() => {
        const out = [];
        p.group.traverse((o) => { if (o.isMesh) out.push(new THREE.Box3().setFromObject(o, true)); });
        return out;
      })();
    for (const b of raw) {
      if (b.isEmpty()) continue;
      const sz = b.getSize(new THREE.Vector3());
      if (Math.min(sz.x, sz.y, sz.z) < 0.25) continue;
      if (sz.x * sz.y * sz.z < 0.01) continue;
      arr.push(b.clone().expandByScalar(-SHRINK));
    }
    solidBoxes.set(p.id, arr);
    return arr;
  };

  const interference = [];
  const contained = [];
  const allowed = [];
  for (let i = 0; i < visible.length; i++) {
    const A = visible[i];
    if (sprawling.includes(A.id)) continue;
    const sa = solidsOf(A);
    if (!sa.length) continue;
    for (let j = i + 1; j < visible.length; j++) {
      const B = visible[j];
      if (sprawling.includes(B.id)) continue;
      if (!boxes.get(A.id).intersectsBox(boxes.get(B.id))) continue; // 整件级快速剔除
      const sb = solidsOf(B);
      if (!sb.length) continue;
      let best = null;
      for (const ba of sa) {
        for (const bb of sb) {
          if (!ba.intersectsBox(bb)) continue;
          const iv = ba.clone().intersect(bb);
          const sz = iv.getSize(new THREE.Vector3());
          const vol = sz.x * sz.y * sz.z;
          if (!best || vol > best.vol) best = { vol, sz: sz.clone(), iv: iv.clone(), ba, bb };
        }
      }
      if (!best || best.vol < minVol) continue;

      /**
       * 管类构件要用顶点级复核，不能只看包围盒。
       * 一根 CatmullRom 弯管的 AABB 会把整段弯曲包成一个大盒子，
       * 于是「管子从旁边绕过去」也会被判成穿模（例如排气支管贴着空气弹簧软管走）。
       * 这里要求：管壁上确有顶点落进对方实体内、且深度超过 PENETRATE，才算干涉。
       */
      if (PIPE_ID(A.id) !== PIPE_ID(B.id)) {
        const pipePart = PIPE_ID(A.id) ? A : B;
        const otherSolids = pipePart === A ? sb : sa;
        if (pipePenetration(pipePart, otherSolids) < PENETRATE) continue;
      }

      const va = (best.ba.max.x - best.ba.min.x) * (best.ba.max.y - best.ba.min.y) * (best.ba.max.z - best.ba.min.z);
      const vb = (best.bb.max.x - best.bb.min.x) * (best.bb.max.y - best.bb.min.y) * (best.bb.max.z - best.bb.min.z);
      const smaller = Math.min(va, vb);
      const ratio = best.vol / smaller;
      // 嵌套：小盒在 ≥2 个轴向上被大盒包住，且交集占小盒过半（双向判断）
      const small = va < vb ? best.ba : best.bb;
      const big = va < vb ? best.bb : best.ba;
      if (ratio > 0.55 && Math.max(enclosedAxes(small, big), enclosedAxes(big, small)) >= 2) {
        contained.push({ inner: A.id, host: B.id, vol: +best.vol.toFixed(3) });
        continue;
      }
      if (ratio < minRatio) continue;
      const entry = {
        a: A.id, b: B.id, layerA: A.layer, layerB: B.layer,
        vol: +best.vol.toFixed(3), ratio: +ratio.toFixed(3),
        dims: best.sz.toArray().map((v) => +v.toFixed(2)),
        at: best.iv.getCenter(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)),
      };
      const why = allowReason(entry.a, entry.b);
      if (why) allowed.push({ ...entry, reason: why });
      else interference.push(entry);
    }
  }
  interference.sort((x, y) => y.vol - x.vol);

  /* ---------- 2. 走管 ---------- */
  const routing = [];
  const meshBoxCache = new Map();
  const meshBoxesOf = (p) => {
    if (meshBoxCache.has(p.id)) return meshBoxCache.get(p.id);
    const arr = [];
    p.group.updateMatrixWorld(true);
    p.group.traverse((o) => { if (o.isMesh) arr.push(new THREE.Box3().setFromObject(o, true)); });
    meshBoxCache.set(p.id, arr);
    return arr;
  };
  for (const p of visible) {
    if (!PIPE_ID(p.id)) continue;
    const verts = worldVerts(p, Math.max(1, Math.floor(p.group.children.length / 3)));
    const hits = new Map();
    for (const v of verts) {
      for (const q of visible) {
        if (q === p) continue;
        if (STRUCT_RE.test(q.id)) continue; // 穿舱壁/甲板属正常开孔
        if (PIPE_ID(q.id)) continue; // 管与管的交叉由走廊规则约束，AABB 无法区分「交叉」与「平行」
        if (LATTICE_RE.test(q.id)) continue; // 镂空骨架不作为实体障碍
        for (const box of meshBoxesOf(q)) {
          if (box.isEmpty() || !box.containsPoint(v)) continue;
          // 只把「块体设备」当障碍：细长件（拉杆、桥架、电缆）合并后包围盒会被拉长，
          // 用它判定会大量误报。要求最短边 ≥ 0.25 m。
          const sz = box.getSize(new THREE.Vector3());
          if (Math.min(sz.x, sz.y, sz.z) < 0.25) continue;
          const d = depthInside(box, v);
          if (d < PENETRATE) continue;
          if (allowReason(p.id, q.id)) continue;
          const cur = hits.get(q.id) || { id: q.id, n: 0, maxDepth: 0 };
          cur.n += 1;
          cur.maxDepth = Math.max(cur.maxDepth, d);
          hits.set(q.id, cur);
        }
      }
    }
    if (hits.size) {
      const list = [...hits.values()].sort((x, y) => y.maxDepth - x.maxDepth);
      routing.push({ id: p.id, samples: verts.length, offenders: list.slice(0, 4).map((h) => ({ ...h, maxDepth: +h.maxDepth.toFixed(2) })) });
    }
  }
  routing.sort((x, y) => (y.offenders[0]?.maxDepth || 0) - (x.offenders[0]?.maxDepth || 0));

  /* ---------- 3. 传动链连续性 ---------- */
  const chain = checkChain();
  const chainGaps = [];
  const meshBoxes = new Map(); // partId → 子网格 Box3 列表（比整件 AABB 紧）
  const boxesOf = (p) => {
    if (meshBoxes.has(p.id)) return meshBoxes.get(p.id);
    const arr = [];
    p.group.updateMatrixWorld(true);
    p.group.traverse((o) => {
      if (o.isMesh) arr.push(new THREE.Box3().setFromObject(o, true));
    });
    meshBoxes.set(p.id, arr);
    return arr;
  };
  /* 只审计本构型下真实存在的段：否则柴油机构型会对被隐藏的燃气轮机传动段报「空洞」 */
  const liveSegments = SEGMENTS.filter((s) => (s.parts || []).some((id) => {
    const p = reg.get(id);
    return p && boxes.has(p.id);
  }));
  for (const s of liveSegments) {
    const A = new THREE.Vector3(...NODES[s.from].p);
    const B = new THREE.Vector3(...NODES[s.to].p);
    const owners = (s.parts || []).map((id) => reg.get(id)).filter(Boolean);
    const n = 14;
    let empty = 0, worstRun = 0, run = 0;
    for (let k = 0; k <= n; k++) {
      const pt = A.clone().lerp(B, k / n);
      let covered = false;
      for (const q of owners) {
        for (const bb of boxesOf(q)) {
          if (bb.clone().expandByScalar(CHAIN_TOL).containsPoint(pt)) { covered = true; break; }
        }
        if (covered) break;
      }
      if (!covered) { empty++; run++; worstRun = Math.max(worstRun, run); } else run = 0;
    }
    if (empty > 0) {
      chainGaps.push({
        seg: s.id, kind: s.kind, empty, of: n + 1, worstRun,
        len: +A.distanceTo(B).toFixed(2), owners: s.parts || [],
      });
    }
  }

  /* 节点吻合度：每个节点两侧构件应各有一件几何落在节点半径内 */
  const joints = NODE_IDS.map((id) => {
    const nd = node(id);
    const pt = new THREE.Vector3(...nd.p);
    const segs = liveSegments.filter((s) => s.from === id || s.to === id);
    if (!segs.length) return { node: id, label: nd.label, r: nd.r, incident: [], worst: null, ok: true, skipped: true };
    const near = [];
    for (const s of segs) {
      for (const pid of s.parts || []) {
        const p = reg.get(pid);
        if (!p) continue;
        const d = Math.min(...boxesOf(p).map((b) => b.distanceToPoint(pt)));
        near.push({ seg: s.id, part: pid, dist: +d.toFixed(3) });
      }
    }
    const worst = near.length ? Math.max(...near.map((x) => x.dist)) : Infinity;
    return { node: id, label: nd.label, r: nd.r, incident: near, worst: worst === Infinity ? null : worst, ok: worst <= Math.max(0.25, nd.r * 1.2) };
  });

  /* ---------- 4. 长跨旋转件支承 ----------
   * 判据从「id 里有没有 bearing」改成三步：
   *   (a) 优先取该段在真值表里声明的 supports；
   *   (b) 再并上 id 自报轴承/支座的构件（兜底，防止漏声明）；
   *   (c) 无论来源如何，都必须几何验证：几何中心到轴线的垂距 < 0.9 m，
   *       且轴向投影落在段内 —— 否则「附近正好有个轴承」也会被误判为已支承。
   */
  const SUPPORT_RE = /(bearing|pedestal|support|saddle|bracket|mount)/i;
  const supportPool = visible.filter((p) => SUPPORT_RE.test(p.id));
  const supports = [];
  for (const s of liveSegments) {
    if (s.kind === 'gear' || s.kind === 'flex') continue;
    const A = new THREE.Vector3(...NODES[s.from].p);
    const B = new THREE.Vector3(...NODES[s.to].p);
    const len = A.distanceTo(B);
    if (len < 3.0) continue;
    const dir = B.clone().sub(A).normalize();
    const declared = (s.supports || []);
    const pool = [...new Set([...declared, ...supportPool.map((p) => p.id)])]
      .map((id) => reg.get(id))
      .filter((p) => p && boxes.has(p.id));
    const near = [];
    for (const p of pool) {
      const c = boxes.get(p.id).getCenter(new THREE.Vector3());
      const t = c.clone().sub(A).dot(dir);
      const perp = c.clone().sub(A).addScaledVector(dir, -t).length();
      const inSpan = t > -0.3 && t < len + 0.3;
      // 只有被声明为支承、且确实骑在轴上，才算有效支承
      if (inSpan && perp < 0.9) near.push({ id: p.id, t: +t.toFixed(2), perp: +perp.toFixed(2), declared: declared.includes(p.id) });
    }
    supports.push({
      seg: s.id, len: +len.toFixed(2), supports: near, ok: near.length > 0,
      declaredMissing: declared.filter((id) => !near.some((x) => x.id === id)),
    });
  }

  reg.applyAll();

  return {
    config, propulsor, visible: visible.length, total: reg.parts.length,
    interference: interference.slice(0, opts.top ?? 40),
    contained: contained.length,
    allowed: allowed.slice(0, 40),
    sprawling,
    routing,
    chain: { ...chain, gaps: chainGaps, joints },
    supports,
    summary: {
      interference: interference.length,
      routing: routing.length,
      chainGaps: chainGaps.length,
      jointsBad: joints.filter((j) => !j.ok).length,
      chainOk: chain.ok && chainGaps.length === 0 && joints.every((j) => j.ok),
      worstOverlap: interference[0]?.vol ?? 0,
    },
  };
}

/** 一行式摘要，便于 CI 与终端输出 */
export function formatAudit(r) {
  const lines = [];
  lines.push(`构型 ${r.config}/${r.propulsor} · 可见构件 ${r.visible}/${r.total}`);
  lines.push(`干涉 ${r.summary.interference} 处 · 走管异常 ${r.summary.routing} 项 · 传动链空洞 ${r.summary.chainGaps} 段 · 节点失配 ${r.summary.jointsBad} 处 · 链图 ${r.chain.ok ? 'OK' : '异常'}`);
  return lines.join('\n');
}
