// Pedestrians and cyclists walking the pavements, drawn with instanced meshes
// so the whole crowd costs a handful of draw calls.

import * as THREE from 'three';
import { GeomBuilder } from '../core/geom.js';
import { lin, makeRng, pick, rand } from '../core/util.js';
import { PED_SHIRTS } from '../world/data.js';

const SKIN = ['#d9a97e', '#c98d63', '#a9714a', '#e4bd97', '#8a5a3a', '#f0cba8'];
const TROUSERS = ['#2b323c', '#3d4a5a', '#4a4038', '#1f2732', '#5a5140', '#33414a'];
const HAIR = ['#3a2a1e', '#241a12', '#6b4a2a', '#a89070', '#1b1b1b', '#c9b48a'];

function pedBodyGeometry() {
  const b = new GeomBuilder();
  b.box(0, 1.16, 0, 0.44, 0.6, 0.25, [1, 1, 1]);
  b.box(0, 1.44, 0, 0.48, 0.12, 0.27, [1, 1, 1]);
  b.box(0.29, 1.14, 0, 0.13, 0.56, 0.16, [0.95, 0.95, 0.95]);
  b.box(-0.29, 1.14, 0, 0.13, 0.56, 0.16, [0.95, 0.95, 0.95]);
  b.box(0, 1.63, 0, 0.23, 0.26, 0.23, lin('#d9a97e'));
  return b.build();
}

function hairGeometry() {
  const b = new GeomBuilder();
  b.box(0, 1.74, -0.01, 0.245, 0.11, 0.245, [1, 1, 1]);
  return b.build();
}

function legGeometry() {
  const b = new GeomBuilder();
  b.box(0, -0.42, 0, 0.16, 0.84, 0.18, [1, 1, 1]);
  b.box(0, -0.86, 0.04, 0.18, 0.1, 0.26, lin('#20242a'));
  return b.build();
}

function bikeGeometry() {
  const b = new GeomBuilder();
  b.box(0, 0.46, 0, 0.07, 0.07, 1.0, lin('#2c4a6b'));
  b.box(0, 0.66, 0.44, 0.5, 0.06, 0.06, lin('#232a31'));
  b.box(0, 0.8, 0.44, 0.86, 0.86, 0.05, lin('#1b2027'));
  b.box(0, 0.36, 0, 0.13, 0.28, 0.18, lin('#1b2027'));
  b.cylinder(0, 0.34, 0.5, 0.34, 0.05, 10, lin('#14171a'));
  b.cylinder(0, 0.34, -0.5, 0.34, 0.05, 10, lin('#14171a'));
  return b.build();
}

const M = new THREE.Matrix4();
const M2 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const P = new THREE.Vector3();
const S = new THREE.Vector3();

