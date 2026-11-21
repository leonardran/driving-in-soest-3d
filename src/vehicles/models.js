// Procedural car models.
//
// The hull is a smooth loft through Catmull-Rom cross sections. The cabin is a
// second loft whose sides are glass and whose top is body colour, with A/B/C
// pillars laid over the top, wheel arches cut into the sides, and separate
// emissive lights, chrome, plates and wheels. Forward is +Z.
//
// Geometries are cached per (body, colour, variant) so 170 cars in the street
// share a handful of buffers.

import * as THREE from 'three';
import { GeomBuilder } from '../core/geom.js';
import { lin } from '../core/util.js';
import { TEX, signTexture } from '../world/textures.js';

const GLASS = lin('#0e141a');
const DARKTRIM = lin('#171b20');
const CHROME = lin('#b8bec6');
const TYRE = lin('#101216');
const RIM = lin('#9aa1a9');
const RED = lin('#a8241d');
const AMBER = lin('#c8892a');
const HEAD = lin('#e8e4d4');

// [z, halfWidth, yBottom, yTop]
const PROFILES = {
  sedan: {
    l: 4.54, w: 1.85, wheelR: 0.335, wb: 2.72, type: 'sedan',
    body: [
      [-2.27, 0.56, 0.46, 0.66], [-2.18, 0.74, 0.34, 0.85], [-1.95, 0.86, 0.28, 0.92],
      [-1.55, 0.915, 0.26, 0.95], [-0.60, 0.925, 0.25, 0.95], [0.40, 0.918, 0.25, 0.94],
      [1.20, 0.90, 0.26, 0.92], [1.75, 0.86, 0.29, 0.88], [2.12, 0.78, 0.33, 0.79],
      [2.24, 0.62, 0.42, 0.66]
    ],
    cabin: [
      [-1.72, 0.70, 0.90, 1.12], [-1.48, 0.79, 0.90, 1.33], [-1.12, 0.835, 0.90, 1.44],
      [-0.60, 0.85, 0.90, 1.47], [0.10, 0.845, 0.90, 1.44], [0.62, 0.81, 0.90, 1.34],
      [0.96, 0.70, 0.90, 1.12], [1.06, 0.60, 0.90, 0.98]
    ]
  },
  hatch: {
    l: 3.96, w: 1.76, wheelR: 0.315, wb: 2.42, type: 'hatch',
    body: [
      [-1.98, 0.54, 0.44, 0.66], [-1.90, 0.71, 0.32, 0.85], [-1.66, 0.82, 0.27, 0.93],
      [-1.30, 0.865, 0.25, 0.96], [-0.50, 0.875, 0.25, 0.96], [0.40, 0.868, 0.25, 0.95],
      [1.10, 0.85, 0.26, 0.93], [1.56, 0.80, 0.29, 0.88], [1.86, 0.70, 0.35, 0.76],
      [1.96, 0.56, 0.43, 0.64]
    ],
    cabin: [
      [-1.80, 0.72, 0.92, 1.28], [-1.58, 0.785, 0.92, 1.43], [-1.20, 0.81, 0.92, 1.52],
      [-0.60, 0.818, 0.92, 1.545], [0.10, 0.81, 0.92, 1.50], [0.58, 0.78, 0.92, 1.38],
      [0.90, 0.68, 0.92, 1.10], [1.00, 0.58, 0.92, 0.98]
    ]
  },
  wagon: {
    l: 4.76, w: 1.86, wheelR: 0.335, wb: 2.88, type: 'wagon',
    body: [
      [-2.38, 0.56, 0.46, 0.68], [-2.30, 0.74, 0.34, 0.87], [-2.06, 0.86, 0.28, 0.94],
      [-1.65, 0.915, 0.26, 0.96], [-0.60, 0.925, 0.25, 0.96], [0.45, 0.918, 0.25, 0.95],
      [1.25, 0.90, 0.26, 0.93], [1.82, 0.86, 0.29, 0.89], [2.20, 0.78, 0.33, 0.80],
      [2.34, 0.62, 0.42, 0.67]
    ],
    cabin: [
      [-2.28, 0.74, 0.92, 1.42], [-2.10, 0.79, 0.92, 1.49], [-1.60, 0.835, 0.92, 1.51],
      [-0.60, 0.85, 0.92, 1.53], [0.15, 0.84, 0.92, 1.50], [0.66, 0.80, 0.92, 1.38],
      [1.00, 0.68, 0.92, 1.14], [1.10, 0.58, 0.92, 1.00]
    ]
  },
  sport: {
    l: 4.34, w: 1.92, wheelR: 0.345, wb: 2.58, type: 'sport',
    body: [
      [-2.17, 0.58, 0.38, 0.56], [-2.08, 0.78, 0.28, 0.71], [-1.86, 0.90, 0.23, 0.79],
      [-1.45, 0.945, 0.21, 0.83], [-0.55, 0.965, 0.20, 0.83], [0.35, 0.955, 0.21, 0.82],
      [1.15, 0.925, 0.22, 0.79], [1.66, 0.88, 0.25, 0.74], [2.04, 0.78, 0.28, 0.65],
      [2.16, 0.62, 0.32, 0.54]
    ],
    cabin: [
      [-1.54, 0.68, 0.80, 1.01], [-1.32, 0.755, 0.80, 1.16], [-0.95, 0.785, 0.80, 1.25],
      [-0.45, 0.793, 0.80, 1.275], [0.10, 0.785, 0.80, 1.25], [0.50, 0.75, 0.80, 1.13],
      [0.80, 0.64, 0.80, 0.96], [0.92, 0.54, 0.80, 0.86]
    ]
  },
  van: {
    l: 5.16, w: 2.0, wheelR: 0.365, wb: 3.2, type: 'van',
    body: [
      [-2.58, 0.72, 0.44, 0.96], [-2.52, 0.90, 0.34, 1.70], [-2.34, 0.96, 0.30, 1.87],
      [-1.60, 0.985, 0.28, 1.93], [-0.20, 0.99, 0.28, 1.94], [1.00, 0.985, 0.28, 1.93],
      [1.72, 0.96, 0.29, 1.84], [2.18, 0.90, 0.31, 1.56], [2.46, 0.82, 0.35, 1.14],
      [2.56, 0.72, 0.41, 0.84]
    ],
    cabin: [
      [1.60, 0.93, 1.00, 1.89], [1.95, 0.91, 1.00, 1.80], [2.24, 0.85, 1.00, 1.46],
      [2.44, 0.76, 1.00, 1.06]
    ]
  },
  truck: {
    l: 7.4, w: 2.42, wheelR: 0.47, wb: 4.6, type: 'truck',
    body: [
      [-3.70, 0.92, 0.54, 1.20], [-3.58, 1.13, 0.42, 2.58], [-3.30, 1.19, 0.36, 2.76],
      [-2.00, 1.21, 0.34, 2.81], [0.40, 1.21, 0.34, 2.81], [1.70, 1.20, 0.35, 2.78],
      [2.40, 1.17, 0.37, 2.60], [2.95, 1.12, 0.40, 2.00], [3.45, 1.00, 0.46, 1.26],
      [3.66, 0.88, 0.52, 0.98]
    ],
    cabin: [
      [2.00, 1.15, 1.30, 2.54], [2.45, 1.13, 1.30, 2.34], [2.90, 1.06, 1.30, 1.86],
      [3.25, 0.97, 1.30, 1.36]
    ]
  },
  classic: {
    l: 4.66, w: 1.80, wheelR: 0.325, wb: 2.84, type: 'classic',
    body: [
      [-2.33, 0.54, 0.50, 0.74], [-2.26, 0.72, 0.38, 0.89], [-2.06, 0.84, 0.33, 0.94],
      [-1.70, 0.885, 0.31, 0.96], [-0.70, 0.90, 0.30, 0.96], [0.35, 0.895, 0.30, 0.95],
      [1.20, 0.875, 0.31, 0.93], [1.75, 0.83, 0.34, 0.90], [2.14, 0.74, 0.40, 0.82],
      [2.30, 0.60, 0.46, 0.70]
    ],
    cabin: [
      [-1.80, 0.68, 0.92, 1.24], [-1.58, 0.76, 0.92, 1.42], [-1.20, 0.80, 0.92, 1.53],
      [-0.65, 0.808, 0.92, 1.555], [0.05, 0.80, 0.92, 1.52], [0.50, 0.77, 0.92, 1.38],
      [0.84, 0.66, 0.92, 1.12], [0.96, 0.56, 0.92, 1.00]
    ]
  }
};

