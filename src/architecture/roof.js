/**
 * 屋顶几何：庑殿 / 歇山 / 攒尖 / 悬山。
 *
 * 统一的高度场：
 *   t ∈ [0,1]      自檐口向脊的坡向参数
 *   y(t)   = H·f(t)                 f 为三次 Hermite；f'(0) < f'(1) → 檐缓脊陡（举折）
 *   w(t)   = 檐口半宽 → 脊端半宽     平面收分与 t 线性，故垂脊在平面上是直线
 *   z(t)   = (D/2)·(1−t)
 *
 * 平面线性收分 + 高度非线性，使得垂脊在平面上仍是 45° 直线、而立面呈凹曲线，
 * 这正是中国屋顶与"金字塔"的差别。
 *
 * 翼角起翘（lift）与出冲（flare）只作用于檐口附近的角部并沿 (1−t) 衰减到 0，
 * 相邻两坡在角点共用同一套位移，因此不会开缝。
 */
import * as THREE from 'three';
import { hermite } from '../lib/noise.js';
import { mergeGeometries } from '../lib/geom.js';

const UP = new THREE.Vector3(0, 1, 0);

/** 角部权重：檐口中段为 0，越靠角越接近 1（smoothstep，起翘起点无折角）。 */
function cornerWeight(s, t, start = 0.3, falloff = 0.9) {
  const u = Math.max(0, (Math.abs(s) - start) / (1 - start));
  const w = u * u * (3 - 2 * u);
  return w * Math.pow(Math.max(0, 1 - t / falloff), 2.0);
}

/**
 * 生成单个坡面。
 * @param axAt (t) => 该高度处檐口方向的半宽
 */
