import * as THREE from 'three';

const C_INTAKE = new THREE.Color('#3f7dff');
const C_COMP = new THREE.Color('#3fe4ff');
const C_BURN = new THREE.Color('#ff9a3c');
const C_EXH = new THREE.Color('#ff4326');

const vert = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  uniform float uPixel;
  void main(){
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixel * (140.0 / max(0.6, -mv.z));
  }
`;
const frag = /* glsl */ `
  varying vec3 vColor;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.05, d);
    gl_FragColor = vec4(vColor, a * 0.9);
  }
`;

class FlowPath {
  constructor({ points, count, colorRamp, speed = 0.09, size = 2.2, spread = 0.09 }) {
    this.curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.35);
    this.count = count;
    this.speed = speed;
    this.spread = spread;
    this.colorRamp = colorRamp;
    this.offsets = new Float32Array(count);
    this.jitter = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.offsets[i] = i / count + Math.random() * 0.01;
      this.jitter[i * 3] = (Math.random() - 0.5) * spread;
      this.jitter[i * 3 + 1] = (Math.random() - 0.5) * spread;
      this.jitter[i * 3 + 2] = (Math.random() - 0.5) * spread;
    }
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    const sizes = new Float32Array(count).fill(size);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      // 气流是工程可视化层：穿透壳体显示，否则燃机内部流路会被机壳完全遮挡
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPixel: { value: Math.min(window.devicePixelRatio, 2) } },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.renderOrder = 900;
    this.points.frustumCulled = false;
    this.geo = g;
    this.tmp = new THREE.Vector3();
  }

  update(time, visibleAmount) {
    const c = new THREE.Color();
    for (let i = 0; i < this.count; i++) {
      let t = (this.offsets[i] + time * this.speed) % 1;
      if (t < 0) t += 1;
      this.curve.getPointAt(t, this.tmp);
      this.pos[i * 3] = this.tmp.x + this.jitter[i * 3] * visibleAmount;
      this.pos[i * 3 + 1] = this.tmp.y + this.jitter[i * 3 + 1] * visibleAmount;
      this.pos[i * 3 + 2] = this.tmp.z + this.jitter[i * 3 + 2] * visibleAmount;
      this.colorRamp(t, c);
      this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.mat.opacity = visibleAmount;
  }
}

/**
 * 沿流路分段着色：蓝(进气) → 青(压缩) → 橙(燃烧) → 红橙(排气)
 * @param {number} t 0-1 沿流路位置
 * @param {THREE.Color} out 复用的输出色（避免逐帧分配）
 */
function ramp(t, out) {
  const c = out || new THREE.Color();
  if (t < 0.28) c.copy(C_INTAKE).lerp(C_COMP, t / 0.28);
  else if (t < 0.52) c.copy(C_COMP);
  else if (t < 0.68) c.copy(C_COMP).lerp(C_BURN, (t - 0.52) / 0.16);
  else if (t < 0.86) c.copy(C_BURN);
  else c.copy(C_BURN).lerp(C_EXH, Math.min(1, (t - 0.86) / 0.14));
  return c;
}

export class GasFlow {
  constructor(scene) {
    this.scene = scene;
    this.enabled = false;
    this.amount = 0;
    this.time = 0;
    this.group = new THREE.Group();
    this.group.name = 'gas-flow';
    scene.add(this.group);

    // 燃气轮机位于 x = -4.0，流路必须跟随该偏移
    const gx = -4.0;
    const gt = [
      [gx, 8.30, -9.8], [gx, 8.30, -8.9], [gx, 8.30, -8.1],
      [gx, 8.30, -7.2], [gx, 8.30, -6.3], [gx, 8.30, -5.6],
      [gx + 0.55, 8.30, -4.9], [gx + 0.95, 8.55, -4.55], [gx + 0.95, 8.05, -4.4],
      [gx + 0.55, 7.95, -4.25], [gx, 8.10, -4.15], [gx, 8.30, -3.75],
      [gx, 8.30, -3.25], [gx, 8.42, -2.9], [gx, 9.6, -2.72], [gx, 11.4, -2.6],
    ];
    this.gt = new FlowPath({ points: gt, count: 900, colorRamp: ramp, speed: 0.11, size: 1.05, spread: 0.1 });
    this.group.add(this.gt.points);

    const dz = 3.1;
    const diesel = [
      [-1.9, 4.55, dz], [-1.35, 4.42, dz], [-0.55, 4.20, dz], [-0.1, 4.32, dz],
      [0.0, 4.75, dz], [0.05, 5.25, dz], [0.05, 5.7, dz], [0.0, 6.15, dz],
      [0.0, 6.9, dz], [0.4, 7.6, dz], [1.1, 8.0, dz], [1.95, 8.12, dz + 1.4],
      [2.4, 8.0, dz + 3.4], [2.75, 7.72, dz + 4.3], [2.78, 8.6, dz + 4.4], [2.78, 10.8, dz + 4.4],
    ];
    this.diesel = new FlowPath({ points: diesel, count: 720, colorRamp: ramp, speed: 0.13, size: 1.0, spread: 0.08 });
    this.group.add(this.diesel.points);

    this.arrows = this.makeArrows();
    this.group.add(this.arrows);

    this.group.visible = false;
  }

  makeArrows() {
    const grp = new THREE.Group();
    const mk = (curve, t, color, scale = 1) => {
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.10 * scale, 0.34 * scale, 10),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
      );
      cone.position.copy(p);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.normalize());
      grp.add(cone);
    };
    [0.12, 0.3, 0.45, 0.62, 0.78, 0.92].forEach((t, i) => {
      const c = [C_INTAKE, C_COMP, C_BURN, C_BURN, C_EXH, C_EXH][i];
      mk(this.gt.curve, t, c, 1.1);
    });
    [0.2, 0.42, 0.58, 0.8].forEach((t, i) => {
      const c = [C_INTAKE, C_COMP, C_BURN, C_EXH][i];
      mk(this.diesel.curve, t, c, 0.9);
    });
    return grp;
  }

  toggle(v) {
    this.enabled = v === undefined ? !this.enabled : v;
    this.group.visible = this.enabled || this.amount > 0.01;
    return this.enabled;
  }

  update(dt) {
    const target = this.enabled ? 1 : 0;
    this.amount += (target - this.amount) * Math.min(1, dt * 4);
    if (this.amount < 0.01 && !this.enabled) { this.group.visible = false; return; }
    this.group.visible = true;
    this.time += dt;
    this.gt.update(this.time, this.amount);
    this.diesel.update(this.time, this.amount);
    this.arrows.children.forEach((c, i) => {
      c.material.opacity = this.amount * 0.85;
      c.scale.setScalar(0.6 + 0.4 * Math.sin(this.time * 2 + i));
    });
  }
}
