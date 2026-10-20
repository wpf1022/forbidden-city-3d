/**
 * 界面层：标题、工具按钮、建筑标注、加载遮罩。
 *
 * 标注用 DOM 投影而不是 Sprite——中文在 canvas 贴图里会糊，
 * 而 DOM 标签在任意缩放下都是屏幕像素级清晰（FR-3D-04）。
 */
import * as THREE from 'three';

export class HUD {
  constructor({ buildings, onNight, onViews, onToggleLabels, onReset }) {
    this.buildings = buildings;
    this.root = document.getElementById('labels');
    this.loading = document.getElementById('loading');
    this.nightBtn = document.getElementById('btn-night');
    this.labelBtn = document.getElementById('btn-labels');

    this.nodes = buildings.map((b) => {
      const el = document.createElement('div');
      el.className = 'label';
      el.innerHTML = `<div class="label-box"><span class="label-name">${b.name}</span><span class="label-sub">${b.sub || ''}</span></div><i class="label-stem"></i>`;
      this.root.appendChild(el);
      return { el, anchor: b.anchor.clone(), visible: true };
    });

    this.nightBtn?.addEventListener('click', () => onNight());
    this.labelBtn?.addEventListener('click', () => onToggleLabels());
    document.querySelectorAll('[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => onViews(btn.dataset.view));
    });
    document.getElementById('btn-reset')?.addEventListener('click', () => onReset());

    this.labelsOn = true;
    this._v = new THREE.Vector3();
    this._view = new THREE.Vector3();
  }

  setNight(night) {
    if (!this.nightBtn) return;
    this.nightBtn.textContent = night ? '白昼' : '夜景';
    this.nightBtn.classList.toggle('is-on', night);
  }

  setLabels(on) {
    this.labelsOn = on;
    this.labelBtn?.classList.toggle('is-on', on);
    this.root.classList.toggle('is-hidden', !on);
  }

  setView(key) {
    document.querySelectorAll('[data-view]').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.view === key);
    });
  }

  setHudVisible(on) {
    document.body.classList.toggle('hud-off', !on);
  }

  /** 每帧把世界坐标投到屏幕，并做一次贪心避让（近者优先）。 */
  update(camera) {
    const w = window.innerWidth;
    const h = window.innerHeight;

    const items = [];
    for (const n of this.nodes) {
      if (!n.size) {
        const r = n.el.querySelector('.label-box')?.getBoundingClientRect();
        n.size = r && r.width > 4 ? { w: r.width, h: r.height } : { w: 150, h: 42 };
      }
      // 先变换到视图空间判"在相机背后"。只测 clip 空间的 p.z 不够：
      // 背后的点经 w<0 除法后仍可能落在 [-1,1] 内，于是被投到屏幕中央——
      // 预设 b 下午门的标注就是这样挤掉了太和殿的。
      const vp = this._view.copy(n.anchor).applyMatrix4(camera.matrixWorldInverse);
      if (vp.z > -camera.near) {
        this._hide(n);
        continue;
      }
      const p = this._v.copy(n.anchor).project(camera);
      const x = (p.x * 0.5 + 0.5) * w;
      const y = (-p.y * 0.5 + 0.5) * h;
      if (x < -160 || x > w + 160 || y < -80 || y > h + 160) {
        this._hide(n);
        continue;
      }
      items.push({ n, x, y, d: camera.position.distanceTo(n.anchor) });
    }

    items.sort((a, b) => a.d - b.d);
    const placed = [];
    for (const it of items) {
      const { w: bw, h: bh } = it.n.size;
      const rect = { x0: it.x - bw / 2 - 4, x1: it.x + bw / 2 + 4, y0: it.y - 30 - bh - 4, y1: it.y - 26 };
      let clash = false;
      for (const q of placed) {
        if (rect.x0 < q.x1 && rect.x1 > q.x0 && rect.y0 < q.y1 && rect.y1 > q.y0) { clash = true; break; }
      }
      if (clash) {
        this._hide(it.n);
        continue;
      }
      placed.push(rect);
      if (!it.n.visible) { it.n.visible = true; }
      it.n.el.style.opacity = '1';
      it.n.el.style.transform = `translate3d(${it.x.toFixed(1)}px,${it.y.toFixed(1)}px,0)`;
    }
  }

  _hide(n) {
    if (n.visible) { n.el.style.opacity = '0'; n.visible = false; }
  }

  revealLoading() {
    requestAnimationFrame(() => {
      this.loading?.classList.add('is-done');
      setTimeout(() => this.loading?.remove(), 900);
    });
  }
}
