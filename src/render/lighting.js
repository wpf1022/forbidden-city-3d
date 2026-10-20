/**
 * 光照与昼夜状态。
 *
 * PRD FR-3D-03：太阳/月光方向、天空渐变、雾色、环境反射贴图、灯笼点光、
 * 曝光值必须整体切换，不允许状态错配。这里把六个量打包成一份 state，
 * 切换时在一份 state 上插值，环境贴图在中点交换（两张都已预生成）。
 */
import * as THREE from 'three';
import { PALETTE, WORLD, CAMERA } from '../config.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const col = (h) => new THREE.Color(h);

/** 两个状态之间线性插值用的小工具。 */
const mix = (a, b, t) => a + (b - a) * t;

export const DAY_STATE = {
  name: 'day',
  sunDir: v3(-0.42, 0.62, 0.662),
  sunColor: col(0xffe3b4),
  sunIntensity: 3.25,
  hemiSky: col(0x9dc4e8),
  hemiGround: col(0x6a5f4e),
  hemiIntensity: 0.34,
  fillColor: col(0x9dbedd),
  fillIntensity: 0.3,
  envIntensity: 0.86,
  exposure: 0.95,
  fogColor: col(0x93aec8),
  fogDensity: 0.00058,
  skyTop: col(0x0f4f9c),
  skyHorizon: col(0x93aec8),
  skyBottom: col(0x7d7365),
  cloudColor: col(0xfbf7ef),
  cloud: 0.85,
  stars: 0.0,
  sunAngle: 0.0135,
  sunGlow: 1.0,
  haze: 1.0,
  lampIntensity: 0.0,
  doorGlow: 0.03,
  lanternGlow: 0.0,
  shadowOpacity: 1.0,
};

export const NIGHT_STATE = {
  name: 'night',
  // 月光必须真的换一个方位：原来 (-0.32,0.62,0.72) 与日间 (-0.42,0.62,0.662)
  // 只差 7.2°，夜间影子落在与白天几乎相同的位置，等于没切。
  sunDir: v3(0.48, 0.38, -0.79),
  sunColor: col(0xa7c0ea),
  sunIntensity: 0.62,
  hemiSky: col(0x101c33),
  hemiGround: col(0x0a0b10),
  hemiIntensity: 0.16,
  fillColor: col(0x2a3c5c),
  fillIntensity: 0.1,
  envIntensity: 1.55,
  exposure: 1.32,
  fogColor: col(0x17263f),
  fogDensity: WORLD.fogDensityNight,
  skyTop: col(0x050a16),
  skyHorizon: col(0x17263f),
  skyBottom: col(0x090b10),
  cloudColor: col(0x2a3550),
  cloud: 0.34,
  stars: 1.0,
  sunAngle: 0.0165,
  sunGlow: 0.7,
  haze: 0.55,
  lampIntensity: 1.0,
  doorGlow: 0.95,
  lanternGlow: 1.0,
  shadowOpacity: 0.55,
};

/** 目标值 = 两状态混合结果；用于逐帧平滑。 */
class BlendedState {
  constructor(a, b) {
    this.a = a;
    this.b = b;
    this.sunDir = new THREE.Vector3();
    this.sunColor = new THREE.Color();
    this.hemiSky = new THREE.Color();
    this.hemiGround = new THREE.Color();
    this.fillColor = new THREE.Color();
    this.fogColor = new THREE.Color();
    this.skyTop = new THREE.Color();
    this.skyHorizon = new THREE.Color();
    this.skyBottom = new THREE.Color();
    this.cloudColor = new THREE.Color();
    this.t = 0;
    this.apply(0);
  }

  apply(t) {
    this.t = t;
    const { a, b } = this;
    const L = (key) => mix(a[key], b[key], t);
    this.sunDir.copy(a.sunDir).lerp(b.sunDir, t).normalize();
    this.sunColor.copy(a.sunColor).lerp(b.sunColor, t);
    this.hemiSky.copy(a.hemiSky).lerp(b.hemiSky, t);
    this.hemiGround.copy(a.hemiGround).lerp(b.hemiGround, t);
    this.fillColor.copy(a.fillColor).lerp(b.fillColor, t);
    this.fogColor.copy(a.fogColor).lerp(b.fogColor, t);
    this.skyTop.copy(a.skyTop).lerp(b.skyTop, t);
    this.skyHorizon.copy(a.skyHorizon).lerp(b.skyHorizon, t);
    this.skyBottom.copy(a.skyBottom).lerp(b.skyBottom, t);
    this.cloudColor.copy(a.cloudColor).lerp(b.cloudColor, t);
    this.sunIntensity = L('sunIntensity');
    this.hemiIntensity = L('hemiIntensity');
    this.fillIntensity = L('fillIntensity');
    this.envIntensity = L('envIntensity');
    this.exposure = L('exposure');
    this.fogDensity = L('fogDensity');
    this.cloud = L('cloud');
    this.stars = L('stars');
    this.sunAngle = L('sunAngle');
    this.sunGlow = L('sunGlow');
    this.haze = L('haze');
    this.lampIntensity = L('lampIntensity');
    this.doorGlow = L('doorGlow');
    this.lanternGlow = L('lanternGlow');
    return this;
  }
}

