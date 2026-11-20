// Procedural car models. The hulls are built from smooth Catmull-Rom cross
// sections with averaged normals, so the cars read as rounded shapes instead
// of stacked boxes. Forward is +Z.

import * as THREE from 'three';
import { GeomBuilder } from '../core/geom.js';
import { lin } from '../core/util.js';
import { TEX } from '../world/textures.js';

const GLASS = lin('#151c23');
const DARKTRIM = lin('#1a1e23');
const TYRE = lin('#121316');
const RED = lin('#c8332a');

// [z, halfWidth, yBottom, yTop]
const PROFILES = {
  sedan: {
    l: 4.54, w: 1.85, wheelR: 0.33, wb: 2.72,
    body: [
      [-2.27, 0.56, 0.46, 0.66], [-2.16, 0.76, 0.34, 0.86], [-1.85, 0.88, 0.28, 0.93],
      [-1.20, 0.925, 0.26, 0.95], [-0.20, 0.925, 0.25, 0.93], [0.80, 0.905, 0.26, 0.91],
      [1.55, 0.87, 0.29, 0.86], [2.05, 0.78, 0.34, 0.76], [2.22, 0.64, 0.42, 0.64],
      [2.27, 0.54, 0.48, 0.60]
    ],
    cabin: [
      [-1.70, 0.70, 0.90, 1.14], [-1.42, 0.80, 0.90, 1.34], [-1.02, 0.845, 0.90, 1.45],
      [-0.20, 0.85, 0.90, 1.46], [0.52, 0.82, 0.90, 1.38], [0.92, 0.72, 0.90, 1.14],
      [1.06, 0.62, 0.90, 1.00]
    ]
  },
  hatch: {
    l: 3.96, w: 1.76, wheelR: 0.31, wb: 2.42,
    body: [
      [-1.98, 0.54, 0.44, 0.66], [-1.88, 0.72, 0.32, 0.86], [-1.55, 0.84, 0.27, 0.94],
      [-1.00, 0.875, 0.25, 0.96], [-0.10, 0.878, 0.25, 0.95], [0.80, 0.86, 0.26, 0.93],
      [1.40, 0.81, 0.29, 0.87], [1.82, 0.70, 0.35, 0.75], [1.94, 0.56, 0.43, 0.62],
      [1.98, 0.50, 0.48, 0.58]
    ],
    cabin: [
      [-1.76, 0.72, 0.92, 1.30], [-1.52, 0.79, 0.92, 1.44], [-1.10, 0.815, 0.92, 1.53],
      [-0.30, 0.82, 0.92, 1.54], [0.45, 0.79, 0.92, 1.42], [0.86, 0.70, 0.92, 1.14],
      [1.00, 0.60, 0.92, 1.00]
    ]
  },
  wagon: {
    l: 4.76, w: 1.86, wheelR: 0.33, wb: 2.88,
    body: [
      [-2.38, 0.56, 0.46, 0.68], [-2.28, 0.76, 0.34, 0.88], [-1.95, 0.88, 0.28, 0.95],
      [-1.30, 0.925, 0.26, 0.96], [-0.20, 0.925, 0.25, 0.94], [0.85, 0.905, 0.26, 0.92],
      [1.62, 0.87, 0.29, 0.87], [2.14, 0.78, 0.34, 0.77], [2.32, 0.64, 0.42, 0.65],
      [2.38, 0.54, 0.48, 0.61]
    ],
    cabin: [
      [-2.26, 0.74, 0.92, 1.44], [-2.02, 0.80, 0.92, 1.50], [-1.40, 0.845, 0.92, 1.52],
      [-0.30, 0.85, 0.92, 1.52], [0.55, 0.82, 0.92, 1.42], [0.98, 0.72, 0.92, 1.16],
      [1.12, 0.62, 0.92, 1.00]
    ]
  },
  sport: {
    l: 4.34, w: 1.92, wheelR: 0.34, wb: 2.58,
    body: [
      [-2.17, 0.58, 0.38, 0.56], [-2.06, 0.80, 0.28, 0.72], [-1.75, 0.92, 0.23, 0.80],
      [-1.10, 0.96, 0.21, 0.83], [-0.10, 0.965, 0.20, 0.82], [0.85, 0.945, 0.21, 0.80],
      [1.55, 0.90, 0.24, 0.75], [2.00, 0.78, 0.28, 0.64], [2.12, 0.62, 0.32, 0.54],
      [2.17, 0.52, 0.38, 0.48]
    ],
    cabin: [
      [-1.52, 0.68, 0.80, 1.02], [-1.24, 0.77, 0.80, 1.18], [-0.80, 0.80, 0.80, 1.26],
      [-0.10, 0.80, 0.80, 1.27], [0.48, 0.76, 0.80, 1.16], [0.82, 0.66, 0.80, 0.98],
      [0.94, 0.56, 0.80, 0.88]
    ]
  },
  van: {
    l: 5.16, w: 2.0, wheelR: 0.36, wb: 3.2,
    body: [
      [-2.58, 0.72, 0.44, 0.98], [-2.50, 0.92, 0.34, 1.72], [-2.30, 0.97, 0.30, 1.88],
      [-1.20, 0.99, 0.28, 1.94], [0.60, 0.99, 0.28, 1.94], [1.60, 0.97, 0.29, 1.86],
      [2.10, 0.92, 0.31, 1.60], [2.44, 0.84, 0.34, 1.16], [2.54, 0.74, 0.40, 0.86]
    ],
    cabin: [
      [1.10, 0.93, 1.00, 1.90], [1.62, 0.91, 1.00, 1.84], [2.06, 0.86, 1.00, 1.52],
      [2.36, 0.78, 1.00, 1.10]
    ]
  },
  truck: {
    l: 7.4, w: 2.42, wheelR: 0.46, wb: 4.6,
    body: [
      [-3.70, 0.92, 0.54, 1.20], [-3.55, 1.14, 0.42, 2.60], [-3.20, 1.19, 0.36, 2.78],
      [-1.20, 1.21, 0.34, 2.82], [1.10, 1.21, 0.34, 2.82], [2.20, 1.19, 0.36, 2.66],
      [2.95, 1.13, 0.40, 2.00], [3.45, 1.00, 0.46, 1.26], [3.66, 0.88, 0.52, 0.98]
    ],
    cabin: [
      [2.00, 1.15, 1.30, 2.56], [2.60, 1.12, 1.30, 2.34], [3.10, 1.04, 1.30, 1.80],
      [3.40, 0.96, 1.30, 1.36]
    ]
  },
  classic: {
    l: 4.66, w: 1.80, wheelR: 0.32, wb: 2.84,
    body: [
      [-2.33, 0.54, 0.50, 0.74], [-2.24, 0.74, 0.38, 0.90], [-1.95, 0.86, 0.33, 0.95],
      [-1.30, 0.895, 0.31, 0.96], [-0.20, 0.90, 0.30, 0.95], [0.90, 0.88, 0.32, 0.94],
      [1.65, 0.83, 0.35, 0.90], [2.10, 0.74, 0.40, 0.82], [2.28, 0.62, 0.46, 0.70],
      [2.33, 0.52, 0.52, 0.64]
    ],
    cabin: [
      [-1.78, 0.68, 0.92, 1.26], [-1.50, 0.78, 0.92, 1.44], [-1.05, 0.805, 0.92, 1.55],
      [-0.20, 0.81, 0.92, 1.56], [0.50, 0.78, 0.92, 1.44], [0.90, 0.68, 0.92, 1.18],
      [1.02, 0.58, 0.92, 1.02]
    ]
  }
};

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