function makeFace(o) {
  const {
    axAt, b, H, m0, m1, t0, t1, axis, lift, flare, uSeg, vSeg, eaveLen,
  } = o;

  const alongX = axis === '+z' || axis === '-z';
  const outSign = axis === '+z' || axis === '+x' ? 1 : -1;

  const verts = [];
  const uvs = [];
  const idx = [];
  const zAt = (t) => b * (1 - t);

  // 坡向弧长（用作 v 坐标），一次性算出各层采样点的累计值
  const vs = [0];
  {
    let py = H * hermite(t0, m0, m1);
    let pz = zAt(t0);
    for (let j = 1; j <= vSeg; j++) {
      const t = t0 + ((t1 - t0) * j) / vSeg;
      const y = H * hermite(t, m0, m1);
      const z = zAt(t);
      vs.push(vs[j - 1] + Math.hypot(y - py, z - pz));
      py = y;
      pz = z;
    }
  }

  for (let j = 0; j <= vSeg; j++) {
    const t = t0 + ((t1 - t0) * j) / vSeg;
    const yBase = H * hermite(t, m0, m1);
    const ax = axAt(t);
    const az = zAt(t);
    const v = vs[j];

    for (let i = 0; i <= uSeg; i++) {
      const s = -1 + (2 * i) / uSeg;
      let x, z, y;
      if (alongX) {
        x = s * ax;
        z = outSign * az;
      } else {
        z = s * az;
        x = outSign * ax;
      }
      const cw = lift || flare ? cornerWeight(s, t) : 0;
      if (cw > 0) {
        y = yBase + lift * cw;
        const push = flare * cw * 0.7071;
        if (alongX) {
          x += Math.sign(s) * push;
          z += outSign * push;
        } else {
          z += Math.sign(s) * push;
          x += outSign * push;
        }
      } else {
        y = yBase;
      }
      verts.push(x, y, z);
      uvs.push(s * eaveLen, v);
    }
  }

  const at = (i, j) => j * (uSeg + 1) + i;
  // 用中心四边形判定绕序，保证法线朝天
  const i0 = Math.floor(uSeg / 2), j0 = Math.floor(vSeg / 2);
  const P = (i, j) => new THREE.Vector3(verts[at(i, j) * 3], verts[at(i, j) * 3 + 1], verts[at(i, j) * 3 + 2]);
  const n = P(i0 + 1, j0).sub(P(i0, j0)).cross(P(i0, j0 + 1).sub(P(i0, j0)));
  const flip = n.dot(UP) < 0;

  for (let j = 0; j < vSeg; j++) {
    for (let i = 0; i < uSeg; i++) {
      if (flip) {
        idx.push(at(i, j), at(i, j + 1), at(i + 1, j));
        idx.push(at(i + 1, j), at(i, j + 1), at(i + 1, j + 1));
      } else {
        idx.push(at(i, j), at(i + 1, j), at(i, j + 1));
        idx.push(at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, verts, uvs, uSeg, vSeg };
}

/** 由坡面生成：底面（下移 thickness）+ 檐口封边 + 内边封边。 */
function makeShell(face, thickness, { closeTop = false, closeEave = true } = {}) {
  const { verts, uvs, uSeg, vSeg } = face;
  const n = (uSeg + 1) * (vSeg + 1);
  const bot = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    bot[i * 3] = verts[i * 3];
    bot[i * 3 + 1] = verts[i * 3 + 1] - thickness;
    bot[i * 3 + 2] = verts[i * 3 + 2];
  }
  const at = (i, j) => j * (uSeg + 1) + i;

  // 下壳的绕序必须**由顶面的绕序推导**，不能自己再按网格顺序生成一遍：
  // 顶面的朝向是在 makeFace 里按面逐个判定的（南北面相反），
  // 若这里独立生成，某些面会与顶面同向 → 从下方看是背面 → 被剔除。
  // 反序即"面朝下"，computeVertexNormals 会自然给出朝下的法线，
  // 不需要（也不应该）再对法线取反：剔除看的是绕序，不是法线。
  const topIdx = face.geo.index.array;
  const idx = [];
  for (let i = 0; i < topIdx.length; i += 3) {
    idx.push(topIdx[i], topIdx[i + 2], topIdx[i + 1]);
  }
  const under = new THREE.BufferGeometry();
  under.setAttribute('position', new THREE.BufferAttribute(bot, 3));
  under.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  under.setIndex(idx);
  under.computeVertexNormals();

  const strips = [];
  const strip = (rowA, rowB) => {
    const v = [], id = [];
    for (let i = 0; i <= uSeg; i++) {
      const top = rowA(i), bottom = rowB(i);
      v.push(top.x, top.y, top.z, bottom.x, bottom.y, bottom.z);
    }
    for (let i = 0; i < uSeg; i++) {
      const a0 = i * 2, b0 = i * 2 + 1, a1 = i * 2 + 2, b1 = i * 2 + 3;
      id.push(a0, b0, a1, a1, b0, b1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(id);
    g.computeVertexNormals();
    return g;
  };
  const pTop = (i) => new THREE.Vector3(verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]);
  const pBot = (i) => new THREE.Vector3(bot[i * 3], bot[i * 3 + 1], bot[i * 3 + 2]);
  if (closeEave) strips.push(strip((i) => pTop(at(i, 0)), (i) => pBot(at(i, 0))));
  if (closeTop) strips.push(strip((i) => pTop(at(i, vSeg)), (i) => pBot(at(i, vSeg))));

  return {
    under,
    fascia: strips.length ? mergeGeometries(strips) : null,
  };
}

/** 把折线扫成方形截面的脊。 */
export function sweepRidge(points, width, height, { taper = 0, base = -0.15, top = 0.85 } = {}) {
  const n = points.length;
  const pos = [];
  const idx = [];
  const tan = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const p = points[i];
    if (i < n - 1) tan.copy(points[i + 1]).sub(p);
    else tan.copy(p).sub(points[i - 1]);
    tan.y = 0;
    if (tan.lengthSq() < 1e-9) tan.set(0, 0, 1);
    tan.normalize();
    const side = new THREE.Vector3(-tan.z, 0, tan.x);
    const k = 1 - taper * (i / Math.max(1, n - 1));
    const w = (width / 2) * k, h = height * k;
    const b1 = p.clone().addScaledVector(side, -w).addScaledVector(UP, -h * -base);
    const b2 = p.clone().addScaledVector(side, w).addScaledVector(UP, -h * -base);
    const t1 = p.clone().addScaledVector(side, -w * 0.7).addScaledVector(UP, h * top);
    const t2 = p.clone().addScaledVector(side, w * 0.7).addScaledVector(UP, h * top);
    pos.push(b1.x, b1.y, b1.z, b2.x, b2.y, b2.z, t2.x, t2.y, t2.z, t1.x, t1.y, t1.z);
  }
  // 截面顶点顺序是 b1,b2,t2,t1（b=底，t=顶，2 在 +side 侧）。
  // 绕序按 side×up=-tan 推导：-side 面外向为 -side，+side 面外向为 +side，顶面外向为 +up。
  for (let i = 0; i < n - 1; i++) {
    const a = i * 4, c = (i + 1) * 4;
    idx.push(a, a + 3, c, a + 3, c + 3, c); // -side 侧面
    idx.push(a + 1, c + 1, a + 2, a + 2, c + 1, c + 2); // +side 侧面
    idx.push(a + 3, a + 2, c + 3, a + 2, c + 2, c + 3); // 顶面
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** 把坡面 t=0 的一行取出来做檐口线。 */
function eaveLine(face) {
  const { verts, uSeg } = face;
  const pts = [];
  for (let i = 0; i <= uSeg; i++) {
    pts.push(new THREE.Vector3(verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]));
  }
  return pts;
}

/** 正脊两端的吻：体块 + 翻卷的尾部，挤出成厚板。 */
function makeWen(height = 2.9, thick = 0.86) {
  const s = new THREE.Shape();
  const k = height / 2.9;
  const pts = [
    [-1.28, 0], [1.28, 0], [1.34, 0.46], [1.16, 1.02],
    [1.42, 1.44], [1.5, 1.92], [1.18, 2.16], [0.66, 2.02],
    [0.42, 1.5], [0.05, 1.34], [-0.34, 1.52],
    [-0.72, 1.1], [-1.24, 0.5],
  ];
  s.moveTo(pts[0][0] * 1.0, pts[0][1] * k);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1] * k);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: thick,
    bevelEnabled: true,
    bevelSize: 0.1,
    bevelThickness: 0.1,
    bevelSegments: 2,
    curveSegments: 6,
  });
  g.translate(0, 0, -thick / 2);
  return g;
}

