/**
 * 确定性随机与噪声。
 * 所有纹理与装饰的"随手感"必须可复现，否则每次刷新建筑细节都会变。
 */

/** mulberry32：小而快的确定性 PRNG。 */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash2 = (x, y, s) => {
  let h = x * 374761393 + y * 668265263 + s * 1442695040;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const smooth = (t) => t * t * (3 - 2 * t);

/** 值噪声，周期 p（用于无缝平铺）。 */
export function noise2(x, y, period = 64, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const wrap = (v) => ((v % period) + period) % period;
  const x0 = wrap(xi), x1 = wrap(xi + 1), y0 = wrap(yi), y1 = wrap(yi + 1);
  const v00 = hash2(x0, y0, seed), v10 = hash2(x1, y0, seed);
  const v01 = hash2(x0, y1, seed), v11 = hash2(x1, y1, seed);
  const u = smooth(xf), v = smooth(yf);
  return (v00 * (1 - u) + v10 * u) * (1 - v) + (v01 * (1 - u) + v11 * u) * v;
}

/** 分形叠加噪声，period 以基频格点计。 */
export function fbm(x, y, { octaves = 4, period = 8, lacunarity = 2, gain = 0.5, seed = 0 } = {}) {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * f, y * f, period * f, seed + i * 17);
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
}

/** 平滑步进。 */
export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * 三次 Hermite 曲线，用于中国屋顶的凹曲剖面（举折）。
 * f(0)=0, f(1)=1, f'(0)=m0, f'(1)=m1。m1 > m0 即"檐缓脊陡"。
 */
export function hermite(t, m0 = 0.65, m1 = 1.45) {
  const t2 = t * t, t3 = t2 * t;
  return (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) + (t3 - t2) * m1;
}
