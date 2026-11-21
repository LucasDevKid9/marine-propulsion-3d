import * as THREE from 'three';
import { canvasTexture } from './utils.js';

/* 可平铺的值噪声 */
function hash(x, y, seed) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}
function noise2(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export class TextureKit {
  constructor() {
    this.noise = this.makeNoise(256, 1, 0.55);
    this.micro = this.makeNoise(256, 3, 0.5);
    this.grime = this.makeGrime(512);
    this.brushed = this.makeBrushed(512);
    this.checker = this.makeChecker(512);
    this.wet = this.makeWet(512);
    this.caustic = this.makeCaustic(512);
    this.glow = this.makeGlow(128);
  }

  makeNoise(size, scale, base) {
    const data = new Uint8Array(size * size);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let v = 0, amp = 0.55, f = scale;
        for (let o = 0; o < 3; o++) {
          v += noise2((x / size) * f, (y / size) * f, o + 3) * amp;
          f *= 2.1; amp *= 0.5;
        }
        const g = Math.floor(Math.min(1, Math.max(0, v * base + (1 - base) * 0.5)) * 255);
        data[y * size + x] = g;
        const i = (y * size + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 4;
    return t;
  }

  makeGrime(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, 0, size, size);
    // 油渍斑块
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * size, y = Math.random() * size;
      const r = 6 + Math.random() * 46;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(40,38,34,${0.05 + Math.random() * 0.12})`);
      g.addColorStop(1, 'rgba(40,38,34,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // 竖向流痕
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * size;
      const w = 2 + Math.random() * 7;
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, 'rgba(30,28,24,0)');
      g.addColorStop(0.5, `rgba(30,28,24,${0.05 + Math.random() * 0.10})`);
      g.addColorStop(1, 'rgba(30,28,24,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, w, size);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  makeBrushed(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2600; i++) {
      const y = Math.random() * size;
      const a = 0.02 + Math.random() * 0.10;
      ctx.strokeStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
      ctx.lineWidth = 0.5 + Math.random();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y + (Math.random() - 0.5) * 2);
      ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  }

  makeChecker(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#4b5157';
    ctx.fillRect(0, 0, size, size);
    const cell = size / 4;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        ctx.save();
        ctx.translate(x * cell + cell / 2, y * cell + cell / 2);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#5b6268';
        ctx.fillRect(-cell * 0.22, -cell * 0.09, cell * 0.44, cell * 0.18);
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(-cell * 0.22, -cell * 0.09, cell * 0.44, cell * 0.03);
        ctx.restore();
      }
    }
    // 板缝
    ctx.strokeStyle = 'rgba(10,12,14,0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  makeWet(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 160; i++) {
      const x = Math.random() * size, y = Math.random() * size;
      const r = 2 + Math.random() * 26;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.16)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.NoColorSpace;
    return t;
  }

  makeCaustic(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * size, y = Math.random() * size;
      const r = 12 + Math.random() * 55;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(120,215,255,0.55)');
      g.addColorStop(0.45, 'rgba(60,150,205,0.18)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  makeGlow(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
}

export { canvasTexture };
