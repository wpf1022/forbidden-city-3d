/**
 * 午门：凹字形城台 + 三券门洞 + 重檐庑殿正楼 + 两翼雁翅楼。
 *
 * 城台不是一块长方体——它向南伸出两条臂，围出一个"阙"形的入口广场，
 * 这是整条中轴上最有辨识度的轮廓。
 */
import * as THREE from 'three';
import { mergeGeometries, box, trs, objectUV } from '../lib/geom.js';
import { AXIS } from '../config.js';
import { buildHall } from '../architecture/hall.js';

export function buildMeridian(materials) {
  const group = new THREE.Group();
  group.position.set(0, 0, AXIS.meridian.z);

  const { wide, depth, podiumH, hallW, hallD } = AXIS.meridian;
  const wingW = 25;
  const wingL = 64;
  const wingX = wide / 2 - wingW / 2;

  /* ── 城台 ── */
  const podiumGeos = [
    box(wide, podiumH, depth, 0, podiumH / 2, 0),
    box(wingW, podiumH, wingL, -wingX, podiumH / 2, depth / 2 + wingL / 2),
    box(wingW, podiumH, wingL, wingX, podiumH / 2, depth / 2 + wingL / 2),
  ];
  // 城台收分：底部略宽
  podiumGeos.push(box(wide + 2.2, 1.4, depth + 2.2, 0, 0.7, 0));
  const podium = new THREE.Mesh(objectUV(mergeGeometries(podiumGeos)), materials.brick);
  podium.castShadow = true;
  podium.receiveShadow = true;
  group.add(podium);

  /* ── 城台顶宇墙 ── */
  {
    const wallGeos = [];
    const t = 0.9, h = 1.15;
    wallGeos.push(box(wide, h, t, 0, podiumH + h / 2, -depth / 2 + t / 2));
    wallGeos.push(box(t, h, depth, -wide / 2 + t / 2, podiumH + h / 2, 0));
    wallGeos.push(box(t, h, depth, wide / 2 - t / 2, podiumH + h / 2, 0));
    wallGeos.push(box(wide, h, t, 0, podiumH + h / 2, depth / 2 - t / 2));
    for (const s of [-1, 1]) {
      wallGeos.push(box(wingW, h, t, s * wingX, podiumH + h / 2, depth / 2 + wingL - t / 2));
      wallGeos.push(box(t, h, wingL, s * (wingX - wingW / 2 + t / 2), podiumH + h / 2, depth / 2 + wingL / 2));
      wallGeos.push(box(t, h, wingL, s * (wingX + wingW / 2 - t / 2), podiumH + h / 2, depth / 2 + wingL / 2));
    }
    const wm = new THREE.Mesh(mergeGeometries(wallGeos), materials.wall);
    wm.castShadow = true;
    wm.receiveShadow = true;
    group.add(wm);
    // 宇墙压顶
    const cap = new THREE.Mesh(
      mergeGeometries([
        box(wide + 0.5, 0.2, 1.4, 0, podiumH + h + 0.1, -depth / 2 + 0.45),
        box(1.4, 0.2, depth, -wide / 2 + 0.45, podiumH + h + 0.1, 0),
        box(1.4, 0.2, depth, wide / 2 - 0.45, podiumH + h + 0.1, 0),
        box(wide + 0.5, 0.2, 1.4, 0, podiumH + h + 0.1, depth / 2 - 0.45),
      ]),
      materials.ridgeTile,
    );
    group.add(cap);
  }

  /* ── 三券门洞（南面，面阔方向的三个拱洞）── */
  {
    const openingW = 6.4, openingH = 8.4;
    const gap = 20;
    const nicheGeos = [];
    for (const cx of [-gap, 0, gap]) {
      const w = cx === 0 ? openingW * 1.25 : openingW;
      const h = cx === 0 ? openingH * 1.12 : openingH;
      // 洞身：向内凹进的暗色体量
      nicheGeos.push(box(w, h, 7.0, cx, h / 2, depth / 2 - 3.2));
      // 拱顶
      const arch = new THREE.CylinderGeometry(w / 2, w / 2, 7.0, 16, 1, false, 0, Math.PI);
      arch.rotateZ(Math.PI / 2);
      arch.rotateY(Math.PI / 2);
      arch.translate(cx, h, depth / 2 - 3.2);
      nicheGeos.push(arch);
      // 门框白石
      nicheGeos.push(box(0.55, h + w / 2, 0.5, cx - w / 2 - 0.2, (h + w / 2) / 2, depth / 2 + 0.12));
      nicheGeos.push(box(0.55, h + w / 2, 0.5, cx + w / 2 + 0.2, (h + w / 2) / 2, depth / 2 + 0.12));
    }
    const nm = new THREE.Mesh(mergeGeometries(nicheGeos), materials.darkWood);
    nm.castShadow = false;
    nm.receiveShadow = true;
    group.add(nm);
  }

  /* ── 正楼（重檐庑殿）── */
  {
    const hall = buildHall({
      w: hallW, d: hallD, colH: 8.4, y: podiumH,
      baysX: 9, baysZ: 5, materials,
      roofType: 'hip', doubleRoof: true,
      overhang: 3.2, upperOverhang: 2.6,
      slope: 0.64, tCut: 0.36, upperWallH: 3.0,
      dougongH: 0.78, doorRatio: 0.56,
      name: '午门',
    });
    group.add(hall.group);
    group.userData.mainTop = podiumH + hall.topY;
  }

  /* ── 雁翅楼 ── */
  for (const s of [-1, 1]) {
    const hall = buildHall({
      w: 19, d: wingL - 6, colH: 6.6, y: podiumH,
      x: s * wingX, z: depth / 2 + wingL / 2,
      baysX: 3, baysZ: 13, materials,
      roofType: 'hip', doubleRoof: false,
      overhang: 2.6, slope: 0.6, doorRatio: 0.5,
      dougongH: 0.6,
      name: '雁翅楼',
    });
    group.add(hall.group);
  }

  return group;
}
