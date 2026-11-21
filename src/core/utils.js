import * as THREE from 'three';

export const D2R = Math.PI / 180;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/* ---------------- 基础图元 ---------------- */

export function mesh(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function box(w, h, d, mat, seg = 1) {
  return mesh(new THREE.BoxGeometry(w, h, d, seg, seg, seg), mat);
}

/** axis: 'x' | 'y' | 'z' */
export function cyl(rTop, rBot, h, seg, mat, axis = 'y') {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, false);
  const m = mesh(g, mat);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  return m;
}

/** 空心圆管，轴向 z 或 y */
export function tubeShell(rOut, rIn, h, mat, axis = 'z', seg = 40) {
  const g = new THREE.CylinderGeometry(rOut, rOut, h, seg, 1, true);
  const inner = new THREE.CylinderGeometry(rIn, rIn, h, seg, 1, true);
  const ringTop = new THREE.RingGeometry(rIn, rOut, seg, 1);
  const ringBot = new THREE.RingGeometry(rIn, rOut, seg, 1);
  const grp = new THREE.Group();
  const o = mesh(g, mat); grp.add(o);
  const i2 = mesh(inner, mat); i2.material.side = THREE.DoubleSide; grp.add(i2);
  const t = mesh(ringTop, mat); t.rotation.x = -Math.PI / 2; t.position.y = h / 2; grp.add(t);
  const b = mesh(ringBot, mat); b.rotation.x = Math.PI / 2; b.position.y = -h / 2; grp.add(b);
  if (axis === 'z') grp.rotation.x = Math.PI / 2;
  if (axis === 'x') grp.rotation.z = Math.PI / 2;
  return grp;
}

export function torus(R, r, mat, arc = Math.PI * 2, seg = 40, radialSeg = 10) {
  return mesh(new THREE.TorusGeometry(R, r, radialSeg, seg, arc), mat);
}

export function lathe(profile, mat, seg = 48) {
  const pts = profile.map((p) => new THREE.Vector2(p[0], p[1]));
  const m = mesh(new THREE.LatheGeometry(pts, seg), mat);
  return m;
}

/** 回转体，轴向 z */
export function latheZ(profile, mat, seg = 48) {
  const m = lathe(profile, mat, seg);
  m.rotation.x = Math.PI / 2;
  return m;
}

export function sphere(r, mat, w = 24, h = 16) {
  return mesh(new THREE.SphereGeometry(r, w, h), mat);
}

export function ringFlat(rIn, rOut, mat, seg = 48) {
  const m = mesh(new THREE.RingGeometry(rIn, rOut, seg), mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export function rbox(w, h, d, r, mat) {
  const shape = roundedRectShape(w, h, r);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: d,
    bevelEnabled: true,
    bevelSize: Math.min(r * 0.35, 0.02),
    bevelThickness: Math.min(r * 0.35, 0.02),
    bevelSegments: 2,
    curveSegments: 6,
  });
  g.translate(0, 0, -d / 2);
  return mesh(g, mat);
}

/** 带孔平板：孔在板面内 (x,y)，板厚沿 z */
export function plateWithHoles(w, h, t, holes, mat, r = 0.08) {
  const shape = roundedRectShape(w, h, r);
  (holes || []).forEach((hl) => {
    const p = new THREE.Path();
    p.absarc(hl.x, hl.y, hl.r, 0, Math.PI * 2, true);
    shape.holes.push(p);
  });
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 20 });
  g.translate(0, 0, -t / 2);
  return mesh(g, mat);
}

/** 多边形拉伸（点在 x/y 平面），沿 z 居中 */
export function extrudePoly(points, t, mat) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 12 });
  g.translate(0, 0, -t / 2);
  return mesh(g, mat);
}

export function pipe(points, r, mat, segs = 48, radSeg = 10) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, segs, r, radSeg, false);
  return mesh(g, mat);
}

export function hexBolt(r, h, mat) {
  const g = new THREE.CylinderGeometry(r, r * 0.96, h, 6, 1);
  const m = mesh(g, mat);
  return m;
}

/** 沿 axis 排布的螺栓圈 */
export function boltCircle({
  R, n, r = 0.035, h = 0.07, mat, axis = 'z', start = 0, headOnly = true,
}) {
  const grp = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const a = start + (i / n) * Math.PI * 2;
    const b = hexBolt(r, h, mat);
    if (axis === 'z') { b.rotation.x = Math.PI / 2; b.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); }
    else if (axis === 'y') { b.position.set(Math.cos(a) * R, 0, Math.sin(a) * R); }
    else { b.rotation.z = Math.PI / 2; b.position.set(0, Math.cos(a) * R, Math.sin(a) * R); }
    grp.add(b);
    if (!headOnly) {
      const s = cyl(r * 0.55, r * 0.55, h * 4, 8, mat, axis);
      if (axis === 'z') s.position.set(Math.cos(a) * R, Math.sin(a) * R, h * 2);
      grp.add(s);
    }
  }
  return grp;
}