// --- lofting -------------------------------------------------------------

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function resample(sections, count) {
  const m = sections.length;
  const at = (k) => sections[Math.max(0, Math.min(m - 1, k))];
  const out = [];
  for (let i = 0; i < count; i++) {
    const u = (i / (count - 1)) * (m - 1);
    const i0 = Math.min(m - 2, Math.floor(u));
    const t = u - i0;
    const a = at(i0 - 1);
    const b = at(i0);
    const c = at(i0 + 1);
    const d = at(i0 + 2);
    out.push([
      catmull(a[0], b[0], c[0], d[0], t),
      catmull(a[1], b[1], c[1], d[1], t),
      catmull(a[2], b[2], c[2], d[2], t),
      catmull(a[3], b[3], c[3], d[3], t)
    ]);
  }
  return out;
}

/** Ring of a body cross-section: flat-ish sides with a rounded shoulder. */
function bodyRing(hw, yb, yt) {
  const r = Math.min(hw * 0.34, (yt - yb) * 0.34, 0.2);
  return [
    [hw * 0.93, yb],
    [hw, yb + r * 0.8],
    [hw, yt - r],
    [hw - r, yt],
    [-hw + r, yt],
    [-hw, yt - r],
    [-hw, yb + r * 0.8],
    [-hw * 0.93, yb]
  ];
}