export class Lighting {
  constructor(scene, renderer, sky, materials, quality, lampPositions = []) {
    this.scene = scene;
    this.renderer = renderer;
    this.sky = sky;
    this.materials = materials;

    scene.fog = new THREE.FogExp2(PALETTE.fogDay, WORLD.fogDensityDay);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    // bias 作用在 [0,1] 的归一化深度上，所以它必须和 near/far 跨度一起看：
    // 跨度 730 时 -0.0012 相当于 0.88 m 的深度宽容，会吃掉望柱(1.3 m)与斗拱(1 m)
    // 的接触阴影。把跨度收到 160 后，-0.0002 只有约 3 cm。
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.1;
    // radius / blurSamples 只在 PCF / VSM 下生效，PCFSoftShadowMap 用固定核，
    // 留着是死配置，删掉避免误导。
    const cam = this.sun.shadow.camera;
    // 横向 ±230 → 3072² 下横向 0.15 m/texel；纵向只需覆盖 ~45 m 高的建筑，±70 足够
    // （原来是 ±300，竖着罩了 764 m 世界空间，87% 的分辨率在空转）。
    cam.left = -230;
    cam.right = 230;
    cam.top = 70;
    cam.bottom = -70;
    cam.near = 680;
    cam.far = 840;
    cam.updateProjectionMatrix();
    this.sun.target.position.set(0, 0, 12);
    scene.add(this.sun);
    scene.add(this.sun.target);
    this._shadowTexel = (cam.right - cam.left) / quality.shadowMapSize;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
    scene.add(this.hemi);

    this.fill = new THREE.DirectionalLight(0xffffff, 0.3);
    this.fill.castShadow = false;
    scene.add(this.fill);

    this.lamps = lampPositions.map((p) => {
      const l = new THREE.PointLight(0xffa04a, 0, 46, 1.7);
      l.position.copy(p);
      scene.add(l);
      return l;
    });

    this.blend = new BlendedState(DAY_STATE, NIGHT_STATE);
    this.target = 0;
    this.current = 0;
    this.envTextures = {};
    this.appliedEnv = null;
  }

  /** 预生成两张环境贴图（切换时零成本）。 */
  bake() {
    this.sky.applyState(DAY_STATE);
    this.envTextures.day = this.sky.bake('day');
    this.sky.applyState(NIGHT_STATE);
    this.envTextures.night = this.sky.bake('night');
  }

  setNight(on, instant = false) {
    this.target = on ? 1 : 0;
    if (instant) this.current = this.target;
  }

  update(dt, focus = null) {
    // 昼夜过渡：约 0.55s 完成
    const speed = 1 / 0.55;
    const d = this.target - this.current;
    if (Math.abs(d) > 1e-4) {
      this.current += Math.sign(d) * Math.min(Math.abs(d), speed * dt);
    } else {
      this.current = this.target;
    }

    const s = this.blend.apply(this.current);
    this.sky.applyState(s);

    const r = this.renderer;
    r.toneMappingExposure = s.exposure;
    this.scene.fog.color.copy(s.fogColor);
    this.scene.fog.density = s.fogDensity;
    this.scene.environmentIntensity = s.envIntensity;

    // 阴影框跟随视点，保证默认视角附近的投影分辨率。
    // 取整必须按"纹素"来：原来按 2 世界单位取整，在 0.15 m/texel 下等于
    // 每次跳 13 个纹素 → 拖拽时全场景阴影周期性整体弹跳。
    if (focus) {
      const texel = this._shadowTexel;
      const fx = Math.round(focus.x / texel) * texel;
      const fy = Math.round(Math.min(60, Math.max(0, focus.y)) / texel) * texel;
      const fz = Math.round(focus.z / texel) * texel;
      const t = this.sun.target.position;
      if (Math.abs(t.x - fx) > 1e-6 || Math.abs(t.y - fy) > 1e-6 || Math.abs(t.z - fz) > 1e-6) {
        t.set(fx, fy, fz);
      }
    }

    this.sun.position.copy(s.sunDir).multiplyScalar(760).add(this.sun.target.position);
    this.sun.color.copy(s.sunColor);
    this.sun.intensity = s.sunIntensity;

    this.hemi.color.copy(s.hemiSky);
    this.hemi.groundColor.copy(s.hemiGround);
    this.hemi.intensity = s.hemiIntensity;

    // 补光来自背光侧，压住暗部死黑
    this.fill.position.copy(s.sunDir).multiplyScalar(-520).setY(320);
    this.fill.color.copy(s.fillColor);
    this.fill.intensity = s.fillIntensity;

    // 环境贴图在中点交换，两侧都已预烘，不会出现空帧
    const env = this.current < 0.5 ? this.envTextures.day : this.envTextures.night;
    if (env && this.scene.environment !== env) {
      this.scene.environment = env;
    }

    for (const l of this.lamps) l.intensity = 46 * s.lampIntensity;

    const m = this.materials;
    m.door.emissiveIntensity = s.doorGlow;
    m.lantern.emissiveIntensity = 0.35 + s.lanternGlow * 3.2;

    return s;
  }
}
