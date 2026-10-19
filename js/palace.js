import * as THREE from 'three';
import { createRoof, createPyramidRoof } from './roof.js';

/**
 * 殿宇组合体
 * ---------------------------------------------------------------
 * 重檐做法：下层檐用一个完整庑殿顶，上层殿身做成足够高的方体把
 * 它的「脊」整个罩住 —— 于是外面只看得到一圈裙檐，正好是重檐的
 * 视觉特征，同时省掉了给屋顶挖洞的麻烦。
 */

function box(w, h, d, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/* ================================================================
   汉白玉台基（含望柱栏杆）
   ================================================================ */
export function createTerrace({
  width,
  depth,
  tiers = 3,
  tierHeight = 2.4,
  tierInset = 2.6,
  mats,
}) {
  const group = new THREE.Group();

  for (let i = 0; i < tiers; i++) {
    const w = width + (tiers - 1 - i) * tierInset * 2;
    const d = depth + (tiers - 1 - i) * tierInset * 2;
    const y = i * tierHeight;

    const slab = box(w, tierHeight, d, mats.marble);
    slab.position.y = y + tierHeight / 2;
    group.add(slab);

    addBalustrade(group, {
      width: w,
      depth: d,
      y: y + tierHeight,
      material: mats.marbleLight,
      spacing: 2.0,
    });
  }

  return group;
}

/** 沿矩形四边布置望柱与栏板 */
function addBalustrade(group, { width, depth, y, material, spacing = 2.0 }) {
  const hw = width / 2;
  const hd = depth / 2;
  const postCountX = Math.max(2, Math.round(width / spacing));
  const postCountZ = Math.max(2, Math.round(depth / spacing));

  const postGeo = new THREE.BoxGeometry(0.34, 1.15, 0.34);
  const total = (postCountX + 1) * 2 + (postCountZ + 1) * 2;
  const posts = new THREE.InstancedMesh(postGeo, material, total);
  posts.castShadow = true;
  posts.receiveShadow = true;

  const m = new THREE.Matrix4();
  let idx = 0;
  const put = (x, z) => {
    m.makeTranslation(x, y + 0.575, z);
    posts.setMatrixAt(idx++, m);
  };

  for (let i = 0; i <= postCountX; i++) {
    const x = -hw + (width * i) / postCountX;
    put(x, -hd);
    put(x, hd);
  }
  for (let i = 1; i < postCountZ; i++) {
    const z = -hd + (depth * i) / postCountZ;
    put(-hw, z);
    put(hw, z);
  }
  posts.count = idx;
  posts.instanceMatrix.needsUpdate = true;
  group.add(posts);

  // 栏板
  const railH = 0.62;
  const rails = [
    { w: width, d: 0.3, x: 0, z: -hd },
    { w: width, d: 0.3, x: 0, z: hd },
    { w: 0.3, d: depth, x: -hw, z: 0 },
    { w: 0.3, d: depth, x: hw, z: 0 },
  ];
  for (const r of rails) {
    const rail = box(r.w, railH, r.d, material);
    rail.position.set(r.x, y + railH / 2 + 0.2, r.z);
    group.add(rail);
  }
}

/* ================================================================
   重檐大殿（太和殿 / 保和殿）
   ================================================================ */
export function createGrandHall({
  width = 54,
  depth = 30,
  bodyHeight = 11.5,
  baseY = 0,
  doubleEave = true,

  lowerOverhang = 6.5,
  lowerRoofHeight = 6.2,
  upperInset = 6.0,
  upperBodyHeight = 8.2,
  upperRoofHeight = 9.0,
  upperOverhang = 5.0,
  ridgeRatio = 0.46,

  columnSpacing = 4.4,
  columnCount = 11,
  mats,
  tileTexture,
}) {
  const group = new THREE.Group();
  group.position.y = baseY;

  /* ---------- 殿身 ---------- */
  const body = box(width, bodyHeight, depth, mats.wall);
  body.position.y = bodyHeight / 2;
  group.add(body);

  /* ---------- 正面隔扇 ---------- */
  const doorWidth = width * 0.82;
  const doorHeight = bodyHeight * 0.62;
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(doorWidth, doorHeight),
    mats.lattice
  );
  door.position.set(0, doorHeight / 2 + bodyHeight * 0.04, depth / 2 + 0.06);
  group.add(door);

  /* ---------- 檐柱 ---------- */
  const colGeo = new THREE.CylinderGeometry(0.52, 0.56, bodyHeight, 12);
  const cols = new THREE.InstancedMesh(colGeo, mats.column, columnCount + 2);
  cols.castShadow = true;
  cols.receiveShadow = true;
  const m = new THREE.Matrix4();
  let ci = 0;
  const usableW = width * 0.94;
  for (let i = 0; i < columnCount; i++) {
    const t = columnCount === 1 ? 0.5 : i / (columnCount - 1);
    const x = -usableW / 2 + usableW * t;
    m.makeTranslation(x, bodyHeight / 2, depth / 2 + 0.55);
    cols.setMatrixAt(ci++, m);
  }
  // 四角立柱
  for (const sx of [-1, 1]) {
    m.makeTranslation((sx * width) / 2, bodyHeight / 2, depth / 2 + 0.55);
    cols.setMatrixAt(ci++, m);
  }
  cols.count = ci;
  cols.instanceMatrix.needsUpdate = true;
  group.add(cols);

  /* ---------- 额枋（檐下横梁） ---------- */
  const beam = box(width + 1.6, 1.5, depth + 1.6, mats.beam);
  beam.position.y = bodyHeight - 0.4;
  group.add(beam);

  /* ---------- 下层檐 ---------- */
  const lowerRoof = createRoof({
    width: width + lowerOverhang * 2,
    depth: depth + lowerOverhang * 2,
    height: lowerRoofHeight,
    ridgeRatio,
    eaveLift: 1.15,
    tileTexture,
  });
  lowerRoof.position.y = bodyHeight;
  group.add(lowerRoof);

  if (doubleEave) {
    /* ---------- 上层殿身（罩住下檐的脊） ---------- */
    const uw = width - upperInset * 2;
    const ud = depth - upperInset * 2;
    const upper = box(uw, upperBodyHeight, ud, mats.wall);
    upper.position.y = bodyHeight + upperBodyHeight / 2;
    group.add(upper);

    // 上层隔扇
    const udoor = new THREE.Mesh(
      new THREE.PlaneGeometry(uw * 0.8, upperBodyHeight * 0.52),
      mats.lattice
    );
    udoor.position.set(0, bodyHeight + upperBodyHeight * 0.3, ud / 2 + 0.06);
    group.add(udoor);

    // 上层额枋
    const ubeam = box(uw + 1.2, 1.1, ud + 1.2, mats.beam);
    ubeam.position.y = bodyHeight + upperBodyHeight - 0.3;
    group.add(ubeam);

    /* ---------- 上层屋顶 ---------- */
    const upperRoof = createRoof({
      width: uw + upperOverhang * 2,
      depth: ud + upperOverhang * 2,
      height: upperRoofHeight,
      ridgeRatio,
      eaveLift: 1.35,
      tileTexture,
    });
    upperRoof.position.y = bodyHeight + upperBodyHeight;
    group.add(upperRoof);
  } else {
    /* ---------- 单檐 ---------- */
    const roof = createRoof({
      width: width + lowerOverhang * 2,
      depth: depth + lowerOverhang * 2,
      height: lowerRoofHeight,
      ridgeRatio,
      eaveLift: 1.15,
      tileTexture,
    });
    roof.position.y = bodyHeight;
    group.add(roof);
  }

  return group;
}