/** Ring of a cabin cross-section. */
function cabinRing(hw, yb, yt) {
  const r = Math.min(hw * 0.3, (yt - yb) * 0.26, 0.2);
  return {
    sides: [
      [hw, yb],
      [hw, (yb + yt) * 0.5],
      [hw, yt - r]
    ],
    top: [
      [hw, yt - r],
      [hw - r, yt],
      [-(hw - r), yt],
      [-hw, yt - r]
    ],
    left: [
      [-hw, yt - r],
      [-hw, (yb + yt) * 0.5],
      [-hw, yb]
    ]
  };
}

function pushBodyHull(pos, col, idx, sections, paint, smooth = 20) {
  const rings = resample(sections, smooth);
  const base = pos.length / 3;
  const R = 8;
  for (const s of rings) {
    const pts = bodyRing(s[1], s[2], s[3]);
    for (const p of pts) {
      pos.push(p[0], p[1], s[0]);
      col.push(paint[0], paint[1], paint[2]);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < R; k++) {
      const kn = (k + 1) % R;
      const a = base + i * R + k;
      const b = base + i * R + kn;
      const c = base + (i + 1) * R + kn;
      const d = base + (i + 1) * R + k;
      // bottom faces get the dark trim colour
      const isBottom = k === 7;
      if (isBottom) {
        const t = base + 0;
        void t;
      }
      idx.push(a, b, c, a, c, d);
    }
  }
  const first = base;
  const last = base + (rings.length - 1) * R;
  for (let k = 1; k < R - 1; k++) {
    idx.push(first, first + k + 1, first + k);
    idx.push(last, last + k, last + k + 1);
  }
  return { rings, R, base };
}

