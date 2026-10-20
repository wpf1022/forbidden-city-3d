/**
 * 程序化纹理：全部在运行时由 Canvas / 数学生成（PRD N5：仓库内不含任何位图）。
 *
 * 每个生成器返回 { map, normalMap, roughnessMap?, emissiveMap? }，
 * 由 TextureFactory 缓存，多个建筑共用同一份实例。
 */
import * as THREE from 'three';
import { fbm, noise2, rng, smoothstep, clamp } from '../lib/noise.js';

/* ────────────────────────────── 基础工具 ────────────────────────────── */

function canvas2d(size, h = size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = h;
  return { c, ctx: c.getContext('2d', { willReadFrequently: true }) };
}

/** 逐像素绘制颜色图。cb(u, v, i, data) 直接写 RGBA。 */
function paintColor(size, cb, h = size) {
  const { c, ctx } = canvas2d(size, h);
  const img = ctx.createImageData(size, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      cb(x / size, y / h, i, d, x, y);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** 逐像素绘制灰度高度图（返回 Float32Array 与画布）。 */
function paintHeight(size, cb, h = size) {
  const { c, ctx } = canvas2d(size, h);
  const img = ctx.createImageData(size, h);
  const d = img.data;
  const height = new Float32Array(size * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = clamp(cb(x / size, y / h, x, y), 0, 1);
      height[y * size + x] = v;
      const g = Math.round(v * 255);
      d[i] = d[i + 1] = d[i + 2] = g;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: c, height };
}

/** 由高度场求法线贴图（环绕采样，保证平铺无缝）。 */
function normalFromHeight(height, size, h, strength = 2.2) {
  const { c, ctx } = canvas2d(size, h);
  const img = ctx.createImageData(size, h);
  const d = img.data;
  const at = (x, y) => height[(((y % h) + h) % h) * size + (((x % size) + size) % size)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      // CanvasTexture 默认 flipY=true：画布行方向与 UV 的 v 相反，
      // 于是 ∂h/∂v = -dy，切空间法线的 y 分量应为 -∂h/∂v = +dy。
      // 这里原先写成 -dy，导致所有凹凸在 V 方向上的受光是反的。
      const len = Math.hypot(-dx, dy, 1);
      const i = (y * size + x) * 4;
      d[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      d[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      d[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function tex(canvas, { srgb = false, repeat = 1, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/* ────────────────────────────── 琉璃瓦 ────────────────────────────── */

/**
 * 黄琉璃瓦屋面。纹理代表 2.72m × 2.72m：
 * u 沿檐口方向（横向 8 垄筒瓦），v 沿坡向（8 道板瓦压边）。
 */
function glazedRoof(aniso) {
  const S = 512;
  const RIDGES = 8;
  const COURSES = 8;
  const TILE_M = 4.0;

  const { canvas: heightCanvas, height } = paintHeight(S, (u, v) => {
    const p = u * RIDGES;
    const t = p - Math.floor(p);
    // 0.00–0.34 板瓦（凹），0.34–1.00 筒瓦（凸）
    const ridge = t < 0.34 ? 0 : Math.sin(((t - 0.34) / 0.66) * Math.PI) ** 0.7;
    const base = 0.18 + ridge * 0.82;
    const c = v * COURSES;
    const ct = c - Math.floor(c);
    const seam = ct < 0.06 ? 1 - ct / 0.06 : 0;
    return base * (1 - seam * 0.38) - seam * 0.06;
  });

  const color = paintColor(S, (u, v, i, d) => {
    const p = u * RIDGES;
    const idx = Math.floor(p);
    const t = p - idx;
    const ridge = t < 0.34 ? 0 : Math.sin(((t - 0.34) / 0.66) * Math.PI) ** 0.7;
    const c = v * COURSES;
    const cidx = Math.floor(c);
    const ct = c - Math.floor(c);

    // 每块瓦的烧制色差（低频，避免高频噪声在远处摩尔纹）
    const jit = noise2(idx * 3.1, cidx * 7.7, 4096, 11);
    const age = noise2(idx * 0.7, cidx * 0.9, 4096, 29);

    let r = 205, g = 156, b = 36;
    r += (jit - 0.5) * 9 + (age - 0.5) * 8;
    g += (jit - 0.5) * 8 + (age - 0.5) * 6;
    b += (jit - 0.5) * 6;

    // 凹处受遮蔽，凸处受光
    let shade = 0.74 + ridge * 0.34;
    if (t < 0.34) shade *= 0.86;
    if (ct < 0.06) shade *= 0.82;

    const k = shade;
    d[i] = clamp(r * k, 0, 255);
    d[i + 1] = clamp(g * k, 0, 255);
    d[i + 2] = clamp(b * k, 0, 255);
  });

  const normalCanvas = normalFromHeight(height, S, S, 1.15);
  return {
    map: tex(color, { srgb: true, repeat: 1 / TILE_M, aniso }),
    normalMap: tex(normalCanvas, { repeat: 1 / TILE_M, aniso }),
    tileMeters: TILE_M,
  };
}

/* ────────────────────────────── 汉白玉 / 石材 ────────────────────────────── */

function marble(aniso, { base = [212, 206, 190], scale = 3.0, seed = 3 } = {}) {
  const S = 256;
  const { canvas: hc, height } = paintHeight(S, (u, v) => {
    const n = fbm(u * 7, v * 7, { octaves: 4, period: 7, seed });
    const pit = noise2(u * 90, v * 90, 512, seed + 4);
    return 0.5 + (n - 0.5) * 0.35 + (pit - 0.5) * 0.22;
  });

  const color = paintColor(S, (u, v, i, d) => {
    const n = fbm(u * 6, v * 6, { octaves: 5, period: 6, seed });
    const vein = fbm(u * 3.2 + 11, v * 9, { octaves: 4, period: 3, seed: seed + 9 });
    const streak = smoothstep(0.52, 0.62, vein) * 0.5;
    const k = 0.9 + (n - 0.5) * 0.22 - streak * 0.3;
    d[i] = clamp(base[0] * k, 0, 255);
    d[i + 1] = clamp(base[1] * k * (1 - streak * 0.03), 0, 255);
    d[i + 2] = clamp(base[2] * k * (1 - streak * 0.06), 0, 255);
  });

  return {
    map: tex(color, { srgb: true, repeat: 1 / scale, aniso }),
    normalMap: tex(normalFromHeight(height, S, S, 1.1), { repeat: 1 / scale, aniso }),
    meters: scale,
  };
}

/* ────────────────────────────── 地面铺砖 ────────────────────────────── */

function paving(aniso) {
  const S = 512;
  const SIZE_M = 8.0; // 8m × 8m，内含 4×4 块 2m 金砖
  const N = 4;

  const { canvas: hc, height } = paintHeight(S, (u, v) => {
    const gx = u * N, gy = v * N;
    const fx = gx - Math.floor(gx), fy = gy - Math.floor(gy);
    const joint = Math.min(fx, 1 - fx, fy, 1 - fy);
    const j = smoothstep(0.0, 0.014, joint); // 砖缝凹陷
    const wear = fbm(u * 5, v * 5, { octaves: 3, period: 5, seed: 21 });
    return 0.45 + j * 0.5 + (wear - 0.5) * 0.1;
  });

  const color = paintColor(S, (u, v, i, d) => {
    const gx = u * N, gy = v * N;
    const ix = Math.floor(gx), iy = Math.floor(gy);
    const fx = gx - ix, fy = gy - iy;
    const joint = Math.min(fx, 1 - fx, fy, 1 - fy);
    const j = smoothstep(0.0, 0.012, joint);

    const brick = noise2(ix * 13.7, iy * 7.3, 4096, 31);
    const grime = fbm(u * 6, v * 6, { octaves: 4, period: 6, seed: 33 });
    const stain = fbm(u * 1.7 + 5, v * 1.7, { octaves: 3, period: 2, seed: 44 });

    let k = 0.93 + (brick - 0.5) * 0.16 + (grime - 0.5) * 0.13;
    k *= 0.88 + j * 0.14;
    const tint = 0.95 + stain * 0.1;

    d[i] = clamp(152 * k * tint, 0, 255);
    d[i + 1] = clamp(144 * k * tint, 0, 255);
    d[i + 2] = clamp(129 * k * tint * 1.01, 0, 255);
  });

  return {
    map: tex(color, { srgb: true, repeat: 1 / SIZE_M, aniso }),
    normalMap: tex(normalFromHeight(height, S, S, 1.1), { repeat: 1 / SIZE_M, aniso }),
    meters: SIZE_M,
  };
}

/* ────────────────────────────── 宫墙 ────────────────────────────── */

function redWall(aniso) {
  const S = 256;
  const METERS = 4;
  const color = paintColor(S, (u, v, i, d) => {
    const mott = fbm(u * 5, v * 5, { octaves: 4, period: 5, seed: 71 });
    const streak = fbm(u * 22, v * 2.5, { octaves: 3, period: 22, seed: 77 });
    const dirt = smoothstep(0.45, 0.9, fbm(u * 3 + 2, v * 1.6, { octaves: 3, period: 3, seed: 83 }));
    let k = 0.92 + (mott - 0.5) * 0.26 + (streak - 0.5) * 0.1 - dirt * 0.16;
    k *= 0.94 + v * 0.08;
    d[i] = clamp(142 * k, 0, 255);
    d[i + 1] = clamp(43 * k, 0, 255);
    d[i + 2] = clamp(29 * k, 0, 255);
  });
  return { map: tex(color, { srgb: true, repeat: 1 / METERS, aniso }), meters: METERS };
}

/* ────────────────────────────── 隔扇门窗 ────────────────────────────── */

/**
 * 一扇隔扇：上部菱花格心，下部裙板。返回颜色图与自发光图（夜间透光）。
 */
function latticeDoor(aniso) {
  const W = 256, H = 512;
  const { c, ctx } = canvas2d(W, H);

  // 底：深红木框
  ctx.fillStyle = '#5d1c14';
  ctx.fillRect(0, 0, W, H);

  // 格心（上 62%）
  const gy0 = 14, gy1 = Math.floor(H * 0.62);
  ctx.fillStyle = '#2a0f0b';
  ctx.fillRect(10, gy0, W - 20, gy1 - gy0);

  const gold = '#d8b25c';
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2.4;
  const step = 26;
  for (let k = -H; k < W + H; k += step) {
    ctx.beginPath(); ctx.moveTo(k, gy0); ctx.lineTo(k + (gy1 - gy0), gy1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(k, gy0); ctx.lineTo(k - (gy1 - gy0), gy1); ctx.stroke();
  }
  // 菱花结子
  ctx.fillStyle = 'rgba(216,178,92,0.55)';
  for (let y = gy0 + step / 2; y < gy1; y += step) {
    for (let x = step / 2; x < W; x += step) {
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
    }
  }
  // 外框
  ctx.strokeStyle = '#b8923f';
  ctx.lineWidth = 7;
  ctx.strokeRect(5, 5, W - 10, H - 10);
  ctx.lineWidth = 4;
  ctx.strokeRect(11, gy0, W - 22, gy1 - gy0);

  // 裙板（下 38%）
  const py0 = gy1 + 14;
  ctx.fillStyle = '#6b2418';
  ctx.fillRect(12, py0, W - 24, H - py0 - 12);
  ctx.strokeStyle = '#c39b45';
  ctx.lineWidth = 3;
  ctx.strokeRect(20, py0 + 10, W - 40, H - py0 - 32);
  // 裙板浮雕：回纹方框
  ctx.lineWidth = 2;
  ctx.strokeRect(34, py0 + 24, W - 68, H - py0 - 60);
  ctx.strokeStyle = 'rgba(190,150,70,0.7)';
  ctx.beginPath();
  ctx.moveTo(34, py0 + 24); ctx.lineTo(W - 34, H - 36);
  ctx.moveTo(W - 34, py0 + 24); ctx.lineTo(34, H - 36);
  ctx.stroke();

  // 竖向木纹
  for (let x = 0; x < W; x += 2) {
    const a = 0.05 + noise2(x * 0.4, 3, 4096, 5) * 0.06;
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(x, 0, 1, H);
  }

  // 自发光：格心透出的暖光
  const { c: ec, ctx: ectx } = canvas2d(W, H);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, W, H);
  const grad = ectx.createRadialGradient(W / 2, gy1 * 0.55, 10, W / 2, gy1 * 0.55, W * 0.9);
  grad.addColorStop(0, '#ffb968');
  grad.addColorStop(0.55, '#7a3a12');
  grad.addColorStop(1, '#120604');
  ectx.fillStyle = grad;
  ectx.fillRect(12, gy0, W - 24, gy1 - gy0);
  ectx.fillStyle = 'rgba(0,0,0,0.55)';
  for (let k = -H; k < W + H; k += step) {
    ectx.save();
    ectx.translate(k, gy0);
    ectx.rotate(Math.PI / 4);
    ectx.fillRect(-1.4, 0, 2.8, gy1 - gy0);
    ectx.restore();
    ectx.save();
    ectx.translate(k, gy0);
    ectx.rotate(-Math.PI / 4);
    ectx.fillRect(-1.4, 0, 2.8, gy1 - gy0);
    ectx.restore();
  }

  return {
    map: tex(c, { srgb: true, aniso }),
    emissiveMap: tex(ec, { srgb: true, aniso }),
    aspect: H / W,
  };
}

/* ────────────────────────────── 彩画额枋 ────────────────────────────── */

function caihua(aniso) {
  const W = 512, H = 64;
  const { c, ctx } = canvas2d(W, H);
  const y = H / 2;

  ctx.fillStyle = '#1f3f63';
  ctx.fillRect(0, 0, W, H);

  // 箍头（两端绿带）
  const band = 78;
  for (const x0 of [0, W - band]) {
    ctx.fillStyle = '#24584a';
    ctx.fillRect(x0, 0, band, H);
    ctx.strokeStyle = '#c9a44e';
    ctx.lineWidth = 3;
    ctx.strokeRect(x0 + 6, 6, band - 12, H - 12);
  }

  // 藻头：旋子花纹（圆环）
  ctx.strokeStyle = 'rgba(201,164,78,0.85)';
  ctx.lineWidth = 2;
  for (const cx of [band + 26, W - band - 26]) {
    ctx.beginPath(); ctx.arc(cx, y, 18, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, y, 9, 0, Math.PI * 2); ctx.stroke();
  }

  // 枋心：中间蓝底金线
  ctx.strokeStyle = '#c9a44e';
  ctx.lineWidth = 3;
  ctx.strokeRect(band + 62, 9, W - 2 * band - 124, H - 18);
  ctx.strokeStyle = 'rgba(201,164,78,0.5)';
  ctx.lineWidth = 1.5;
  for (let x = band + 74; x < W - band - 62; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, 14);
    ctx.bezierCurveTo(x + 6, y - 8, x + 6, y + 8, x, H - 14);
    ctx.stroke();
  }

  // 上下金边
  ctx.fillStyle = '#b8912f';
  ctx.fillRect(0, 0, W, 5);
  ctx.fillRect(0, H - 5, W, 5);

  return { map: tex(c, { srgb: true, aniso }), meters: 6 };
}

/* ────────────────────────────── 水面法线 ────────────────────────────── */

function waterNormal(aniso) {
  const S = 256;
  const { height } = paintHeight(S, (u, v) => {
    return (
      0.5 +
      (fbm(u * 4.5, v * 4.5, { octaves: 4, period: 4, seed: 91 }) - 0.5) * 0.75 +
      (fbm(u * 11 + 3, v * 11, { octaves: 3, period: 11, seed: 93 }) - 0.5) * 0.3
    );
  });
  const nc = normalFromHeight(height, S, S, 2.4);
  const t = tex(nc, { repeat: 1 / 9, aniso });
  return { normalMap: t };
}

/* ────────────────────────────── 砖石（城台）────────────────────────────── */

function brick(aniso) {
  const S = 256;
  const METERS = 2.0;
  const { canvas: hc, height } = paintHeight(S, (u, v) => {
    const rows = 8;
    const y = v * rows;
    const ry = Math.floor(y);
    const fy = y - ry;
    const offset = (ry % 2) * 0.5;
    const x = u * 4 + offset;
    const fx = x - Math.floor(x);
    const joint = Math.min(fx, 1 - fx) * 0.55 + Math.min(fy, 1 - fy) * 3.2;
    return 0.3 + smoothstep(0.0, 0.06, joint) * 0.6;
  });

  const color = paintColor(S, (u, v, i, d) => {
    const rows = 8;
    const y = v * rows;
    const ry = Math.floor(y);
    const fy = y - ry;
    const offset = (ry % 2) * 0.5;
    const x = u * 4 + offset;
    const rx = Math.floor(x);
    const fx = x - rx;
    const joint = Math.min(fx, 1 - fx) * 0.55 + Math.min(fy, 1 - fy) * 3.2;
    const brickTone = noise2(rx * 9.1, ry * 5.3, 4096, 61);
    const grime = fbm(u * 6, v * 6, { octaves: 4, period: 6, seed: 63 });
    let k = 0.8 + (brickTone - 0.5) * 0.3 + (grime - 0.5) * 0.18;
    k *= 0.72 + smoothstep(0.0, 0.06, joint) * 0.3;
    d[i] = clamp(158 * k, 0, 255);
    d[i + 1] = clamp(134 * k, 0, 255);
    d[i + 2] = clamp(116 * k, 0, 255);
  });

  return {
    map: tex(color, { srgb: true, repeat: 1 / METERS, aniso }),
    normalMap: tex(normalFromHeight(height, S, S, 1.8), { repeat: 1 / METERS, aniso }),
    meters: METERS,
  };
}

/* ────────────────────────────── 匾额 ────────────────────────────── */

/** 匾额：金框、蓝底、金字的横匾。文字用系统衬线字体排。 */
function plaque(text, aniso) {
  const W = 512, H = 176;
  const { c, ctx } = canvas2d(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1b2a3c');
  g.addColorStop(0.5, '#16222f');
  g.addColorStop(1, '#101821');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#c9a44e';
  ctx.lineWidth = 9;
  ctx.strokeRect(4.5, 4.5, W - 9, H - 9);
  ctx.lineWidth = 3;
  ctx.strokeRect(16, 16, W - 32, H - 32);

  ctx.fillStyle = '#e8c96a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = [...text];
  const fs = Math.min(96, Math.floor((W - 90) / Math.max(1, chars.length)) * 1.06);
  ctx.font = `600 ${fs}px "Songti SC","STSong","Source Han Serif SC","SimSun",serif`;
  const gap = (W - 96) / Math.max(1, chars.length);
  chars.forEach((ch, i) => {
    const x = W / 2 + (i - (chars.length - 1) / 2) * gap;
    ctx.fillText(ch, x, H / 2 + 2);
  });

  return { map: tex(c, { srgb: true, aniso }) };
}

/* ────────────────────────────── 工厂 ────────────────────────────── */

export class TextureFactory {
  constructor(renderer) {
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
    this.cache = new Map();
  }

  /** 各向异性不是越大越好：屋面瓦垄在掠射角下用 8× 会出摩尔纹，取 3×。 */
  anisoFor(name) {
    if (name === 'glazedRoof') return Math.min(1, this.maxAniso);
    if (name === 'paving' || name === 'brick') return Math.min(4, this.maxAniso);
    return Math.min(4, this.maxAniso);
  }

  get(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    if (name.startsWith('plaque:')) {
      const v = plaque(name.slice(7), this.anisoFor('plaque'));
      this.cache.set(name, v);
      return v;
    }
    const aniso = this.anisoFor(name);
    const build = {
      glazedRoof: () => glazedRoof(aniso),
      marble: () => marble(aniso),
      marbleWarm: () => marble(aniso, { base: [214, 205, 186], scale: 2.4, seed: 17 }),
      paving: () => paving(aniso),
      redWall: () => redWall(aniso),
      latticeDoor: () => latticeDoor(aniso),
      caihua: () => caihua(aniso),
      waterNormal: () => waterNormal(aniso),
      brick: () => brick(aniso),
    }[name];
    if (!build) throw new Error('unknown texture ' + name);
    const v = build();
    this.cache.set(name, v);
    return v;
  }
}