export class Crowd {
  constructor(scene, network, count = 64) {
    this.scene = scene;
    this.network = network;
    this.rng = makeRng(4242);
    this.agents = [];
    this.routes = this.buildRoutes();

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.86 });

    this.bodies = new THREE.InstancedMesh(pedBodyGeometry(), mat, count);
    this.hair = new THREE.InstancedMesh(hairGeometry(), mat, count);
    this.legL = new THREE.InstancedMesh(legGeometry(), mat, count);
    this.legR = new THREE.InstancedMesh(legGeometry(), mat, count);
    const bikeCount = Math.max(1, Math.floor(count * 0.4));
    this.bikes = new THREE.InstancedMesh(bikeGeometry(), mat, bikeCount);
    this.maxBikes = bikeCount;

    for (const m of [this.bodies, this.hair, this.legL, this.legR, this.bikes]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(m.count * 3), 3);
      scene.add(m);
    }

    for (let i = 0; i < count; i++) this.spawn(i);
    this.bodies.count = this.agents.length;
    this.hair.count = this.agents.length;
    this.legL.count = this.agents.length;
    this.legR.count = this.agents.length;
    this.bikes.count = 0;
  }

  buildRoutes() {
    const net = this.network;
    const rng = this.rng;
    const routes = [];
    const edges = net.edges.filter((e) => e.len > 30 && e.width < 15);
    for (const e of edges) {
      for (const side of [1, -1]) {
        if (rng() > 0.45) continue;
        routes.push({
          ax: e.ax + e.dz * (e.width * 0.5 + 1.7) * side,
          az: e.az - e.dx * (e.width * 0.5 + 1.7) * side,
          bx: e.bx + e.dz * (e.width * 0.5 + 1.7) * side,
          bz: e.bz - e.dx * (e.width * 0.5 + 1.7) * side,
          bike: false
        });
      }
    }
    const mains = net.edges.filter((e) => e.len > 60 && e.width >= 9.5 && e.width < 15);
    for (const e of mains) {
      if (rng() > 0.4) continue;
      const side = rng() < 0.5 ? 1 : -1;
      routes.push({
        ax: e.ax + e.dz * (e.width * 0.5 - 1.4) * side,
        az: e.az - e.dx * (e.width * 0.5 - 1.4) * side,
        bx: e.bx + e.dz * (e.width * 0.5 - 1.4) * side,
        bz: e.bz - e.dx * (e.width * 0.5 - 1.4) * side,
        bike: true
      });
    }
    return routes;
  }

  spawn(i) {
    const route = this.routes.length ? pick(this.routes) : null;
    if (!route) return;
    const bike = !!route.bike;
    const a = {
      route,
      t: rand(0, 1),
      dir: Math.random() < 0.5 ? 1 : -1,
      speed: bike ? rand(3.8, 5.6) : rand(1.05, 1.7),
      phase: rand(0, 6.28),
      x: 0,
      z: 0,
      heading: 0,
      bike,
      height: bike ? 0.3 : 0,
      index: i
    };
    a.shirt = new THREE.Color(pick(PED_SHIRTS));
    a.trousers = new THREE.Color(pick(TROUSERS));
    a.hairCol = new THREE.Color(pick(HAIR));
    this.bodies.setColorAt(i, a.shirt);
    this.hair.setColorAt(i, a.hairCol);
    this.legL.setColorAt(i, a.trousers);
    this.legR.setColorAt(i, a.trousers);
    this.agents.push(a);
    this.place(a);
  }

  place(a) {
    const r = a.route;
    a.x = r.ax + (r.bx - r.ax) * a.t;
    a.z = r.az + (r.bz - r.az) * a.t;
    a.heading = Math.atan2((r.bx - r.ax) * a.dir, (r.bz - r.az) * a.dir);
  }

  update(dt) {
    let bikeIdx = 0;
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      const r = a.route;
      const segLen = Math.hypot(r.bx - r.ax, r.bz - r.az) || 1;
      a.t += (a.dir * a.speed * dt) / segLen;
      if (a.t > 1) { a.t = 1; a.dir = -1; }
      if (a.t < 0) { a.t = 0; a.dir = 1; }
      this.place(a);
      a.phase += a.speed * dt * 4.6;

      const swing = Math.sin(a.phase) * (a.bike ? 0.2 : 0.62);
      const bob = a.bike ? 0 : Math.abs(Math.sin(a.phase)) * 0.028;
      const y = a.height + bob;

      Q.setFromEuler(E.set(a.bike ? 0.32 : 0, a.heading, 0, 'YXZ'));
      P.set(a.x, y, a.z);
      S.set(1, 1, 1);
      M.compose(P, Q, S);
      this.bodies.setMatrixAt(i, M);
      this.hair.setMatrixAt(i, M);

      // legs: hip at 0.9 m, offset left and right of the spine
      const rx = Math.cos(a.heading) * 0.1;
      const rz = -Math.sin(a.heading) * 0.1;
      Q.setFromEuler(E.set(swing, a.heading, 0, 'YXZ'));
      P.set(a.x + rx, a.height + 0.9, a.z + rz);
      M2.compose(P, Q, S);
      this.legL.setMatrixAt(i, M2);

      Q.setFromEuler(E.set(-swing, a.heading, 0, 'YXZ'));
      P.set(a.x - rx, a.height + 0.9, a.z - rz);
      M2.compose(P, Q, S);
      this.legR.setMatrixAt(i, M2);

      if (a.bike && bikeIdx < this.maxBikes) {
        Q.setFromEuler(E.set(0, a.heading, 0, 'YXZ'));
        P.set(a.x, 0.02, a.z);
        M2.compose(P, Q, S);
        this.bikes.setMatrixAt(bikeIdx, M2);
        bikeIdx++;
      }
    }

    this.bodies.instanceMatrix.needsUpdate = true;
    this.hair.instanceMatrix.needsUpdate = true;
    this.legL.instanceMatrix.needsUpdate = true;
    this.legR.instanceMatrix.needsUpdate = true;
    this.bikes.instanceMatrix.needsUpdate = true;
    this.bikes.count = Math.min(bikeIdx, this.maxBikes);
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    if (this.hair.instanceColor) this.hair.instanceColor.needsUpdate = true;
    if (this.legL.instanceColor) this.legL.instanceColor.needsUpdate = true;
    if (this.legR.instanceColor) this.legR.instanceColor.needsUpdate = true;
  }

  nearest(x, z) {
    let best = null;
    let bd = Infinity;
    for (const a of this.agents) {
      const d = (a.x - x) * (a.x - x) + (a.z - z) * (a.z - z);
      if (d < bd) { bd = d; best = a; }
    }
    return best ? { agent: best, dist: Math.sqrt(bd) } : null;
  }

  relocateFar(px, pz) {
    for (const a of this.agents) {
      if (Math.hypot(a.x - px, a.z - pz) > 420) {
        const route = this.routes.length ? pick(this.routes) : null;
        if (!route) continue;
        a.route = route;
        a.bike = !!route.bike;
        a.height = a.bike ? 0.3 : 0;
        a.t = rand(0, 1);
        this.place(a);
      }
    }
  }
}
