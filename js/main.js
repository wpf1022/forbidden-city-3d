import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

import {
  createRoofTileTexture,
  createWallTexture,
  createMarbleTexture,
  createStoneTexture,
  createLatticeTexture,
  createSkyTexture,
} from './textures.js';

import {
  createTerrace,
  createGrandHall,
  createSquareHall,
  createGate,
  createOrnamentalColumn,
} from './palace.js';

import {
  createPlaza,
  createWaterChannel,
  createArchBridge,
  createWall,
} from './ground.js';

/* ================================================================
   基础环境
   ================================================================ */
const app = document.getElementById('app');
const IS_SHOT = new URLSearchParams(location.search).has('shot');

// ?hud=0 —— 隐藏界面元素，用于导出干净的宣传图
if (new URLSearchParams(location.search).get('hud') === '0') {
  for (const sel of ['#hud-top', '#hud-panel', '#hud-foot']) {
    const el = document.querySelector(sel);
    if (el) el.style.display = 'none';
  }
}

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'fixed';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
labelRenderer.domElement.style.zIndex = '5';
app.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xdfd4bb, 430, 1500);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.5,
  3000
);
const VIEWS = {
  a: { pos: [58, 58, 118], target: [0, 17, -20] },
  b: { pos: [0, 92, 268], target: [0, 22, -24] },
  c: { pos: [176, 138, 336], target: [0, 18, -20] },
  d: { pos: [-92, 60, 128], target: [0, 16, -26] },
  // 竖屏构图（3:4 / 9:16 用，相机拉远避免两侧被裁）
  p: { pos: [52, 48, 106], target: [0, 30, -12] },
  pd: { pos: [54, 40, 58], target: [0, 30, -2] },
  pw: { pos: [132, 104, 244], target: [0, 26, -14] },
};
const preset = VIEWS[new URLSearchParams(location.search).get('view')] || VIEWS.a;

const HOME = new THREE.Vector3(preset.pos[0], preset.pos[1], preset.pos[2]);
const TARGET = new THREE.Vector3(preset.target[0], preset.target[1], preset.target[2]);

// ?az=<角度> —— 绕中轴转圈，用于生成转台动画的逐帧素材
const azParam = new URLSearchParams(location.search).get('az');
if (azParam !== null) {
  const rad = (parseFloat(azParam) * Math.PI) / 180;
  const R = 215;
  HOME.set(Math.sin(rad) * R, 92, Math.cos(rad) * R);
  TARGET.set(0, 24, -18);
}
camera.position.copy(HOME);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 25;
controls.maxDistance = 720;
controls.maxPolarAngle = Math.PI * 0.495;
controls.autoRotate = !IS_SHOT;
controls.autoRotateSpeed = 0.28;
controls.update();

/* ================================================================
   天空
   ================================================================ */
const skyTexture = createSkyTexture(false);
const skyGeo = new THREE.SphereGeometry(1400, 32, 20);
const skyMat = new THREE.MeshBasicMaterial({
  map: skyTexture,
  side: THREE.BackSide,
  fog: false,
  depthWrite: false,
});
const skyDome = new THREE.Mesh(skyGeo, skyMat);
scene.add(skyDome);

/* ---------------------------------------------------------------
   用同一套天空渐变生成环境反射贴图（IBL）
   没有它的话，metalness 较高的琉璃瓦和水面会渲染成死黑
   --------------------------------------------------------------- */
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;

function buildEnvironment(night) {
  const src = createSkyTexture(night);
  src.mapping = THREE.EquirectangularReflectionMapping;
  const rt = pmrem.fromEquirectangular(src);
  src.dispose();
  if (envRT) envRT.dispose();
  envRT = rt;
  scene.environment = rt.texture;
}
buildEnvironment(false);

/* ================================================================
   光照
   ================================================================ */
const hemi = new THREE.HemisphereLight(0xbfd4e8, 0x6b5b45, 0.85);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff0d6, 2.4);
sun.position.set(210, 300, 160);
sun.castShadow = true;
sun.shadow.mapSize.set(3072, 3072);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 1200;
sun.shadow.camera.left = -260;
sun.shadow.camera.right = 260;
sun.shadow.camera.top = 300;
sun.shadow.camera.bottom = -260;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 1.2;
scene.add(sun);

