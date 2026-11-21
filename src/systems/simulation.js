import * as THREE from 'three';
import { ENGINE, crankKinematics } from '../assemblies/diesel.js';
import { clamp, damp, lerp } from '../core/utils.js';

const TELEGRAPH = [
  { name: 'STOP', rpm: 0, pitch: 22, cn: '停车' },
  { name: 'DEAD SLOW AHEAD', rpm: 18, pitch: 30, cn: '微速前进' },
  { name: 'SLOW AHEAD', rpm: 32, pitch: 52, cn: '慢速前进' },
  { name: 'HALF AHEAD', rpm: 52, pitch: 74, cn: '半速前进' },
  { name: 'FULL AHEAD', rpm: 76, pitch: 100, cn: '全速前进' },
  { name: 'DEAD SLOW ASTERN', rpm: -20, pitch: -42, cn: '微速后退' },
  { name: 'SLOW ASTERN', rpm: -32, pitch: -68, cn: '慢速后退' },
  { name: 'FULL ASTERN', rpm: -46, pitch: -100, cn: '全速后退' },
];

const GT_STEPS = [
  { label: '待机', dur: 0.5, speed: 0.0, out: 0.0, flame: 0 },
  { label: '起动机带转高压转子', dur: 2.6, speed: 0.24, out: 0.0, flame: 0 },
  { label: '点火器打火', dur: 1.4, speed: 0.3, out: 0.0, flame: 0.15 },
  { label: '燃油喷嘴分区供油 · 火焰建立', dur: 2.2, speed: 0.44, out: 0.0, flame: 1.0 },
  { label: '高压涡轮自持', dur: 2.4, speed: 0.72, out: 0.05, flame: 1.0 },
  { label: '动力涡轮接入 · 输出扭矩', dur: 2.4, speed: 0.9, out: 0.55, flame: 1.0 },
  { label: '加速至全功率', dur: 3.2, speed: 1.0, out: 1.0, flame: 1.0 },
];

export class Simulation {
  constructor({ reg, diesel, cpp, shaft, gt, explode }) {
    this.reg = reg;
    this.d = diesel.refs;
    this.cpp = cpp;
    this.shaft = shaft;
    this.gtRefs = gt;
    this.explode = explode;

    this.state = {
      config: 'diesel',
      propulsor: 'cpp',
      telegraph: 0,
      telegraphName: TELEGRAPH[0].cn,
      rpm: 0,
      pitch: 62,
      pitchDeg: 0,
      thrust: 0,
      running: false,
      brake: false,
      grease: 0,
      xray: false,
      flow: false,
      section: 'off',
      isolateId: null,
      gtStarted: false,
      gtStep: 0,
      gtLabel: '待机',
      gtSpeed: 0,
      gtOut: 0,
      gtFlame: 0,
      igv: 0,
      pumps: { lo: true, sw: true, fw: true, vent: true },
      oilFilm: 0,
      seaP: 0.08,
      loP: 0.16,
    };
    this.angle = 0;
    this.shaftAngle = 0;
    this.turboAngle = 0;
    this.gtAngle = 0;
    this.ptAngle = 0;
    this.time = 0;
    this.gtTimer = 0;
    this.gtTarget = 0;
    this.alarm = '';
    this._bindMaterials();
  }

  _bindMaterials() {
    this.sealMats = [];
    this.reg.parts.filter((p) => p.id.startsWith('stern-seal-')).forEach((p) => p.mats.forEach((m) => this.sealMats.push(m)));
    this.oilFilmMats = [];
    const of = this.reg.get('thrust-oil-film');
    if (of) of.mats.forEach((m) => this.oilFilmMats.push(m));
    this.seaMats = [];
    const sw = this.reg.get('stern-seawater-chamber');
    if (sw) sw.mats.forEach((m) => this.seaMats.push(m));
  }

  get order() { return TELEGRAPH[this.state.telegraph]; }

  setTelegraph(i) {
    this.state.telegraph = clamp(i, 0, TELEGRAPH.length - 1);
    this.state.telegraphName = TELEGRAPH[this.state.telegraph].cn;
    if (this.state.config === 'gas' && !this.state.gtStarted && i > 0) this.startGT();
  }

  setPitch(v) {
    this.state.pitch = clamp(v, -100, 100);
  }

  setConfig(c) {
    this.state.config = c;
    if (c === 'gas' && !this.state.gtStarted) this.startGT();
  }

  setPropulsor(p) { this.state.propulsor = p; }

