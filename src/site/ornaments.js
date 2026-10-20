/**
 * 陈设：华表、铜狮、灯笼、铜香炉。
 *
 * 这些小体量的竖向元素负责在大广场里提供尺度参照——
 * 没有它们，广场会显得空荡且失去尺寸感。
 */
import * as THREE from 'three';
import { mergeGeometries, instanced, trs, box } from '../lib/geom.js';
import { AXIS } from '../config.js';

/** 华表：须弥座 + 柱身 + 云板 + 蹲兽。 */
function huabiao(h = 12.5) {
  const parts = [];
  parts.push(box(2.4, 0.6, 2.4, 0, 0.3, 0));
  parts.push(box(2.0, 0.8, 2.0, 0, 1.0, 0));
  parts.push(box(1.7, 0.5, 1.7, 0, 1.65, 0));
  const shaft = new THREE.CylinderGeometry(0.42, 0.55, h, 14);
  shaft.translate(0, h / 2 + 1.9, 0);
  parts.push(shaft);
  // 云板：横向的薄板
  const plate = new THREE.BoxGeometry(3.6, 0.42, 0.34);
  plate.translate(0, h * 0.78 + 1.9, 0);
  parts.push(plate);
  const plate2 = new THREE.BoxGeometry(2.4, 0.34, 0.3);
  plate2.translate(0, h * 0.86 + 1.9, 0);
  parts.push(plate2);
  // 承露盘
  const tray = new THREE.CylinderGeometry(0.86, 0.66, 0.3, 14);
  tray.translate(0, h + 2.05, 0);
  parts.push(tray);
  // 蹲兽
  const beast = new THREE.SphereGeometry(0.56, 10, 8);
  beast.scale(1, 1.25, 0.9);
  beast.translate(0, h + 2.75, 0);
  parts.push(beast);
  return mergeGeometries(parts);
}

/** 铜狮：须弥座 + 蹲坐的狮身。 */
function lion() {
  const parts = [];
  parts.push(box(2.6, 1.1, 1.9, 0, 0.55, 0));
  parts.push(box(2.2, 0.5, 1.6, 0, 1.35, 0));
  const body = new THREE.SphereGeometry(0.95, 12, 10);
  body.scale(0.92, 1.05, 0.8);
  body.translate(0, 2.4, -0.15);
  parts.push(body);
  const head = new THREE.SphereGeometry(0.66, 12, 10);
  head.translate(0, 3.5, 0.25);
  parts.push(head);
  const mane = new THREE.TorusGeometry(0.62, 0.2, 8, 14);
  mane.rotateX(Math.PI / 2);
  mane.translate(0, 3.55, 0.1);
  parts.push(mane);
  // 前爪
  for (const s of [-1, 1]) {
    const p = new THREE.CylinderGeometry(0.2, 0.24, 0.9, 8);
    p.translate(s * 0.42, 1.95, 0.55);
    parts.push(p);
  }
  return mergeGeometries(parts);
}

/** 灯笼：暗夜里唯一的暖光源。 */
function lanternGeometry() {
  const parts = [];
  const body = new THREE.SphereGeometry(0.62, 14, 10);
  body.scale(1, 1.18, 1);
  parts.push(body);
  const top = new THREE.CylinderGeometry(0.24, 0.3, 0.16, 10);
  top.translate(0, 0.72, 0);
  parts.push(top);
  const bot = new THREE.CylinderGeometry(0.3, 0.24, 0.16, 10);
  bot.translate(0, -0.72, 0);
  parts.push(bot);
  return mergeGeometries(parts);
}

/** 铜香炉（鼎）：太和殿月台上的陈设。 */
function censer() {
  const parts = [];
  parts.push(box(1.5, 0.4, 1.5, 0, 0.2, 0));
  const belly = new THREE.SphereGeometry(0.78, 14, 10);
  belly.scale(1, 0.85, 1);
  belly.translate(0, 1.1, 0);
  parts.push(belly);
  const lid = new THREE.ConeGeometry(0.72, 0.6, 14);
  lid.translate(0, 1.95, 0);
  parts.push(lid);
  for (const s of [-1, 1]) {
    const leg = new THREE.CylinderGeometry(0.11, 0.1, 0.55, 8);
    leg.translate(s * 0.42, 0.55, 0);
    parts.push(leg);
  }
  return mergeGeometries(parts);
}

export function buildOrnaments(materials) {
  const group = new THREE.Group();
  const lampPositions = [];

  /* 华表：太和门广场一对 */
  {
    const geo = huabiao(12.5);
    const mats = [
      trs(-30, 0, 158),
      trs(30, 0, 158),
    ];
    group.add(instanced(geo, materials.marble, mats, { castShadow: true }));
  }

  /* 铜狮：太和门两侧 */
  {
    const geo = lion();
    const mats = [trs(-16, 0, 148), trs(16, 0, 148)];
    group.add(instanced(geo, materials.bronze, mats, { castShadow: true }));
  }

  /* 太和殿月台陈设：铜鼎、日晷 */
  {
    const geo = censer();
    const mats = [];
    for (const x of [-26, -18, 18, 26]) mats.push(trs(x, 8.1, AXIS.taiheHall.z + 30));
    group.add(instanced(geo, materials.bronze, mats, { castShadow: true }));
  }

  /* 灯笼：廊庑柱间与桥头 */
  {
    const geo = lanternGeometry();
    const hangers = [];
    for (let z = -160; z <= 80; z += 16) {
      hangers.push(trs(-88, 5.4, z));
      hangers.push(trs(88, 5.4, z));
    }
    for (const x of [-26, -8, 8, 26]) hangers.push(trs(x, 4.6, AXIS.river.z + 12));
    const mesh = instanced(geo, materials.lantern, hangers, { castShadow: false });
    group.add(mesh);
    for (const m of hangers) {
      if (Math.abs(m.elements[12]) < 40 || (m.elements[14] % 32 === 0)) {
        lampPositions.push(new THREE.Vector3(m.elements[12], m.elements[13], m.elements[14]));
      }
    }
  }

  return { group, lampPositions: lampPositions.slice(0, 10) };
}
