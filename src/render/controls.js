/**
 * 自由视角控制器（PRD FR-3D-02 / §7.2）。
 *
 * 不用 OrbitControls，原因有三：
 *   1. PRD 要求除 three.js 外零第三方库，addons 也不算仓库资产；
 *   2. 距离钳制 25–720、俯仰角上限、右键平移、惯性阻尼这些边界需要精确控制；
 *   3. 自动环绕要与手动操作联动（暂停 / 恢复），自己写更直接。
 */
import * as THREE from 'three';
import { CAMERA } from '../config.js';

const TWO_PI = Math.PI * 2;

export class AxisControls {
  constructor(camera, dom, { onInteract } = {}) {
    this.camera = camera;
    this.dom = dom;
    this.onInteract = onInteract;

    // 目标位姿（输入直接改这里）与当前位姿（每帧追上去）
    this.goal = { theta: 0.9, phi: 1.16, radius: 150, target: new THREE.Vector3(0, 18, -40) };
    this.cur = {
      theta: this.goal.theta,
      phi: this.goal.phi,
      radius: this.goal.radius,
      target: this.goal.target.clone(),
    };

    this.autoOrbit = true;
    this.idle = 0;
    this.enabled = true;

    this.pointers = new Map();
    this.mode = null; // 'rotate' | 'pan'
    this.lastPinch = 0;
    this.lastMid = new THREE.Vector2();

    this._bind();
    this.camera.position.set(0, 0, 1);
    this._applyCamera(true);
  }

  _bind() {
    const el = this.dom;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this._down, { passive: false });
    el.addEventListener('pointermove', this._move, { passive: false });
    el.addEventListener('pointerup', this._up);
    el.addEventListener('pointercancel', this._up);
    el.addEventListener('pointerleave', this._up);
    el.addEventListener('wheel', this._wheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _touch() {
    this.idle = 0;
    this.onInteract?.();
  }

  _down = (e) => {
    if (!this.enabled) return;
    this.dom.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.mode = e.button === 2 || e.shiftKey || e.ctrlKey ? 'pan' : 'rotate';
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.lastPinch = Math.hypot(a.x - b.x, a.y - b.y);
      this.lastMid.set((a.x + b.x) / 2, (a.y + b.y) / 2);
      this.mode = 'pinch';
    }
    this._touch();
  };

  _move = (e) => {
    if (!this.pointers.has(e.pointerId)) return;
    const prev = this.pointers.get(e.pointerId);
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;

    if (this.mode === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = new THREE.Vector2((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (this.lastPinch > 0) this._zoom((this.lastPinch - dist) * 2.2);
      this._pan(mid.x - this.lastMid.x, mid.y - this.lastMid.y);
      this.lastPinch = dist;
      this.lastMid.copy(mid);
      this._touch();
      return;
    }

    if (this.mode === 'pan') this._pan(dx, dy);
    else this._rotate(dx, dy);
    this._touch();
  };

  _up = (e) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0) this.mode = null;
    else if (this.pointers.size === 1) this.mode = 'rotate';
  };

  _wheel = (e) => {
    if (!this.enabled) return;
    e.preventDefault();
    this._zoom(e.deltaY * (e.deltaMode === 1 ? 16 : 1));
    this._touch();
  };

  _rotate(dx, dy) {
    const k = 0.0042;
    this.goal.theta -= dx * k;
    this.goal.phi -= dy * k;
    this.goal.phi = THREE.MathUtils.clamp(this.goal.phi, CAMERA.minPolar, CAMERA.maxPolar);
  }

  _zoom(delta) {
    this.goal.radius = THREE.MathUtils.clamp(
      this.goal.radius * Math.exp(delta * 0.0011),
      CAMERA.minDistance,
      CAMERA.maxDistance,
    );
  }

  _pan(dx, dy) {
    const scale = this.goal.radius * CAMERA.panSpeed;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
    this.goal.target.addScaledVector(right, -dx * scale);
    this.goal.target.addScaledVector(up, dy * scale);
    this.goal.target.x = THREE.MathUtils.clamp(this.goal.target.x, -420, 420);
    this.goal.target.z = THREE.MathUtils.clamp(this.goal.target.z, -420, 420);
    this.goal.target.y = THREE.MathUtils.clamp(this.goal.target.y, 0, 160);
  }

