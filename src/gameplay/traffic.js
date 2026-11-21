// AI traffic. Every car is a real Vehicle, so it collides with the player,
// follows the lane graph and queues behind the car in front.

import { Vehicle } from '../vehicles/vehicle.js';
import { TRAFFIC_COLORS } from '../world/data.js';
import { clamp, pick, rand } from '../core/util.js';

const TYPE_IDS = ['compact', 'estate', 'compact', 'estate', 'van', 'sport', 'classic', 'compact', 'estate'];
const laneOffset = (width) => Math.max(1.25, (width * 0.5 - 2.6) * 0.55);

export class TrafficSystem {
  constructor(scene, network, collision, count = 22) {
    this.scene = scene;
    this.network = network;
    this.collision = collision;
    this.cars = [];
    this.edges = network.edges.filter((e) => e.len > 28);
    for (let i = 0; i < count; i++) this.spawn();
  }

  freeSpot() {
    for (let tries = 0; tries < 30; tries++) {
      const edge = pick(this.edges);
      if (!edge) return null;
      const s = rand(6, Math.max(7, edge.len - 6));
      const x = edge.ax + edge.dx * s;
      const z = edge.az + edge.dz * s;
      let blocked = false;
      for (const c of this.cars) {
        const dx = c.vehicle.x - x;
        const dz = c.vehicle.z - z;
        if (dx * dx + dz * dz < 160) { blocked = true; break; }
      }
      if (blocked) continue;
      return { edge, s };
    }
    return null;
  }

  spawn() {
    const spot = this.freeSpot();
    if (!spot) return null;
    const { edge, s } = spot;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const lane = laneOffset(edge.width) * dir;
    const x = edge.ax + edge.dx * s + edge.dz * lane;
    const z = edge.az + edge.dz * s - edge.dx * lane;
    const heading = Math.atan2(edge.dx * dir, edge.dz * dir);
    const vehicle = new Vehicle({
      type: pick(TYPE_IDS),
      color: pick(TRAFFIC_COLORS),
      x,
      z,
      heading,
      liveWheels: false
    });
    vehicle.speedLimit = edge.width > 15 ? rand(18, 25) : rand(9, 15);
    this.scene.add(vehicle.group);

    const car = {
      vehicle,
      edge,
      s,
      dir,
      lane,
      stuck: 0,
      next: null,
      cruise: vehicle.speedLimit * rand(0.85, 1.05)
    };
    this.chooseNext(car);
    this.cars.push(car);
    return car;
  }

  chooseNext(car) {
    const net = this.network;
    const edge = car.edge;
    const node = net.nodes[car.dir > 0 ? edge.b : edge.a];
    const options = [];
    for (const id of node.edges) {
      const e = net.edges[id];
      if (!e || e.id === edge.id) continue;
      const rid = node.id === e.a ? 1 : -1;
      const dot = e.dx * rid * edge.dx * car.dir + e.dz * rid * edge.dz * car.dir;
      options.push({ edge: e, dir: rid, dot });
    }
    if (!options.length) {
      car.next = { edge, dir: -car.dir };
      return;
    }
    options.sort((a, b) => b.dot - a.dot);
    car.next = options[0].dot > 0.72 && Math.random() < 0.62 ? options[0] : pick(options);
  }

  update(dt, playerVehicle) {
    for (const car of this.cars) {
      const v = car.vehicle;
      const edge = car.edge;

      let gap = 999;
      for (const other of this.cars) {
        if (other === car) continue;
        const ov = other.vehicle;
        const dx = ov.x - v.x;
        const dz = ov.z - v.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 1000) continue;
        const d = Math.sqrt(d2);
        const dot = (dx * v.forwardX + dz * v.forwardZ) / (d || 1);
        if (dot > 0.7 && d < gap) gap = d;
      }
      if (playerVehicle) {
        const dx = playerVehicle.x - v.x;
        const dz = playerVehicle.z - v.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 1000) {
          const d = Math.sqrt(d2);
          const dot = (dx * v.forwardX + dz * v.forwardZ) / (d || 1);
          if (dot > 0.7 && d < gap) gap = d;
        }
      }
      const limitFactor = gap < 20 ? clamp((gap - 6) / 14, 0, 1) : 1;

      const look = 8 + Math.abs(v.vLong) * 0.6;
      const lookS = clamp(car.s + car.dir * look, 0, edge.len);
      const rightX = edge.dz * car.dir;
      const rightZ = -edge.dx * car.dir;
      const tx = edge.ax + edge.dx * lookS + rightX * car.lane;
      const tz = edge.az + edge.dz * lookS + rightZ * car.lane;

