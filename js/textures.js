import * as THREE from 'three';

/**
 * 程序化纹理生成器
 * ---------------------------------------------------------------
 * 全部用 Canvas 2D 绘制，不依赖任何外部图片资源。
 * 好处：仓库零资源体积、可离线运行、颜色与比例可随时用代码调。
 */

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d') };
}

function finish(canvas, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 确定性伪随机，保证每次刷新纹理一致 */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 在画布上撒噪点，增加材质粗糙感 */
function grain(ctx, w, h, amount, alpha) {
  const rand = rng(20240601);
  for (let i = 0; i < amount; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const v = Math.floor(rand() * 90);
    ctx.fillStyle = `rgba(0,0,0,${(alpha * v) / 255})`;
    ctx.fillRect(x, y, 1 + rand() * 2, 1 + rand() * 2);
  }
}

/* ================================================================
   琉璃瓦：竖向筒瓦 + 横向瓦垄
   ================================================================ */
export function createRoofTileTexture() {
  const { canvas, ctx } = makeCanvas(256, 256);

  // 底色
  const base = ctx.createLinearGradient(0, 0, 0, 256);
  base.addColorStop(0, '#b8912f');
  base.addColorStop(0.5, '#d4ab4a');
  base.addColorStop(1, '#a67c22');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);

  // 竖向筒瓦：亮面 + 暗面
  const ribCount = 8;
  const ribW = 256 / ribCount;
  for (let i = 0; i < ribCount; i++) {
    const x = i * ribW;

    const hi = ctx.createLinearGradient(x, 0, x + ribW, 0);
    hi.addColorStop(0.0, 'rgba(255, 233, 160, 0.00)');
    hi.addColorStop(0.32, 'rgba(255, 238, 176, 0.85)');
    hi.addColorStop(0.55, 'rgba(232, 198, 112, 0.35)');
    hi.addColorStop(1.0, 'rgba(90, 62, 14, 0.42)');
    ctx.fillStyle = hi;
    ctx.fillRect(x, 0, ribW, 256);

    // 瓦缝阴影
    ctx.fillStyle = 'rgba(58, 40, 8, 0.55)';
    ctx.fillRect(x + ribW - 1.5, 0, 1.5, 256);
  }

  // 横向瓦垄分界
  for (let y = 0; y < 256; y += 32) {
    ctx.fillStyle = 'rgba(70, 48, 10, 0.28)';
    ctx.fillRect(0, y, 256, 2);
    ctx.fillStyle = 'rgba(255, 236, 170, 0.16)';
    ctx.fillRect(0, y + 2, 256, 1);
  }

  grain(ctx, 256, 256, 1400, 40);
  return finish(canvas, 1, 1);
}

/* ================================================================
   宫墙红：竖向拍子 + 轻微褪色
   ================================================================ */
export function createWallTexture() {
  const { canvas, ctx } = makeCanvas(256, 256);

  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#9e3527');
  g.addColorStop(0.45, '#b03a2b');
  g.addColorStop(1, '#8d2b1f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);

  // 竖向墙面肌理
  const rand = rng(77001);
  for (let i = 0; i < 40; i++) {
    const x = rand() * 256;
    const w = 2 + rand() * 10;
    ctx.fillStyle = rand() > 0.5
      ? 'rgba(255, 210, 190, 0.055)'
      : 'rgba(60, 12, 6, 0.06)';
    ctx.fillRect(x, 0, w, 256);
  }

  // 底部墙裙略深
  const skirt = ctx.createLinearGradient(0, 210, 0, 256);
  skirt.addColorStop(0, 'rgba(40, 8, 4, 0)');
  skirt.addColorStop(1, 'rgba(40, 8, 4, 0.42)');
  ctx.fillStyle = skirt;
  ctx.fillRect(0, 210, 256, 46);

  grain(ctx, 256, 256, 1800, 30);
  return finish(canvas, 1, 1);
}

/* ================================================================
   汉白玉台基
   ================================================================ */
export function createMarbleTexture() {
  const { canvas, ctx } = makeCanvas(256, 256);

  ctx.fillStyle = '#e6e0d0';
  ctx.fillRect(0, 0, 256, 256);

  const rand = rng(31337);
  // 石材拼缝
  ctx.strokeStyle = 'rgba(150, 142, 122, 0.35)';
  ctx.lineWidth = 1.5;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (256 / 4) * i);
    ctx.lineTo(256, (256 / 4) * i);
    ctx.stroke();
  }
  for (let i = 1; i < 4; i++) {
    const x = (256 / 4) * i + (i % 2 ? 16 : -16);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }

  // 石材斑驳
  for (let i = 0; i < 60; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 2 + rand() * 7;
    ctx.fillStyle = rand() > 0.5
      ? 'rgba(200, 193, 172, 0.07)'
      : 'rgba(255, 253, 246, 0.09)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 汉白玉本身要干净，不加噪点（否则远看像脏污）
  return finish(canvas, 1, 1);
}

