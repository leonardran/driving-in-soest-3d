// Street-level detail: driveways, garden fences, bins, bikes, bus stops,
// benches, road signs, crossings, letterboxes and garden sheds. All
// instanced, so the whole lot costs a dozen draw calls.

import * as THREE from 'three';
import { GeomBuilder } from '../core/geom.js';
import { makeRng, lin } from '../core/util.js';
import { TEX, signTexture } from './textures.js';

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const P = new THREE.Vector3();
const S = new THREE.Vector3();
const C = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function instanced(geom, mat, count) {
  const m = new THREE.InstancedMesh(geom, mat, Math.max(1, count));
  m.frustumCulled = false;
  return m;
}

function place(mesh, i, x, y, z, rot, sx = 1, sy = 1, sz = 1) {
  Q.setFromAxisAngle(UP, rot);
  P.set(x, y, z);
  S.set(sx, sy, sz);
  M.compose(P, Q, S);
  mesh.setMatrixAt(i, M);
}

function boxGeom(sx, sy, sz, y = 0) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.translate(0, y + sy * 0.5, 0);
  return g;
}

export function buildProps(network, buildings, collision) {
  const rng = makeRng(777);
  const group = new THREE.Group();
  group.name = 'props';

  const driveways = [];
  const fences = [];
  const bins = [];
  const bikes = [];
  const benches = [];
  const stops = [];
  const signs = [];
  const posts = [];
  const sheds = [];
  const crossings = [];
  const kerbs = [];

  // --- per-building frontage detail -----------------------------------
  for (const b of buildings.boxes) {
    const fx = Math.sin(b.rotY);
    const fz = Math.cos(b.rotY);
    const frontX = b.x + fx * (b.d * 0.5);
    const frontZ = b.z + fz * (b.d * 0.5);
    const r = rng();
    if (r < 0.55) {
      driveways.push({ x: frontX, z: frontZ, rot: b.rotY, len: rng.range(5, 11), w: rng.range(3.2, 5) });
      if (rng.chance(0.5)) {
        sheds.push({
          x: b.x + Math.cos(b.rotY) * (b.w * 0.5 + 1.6) * (rng() < 0.5 ? 1 : -1),
          z: b.z - Math.sin(b.rotY) * (b.w * 0.5 + 1.6),
          rot: b.rotY,
          w: rng.range(2.4, 3.6),
          d: rng.range(2.2, 3.2),
          h: rng.range(2.1, 2.6)
        });
      }
    }
    if (rng() < 0.6) {
      fences.push({ x: frontX, z: frontZ, rot: b.rotY, len: b.w * rng.range(0.7, 0.95), low: rng.chance(0.55) });
    }
    if (rng() < 0.75) {
      bins.push({ x: frontX + Math.cos(b.rotY) * (b.w * 0.5 + 1.1), z: frontZ - Math.sin(b.rotY) * (b.w * 0.5 + 1.1), rot: b.rotY });
    }
    if (rng() < 0.45) {
      bikes.push({ x: frontX + Math.cos(b.rotY) * (b.w * 0.32 + 1.3), z: frontZ - Math.sin(b.rotY) * (b.w * 0.32 + 1.3), rot: b.rotY + rng.range(-0.4, 0.4) });
    }
  }

  // --- street furniture along the roads ------------------------------
  for (const edge of network.edges) {
    if (edge.width > 15) continue;
    const nx = edge.dz;
    const nz = -edge.dx;
    const usable = edge.len - 14;
    if (usable < 10) continue;

    const side = rng() < 0.5 ? 1 : -1;
    const off = edge.width * 0.5 + 1.35;

    // benches every so often along the pavement
    const benchCount = Math.floor(usable / 90);
    for (let i = 0; i < benchCount; i++) {
      if (!rng.chance(0.55)) continue;
      const t = 14 + i * 90 + rng.range(-14, 14);
      if (t > usable - 6) break;
      benches.push({
        x: edge.ax + edge.dx * t + nx * off * side,
        z: edge.az + edge.dz * t + nz * off * side,
        rot: Math.atan2(edge.dx, edge.dz)
      });
    }

    // a bus stop on the wider streets, one or two per street
    if (edge.width >= 8 && rng() < 0.16) {
      const t = rng.range(14, usable - 14);
      stops.push({
        x: edge.ax + edge.dx * t + nx * off * side,
        z: edge.az + edge.dz * t + nz * off * side,
        rot: Math.atan2(edge.dx, edge.dz) + (side > 0 ? 0 : Math.PI)
      });
    }

    // traffic signs, denser than before
    const signCount = Math.max(1, Math.floor(usable / 44));
    for (let i = 0; i < signCount; i++) {
      if (!rng.chance(0.7)) continue;
      const t = 8 + i * 44 + rng.range(-10, 10);
      if (t > usable - 4) break;
      signs.push({
        x: edge.ax + edge.dx * t + nx * (edge.width * 0.5 + 0.9) * (i % 2 ? 1 : -1),
        z: edge.az + edge.dz * t + nz * (edge.width * 0.5 + 0.9) * (i % 2 ? 1 : -1),
        rot: Math.atan2(edge.dx, edge.dz) + Math.PI / 2
      });
    }

    // kerb stones
    if (edge.width >= 6) {
      const step = 2.6;
      const count = Math.floor(usable / step);
      for (let i = 0; i < count; i++) {
        if (rng() > 0.6) continue;
        const t = 8 + i * step;
        kerbs.push({
          x: edge.ax + edge.dx * t + nx * (edge.width * 0.5 + 0.16) * side,
          z: edge.az + edge.dz * t + nz * (edge.width * 0.5 + 0.16) * side,
          rot: Math.atan2(edge.dx, edge.dz)
        });
        if (kerbs.length > 5200) break;
      }
    }
  }

  // --- crossings ------------------------------------------------------
  for (const node of network.nodes) {
    if (node.edges.length < 3) continue;
    if (node.cross < 8) continue;
    if (!rng.chance(0.5)) continue;
    crossings.push({ x: node.x, z: node.z, w: node.cross });
  }

  // --- build the meshes ----------------------------------------------

  const concrete = new THREE.MeshStandardMaterial({ color: 0x8d8a82, roughness: 0.95 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.6, metalness: 0.4 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xd9d6cc, roughness: 0.55, metalness: 0.2 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0x8e3b30, roughness: 0.55, metalness: 0.2 });

  // driveways
  if (driveways.length) {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    const mesh = instanced(g, new THREE.MeshStandardMaterial({ color: 0x6f6b63, roughness: 1 }), driveways.length);
    driveways.forEach((d, i) => {
      Q.setFromAxisAngle(UP, d.rot);
      P.set(d.x, 0.1, d.z);
      S.set(d.w, 1, d.len);
      M.compose(P, Q, S);
      mesh.setMatrixAt(i, M);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  // fences
  if (fences.length) {
    const g = boxGeom(1, 1, 0.12);
    const mesh = instanced(g, woodMat, fences.length);
    fences.forEach((f, i) => {
      place(mesh, i, f.x, 0, f.z, f.rot, f.len, f.low ? 0.75 : 1.5, 1);
      C.setHSL(0.09, 0.16, 0.32 + (i % 5) * 0.03);
      mesh.setColorAt(i, C);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }

  // wheelie bins
  if (bins.length) {
    const g = boxGeom(0.62, 1.05, 0.55);
    const mesh = instanced(g, woodMat, bins.length);
    bins.forEach((b, i) => {
      place(mesh, i, b.x, 0.14, b.z, b.rot + (i % 3) * 0.3);
      C.set(i % 4 === 0 ? 0x4a6b4a : i % 4 === 1 ? 0x4a5a6b : 0x5b5b58);
      mesh.setColorAt(i, C);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }

  // bikes leaning by the front door
  if (bikes.length) {
    const bg = new GeomBuilder();
    bg.cylinder(0, 0.34, 0.42, 0.32, 0.06, 8, lin('#1c2026'));
    bg.cylinder(0, 0.34, -0.42, 0.32, 0.06, 8, lin('#1c2026'));
    bg.box(0, 0.5, 0, 0.06, 0.06, 0.9, lin('#2c4a6b'));
    bg.box(0, 0.62, 0.4, 0.44, 0.05, 0.05, lin('#22282f'));
    bg.box(0, 0.66, 0, 0.14, 0.26, 0.16, lin('#1b2027'));
    const mesh = instanced(bg.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), bikes.length);
    bikes.forEach((b, i) => place(mesh, i, b.x, 0.1, b.z, b.rot, 1, 1, 1));
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  // benches
  if (benches.length) {
    const bg = new GeomBuilder();
    bg.box(0, 0.45, 0, 1.8, 0.08, 0.46, lin('#6b4f33'));
    bg.box(0, 0.72, -0.2, 1.8, 0.3, 0.06, lin('#6b4f33'));
    bg.box(-0.75, 0.22, 0, 0.09, 0.44, 0.42, lin('#2f363d'));
    bg.box(0.75, 0.22, 0, 0.09, 0.44, 0.42, lin('#2f363d'));
    const mesh = instanced(bg.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), benches.length);
    benches.forEach((b, i) => place(mesh, i, b.x, 0.14, b.z, b.rot + Math.PI / 2));
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  // bus stops: shelter + sign
  if (stops.length) {
    const bg = new GeomBuilder();
    bg.box(0, 2.35, -0.7, 3.4, 0.1, 1.5, lin('#3d444c'));
    bg.box(-1.6, 1.2, 0, 0.1, 2.4, 1.4, lin('#2f363d'));
    bg.box(1.6, 1.2, 0, 0.1, 2.4, 1.4, lin('#2f363d'));
    bg.box(0, 2.0, 0.6, 3.0, 0.12, 0.12, lin('#2f363d'));
    bg.box(0, 0.55, 0.1, 2.6, 0.08, 0.4, lin('#7d848c'));
    bg.box(1.9, 1.5, 0, 0.12, 3.0, 0.12, lin('#3d444c'));
    bg.box(1.9, 2.9, 0, 0.5, 0.5, 0.1, lin('#1b64a8'));
    const mesh = instanced(bg.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 }), stops.length);
    stops.forEach((b, i) => place(mesh, i, b.x, 0.14, b.z, b.rot));
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  // traffic signs
  if (signs.length) {
    const post = instanced(boxGeom(0.07, 2.4, 0.07), metalMat, signs.length);
    const plateGeoms = [
      boxGeom(0.62, 0.62, 0.04, 1.9),
      boxGeom(0.6, 0.6, 0.04, 1.9),
      boxGeom(0.5, 0.5, 0.04, 1.9)
    ];
    const platesA = instanced(plateGeoms[0], whiteMat, signs.length);
    const platesB = instanced(plateGeoms[1], redMat, signs.length);
    const signsLen = signs.length;
    signs.forEach((s, i) => {
      place(post, i, s.x, 0.14, s.z, s.rot);
      const pick = i % 3;
      if (pick === 0) {
        place(platesA, i, s.x, 0, s.z, s.rot);
        place(platesB, i, s.x, 0, s.z, s.rot, 0.001, 0.001, 0.001);
      } else {
        place(platesB, i, s.x, 0, s.z, s.rot);
        place(platesA, i, s.x, 0, s.z, s.rot, 0.001, 0.001, 0.001);
      }
    });
    for (const m of [post, platesA, platesB]) {
      m.instanceMatrix.needsUpdate = true;
      group.add(m);
    }
    void signsLen;
  }

  // kerb stones
  if (kerbs.length) {
    const g = boxGeom(1.4, 0.16, 0.24);
    const mesh = instanced(g, concrete, kerbs.length);
    kerbs.forEach((k, i) => place(mesh, i, k.x, 0.08, k.z, k.rot + Math.PI / 2));
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  // garden sheds
  if (sheds.length) {
    const bg = new GeomBuilder();
    bg.box(0, 1.1, 0, 1, 2.2, 1, lin('#7a5f43'));
    bg.roof(0, 2.2, 0, 1.1, 0.35, 1.1, lin('#4a4038'));
    const mesh = instanced(bg.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), sheds.length);
    sheds.forEach((s, i) => {
      place(mesh, i, s.x, 0.1, s.z, s.rot, s.w, s.h / 2.2, s.d);
      if (collision) collision.addBox(s.x, s.z, s.w, s.d, s.rot);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  // zebra crossings
  if (crossings.length) {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xe6e3d8,
      roughness: 0.8,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3
    });
    const stripes = [];
    for (const c of crossings) {
      const w = c.w;
      for (let i = 0; i < 5; i++) {
        const o = -w * 0.5 + (i + 0.5) * (w / 5);
        stripes.push({ x: c.x + o, z: c.z, sx: (w / 5) * 0.55, sz: w * 0.55 });
        stripes.push({ x: c.x, z: c.z + o, sx: (w / 5) * 0.55, sz: w * 0.55, rot: Math.PI / 2 });
      }
    }
    const mesh = instanced(g, mat, stripes.length);
    stripes.forEach((s, i) => {
      Q.setFromAxisAngle(UP, s.rot || 0);
      P.set(s.x, 0.07, s.z);
      S.set(s.sx, 1, s.sz);
      M.compose(P, Q, S);
      mesh.setMatrixAt(i, M);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  void TEX;
  void signTexture;

  return {
    group,
    counts: {
      driveways: driveways.length,
      fences: fences.length,
      bins: bins.length,
      bikes: bikes.length,
      benches: benches.length,
      stops: stops.length,
      signs: signs.length,
      sheds: sheds.length,
      crossings: crossings.length
    }
  };
}
