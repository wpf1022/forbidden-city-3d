/**
 * 场地：海墁铺地、御道、内金水河与五座金水桥。
 *
 * 河道用带孔的 Shape 挖穿地面，而不是把水面盖在地面之上——
 * 这样从桥上俯视能看到真实的河岸高度差，而不是一张贴纸。
 */
import * as THREE from 'three';
import { mergeGeometries, instanced, trs, box, groundPatch, worldUV, objectUV } from '../lib/geom.js';
import { fbm } from '../lib/noise.js';
import { AXIS, PALETTE } from '../config.js';
import { balustradeMatrices } from '../architecture/platform.js';

/** 河岸石壁 + 河底。 */
function riverBed({ span, z0, z1, depth }) {
  const geos = [];
  const hw = span / 2;
  const mid = (z0 + z1) / 2;
  const w = z1 - z0;
  // 南北两岸
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(span, depth, 1.6);
    g.translate(0, -depth / 2, s * (w / 2) + (s > 0 ? 0.8 : -0.8));
    geos.push(g);
  }
  // 东西两端
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(1.6, depth, w + 3.2);
    g.translate(s * (hw + 0.8), -depth / 2, 0);
    geos.push(g);
  }
  // 压檐石
  for (const s of [-1, 1]) {
    geos.push(box(span + 3.2, 0.34, 1.3, 0, 0.17, s * (w / 2 + 0.6)));
  }
  const g = mergeGeometries(geos);
  g.translate(0, 0, mid);
  return g;
}

/**
 * 一座拱桥。
 * 桥面沿 z 方向跨越河道，起拱高度 hump。
 */
