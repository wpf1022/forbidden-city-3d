/**
 * 紫禁城 · 中轴 —— 入口。
 *
 * 全静态、零构建：只依赖 three.js 一个运行库，几何与纹理全部在运行时生成。
 */
import * as THREE from 'three';
import { qualityTier, VIEWS, CAMERA } from './config.js';
import { TextureFactory } from './textures/index.js';
import { createMaterials } from './materials.js';
import { Sky } from './render/sky.js';
import { Lighting } from './render/lighting.js';
import { AxisControls } from './render/controls.js';
import { buildWorld } from './world/scene.js';
import { HUD } from './ui/hud.js';

const params = new URLSearchParams(location.search);
const P = {
  view: (params.get('v') || 'a').toLowerCase(),
  night: params.get('night') === '1',
  hud: params.get('hud') !== '0',
  shot: params.get('shot') === '1',
};

/** 让浏览器先把遮罩画出来，再开始重活。 */
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function boot() {
  const stage = document.getElementById('stage');
  const quality = qualityTier();

  // WebGL 能力检测（PRD FR-3D-09：不支持时给明确提示，而不是黑屏）
  const probe = document.createElement('canvas');
  const hasWebGL = !!(probe.getContext('webgl2') || probe.getContext('webgl'));
  if (!hasWebGL) {
    document.getElementById('loading')?.classList.add('is-failed');
    const note = document.getElementById('load-note');
    if (note) note.textContent = '此浏览器未启用 WebGL，无法进入三维场景。';
    window.__FC_READY__ = true;
    return;
  }

  await nextFrame();

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // 默认的 info 会在 shadowMap.render() 之后 reset，于是 calls 只统计主 pass。
  // 关掉 autoReset、每帧 render 前手动 reset，数字才包含阴影趟（PRD 的 ≤300 指的是这一趟）。
  renderer.info.autoReset = false;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    CAMERA.fov, window.innerWidth / window.innerHeight, CAMERA.near, CAMERA.far,
  );

  const factory = new TextureFactory(renderer);
  const materials = createMaterials(factory);

  const sky = new Sky(renderer, quality);
  scene.add(sky.mesh);

  const world = buildWorld(scene, materials);

  const lighting = new Lighting(scene, renderer, sky, materials, quality, world.lamps);
  lighting.bake();
  lighting.setNight(P.night, true);

  const controls = new AxisControls(camera, renderer.domElement);
  controls.setKeepOuts(world.keepOuts);

  /** 竖屏时同样构图要退远并抬高机位：预设机位按宽高比外推（FR-3D-06）。 */
  const frameScale = () => {
    const a = window.innerWidth / Math.max(1, window.innerHeight);
    if (a >= 1.25) return { k: 1, lift: 0 };
    return { k: Math.min(1.62, 1.25 / Math.max(0.4, a)), lift: (1.25 - a) * 92 };
  };
  const applyView = (key, instant = false) => {
    const v = VIEWS[key] || VIEWS.a;
    const { k, lift } = frameScale();
    const target = v.target;
    const pos = [
      target[0] + (v.pos[0] - target[0]) * k,
      target[1] + (v.pos[1] - target[1]) * k + lift,
      target[2] + (v.pos[2] - target[2]) * k,
    ];
    controls.setPose({ pos, target }, instant);
  };
  let currentView = VIEWS[P.view] ? P.view : 'a';
  applyView(currentView, true);
  controls.autoOrbit = !P.shot;
  // 用户一旦手动动过相机，resize 就只改画幅、不再覆盖机位
  let userMoved = false;
  for (const ev of ['pointerdown', 'wheel', 'touchstart']) {
    renderer.domElement.addEventListener(ev, () => { userMoved = true; }, { passive: true });
  }

  const hud = new HUD({
    buildings: world.buildings,
    onNight: () => {
      const night = !lighting.target;
      lighting.setNight(night);
      hud.setNight(night);
    },
    onViews: (key) => {
      if (!key) return;
      currentView = key;
      applyView(key);
      hud.setView(key);
    },
    onToggleLabels: () => hud.setLabels(!hud.labelsOn),
    onReset: () => applyView(currentView),
  });
  hud.setNight(P.night);
  hud.setView(currentView);
  hud.setHudVisible(P.hud);
  hud.setLabels(true);

  // resize 只调整画幅，不重设机位：用户拖出来的视角不能因为窗口变化/地址栏
  // 收起/跨屏拖动而被打回预设（FR-3D-02 自由相机）。只有在用户还没动过相机时
  // 才重新取景，以便竖屏/横屏切换后构图依然成立。
  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio));
    if (!userMoved) applyView(currentView, true);
  };
  window.addEventListener('resize', onResize);

  const clock = new THREE.Clock();
  let frames = 0;
  let fpsAcc = 0, fpsFrames = 0, fps = 0;
  let first = true;

  // setAnimationLoop 的回调一旦抛错就不会再排下一帧 → 画面永久冻结且无提示。
  // 这里兜住异常并转到可见的错误态，至少让人知道发生了什么。
  let crashed = false;
  renderer.setAnimationLoop(() => {
    if (crashed) return;
    try {
    const dt = Math.min(0.1, clock.getDelta());
    controls.update(dt);
    const state = lighting.update(dt, controls.cur.target);
    sky.update(clock.elapsedTime);

    // 水面：极慢的法线滚动（PRD v1.1 的水面波动，这里以最低成本先给出"活"的感觉）
    const wm = materials.water;
    if (wm.normalMap) {
      wm.normalMap.offset.x = clock.elapsedTime * 0.004;
      wm.normalMap.offset.y = clock.elapsedTime * 0.0026;
    }

    // 标注投影用的是 camera.matrixWorldInverse，必须在投影前刷新，
    // 否则自动环绕时标签会稳定滞后一帧（首帧更是用单位矩阵）。
    camera.updateMatrixWorld();
    if (hud.labelsOn) hud.update(camera);

    renderer.info.reset();
    renderer.render(scene, camera);
    frames++;
    fpsAcc += dt; fpsFrames++;
    if (fpsAcc > 0.5) { fps = fpsFrames / fpsAcc; fpsAcc = 0; fpsFrames = 0; }

    window.__FC_STATS__ = {
      fps: Math.round(fps),
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      programs: renderer.info.programs?.length ?? 0,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      exposure: +renderer.toneMappingExposure.toFixed(3),
      night: +state.lampIntensity.toFixed(2),
    };

    if (first) {
      first = false;
      window.__FC_READY__ = true;
      hud.revealLoading();
    }
    } catch (err) {
      crashed = true;
      console.error(err);
      const note = document.getElementById('load-note');
      if (note) {
        note.dataset.done = '1';
        note.textContent = '渲染中断：' + (err && err.message ? err.message : String(err));
        document.getElementById('loading')?.classList.remove('is-done');
        document.getElementById('loading')?.classList.add('is-failed');
      }
    }
  });

  // 调试与截图脚本用的钩子
  window.__FC__ = {
    THREE, scene, camera, renderer, controls, lighting, sky, materials, world,
    setView: (k) => { currentView = k; applyView(k, true); hud.setView(k); },
    setNight: (n) => { lighting.setNight(n, true); hud.setNight(n); },
  };
}

boot().catch((e) => {
  console.error(e);
  const note = document.getElementById('load-note');
  if (note) note.textContent = '场景初始化失败：' + e.message;
  window.__FC_READY__ = true;
});
