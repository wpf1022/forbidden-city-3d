/**
 * 紫禁城 · 中轴 — 全局配置
 *
 * 坐标系：x 东(+) 西(-)，y 上，z 南(+) 北(-)。单位：米。
 * 方位说明：故宫坐北朝南，午门在南（z 正方向），保和殿在北（z 负方向）。
 */

/** 世界尺度：整条中轴的有效长度，用于雾、阴影包围盒等。 */
export const WORLD = {
  groundSize: 1400,
  fogDensityDay: 0.00085,
  fogDensityNight: 0.0016,
};

/** 中轴各建筑的中心 z 与关键尺寸。 */
export const AXIS = {
  meridian: { z: 262, wide: 118, depth: 34, podiumH: 12.5, hallW: 62, hallD: 26 },
  river: { z: 190, width: 19, depth: 2.6, span: 104 },
  taiheGate: { z: 122, platW: 70, platD: 42, hallW: 51, hallD: 22 },
  taiheHall: { z: -46, platW: 99, platD: 76, hallW: 64, hallD: 38 },
  zhongheHall: { z: -136, platW: 44, platD: 44, hallW: 27, hallD: 27 },
  baoheHall: { z: -206, platW: 68, platD: 48, hallW: 51, hallD: 26 },
  northEnd: -244,
  southEnd: 300,
};

/** 广场：太和殿广场（东西廊庑围合）与太和门广场。 */
export const COURT = {
  great: { zFrom: -168, zTo: 88, halfW: 96 },
  gate: { zFrom: 96, zTo: 232, halfW: 76 },
};

/** 调色：PRD §7.1 的三种主色，作为基色，光照与色调映射负责提亮。 */
export const PALETTE = {
  glazed: 0xc9971f, // 琉璃瓦（金黄）
  glazedDark: 0x8f6a12,
  glazedEdge: 0xe8bb45,
  wallRed: 0x8e2b1d, // 宫墙红
  columnRed: 0x8f2a1c,
  doorRed: 0x6d2116,
  marble: 0xe6e0d0, // 汉白玉
  marbleWarm: 0xd8d0bd,
  marbleShade: 0xb9b19c,
  stoneGrey: 0x9c968a,
  paving: 0x847d70,
  pavingAlt: 0x8f887a,
  brick: 0x6f5a4a,
  gold: 0xc9a44e,
  goldDeep: 0x8d6a24,
  water: 0x2c4a4a,
  bronze: 0x6b5a3c,
  skyDayTop: 0x2f6fb0,
  skyDayHorizon: 0xbcd3e4,
  skyDayBottom: 0x8f8272,
  skyNightTop: 0x070d1c,
  skyNightHorizon: 0x1b2a44,
  skyNightBottom: 0x0a0d12,
  sunDay: 0xffeccd,
  sunNight: 0xa9c0e8,
  fogDay: 0xa9c2d6,
  fogNight: 0x121d31,
};

/** 相机与操控（PRD FR-3D-02 / §7.2）。 */
export const CAMERA = {
  fov: 38,
  near: 0.6,
  far: 5000,
  minDistance: 25,
  maxDistance: 720,
  maxPolar: 1.528, // 略小于 90°，避免穿到地平面以下
  minPolar: 0.12,
  damping: 0.085,
  panSpeed: 0.0016,
  zoomSpeed: 0.0016,
  autoOrbitSpeed: 0.28, // rad / 分钟
  autoOrbitResume: 5.0, // 手动操作后暂停秒数
  minY: 2.2,
};

/** 四组预设视角（PRD FR-3D-05）。position 为相机位置，target 为注视点。 */
export const VIEWS = {
  a: { pos: [92, 47, 42], target: [2, 21, -50], label: '近景' },
  b: { pos: [0, 32, 176], target: [0, 28, -110], label: '中轴' },
  c: { pos: [258, 224, 468], target: [0, 8, 34], label: '全景' },
  d: { pos: [-124, 44, -4], target: [0, 22, -52], label: '西侧' },
};

/** 画质分档：移动端降低阴影与像素比。 */
export function qualityTier() {
  const wide = window.matchMedia('(min-width: 721px)').matches;
  const dpr = window.devicePixelRatio || 1;
  return {
    shadowMapSize: wide ? 3072 : 1536,
    maxPixelRatio: wide ? Math.min(dpr, 2) : Math.min(dpr, 1.6),
    antialias: true,
    environmentSize: 256,
  };
}
