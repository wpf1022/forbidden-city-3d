/**
 * 台基：须弥座分层 + 望柱栏板 + 踏跺（含御路）。
 *
 * 太和殿的三层汉白玉台基是整个场景最亮的一块体量，
 * 因此这里对"束腰—上枋—下枋"的凹凸做了实体建模，
 * 而不是靠贴图假装——从默认视角能直接看出分层。
 */
import * as THREE from 'three';
import { mergeGeometries, instanced, trs, box, objectUV } from '../lib/geom.js';

/** 望柱：柱身 + 柱头。 */
function postGeometry(h = 1.32) {
  const shaft = new THREE.BoxGeometry(0.3, h, 0.3);
  shaft.translate(0, h / 2, 0);
  const cap = new THREE.CylinderGeometry(0.19, 0.24, 0.26, 8);
  cap.translate(0, h + 0.1, 0);
  const top = new THREE.SphereGeometry(0.17, 8, 6);
  top.translate(0, h + 0.27, 0);
  return mergeGeometries([shaft, cap, top]);
}

/** 栏板：一块带凹框的石板。 */
function panelGeometry(len, h = 0.92) {
  const main = new THREE.BoxGeometry(len, h, 0.17);
  main.translate(0, h / 2, 0);
  const rail = new THREE.BoxGeometry(len + 0.06, 0.13, 0.23);
  rail.translate(0, h, 0);
  return mergeGeometries([main, rail]);
}

/**
 * 沿矩形四周布置望柱与栏板（闭合，无缺口）。
 * @returns {{posts: THREE.Matrix4[], panels: THREE.Matrix4[], panelLen: number}}
 */
export function balustradeMatrices({ w, d, x = 0, z = 0, spacing = 2.3, gapFront = 0 }) {
  const posts = [];
  const panels = [];
  const hw = w / 2, hd = d / 2;
  const edges = [
    { x0: x - hw, z0: z + hd, x1: x + hw, z1: z + hd },
    { x0: x + hw, z0: z + hd, x1: x + hw, z1: z - hd },
    { x0: x + hw, z0: z - hd, x1: x - hw, z1: z - hd },
    { x0: x - hw, z0: z - hd, x1: x - hw, z1: z + hd },
  ];
  let panelLen = spacing;
  for (const e of edges) {
    // +z 边（正面）要给踏跺让出缺口，否则台阶从栏板里穿出来
    const isFront = e.z0 === e.z1 && e.z0 > 0 && gapFront > 0;
    const len = Math.hypot(e.x1 - e.x0, e.z1 - e.z0);
    const n = Math.max(2, Math.round(len / spacing) + 1);
    const step = len / (n - 1);
    panelLen = step;
    const ry = Math.atan2(e.x1 - e.x0, e.z1 - e.z0) + Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const px = e.x0 + (e.x1 - e.x0) * t;
      if (isFront && Math.abs(px - x) < gapFront) continue;
      posts.push(trs(px, 0, e.z0 + (e.z1 - e.z0) * t, ry));
      if (i < n - 1) {
        const tm = (i + 0.5) / (n - 1);
        const mx = e.x0 + (e.x1 - e.x0) * tm;
        if (isFront && Math.abs(mx - x) < gapFront) continue;
        panels.push(trs(mx, 0, e.z0 + (e.z1 - e.z0) * tm, ry));
      }
    }
  }
  return { posts, panels, panelLen };
}

/** 一级台基（含束腰线脚）。 */
function tierGeometry(w, d, h, { waist = 0.62, cornice = 0.34 } = {}) {
  const out = [];
  const h1 = h * 0.28, h2 = h * 0.42, h3 = h - h1 - h2;
  out.push(box(w, h1, d, 0, h1 / 2, 0));
  out.push(box(w - waist, h2, d - waist, 0, h1 + h2 / 2, 0));
  out.push(box(w, h3, d, 0, h1 + h2 + h3 / 2, 0));
  // 上枋挑檐：在阳光下给下一层留下一道投影线
  out.push(box(w + cornice, 0.2, d + cornice, 0, h + 0.03, 0));
  return mergeGeometries(out);
}

/**
 * 踏跺（台阶）+ 中央御路。
 *
 * 约定（唯一权威）：本地 z=0 是最上一级踏面，台阶沿 **+z（台基外侧）** 展开。
 * 之前的版本把台阶建在 -z 上、调用方又只平移了半个进深，于是整条踏跺
 * （含御路斜板）被埋进实心台体，任何视角都看不见——根因是
 * "本地坐标系朝哪边展开"这件事在两个函数里各有一套假设。
 */
function stairsGeometry(width, rise, { tread, rampWidth = 0 } = {}) {
  const n = Math.max(3, Math.round(rise / 0.17));
  const r = rise / n;
  const out = [];
  for (let i = 0; i < n; i++) {
    // i = n-1 是最高一级，紧贴 z=0；i = 0 在最外侧
    const y = i * r;
    const z = (n - 1 - i) * tread + tread / 2;
    out.push(box(width, r, tread, 0, y + r / 2, z));
  }
  const run = n * tread;
  if (rampWidth > 0) {
    // 御路：中央整块斜板，坡向与台阶一致（内侧高）
    const len = Math.hypot(run, rise);
    const angle = Math.atan2(rise, run);
    const g = new THREE.BoxGeometry(rampWidth, 0.28, len);
    g.applyMatrix4(trs(0, rise / 2 + 0.1, run / 2, 0, angle, 0));
    out.push(g);
    for (const sx of [-1, 1]) {
      const bar = new THREE.BoxGeometry(0.34, 0.42, len);
      bar.applyMatrix4(trs(sx * (rampWidth / 2 + 0.2), rise / 2 + 0.24, run / 2, 0, angle, 0));
      out.push(bar);
    }
  }
  return { geo: mergeGeometries(out), run };
}