/**
 * 构建一套屋顶。
 */
export function buildRoof({
  W, D, H,
  type = 'hip',
  m0 = 0.45, m1 = 1.7,
  lift = 0.72,
  flare = 0.62,
  thickness = 0.55,
  tCut = 1,
  gableT = 0.52,
  uSeg = 24,
  vSeg = 12,
  materials,
  ridgeWidth = 1.05,
  ridgeHeight = 1.15,
  hipWidth = 0.6,
  hipHeight = 0.62,
  ridgeOverhang = 0.45,
  withRidges = true,
  finial = null,
  eaveRoll = 0.24,
}) {
  const a = W / 2;
  const b = D / 2;
  const group = new THREE.Group();
  const tops = [], unders = [], fascias = [], gables = [], barges = [];
  const hipPolys = [];
  const eavePolys = [];

  const isPyramid = type === 'pyramid';
  const isGable = type === 'gable';
  const rlHip = Math.max(0.001, a - b);
  const rlFull = isPyramid ? 0 : isGable ? a : rlHip;

  const linAx = (aTop) => (t) => a - (a - aTop) * t;

  const addFace = (axis, t0, t1, axAt, opts = {}) => {
    const alongX = axis === '+z' || axis === '-z';
    const eaveLen = alongX ? axAt(t0) : b;
    const f = makeFace({
      axAt, b, H, m0, m1, t0, t1, axis,
      lift: (opts.liftK ?? 1) * lift,
      flare: (opts.flareK ?? 1) * flare,
      uSeg, vSeg: Math.max(2, Math.round(vSeg * (t1 - t0))),
      eaveLen,
    });
    tops.push(f.geo);
    const { under, fascia } = makeShell(f, thickness, {
      closeTop: opts.closeTop ?? t1 < 1,
      closeEave: true,
    });
    unders.push(under);
    if (fascia) fascias.push(fascia);
    if (t0 === 0 && eaveRoll > 0) eavePolys.push(eaveLine(f));
    return f;
  };

  let ridgeY = H;
  let ridgeHalf = rlFull;

  if (type === 'gableHip') {
    const t1 = gableT;
    for (const ax of ['+z', '-z', '+x', '-x']) addFace(ax, 0, t1, linAx(rlHip));
    const w1 = a - b * t1;
    for (const ax of ['+z', '-z']) {
      addFace(ax, t1, 1, () => w1, { liftK: 0, flareK: 0, closeTop: false });
    }
    ridgeHalf = w1;

    const y1 = H * hermite(t1, m0, m1);
    const z1 = b * (1 - t1);
    for (const sx of [-1, 1]) {
      gables.push(makeGablePanel(sx * w1, y1, H, b, t1, m0, m1));
      barges.push(makeBargeboard(sx * (w1 + 0.07), z1, H, t1, m0, m1));
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        hipPolys.push(hipCurve(sx, sz, a, b, rlHip, t1, H, m0, m1, lift, flare, 1, true));
      }
    }
  } else if (type === 'gable') {
    for (const ax of ['+z', '-z']) addFace(ax, 0, 1, linAx(a), { closeTop: false });
  } else if (isPyramid) {
    for (const ax of ['+z', '-z', '+x', '-x']) addFace(ax, 0, 1, (t) => a * (1 - t), { closeTop: false });
    ridgeHalf = 0;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        hipPolys.push(hipCurve(sx, sz, a, b, 0, 1, H, m0, m1, lift, flare, 1, true));
      }
    }
  } else if (tCut < 1) {
    // 腰檐：只有一圈裙坡，没有正脊。
    // 之前这里把截口宽当成 ridgeHalf，于是共享的脊生成器在肩上架了一条
    // 正脊 + 两个吻（埋在围脊里、从上屋墙两侧露头）——截口处本应只有 hall.js
    // 提供的围脊，所以这里必须显式置 0 并补齐四条垂脊。
    for (const ax of ['+z', '-z', '+x', '-x']) addFace(ax, 0, tCut, linAx(rlHip));
    ridgeY = H * hermite(tCut, m0, m1);
    ridgeHalf = 0;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        hipPolys.push(hipCurve(sx, sz, a, b, rlHip, tCut, H, m0, m1, lift, flare, 9, true));
      }
    }
  } else {
    for (const ax of ['+z', '-z', '+x', '-x']) addFace(ax, 0, 1, linAx(rlFull), { closeTop: false });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        hipPolys.push(hipCurve(sx, sz, a, b, rlFull, 1, H, m0, m1, lift, flare, 1, true));
      }
    }
  }

  const topMesh = new THREE.Mesh(mergeGeometries(tops), materials.roofTile);
  topMesh.castShadow = true;
  topMesh.receiveShadow = true;
  topMesh.name = 'roofTop';
  group.add(topMesh);

  const underMesh = new THREE.Mesh(mergeGeometries(unders), materials.soffit);
  underMesh.receiveShadow = true;
  underMesh.name = 'roofUnder';
  group.add(underMesh);

  if (fascias.length) {
    const fm = new THREE.Mesh(mergeGeometries(fascias), materials.fascia || materials.ridgeTile);
    fm.castShadow = true;
    fm.receiveShadow = true;
    group.add(fm);
  }
  if (gables.length) {
    const gm = new THREE.Mesh(mergeGeometries(gables), materials.gablePanel || materials.soffit);
    gm.castShadow = true;
    gm.receiveShadow = true;
    group.add(gm);
  }
  if (barges.length) {
    const bm = new THREE.Mesh(mergeGeometries(barges), materials.darkWood || materials.soffit);
    bm.castShadow = true;
    group.add(bm);
  }

  // 檐口瓦当：沿檐口线扫一道圆边，让屋顶边缘有厚度而不是一张纸
  if (eaveRoll > 0 && eavePolys.length) {
    const rolls = eavePolys.map((pts) => sweepRidge(pts, eaveRoll * 2.1, eaveRoll, { base: 0.2, top: 0.35 }));
    const rm = new THREE.Mesh(mergeGeometries(rolls), materials.fascia || materials.ridgeTile);
    rm.castShadow = true;
    rm.receiveShadow = true;
    group.add(rm);
  }

  // ── 脊 ──────────────────────────────────────────────
  // 正脊、垂脊、吻全部用同一种琉璃材质，合并成一个 mesh：
  // 一座重檐殿能少 12 个 draw call（PRD §6.1 单帧 ≤ 300）。
  const ridgeGeos = [];
  if (withRidges) {
    if (ridgeHalf > 0.4) {
      const pts = [
        new THREE.Vector3(-ridgeHalf - ridgeOverhang, ridgeY, 0),
        new THREE.Vector3(-ridgeHalf * 0.55, ridgeY + ridgeHeight * 0.12, 0),
        new THREE.Vector3(ridgeHalf * 0.55, ridgeY + ridgeHeight * 0.12, 0),
        new THREE.Vector3(ridgeHalf + ridgeOverhang, ridgeY, 0),
      ];
      ridgeGeos.push(sweepRidge(pts, ridgeWidth, ridgeHeight, { taper: 0.1 }));

      // 正脊两端的吻（螭吻）：屋面最抓人的轮廓细节
      const wen = makeWen(ridgeHeight * 1.95, ridgeWidth * 0.94);
      for (const sgn of [-1, 1]) {
        const g = wen.clone();
        g.applyMatrix4(new THREE.Matrix4().compose(
          new THREE.Vector3(sgn * (ridgeHalf + ridgeOverhang * 0.85), ridgeY + ridgeHeight * 0.42, 0),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sgn > 0 ? Math.PI : 0, 0)),
          new THREE.Vector3(1, 1, 1),
        ));
        ridgeGeos.push(g);
      }
      wen.dispose();
    }
    for (const poly of hipPolys) {
      ridgeGeos.push(sweepRidge(poly, hipWidth, hipHeight, { taper: 0.22 }));
    }
  }
  if (ridgeGeos.length) {
    const rm = new THREE.Mesh(mergeGeometries(ridgeGeos), materials.ridgeTile);
    rm.castShadow = true;
    rm.receiveShadow = true;
    rm.name = 'ridges';
    group.add(rm);
  }

  if (finial) group.add(finial);

  return { group, ridge: { y: ridgeY, half: ridgeHalf }, hips: hipPolys, height: H };
}

