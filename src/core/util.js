// Small, dependency-free helpers shared across the game.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (t) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
export const easeOut = (t) => 1 - (1 - t) * (1 - t);

/** Frame-rate independent exponential approach. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const chance = (p) => Math.random() < p;

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Deterministic PRNG so the city looks the same on every load. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const r = mulberry32(seed);
  const api = () => r();
  api.range = (a, b) => a + r() * (b - a);
  api.int = (a, b) => Math.floor(a + r() * (b - a + 1));
  api.pick = (arr) => arr[(r() * arr.length) | 0];
  api.chance = (p) => r() < p;
  return api;
}

export const wrapAngle = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

export function angleLerp(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

export function dampAngle(a, b, lambda, dt) {
  return a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
}

export const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
};

export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));

export function formatMoney(n) {
  const v = Math.round(n);
  return '€ ' + v.toLocaleString('nl-NL');
}

export function formatDistance(m) {
  if (!isFinite(m)) return '—';
  if (m >= 1000) return (m / 1000).toFixed(m >= 10000 ? 0 : 1).replace('.', ',') + ' km';
  return Math.max(0, Math.round(m / 5) * 5) + ' m';
}

export function formatClock(hours) {
  const h = ((hours % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

const sRGBToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

const colorCache = new Map();
/** '#rrggbb' -> [r,g,b] in linear space, ready for vertex colours. */
export function lin(hex) {
  let c = colorCache.get(hex);
  if (c) return c;
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  c = [sRGBToLinear(r), sRGBToLinear(g), sRGBToLinear(b)];
  colorCache.set(hex, c);
  return c;
}

export function tint(hex, mul) {
  const [r, g, b] = lin(hex);
  return [r * mul, g * mul, b * mul];
}

/** 0..1 hash used for cheap per-instance randomness. */
export function hash01(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
