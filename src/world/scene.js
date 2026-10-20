/**
 * 场景装配：把中轴六处建筑与场地合成一个世界。
 *
 * 只做装配，不做造型——每个建筑模块自己负责自己的几何。
 */
import * as THREE from 'three';
import { AXIS } from '../config.js';
import { buildPlatform } from '../architecture/platform.js';
import { buildHall } from '../architecture/hall.js';
import { buildGround, buildRiver } from '../site/terrain.js';
import { buildEnclosure } from '../site/enclosure.js';
import { buildMeridian } from '../site/meridian.js';
import { buildOrnaments } from '../site/ornaments.js';

export function buildWorld(scene, materials) {
  const buildings = [];
  const keepOuts = [];
  const root = new THREE.Group();
  scene.add(root);

  /* ── 场地 ── */
  const { group: groundGroup } = buildGround(materials);
  root.add(groundGroup);
  const { group: riverGroup } = buildRiver(materials);
  root.add(riverGroup);
  root.add(buildEnclosure(materials));

  /* ── 午门 ── */
  {
    const g = buildMeridian(materials);
    root.add(g);
    buildings.push({
      name: '午门',
      sub: 'Meridian Gate',
      anchor: new THREE.Vector3(0, (g.userData.mainTop || 42) + 3, AXIS.meridian.z),
    });
  }

  /* ── 太和门 ── */
  {
    const { z, platW, platD } = AXIS.taiheGate;
    const plat = buildPlatform({
      w: platW, d: platD, tiers: 1, tierH: 3.1, materials,
      postSpacing: 2.2, stairs: 10,
    });
    plat.group.position.set(0, 0, z);
    root.add(plat.group);

    const hall = buildHall({
      w: 51, d: 22, colH: 7.4, y: plat.topY, z,
      baysX: 9, baysZ: 3, materials,
      roofType: 'gableHip', doubleRoof: true,
      overhang: 3.0, upperOverhang: 2.4,
      slope: 0.62, tCut: 0.38, upperWallH: 2.8,
      dougongH: 0.7, doorRatio: 0.6,
      plaque: '太和门',
      name: '太和门',
    });
    root.add(hall.group);
    keepOuts.push(hall.volume);
    buildings.push({
      name: '太和门',
      sub: 'Gate of Supreme Harmony',
      anchor: new THREE.Vector3(0, plat.topY + hall.topY + 2.5, z),
    });
  }

  /* ── 太和殿（三层台基）── */
  {
    const { z, platW, platD } = AXIS.taiheHall;
    const plat = buildPlatform({
      w: platW, d: platD, tiers: 3, tierH: 2.7, inset: 3.4,
      materials, postSpacing: 2.35, stairs: 12,
    });
    plat.group.position.set(0, 0, z);
    root.add(plat.group);

    const hall = buildHall({
      w: 64, d: 38, colH: 10.2, y: plat.topY, z,
      baysX: 11, baysZ: 5, materials,
      roofType: 'hip', doubleRoof: true,
      overhang: 3.6, upperOverhang: 3.0,
      slope: 0.62, tCut: 0.35, upperWallH: 3.2,
      dougongH: 0.86, doorRatio: 0.6,
      plaque: '太和殿',
      name: '太和殿',
    });
    root.add(hall.group);
    keepOuts.push(hall.volume);
    buildings.push({
      name: '太和殿',
      sub: 'Hall of Supreme Harmony',
      anchor: new THREE.Vector3(0, plat.topY + hall.topY + 3, z),
    });
  }

  /* ── 中和殿（攒尖 + 宝顶）── */
  {
    const { z, platW, platD } = AXIS.zhongheHall;
    const plat = buildPlatform({
      w: platW, d: platD, tiers: 1, tierH: 3.4, materials,
      postSpacing: 2.1, stairs: 8,
    });
    plat.group.position.set(0, 0, z);
    root.add(plat.group);

    const hall = buildHall({
      w: 27, d: 27, colH: 7.8, y: plat.topY, z,
      baysX: 5, baysZ: 5, materials,
      roofType: 'pyramid', doubleRoof: false,
      overhang: 3.4, slope: 0.78,
      dougongH: 0.7, doorRatio: 0.62,
      plaque: '中和殿',
      name: '中和殿',
    });
    root.add(hall.group);
    keepOuts.push(hall.volume);

    // 宝顶
    const topY = plat.topY + hall.topY;
    const finial = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.15, 0.5, 12), materials.ridgeTile);
    base.position.y = 0.25;
    finial.add(base);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.82, 16, 12), materials.gold);
    ball.position.y = 1.1;
    ball.castShadow = true;
    finial.add(ball);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.5, 12), materials.gold);
    spire.position.y = 2.2;
    finial.add(spire);
    finial.position.set(0, topY, z);
    root.add(finial);

    buildings.push({
      name: '中和殿',
      sub: 'Hall of Central Harmony',
      anchor: new THREE.Vector3(0, topY + 5.5, z),
    });
  }

  /* ── 保和殿（重檐歇山）── */
  {
    const { z, platW, platD } = AXIS.baoheHall;
    const plat = buildPlatform({
      w: platW, d: platD, tiers: 1, tierH: 4.0, materials,
      postSpacing: 2.2, stairs: 10,
    });
    plat.group.position.set(0, 0, z);
    root.add(plat.group);

    const hall = buildHall({
      w: 51, d: 26, colH: 9.2, y: plat.topY, z,
      baysX: 9, baysZ: 5, materials,
      roofType: 'gableHip', doubleRoof: true,
      overhang: 3.3, upperOverhang: 2.7,
      slope: 0.63, tCut: 0.37, upperWallH: 3.0,
      dougongH: 0.8, doorRatio: 0.6,
      gableT: 0.55,
      plaque: '保和殿',
      name: '保和殿',
    });
    root.add(hall.group);
    keepOuts.push(hall.volume);
    buildings.push({
      name: '保和殿',
      sub: 'Hall of Preserving Harmony',
      anchor: new THREE.Vector3(0, plat.topY + hall.topY + 2.5, z),
    });
  }

  buildings.push({
    name: '金水桥',
    sub: 'Golden Water Bridges',
    anchor: new THREE.Vector3(0, 4.6, AXIS.river.z),
  });

  /* ── 陈设 ── */
  const ornaments = buildOrnaments(materials);
  root.add(ornaments.group);

  buildings.sort((a, b) => b.anchor.z - a.anchor.z);

  return { root, buildings, keepOuts, lamps: ornaments.lampPositions };
}
