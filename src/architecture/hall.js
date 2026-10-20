/**
 * 殿宇装配：柱网 → 墙体 → 隔扇 → 额枋彩画 → 斗拱 → 屋顶。
 *
 * 一座殿的可调参数全部在 spec 里，不在函数体内埋魔法数字（PRD §6.3）。
 */
import * as THREE from 'three';
import { mergeGeometries, instanced, trs, box, objectUV } from '../lib/geom.js';
import { buildRoof, sweepRidge } from './roof.js';

const TAU = Math.PI * 2;

/* ────────────────────────── 通用零件 ────────────────────────── */

/** 檐柱：柱身 + 柱础。 */
function columnGeometry(h, r) {
  const shaft = new THREE.CylinderGeometry(r * 0.93, r, h, 14, 1);
  shaft.translate(0, h / 2, 0);
  const base = new THREE.CylinderGeometry(r * 1.42, r * 1.5, 0.34, 14);
  base.translate(0, 0.17, 0);
  return mergeGeometries([shaft, base]);
}

/** 斗拱：一攒（坐斗 + 三层栱 + 昂）。 */
function dougongGeometry() {
  const parts = [];
  parts.push(box(0.46, 0.26, 0.46, 0, 0.13, 0)); // 坐斗
  parts.push(box(1.02, 0.17, 0.24, 0, 0.36, 0)); // 一层栱
  parts.push(box(0.24, 0.17, 1.02, 0, 0.36, 0)); // 十字栱
  parts.push(box(1.32, 0.19, 0.26, 0, 0.6, 0)); // 二层栱
  parts.push(box(0.26, 0.19, 1.32, 0, 0.6, 0)); // 十字栱
  const ang = new THREE.BoxGeometry(0.24, 0.2, 1.5);
  ang.translate(0, 0.86, 0.22);
  parts.push(ang);
  parts.push(box(0.9, 0.18, 0.22, 0, 0.9, 0));
  return mergeGeometries(parts);
}

/** 额枋环：四面贴彩画。 */
function beamRing(w, d, h, uvScale = 6) {
  const geos = [];
  const mk = (len) => {
    const g = new THREE.PlaneGeometry(len, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / uvScale));
    return g;
  };
  const front = mk(w);
  front.translate(0, h / 2, d / 2);
  geos.push(front);
  const back = mk(w);
  back.rotateY(Math.PI);
  back.translate(0, h / 2, -d / 2);
  geos.push(back);
  const right = mk(d);
  right.rotateY(Math.PI / 2);
  right.translate(w / 2, h / 2, 0);
  geos.push(right);
  const left = mk(d);
  left.rotateY(-Math.PI / 2);
  left.translate(-w / 2, h / 2, 0);
  geos.push(left);
  return mergeGeometries(geos);
}

/** 隔扇门/窗：玻璃心的门扇，UV 按开间数平铺。 */
function doorPanel(w, h, leaves) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * leaves);
  return g;
}

/* ────────────────────────── 殿宇 ────────────────────────── */