const fill = new THREE.DirectionalLight(0xa8c4e0, 0.55);
fill.position.set(-200, 140, -180);
scene.add(fill);

const ambient = new THREE.AmbientLight(0xffffff, 0.22);
scene.add(ambient);

/* 夜间灯笼点光（默认关闭） */
const nightLights = [];
for (const z of [10, -72, -128, 98]) {
  const lamp = new THREE.PointLight(0xffb867, 0, 130, 2);
  lamp.position.set(0, 16, z);
  scene.add(lamp);
  nightLights.push(lamp);
}

/* ================================================================
   材质
   ================================================================ */
const roofTile = createRoofTileTexture();
const wallMap = createWallTexture();
const marbleMap = createMarbleTexture();
const stoneMap = createStoneTexture();
const latticeMap = createLatticeTexture();

wallMap.repeat.set(9, 4);
latticeMap.repeat.set(6, 2);

const M = {
  stoneMap,
  marbleMap,

  wall: new THREE.MeshStandardMaterial({ map: wallMap, roughness: 0.88, metalness: 0.02 }),
  column: new THREE.MeshStandardMaterial({ color: 0x8e2b1d, roughness: 0.62, metalness: 0.05 }),
  beam: new THREE.MeshStandardMaterial({ color: 0x5c1a11, roughness: 0.7, metalness: 0.06 }),
  marble: new THREE.MeshStandardMaterial({ map: marbleMap, roughness: 0.78, metalness: 0.03 }),
  marbleLight: new THREE.MeshStandardMaterial({ color: 0xefe9da, roughness: 0.7, metalness: 0.03 }),
  lattice: new THREE.MeshStandardMaterial({ map: latticeMap, roughness: 0.72, metalness: 0.04 }),
  roofCap: new THREE.MeshStandardMaterial({ color: 0xb8912f, roughness: 0.5, metalness: 0.3 }),
  roofFlat: new THREE.MeshStandardMaterial({ color: 0xa8842c, roughness: 0.55, metalness: 0.25 }),
  darkVoid: new THREE.MeshBasicMaterial({ color: 0x140b07 }),
};

/* ================================================================
   中轴线布局
   ================================================================ */
const city = new THREE.Group();
scene.add(city);

/* ---------- 广场 ---------- */
city.add(createPlaza({ width: 900, depth: 1500, mats: M }));

/* ---------- 太和殿（三层台基） ---------- */
const TAIHE_Z = 0;
const taiheTerrace = createTerrace({
  width: 76,
  depth: 52,
  tiers: 3,
  tierHeight: 2.4,
  tierInset: 3.2,
  mats: M,
});
taiheTerrace.position.set(0, 0, TAIHE_Z);
city.add(taiheTerrace);

const TAIHE_BASE = 3 * 2.4;

const taihe = createGrandHall({
  width: 54,
  depth: 30,
  bodyHeight: 11.5,
  baseY: TAIHE_BASE,
  doubleEave: true,
  lowerOverhang: 6,
  lowerRoofHeight: 9.0,
  upperInset: 7,
  upperBodyHeight: 11.5,
  upperRoofHeight: 14.5,
  upperOverhang: 6,
  ridgeRatio: 0.46,
  columnCount: 11,
  mats: M,
  tileTexture: roofTile,
});
taihe.position.z = TAIHE_Z;
city.add(taihe);

/* ---------- 华表 ---------- */
for (const sx of [-1, 1]) {
  const hb = createOrnamentalColumn({ height: 15, mats: M });
  hb.position.set(sx * 30, 0, 46);
  city.add(hb);
}

/* ---------- 东西配殿（填满广场，避免空旷） ---------- */
for (const sx of [-1, 1]) {
  const wing = createGrandHall({
    width: 150,
    depth: 14,
    bodyHeight: 8,
    baseY: 1.2,
    doubleEave: false,
    lowerOverhang: 3.6,
    lowerRoofHeight: 7,
    ridgeRatio: 0.58,
    columnCount: 2,
    mats: M,
    tileTexture: roofTile,
  });
  wing.position.set(sx * 112, 0, 20);
  wing.rotation.y = Math.PI / 2;
  city.add(wing);
}