/* ================================================================
   方形攒尖殿（中和殿）
   ================================================================ */
export function createSquareHall({
  size = 26,
  bodyHeight = 9,
  baseY = 0,
  roofHeight = 10,
  overhang = 5,
  mats,
  tileTexture,
}) {
  const group = new THREE.Group();
  group.position.y = baseY;

  const body = box(size, bodyHeight, size, mats.wall);
  body.position.y = bodyHeight / 2;
  group.add(body);

  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 0.7, bodyHeight * 0.6),
    mats.lattice
  );
  door.position.set(0, bodyHeight * 0.34, size / 2 + 0.06);
  group.add(door);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.48, 0.52, bodyHeight, 12),
        mats.column
      );
      col.position.set((sx * size) / 2, bodyHeight / 2, (sz * size) / 2);
      col.castShadow = true;
      group.add(col);
    }
  }

  const beam = box(size + 1.4, 1.3, size + 1.4, mats.beam);
  beam.position.y = bodyHeight - 0.35;
  group.add(beam);

  const roof = createPyramidRoof({
    width: size + overhang * 2,
    depth: size + overhang * 2,
    height: roofHeight,
    tileTexture,
    eaveLift: 1.1,
  });
  roof.position.y = bodyHeight;
  group.add(roof);

  return group;
}

