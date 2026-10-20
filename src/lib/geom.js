/**
 * 几何工具：合并、实例化、常用形体。
 *
 * 不引入 three 的 addons（PRD §6.3：除 three.js 外零第三方库），
 * 因此这里自己实现 BufferGeometry 合并与实例化装配。
 * 重复构件（望柱、斗拱、椽子、瓦当）一律走 InstancedMesh，
 * 目的是把单帧 draw call 压在 300 以内（PRD §6.1）。
 */
import * as THREE from 'three';

/** 把若干几何合并成一个（需要 position/normal/uv，可选 color）。 */
export function mergeGeometries(list) {
  const geoms = list.filter(Boolean);
  if (geoms.length === 0) return new THREE.BufferGeometry();
  if (geoms.length === 1) return geoms[0];

  const hasColor = geoms.every((g) => g.attributes.color);
  let vCount = 0, iCount = 0;
  for (const g of geoms) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }

  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const col = hasColor ? new Float32Array(vCount * 3) : null;
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);

  let vo = 0, io = 0;
  for (const g of geoms) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const t = g.attributes.uv;
    pos.set(p.array.subarray(0, p.count * 3), vo * 3);
    if (n) nor.set(n.array.subarray(0, n.count * 3), vo * 3);
    if (t) uv.set(t.array.subarray(0, t.count * 2), vo * 2);
    if (col) col.set(g.attributes.color.array.subarray(0, p.count * 3), vo * 3);
    if (g.index) {
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
      io += gi.length;
    } else {
      for (let i = 0; i < p.count; i++) idx[io + i] = i + vo;
      io += p.count;
    }
    vo += p.count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/** 用一组 Matrix4 生成 InstancedMesh。 */
export function instanced(geometry, material, matrices, { castShadow = true, receiveShadow = true } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, matrices.length));
  mesh.count = matrices.length;
  const m = new THREE.Matrix4();
  matrices.forEach((mat, i) => {
    m.copy(mat);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.frustumCulled = false;
  return mesh;
}

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/** 构造一个变换矩阵：位置 / 旋转（弧度） / 缩放。 */
export function trs(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _v.set(x, y, z);
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_v, _q, _s);
}

/** 位移 + 旋转后的几何（用于把零件摆到位的静态合并）。 */
export function xform(geometry, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, scale = 1) {
  const g = geometry.clone();
  _m4.compose(
    _v.set(x, y, z),
    _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')),
    _s.set(scale, scale, scale),
  );
  g.applyMatrix4(_m4);
  return g;
}

export function box(w, h, d, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (x || y || z || ry) g.applyMatrix4(trs(x, y, z, ry));
  return g;
}

export function cyl(rTop, rBottom, h, seg = 16, x = 0, y = 0, z = 0) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg);
  if (x || y || z) g.translate(x, y, z);
  return g;
}

/**
 * 按世界坐标生成平面 UV（每 uvScale 米重复一次），
 * 避免大平面被拉伸成模糊一片。
 */
export function worldUV(geometry, uvScale = 1) {
  const p = geometry.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) / uvScale;
    uv[i * 2 + 1] = p.getZ(i) / uvScale;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/**
 * 按世界坐标重算 UV（米制）。
 *
 * 全项目的贴图都按"每 UV 单位 = 1 米、纹理 repeat = 1/贴图米数"配置，
 * 但 Box/Plane 的默认 UV 是每个面 0..1 —— 两者混用会让 99 米的台基
 * 与 0.3 米的望柱得到同样的纹理密度（台基被拉伸 33 倍）。
 * 这个函数按主轴投影重算 UV，是"米制 UV"这条约定的唯一执行点。
 */
export function objectUV(geometry) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  if (!nor) geometry.computeVertexNormals();
  const n = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; }
    else if (ax >= az) { u = z; v = y; }
    else { u = x; v = y; }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/** 水平面片（y 朝上），UV 按世界坐标铺。 */
export function groundPatch(w, d, x, z, y = 0, uvScale = 1) {
  const g = new THREE.PlaneGeometry(w, d, 1, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  return worldUV(g, uvScale);
}

/** 带矩形孔的水平地面（用 Shape 挖洞，用于金水河河道）。 */
export function groundWithHoles(width, depth, holes, y = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -depth / 2);
  shape.lineTo(width / 2, -depth / 2);
  shape.lineTo(width / 2, depth / 2);
  shape.lineTo(-width / 2, depth / 2);
  shape.lineTo(-width / 2, -depth / 2);

  for (const h of holes) {
    const p = new THREE.Path();
    p.moveTo(h.x0, h.z0);
    p.lineTo(h.x0, h.z1);
    p.lineTo(h.x1, h.z1);
    p.lineTo(h.x1, h.z0);
    p.lineTo(h.x0, h.z0);
    shape.holes.push(p);
  }

  const g = new THREE.ShapeGeometry(shape, 1);
  // ShapeGeometry 在 XY 平面，绕 X 轴 -90° 后 (x, y) -> (x, -y)：先取反再旋转
  g.rotateX(-Math.PI / 2);
  return worldUV(g, 1);
}

/** 把沿路径均匀排布的构件批量做成实例矩阵。 */
export function alongEdge({ x0, z0, x1, z1 }, count, cb, includeEnds = true) {
  const out = [];
  const n = includeEnds ? count : count - 1;
  for (let i = 0; i < count; i++) {
    const t = includeEnds ? i / (n - 1 || 1) : (i + 0.5) / count;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    const ry = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
    out.push(cb(x, z, ry, t, i));
  }
  return out;
}

/** 矩形四边（闭合）排布。 */
export function alongRect({ w, d, x = 0, z = 0 }, spacing, cb) {
  const out = [];
  const hw = w / 2, hd = d / 2;
  const edges = [
    { x0: x - hw, z0: z + hd, x1: x + hw, z1: z + hd },
    { x0: x + hw, z0: z - hd, x1: x + hw, z1: z + hd },
    { x0: x - hw, z0: z - hd, x1: x + hw, z1: z - hd },
    { x0: x - hw, z0: z - hd, x1: x - hw, z1: z + hd },
  ];
  for (const e of edges) {
    const len = Math.hypot(e.x1 - e.x0, e.z1 - e.z0);
    const n = Math.max(2, Math.round(len / spacing) + 1);
    for (let i = 0; i < n - 1; i++) {
      const t = i / (n - 1);
      const px = e.x0 + (e.x1 - e.x0) * t;
      const pz = e.z0 + (e.z1 - e.z0) * t;
      const ry = Math.atan2(e.x1 - e.x0, e.z1 - e.z0) + Math.PI / 2;
      out.push(cb(px, pz, ry, t, len));
    }
  }
  return out;
}

/** 释放几何体，避免频繁重建时泄漏显存。 */
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
}
