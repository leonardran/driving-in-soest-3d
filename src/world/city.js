// The visible city: ground, water, roads, markings, pavements, trees, lamps
// and street furniture. Everything is merged or instanced.

import * as THREE from 'three';
import { GeomBuilder, vcMaterial } from '../core/geom.js';
import { makeRng } from '../core/util.js';
import { WORLD, ZONES, wx, wz } from './data.js';
import { TEX } from './textures.js';

const PATCH_STYLE = {
  fields: { tex: 'farmland', color: 0xffffff, y: -0.05, repeat: 6 },
  dunes: { tex: 'sand', color: 0xfff6e2, y: -0.04, repeat: 5 },
  woodland: { tex: 'grass', color: 0x6f8f63, y: -0.045, repeat: 8 },
  airbase: { tex: 'farmland', color: 0xc9c4a8, y: -0.05, repeat: 8 },
  sports: { tex: 'grass', color: 0x9fd07a, y: -0.04, repeat: 10 },
  farm: { tex: 'grass', color: 0xb8cf93, y: -0.045, repeat: 8 },
  playground: { tex: 'sand', color: 0xfff0d0, y: -0.04, repeat: 5 },
  landmark: { tex: 'grass', color: 0xa8c98a, y: -0.04, repeat: 12 },
  palace: { tex: 'grass', color: 0xa6c98c, y: -0.04, repeat: 12 },
  lake: null
};

