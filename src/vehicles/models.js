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
import { lin, lerp } from '../core/util.js';
import { TEX } from '../world/textures.js';

const GLASS = lin('#0e141a');
const DARKTRIM = lin('#171b20');
const CHROME = lin('#b8bec6');
const TYRE = lin('#101216');
const RIM = lin('#9aa1a9');

// Lamp glass, seen unlit: dark red at the back, pale grey-white in front.
const LENS_TAIL = lin('#5e1712');
const LENS_HEAD = lin('#c9c3b2');
const LENS_AMBER = lin('#9a5f1b');
const LAMP_BEZEL = lin('#0b0e12');
// Emissive colours, used by the additive glow quads (values may exceed 1).
const GLOW_RED = [1.0, 0.07, 0.03];
const GLOW_HEAD = [1.0, 0.93, 0.8];

// [z, halfWidth, yBottom, yTop]
const PROFILES = {
  sedan: {
    l: 4.54, w: 1.85, wheelR: 0.335, wb: 2.72, type: 'sedan',
    body: [
      [-2.27, 0.79, 0.42, 0.87], [-2.18, 0.87, 0.34, 0.91], [-1.95, 0.915, 0.28, 0.935],
      [-1.55, 0.925, 0.26, 0.95], [-0.60, 0.925, 0.25, 0.95], [0.40, 0.918, 0.25, 0.94],
      [1.20, 0.90, 0.26, 0.92], [1.75, 0.875, 0.29, 0.88], [2.10, 0.87, 0.33, 0.84],
      [2.27, 0.79, 0.40, 0.79]
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
      [-1.98, 0.76, 0.40, 0.88], [-1.90, 0.83, 0.33, 0.92], [-1.66, 0.86, 0.27, 0.94],
      [-1.30, 0.865, 0.25, 0.96], [-0.50, 0.875, 0.25, 0.96], [0.40, 0.868, 0.25, 0.95],
      [1.10, 0.85, 0.26, 0.93], [1.56, 0.83, 0.29, 0.88], [1.86, 0.83, 0.33, 0.82],
      [1.98, 0.76, 0.40, 0.75]
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
      [-2.38, 0.80, 0.42, 0.90], [-2.30, 0.87, 0.35, 0.93], [-2.06, 0.915, 0.28, 0.94],
      [-1.65, 0.925, 0.26, 0.96], [-0.60, 0.925, 0.25, 0.96], [0.45, 0.918, 0.25, 0.95],
      [1.25, 0.90, 0.26, 0.93], [1.82, 0.875, 0.29, 0.89], [2.20, 0.87, 0.33, 0.84],
      [2.38, 0.80, 0.40, 0.79]
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
      [-2.17, 0.80, 0.34, 0.74], [-2.08, 0.88, 0.27, 0.78], [-1.86, 0.915, 0.23, 0.79],
      [-1.45, 0.945, 0.21, 0.83], [-0.55, 0.965, 0.20, 0.83], [0.35, 0.955, 0.21, 0.82],
      [1.15, 0.925, 0.22, 0.79], [1.66, 0.90, 0.25, 0.75], [2.05, 0.89, 0.28, 0.70],
      [2.17, 0.80, 0.32, 0.64]
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
      [-2.58, 0.94, 0.36, 1.90], [-2.52, 0.97, 0.32, 1.92], [-2.34, 0.985, 0.30, 1.93],
      [-1.60, 0.99, 0.28, 1.94], [-0.20, 0.99, 0.28, 1.94], [1.00, 0.985, 0.28, 1.93],
      [1.72, 0.96, 0.29, 1.84], [2.18, 0.94, 0.31, 1.56], [2.46, 0.92, 0.35, 1.14],
      [2.58, 0.86, 0.40, 0.86]
    ],
    cabin: [
      [1.60, 0.93, 1.00, 1.89], [1.95, 0.91, 1.00, 1.80], [2.24, 0.85, 1.00, 1.46],
      [2.44, 0.76, 1.00, 1.06]
    ]
  },
  truck: {
    l: 7.4, w: 2.42, wheelR: 0.47, wb: 4.6, type: 'truck',
    body: [
      [-3.70, 1.18, 0.42, 2.72], [-3.62, 1.20, 0.40, 2.76], [-3.30, 1.21, 0.36, 2.78],
      [-2.00, 1.21, 0.34, 2.81], [0.40, 1.21, 0.34, 2.81], [1.70, 1.20, 0.35, 2.78],
      [2.40, 1.17, 0.37, 2.60], [2.95, 1.12, 0.40, 2.00], [3.45, 1.08, 0.46, 1.26],
      [3.70, 1.04, 0.52, 1.00]
    ],
    cabin: [
      [2.00, 1.15, 1.30, 2.54], [2.45, 1.13, 1.30, 2.34], [2.90, 1.06, 1.30, 1.86],
      [3.25, 0.97, 1.30, 1.36]
    ]
  },
  classic: {
    l: 4.66, w: 1.80, wheelR: 0.325, wb: 2.84, type: 'classic',
    body: [
      [-2.33, 0.77, 0.46, 0.88], [-2.26, 0.84, 0.38, 0.92], [-2.06, 0.87, 0.33, 0.94],
      [-1.70, 0.885, 0.31, 0.96], [-0.70, 0.90, 0.30, 0.96], [0.35, 0.895, 0.30, 0.95],
      [1.20, 0.875, 0.31, 0.93], [1.75, 0.85, 0.34, 0.90], [2.15, 0.84, 0.40, 0.82],
      [2.33, 0.78, 0.44, 0.75]
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

// --- lamps ---------------------------------------------------------------
//
// Every car gets its lamp housings cut into the body geometry (so they read as
// real fixtures in daylight) plus, on cars whose owner matters, a pair of
// additive glow quads that light up. The housings and the glow quads are laid
// out by the same function, so they always line up.

/** Linearly read half-width and roof/floor heights off a body profile at z. */
function bodySample(profile, z) {
  const s = profile.body;
  const last = s[s.length - 1];
  if (z <= s[0][0]) return { hw: s[0][1], yb: s[0][2], yt: s[0][3] };
  if (z >= last[0]) return { hw: last[1], yb: last[2], yt: last[3] };
  for (let i = 1; i < s.length; i++) {
    if (z > s[i][0]) continue;
    const a = s[i - 1];
    const b = s[i];
    const t = (z - a[0]) / (b[0] - a[0] || 1);
    return {
      hw: lerp(a[1], b[1], t),
      yb: lerp(a[2], b[2], t),
      yt: lerp(a[3], b[3], t)
    };
  }
  return { hw: last[1], yb: last[2], yt: last[3] };
}

/** The flat panel at one end of the car: the first or last body section. */
function endPanel(profile, front) {
  const b = profile.body;
  const s = front ? b[b.length - 1] : b[0];
  return { z: s[0], hw: s[1], yb: s[2], yt: s[3] };
}

/**
 * Lamp geometry on an end panel. The bands are fractions of the panel's half
 * width, so a wide sedan and a narrow hatch both get a lamp that fills the
 * corner instead of a box hanging off the body.
 */
function lampFaceLayout(profile, front) {
  const p = endPanel(profile, front);
  const panelH = p.yt - p.yb;
  const h = Math.max(0.13, Math.min(0.26, panelH * 0.42));
  const y = Math.min(p.yb + panelH * 0.6, p.yb + 0.55 + h * 0.5);
  // the front leaves the middle of the panel for the grille
  const inner = front ? [0.24, 0.46] : [0.16, 0.44];
  const outer = front ? [0.50, 0.86] : [0.48, 0.9];
  return {
    z: p.z,
    dir: front ? 1 : -1,
    y,
    h,
    hw: p.hw,
    yb: p.yb,
    yt: p.yt,
    inner: [p.hw * inner[0], p.hw * inner[1]],
    outer: [p.hw * outer[0], p.hw * outer[1]]
  };
}

/** A housing with two lenses on the rear (or front) panel, both sides. */
function addLampClusters(b, profile, front) {
  const L = lampFaceLayout(profile, front);
  const glass = front ? LENS_HEAD : LENS_TAIL;
  // front: amber indicators inboard; rear: a second dark-red brake lens
  const innerGlass = front ? LENS_AMBER : LENS_TAIL;
  const bezelZ = L.z + L.dir * 0.008;
  const lensZ = L.z + L.dir * 0.026;
  const mid = (L.inner[0] + L.outer[1]) * 0.5;
  const halfW = L.outer[1] - L.inner[0];
  const innerMid = (L.inner[0] + L.inner[1]) * 0.5;
  const outerMid = (L.outer[0] + L.outer[1]) * 0.5;
  for (const sx of [1, -1]) {
    b.box(sx * mid, L.y, bezelZ, halfW, L.h * 1.18, 0.055, LAMP_BEZEL);
    b.box(sx * innerMid, L.y, lensZ, L.inner[1] - L.inner[0], L.h * 0.92, 0.03, innerGlass);
    b.box(sx * outerMid, L.y, lensZ, L.outer[1] - L.outer[0], L.h, 0.03, glass);
  }
}

/** Reversing lamps, the plate and the high-level brake light: back of a car. */
function addRearTrim(b, profile) {
  const l = profile.l;
  const L = lampFaceLayout(profile, false);
  // the clear strip between the bumper lip and the bottom of the lamp band
  const bandBottom = L.y - L.h * 0.5;
  const lipTop = L.yb + 0.05;
  const gap = Math.max(0.09, bandBottom - lipTop);
  const plateH = Math.min(0.12, gap * 0.62);
  const rowY = lipTop + gap * 0.5;
  b.box(0, rowY, L.z - 0.024, 0.44, plateH, 0.03, lin('#e9e3c2'));
  // small white reversing lamps flanking the plate
  for (const sx of [1, -1]) {
    b.box(sx * 0.31, rowY, L.z - 0.016, 0.09, plateH * 0.7, 0.03, LENS_HEAD);
  }
  // high-level brake light along the boot / tailgate edge; on a van or truck
  // the top of the tailgate is the roof, so the light goes on the lamp band
  const zS = -l * 0.5 + 0.07;
  const sS = bodySample(profile, zS);
  if (sS.yt < 1.3) {
    b.box(0, sS.yt + 0.012, zS, Math.min(0.62, profile.w * 0.42), 0.03, 0.12, LENS_TAIL);
  } else {
    b.box(0, L.y + L.h * 0.5 + 0.03, L.z - 0.012, Math.min(0.9, profile.w * 0.7), 0.03, 0.04, LENS_TAIL);
  }
}

// The glow is a slab just outside each lens face, so the depth test lets it
// show: a slab buried inside the lens would be hidden by the lens itself.
// A tail cluster lights across its whole width, so the rear glow spans both
// lenses; the front only lights the headlamp, not the amber indicator.
function lampGlowGeometry(profile, front) {
  const L = lampFaceLayout(profile, front);
  const glow = front ? GLOW_HEAD : GLOW_RED;
  const z = L.z + L.dir * 0.044;
  const span = front ? L.outer : [L.inner[0], L.outer[1]];
  const mid = (span[0] + span[1]) * 0.5;
  const b = new GeomBuilder();
  for (const sx of [1, -1]) {
    b.box(sx * mid, L.y, z, span[1] - span[0], L.h * 0.94, 0.008, glow);
  }
  if (!front) {
    const zS = -profile.l * 0.5 + 0.07;
    const sS = bodySample(profile, zS);
    b.box(0, sS.yt + 0.012, zS - 0.012, Math.min(0.62, profile.w * 0.42), 0.036, 0.14, glow);
  }
  return b.build();
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
  roughness: 0.32,
  metalness: 0.3,
  envMapIntensity: 0.9
});

const playerBodyMaterial = new THREE.MeshPhysicalMaterial({
  vertexColors: true,
  color: 0xffffff,
  roughness: 0.24,
  metalness: 0.3,
  envMapIntensity: 1.15,
  clearcoat: 0.9,
  clearcoatRoughness: 0.1
});

// Lamp glow: additive, drawn after the solid lenses. The polygon offset keeps
// it from fighting the lens faces it sits on.
function glowMaterial() {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    color: 0x000000,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
}

// --- geometry cache ------------------------------------------------------

const geomCache = new Map();

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
  const rear = endPanel(profile, false);
  const nose = endPanel(profile, true);

  // rocker / sill, kept inside the body outline
  d.box(0, 0.34, 0, w * 0.9, 0.1, l * 0.6, DARKTRIM);
  // slim bumper lips along the bottom edge of each end panel
  d.box(0, rear.yb + 0.022, rear.z - 0.03, rear.hw * 1.94, 0.055, 0.13, DARKTRIM);
  d.box(0, nose.yb + 0.022, nose.z + 0.03, nose.hw * 1.94, 0.055, 0.13, DARKTRIM);
  // grille, in the gap the headlamps leave in the middle of the nose
  const noseH = nose.yt - nose.yb;
  const grilleY = nose.yb + noseH * 0.6;
  const grilleH = Math.max(0.12, Math.min(0.24, noseH * 0.4));
  d.box(0, grilleY, nose.z + 0.02, nose.hw * 0.78, grilleH, 0.05, DARKTRIM);
  for (let i = 0; i < 3; i++) {
    d.box(0, grilleY - grilleH * 0.28 + i * grilleH * 0.28, nose.z + 0.044, nose.hw * 0.72, 0.016, 0.02, CHROME);
  }
  // number plate on the nose
  d.box(0, nose.yb + noseH * 0.22, nose.z + 0.024, 0.44, 0.12, 0.03, lin('#e9e3c2'));

  // mirrors, mounted where the A-pillar meets the door
  const cab = profile.cabin;
  const mSec = cab[cab.length - 2];
  const mz = mSec[0] - 0.05;
  const mHw = bodySample(profile, mz).hw;
  const mY = mSec[2] + (mSec[3] - mSec[2]) * 0.5;
  for (const sx of [1, -1]) {
    d.box(sx * (mHw + 0.04), mY, mz, 0.11, 0.045, 0.055, DARKTRIM);
    d.box(sx * (mHw + 0.13), mY + 0.03, mz, 0.09, 0.1, 0.17, paint);
  }

  // door seams and handles, kept inside the flat part of the flank
  const ring = (s) => Math.min(s.hw * 0.34, (s.yt - s.yb) * 0.34, 0.2);
  const band = (z) => {
    const s = bodySample(profile, z);
    const r = ring(s);
    return { x: s.hw, y0: s.yb + r * 0.85, y1: s.yt - r };
  };
  const doorZ = [
    profile.cabin[1][0] + 0.1,
    profile.cabin[Math.max(2, profile.cabin.length - 2)][0] - 0.15
  ];
  for (const sx of [1, -1]) {
    for (const dz of doorZ) {
      const bd = band(dz);
      const midY = (bd.y0 + bd.y1) * 0.5;
      const seamH = Math.max(0.18, (bd.y1 - bd.y0) * 0.8);
      d.box(sx * (bd.x + 0.003), midY, dz, 0.012, seamH, 0.022, DARKTRIM);
      d.box(sx * (bd.x + 0.016), midY - seamH * 0.2, dz + 0.25, 0.045, 0.045, 0.16, CHROME);
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

  // wheel arches: dark inner arch behind each wheel, tucked under the flank
  for (const sz of [profile.wb * 0.5, -profile.wb * 0.5]) {
    for (const sx of [1, -1]) {
      d.box(sx * (w * 0.5 - 0.075), profile.wheelR + 0.02, sz, 0.07, profile.wheelR * 1.5, profile.wheelR * 2.6, DARKTRIM);
    }
  }

  // head and tail lamps, on every car
  if (detail) {
    addLampClusters(d, profile, false);
    addLampClusters(d, profile, true);
    addRearTrim(d, profile);
  }

  // roof signs, light bars and stripes
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

  // Lamp glow: one thin additive layer over the rear clusters and the high
  // level brake light, one over the headlamps. Cars that are parked up and
  // switched off (opts.lights === false) skip them entirely.
  let lamps = null;
  if (opts.lights !== false) {
    const mk = (kind, build) => {
      const geo = mergedCached(kind + '|' + profile.type, build);
      const mat = glowMaterial();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 3;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      bodyPivot.add(mesh);
      return mat;
    };
    lamps = {
      tail: mk('tailglow', () => lampGlowGeometry(profile, false)),
      head: mk('headglow', () => lampGlowGeometry(profile, true))
    };
  }

  const wheels = [];
  const wheelGeom = mergedCached('wheel|' + profile.wheelR, () => wheelGeometry(profile.wheelR, profile.wheelR * 0.65));
  const halfTrack = profile.w * 0.5 - 0.085;
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

  return { group, bodyPivot, bodyMesh, wheels, profile, shadow, lamps };
}

export { PROFILES };