/* ================================================================
   门（太和门 / 午门门洞）
   ================================================================ */
export function createGate({
  width = 40,
  depth = 14,
  bodyHeight = 12,
  baseY = 0,
  overhang = 5,
  roofHeight = 8,
  archCount = 3,
  mats,
  tileTexture,
}) {
  const group = new THREE.Group();
  group.position.y = baseY;

  const body = box(width, bodyHeight, depth, mats.wall);
  body.position.y = bodyHeight / 2;
  group.add(body);

  /* ---------- 门洞（用深色洞口平面表现） ---------- */
  const archW = width / (archCount * 2 + 1);
  const archH = bodyHeight * 0.62;
  for (let i = 0; i < archCount; i++) {
    const x = (i - (archCount - 1) / 2) * archW * 2;

    const opening = new THREE.Mesh(
      new THREE.PlaneGeometry(archW, archH),
      mats.darkVoid
    );
    opening.position.set(x, archH / 2, depth / 2 + 0.05);
    group.add(opening);

    // 拱券上沿
    const arch = new THREE.Mesh(
      new THREE.RingGeometry(archW / 2, archW / 2 + 0.55, 24, 1, 0, Math.PI),
      mats.marbleLight
    );
    arch.position.set(x, archH, depth / 2 + 0.05);
    arch.rotation.z = 0;
    group.add(arch);
  }

  const beam = box(width + 1.2, 1.2, depth + 1.2, mats.beam);
  beam.position.y = bodyHeight - 0.3;
  group.add(beam);

  const roof = createRoof({
    width: width + overhang * 2,
    depth: depth + overhang * 2,
    height: roofHeight,
    ridgeRatio: 0.5,
    eaveLift: 1.0,
    tileTexture,
  });
  roof.position.y = bodyHeight;
  group.add(roof);

  return group;
}

/* ================================================================
   华表
   ================================================================ */
export function createOrnamentalColumn({ height = 13, mats }) {
  const group = new THREE.Group();

  const base = box(2.4, 1.2, 2.4, mats.marble);
  base.position.y = 0.6;
  group.add(base);

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.52, height, 16),
    mats.marbleLight
  );
  shaft.position.y = height / 2 + 1.2;
  shaft.castShadow = true;
  group.add(shaft);

  // 云板
  const cloud = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.34, 0.9), mats.marbleLight);
  cloud.position.y = height * 0.78 + 1.2;
  cloud.castShadow = true;
  group.add(cloud);

  // 承露盘
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 0.9, 0.45, 16),
    mats.marbleLight
  );
  plate.position.y = height + 1.4;
  group.add(plate);

  // 蹲兽（简化为球体）
  const beast = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 12), mats.marbleLight);
  beast.position.y = height + 2.05;
  beast.castShadow = true;
  group.add(beast);

  return group;
}
