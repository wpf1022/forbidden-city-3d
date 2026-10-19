import * as THREE from 'three';

/**
 * 中式屋顶几何
 * ---------------------------------------------------------------
 * 庑殿顶（四阿顶）的坡面不是平面，而是「上陡下缓」的凹曲面，
 * 且四角起翘（飞檐）。这里用参数化高度场生成：
 *
 *   h(x, z) = H · (1 − t)^p  +  起翘量
 *
 * 其中 t = max(tz, tx)，是到「脊」的归一化距离：
 *   tz = |z| / (D/2)                              横向坡（前后坡）
 *   tx = clamp((|x| − r) / (W/2 − r), 0, 1)       纵向坡（两侧坡）
 *   r  = (W/2) · ridgeRatio                       正脊半长
 *
 * t = 1 的等值线恰好落在矩形边界上 —— 也就是檐口。
 * 当 |x| ≤ r 时 tx = 0，于是屋顶中部形成一条横向正脊，
 * 这正是庑殿顶与四角攒尖顶的区别（后者令 ridgeRatio = 0）。
 */

/** 归一化到「脊」的距离，取值 0(脊) → 1(檐) */
export function roofParam(x, z, { width, depth, ridgeRatio }) {
  const a = width / 2;
  const b = depth / 2;
  const r = a * Math.min(Math.max(ridgeRatio, 0), 0.98);

  const tz = Math.min(Math.abs(z) / b, 1);
  const ax = Math.abs(x);
  const tx = ax <= r ? 0 : Math.min((ax - r) / (a - r), 1);
  return { t: Math.max(tz, tx), tx, tz };
}

/** 屋顶高度场 */
export function roofHeight(x, z, opts) {
  const { height, power = 1.7, eaveLift = 0 } = opts;
  const { t, tx, tz } = roofParam(x, z, opts);

  // 主坡面：上陡下缓
  let h = height * Math.pow(1 - t, power);

  // 四角起翘：仅在檐口附近、且越靠近角点越明显
  if (eaveLift > 0) {
    const cornerFactor = Math.min(tx, tz);
    h += eaveLift * Math.pow(t, 8) * cornerFactor;
  }
  return h;
}

/** 生成屋顶曲面网格 */
function buildSurfaceGeometry(opts) {
  const { width, depth, segX = 64, segZ = 44 } = opts;
  const geo = new THREE.PlaneGeometry(width, depth, segX, segZ);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, roofHeight(x, z, opts));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** 在两点之间放置一根圆柱（用于垂脊） */
function cylinderBetween(from, to, radius, material, radialSegments = 6) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(radius, radius * 0.92, len, radialSegments, 1);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(from).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );
  return mesh;
}

/**
 * 创建一座屋顶
 * @returns {THREE.Group} 组内原点在屋顶底面中心，檐口位于 y = 0
 */
