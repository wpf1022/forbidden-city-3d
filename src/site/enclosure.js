/**
 * 围合：宫墙、琉璃瓦墙帽、太和殿广场东西廊庑。
 *
 * 围合的意义不是"加几道墙"，而是把广场界定出来：
 * 每一段墙都首尾相接，并在殿宇平台处收口，
 * 否则从高空看会是一堆悬空的红条。
 */
import * as THREE from 'three';
import { mergeGeometries, instanced, trs, box, objectUV } from '../lib/geom.js';

/** 三角截面的墙帽（脊沿 z）。 */
function prism(len, w, h) {
  const L = len / 2;
  const v = [
    -w / 2, 0, -L, w / 2, 0, -L, 0, h, -L,
    -w / 2, 0, L, w / 2, 0, L, 0, h, L,
  ];
  const idx = [0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 墙身与墙帽的几何（本地 +z 为长度方向），由调用方摆放后统一合并。 */
function wallGeos({ len, height = 6.2, thickness = 1.8, capW = 2.9, capH = 1.0 }) {
  const body = mergeGeometries([
    box(thickness, height, len, 0, height / 2, 0),
    box(thickness + 0.5, 0.55, len, 0, 0.27, 0),
  ]);
  const capGeo = prism(len, capW, capH);
  capGeo.translate(0, height, 0);
  const cap = mergeGeometries([capGeo, box(capW + 0.3, 0.16, len, 0, height - 0.06, 0)]);
  return { body, cap };
}

/**
 * 在两点之间摆一段墙。
 * 25 段墙如果各自成 mesh 就是 50 次 draw call——这里只返回几何，
 * 由 buildEnclosure 合并成 2 个 mesh（墙身 + 墙帽）。
 */
function wallBetween(x0, z0, x1, z1, opts, out) {
  const len = Math.hypot(x1 - x0, z1 - z0) + (opts?.extend ?? 0);
  const { body, cap } = wallGeos({ ...opts, len });
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(x1 - x0, z1 - z0), 0)),
    new THREE.Vector3(1, 1, 1),
  );
  body.applyMatrix4(m);
  cap.applyMatrix4(m);
  out.body.push(body);
  out.cap.push(cap);
}

/**
 * 廊庑：沿墙的柱列 + 单坡瓦顶。
 * @param {number} x      柱列所在 x
 * @param {number} dir    +1 屋檐朝 +x
 * @param {number} wallX  后墙所在 x
 */
export function corridor({ x, z0, z1, dir, materials, wallX }) {
  const group = new THREE.Group();
  const len = Math.abs(z1 - z0);
  const zc = (z0 + z1) / 2;
  const colH = 5.4;
  const spacing = 4.2;
  const n = Math.max(2, Math.round(len / spacing));

  const mats = [];
  for (let i = 0; i <= n; i++) {
    mats.push(trs(x, 0, Math.min(z0, z1) + (len * i) / n));
  }
  const colGeo = mergeGeometries([
    (() => { const g = new THREE.CylinderGeometry(0.36, 0.4, colH, 12); g.translate(0, colH / 2, 0); return g; })(),
    (() => { const g = new THREE.CylinderGeometry(0.56, 0.6, 0.3, 12); g.translate(0, 0.15, 0); return g; })(),
  ]);
  group.add(instanced(colGeo, materials.column, mats, { castShadow: true }));

  group.add(new THREE.Mesh(box(0.5, 0.62, len, x, colH + 0.31, zc), materials.beam));

  const inner = wallX;
  const outer = x + dir * 1.9;
  const hInner = colH + 1.9;
  const hOuter = colH + 0.3;
  const w = Math.abs(outer - inner);
  const slope = Math.atan2(hInner - hOuter, w);
  const roofLen = Math.hypot(w, hInner - hOuter);
  const tile = new THREE.Mesh(objectUV(new THREE.BoxGeometry(roofLen, 0.34, len)), materials.roofTile);
  tile.geometry.rotateZ(-dir * slope);
  tile.position.set((inner + outer) / 2, (hInner + hOuter) / 2, zc);
  tile.castShadow = true;
  tile.receiveShadow = true;
  group.add(tile);

  group.add(new THREE.Mesh(box(0.48, 0.6, len, outer, hOuter - 0.04, zc), materials.ridgeTile));
  group.add(new THREE.Mesh(box(0.52, 0.46, len, inner - dir * 0.15, hInner + 0.08, zc), materials.ridgeTile));

  return group;
}

/** 整片围合。 */
export function buildEnclosure(materials) {
  const group = new THREE.Group();
  const opts = { materials, height: 6.4, thickness: 1.7, capW: 2.9, capH: 1.0 };
  const low = { ...opts, height: 5.6, capW: 2.6, capH: 0.9 };
  const walls = { body: [], cap: [] };
  const W = (x0, z0, x1, z1, o) => wallBetween(x0, z0, x1, z1, o, walls);

  /* 太和殿广场东西廊庑：柱列 ±92，后墙 ±99，自太和门北至太和殿台基 */
  for (const s of [-1, 1]) {
    group.add(corridor({ x: s * 92, dir: -s, wallX: s * 99, z0: -8, z1: 101, materials }));
    W(s * 99, 101, s * 99, -8, { ...opts, extend: 1.6 });
    W(s * 99, -8, s * 50, -8, low); // 北端收口到太和殿台基
    W(s * 99, 101, s * 36, 101, low); // 南端收口到太和门台基
  }

  /* 太和门广场两侧 */
  for (const s of [-1, 1]) {
    W(s * 76, 143, s * 76, 240, { ...opts, extend: 1.6 });
    W(s * 76, 143, s * 36, 143, low);
  }

  /* 中和殿 / 保和殿两侧，接太和殿与保和殿台基 */
  for (const s of [-1, 1]) {
    W(s * 68, -84, s * 68, -230, { ...low, extend: 1.6 });
    W(s * 68, -84, s * 50, -84, low);
    W(s * 68, -182, s * 35, -182, low);
    W(s * 68, -230, s * 35, -230, low);
  }

  /* 北墙 */
  W(-112, -252, 112, -252, { ...opts, extend: 2 });

  /* 外围东西墙 */
  for (const s of [-1, 1]) W(s * 112, -252, s * 112, 238, { ...opts, extend: 2 });

  /* 南端：午门两翼与外围墙之间的短墙 */
  for (const s of [-1, 1]) {
    W(s * 112, 238, s * 74, 238, low);
    W(s * 74, 238, s * 62, 246, low);
  }

  // 25 段墙合并成 2 个 mesh：draw call 从 50 降到 2
  const bodyMesh = new THREE.Mesh(objectUV(mergeGeometries(walls.body)), materials.wall);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);
  const capMesh = new THREE.Mesh(mergeGeometries(walls.cap), materials.ridgeTile);
  capMesh.castShadow = true;
  capMesh.receiveShadow = true;
  group.add(capMesh);

  return group;
}