/** 斜齿轮 / 直齿轮（近似）：齿用 box 环绕 */
export function gear(R, width, teeth, mat, toothH = 0.09, axis = 'z') {
  const grp = new THREE.Group();
  const body = cyl(R - toothH * 0.6, R - toothH * 0.6, width, 40, mat, axis);
  grp.add(body);
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const t = box(toothH * 1.7, toothH * 2.1, width * 0.92, mat);
    t.position.set(Math.cos(a) * (R - toothH * 0.3), Math.sin(a) * (R - toothH * 0.3), 0);
    t.rotation.z = a;
    grp.add(t);
  }
  if (axis === 'y') grp.rotation.x = Math.PI / 2;
  if (axis === 'x') grp.rotation.y = Math.PI / 2;
  return grp;
}

/** 叶轮：轮毂 + 若干扭曲叶片 */
export function impeller(R, hubR, blades, mat, height = 0.18) {
  const grp = new THREE.Group();
  grp.add(cyl(hubR, hubR, height * 2.4, 24, mat, 'z'));
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2;
    const s = new THREE.Shape();
    s.moveTo(hubR * 0.9, -0.03);
    s.quadraticCurveTo(R * 0.6, height * 0.6, R, 0.02);
    s.quadraticCurveTo(R * 0.55, -height * 0.2, hubR * 0.9, -0.09);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false });
    const m = mesh(g, mat);
    m.position.z = -0.01;
    m.rotation.z = a;
    m.rotation.y = 0.35;
    grp.add(m);
  }
  return grp;
}

/** 轴向叶栅：一圈叶片（压气机/涡轮） */
export function bladeRing(R, hubR, count, mat, chord = 0.16, thick = 0.02, tilt = 0.5) {
  const grp = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const b = box(R - hubR, chord, thick, mat);
    b.position.set(Math.cos(a) * (hubR + (R - hubR) / 2), Math.sin(a) * (hubR + (R - hubR) / 2), 0);
    b.rotation.z = a;
    b.rotation.y = tilt;
    grp.add(b);
  }
  return grp;
}

/* ---------------- 选择 / 合并 ---------------- */

/**
 * 按「材质 × 空间分块」合批。
 *
 * 早期实现按材质把所有几何并成一个网格，draw call 是省了，但整个构件被压成一个
 * 巨型包围盒：审计干涉时无法区分「一根管子穿过机器」与「管子贴着机器旁边走」，
 * 走管检查也全是误报。
 *
 * 第一次修法是按 1.6 m 空间网格分块——精度回来了，代价是 draw call 从 ~900 涨到 2628。
 * 第二次修法（当前）：合批前把每个实体子网格的包围盒留档到 group.userData.solidBoxes，
 * 审计改用留档盒，于是「渲染合批粒度」与「审计空间精度」彻底解耦，
 * 分块尺寸可以放大到 5 m 而不牺牲审计结论。
 */
const MERGE_CELL = 5.0;

export function bakeStatic(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  const doomed = [];
  // 合批前把每个实体子网格的包围盒（构件局部坐标）留档：
  // 渲染需要少 draw call，审计需要每个零件的空间局部性。两件事原本互相牵制
  // ——按材质全合批会让整机变成一个巨型 AABB，审计再也分不清「管子穿机器」和「管子绕过去」。
  // 解法是把两者解耦：合批只服务渲染，审计用这里留档的原始子网格盒。
  const solids = [];
  group.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    if (o.userData.keep) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    if (!g.getAttribute('uv')) {
      const count = g.getAttribute('position').count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    g.applyMatrix4(m);
    g.computeBoundingBox();
    solids.push(g.boundingBox.clone());
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    const cell = [
      Math.floor(c.x / MERGE_CELL),
      Math.floor(c.y / MERGE_CELL),
      Math.floor(c.z / MERGE_CELL),
    ].join(',');
    const key = o.material.uuid + '|' + cell;
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, geos: [] });
    buckets.get(key).geos.push(g);
    doomed.push(o);
  });
  group.userData.solidBoxes = solids;
  if (!buckets.size) return;
  const merged = [];
  for (const { mat, geos } of buckets.values()) {
    const g = mergeGeos(geos);
    if (g) {
      const mm = new THREE.Mesh(g, mat);
      mm.castShadow = true;
      mm.receiveShadow = true;
      merged.push(mm);
    } else {
      // 合并不支持时退化：保留原始网格
      geos.forEach((gg) => merged.push(new THREE.Mesh(gg, mat)));
    }
    geos.forEach((gg) => gg.dispose && gg.dispose());
  }
  doomed.forEach((o) => {
    if (o.parent) o.parent.remove(o);
  });
  merged.forEach((m) => group.add(m));
}

function mergeGeos(geos) {
  // 小型的本地 merge，避免额外 addon 依赖
  const attrNames = ['position', 'normal', 'uv'];
  let total = 0;
  for (const g of geos) total += g.getAttribute('position').count;
  const out = new THREE.BufferGeometry();
  for (const name of attrNames) {
    const itemSize = name === 'uv' ? 2 : 3;
    const arr = new Float32Array(total * itemSize);
    let off = 0;
    for (const g of geos) {
      const a = g.getAttribute(name);
      if (!a) return null;
      arr.set(a.array.subarray(0, a.count * itemSize), off);
      off += a.count * itemSize;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
  }
  return out;
}

/* ---------------- 程序化画布纹理 ---------------- */

export function canvasTexture(w, h, draw, { repeat = [1, 1], srgb = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
