import * as THREE from 'three';

/**
 * 场地构件：广场铺地、御道、金水河、汉白玉拱桥、宫墙
 */

/* ================================================================
   广场铺地
   ================================================================ */
export function createPlaza({ width = 420, depth = 700, mats }) {
  const group = new THREE.Group();

  const geo = new THREE.PlaneGeometry(width, depth);
  geo.rotateX(-Math.PI / 2);
  const tex = mats.stoneMap.clone();
  tex.needsUpdate = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(width / 16, depth / 16);

  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.92,
    metalness: 0.02,
  });

  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  group.add(ground);

  /* ---------- 中央御道（汉白玉） ---------- */
  const pathGeo = new THREE.PlaneGeometry(14, depth * 0.92);
  pathGeo.rotateX(-Math.PI / 2);
  const pathTex = mats.marbleMap.clone();
  pathTex.needsUpdate = true;
  pathTex.wrapS = THREE.RepeatWrapping;
  pathTex.wrapT = THREE.RepeatWrapping;
  pathTex.repeat.set(2, depth / 10);

  const path = new THREE.Mesh(
    pathGeo,
    new THREE.MeshStandardMaterial({
      map: pathTex,
      roughness: 0.7,
      metalness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  path.position.y = 0.04;
  path.receiveShadow = true;
  group.add(path);

  return group;
}

/* ================================================================
   金水河
   ================================================================ */
export function createWaterChannel({ length = 150, width = 22, mats }) {
  const group = new THREE.Group();

  /* ---------- 水面 ---------- */
  const waterGeo = new THREE.PlaneGeometry(length, width, 40, 6);
  waterGeo.rotateX(-Math.PI / 2);

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x3f849c,
    roughness: 0.16,
    metalness: 0.5,
    envMapIntensity: 1.2,
  });

  const water = new THREE.Mesh(waterGeo, waterMat);
  // 略高于广场地面与御道，避免被遮挡、也避免与御道产生 z-fighting
  water.position.y = 0.12;
  water.receiveShadow = true;
  group.add(water);

  /* ---------- 河沿 ---------- */
  const edgeH = 1.4;
  const edges = [
    { w: length + 6, d: 2.2, x: 0, z: width / 2 + 1 },
    { w: length + 6, d: 2.2, x: 0, z: -width / 2 - 1 },
  ];
  for (const e of edges) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(e.w, edgeH, e.d), mats.marble);
    mesh.position.set(e.x, edgeH / 2, e.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}

/* ================================================================
   汉白玉拱桥
   ================================================================ */
export function createArchBridge({ span = 30, width = 7, rise = 2.4, mats }) {
  const group = new THREE.Group();

  const segments = 22;
  const thickness = 1.1;

  /* ---------- 桥面：沿圆弧拼接薄板 ---------- */
  const deckGeo = new THREE.BoxGeometry(span / segments + 0.08, thickness, width);
  for (let i = 0; i < segments; i++) {
    const t = (i + 0.5) / segments;         // 0 → 1 横跨
    const x = (t - 0.5) * span;
    const y = Math.sin(t * Math.PI) * rise;

    const piece = new THREE.Mesh(deckGeo, mats.marble);
    piece.position.set(x, y, 0);
    // 贴合圆弧切线
    const slope = Math.cos(t * Math.PI) * rise * (Math.PI / span);
    piece.rotation.z = Math.atan(slope);
    piece.castShadow = true;
    piece.receiveShadow = true;
    group.add(piece);
  }

  /* ---------- 桥栏 ---------- */
  const postGeo = new THREE.BoxGeometry(0.22, 0.95, 0.22);
  const postCount = 14;
  const posts = new THREE.InstancedMesh(postGeo, mats.marbleLight, postCount * 2);
  posts.castShadow = true;
  const m = new THREE.Matrix4();
  let idx = 0;
  for (let i = 0; i < postCount; i++) {
    const t = (i + 0.5) / postCount;
    const x = (t - 0.5) * span;
    const y = Math.sin(t * Math.PI) * rise;
    for (const sz of [-1, 1]) {
      m.makeTranslation(x, y + 0.75, (sz * width) / 2);
      posts.setMatrixAt(idx++, m);
    }
  }
  posts.count = idx;
  posts.instanceMatrix.needsUpdate = true;
  group.add(posts);

  // 栏杆扶手（同样沿弧分段）
  for (const sz of [-1, 1]) {
    for (let i = 0; i < segments; i++) {
      const t = (i + 0.5) / segments;
      const x = (t - 0.5) * span;
      const y = Math.sin(t * Math.PI) * rise;
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(span / segments + 0.06, 0.2, 0.24),
        mats.marbleLight
      );
      rail.position.set(x, y + 1.28, (sz * width) / 2);
      const slope = Math.cos(t * Math.PI) * rise * (Math.PI / span);
      rail.rotation.z = Math.atan(slope);
      rail.castShadow = true;
      group.add(rail);
    }
  }

  return group;
}

/* ================================================================
   宫墙
   ================================================================ */
export function createWall({ length, height = 6.5, thickness = 2.2, mats, horizontal = true }) {
  const group = new THREE.Group();

  const w = horizontal ? length : thickness;
  const d = horizontal ? thickness : length;

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), mats.wall);
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // 墙帽（琉璃瓦压顶）
  const capW = horizontal ? length : thickness + 1.1;
  const capD = horizontal ? thickness + 1.1 : length;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(capW, 0.55, capD), mats.roofCap);
  cap.position.y = height + 0.27;
  cap.castShadow = true;
  group.add(cap);

  // 压顶下的阴影带
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(horizontal ? length : thickness + 0.35, 0.5, horizontal ? thickness + 0.35 : length),
    mats.beam
  );
  band.position.y = height - 0.25;
  group.add(band);

  return group;
}

/* ================================================================
   连廊 / 值房（简化的长条形配殿）
   ================================================================ */
export function createSideHall({ length = 60, depth = 12, height = 7, mats, tileTexture }) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(length, height, depth), mats.wall);
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // 用四棱柱做简单坡顶
  const roof = new THREE.Mesh(
    new THREE.CylinderGeometry(depth * 0.78, depth * 0.78, length, 4, 1),
    mats.roofFlat
  );
  roof.rotation.z = Math.PI / 2;
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.42);
  roof.position.y = height + depth * 0.13;
  roof.castShadow = true;
  group.add(roof);

  return group;
}