  startGT() {
    this.state.gtStarted = true;
    this.state.gtStep = 1;
    this.gtTimer = 0;
    this.state.gtLabel = GT_STEPS[1].label;
  }

  stopGT() {
    this.state.gtStarted = false;
    this.state.gtStep = 0;
    this.state.gtLabel = '停车';
    this.gtTarget = 0;
  }

  emergencyStop() {
    this.state.telegraph = 0;
    this.state.telegraphName = '应急停车';
    this.state.pitch = 0;
    this.state.alarm = 'EMERGENCY STOP';
    this.state.brake = true;
    this.state.gtStarted = false;
    this.state.gtStep = 0;
  }

  toggleBrake(v) {
    this.state.brake = v === undefined ? !this.state.brake : v;
    if (this.state.brake) this.state.telegraph = 0;
  }

  grease() { this.state.grease = 1; }

  stepGT() {
    if (!this.state.gtStarted) return this.startGT();
    if (this.state.gtStep < GT_STEPS.length - 1) {
      this.state.gtStep++;
      this.gtTimer = 0;
      this.state.gtLabel = GT_STEPS[this.state.gtStep].label;
    }
  }

  readouts() {
    const s = this.state;
    return {
      rpm: s.rpm,
      pitch: s.pitch,
      pitchDeg: s.pitchDeg,
      thrust: s.thrust,
      order: s.telegraphName,
      gtLabel: s.gtLabel,
      gtSpeed: s.gtSpeed,
      gtOut: s.gtOut,
      loP: s.loP,
      seaP: s.seaP,
      oilFilm: s.oilFilm,
      crank: ((this.angle * 180 / Math.PI) % 360 + 360) % 360,
    };
  }

  /**
   * 把整条运动链钉到确定性参考位姿，返回恢复函数。
   *
   * 几何审计必须可复现：若审计直接读「仿真恰好跑到哪一帧」的位姿，
   * 同一个模型两次跑出的干涉清单会不同（连杆摆角、桨叶方位角、螺距都在变），
   * 报告就无法作为门禁。这里以 dt=0 走一遍 update()，
   * 让所有 animPos / animRot 由固定角度重新导出，而不改动工作状态。
   */
  setReferencePose(crankDeg = 0) {
    const save = {
      angle: this.angle,
      shaftAngle: this.shaftAngle,
      turboAngle: this.turboAngle,
      gtAngle: this.gtAngle,
      ptAngle: this.ptAngle,
    };
    this.angle = (crankDeg * Math.PI) / 180;
    this.shaftAngle = 0;
    this.turboAngle = 0;
    this.gtAngle = 0;
    this.ptAngle = 0;
    this.update(0);
    return () => {
      Object.assign(this, save);
      this.update(0);
    };
  }