const RING = 10;
function ringPoints(hw, yb, yt) {
  const r = Math.min(hw * 0.42, (yt - yb) * 0.42, 0.26);
  const h = yt - yb;
  const inner = hw - r;
  return [
    [hw, yb + r],
    [hw, yb + h * 0.45],
    [hw, yt - r],
    [inner, yt],
    [inner * 0.4, yt],
    [-inner * 0.4, yt],
    [-inner, yt],
    [-hw, yt - r],
    [-hw, yb + h * 0.45],
    [-hw, yb + r]
  ];
}

function pushHull(parts, pos, col, idx, smooth) {
  for (const part of parts) {
    const sections = resample(part.sections, smooth);
    const base = pos.length / 3;
    const color = part.color;
    for (const s of sections) {
      const pts = ringPoints(s[1], s[2], s[3]);
      for (const p of pts) {
        pos.push(p[0], p[1], s[0]);
        col.push(color[0], color[1], color[2]);
      }
    }
    const rings = sections.length;
    for (let i = 0; i < rings - 1; i++) {
      for (let k = 0; k < RING; k++) {
        const kn = (k + 1) % RING;
        const a = base + i * RING + k;
        const b = base + i * RING + kn;
        const c = base + (i + 1) * RING + kn;
        const d = base + (i + 1) * RING + k;
        idx.push(a, b, c, a, c, d);
      }
    }
    const first = base;
    const last = base + (rings - 1) * RING;
    for (let k = 1; k < RING - 1; k++) {
      idx.push(first, first + k + 1, first + k);
      idx.push(last, last + k, last + k + 1);
    }
  }
}

function buildHullGeometry(parts, smooth = 18) {
  const pos = [];
  const col = [];
  const idx = [];
  pushHull(parts, pos, col, idx, smooth);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export const WHEEL_MAT = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.92, metalness: 0.04 });
let cachedWheel = null;
function getWheelGeo(r) {
  if (!cachedWheel || cachedWheel.r !== r) {
    const g = new THREE.CylinderGeometry(r, r, r * 0.6, 16, 1);
    g.rotateZ(Math.PI / 2);
    cachedWheel = g;
    cachedWheel.r = r;
  }
  return cachedWheel;
}

