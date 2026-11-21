import * as THREE from 'three';

/** 悬浮标签：HTML 投影，不参与 WebGL 拾取 */
export class Labels {
  constructor(container, camera, domElement) {
    this.container = container;
    this.camera = camera;
    this.dom = domElement;
    this.items = [];
    this.enabled = true;
    this.tmp = new THREE.Vector3();
  }

  add(part, text, sub) {
    const el = document.createElement('div');
    el.className = 'label3d';
    el.innerHTML = `<span class="dot"></span><span class="tx"><b>${text}</b><i>${sub || ''}</i></span>`;
    this.container.appendChild(el);
    const box = new THREE.Box3().setFromObject(part.group);
    const c = new THREE.Vector3();
    box.getCenter(c);
    c.sub(part.basePos);
    this.items.push({ part, el, local: c, visible: true });
  }

  setEnabled(v) {
    this.enabled = v;
    this.items.forEach((it) => { it.el.style.display = v ? '' : 'none'; });
  }

  update() {
    if (!this.enabled) return;
    const w = this.dom.clientWidth, h = this.dom.clientHeight;
    for (const it of this.items) {
      const p = it.part;
      if (!p.group.visible) { it.el.style.opacity = '0'; continue; }
      this.tmp.copy(it.local).add(p.group.position);
      const dist = this.tmp.distanceTo(this.camera.position);
      this.tmp.project(this.camera);
      const on = this.tmp.z < 1 && Math.abs(this.tmp.x) < 1.15 && Math.abs(this.tmp.y) < 1.05;
      if (!on) { it.el.style.opacity = '0'; continue; }
      const x = (this.tmp.x * 0.5 + 0.5) * w;
      const y = (-this.tmp.y * 0.5 + 0.5) * h;
      const op = Math.max(0.15, Math.min(0.95, 1.25 - dist / 45));
      it.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      it.el.style.opacity = op.toFixed(2);
      it.el.style.zIndex = String(1000 - Math.round(dist * 3));
    }
  }
}
