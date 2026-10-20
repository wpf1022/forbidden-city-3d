// 运行时验收断言：每条都对应 PRD 的验收标准，不是"设得进去"，而是"设得对"。
// 用法：node tools/shot.mjs "<url>" out.png --eval tools/verify.js
(async () => {
  const FC = window.__FC__;
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const out = {};

  /* ── FR-3D-02 相机钳制 ── */
  const c = FC.controls;
  c.goal.radius = 5; c._zoom(1e6);
  out.distanceMax = +c.goal.radius.toFixed(2);
  c._zoom(-1e6);
  out.distanceMin = +c.goal.radius.toFixed(2);
  c.goal.phi = -5; c._rotate(0, -1e6);
  out.polarMin = +c.goal.phi.toFixed(3);
  c._rotate(0, 1e6);
  out.polarMax = +c.goal.phi.toFixed(3);

  /* ── FR-3D-02 最近距离不得进入建筑（真断言） ── */
  let worst = null;
  for (const key of ['a', 'b', 'c', 'd']) {
    FC.setView(key);
    c.goal.radius = 25;
    c.cur.radius = 25;
    for (const phi of [0.35, 1.0, 1.5]) {
      c.goal.phi = phi;
      c.cur.phi = phi;
      await frame();
      const p = FC.camera.position;
      for (const b of FC.world.keepOuts) {
        if (Math.abs(p.x - b.cx) < b.hx && Math.abs(p.y - b.cy) < b.hy && Math.abs(p.z - b.cz) < b.hz) {
          worst = { view: key, phi, pos: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)] };
        }
      }
    }
  }
  out.cameraInsideBuilding = worst; // null = 通过

  /* ── FR-3D-05 四组预设 + draw call（含阴影趟） ── */
  out.views = {};
  for (const key of ['a', 'b', 'c', 'd']) {
    FC.setView(key);
    await frame();
    const p = FC.camera.position;
    out.views[key] = {
      dist: +p.distanceTo(FC.controls.cur.target).toFixed(0),
      calls: FC.renderer.info.render.calls,
    };
  }
  FC.setView('a');

  /* ── FR-3D-03 昼夜整体切换（必须等一帧） ── */
  FC.setNight(true);
  await frame();
  const night = {
    exposure: +FC.renderer.toneMappingExposure.toFixed(2),
    sunDir: FC.lighting.sun.position.clone().normalize().toArray().map((v) => +v.toFixed(2)),
    fog: '#' + FC.scene.fog.color.getHexString(),
    lamp: +FC.lighting.lamps[0].intensity.toFixed(1),
    doorGlow: +FC.materials.door.emissiveIntensity.toFixed(2),
    star: +FC.sky.material.uniforms.uStar.value.toFixed(2),
    env: FC.scene.environment === FC.lighting.envTextures.night ? 'night' : 'day',
  };
  FC.setNight(false);
  await frame();
  const day = {
    exposure: +FC.renderer.toneMappingExposure.toFixed(2),
    sunDir: FC.lighting.sun.position.clone().normalize().toArray().map((v) => +v.toFixed(2)),
    fog: '#' + FC.scene.fog.color.getHexString(),
    lamp: +FC.lighting.lamps[0].intensity.toFixed(1),
    doorGlow: +FC.materials.door.emissiveIntensity.toFixed(2),
    star: +FC.sky.material.uniforms.uStar.value.toFixed(2),
    env: FC.scene.environment === FC.lighting.envTextures.day ? 'day' : 'night',
  };
  out.night = night;
  out.day = day;
  out.dayNightDirectionAngleDeg = +(Math.acos(
    Math.min(1, night.sunDir[0] * day.sunDir[0] + night.sunDir[1] * day.sunDir[1] + night.sunDir[2] * day.sunDir[2]),
  ) * 180 / Math.PI).toFixed(1);

  /* ── FR-3D-04 标注开关 ── */
  document.getElementById('btn-labels').click();
  out.labelsHidden = document.getElementById('labels').classList.contains('is-hidden');
  document.getElementById('btn-labels').click();
  out.labelsShown = !document.getElementById('labels').classList.contains('is-hidden');

  /* ── FR-3D-03 按钮文案 ── */
  document.getElementById('btn-night').click();
  await frame();
  out.buttonInNight = document.getElementById('btn-night').textContent;
  document.getElementById('btn-night').click();
  await frame();
  out.buttonInDay = document.getElementById('btn-night').textContent;

  /* ── 场景构成 ── */
  out.buildings = FC.world.buildings.map((b) => b.name);
  out.keepOuts = FC.world.keepOuts.length;
  out.loadingRemoved = !document.getElementById('loading');
  out.skyToneMapped = FC.sky.material.toneMapped;
  return JSON.stringify(out);
})()