/* ================================================================
   广场青砖地
   ================================================================ */
export function createStoneTexture() {
  const { canvas, ctx } = makeCanvas(256, 256);

  ctx.fillStyle = '#8e8b83';
  ctx.fillRect(0, 0, 256, 256);

  const rand = rng(9091);
  const cols = 4;
  const rows = 4;
  const cw = 256 / cols;
  const ch = 256 / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // 单块砖的明暗差压得很小，否则远看成一片噪点
      const shade = 138 + Math.floor(rand() * 9);
      ctx.fillStyle = `rgb(${shade + 5}, ${shade + 2}, ${shade - 5})`;
      ctx.fillRect(c * cw + 1, r * ch + 1, cw - 2, ch - 2);
    }
  }

  // 砖缝
  ctx.strokeStyle = 'rgba(70, 68, 63, 0.32)';
  ctx.lineWidth = 1.5;
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * ch);
    ctx.lineTo(256, r * ch);
    ctx.stroke();
  }
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath();
    ctx.moveTo(c * cw, 0);
    ctx.lineTo(c * cw, 256);
    ctx.stroke();
  }

  return finish(canvas, 1, 1);
}

/* ================================================================
   隔扇门窗：棂条格心
   ================================================================ */
export function createLatticeTexture() {
  const { canvas, ctx } = makeCanvas(256, 256);

  // 门框底色（深红木）
  ctx.fillStyle = '#4a1a12';
  ctx.fillRect(0, 0, 256, 256);

  // 格心区域
  const pad = 26;
  ctx.fillStyle = '#c9952f';
  ctx.fillRect(pad, pad, 256 - pad * 2, 256 - pad * 2);

  // 内层深色，形成棂条
  ctx.fillStyle = '#2c1109';
  ctx.fillRect(pad + 8, pad + 8, 256 - (pad + 8) * 2, 256 - (pad + 8) * 2);

  // 棂条网格
  ctx.strokeStyle = '#d9a83c';
  ctx.lineWidth = 5;
  const step = 26;
  for (let x = pad + 8; x <= 256 - pad - 8; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, pad + 8);
    ctx.lineTo(x, 256 - pad - 8);
    ctx.stroke();
  }
  for (let y = pad + 8; y <= 256 - pad - 8; y += step) {
    ctx.beginPath();
    ctx.moveTo(pad + 8, y);
    ctx.lineTo(256 - pad - 8, y);
    ctx.stroke();
  }

  // 门槛
  ctx.fillStyle = '#5b1f13';
  ctx.fillRect(0, 256 - 20, 256, 20);

  return finish(canvas, 1, 1);
}

/* ================================================================
   天空渐变（夜晚 / 白昼），用作场景背景贴图
   ================================================================ */
export function createSkyTexture(night = false) {
  const { canvas, ctx } = makeCanvas(16, 256);

  const g = ctx.createLinearGradient(0, 0, 0, 256);
  if (night) {
    g.addColorStop(0.00, '#04060e');
    g.addColorStop(0.34, '#0b1222');
    g.addColorStop(0.46, '#1b2438');
    g.addColorStop(0.50, '#3b3348');
    g.addColorStop(0.56, '#5a4038');
    g.addColorStop(1.00, '#241a16');
  } else {
    g.addColorStop(0.00, '#3f6ea6');
    g.addColorStop(0.22, '#5f8cbd');
    g.addColorStop(0.38, '#93b2d0');
    g.addColorStop(0.47, '#c9c8bd');
    g.addColorStop(0.52, '#e3d8c0');
    g.addColorStop(1.00, '#b9a98d');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}
