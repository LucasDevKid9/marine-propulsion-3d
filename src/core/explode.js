import * as THREE from 'three';
import { clamp, easeInOutCubic, damp } from './utils.js';
import { LAYER_MAP } from './registry.js';

/** 分层爆炸：单一 progress 为唯一真值，播放 / 反向 / 滑块共用 */
export class ExplodeController {
  constructor(registry, onChange) {
    this.reg = registry;
    this.onChange = onChange || (() => {});
    this.progress = 0;
    this.direction = 0; // 1 展开, -1 装配, 0 停
    this.rate = 0.17; // 每秒进度
    this.playing = false;
    this.speedScale = 1;
  }

  setProgress(v, silent) {
    this.progress = clamp(v, 0, 1);
    this.refresh();
    if (!silent) this.onChange(this);
  }

  play(dir = 1) {
    if (dir > 0 && this.progress >= 0.999) this.progress = 0;
    if (dir < 0 && this.progress <= 0.001) this.progress = 1;
    this.direction = dir;
    this.playing = true;
    this.onChange(this);
  }

  pause() {
    this.playing = false;
    this.direction = 0;
    this.onChange(this);
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play(this.progress >= 0.999 ? -1 : 1);
  }

  reverse() {
    if (this.playing) {
      this.direction *= -1;
      this.onChange(this);
    } else {
      this.play(this.progress >= 0.999 ? -1 : 1);
    }
  }

  reassemble() {
    this.playing = true;
    this.direction = -1;
    this.reg.parts.forEach((p) => { p.indTarget = 0; });
    this.onChange(this);
  }

  step(delta) {
    this.playing = false;
    this.direction = 0;
    this.setProgress(this.progress + delta);
  }

  stepLayer(index) {
    const ends = [0.16, 0.32, 0.48, 0.64, 0.8, 1.0];
    this.playing = false;
    this.direction = 0;
    this.setProgress(ends[clamp(index, 0, 5)]);
  }

  update(dt) {
    if (this.playing) {
      this.progress += this.direction * this.rate * this.speedScale * dt;
      if (this.progress >= 1) { this.progress = 1; this.playing = false; this.direction = 0; this.onChange(this); }
      else if (this.progress <= 0) { this.progress = 0; this.playing = false; this.direction = 0; this.onChange(this); }
      else this.onChange(this);
    }
    this.refresh(dt);
  }

  refresh(dt = 1 / 60) {
    const p = this.progress;
    for (const part of this.reg.parts) {
      if (!part.explode) {
        part.explodeOffset.set(0, 0, 0);
      } else {
        const l = LAYER_MAP[part.layer];
        const local = l ? easeInOutCubic(clamp((p - l.start) / l.span, 0, 1)) : p;
        part.explodeOffset.copy(part.dir).multiplyScalar(part.dist * local);
      }
      // 单构件拆出
      part.indValue = damp(part.indValue, part.indTarget, 5, dt);
      part.indOffset.copy(part.dir).multiplyScalar(2.2 * part.indValue);
      this.reg.apply(part);
    }
  }

  get percent() { return Math.round(this.progress * 100); }
}

export function makeGridGroup(scene) {
  // 环形平台 + 地面网格
  const grp = new THREE.Group();
  grp.name = 'display-ring';
  const g = new THREE.GridHelper(90, 90, 0x1b3a4a, 0x122430);
  g.position.y = -4.6;
  g.material.transparent = true;
  g.material.opacity = 0.55;
  grp.add(g);
  scene.add(grp);
  return grp;
}