export function buildCity(network, buildingUniforms) {
  const rng = makeRng(90210);
  const group = new THREE.Group();
  group.name = 'city';

  const wide = WORLD.w * 0.5 + 2200;
  const deep = WORLD.h * 0.5 + 2200;

  // --- ground ------------------------------------------------------------
  const grassMap = TEX.grass();
  grassMap.repeat.set(wide / 9, deep / 9);
  const groundMat = new THREE.MeshStandardMaterial({
    map: grassMap,
    color: 0xffffff,
    roughness: 1,
    metalness: 0
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(wide * 2, deep * 2), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.09;
  ground.receiveShadow = false;
  ground.matrixAutoUpdate = false;
  ground.updateMatrix();
  group.add(ground);

  // --- land-use patches --------------------------------------------------
  const patchMats = new Map();
  const getPatchMat = (style) => {
    const key = style.tex + style.color;
    let mat = patchMats.get(key);
    if (!mat) {
      const map = TEX[style.tex]();
      const m = map.clone();
      m.needsUpdate = true;
      m.wrapS = m.wrapT = THREE.RepeatWrapping;
      m.repeat.set(1, 1);
      mat = new THREE.MeshStandardMaterial({ map: m, color: style.color, roughness: 1, metalness: 0 });
      patchMats.set(key, mat);
    }
    return mat;
  };

  const lakeBuilder = new GeomBuilder();
  for (const zone of ZONES) {
    if (zone.kind !== 'lake') continue;
    const x0 = Math.max(wx(zone.x), -wide);
    const x1 = Math.min(wx(zone.x + zone.w), wide);
    const z0 = Math.max(wz(zone.y), -deep);
    const z1 = Math.min(wz(zone.y + zone.h), deep);
    if (x1 - x0 < 4 || z1 - z0 < 4) continue;
    lakeBuilder.quad(
      [x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0],
      [1, 1, 1],
      [[0, 0], [0, 1], [1, 1], [1, 0]]
    );
  }

  // Each patch style needs its own material, so build one mesh per style.
  for (const kind of Object.keys(PATCH_STYLE)) {
    const style = PATCH_STYLE[kind];
    if (!style) continue;
    const b = new GeomBuilder();
    for (const zone of ZONES) {
      if (zone.kind !== kind) continue;
      const x0 = Math.max(wx(zone.x), -wide);
      const x1 = Math.min(wx(zone.x + zone.w), wide);
      const z0 = Math.max(wz(zone.y), -deep);
      const z1 = Math.min(wz(zone.y + zone.h), deep);
      if (x1 - x0 < 4 || z1 - z0 < 4) continue;
      b.quad(
        [x0, style.y, z0], [x0, style.y, z1], [x1, style.y, z1], [x1, style.y, z0],
        [1, 1, 1],
        [[x0 / 14, z0 / 14], [x0 / 14, z1 / 14], [x1 / 14, z1 / 14], [x1 / 14, z0 / 14]]
      );
    }
    if (!b.vertexCount) continue;
    const mesh = new THREE.Mesh(b.build(), getPatchMat(style));
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.renderOrder = -1;
    group.add(mesh);
  }

  // --- water -------------------------------------------------------------
  if (lakeBuilder.vertexCount) {
    const waterGeo = lakeBuilder.build();
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2c4c58,
      roughness: 0.08,
      metalness: 0.72,
      transparent: true,
      opacity: 0.94
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = -0.22;
    water.matrixAutoUpdate = false;
    water.updateMatrix();
    group.add(water);
  }

  // --- roads -------------------------------------------------------------
  const asphaltMap = TEX.asphalt();
  const roadMat = new THREE.MeshStandardMaterial({
    map: asphaltMap,
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0.02
  });

  const road = new GeomBuilder();
  const pavement = new GeomBuilder();
  const paint = new GeomBuilder();
  const bike = new GeomBuilder();

  const yFor = (i) => 0.02 + (i % 40) * 0.0006;

  network.lines.forEach((line, i) => {
    const y = yFor(i);
    const hw = line.width * 0.5;
    const v = line.axis === 'v';
    const x0 = v ? line.fixed - hw : line.a;
    const x1 = v ? line.fixed + hw : line.b;
    const z0 = v ? line.a : line.fixed - hw;
    const z1 = v ? line.b : line.fixed + hw;
    road.quad(
      [x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0],
      [1, 1, 1],
      [
        [v ? 0 : 0, z0 / 7],
        [v ? 0 : 0, z1 / 7],
        [v ? 1 : 1, z1 / 7],
        [v ? 1 : 1, z0 / 7]
      ]
    );
  });

  // pavements: per edge so they stop cleanly at crossings
  const SW = 2.4;
  for (const edge of network.edges) {
    if (edge.width > 15) continue;
    const na = network.nodes[edge.a];
    const nb = network.nodes[edge.b];
    const insetA = na.cross * 0.5 + 1.2;
    const insetB = nb.cross * 0.5 + 1.2;
    const usable = edge.len - insetA - insetB;
    if (usable < 2) continue;
    const ax = edge.ax + edge.dx * insetA;
    const az = edge.az + edge.dz * insetA;
    const bx = edge.ax + edge.dx * (edge.len - insetB);
    const bz = edge.az + edge.dz * (edge.len - insetB);
    const nx = edge.dz;
    const nz = -edge.dx;
    const off = edge.width * 0.5;
    const y = 0.14;
    for (const side of [1, -1]) {
      const o0 = off * side;
      const o1 = (off + SW) * side;
      const p0 = [ax + nx * o0, y, az + nz * o0];
      const p1 = [ax + nx * o1, y, az + nz * o1];
      const p2 = [bx + nx * o1, y, bz + nz * o1];
      const p3 = [bx + nx * o0, y, bz + nz * o0];
      const len = Math.max(1, usable);
      pavement.quad(p0, p3, p2, p1, [1, 1, 1], [[0, 0], [0, len / 3], [SW / 3, len / 3], [SW / 3, 0]]);
    }
  }

  // road paint
  for (const edge of network.edges) {
    if (edge.width < 5) continue;
    const motorway = edge.width > 15;
    const na = network.nodes[edge.a];
    const nb = network.nodes[edge.b];
    const insetA = na.cross * 0.5 + 1.5;
    const insetB = nb.cross * 0.5 + 1.5;
    const usable = edge.len - insetA - insetB;
    if (usable < 3) continue;
    const y = 0.021 + 0.008;
    const nx = edge.dz;
    const nz = -edge.dx;

    // centre line
    const dashLen = motorway ? 5 : 3;
    const gap = motorway ? 7 : 6;
    const wHalf = 0.09;
    const count = Math.floor(usable / (dashLen + gap));
    for (let k = 0; k < count; k++) {
      const t0 = insetA + k * (dashLen + gap);
      const t1 = t0 + dashLen;
      const cx0 = edge.ax + edge.dx * t0;
      const cz0 = edge.az + edge.dz * t0;
      const cx1 = edge.ax + edge.dx * t1;
      const cz1 = edge.az + edge.dz * t1;
      paint.quad(
        [cx0 + nx * wHalf, y, cz0 + nz * wHalf],
        [cx0 - nx * wHalf, y, cz0 - nz * wHalf],
        [cx1 - nx * wHalf, y, cz1 - nz * wHalf],
        [cx1 + nx * wHalf, y, cz1 + nz * wHalf],
        [1, 1, 1]
      );
    }

    // edge lines on the wider roads
    if (edge.width >= 9) {
      const eo = edge.width * 0.5 - 0.42;
      const ew = 0.07;
      const t0 = insetA;
      const t1 = edge.len - insetB;
      const ax2 = edge.ax + edge.dx * t0;
      const az2 = edge.az + edge.dz * t0;
      const bx2 = edge.ax + edge.dx * t1;
      const bz2 = edge.az + edge.dz * t1;
      for (const side of [1, -1]) {
        const o = eo * side;
        paint.quad(
          [ax2 + nx * (o - ew), y, az2 + nz * (o - ew)],
          [ax2 + nx * (o + ew), y, az2 + nz * (o + ew)],
          [bx2 + nx * (o + ew), y, bz2 + nz * (o + ew)],
          [bx2 + nx * (o - ew), y, bz2 + nz * (o - ew)],
          [1, 1, 1]
        );
      }
    }

    // cycle lanes on the main streets
    if (edge.width >= 11 && !motorway) {
      const o = edge.width * 0.5 - 1.55;
      const t0 = insetA;
      const t1 = edge.len - insetB;
      const ax2 = edge.ax + edge.dx * t0;
      const az2 = edge.az + edge.dz * t0;
      const bx2 = edge.ax + edge.dx * t1;
      const bz2 = edge.az + edge.dz * t1;
      for (const side of [1, -1]) {
        const hi = Math.max(o * side, (o - 1.5) * side);
        const lo = Math.min(o * side, (o - 1.5) * side);
        const y2 = 0.026;
        bike.quad(
          [ax2 + nx * hi, y2, az2 + nz * hi],
          [ax2 + nx * lo, y2, az2 + nz * lo],
          [bx2 + nx * lo, y2, bz2 + nz * lo],
          [bx2 + nx * hi, y2, bz2 + nz * hi],
          [1, 1, 1]
        );
      }
    }
  }

  const roadMesh = new THREE.Mesh(road.build(), roadMat);
  roadMesh.matrixAutoUpdate = false;
  roadMesh.updateMatrix();
  group.add(roadMesh);

  const pavementMap = TEX.sidewalk();
  pavementMap.repeat.set(1, 1);
  const pavementMesh = new THREE.Mesh(
    pavement.build(),
    new THREE.MeshStandardMaterial({ map: pavementMap, roughness: 0.95, metalness: 0 })
  );
  pavementMesh.matrixAutoUpdate = false;
  pavementMesh.updateMatrix();
  group.add(pavementMesh);

  const paintMat = new THREE.MeshStandardMaterial({
    color: 0xe9e6dc,
    roughness: 0.7,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  const paintMesh = new THREE.Mesh(paint.build(), paintMat);
  paintMesh.matrixAutoUpdate = false;
  paintMesh.updateMatrix();
  group.add(paintMesh);

  if (bike.vertexCount) {
    const bikeMesh = new THREE.Mesh(
      bike.build(),
      new THREE.MeshStandardMaterial({
        color: 0x8c4a3c,
        roughness: 0.9,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      })
    );
    bikeMesh.matrixAutoUpdate = false;
    bikeMesh.updateMatrix();
    group.add(bikeMesh);
  }

  // --- trees -------------------------------------------------------------
  const trees = placeTrees(network, rng);
  const treeGroup = buildTreeMeshes(trees);
  group.add(treeGroup);

  // --- street lamps ------------------------------------------------------
  const lamps = placeLamps(network, rng);
  const lampGroup = buildLampMeshes(lamps);
  group.add(lampGroup);

  // --- small street furniture -------------------------------------------
  const bollards = placeBollards(network, rng);
  if (bollards.length) group.add(buildBollards(bollards));

  return {
    group,
    lamps,
    treeCount: trees.length,
    lampCount: lamps.length,
    setNight(night) {
      lampGroup.userData.glowMat.opacity = 0.85 * night;
      lampGroup.userData.glow.visible = night > 0.02;
      lampGroup.userData.headMat.emissiveIntensity = 0.2 + night * 2.4;
      void buildingUniforms;
    }
  };
}

// -------------------------------------------------------------------------

function placeTrees(network, rng) {
  const out = [];
  const push = (x, z, s) => {
    if (Math.abs(x) > WORLD.halfW + 200 || Math.abs(z) > WORLD.halfH + 200) return;
    const near = network.nearestEdge(x, z);
    if (near.edge && near.dist < near.edge.width * 0.5 + 2.2) return;
    out.push({ x, z, s, r: rng() * Math.PI * 2, tint: rng() });
  };

  // woods and green zones
  for (const zone of ZONES) {
    let density = 0;
    if (zone.kind === 'woodland') density = 0.012;
    else if (zone.kind === 'dunes') density = 0.0018;
    else if (zone.kind === 'fields' || zone.kind === 'farm') density = 0.0009;
    else if (zone.kind === 'sports' || zone.kind === 'landmark' || zone.kind === 'palace') density = 0.0022;
    else if (zone.kind === 'airbase') density = 0.0004;
    if (!density) continue;
    const x0 = wx(zone.x);
    const x1 = wx(zone.x + zone.w);
    const z0 = wz(zone.y);
    const z1 = wz(zone.y + zone.h);
    const area = Math.abs((x1 - x0) * (z1 - z0));
    const n = Math.min(1400, Math.floor(area * density));
    for (let i = 0; i < n; i++) {
      push(x0 + rng() * (x1 - x0), z0 + rng() * (z1 - z0), rng.range(0.75, 1.5));
      if (out.length > 5200) break;
    }
  }

  // street trees
  for (const edge of network.edges) {
    if (edge.width > 15) continue;
    const na = network.nodes[edge.a];
    const nb = network.nodes[edge.b];
    const usable = edge.len - na.cross * 0.5 - nb.cross * 0.5 - 8;
    if (usable < 12) continue;
    const step = 17;
    const count = Math.floor(usable / step);
    for (let i = 0; i < count; i++) {
      if (rng() > 0.34) continue;
      const t = na.cross * 0.5 + 4 + i * step + rng.range(-2, 2);
      const side = rng() < 0.5 ? 1 : -1;
      const off = edge.width * 0.5 + 3.4 + rng.range(0, 1.4);
      const x = edge.ax + edge.dx * t + edge.dz * off * side;
      const z = edge.az + edge.dz * t - edge.dx * off * side;
      out.push({ x, z, s: rng.range(0.8, 1.25), r: rng() * 6.28, tint: rng() });
    }
    if (out.length > 6000) break;
  }

  return out.slice(0, 6200);
}

function buildTreeMeshes(trees) {
  const g = new THREE.Group();
  const n = trees.length;
  const trunkGeom = new THREE.CylinderGeometry(0.16, 0.26, 1, 5, 1);
  trunkGeom.translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeom, trunkMat, n);
  trunks.frustumCulled = false;

  const crownGeom = new THREE.IcosahedronGeometry(1, 0);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
  const crowns = new THREE.InstancedMesh(crownGeom, crownMat, Math.max(1, n));
  crowns.frustumCulled = false;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < n; i++) {
    const t = trees[i];
    const height = 5.2 * t.s;
    q.setFromAxisAngle(up, t.r);
    p.set(t.x, 0, t.z);
    s.set(t.s, height * 0.55, t.s);
    m.compose(p, q, s);
    trunks.setMatrixAt(i, m);

    const crownR = (2.0 + t.s * 1.15) * (0.85 + t.tint * 0.5);
    p.set(t.x, height * 0.62 + crownR * 0.35, t.z);
    s.set(crownR, crownR * (0.95 + t.tint * 0.35), crownR);
    m.compose(p, q, s);
    crowns.setMatrixAt(i, m);
    c.setHSL(0.26 - t.tint * 0.05, 0.32 + t.tint * 0.2, 0.2 + t.tint * 0.11);
    crowns.setColorAt(i, c);
  }
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  g.add(trunks, crowns);
  return g;
}

function placeLamps(network, rng) {
  const out = [];
  for (const edge of network.edges) {
    if (edge.width > 15) continue;
    const step = 34;
    const count = Math.floor(edge.len / step);
    for (let i = 0; i < count; i++) {
      const t = i * step + step * 0.5;
      const side = i % 2 === 0 ? 1 : -1;
      const off = edge.width * 0.5 + 1.1;
      out.push({
        x: edge.ax + edge.dx * t + edge.dz * off * side,
        z: edge.az + edge.dz * t - edge.dx * off * side
      });
      if (out.length > 2400) return out;
    }
    void rng;
  }
  return out;
}

function buildLampMeshes(lamps) {
  const g = new THREE.Group();
  const n = Math.max(1, lamps.length);

  const poleGeom = new THREE.CylinderGeometry(0.09, 0.13, 7, 5, 1);
  poleGeom.translate(0, 3.5, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x30363c, roughness: 0.7, metalness: 0.5 });
  const poles = new THREE.InstancedMesh(poleGeom, poleMat, n);
  poles.frustumCulled = false;

  const armGeom = new THREE.BoxGeometry(1.5, 0.12, 0.12);
  armGeom.translate(0.75, 7, 0);
  const arms = new THREE.InstancedMesh(armGeom, poleMat, n);
  arms.frustumCulled = false;

  const headGeom = new THREE.BoxGeometry(0.6, 0.16, 0.34);
  headGeom.translate(1.4, 6.9, 0);
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x3b4249,
    emissive: new THREE.Color(0xffdca8),
    emissiveIntensity: 0.2,
    roughness: 0.5
  });
  const heads = new THREE.InstancedMesh(headGeom, headMat, n);
  heads.frustumCulled = false;

  const glowGeom = new THREE.PlaneGeometry(15, 15);
  glowGeom.rotateX(-Math.PI / 2);
  const glowMat = new THREE.MeshBasicMaterial({
    map: TEX.glow(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true
  });
  const glow = new THREE.InstancedMesh(glowGeom, glowMat, n);
  glow.frustumCulled = false;
  glow.visible = false;
  glow.renderOrder = 2;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < lamps.length; i++) {
    const l = lamps[i];
    q.setFromAxisAngle(up, l.rot || 0);
    p.set(l.x, 0, l.z);
    m.compose(p, q, s);
    poles.setMatrixAt(i, m);
    arms.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
    p.set(l.x + 2.2, 0.06, l.z);
    m.compose(p, q, s);
    glow.setMatrixAt(i, m);
  }
  poles.instanceMatrix.needsUpdate = true;
  arms.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  glow.instanceMatrix.needsUpdate = true;

  g.add(poles, arms, heads, glow);
  g.userData.glow = glow;
  g.userData.glowMat = glowMat;
  g.userData.headMat = headMat;
  return g;
}

function placeBollards(network, rng) {
  const out = [];
  for (const edge of network.edges) {
    if (edge.width > 11 || edge.len < 30) continue;
    if (rng() > 0.22) continue;
    const count = Math.floor(edge.len / 6);
    const side = rng() < 0.5 ? 1 : -1;
    const off = edge.width * 0.5 + 0.7;
    for (let i = 0; i < count; i++) {
      const t = i * 6 + 3;
      out.push({
        x: edge.ax + edge.dx * t + edge.dz * off * side,
        z: edge.az + edge.dz * t - edge.dx * off * side
      });
      if (out.length > 1800) return out;
    }
  }
  return out;
}

function buildBollards(list) {
  const geom = new THREE.CylinderGeometry(0.11, 0.13, 0.85, 6, 1);
  geom.translate(0, 0.42, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x8d2f2c, roughness: 0.8 });
  const mesh = new THREE.InstancedMesh(geom, mat, list.length);
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < list.length; i++) {
    p.set(list[i].x, 0.14, list[i].z);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

export { vcMaterial };
