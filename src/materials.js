/**
 * 共享材质库。
 * PRD §6.1 要求"多建筑共用材质实例"，因此这里集中创建，任何建筑模块只取不改。
 */
import * as THREE from 'three';
import { PALETTE } from './config.js';

export function createMaterials(factory) {
  const roof = factory.get('glazedRoof');
  const marbleTex = factory.get('marble');
  const marbleWarmTex = factory.get('marbleWarm');
  const pavingTex = factory.get('paving');
  const wallTex = factory.get('redWall');
  const doorTex = factory.get('latticeDoor');
  const caihuaTex = factory.get('caihua');
  const waterTex = factory.get('waterNormal');
  const brickTex = factory.get('brick');

  const m = {};

  /** 琉璃瓦屋面：釉面高光交给环境贴图，法线负责垄与压边。 */
  m.roofTile = new THREE.MeshStandardMaterial({
    map: roof.map,
    normalMap: roof.normalMap,
    normalScale: new THREE.Vector2(0.15, 0.15),
    color: 0xffffff,
    roughness: 0.34,
    metalness: 0.04,
    envMapIntensity: 1.1,
    side: THREE.FrontSide,
  });

  /** 檐下（椽子 / 望板）：暗红木色。 */
  m.soffit = new THREE.MeshStandardMaterial({
    color: 0x4a1d14,
    roughness: 0.72,
    metalness: 0.02,
  });

  /** 正脊、垂脊、瓦当等脊饰：略深的琉璃。 */
  m.ridgeTile = new THREE.MeshStandardMaterial({
    color: 0xb0821c,
    roughness: 0.32,
    metalness: 0.08,
    envMapIntensity: 1.1,
  });

  /** 檐口封边：琉璃瓦的立边，略亮。 */
  m.fascia = new THREE.MeshStandardMaterial({
    color: 0xa8781a,
    roughness: 0.36,
    metalness: 0.06,
    envMapIntensity: 1.0,
  });

  /** 歇山山花：红底描金的三角封板。 */
  m.gablePanel = new THREE.MeshStandardMaterial({
    color: 0x8c3520,
    roughness: 0.62,
    metalness: 0.04,
  });

  m.marble = new THREE.MeshStandardMaterial({
    map: marbleTex.map,
    normalMap: marbleTex.normalMap,
    normalScale: new THREE.Vector2(0.3, 0.3),
    roughness: 0.55,
    metalness: 0.0,
    envMapIntensity: 1.0,
  });

  m.marbleWarm = new THREE.MeshStandardMaterial({
    map: marbleWarmTex.map,
    normalMap: marbleWarmTex.normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.6,
    metalness: 0.0,
  });

  m.paving = new THREE.MeshStandardMaterial({
    map: pavingTex.map,
    normalMap: pavingTex.normalMap,
    normalScale: new THREE.Vector2(0.3, 0.3),
    roughness: 0.85,
    metalness: 0.0,
    vertexColors: true,
  });

  m.wall = new THREE.MeshStandardMaterial({
    map: wallTex.map,
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0.0,
  });

  m.wallPlain = new THREE.MeshStandardMaterial({
    color: PALETTE.wallRed,
    roughness: 0.88,
  });

  m.brick = new THREE.MeshStandardMaterial({
    map: brickTex.map,
    normalMap: brickTex.normalMap,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughness: 0.84,
    metalness: 0.0,
  });

  /** 檐柱：朱红大漆。 */
  m.column = new THREE.MeshStandardMaterial({
    color: PALETTE.columnRed,
    roughness: 0.4,
    metalness: 0.02,
    envMapIntensity: 1.1,
  });

  /** 隔扇门窗：颜色图 + 夜间自发光。 */
  m.door = new THREE.MeshStandardMaterial({
    map: doorTex.map,
    emissive: new THREE.Color(0xffa552),
    emissiveMap: doorTex.emissiveMap,
    emissiveIntensity: 0.0,
    roughness: 0.42,
    metalness: 0.06,
  });

  m.beam = new THREE.MeshStandardMaterial({
    map: caihuaTex.map,
    roughness: 0.55,
    metalness: 0.04,
  });

  m.gold = new THREE.MeshStandardMaterial({
    color: PALETTE.gold,
    roughness: 0.28,
    metalness: 0.92,
    envMapIntensity: 1.4,
  });

  m.goldWarm = new THREE.MeshStandardMaterial({
    color: 0x8a6a26,
    roughness: 0.42,
    metalness: 0.75,
    envMapIntensity: 1.1,
  });

  m.bronze = new THREE.MeshStandardMaterial({
    color: 0x5d5033,
    roughness: 0.48,
    metalness: 0.82,
    envMapIntensity: 1.1,
  });

  m.darkWood = new THREE.MeshStandardMaterial({
    color: 0x3a1710,
    roughness: 0.68,
    metalness: 0.0,
  });

  m.water = new THREE.MeshStandardMaterial({
    color: 0x1e3738,
    normalMap: waterTex.normalMap,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughness: 0.075,
    metalness: 0.28,
    envMapIntensity: 1.5,
  });

  m.lantern = new THREE.MeshStandardMaterial({
    color: 0x8d2a1c,
    emissive: new THREE.Color(0xff7a2e),
    emissiveIntensity: 0.4,
    roughness: 0.6,
  });

  /** 斗拱：青绿地仗，金线。 */
  m.dougong = new THREE.MeshStandardMaterial({
    color: 0x59796a,
    roughness: 0.62,
    metalness: 0.06,
  });

  /** 触碰不到的远处地坪，只用来接雾。 */
  m.haze = new THREE.MeshStandardMaterial({ color: 0x7d7669, roughness: 1.0 });

  /** 供牌匾等一次性材质取纹理用。 */
  m.factory = factory;
  return m;
}