export function makeCarModel(typeId, type, colorHex, opts = {}) {
  const profile = PROFILES[type.body] || PROFILES.sedan;
  const paint = lin(colorHex || type.color);
  const accent = lin(type.accent || '#1d2229');

  const group = new THREE.Group();
  const bodyPivot = new THREE.Group();
  group.add(bodyPivot);

  const hull = buildHullGeometry([
    { sections: profile.body, color: paint },
    { sections: profile.cabin, color: GLASS }
  ]);

  const hullMesh = new THREE.Mesh(
    hull,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      color: 0xffffff,
      roughness: 0.34,
      metalness: 0.16
    })
  );
  hullMesh.matrixAutoUpdate = false;
  hullMesh.updateMatrix();
  bodyPivot.add(hullMesh);

  const l = profile.l;
  const w = profile.w;
  const detail = new GeomBuilder();
  detail.box(0, 0.3, 0, w + 0.015, 0.13, l * 0.84, DARKTRIM);
  detail.box(0, 0.52, l * 0.5 - 0.05, w * 0.92, 0.28, 0.22, DARKTRIM);
  detail.box(0, 0.52, -l * 0.5 + 0.05, w * 0.92, 0.28, 0.22, DARKTRIM);
  for (const sx of [1, -1]) {
    detail.box(sx * (w * 0.5 + 0.03), 1.0, 0.62, 0.14, 0.09, 0.2, DARKTRIM);
    detail.box(sx * w * 0.31, 0.78, l * 0.5 - 0.02, 0.42, 0.14, 0.1, [0.95, 0.94, 0.86]);
    detail.box(sx * w * 0.33, 0.72, -l * 0.5 + 0.01, 0.36, 0.16, 0.08, RED);
  }
  detail.box(0, 0.66, l * 0.5 + 0.015, 0.52, 0.13, 0.03, [0.86, 0.84, 0.62]);
  detail.box(0, 0.66, -l * 0.5 - 0.015, 0.52, 0.13, 0.03, [0.86, 0.84, 0.62]);
  detail.box(0, 0.74, l * 0.5 - 0.01, w * 0.42, 0.13, 0.07, DARKTRIM);

  const cabinTop = profile.cabin[3] ? profile.cabin[3][3] : 1.46;
  if (typeId === 'taxi') {
    detail.box(0, cabinTop + 0.06, -0.12, 0.58, 0.05, 0.26, DARKTRIM);
    detail.box(0, cabinTop + 0.17, -0.12, 0.62, 0.19, 0.3, lin('#ffcf2e'));
    detail.box(0, 0.72, 0, w + 0.008, 0.1, l * 0.86, accent);
  } else if (typeId === 'police') {
    detail.box(0, cabinTop + 0.12, -0.1, 1.14, 0.18, 0.32, [0.95, 0.95, 0.95]);
    detail.box(0, 0.76, 0, w + 0.008, 0.22, l * 0.55, accent);
    detail.box(0, 0.94, l * 0.18, w + 0.008, 0.1, l * 0.2, accent);
  } else if (typeId === 'ambulance') {
    detail.box(0, 1.15, 0, w + 0.01, 0.22, l * 0.68, accent);
    detail.box(0, 1.98, -0.3, 0.6, 0.18, 0.3, [1, 0.35, 0.3]);
  } else if (typeId === 'fire') {
    for (let i = 0; i < 4; i++) {
      detail.box(-0.5 + i * 0.34, 2.92, -0.4, 0.1, 0.1, 3.4, [0.72, 0.74, 0.76]);
    }
    detail.box(0, 1.45, 0, w + 0.01, 0.3, l * 0.5, accent);
  } else if (typeId === 'sport') {
    detail.box(0, 0.86, -l * 0.5 + 0.42, w * 0.62, 0.06, 0.3, DARKTRIM);
  }

  const detailMesh = new THREE.Mesh(
    detail.build(),
    new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.55, metalness: 0.15 })
  );
  detailMesh.matrixAutoUpdate = false;
  detailMesh.updateMatrix();
  bodyPivot.add(detailMesh);

  const wheels = [];
  const wg = getWheelGeo(profile.wheelR);
  const halfTrack = profile.w * 0.5 - 0.06;
  const axleF = profile.wb * 0.5;
  const axleR = -profile.wb * 0.5;
  if (opts.liveWheels) {
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const wm = new THREE.Mesh(wg, WHEEL_MAT);
      wm.position.set(halfTrack * sx, profile.wheelR, sz > 0 ? axleF : axleR);
      wm.userData.front = sz > 0;
      group.add(wm);
      wheels.push(wm);
    }
  } else {
    const wb2 = new GeomBuilder();
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      wb2.box(
        halfTrack * sx,
        profile.wheelR,
        sz > 0 ? axleF : axleR,
        profile.wheelR * 1.1,
        profile.wheelR * 2,
        profile.wheelR * 2,
        TYRE
      );
    }
    const wm = new THREE.Mesh(wb2.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
    wm.matrixAutoUpdate = false;
    wm.updateMatrix();
    group.add(wm);
  }

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(profile.w * 1.7, profile.l * 1.12),
    new THREE.MeshBasicMaterial({ map: TEX.blob(), transparent: true, opacity: 0.58, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.17;
  shadow.renderOrder = 1;
  group.add(shadow);

  group.userData.radius = Math.max(profile.l, profile.w) * 0.42;
  group.userData.dims = profile;

  return { group, bodyPivot, bodyMesh: hullMesh, wheels, profile, shadow };
}

export { PROFILES };