/** 一条垂脊的折线。tMax 为脊线终点参数。 */
function hipCurve(sx, sz, a, b, rl, tMax, H, m0, m1, lift, flare, N = 12, liftOn = true) {
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * tMax * 0.9995;
    const f = hermite(t, m0, m1);
    const ax = a - (a - rl) * t;
    const az = b * (1 - t);
    const cw = liftOn ? cornerWeight(1, t) : 0;
    const push = flare * cw * 0.7071;
    pts.push(new THREE.Vector3(sx * (ax + push), H * f + lift * cw, sz * (az + push)));
  }
  return pts;
}

/** 歇山山花：竖向填充到上方坡面的竖板（横跨整个进深）。 */
function makeGablePanel(x, y1, H, b, t1, m0, m1) {
  const vSeg = 14, uSeg = 6;
  const z1 = b * (1 - t1);
  const verts = [], idx = [];
  for (let j = 0; j <= vSeg; j++) {
    const z = -z1 + (2 * z1 * j) / vSeg;
    const t = 1 - Math.abs(z) / b;
    const yTop = H * hermite(Math.max(t1, t), m0, m1);
    for (let i = 0; i <= uSeg; i++) {
      const phi = i / uSeg;
      verts.push(x, y1 + (yTop - y1) * phi, z);
    }
  }
  // x>0 的面朝 +x：绕序取 (a0,b0,c0)，法线 = dy × dz = +x
  const outward = x > 0;
  for (let j = 0; j < vSeg; j++) {
    for (let i = 0; i < uSeg; i++) {
      const a0 = j * (uSeg + 1) + i, b0 = a0 + 1, c0 = a0 + uSeg + 1, d0 = c0 + 1;
      if (outward) idx.push(a0, b0, c0, b0, d0, c0);
      else idx.push(a0, c0, b0, b0, c0, d0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 博风板：沿山花斜边的一条薄木封边。 */
function makeBargeboard(x, z1, H, t1, m0, m1) {
  const N = 12;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const tt = t1 + ((1 - t1) * i) / N;
    pts.push(new THREE.Vector3(x, H * hermite(tt, m0, m1), z1 * (1 - i / N)));
  }
  const geoms = [];
  const thick = 0.18, drop = 0.62;
  const q = new THREE.Quaternion();
  const mid = new THREE.Vector3();
  const dir = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const p0 = pts[i], p1 = pts[i + 1];
    const len = p0.distanceTo(p1);
    if (len < 1e-5) continue;
    const g = new THREE.BoxGeometry(thick, drop, len * 1.05);
    mid.copy(p0).add(p1).multiplyScalar(0.5);
    mid.y -= drop * 0.5;
    dir.copy(p1).sub(p0).normalize();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
    geoms.push(g);
  }
  return mergeGeometries(geoms);
}