function pushCabinHull(pos, col, idx, sections, paint, glass, smooth = 18) {
  // Two ribbons: side glass (both sides) and the body-coloured roof.
  const rings = resample(sections, smooth);
  const start = pos.length / 3;

  // side walls, glass
  for (let i = 0; i < rings.length; i++) {
    const s = rings[i];
    const r = cabinRing(s[1], s[2], s[3]);
    // right side (3 points bottom→top), then left side
    pos.push(s[1], r.sides[0][1], s[0], s[1], r.sides[1][1], s[0], s[1], r.sides[2][1], s[0]);
    pos.push(-s[1], r.left[0][1], s[0], -s[1], r.left[1][1], s[0], -s[1], r.left[2][1], s[0]);
    for (let k = 0; k < 6; k++) col.push(glass[0], glass[1], glass[2]);
  }
  const S = 6;
  for (let i = 0; i < rings.length - 1; i++) {
    const a = start + i * S;
    const b = start + (i + 1) * S;
    // right: points 0,1,2 (bottom,mid,top)
    idx.push(a + 0, a + 1, b + 1, a + 0, b + 1, b + 0);
    idx.push(a + 1, a + 2, b + 2, a + 1, b + 2, b + 1);
    // left: points 3,4,5 (top,mid,bottom)
    idx.push(a + 4, a + 3, b + 3, a + 4, b + 3, b + 4);
    idx.push(a + 5, a + 4, b + 4, a + 5, b + 4, b + 5);
  }

  // roof, body colour
  const roofStart = pos.length / 3;
  for (let i = 0; i < rings.length; i++) {
    const s = rings[i];
    const r = cabinRing(s[1], s[2], s[3]);
    for (const p of r.top) {
      pos.push(p[0], p[1], s[0]);
      col.push(paint[0], paint[1], paint[2]);
    }
  }
  const T = 4;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < T - 1; k++) {
      const a = roofStart + i * T + k;
      const b = roofStart + i * T + k + 1;
      const c = roofStart + (i + 1) * T + k + 1;
      const d = roofStart + (i + 1) * T + k;
      idx.push(a, b, c, a, c, d);
    }
  }

  // windshield and rear window: fill the caps in glass
  const capStart = pos.length / 3;
  const firstRing = rings[0];
  const lastRing = rings[rings.length - 1];
  const addCap = (s, flip) => {
    const r = cabinRing(s[1], s[2], s[3]);
    const pts = [
      [s[1], s[2], s[0]],
      [s[1], s[3] - 0.06, s[0]],
      [-(s[1]), s[3] - 0.06, s[0]],
      [-s[1], s[2], s[0]]
    ];
    void r;
    const b0 = pos.length / 3;
    for (const p of pts) {
      pos.push(p[0], p[1], p[2]);
      col.push(glass[0], glass[1], glass[2]);
    }
    if (flip) idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
    else idx.push(b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2);
  };
  addCap(firstRing, true);
  addCap(lastRing, false);
  void capStart;

  return { rings };
}

// --- wheels --------------------------------------------------------------

function wheelGeometry(r, width) {
  const b = new GeomBuilder();
  const seg = 16;
  // tyre: two cylinders back to back to give a rounded shoulder
  b.cylinder(0, 0, 0, r, width * 0.94, seg, TYRE, { cap: false });
  b.cylinder(0, -width * 0.47, 0, r * 0.94, width * 0.06, seg, TYRE, { cap: false });
  b.cylinder(0, width * 0.47, 0, r * 0.94, width * 0.06, seg, TYRE, { cap: false });
  // rim
  b.cylinder(0, width * 0.42, 0, r * 0.63, width * 0.06, seg, RIM);
  b.cylinder(0, -width * 0.42, 0, r * 0.63, width * 0.06, seg, RIM);
  // spokes
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const cx = Math.cos(a) * r * 0.34;
    const cz = Math.sin(a) * r * 0.34;
    b.box(cx, width * 0.45, cz, r * 0.72, 0.035, 0.085, RIM, { ry: -a });
  }
  b.cylinder(0, width * 0.46, 0, r * 0.16, 0.04, 8, CHROME);
  // the geometry is built upright; lay it on its side
  const g = b.build();
  g.rotateZ(Math.PI / 2);
  return g;
}

export const WHEEL_MAT = new THREE.MeshStandardMaterial({
  vertexColors: true, color: 0xffffff, roughness: 0.72, metalness: 0.28
});

// --- shared materials ----------------------------------------------------

const bodyMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  color: 0xffffff,
  roughness: 0.34,
  metalness: 0.22
});

const playerBodyMaterial = new THREE.MeshPhysicalMaterial({
  vertexColors: true,
  color: 0xffffff,
  roughness: 0.26,
  metalness: 0.22,
  clearcoat: 0.85,
  clearcoatRoughness: 0.12
});

const glassMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  color: 0xffffff,
  roughness: 0.06,
  metalness: 0.55
});

const lightMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  color: 0xffffff,
  roughness: 0.2,
  metalness: 0.1,
  emissive: new THREE.Color(0xffffff),
  emissiveIntensity: 0.22
});

// --- geometry cache ------------------------------------------------------

const geomCache = new Map();
const plateTex = signTexture('SOEST · 3D', { bg: '#e9e3c2', fg: '#1d1d1d', size: 74, border: '#8d8a5c' });

function plateGeometry(w, h) {
  const g = new THREE.PlaneGeometry(w, h);
  return g;
}