  update(dt) {
    this.time += dt;
    const s = this.state;
    const gasMode = s.config === 'gas';

    /* ---------- 燃气轮机时序 ---------- */
    if (s.gtStarted) {
      const step = GT_STEPS[s.gtStep];
      this.gtTimer += dt;
      if (this.gtTimer > step.dur && s.gtStep < GT_STEPS.length - 1) {
        s.gtStep++;
        this.gtTimer = 0;
        s.gtLabel = GT_STEPS[s.gtStep].label;
      }
      const cur = GT_STEPS[s.gtStep];
      this.gtTarget = cur.speed;
      s.gtFlame = damp(s.gtFlame, cur.flame, 2.2, dt);
      this.gtTargetOut = cur.out;
      s.gtLabel = cur.label;
    } else {
      this.gtTarget = 0;
      this.gtTargetOut = 0;
      s.gtFlame = damp(s.gtFlame, 0, 1.6, dt);
    }
    s.gtSpeed = damp(s.gtSpeed, this.gtTarget, 0.9, dt);
    s.gtOut = damp(s.gtOut, this.gtTargetOut || 0, 0.8, dt);

    /* ---------- 转速 / 螺距 ---------- */
    const ord = this.order;
    let rpmTarget = ord.rpm;
    if (gasMode) {
      rpmTarget = s.telegraph > 4 ? -Math.abs(s.gtOut * 58) : Math.abs(s.gtOut * 74);
    }
    if (s.brake) rpmTarget = 0;
    if (gasMode && !s.gtStarted) rpmTarget = 0;
    s.rpm = damp(s.rpm, rpmTarget, 0.55, dt);
    if (Math.abs(s.rpm) < 0.05) s.rpm = 0;
    s.running = Math.abs(s.rpm) > 0.5;

    let pitchTarget = ord.pitch;
    if (s.propulsor === 'fpp') pitchTarget = s.telegraph > 4 ? -100 : 100;
    if (s.propulsor === 'cpp' && s.telegraph === 0 && Math.abs(s.rpm) < 1) pitchTarget = 22;
    s.pitch = damp(s.pitch, pitchTarget, 1.4, dt);
    s.pitchDeg = (s.pitch / 100) * 32;
    s.thrust = (s.rpm / 76) * (Math.abs(s.pitch) / 100) * 100 * Math.sign(s.pitch || s.rpm) * Math.sign(s.rpm || 1);

    if (s.brake) {
      s.rpm = damp(s.rpm, 0, 4, dt);
      this.shaftAngle = this.shaftAngle; // 锁止
    }

    this.angle += (s.rpm / 60) * Math.PI * 2 * dt * 1.0;
    this.shaftAngle -= (s.rpm / 60) * Math.PI * 2 * dt;
    this.turboAngle += (0.3 + Math.abs(s.rpm) / 50) * dt * 26;
    this.gtAngle += s.gtSpeed * dt * 34;
    this.ptAngle += (s.gtOut * 0.9 + s.gtSpeed * 0.25) * dt * 22;

    /* ---------- 柴油机运动链 ---------- */
    const crankRot = -this.angle;
    if (this.d.crank) this.d.crank.animRot.z = crankRot;
    if (this.d.flywheel) this.d.flywheel.animRot.z = crankRot;
    if (this.d.cam) this.d.cam.animRot.z = -this.angle / 2;
    if (this.d.turboRotor) this.d.turboRotor.animRot.z = this.turboAngle;

    const load = clamp(Math.abs(s.rpm) / 76, 0, 1);
    for (let i = 0; i < 6; i++) {
      const k = crankKinematics(this.angle, i);
      const p = this.d.pistons[i];
      const ch = this.d.crossheads[i];
      const rod = this.d.rods[i];
      if (p) p.animPos.y = k.crossY + ENGINE.pistonOffset - 5.55;
      if (ch) ch.animPos.y = k.crossY - 4.6;
      if (rod) {
        rod.animPos.x = k.xPin / 2;
        rod.animPos.y = (k.crossY + k.yPin) / 2 - 3.7;
        rod.animRot.z = k.rodAngle;
      }
      const lift = this.valveLift(this.angle + (i * Math.PI) / 3);
      const v = this.d.valves[i];
      if (v) v.animPos.y = -lift * 0.22;
      const rocker = this.d.rockers[i];
      if (rocker) rocker.animPos.y = -lift * 0.04;
      // 燃烧
      const theta = ((this.angle + (i * Math.PI) / 3) * 180 / Math.PI) % 360;
      const deg = (theta + 360) % 360;
      const burn = deg < 75 ? Math.sin((deg / 75) * Math.PI) : 0;
      const fire = this.firingEnabled && this.firingEnabled[i] === false ? 0 : 1;
      const cm = this.d.combustion[i];
      if (cm) {
        const mm = cm.material;
        mm.emissiveIntensity = burn * fire * (0.6 + load * 2.6);
        mm.opacity = burn * fire * 0.62;
        cm.scale.setScalar(0.7 + burn * 0.35);
      }
      // 喷油：上止点前 10° 到后 8°
      const injecting = (deg > 350 || deg < 8) && Math.abs(s.rpm) > 1 && fire;
      const needle = this.d.needles[i];
      if (needle) needle.position.y = -0.3 + (injecting ? 0.022 : 0);
      const rack = this.d.racks[i];
      if (rack) rack.position.x = (load - 0.25) * 0.09;
      const plunger = this.d.plungers[i];
      if (plunger) plunger.position.y = 0.62 + Math.sin(this.angle + i) * 0.01 * load;
    }

    /* ---------- 螺旋桨 / 轴系 ---------- */
    const spin = this.shaftAngle;
    const cppRefs = this.cpp;
    if (cppRefs.hub) cppRefs.hub.animRot.z = spin;
    const pitchRad = (s.pitch / 100) * 0.56;
    cppRefs.blades.forEach((b, i) => {
      const az = Math.PI / 4 + (i * Math.PI) / 2;
      b.animRot.set(0, pitchRad, spin + az);
    });
    cppRefs.fppBlades.forEach((b, i) => {
      const az = Math.PI / 4 + 0.1 + (i * Math.PI) / 2;
      b.animRot.set(0, 0, spin + az);
    });
    if (cppRefs.duct) cppRefs.duct.animRot.set(0, 0, 0);
    if (cppRefs.servo) cppRefs.servo.animPos.z = -s.pitch * 0.0026;
    if (cppRefs.crankRing) cppRefs.crankRing.animRot.z = pitchRad * 0.55;
    if (cppRefs.linkDisc) cppRefs.linkDisc.animRot.z = pitchRad * 0.55;
    if (cppRefs.slider) cppRefs.slider.animPos.z = -s.pitch * 0.0018;
    if (cppRefs.oilA) {
      const a = clamp(s.pitch / 100, 0, 1);
      cppRefs.oilA.mats.forEach((m) => { m.opacity = 0.15 + a * 0.65; m.emissiveIntensity = 0.4 + a * 1.8; });
    }
    if (cppRefs.oilB) {
      const a = clamp(-s.pitch / 100, 0, 1);
      cppRefs.oilB.mats.forEach((m) => { m.opacity = 0.12 + a * 0.65; m.emissiveIntensity = 0.35 + a * 1.8; });
    }
    if (cppRefs.sensor) cppRefs.sensor.animRot.z = pitchRad * 2.2;

    for (const p of this.shaft.rotating) p.animRot.z = spin;
    if (this.shaft.brake) this.shaft.brake.animRot.z = spin;
    if (this.shaft.oilRing) this.shaft.oilRing.animRot.z = spin * 0.35;
    if (this.shaft.caliper) {
      const t = s.brake ? 1 : 0;
      this.shaft.caliper.animPos.y = damp(this.shaft.caliper.animPos.y, -0.16 * t, 6, dt);
    }
    s.oilFilm = damp(s.oilFilm, Math.abs(s.rpm) > 1 ? 0.55 + 0.45 * load : 0.02, 2, dt);
    this.oilFilmMats.forEach((m) => {
      m.emissiveIntensity = 0.25 + s.oilFilm * 2.6;
      m.opacity = 0.18 + s.oilFilm * 0.5;
    });

    /* ---------- 密封 / 压力平衡 ---------- */
    s.grease = Math.max(0, s.grease - dt * 0.45);
    const grease = s.grease;
    this.sealMats.forEach((m) => {
      if (!m.emissive) return;
      m.emissive.setHex(0xffb066);
      m.emissiveIntensity = grease * 1.2;
    });
    s.seaP = 0.06 + Math.abs(s.rpm) / 760;
    s.loP = 0.12 + Math.abs(s.rpm) / 520;
    this.seaMats.forEach((m) => {
      m.emissiveIntensity = 0.6 + Math.abs(s.rpm) / 60;
      m.opacity = 0.3 + Math.sin(this.time * 2) * 0.05;
    });

    /* ---------- 燃气轮机 ---------- */
    if (this.gtRefs.hpRotor) this.gtRefs.hpRotor.animRot.z = this.gtAngle;
    if (this.gtRefs.ptRotor) this.gtRefs.ptRotor.animRot.z = this.ptAngle;
    if (this.gtRefs.output) this.gtRefs.output.animRot.z = this.ptAngle;
    const flame = s.gtFlame;
    this.gtRefs.flames.forEach((m, i) => {
      m.emissiveIntensity = flame * (2.5 + Math.sin(this.time * 9 + i) * 0.35) * (0.35 + s.gtSpeed);
      m.opacity = flame * 0.85;
    });
    this.gtRefs.igniters.forEach((m) => {
      const spark = s.gtStep === 2 ? (Math.sin(this.time * 22) > 0.7 ? 4 : 0.4) : 0;
      m.emissiveIntensity = spark;
    });
    const igvAngle = (1 - s.gtSpeed) * 0.45 - 0.15;
    this.gtRefs.igv.forEach((v) => { v.rotation.y = damp(v.rotation.y, igvAngle, 3, dt); });

    /* ---------- 收尾：应用变换 ---------- */
    this.reg.applyAll();
  }

  valveLift(theta) {
    const deg = ((theta * 180 / Math.PI) % 360 + 360) % 360;
    if (deg < 110 || deg > 250) return 0;
    const t = (deg - 110) / 140;
    return Math.pow(Math.sin(Math.PI * t), 1.3);
  }

  setCylinderFiring(i, on) {
    if (!this.firingEnabled) this.firingEnabled = [true, true, true, true, true, true];
    this.firingEnabled[i] = on;
  }
}

export { TELEGRAPH, GT_STEPS };