  /** 直接设定机位（预设视角 / 重置）。 */
  setPose({ pos, target }, instant = false) {
    const t = Array.isArray(target) ? new THREE.Vector3(...target) : target.clone();
    const p = Array.isArray(pos) ? new THREE.Vector3(...pos) : pos.clone();
    const off = p.clone().sub(t);
    const radius = off.length();
    const theta = Math.atan2(off.x, off.z);
    const phi = Math.acos(THREE.MathUtils.clamp(off.y / radius, -1, 1));
    this.goal.theta = theta;
    this.goal.phi = THREE.MathUtils.clamp(phi, CAMERA.minPolar, CAMERA.maxPolar);
    this.goal.radius = THREE.MathUtils.clamp(radius, CAMERA.minDistance, CAMERA.maxDistance);
    this.goal.target.copy(t);
    if (instant) {
      this.cur.theta = this.goal.theta;
      this.cur.phi = this.goal.phi;
      this.cur.radius = this.goal.radius;
      this.cur.target.copy(this.goal.target);
      this._applyCamera(true);
    }
  }

  getPose() {
    return { pos: this.camera.position.clone(), target: this.cur.target.clone() };
  }

  update(dt) {
    // 自动环绕：手动操作后暂停 5 秒（PRD §7.2 / 评审 P1-5）
    if (this.autoOrbit) {
      this.idle += dt;
      if (this.idle > CAMERA.autoOrbitResume) {
        const ramp = THREE.MathUtils.smoothstep(this.idle - CAMERA.autoOrbitResume, 0, 2.2);
        this.goal.theta += (CAMERA.autoOrbitSpeed / 60) * dt * ramp;
      }
    }

    const k = 1 - Math.exp(-dt / CAMERA.damping);
    this.cur.theta += (this.goal.theta - this.cur.theta) * k;
    this.cur.phi += (this.goal.phi - this.cur.phi) * k;
    this.cur.radius += (this.goal.radius - this.cur.radius) * k;
    this.cur.target.lerp(this.goal.target, k);
    this._applyLimits();
    this._applyCamera(false);
  }

  _applyCamera() {
    const { radius, phi, theta, target } = this.cur;
    const sinPhi = Math.sin(phi);
    this.camera.position.set(
      target.x + radius * sinPhi * Math.sin(theta),
      Math.max(CAMERA.minY, target.y + radius * Math.cos(phi)),
      target.z + radius * sinPhi * Math.cos(theta),
    );
    this.camera.lookAt(target);
  }

  /** 建筑的 keep-out 包围盒（世界坐标，半长）。 */
  setKeepOuts(list) {
    this.keepOuts = list || [];
  }

  /**
   * 把半径推到所有 keep-out 盒之外。
   *
   * FR-3D-02 的要求是"相机不能进入建筑内部"，不是"相机与目标之间不能有建筑"。
   * 第一版按射线区间求 maxR，结果预设 b 被强行拉到太和殿与中和殿之间、
   * 构图整个垮掉——那是把"相机在盒内"错判成了"视线被盒挡住"。
   * 这里只做一件事：若当前机位落在某个盒内，就沿视线把它推到该盒外。
   */
  _safeRadius(r0) {
    const { theta, phi, target } = this.cur;
    const sp = Math.sin(phi);
    const d = [sp * Math.sin(theta), Math.cos(phi), sp * Math.cos(theta)];
    const o = [target.x, target.y, target.z];
    const pad = 3.0;
    let r = r0;
    for (let iter = 0; iter < 4; iter++) {
      let bumped = false;
      for (const b of this.keepOuts) {
        const p = [o[0] + d[0] * r, o[1] + d[1] * r, o[2] + d[2] * r];
        const inside = Math.abs(p[0] - b.cx) <= b.hx + pad
          && Math.abs(p[1] - b.cy) <= b.hy + pad
          && Math.abs(p[2] - b.cz) <= b.hz + pad;
        if (!inside) continue;
        let t1 = Infinity;
        const axes = [[0, b.cx, b.hx], [1, b.cy, b.hy], [2, b.cz, b.hz]];
        for (const [i, c, h] of axes) {
          if (Math.abs(d[i]) < 1e-6) continue;
          const face = c + Math.sign(d[i]) * (h + pad);
          const t = (face - o[i]) / d[i];
          if (t > 0 && t < t1) t1 = t;
        }
        if (Number.isFinite(t1) && t1 > r) {
          r = t1;
          bumped = true;
        }
      }
      if (!bumped) break;
    }
    return Math.min(CAMERA.maxDistance, r);
  }

  _applyLimits() {
    if (!this.keepOuts || !this.keepOuts.length) return;
    this.goal.radius = this._safeRadius(this.goal.radius);
    // _safeRadius 只会把半径往外推，所以对当前值调用是安全的（在外面时是恒等）
    const safeCur = this._safeRadius(this.cur.radius);
    if (safeCur > this.cur.radius) this.cur.radius = safeCur;
  }

  dispose() {
    const el = this.dom;
    el.removeEventListener('pointerdown', this._down);
    el.removeEventListener('pointermove', this._move);
    el.removeEventListener('pointerup', this._up);
    el.removeEventListener('pointercancel', this._up);
    el.removeEventListener('pointerleave', this._up);
    el.removeEventListener('wheel', this._wheel);
  }
}