function buildCarGeom(profile, typeId, paint, accent, detail) {
  const pos = [];
  const col = [];
  const idx = [];

  pushBodyHull(pos, col, idx, profile.body, paint);
  pushCabinHull(pos, col, idx, profile.cabin, paint, detail ? GLASS : lin('#12181e'));

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();

  // detail parts in a second builder, then merged
  const d = new GeomBuilder();
  const l = profile.l;
  const w = profile.w;
  const cabinTop = profile.cabin.reduce((m, s) => Math.max(m, s[3]), 0);

  // rocker / sill, kept inside the body outline
  d.box(0, 0.34, 0, w * 0.9, 0.1, l * 0.6, DARKTRIM);
  // bumpers
  d.box(0, 0.5, l * 0.5 - 0.04, w * 0.9, 0.26, 0.2, DARKTRIM);
  d.box(0, 0.5, -l * 0.5 + 0.04, w * 0.9, 0.26, 0.2, DARKTRIM);
  // grille
  d.box(0, 0.78, l * 0.5 - 0.02, w * 0.44, 0.16, 0.08, DARKTRIM);
  for (let i = 0; i < 3; i++) {
    d.box(0, 0.72 + i * 0.05, l * 0.5 + 0.005, w * 0.4, 0.018, 0.03, CHROME);
  }
  // number plate
  d.box(0, 0.6, l * 0.5 + 0.02, 0.5, 0.13, 0.02, lin('#e9e3c2'));
  d.box(0, 0.6, -l * 0.5 - 0.02, 0.5, 0.13, 0.02, lin('#e9e3c2'));

  // mirrors on short arms
  const cab = profile.cabin;
  for (const sx of [1, -1]) {
    const mid = cab[Math.min(1, cab.length - 1)];
    const mz = mid[0];
    const mh = mid[3] - 0.08;
    d.box(sx * (w * 0.5 + 0.045), mh - 0.04, mz + 0.18, 0.09, 0.05, 0.06, DARKTRIM);
    d.box(sx * (w * 0.5 + 0.11), mh + 0.02, mz + 0.2, 0.13, 0.1, 0.2, paint);
  }

  // door seams and handles
  const doorZ = [
    profile.cabin[1][0] + 0.1,
    profile.cabin[Math.max(2, profile.cabin.length - 2)][0] - 0.15
  ];
  for (const sx of [1, -1]) {
    for (const dz of doorZ) {
      d.box(sx * (w * 0.5 + 0.004), 0.62, dz, 0.012, 0.5, 0.022, DARKTRIM);
      d.box(sx * (w * 0.5 + 0.02), 0.92, dz + 0.42, 0.05, 0.05, 0.18, CHROME);
    }
  }

  // pillars: A, B and C over the glass ribbon
  const pillarAt = (s, width) => {
    const yb = s[2] + 0.02;
    const yt = s[3] - 0.04;
    for (const sx of [1, -1]) {
      d.box(sx * (s[1] - 0.005), (yb + yt) * 0.5, s[0], 0.07, yt - yb, width, paint);
    }
  };
  pillarAt(cab[1], 0.1);
  if (cab.length > 4) pillarAt(cab[Math.floor(cab.length / 2)], 0.09);
  pillarAt(cab[cab.length - 2], 0.11);

  // wheel arches: dark inner arch behind each wheel
  for (const sz of [profile.wb * 0.5, -profile.wb * 0.5]) {
    for (const sx of [1, -1]) {
      d.box(sx * (w * 0.5 - 0.03), profile.wheelR + 0.02, sz, 0.1, profile.wheelR * 1.5, profile.wheelR * 2.6, DARKTRIM);
    }
  }

  // lights
  if (typeId === 'taxi') {
    d.box(0, cabinTop + 0.06, -0.1, 0.56, 0.04, 0.24, DARKTRIM);
    d.box(0, cabinTop + 0.16, -0.1, 0.6, 0.17, 0.28, lin('#ffd43a'));
  } else if (typeId === 'police') {
    d.box(0, cabinTop + 0.1, -0.05, 1.1, 0.16, 0.3, lin('#f0f0f0'));
    d.box(0, 0.66, 0, w * 1.005, 0.2, l * 0.5, lin(accentHex(accent)));
  } else if (typeId === 'ambulance') {
    d.box(0, 1.0, 0, w * 1.005, 0.2, l * 0.6, lin('#c8302a'));
  } else if (typeId === 'fire') {
    for (let i = 0; i < 5; i++) {
      d.box(-0.62 + i * 0.31, 2.9, -0.4, 0.08, 0.08, 3.2, CHROME);
    }
  } else if (typeId === 'sport') {
    d.box(0, 0.88, -l * 0.5 + 0.4, w * 0.6, 0.05, 0.28, DARKTRIM);
  }

  const g2 = d.build();

  // merge hull + detail
  const merged = mergeNonIndexed(g, g2);
  merged.computeBoundingSphere();
  return merged;
}