function bridge({ width, span, hump, materials }) {
  const group = new THREE.Group();
  const steps = 14;
  const halfL = span / 2 + 2.6;

  // 桥面：沿 z 的拱形条带
  const pos = [];
  const uv = [];
  const idx = [];
  const segsU = 4;
  for (let j = 0; j <= steps; j++) {
    const t = j / steps;
    const z = (t - 0.5) * 2 * halfL;
    const y = hump * Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.85;
    for (let i = 0; i <= segsU; i++) {
      const u = i / segsU;
      pos.push((u - 0.5) * width, y, z);
      uv.push(u * width, t * halfL * 2);
    }
  }
  for (let j = 0; j < steps; j++) {
    for (let i = 0; i < segsU; i++) {
      const a = j * (segsU + 1) + i, b = a + 1, c = a + segsU + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const deck = new THREE.BufferGeometry();
  deck.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  deck.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  deck.setIndex(idx);
  deck.computeVertexNormals();
  const deckMesh = new THREE.Mesh(deck, materials.marble);
  deckMesh.castShadow = true;
  deckMesh.receiveShadow = true;
  group.add(deckMesh);

  // 桥身侧墙（挡住桥面下的空洞），用一条带状近似。
  // 绕序：截面是 (顶,bottom) 交替，三角形 (a,b,c) 的法线是 -x，
  // 所以 +x 侧要用 (a,c,b) 才朝外——两个分支原来是反的，外侧被剔除。
  for (const s of [-1, 1]) {
    const v = [];
    const uv = [];
    const id = [];
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const z = (t - 0.5) * 2 * halfL;
      const y = hump * Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.85;
      v.push(s * width / 2, y, z, s * width / 2, -1.9, z);
      uv.push(z, y, z, -1.9);
    }
    for (let j = 0; j < steps; j++) {
      const a = j * 2, b = a + 1, c = a + 2, d = a + 3;
      if (s > 0) id.push(a, c, b, c, d, b);
      else id.push(a, b, c, c, b, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(id);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, materials.marbleWarm);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  // 桥栏：沿拱面按弧长布置望柱与栏板
  const postMats = [];
  const panelMats = [];
  const N = Math.max(6, Math.round((2 * halfL) / 2.1));
  for (const s of [-1, 1]) {
    const x = s * (width / 2 + 0.34);
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const z = (t - 0.5) * 2 * halfL;
      const y = hump * Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.85;
      postMats.push(trs(x, y + 0.05, z, 0));
      if (i < N) {
        const tm = (i + 0.5) / N;
        const zm = (tm - 0.5) * 2 * halfL;
        const ym = hump * Math.sin(Math.PI * Math.min(1, Math.max(0, tm))) ** 0.85;
        panelMats.push(trs(x, ym + 0.05, zm, Math.PI / 2));
      }
    }
  }
  const postGeo = mergeGeometries([
    (() => { const g = new THREE.BoxGeometry(0.26, 1.1, 0.26); g.translate(0, 0.55, 0); return g; })(),
    (() => { const g = new THREE.SphereGeometry(0.14, 8, 6); g.translate(0, 1.19, 0); return g; })(),
  ]);
  const panelGeo = (() => {
    const g = new THREE.BoxGeometry(1.55, 0.74, 0.14);
    g.translate(0, 0.42, 0);
    const r = new THREE.BoxGeometry(1.62, 0.1, 0.2);
    r.translate(0, 0.8, 0);
    return mergeGeometries([g, r]);
  })();
  group.add(instanced(postGeo, materials.marble, postMats, { castShadow: true }));
  group.add(instanced(panelGeo, materials.marbleWarm, panelMats, { castShadow: true }));

  return group;
}

/** 内金水河：河道 + 五桥。 */
export function buildRiver(materials) {
  const group = new THREE.Group();
  const { z, width, depth, span } = AXIS.river;
  const z0 = z - width / 2;
  const z1 = z + width / 2;

  const bed = new THREE.Mesh(objectUV(riverBed({ span, z0: -width / 2, z1: width / 2, depth })), materials.marbleWarm);
  bed.position.z = z;
  bed.receiveShadow = true;
  bed.castShadow = true;
  group.add(bed);

  // 水面必须用米制 UV：PlaneGeometry 默认 0..1，而水法线的 repeat 是 1/9，
  // 两者相乘等于把整张法线图拉到 936 米的尺度上——水面会变成一块死玻璃。
  const waterGeo = new THREE.PlaneGeometry(span, width, 1, 1);
  waterGeo.rotateX(-Math.PI / 2);
  objectUV(waterGeo);
  const water = new THREE.Mesh(waterGeo, materials.water);
  water.position.set(0, -1.15, z);
  water.receiveShadow = true;
  group.add(water);

  // 五桥：中间御路桥最宽，向两侧递减（FR-3D-01 第 4 条）
  const bridges = [
    { x: 0, width: 9.2, hump: 2.1 },
    { x: -12, width: 7.2, hump: 1.95 },
    { x: 12, width: 7.2, hump: 1.95 },
    { x: -22.5, width: 6.2, hump: 1.8 },
    { x: 22.5, width: 6.2, hump: 1.8 },
  ];
  for (const b of bridges) {
    const g = bridge({ width: b.width, span: width, hump: b.hump, materials });
    g.position.set(b.x, 0, z);
    group.add(g);
  }

  return { group, bridges };
}

/**
 * 场地：海墁 + 御道 + 河道挖孔。
 *
 * 地面用四块带顶点色的面片围出河道，而不是一整张 Shape：
 * 顶点色提供几百米尺度上的深浅变化，否则 8 米一格的铺砖纹理
 * 在远景会退化成一片均匀的噪点。
 */
export function buildGround(materials) {
  const group = new THREE.Group();
  const SIZE = 12000;
  const half = SIZE / 2;
  const { span, width, z } = AXIS.river;
  const holeX0 = -span / 2 - 1.6;
  const holeX1 = span / 2 + 1.6;
  const holeZ0 = z - width / 2 - 1.6;
  const holeZ1 = z + width / 2 + 1.6;

  /** 带顶点色的地面块。 */
  const patch = (x0, x1, z0, z1, segX = 24, segZ = 24) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, segX, segZ);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    worldUV(g, 1);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), zz = pos.getZ(i);
      const n1 = fbm(x / 340 + 11, zz / 340, { octaves: 3, period: 64, seed: 5 });
      const n2 = fbm(x / 90, zz / 90 + 7, { octaves: 3, period: 64, seed: 9 });
      const v = 0.82 + n1 * 0.24 + (n2 - 0.5) * 0.07;
      col[i * 3] = Math.min(1.2, v * 1.01);
      col[i * 3 + 1] = Math.min(1.2, v);
      col[i * 3 + 2] = Math.min(1.2, v * 0.95);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  };

  const patches = [
    patch(-half, half, -half, holeZ0, 30, 30),
    patch(-half, half, holeZ1, half, 30, 30),
    patch(-half, holeX0, holeZ0, holeZ1, 10, 1),
    patch(holeX1, half, holeZ0, holeZ1, 10, 1),
  ];
  const ground = new THREE.Mesh(mergeGeometries(patches), materials.paving);
  ground.receiveShadow = true;
  group.add(ground);

  // 御道：中轴铺石，比海墁高出一线。
  // 必须按河岸与午门城台切段——原来一根 z=-244..300 的整条石板会横穿
  // 金水河（挖洞 178.9..201.1）与中桥，把水面切成两段并盖住桥面。
  const roadW = 13;
  const segments = [
    [AXIS.northEnd, holeZ0 - 0.4],
    [holeZ1 + 0.4, 244],
  ];
  const roadGeos = [];
  const kerbGeos = [];
  for (const [za, zb] of segments) {
    if (zb - za < 1) continue;
    roadGeos.push(box(roadW, 0.16, zb - za, 0, 0.08, (za + zb) / 2));
    for (const s of [-1, 1]) {
      kerbGeos.push(box(0.8, 0.26, zb - za, s * (roadW / 2 + 0.4), 0.13, (za + zb) / 2));
    }
  }
  const road = new THREE.Mesh(objectUV(mergeGeometries(roadGeos)), materials.marbleWarm);
  road.receiveShadow = true;
  road.castShadow = true;
  group.add(road);

  const kerbs = new THREE.Mesh(objectUV(mergeGeometries(kerbGeos)), materials.marble);
  kerbs.receiveShadow = true;
  kerbs.castShadow = true;
  group.add(kerbs);

  return { group, ground };
}