/* ---------- 中和殿 ---------- */
const ZHONGHE_Z = -76;
const zhongheTerrace = createTerrace({
  width: 46,
  depth: 46,
  tiers: 1,
  tierHeight: 2.6,
  mats: M,
});
zhongheTerrace.position.set(0, 0, ZHONGHE_Z);
city.add(zhongheTerrace);

const zhonghe = createSquareHall({
  size: 26,
  bodyHeight: 9.5,
  baseY: 2.6,
  roofHeight: 11,
  overhang: 5.5,
  mats: M,
  tileTexture: roofTile,
});
zhonghe.position.z = ZHONGHE_Z;
city.add(zhonghe);

/* ---------- 保和殿 ---------- */
const BAOHE_Z = -134;
const baoheTerrace = createTerrace({
  width: 66,
  depth: 46,
  tiers: 1,
  tierHeight: 2.8,
  mats: M,
});
baoheTerrace.position.set(0, 0, BAOHE_Z);
city.add(baoheTerrace);

const baohe = createGrandHall({
  width: 46,
  depth: 26,
  bodyHeight: 10.5,
  baseY: 2.8,
  doubleEave: true,
  lowerOverhang: 5.5,
  lowerRoofHeight: 8.2,
  upperInset: 6,
  upperBodyHeight: 10.5,
  upperRoofHeight: 12.6,
  upperOverhang: 5,
  ridgeRatio: 0.46,
  columnCount: 9,
  mats: M,
  tileTexture: roofTile,
});
baohe.position.z = BAOHE_Z;
city.add(baohe);

/* ---------- 太和门 ---------- */
const TAIHEMEN_Z = 104;
const gateTerrace = createTerrace({
  width: 54,
  depth: 26,
  tiers: 1,
  tierHeight: 2.0,
  mats: M,
});
gateTerrace.position.set(0, 0, TAIHEMEN_Z);
city.add(gateTerrace);

const gate = createGate({
  width: 42,
  depth: 14,
  bodyHeight: 12,
  baseY: 2.0,
  overhang: 5.5,
  roofHeight: 13.5,
  archCount: 3,
  mats: M,
  tileTexture: roofTile,
});
gate.position.z = TAIHEMEN_Z;
city.add(gate);

/* ---------- 金水河 + 五座桥 ---------- */
const JINSHUI_Z = 172;
const channel = createWaterChannel({ length: 260, width: 24, mats: M });
channel.position.z = JINSHUI_Z;
city.add(channel);

const bridgeSpecs = [
  { x: 0, span: 34, width: 10 },
  { x: 15, span: 34, width: 7.5 },
  { x: -15, span: 34, width: 7.5 },
  { x: 28, span: 34, width: 6.2 },
  { x: -28, span: 34, width: 6.2 },
];
for (const b of bridgeSpecs) {
  const bridge = createArchBridge({ span: b.span, width: b.width, rise: 2.6, mats: M });
  bridge.position.set(b.x, 0, JINSHUI_Z);
  bridge.rotation.y = Math.PI / 2;
  city.add(bridge);
}

/* ---------- 午门 ---------- */
const WUMEN_Z = 262;
const wumenTerrace = createTerrace({
  width: 96,
  depth: 34,
  tiers: 1,
  tierHeight: 2.2,
  mats: M,
});
wumenTerrace.position.set(0, 0, WUMEN_Z);
city.add(wumenTerrace);

const wumen = createGate({
  width: 80,
  depth: 22,
  bodyHeight: 14,
  baseY: 2.2,
  overhang: 6,
  roofHeight: 17,
  archCount: 3,
  mats: M,
  tileTexture: roofTile,
});
wumen.position.z = WUMEN_Z;
city.add(wumen);

/* ---------- 两侧宫墙 ---------- */
for (const sx of [-1, 1]) {
  const wall = createWall({
    length: 600,
    height: 7,
    thickness: 2.4,
    mats: M,
    horizontal: false,
  });
  wall.position.set(sx * 150, 0, -20);
  city.add(wall);
}