export function buildHall({
  w, d, colH, x = 0, z = 0, y = 0,
  baysX = 9, baysZ = 5,
  materials,
  roofType = 'hip',
  doubleRoof = false,
  overhang = 3.6,
  upperOverhang = 3.0,
  slope = 0.62,
  tCut = 0.35,
  upperWallH = 3.2,
  dougongH = 0.8,
  beamH = 0.95,
  doorRatio = 0.62,
  plaque = null,
  wallInset = 0.55,
  name = '',
  roofLift = 0.72,
  roofFlare = 0.62,
}) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.name = name || 'hall';

  const colR = Math.max(0.34, Math.min(0.62, w / 110));
  const wallH = colH * 0.9;
  const halfW = w / 2, halfD = d / 2;

  /* ── 柱网 ── */
  const colMats = [];
  const xStep = w / baysX;
  const zStep = d / baysZ;
  for (let i = 0; i <= baysX; i++) {
    const px = -halfW + i * xStep;
    colMats.push(trs(px, 0, halfD));
    if (i > 0 && i < baysX) colMats.push(trs(px, 0, -halfD));
    else colMats.push(trs(px, 0, -halfD));
  }
  for (let j = 1; j < baysZ; j++) {
    const pz = -halfD + j * zStep;
    colMats.push(trs(halfW, 0, pz));
    colMats.push(trs(-halfW, 0, pz));
  }
  const cols = instanced(columnGeometry(colH, colR), materials.column, colMats, { castShadow: true });
  group.add(cols);

  /* ── 墙体 ── */
  const wallW = w - 2 * wallInset - colR * 0.4;
  const wallD = d - 2 * wallInset - colR * 0.4;
  const walls = new THREE.Mesh(objectUV(box(wallW, wallH, wallD, 0, wallH / 2, 0)), materials.wall);
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  /* ── 正面隔扇门 ── */
  const doorH = colH * doorRatio;
  const doorW = wallW - 0.6;
  const leaves = Math.max(4, Math.round(doorW / 2.4));
  // 四面门/窗用同一种材质，合并成一个 mesh（每座殿省 3 次 draw call）
  const doorGeos = [];
  {
    const g = doorPanel(doorW, doorH, leaves);
    g.translate(0, doorH / 2 + 0.35, wallD / 2 + 0.03);
    doorGeos.push(g);
  }
  // 背面与两山的槛窗
  for (const side of ['-z', '+x', '-x']) {
    const len = (side === '-z' ? wallW : wallD) - 0.8;
    const n = Math.max(4, Math.round(len / 2.4));
    const g = doorPanel(len, doorH * 0.72, n);
    if (side === '-z') {
      g.rotateY(Math.PI);
      g.translate(0, doorH * 0.36 + 0.35, -wallD / 2 - 0.03);
    } else {
      g.rotateY((side === '+x' ? 1 : -1) * (Math.PI / 2));
      g.translate((side === '+x' ? 1 : -1) * (wallW / 2 + 0.03), doorH * 0.36 + 0.35, 0);
    }
    doorGeos.push(g);
  }

  /* 槛墙：门下的矮墙，避免隔扇直接落地显得轻飘 */
  {
    const skirting = new THREE.Mesh(objectUV(box(wallW, 0.35, wallD, 0, 0.175, 0)), materials.marbleWarm);
    skirting.castShadow = true;
    skirting.receiveShadow = true;
    group.add(skirting);
  }

  /* 四面门窗合并成一个 mesh（同材质，省 3~5 次 draw call） */
  if (doorGeos.length) {
    const dm = new THREE.Mesh(mergeGeometries(doorGeos), materials.door);
    dm.receiveShadow = true;
    group.add(dm);
  }

  /* ── 额枋与平板枋 ── */
  const beamY = wallH;
  {
    const ring = new THREE.Mesh(beamRing(w, d, beamH), materials.beam);
    ring.position.y = beamY;
    ring.castShadow = true;
    group.add(ring);
    const flat = new THREE.Mesh(box(w + 0.5, 0.22, d + 0.5, 0, beamY + beamH + 0.11, 0), materials.column);
    flat.castShadow = true;
    group.add(flat);
  }

  /* ── 斗拱 ── */
  const eaveY = beamY + beamH + dougongH;
  {
    const mats = [];
    const spacing = 1.22;
    const ring = [
      { len: w, axis: 'x', off: halfD },
      { len: w, axis: 'x', off: -halfD },
      { len: d, axis: 'z', off: halfW },
      { len: d, axis: 'z', off: -halfW },
    ];
    for (const r of ring) {
      const n = Math.max(3, Math.round(r.len / spacing));
      const ry = r.axis === 'x' ? 0 : Math.PI / 2;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5;
        const px = r.axis === 'x' ? t * r.len : r.off;
        const pz = r.axis === 'x' ? r.off : t * r.len;
        mats.push(trs(px, beamY + beamH + 0.2, pz, ry));
      }
    }
    const dg = instanced(dougongGeometry(), materials.dougong, mats, { castShadow: true });
    group.add(dg);
  }

  /* ── 屋顶 ── */
  // 屋面按"脊沿长边"生成；若进深大于面阔则整体旋转 90°，
  // 这样同一套屋顶函数可以同时服务太和殿与南北向的雁翅楼。
  const W1 = w + 2 * overhang;
  const D1 = d + 2 * overhang;
  const swap = W1 < D1;
  const W1r = swap ? D1 : W1;
  const D1r = swap ? W1 : D1;

  const roofCommon = {
    materials, m0: 0.45, m1: 1.7, lift: roofLift, flare: roofFlare,
    ridgeWidth: Math.min(1.9, Math.max(0.62, W1r / 42)),
    ridgeHeight: Math.min(1.75, Math.max(0.55, W1r / 44)),
    hipWidth: Math.min(0.92, Math.max(0.4, W1r / 88)),
    hipHeight: Math.min(0.95, Math.max(0.42, W1r / 82)),
    eaveRoll: Math.min(0.3, Math.max(0.13, W1r / 240)),
  };
  const addRoof = (Wr, Dr, H, extra = {}) => {
    const r = buildRoof({ ...roofCommon, W: Wr, D: Dr, H, ...extra });
    if (swap) r.group.rotation.y = Math.PI / 2;
    return r;
  };

  const H1 = (D1r / 2) * slope;
  let ridgeTop;

  if (doubleRoof) {
    const lower = addRoof(W1r, D1r, H1, { type: 'hip', tCut, uSeg: 30, vSeg: 8 });
    lower.group.position.y = eaveY;
    group.add(lower.group);

    // 上层殿身尺寸由下部屋面收分决定：半宽 = W1/2 − (D1/2)·tCut
    const W2r = W1r - D1r * tCut;
    const D2r = D1r * (1 - tCut);
    const W2 = swap ? D2r : W2r;
    const D2 = swap ? W2r : D2r;
    const upperBase = eaveY + H1 * hermiteAt(tCut);
    const upperTop = upperBase + upperWallH;

    // 围脊：下层屋面与上层墙交界的封边
    {
      const g = new THREE.Mesh(box(W2 + 0.3, 0.55, D2 + 0.3, 0, upperBase + 0.1, 0), materials.ridgeTile);
      g.castShadow = true;
      group.add(g);
    }

    // 上层墙（含横向槛窗）
    const uw = new THREE.Mesh(box(W2 - 0.5, upperWallH, D2 - 0.5, 0, upperBase + upperWallH / 2, 0), materials.wall);
    uw.castShadow = true;
    uw.receiveShadow = true;
    group.add(uw);
    {
      const leavesN = Math.max(4, Math.round(W2 / 2.6));
      const g = doorPanel(W2 - 1.4, upperWallH * 0.72, leavesN);
      g.translate(0, upperBase + upperWallH * 0.42, (D2 - 0.5) / 2 + 0.03);
      doorGeos.push(g);
      const gb = doorPanel(W2 - 1.4, upperWallH * 0.72, leavesN);
      gb.rotateY(Math.PI);
      gb.translate(0, upperBase + upperWallH * 0.42, -(D2 - 0.5) / 2 - 0.03);
      doorGeos.push(gb);
    }

    const W3r = W2r + 2 * upperOverhang;
    const D3r = D2r + 2 * upperOverhang;
    const H3 = (D3r / 2) * slope;
    const upper = addRoof(W3r, D3r, H3, { type: roofType, uSeg: 34, vSeg: 14 });
    upper.group.position.y = upperTop;
    group.add(upper.group);
    ridgeTop = upperTop + H3;

    if (plaque) {
      const sign = makePlaque(plaque, Math.min(4.6, w * 0.13), materials);
      sign.position.set(0, eaveY - 1.5, halfD + 0.45);
      group.add(sign);
    }
  } else {
    const roof = addRoof(W1r, D1r, H1, { type: roofType, uSeg: 30, vSeg: 14 });
    roof.group.position.y = eaveY;
    group.add(roof.group);
    ridgeTop = eaveY + H1;
    if (plaque) {
      const sign = makePlaque(plaque, Math.min(4.6, w * 0.13), materials);
      sign.position.set(0, eaveY - 1.7, halfD + 0.45);
      group.add(sign);
    }
  }

  return {
    group,
    eaveY,
    topY: ridgeTop,
    labelAnchor: new THREE.Vector3(0, ridgeTop + 2.0, 0),
    size: { w: W1, d: D1 },
    // 相机 keep-out：只包住墙体本身（含一点余量），不包出檐，
    // 这样站在台基上贴着檐下看仍然合法，而钻不进建筑内部。
    volume: {
      cx: x, cz: z,
      cy: y + ridgeTop / 2,
      hx: w / 2 + 1.2,
      hy: ridgeTop / 2,
      hz: d / 2 + 1.2,
    },
  };
}

function hermiteAt(t, m0 = 0.45, m1 = 1.7) {
  const t2 = t * t, t3 = t2 * t;
  return (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) + (t3 - t2) * m1;
}

/** 匾额：金框蓝底 + 程序生成的金字。 */
function makePlaque(text, width, materials) {
  const g = new THREE.Group();
  const h = width * 0.34;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(width, h, 0.18), materials.gold);
  frame.castShadow = true;
  g.add(frame);
  const t = materials.factory?.get('plaque:' + text);
  const faceMat = new THREE.MeshStandardMaterial({
    map: t ? t.map : null,
    color: 0xffffff,
    roughness: 0.5,
    metalness: 0.15,
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.2, h - 0.2), faceMat);
  face.position.z = 0.1;
  g.add(face);
  return g;
}