      let err = Math.atan2(tx - v.x, tz - v.z) - v.heading;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      const steer = clamp(err * 2.6, -1, 1);

      const targetSpeed = Math.min(car.cruise, v.speedLimit) * limitFactor;
      let throttle = 0;
      let brake = 0;
      if (v.vLong < targetSpeed - 0.6) throttle = clamp((targetSpeed - v.vLong) * 0.45, 0.18, 1);
      else if (v.vLong > targetSpeed + 0.8) brake = clamp((v.vLong - targetSpeed) * 0.3, 0.12, 1);

      v.update(dt, { throttle, brake, steer, handbrake: false }, this.collision);

      car.s += car.dir * Math.abs(v.vLong) * dt * 0.95;
      if (car.s > edge.len) car.s = edge.len;
      if (car.s < 0) car.s = 0;
      if ((car.dir > 0 && car.s >= edge.len - 0.5) || (car.dir < 0 && car.s <= 0.5)) {
        this.advance(car);
      }

      if (v.speed < 0.5) {
        car.stuck += dt;
        if (car.stuck > 7) { car.stuck = 0; this.respawn(car); }
      } else {
        car.stuck = 0;
      }
    }
  }

  advance(car) {
    const next = car.next || { edge: car.edge, dir: -car.dir };
    car.edge = next.edge;
    car.dir = next.dir;
    car.s = next.dir > 0 ? 1.6 : next.edge.len - 1.6;
    car.lane = laneOffset(next.edge.width) * next.dir;
    car.cruise = (next.edge.width > 15 ? 22 : rand(9, 15)) * rand(0.85, 1.05);
    this.chooseNext(car);
  }

  respawn(car) {
    const spot = this.freeSpot();
    if (!spot) return;
    car.edge = spot.edge;
    car.s = spot.s;
    car.dir = Math.random() < 0.5 ? 1 : -1;
    car.lane = laneOffset(spot.edge.width) * car.dir;
    car.stuck = 0;
    const x = spot.edge.ax + spot.edge.dx * spot.s + spot.edge.dz * car.lane;
    const z = spot.edge.az + spot.edge.dz * spot.s - spot.edge.dx * car.lane;
    car.vehicle.setPose(x, z, Math.atan2(spot.edge.dx * car.dir, spot.edge.dz * car.dir));
    this.chooseNext(car);
  }

  maintain(px, pz) {
    for (const car of this.cars) {
      if (Math.hypot(car.vehicle.x - px, car.vehicle.z - pz) > 460) this.respawn(car);
    }
  }

  /** Push any car that spawned on top of the player somewhere else. */
  clearAround(x, z, r) {
    for (const car of this.cars) {
      if (Math.hypot(car.vehicle.x - x, car.vehicle.z - z) < r) {
        for (let tries = 0; tries < 8; tries++) {
          this.respawn(car);
          if (Math.hypot(car.vehicle.x - x, car.vehicle.z - z) > r) break;
        }
      }
    }
  }

  vehicles() {
    return this.cars.map((c) => c.vehicle);
  }
}

/** Cars parked along the kerbs: they add life and they block the road. */
export function spawnParkedCars(scene, network, collision, count = 150) {
  const out = [];
  const edges = network.edges.filter((e) => e.len > 30 && e.width < 15);
  const types = ['compact', 'estate', 'van', 'classic', 'compact', 'estate', 'sport'];
  void collision;
  for (let i = 0; i < count; i++) {
    const edge = pick(edges);
    if (!edge) continue;
    const side = Math.random() < 0.5 ? 1 : -1;
    const s = rand(6, Math.max(7, edge.len - 6));
    const off = (edge.width * 0.5 - 0.95) * side;
    const x = edge.ax + edge.dx * s + edge.dz * off;
    const z = edge.az + edge.dz * s - edge.dx * off;
    const heading = Math.atan2(edge.dx * side, edge.dz * side);
    let blocked = false;
    for (const other of out) {
      if (Math.hypot(other.x - x, other.z - z) < 6.5) { blocked = true; break; }
    }
    if (blocked) continue;
    const v = new Vehicle({
      type: pick(types),
      color: pick(TRAFFIC_COLORS),
      x,
      z,
      heading,
      liveWheels: false,
      noShadow: true
    });
    scene.add(v.group);
    out.push(v);
  }
  return out;
}
