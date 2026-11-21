import * as THREE from 'three';

/* 材质配方：全部为 PBR 五通道耦合（color / metalness / roughness / normal-ish / clearcoat） */
const DEFS = {
  castIron: { color: 0x4a5259, metalness: 0.42, roughness: 0.68, map: 'grime', repeat: [2, 2], roughMap: 'noise', rough: 0.74 },
  castIronDark: { color: 0x2b3136, metalness: 0.42, roughness: 0.74, map: 'grime', repeat: [2, 1] },
  castIronRed: { color: 0x6b3b32, metalness: 0.35, roughness: 0.62, map: 'grime', repeat: [2, 2] },
  epoxy: { color: 0x3a5d5f, metalness: 0.12, roughness: 0.46, clearcoat: 0.5, clearcoatRoughness: 0.34, map: 'grime', repeat: [2, 2] },
  epoxyDeck: { color: 0x2c3f46, metalness: 0.12, roughness: 0.56, clearcoat: 0.45, map: 'grime', repeat: [3, 3] },
  epoxyGrey: { color: 0x4a5258, metalness: 0.2, roughness: 0.48, clearcoat: 0.4 },
  forgedSteel: { color: 0x9ba4ac, metalness: 1.0, roughness: 0.3, roughMap: 'brushed', repeat: [1, 6] },
  machinedSteel: { color: 0xc6ced5, metalness: 1.0, roughness: 0.22, roughMap: 'brushed', repeat: [2, 2] },
  stainless: { color: 0xd3dae0, metalness: 1.0, roughness: 0.16, roughMap: 'brushed', repeat: [1, 4] },
  stainlessWet: { color: 0xc2cdd4, metalness: 1.0, roughness: 0.12, clearcoat: 1.0, clearcoatRoughness: 0.1, map: 'wet', repeat: [2, 2] },
  copperAlloy: { color: 0xb0763c, metalness: 1.0, roughness: 0.33, clearcoat: 0.5, clearcoatRoughness: 0.28, map: 'grime', repeat: [1, 2] },
  copperMachined: { color: 0xc78a45, metalness: 1.0, roughness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.2 },
  bronze: { color: 0x8d6c40, metalness: 1.0, roughness: 0.4 },
  whiteMetal: { color: 0xb8b2a3, metalness: 0.85, roughness: 0.34, roughMap: 'micro', repeat: [3, 3] },
  chrome: { color: 0xe9eef2, metalness: 1.0, roughness: 0.07 },
  rubber: { color: 0x15181b, metalness: 0.02, roughness: 0.86, roughMap: 'micro', repeat: [2, 2] },
  rubberSeal: { color: 0x1b1f23, metalness: 0.03, roughness: 0.72, clearcoat: 0.25, clearcoatRoughness: 0.6 },
  polymer: { color: 0x1c242b, metalness: 0.05, roughness: 0.52 },
  brass: { color: 0xa78a4c, metalness: 1.0, roughness: 0.3 },
  chequer: { color: 0x4c5257, metalness: 0.55, roughness: 0.6, map: 'checker', repeat: [10, 18], roughMap: 'noise', repeatR: [6, 10] },
  hull: { color: 0x3d4d57, metalness: 0.22, roughness: 0.62, clearcoat: 0.25, map: 'grime', repeat: [4, 4] },
  hullWet: { color: 0x1f2c34, metalness: 0.75, roughness: 0.34, clearcoat: 0.9, clearcoatRoughness: 0.18, map: 'wet', repeat: [3, 3] },
  pipeFuel: { color: 0x8a4a2e, metalness: 0.6, roughness: 0.42 },
  pipeLO: { color: 0xa08a34, metalness: 0.6, roughness: 0.42 },
  pipeSW: { color: 0x27596e, metalness: 0.6, roughness: 0.42 },
  pipeFW: { color: 0x2f6b50, metalness: 0.6, roughness: 0.42 },
  pipeAir: { color: 0xc3c8cd, metalness: 0.7, roughness: 0.36 },
  pipeExhaust: { color: 0x8a8b82, metalness: 0.34, roughness: 0.66, map: 'grime', repeat: [3, 3] },
  lagging: { color: 0x8b8779, metalness: 0.2, roughness: 0.9, roughMap: 'micro', repeat: [4, 4] },
  glass: { color: 0x0d2b33, metalness: 0.2, roughness: 0.06, transparent: true, opacity: 0.35, clearcoat: 1 },
  emissiveWarm: { color: 0xffd9a8, emissive: 0xffb066, emissiveIntensity: 1.3, roughness: 0.4 },
  emissiveCyan: { color: 0x9fe9ff, emissive: 0x49d4ff, emissiveIntensity: 1.25, roughness: 0.3 },
  emissiveRed: { color: 0xffb4a0, emissive: 0xff3b2f, emissiveIntensity: 1.2, roughness: 0.4 },
  emissiveGreen: { color: 0xa8ffcf, emissive: 0x25d366, emissiveIntensity: 1.2, roughness: 0.4 },
  flame: { color: 0xffa14a, emissive: 0xff6a1e, emissiveIntensity: 2.6, transparent: true, opacity: 0.85, roughness: 0.5 },
  oilGlow: { color: 0xffc46b, emissive: 0xff9b2f, emissiveIntensity: 1.6, transparent: true, opacity: 0.55 },
  waterGlow: { color: 0x7fd8f5, emissive: 0x2fa8cf, emissiveIntensity: 1.4, transparent: true, opacity: 0.42 },
  cable: { color: 0x1a1d20, metalness: 0.1, roughness: 0.8 },
  paintedWhite: { color: 0xa7aeb3, metalness: 0.2, roughness: 0.56, map: 'grime', repeat: [1, 1] },
  paintedYellow: { color: 0x8f6f24, metalness: 0.25, roughness: 0.55 },
  steelDark: { color: 0x5b636a, metalness: 0.9, roughness: 0.5 },
};

export class MaterialLibrary {
  constructor(tex) {
    this.tex = tex;
  }

  get(key = 'castIron') {
    const d = DEFS[key] || DEFS.castIron;
    const isPhysical = d.clearcoat !== undefined || d.transmission !== undefined;
    const params = {
      color: d.color,
      metalness: d.metalness ?? 0,
      roughness: d.roughness ?? 0.5,
      envMapIntensity: 1.0,
    };
    if (d.emissive !== undefined) {
      params.emissive = new THREE.Color(d.emissive);
      params.emissiveIntensity = d.emissiveIntensity ?? 1;
    }
    if (d.transparent) { params.transparent = true; params.opacity = d.opacity; }
    if (isPhysical) {
      params.clearcoat = d.clearcoat ?? 0;
      params.clearcoatRoughness = d.clearcoatRoughness ?? 0.3;
    }
    if (d.map && this.tex[d.map]) {
      const t = this.tex[d.map].clone();
      t.needsUpdate = true;
      t.repeat.set(d.repeat?.[0] ?? 1, d.repeat?.[1] ?? 1);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      params.map = t;
    }
    if (d.roughMap && this.tex[d.roughMap]) {
      const t = this.tex[d.roughMap].clone();
      t.needsUpdate = true;
      t.repeat.set(d.repeatR?.[0] ?? d.repeat?.[0] ?? 2, d.repeatR?.[1] ?? d.repeat?.[1] ?? 2);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.NoColorSpace;
      params.roughnessMap = t;
    }
    return isPhysical ? new THREE.MeshPhysicalMaterial(params) : new THREE.MeshStandardMaterial(params);
  }

  keys() { return Object.keys(DEFS); }
}