/** 螭首：台基边缘伸出的石雕龙头，三层台基的"齿列"轮廓就靠它。 */
function spoutGeometry() {
  const head = new THREE.BoxGeometry(0.42, 0.34, 0.62);
  head.translate(0, 0, 0.31);
  const snout = new THREE.BoxGeometry(0.3, 0.2, 0.26);
  snout.translate(0, -0.04, 0.62);
  const horn = new THREE.BoxGeometry(0.16, 0.22, 0.2);
  horn.translate(0, 0.19, 0.22);
  return mergeGeometries([head, snout, horn]);
}

/**
 * 构建台基。
 * @param {object} o
 * @param {number} o.w 底层台基通面阔
 * @param {number} o.d 底层台基通进深
 * @param {number} o.tiers 层数
 * @param {number} o.tierH 每层高
 * @param {number} o.inset 每层内收
 * @param {number} o.stairs 踏跺宽度（0 表示不做）
 */
export function buildPlatform({
  w, d, x = 0, z = 0, tiers = 1, tierH = 2.6, inset = 3.0,
  materials, balustrade = true, stairs = 20, postSpacing = 2.3, y = 0,
}) {
  const group = new THREE.Group();
  group.position.set(x, y, z);

  const tierGeos = [];
  const stairGeos = [];
  const postMats = [];
  const panelMats = [];
  const spoutMats = [];
  let panelLen = postSpacing;
  let topW = w, topD = d;

  // 每层各自一道踏跺：从下一层台面升到本层台面，起点在本层南面、向 +z 展开。
  // 上层踏跺的水平进深受本层内收量限制，所以用 tread 而不是固定级宽。
  const stepUp = 0.17;
  const stairOf = new Map();
  for (let i = 0; i < tiers; i++) {
    if (stairs <= 0) break;
    const rise = tierH;
    const nSteps = Math.max(3, Math.round(rise / stepUp));
    const width = stairs * (1 - i * 0.16);
    const maxRun = i === 0 ? 20 : Math.max(2.0, inset * 0.94);
    const tread = Math.min(0.34, maxRun / nSteps);
    const { geo, run } = stairsGeometry(width, rise, {
      tread,
      rampWidth: i === 0 ? Math.min(3.4, width * 0.18) : 0,
    });
    geo.translate(0, i * tierH, (d - 2 * inset * i) / 2 + 0.02);
    stairGeos.push(geo);
    stairOf.set(i, { width, run });
  }

  for (let i = 0; i < tiers; i++) {
    const tw = w - 2 * inset * i;
    const td = d - 2 * inset * i;
    const g = tierGeometry(tw, td, tierH);
    g.translate(0, i * tierH, 0);
    tierGeos.push(g);
    topW = tw;
    topD = td;

    if (balustrade) {
      const s = stairOf.get(i);
      const gap = s ? s.width / 2 + 1.1 : 0;
      const m = balustradeMatrices({ w: tw - 0.7, d: td - 0.7, spacing: postSpacing, gapFront: gap });
      panelLen = m.panelLen;
      const shift = new THREE.Matrix4().makeTranslation(0, (i + 1) * tierH + 0.02, 0);
      const pos = new THREE.Vector3();
      const out = new THREE.Vector3();
      for (const mm of m.posts) {
        postMats.push(new THREE.Matrix4().multiplyMatrices(shift, mm));
        // 螭首朝外：由台基中心指向该望柱的水平方向
        pos.setFromMatrixPosition(mm);
        out.set(pos.x, 0, pos.z).normalize();
        const ry = Math.atan2(out.x, out.z);
        spoutMats.push(trs(
          pos.x + out.x * 0.24,
          i * tierH + tierH - 0.95,
          pos.z + out.z * 0.24,
          ry,
        ));
      }
      // 每层的跨距不同（周长/跨数），所以栏板必须按层缩放，
      // 否则会拿最后一层的长度去套所有层，出现缝或叠边。
      const panelScale = new THREE.Matrix4().makeScale(Math.max(0.2, m.panelLen - 0.32), 1, 1);
      for (const mm of m.panels) {
        const local = new THREE.Matrix4().multiplyMatrices(mm, panelScale);
        panelMats.push(new THREE.Matrix4().multiplyMatrices(shift, local));
      }
    }
  }

  const body = new THREE.Mesh(objectUV(mergeGeometries(tierGeos)), materials.marble);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  if (stairGeos.length) {
    const sm = new THREE.Mesh(objectUV(mergeGeometries(stairGeos)), materials.marble);
    sm.castShadow = true;
    sm.receiveShadow = true;
    group.add(sm);
  }

  if (balustrade && postMats.length) {
    group.add(instanced(postGeometry(), materials.marble, postMats, { castShadow: true }));
    group.add(instanced(panelGeometry(1), materials.marbleWarm, panelMats, { castShadow: true }));
    group.add(instanced(spoutGeometry(), materials.marble, spoutMats, { castShadow: true }));
  }

  return { group, topY: tiers * tierH, topW, topD };
}
