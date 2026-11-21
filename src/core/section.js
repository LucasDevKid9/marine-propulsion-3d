import * as THREE from 'three';

/** 真实剖切：只切"壳体"类零件，保留内部零件可见。
 *  plane 语义：保留 dot(n, p) >= d 的一侧（d 由 base + offset 决定） */
export const SECTION_TARGETS = [
  { id: 'off', label: '关闭剖切' },
  { id: 'engine', label: '主机气缸剖切', normal: [-1, 0, 0], base: 0.0, range: [-2.2, 2.2], focus: [0, 5.0, 3.2], dist: 24 },
  { id: 'prop', label: '可调距桨桨毂剖切', normal: [0, -1, 0], base: -1.95, range: [-1.0, 1.6], focus: [0, 1.9, -15.2], dist: 8 },
  { id: 'stern', label: '艉管密封剖切', normal: [0, -1, 0], base: -1.95, range: [-1.2, 1.2], focus: [0, 1.95, -9.8], dist: 6.5 },
  { id: 'thrust', label: '推力轴承剖切', normal: [0, -1, 0], base: -1.95, range: [-1.2, 1.2], focus: [0, 1.95, -5.4], dist: 5.5 },
  { id: 'gtc', label: '压气机剖切', normal: [-1, 0, 0], base: -4.0, range: [-1.6, 1.6], focus: [-4.0, 8.3, -7.6], dist: 8 },
  { id: 'gtb', label: '燃烧室剖切', normal: [-1, 0, 0], base: -4.0, range: [-1.6, 1.6], focus: [-4.0, 8.3, -5.4], dist: 7 },
  { id: 'gtt', label: '涡轮剖切', normal: [-1, 0, 0], base: -4.0, range: [-1.6, 1.6], focus: [-4.0, 8.3, -3.8], dist: 6.5 },
  { id: 'all', label: '全机水平剖切', normal: [0, -1, 0], base: -5.0, range: [-2.0, 9.5], focus: [0, 4.5, -2], dist: 30 },
];

function matchTarget(part, id) {
  const tags = part.tags;
  switch (id) {
    case 'engine': return part.layer === 'engine' && !tags.includes('gt') && part.shell;
    case 'prop': return part.layer === 'prop' && part.shell;
    case 'stern': return part.layer === 'stern' && part.shell;
    case 'thrust': return part.layer === 'shaft' && part.shell;
    case 'gtc': return tags.includes('gt-shell') && tags.includes('gt-comp');
    case 'gtb': return tags.includes('gt-shell') && tags.includes('gt-comb');
    case 'gtt': return tags.includes('gt-shell') && tags.includes('gt-turb');
    case 'all': return part.shell;
    default: return false;
  }
}

export class SectionController {
  constructor(renderer, registry) {
    this.renderer = renderer;
    this.reg = registry;
    this.renderer.localClippingEnabled = true;
    this.plane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
    this.active = 'off';
    this.offset = 0;
    this.targetD = 0;
    this.currentD = 0;
    this.smooth = true;
  }

  setTarget(id) {
    const t = SECTION_TARGETS.find((x) => x.id === id);
    this.active = id;
    if (!t || id === 'off') { this.clear(); return null; }
    this.plane.normal.set(...t.normal).normalize();
    this.offset = 0;
    this.targetD = t.base;
    this.currentD = t.base;
    this.plane.constant = -t.base;
    this.apply();
    return t;
  }

  setOffset(v) {
    const t = SECTION_TARGETS.find((x) => x.id === this.active);
    if (!t) return;
    this.offset = v;
    this.targetD = t.base + v;
  }

  clear() {
    this.active = 'off';
    this.reg.parts.forEach((p) => {
      p.mats.forEach((m) => {
        m.clippingPlanes = null;
        m.clipShadows = false;
        if (m.userData.wasDouble !== undefined) {
          m.side = m.userData.wasDouble;
          delete m.userData.wasDouble;
        }
        if (m.userData.secEnv !== undefined) {
          m.envMapIntensity = m.userData.secEnv;
          m.roughness = m.userData.secRough;
          delete m.userData.secEnv;
          delete m.userData.secRough;
        }
        m.needsUpdate = true;
      });
    });
  }

  apply() {
    if (this.active === 'off') return this.clear();
    for (const p of this.reg.parts) {
      const hit = matchTarget(p, this.active);
      for (const m of p.mats) {
        if (hit) {
          if (m.userData.wasDouble === undefined) m.userData.wasDouble = m.side;
          if (m.userData.secEnv === undefined) {
            m.userData.secEnv = m.envMapIntensity;
            m.userData.secRough = m.roughness;
          }
          m.clippingPlanes = [this.plane];
          m.clipShadows = true;
          m.side = THREE.DoubleSide;
          // 切面内壁不再被环境光与高光打亮，避免剖切后整块发白
          m.envMapIntensity = m.userData.secEnv * 0.4;
          m.roughness = Math.min(1, m.userData.secRough + 0.18);
        } else {
          m.clippingPlanes = null;
          m.clipShadows = false;
          if (m.userData.wasDouble !== undefined) {
            m.side = m.userData.wasDouble;
            delete m.userData.wasDouble;
          }
          if (m.userData.secEnv !== undefined) {
            m.envMapIntensity = m.userData.secEnv;
            m.roughness = m.userData.secRough;
            delete m.userData.secEnv;
            delete m.userData.secRough;
          }
        }
        m.needsUpdate = true;
      }
    }
  }

  update(dt) {
    if (this.active === 'off') return;
    const next = this.currentD + (this.targetD - this.currentD) * (1 - Math.exp(-9 * dt));
    if (Math.abs(next - this.currentD) > 1e-5) {
      this.currentD = next;
      this.plane.constant = -this.currentD;
    }
  }

  get d() { return this.currentD; }
}

/** 透视模式：壳体半透明，便于观察内部运动（与剖切互斥使用） */
export function setXray(registry, on) {
  for (const p of registry.parts) {
    if (!p.shell) continue;
    for (const m of p.mats) {
      if (on) {
        if (m.userData.origTransparent === undefined) {
          m.userData.origTransparent = m.transparent;
          m.userData.origOpacity = m.opacity;
          m.userData.origDepth = m.depthWrite;
        }
        m.transparent = true;
        m.opacity = 0.16;
        m.depthWrite = false;
      } else if (m.userData.origTransparent !== undefined) {
        m.transparent = m.userData.origTransparent;
        m.opacity = m.userData.origOpacity;
        m.depthWrite = m.userData.origDepth;
        delete m.userData.origTransparent;
      }
      m.needsUpdate = true;
    }
  }
}