const backWall = createWall({ length: 302, height: 7, thickness: 2.4, mats: M, horizontal: true });
backWall.position.set(0, 0, -240);
city.add(backWall);

/* ================================================================
   建筑标注
   ================================================================ */
const labels = new THREE.Group();
scene.add(labels);

function addLabel(text, x, y, z) {
  const div = document.createElement('div');
  div.className = 'tag';
  div.textContent = text;
  const obj = new CSS2DObject(div);
  obj.position.set(x, y, z);
  labels.add(obj);
  return obj;
}

addLabel('太和殿', 0, 44, TAIHE_Z);
addLabel('中和殿', 0, 26, ZHONGHE_Z);
addLabel('保和殿', 0, 26, BAOHE_Z);
addLabel('太和门', 0, 23, TAIHEMEN_Z);
addLabel('金水桥', 0, 12, JINSHUI_Z);
addLabel('午门', 0, 28, WUMEN_Z);

/* ================================================================
   昼夜切换
   ================================================================ */
let isNight = false;

function setNight(value) {
  isNight = value;

  const sky = createSkyTexture(isNight);
  skyMat.map.dispose();
  skyMat.map = sky;
  skyMat.needsUpdate = true;

  buildEnvironment(isNight);

  if (isNight) {
    hemi.color.set(0x33465f);
    hemi.groundColor.set(0x1e1812);
    hemi.intensity = 0.5;

    sun.color.set(0x9fb6d8);
    sun.intensity = 0.5;
    sun.position.set(-180, 240, -120);

    fill.intensity = 0.22;
    ambient.intensity = 0.12;

    for (const l of nightLights) l.intensity = 4.2;

    scene.fog.color.set(0x0d1220);
    renderer.toneMappingExposure = 1.35;
  } else {
    hemi.color.set(0xbfd4e8);
    hemi.groundColor.set(0x6b5b45);
    hemi.intensity = 0.85;

    sun.color.set(0xfff0d6);
    sun.intensity = 2.4;
    sun.position.set(210, 300, 160);

    fill.intensity = 0.55;
    ambient.intensity = 0.22;

    for (const l of nightLights) l.intensity = 0;

    scene.fog.color.set(0xd9cdb4);
    renderer.toneMappingExposure = 1.05;
  }
}

/* ================================================================
   界面交互
   ================================================================ */
const panel = document.getElementById('hud-panel');
let labelsVisible = true;

panel.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === 'rotate') {
    controls.autoRotate = !controls.autoRotate;
    btn.classList.toggle('on', controls.autoRotate);
  }

  if (action === 'night') {
    setNight(!isNight);
    btn.classList.toggle('on', isNight);
    btn.textContent = isNight ? '白昼' : '夜景';
  }

  if (action === 'reset') {
    camera.position.copy(HOME);
    controls.target.copy(TARGET);
    controls.update();
  }

  if (action === 'labels') {
    labelsVisible = !labelsVisible;
    labels.visible = labelsVisible;
    btn.classList.toggle('on', labelsVisible);
  }
});

// 支持 ?night=1 直接进入夜景（便于截图与分享）
if (new URLSearchParams(location.search).has('night')) {
  setNight(true);
  const nb = panel.querySelector('[data-action="night"]');
  if (nb) {
    nb.classList.add('on');
    nb.textContent = '白昼';
  }
}

/* ================================================================
   渲染循环
   ================================================================ */const clock = new THREE.Clock();
let frames = 0;
let fpsAcc = 0;
const statEl = document.getElementById('stat');
const loader = document.getElementById('loader');
let firstFrameDone = false;

function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();
  controls.update();

  // 夜色下水面微微波动
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);

  if (!firstFrameDone) {
    firstFrameDone = true;
    loader.classList.add('hidden');
    setTimeout(() => loader.remove(), 1000);
  }

  frames++;
  fpsAcc += dt;
  if (fpsAcc >= 0.5 && statEl) {
    statEl.textContent = `${Math.round(frames / fpsAcc)} FPS`;
    frames = 0;
    fpsAcc = 0;
  }
}

animate();

/* ================================================================
   自适应
   ================================================================ */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

// 便于调试
window.__SCENE__ = { scene, camera, controls, renderer };