export function createRoof({
  width,
  depth,
  height,
  ridgeRatio = 0.45,
  power = 1.7,
  eaveLift = 1.0,
  segX = 64,
  segZ = 44,
  tileTexture,
  ridgeColor = 0x6b4a12,
  eaveColor = 0x6e5216,
}) {
  const group = new THREE.Group();
  const opts = { width, depth, height, ridgeRatio, power, eaveLift };

  /* ---------- 瓦面 ---------- */
  const surfaceGeo = buildSurfaceGeometry({ ...opts, segX, segZ });
  const tex = tileTexture.clone();
  tex.needsUpdate = true;
  tex.repeat.set(Math.max(width / 9, 1), Math.max(depth / 9, 1));
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;

  const surfaceMat = new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    roughness: 0.48,
    metalness: 0.22,
    side: THREE.DoubleSide,
  });

  const surface = new THREE.Mesh(surfaceGeo, surfaceMat);
  surface.castShadow = true;
  surface.receiveShadow = true;
  group.add(surface);

  /* ---------- 屋脊材质 ---------- */
  const ridgeMat = new THREE.MeshStandardMaterial({
    color: ridgeColor,
    roughness: 0.42,
    metalness: 0.3,
  });

  /* ---------- 正脊 ---------- */
  const a = width / 2;
  const b = depth / 2;
  const r = Math.max(a * ridgeRatio, width * 0.012);
  const ridgeY = height;

  if (ridgeRatio > 0.02) {
    const ridgeGeo = new THREE.BoxGeometry(r * 2, 1.05, 1.15);
    const ridge = new THREE.Mesh(ridgeGeo, ridgeMat);
    ridge.position.set(0, ridgeY + 0.35, 0);
    ridge.castShadow = true;
    group.add(ridge);

    // 正脊两端翘头（简化鸱吻）
    for (const sx of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.9, 1.0), ridgeMat);
      tip.position.set(sx * (r - 0.1), ridgeY + 0.95, 0);
      tip.rotation.z = sx * 0.26;
      tip.castShadow = true;
      group.add(tip);
    }
  }

  /* ---------- 垂脊（四条戗脊） ---------- */
  const hipRadius = Math.max(width * 0.009, 0.22);
  const hipTops = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const top = new THREE.Vector3(sx * r, ridgeY + 0.3, 0);
      // 沿坡面采样，让脊贴合曲面
      const corner = new THREE.Vector3(sx * a, 0, sz * b);
      const steps = 10;
      let prev = top.clone();
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        const px = THREE.MathUtils.lerp(top.x, corner.x, k);
        const pz = THREE.MathUtils.lerp(top.z, corner.z, k);
        const py = roofHeight(px, pz, opts) + 0.28;
        const cur = new THREE.Vector3(px, py, pz);
        const seg = cylinderBetween(prev, cur, hipRadius, ridgeMat, 5);
        seg.castShadow = true;
        group.add(seg);
        prev = cur;
      }
      hipTops.push(top);
    }
  }

  /* ---------- 檐口封边（檐板） ---------- */
  const eaveMat = new THREE.MeshStandardMaterial({
    color: eaveColor,
    roughness: 0.62,
    metalness: 0.22,
    side: THREE.DoubleSide,
  });
  const fascia = new THREE.Mesh(
    buildEaveFasciaGeometry(opts, Math.max(height * 0.1, 0.55), 22),
    eaveMat
  );
  fascia.castShadow = true;
  group.add(fascia);

  return group;
}

/**
 * 沿檐口生成一圈垂直封边，让屋顶有真实厚度
 * （比用 TubeGeometry 描边更贴合曲面，不会出现「浮线」）
 */
function buildEaveFasciaGeometry(opts, drop, segPerSide) {
  const { width, depth } = opts;
  const a = width / 2;
  const b = depth / 2;

  const corners = [
    [-a, -b],
    [a, -b],
    [a, b],
    [-a, b],
  ];

  // 顺时针采样整圈檐口顶点（含四角起翘的高度）
  const ring = [];
  for (let i = 0; i < 4; i++) {
    const [x0, z0] = corners[i];
    const [x1, z1] = corners[(i + 1) % 4];
    for (let j = 0; j < segPerSide; j++) {
      const t = j / segPerSide;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      ring.push(new THREE.Vector3(x, roofHeight(x, z, opts), z));
    }
  }

  const positions = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    const pLow = new THREE.Vector3(p.x, p.y - drop, p.z);
    const qLow = new THREE.Vector3(q.x, q.y - drop, q.z);

    positions.push(p.x, p.y, p.z, q.x, q.y, q.z, qLow.x, qLow.y, qLow.z);
    positions.push(p.x, p.y, p.z, qLow.x, qLow.y, qLow.z, pLow.x, pLow.y, pLow.z);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * 攒尖顶（四角攒尖，如中和殿）—— ridgeRatio = 0 的退化情形
 */
export function createPyramidRoof({
  width,
  depth,
  height,
  tileTexture,
  ridgeColor = 0x6b4a12,
  finialColor = 0xd9b45b,
  eaveLift = 1.0,
}) {
  const group = createRoof({
    width,
    depth,
    height,
    ridgeRatio: 0,
    power: 1.75,
    eaveLift,
    segX: 56,
    segZ: 56,
    tileTexture,
    ridgeColor,
  });

  // 宝顶
  const finialMat = new THREE.MeshStandardMaterial({
    color: finialColor,
    roughness: 0.28,
    metalness: 0.72,
  });

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(width * 0.055, width * 0.075, 0.9, 12),
    finialMat
  );
  base.position.y = height + 0.35;
  base.castShadow = true;
  group.add(base);

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(width * 0.062, 20, 16),
    finialMat
  );
  ball.position.y = height + 1.25;
  ball.castShadow = true;
  group.add(ball);

  const spike = new THREE.Mesh(
    new THREE.ConeGeometry(width * 0.032, 1.55, 14),
    finialMat
  );
  spike.position.y = height + 2.05;
  spike.castShadow = true;
  group.add(spike);

  return group;
}