function accentHex(accent) {
  const r = Math.round(Math.sqrt(accent[0]) * 255);
  const gg = Math.round(Math.sqrt(accent[1]) * 255);
  const b = Math.round(Math.sqrt(accent[2]) * 255);
  return '#' + [r, gg, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function mergeNonIndexed(a, b) {
  const ga = a.index ? a.toNonIndexed() : a;
  const gb = b.index ? b.toNonIndexed() : b;
  const n = ga.attributes.position.count + gb.attributes.position.count;
  const pa = ga.attributes.position.array;
  const pb = gb.attributes.position.array;
  const na = ga.attributes.normal.array;
  const nb = gb.attributes.normal.array;
  const ca = ga.attributes.color.array;
  const cb = gb.attributes.color.array;
  const pos = new Float32Array(pa.length + pb.length);
  const nor = new Float32Array(na.length + nb.length);
  const col = new Float32Array(ca.length + cb.length);
  pos.set(pa, 0);
  pos.set(pb, pa.length);
  nor.set(na, 0);
  nor.set(nb, na.length);
  col.set(ca, 0);
  col.set(cb, ca.length);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  void n;
  if (ga !== a) ga.dispose();
  if (gb !== b) gb.dispose();
  return out;
}

function mergedCached(key, build) {
  let cached = geomCache.get(key);
  if (!cached) {
    cached = build();
    geomCache.set(key, cached);
  }
  return cached;
}

export function makeCarModel(typeId, type, colorHex, opts = {}) {
  const profile = PROFILES[type.body] || PROFILES.sedan;
  const paint = lin(colorHex || type.color);
  const accent = lin(type.accent || '#1d2229');
  const detail = opts.detail !== 'simple';

  const key = profile.type + '|' + (colorHex || type.color) + '|' + typeId + '|' + (detail ? 1 : 0);
  const geometry = mergedCached(key, () => buildCarGeom(profile, typeId, paint, accent, detail));

  const group = new THREE.Group();
  const bodyPivot = new THREE.Group();
  group.add(bodyPivot);

  const bodyMesh = new THREE.Mesh(geometry, opts.isPlayer ? playerBodyMaterial : bodyMaterial);
  bodyPivot.add(bodyMesh);

  // separate glass panel for the detailed/player cars only when needed
  // (glass is already baked into the hull as dark vertex colour)

  const wheels = [];
  const wheelGeom = mergedCached('wheel|' + profile.wheelR, () => wheelGeometry(profile.wheelR, profile.wheelR * 0.65));
  const halfTrack = profile.w * 0.5 - 0.055;
  const axleF = profile.wb * 0.5;
  const axleR = -profile.wb * 0.5;

  if (opts.liveWheels) {
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const wm = new THREE.Mesh(wheelGeom, WHEEL_MAT);
      wm.position.set(halfTrack * sx, profile.wheelR, sz > 0 ? axleF : axleR);
      wm.userData.front = sz > 0;
      group.add(wm);
      wheels.push(wm);
    }
  } else {
    const wb2 = new GeomBuilder();
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      wb2.cylinder(halfTrack * sx, profile.wheelR, sz > 0 ? axleF : axleR, profile.wheelR, profile.wheelR * 0.65, 12,
        TYRE);
    }
    const wm = new THREE.Mesh(wb2.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    wm.matrixAutoUpdate = false;
    wm.updateMatrix();
    group.add(wm);
  }

  // soft contact shadow
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(profile.w * 1.75, profile.l * 1.15),
    new THREE.MeshBasicMaterial({ map: TEX.blob(), transparent: true, opacity: 0.62, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.145;
  shadow.renderOrder = 2;
  if (opts.noShadow) shadow.visible = false;
  group.add(shadow);

  group.userData.radius = Math.max(profile.l, profile.w) * 0.42;
  group.userData.dims = profile;

  void lightMaterial;
  void plateTex;
  void plateGeometry;

  return { group, bodyPivot, bodyMesh, wheels, profile, shadow };
}

export { PROFILES };
