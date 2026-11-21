import * as THREE from 'three';
import { bakeStatic, clamp } from './utils.js';

export const LAYERS = [
  { id: 'prop', name: '螺旋桨总成', color: '#e8b06a', dir: [0, 0.18, -1], dist: 13.5, start: 0.0, span: 0.5 },
  { id: 'stern', name: '艉轴与艉管密封', color: '#7ad3e8', dir: [-0.35, 0.35, -0.2], dist: 9.0, start: 0.09, span: 0.5 },
  { id: 'shaft', name: '中间轴与推力轴承', color: '#8fb2ff', dir: [-0.55, 0.6, 0.1], dist: 10.0, start: 0.18, span: 0.5 },
  { id: 'engine', name: '主机柴油机 / 燃气轮机', color: '#ff9d63', dir: [0, 1, 0], dist: 12.0, start: 0.27, span: 0.5 },
  { id: 'found', name: '机座与隔振支撑', color: '#a4b0bb', dir: [0, -1, 0], dist: 6.0, start: 0.36, span: 0.5 },
  { id: 'aux', name: '辅助管路与控制系统', color: '#7fe0b2', dir: [1, 0.35, 0.1], dist: 11.0, start: 0.45, span: 0.5 },
];

export const LAYER_MAP = Object.fromEntries(LAYERS.map((l) => [l.id, l]));

/**
 * 单一可见性判据 —— 渲染层（PartRegistry）与审计层（audit.js）共用同一份规则。
 *
 * 设计动因（见 docs/POSTMORTEM.md 缺陷 D「同一规则写两遍」）：
 * 可见性规则一旦在两处各写一遍，改一处忘另一处，审计就会拿「本构型下根本不存在的构件」
 * 去报缺陷（例如柴油机构型下报「竖直传动轴没有支承」，而燃气轮机整机本来就被隐藏）。
 * 规则只能有一份，两边都调它。
 *
 * @param {object} p 构件
 * @param {{config?:string, propulsor?:string, isolateId?:string, isolate?:object}} state
 */
export function partVisible(p, state = {}) {
  let v = !p.userHidden;
  const isolate = state.isolate || null;
  // 标签兼容：燃气轮机用 'gt'，其余替代构型用 '*-only'
  const has = (t) => p.tags.includes(t) || p.tags.includes(t + '-only');
  if (isolate) v = v && (p === isolate || isolate.tags.includes('with:' + p.id) || p.tags.includes('keep:' + isolate.id));
  if (state.config === 'diesel' && has('gt')) v = false;
  if (state.config === 'gas' && p.tags.includes('diesel-only')) v = false;
  if (state.propulsor === 'cpp' && p.tags.includes('fpp-only')) v = false;
  if (state.propulsor === 'fpp' && (p.tags.includes('cpp-only') || p.tags.includes('cpp-blade'))) v = false;
  return v;
}

export class PartRegistry {
  constructor(root, matlib) {
    this.root = root;
    this.matlib = matlib;
    this.parts = [];
    this.map = new Map();
  }

  add(cfg) {
    if (this.map.has(cfg.id)) throw new Error('duplicate part id: ' + cfg.id);
    const g = new THREE.Group();
    g.name = cfg.id;
    const base = new THREE.Vector3(...(cfg.pos || [0, 0, 0]));
    g.position.copy(base);
    g.rotation.order = cfg.rotOrder || 'XYZ';

    const cache = new Map();
    const ctx = {
      m: (key) => {
        if (!cache.has(key)) cache.set(key, this.matlib.get(key));
        return cache.get(key);
      },
      matlib: this.matlib,
    };
    cfg.build(g, ctx);

    if (cfg.merge !== false) bakeStatic(g);

    const mats = [];
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = cfg.cast !== false;
        o.receiveShadow = true;
        if (o.material && !mats.includes(o.material)) mats.push(o.material);
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      }
    });

    const layer = LAYER_MAP[cfg.layer];
    const dir = new THREE.Vector3(...(cfg.dir || layer?.dir || [0, 1, 0])).normalize();
    const dist = cfg.dist ?? layer?.dist ?? 5;

    const part = {
      id: cfg.id,
      label: cfg.label,
      layer: cfg.layer || 'aux',
      sub: cfg.sub || '',
      details: cfg.details || [],
      group: g,
      basePos: base.clone(),
      dir,
      dist,
      shell: !!cfg.shell,
      explode: cfg.explode !== false,
      tags: cfg.tags || [],
      mats,
      explodeOffset: new THREE.Vector3(),
      indOffset: new THREE.Vector3(),
      indTarget: 0,
      indValue: 0,
      animPos: new THREE.Vector3(),
      animRot: new THREE.Euler(0, 0, 0, cfg.rotOrder || 'XYZ'),
      animScale: 1,
      hiddenByIsolate: false,
      userHidden: false,
      box: new THREE.Box3(),
      center: new THREE.Vector3(),
    };
    g.userData.part = part;
    this.root.add(g);
    this.parts.push(part);
    this.map.set(part.id, part);
    return part;
  }

  get(id) { return this.map.get(id); }

  byLayer(layer) { return this.parts.filter((p) => p.layer === layer); }

  each(fn) { this.parts.forEach(fn); }

  apply(part) {
    const p = part;
    p.group.position.copy(p.basePos)
      .add(p.explodeOffset)
      .add(p.indOffset)
      .add(p.animPos);
    p.group.rotation.set(p.animRot.x, p.animRot.y, p.animRot.z);
    if (p.animScale !== 1) p.group.scale.setScalar(p.animScale);
    p.group.visible = p.visibleNow !== false;
  }

  applyAll() { this.parts.forEach((p) => this.apply(p)); }

  /** 依据用户隐藏 / 隔离 / 构型标签刷新可见性 */
  refreshVisibility(state) {
    const st = state.isolateId ? { ...state, isolate: this.map.get(state.isolateId) || null } : state;
    this.parts.forEach((p) => {
      p.visibleNow = partVisible(p, st);
    });
    this.applyAll();
  }

  updateBox(part, box) {
    part.box.setFromObject(part.group, true);
    part.box.getCenter(part.center);
  }

  layerProgress(p, layerId) {
    const l = LAYER_MAP[layerId];
    if (!l) return 0;
    return clamp((p - l.start) / l.span, 0, 1);
  }
}

export function tween(num, target, dt, speed = 6) {
  return num + (target - num) * (1 - Math.exp(-speed * dt));
}
