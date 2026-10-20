/**
 * 天穹：一个着色器球壳同时充当可见天空与环境光来源（PRD FR-3D-03 的
 * "天空渐变 / 环境反射贴图 / 雾色必须整体切换"）。
 *
 * 做法：天空只由 uniforms 描述 → 切换昼夜就是切 uniforms →
 * 用 PMREMGenerator.fromScene 预生成两张环境贴图，运行时直接换，
 * 因此不存在"换到一半贴图丢失"的中间态。
 */
import * as THREE from 'three';
import { PALETTE } from '../config.js';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;

uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uCloudColor;
uniform float uSunAngle;
uniform float uSunGlow;
uniform float uCloud;
uniform float uStar;
uniform float uHaze;
uniform float uTime;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + 17.0;
    a *= 0.5;
  }
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;

  // 垂直渐变：顶 → 地平 → 地面反照
  vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.52));
  col = mix(col, uBottom, pow(clamp(-h, 0.0, 1.0), 0.42));

  // 地平线附近的大气增亮
  col += uSunColor * 0.016 * exp(-abs(h) * 22.0) * uHaze;

  // 星空（只在地平线以上，按天球网格散开）
  if (uStar > 0.001) {
    vec2 sp = vec2(atan(d.z, d.x) * 6.0, asin(clamp(h, -1.0, 1.0)) * 6.0);
    vec2 cell = floor(sp * 14.0);
    float r = hash(cell);
    float tw = 0.65 + 0.35 * sin(uTime * 1.7 + r * 40.0);
    float star = smoothstep(0.9965, 1.0, r) * tw;
    star += smoothstep(0.9992, 1.0, hash(cell * 1.7)) * 0.8;
    col += vec3(0.85, 0.9, 1.0) * star * uStar * smoothstep(-0.02, 0.16, h);
  }

  // 云层：把方向投影到一张高空平面
  float cover = 0.0;
  if (uCloud > 0.001) {
    vec2 cp = d.xz / max(abs(d.y), 0.075) * 0.5;
    float n = fbm(cp * 1.15 + vec2(uTime * 0.0035, uTime * 0.0012));
    cover = smoothstep(0.44, 0.78, n) * smoothstep(0.0, 0.2, h) * uCloud;
    float shade = fbm(cp * 2.6 + 3.0);
    vec3 cloudCol = uCloudColor * (0.72 + shade * 0.55);
    col = mix(col, cloudCol, clamp(cover, 0.0, 1.0) * 0.92);
  }

  // 日面 / 月面
  float cd = dot(d, normalize(uSunDir));
  float ang = acos(clamp(cd, -1.0, 1.0));
  float disc = 1.0 - smoothstep(uSunAngle * 0.92, uSunAngle * 1.08, ang);
  float glow = pow(max(cd, 0.0), 90.0) * 0.55 + pow(max(cd, 0.0), 7.0) * 0.16;
  col += uSunColor * (disc * 12.0 + glow * uSunGlow) * (1.0 - cover * 0.72);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Sky {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTop: { value: new THREE.Color(PALETTE.skyDayTop) },
        uHorizon: { value: new THREE.Color(PALETTE.skyDayHorizon) },
        uBottom: { value: new THREE.Color(PALETTE.skyDayBottom) },
        uSunColor: { value: new THREE.Color(PALETTE.sunDay) },
        uSunDir: { value: new THREE.Vector3(0.3, 0.6, 0.4).normalize() },
        uCloudColor: { value: new THREE.Color(0xffffff) },
        uSunAngle: { value: 0.012 },
        uSunGlow: { value: 1.0 },
        uCloud: { value: 0.55 },
        uStar: { value: 0.0 },
        uHaze: { value: 1.0 },
        uTime: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      // 必须是 true。ShaderMaterial 的 <tonemapping_fragment> 只在 TONE_MAPPING
      // 宏存在时展开，而宏由 material.toneMapped 决定；设成 false 会让下面那行
      // include 变成死代码——天空既不参与 ACES 也不吃 exposure，于是与经过
      // 色调映射的雾色在地平线处对不上（实测曝光 0.95→0.2 天空像素完全不变）。
      toneMapped: true,
    });

    const geo = new THREE.SphereGeometry(3000, 48, 32);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;

    // 专供 IBL 的极简场景
    this.envScene = new THREE.Scene();
    const envMesh = new THREE.Mesh(geo, this.material);
    this.envScene.add(envMesh);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTargets = {};
    this.quality = quality;
  }

  /** 按昼夜切换 uniforms（平滑过渡由三处光照模块统一调度）。 */
  applyState(s) {
    const u = this.material.uniforms;
    u.uTop.value.copy(s.skyTop);
    u.uHorizon.value.copy(s.skyHorizon);
    u.uBottom.value.copy(s.skyBottom);
    u.uSunColor.value.copy(s.sunColor);
    u.uSunDir.value.copy(s.sunDir);
    u.uCloudColor.value.copy(s.cloudColor);
    u.uSunAngle.value = s.sunAngle;
    u.uSunGlow.value = s.sunGlow;
    u.uCloud.value = s.cloud;
    u.uStar.value = s.stars;
    u.uHaze.value = s.haze;
  }

  /** 由当前 uniforms 烘一张 PMREM 环境贴图。 */
  bake(key) {
    const rt = this.pmrem.fromScene(this.envScene, 0, 1, 12000);
    if (this.envTargets[key]) this.envTargets[key].dispose();
    this.envTargets[key] = rt;
    return rt.texture;
  }

  update(t) {
    this.material.uniforms.uTime.value = t;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    Object.values(this.envTargets).forEach((r) => r.dispose());
    this.pmrem.dispose();
  }
}
