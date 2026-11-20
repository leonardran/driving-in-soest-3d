// Police chases and roaming emergency services.

import * as THREE from 'three';
import { Vehicle } from '../vehicles/vehicle.js';
import { clamp, rand } from '../core/util.js';

function beaconGroup() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({
    color: 0x8f1616,
    emissive: new THREE.Color(0xff2020),
    emissiveIntensity: 0,
    roughness: 0.35
  });
  const blue = new THREE.MeshStandardMaterial({
    color: 0x14168f,
    emissive: new THREE.Color(0x2a5cff),
    emissiveIntensity: 0,
    roughness: 0.35
  });
  const barA = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), red);
  barA.position.set(-0.32, 1.62, -0.1);
  const barB = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), blue);
  barB.position.set(0.32, 1.62, -0.1);
  g.add(barA, barB);
  g.userData = { red, blue };
  return g;
}

export class PoliceSystem {
  constructor(scene, network, collision, nav) {
    this.scene = scene;
    this.net = network;
    this.collision = collision;
    this.nav = nav;
    this.cars = [];
    this.wanted = 0;
    this.heat = 0;
    this.pursuit = false;
    this.bustedCooldown = 0;
    this.spawnCooldown = 0;
    for (let i = 0; i < 2; i++) this.spawn();
  }

  spawn(nearX, nearZ) {
    const edge = this.net.edges[Math.floor(Math.random() * this.net.edges.length)];
    if (!edge) return null;
    const s = rand(10, Math.max(12, edge.len - 10));
    let x = edge.ax + edge.dx * s;
    let z = edge.az + edge.dz * s;
    if (nearX !== undefined) {
      const target = this.net.nearestEdge(nearX, nearZ).edge;
      if (target) {
        x = target.ax + target.dx * (target.len * 0.5);
        z = target.az + target.dz * (target.len * 0.5);
      }
    }
    const v = new Vehicle({
      type: 'police',
      x,
      z,
      heading: Math.atan2(edge.dx, edge.dz),
      liveWheels: true
    });
    const beacon = beaconGroup();
    v.group.add(beacon);
    this.scene.add(v.group);
    const car = { vehicle: v, beacon, mode: 'patrol', stuck: 0 };
    this.cars.push(car);
    return car;
  }

  addWanted(n) {
    this.wanted = clamp(this.wanted + n, 0, 3);
    this.heat = 12;
    if (this.wanted > 0 && !this.pursuit) {
      this.pursuit = true;
      for (const car of this.cars) car.mode = 'chase';
    }
  }

  clearAround(x, z, r) {
    for (const car of this.cars) {
      if (Math.hypot(car.vehicle.x - x, car.vehicle.z - z) < r) {
        const spot = this.net.nearestEdge(x + rand(-200, 200), z + rand(-200, 200)).edge;
        if (spot) {
          car.vehicle.setPose(
            spot.ax + spot.dx * spot.len * 0.5,
            spot.az + spot.dz * spot.len * 0.5,
            Math.atan2(spot.dx, spot.dz)
          );
        }
      }
    }
  }

  clearWanted() {
    this.wanted = 0;
    this.heat = 0;
    this.pursuit = false;
    for (const car of this.cars) car.mode = 'patrol';
  }

  update(dt, player, audio, onBusted) {
    if (this.bustedCooldown > 0) this.bustedCooldown -= dt;

    if (this.heat > 0) {
      this.heat -= dt;
      if (this.heat <= 0 && this.pursuit) this.clearWanted();
    }

    const blink = (performance.now() * 0.012) % 2;
    for (const car of this.cars) {
      const v = car.vehicle;
      const active = car.mode === 'chase';
      const on = active || this.wanted > 0;
      car.beacon.userData.red.emissiveIntensity = on ? (blink < 1 ? 3.2 : 0.05) : 0;
      car.beacon.userData.blue.emissiveIntensity = on ? (blink < 1 ? 0.05 : 3.2) : 0;

      const dx = player.x - v.x;
      const dz = player.z - v.z;
      const dist = Math.hypot(dx, dz);

      if (active && dist > 4) {
        // pursue
        const desired = Math.atan2(dx, dz);
        let err = desired - v.heading;
        while (err > Math.PI) err -= Math.PI * 2;
        while (err < -Math.PI) err += Math.PI * 2;
        const steer = clamp(err * 2.2, -1, 1);
        const targetSpeed = 26;
        let throttle = 0;
        let brake = 0;
        if (v.vLong < targetSpeed) throttle = clamp((targetSpeed - v.vLong) * 0.35, 0.25, 1);
        if (dist < 22 && v.speed > 12) brake = 0.55;
        v.update(dt, { throttle, brake, steer, handbrake: false }, this.collision);

        if (dist < 5.5 && v.speed < 8 && player.speed < 4 && this.bustedCooldown <= 0) {
          this.bustedCooldown = 8;
          if (onBusted) onBusted();
          this.clearWanted();
        }
      } else if (!active) {
        // patrol: drive around the player's neighbourhood
        const targetX = player.x + Math.sin(performance.now() * 0.00015 + car.beacon.id) * 120;
        const targetZ = player.z + Math.cos(performance.now() * 0.00019 + car.beacon.id) * 120;
        const desired = Math.atan2(targetX - v.x, targetZ - v.z);
        let err = desired - v.heading;
        while (err > Math.PI) err -= Math.PI * 2;
        while (err < -Math.PI) err += Math.PI * 2;
        const steer = clamp(err * 1.8, -1, 1);
        const targetSpeed = 13;
        let throttle = 0;
        let brake = 0;
        if (v.vLong < targetSpeed) throttle = clamp((targetSpeed - v.vLong) * 0.4, 0.2, 0.9);
        else if (v.vLong > targetSpeed + 1) brake = 0.3;
        v.update(dt, { throttle, brake, steer, handbrake: false }, this.collision);

        if (dist > 380) {
          const spot = this.net.nearestEdge(player.x + rand(-160, 160), player.z + rand(-160, 160)).edge;
          if (spot) {
            v.setPose(
              spot.ax + spot.dx * spot.len * 0.5,
              spot.az + spot.dz * spot.len * 0.5,
              Math.atan2(spot.dx, spot.dz)
            );
          }
        }
      }

      if (v.speed < 0.3) {
        car.stuck += dt;
        if (car.stuck > 8) {
          car.stuck = 0;
          v.setPose(v.x + rand(-30, 30), v.z + rand(-30, 30), v.heading);
        }
      } else {
        car.stuck = 0;
      }
    }

    if (audio) {
      let nearest = 999;
      for (const car of this.cars) {
        const d = Math.hypot(car.vehicle.x - player.x, car.vehicle.z - player.z);
        if (d < nearest) nearest = d;
      }
      audio.setSiren(this.wanted > 0 ? clamp(1 - nearest / 180, 0, 1) : 0, this.wanted > 0);
    }
  }
}

export class EmergencyServices {
  constructor(scene, network, collision) {
    this.scene = scene;
    this.net = network;
    this.collision = collision;
    this.cars = [];
    this.timer = rand(20, 40);
    for (const type of ['ambulance', 'fire']) this.add(type);
  }

  add(type) {
    const edge = this.net.edges[Math.floor(Math.random() * this.net.edges.length)];
    if (!edge) return null;
    const s = rand(10, Math.max(12, edge.len - 10));
    const v = new Vehicle({
      type,
      x: edge.ax + edge.dx * s,
      z: edge.az + edge.dz * s,
      heading: Math.atan2(edge.dx, edge.dz),
      liveWheels: true
    });
    const beacon = beaconGroup();
    beacon.position.y = type === 'fire' ? 0.4 : 0;
    v.group.add(beacon);
    this.scene.add(v.group);
    const car = { vehicle: v, beacon, target: null, timer: 6, stuck: 0 };
    this.cars.push(car);
    this.pickTarget(car);
    return car;
  }

  pickTarget(car) {
    const edge = this.net.edges[Math.floor(Math.random() * this.net.edges.length)];
    if (!edge) return;
    car.target = { x: edge.ax + edge.dx * edge.len * 0.5, z: edge.az + edge.dz * edge.len * 0.5, edge };
    car.timer = rand(14, 26);
  }

  clearAround(x, z, r) {
    for (const car of this.cars) {
      if (Math.hypot(car.vehicle.x - x, car.vehicle.z - z) < r) {
        const spot = this.net.nearestEdge(x + rand(-260, 260), z + rand(-260, 260)).edge;
        if (spot) {
          car.vehicle.setPose(
            spot.ax + spot.dx * spot.len * 0.5,
            spot.az + spot.dz * spot.len * 0.5,
            Math.atan2(spot.dx, spot.dz)
          );
          this.pickTarget(car);
        }
      }
    }
  }

  update(dt, player) {
    const blink = (performance.now() * 0.012) % 2;
    for (const car of this.cars) {
      const v = car.vehicle;
      car.beacon.userData.red.emissiveIntensity = blink < 1 ? 3.2 : 0.05;
      car.beacon.userData.blue.emissiveIntensity = blink < 1 ? 0.05 : 3.2;

      car.timer -= dt;
      const d = car.target ? Math.hypot(car.target.x - v.x, car.target.z - v.z) : 0;
      if (car.timer <= 0 || d < 12) this.pickTarget(car);

      const tx = car.target ? car.target.x : player.x;
      const tz = car.target ? car.target.z : player.z;
      const desired = Math.atan2(tx - v.x, tz - v.z);
      let err = desired - v.heading;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      const steer = clamp(err * 2.0, -1, 1);
      const targetSpeed = 17;
      let throttle = 0;
      let brake = 0;
      if (v.vLong < targetSpeed) throttle = clamp((targetSpeed - v.vLong) * 0.4, 0.2, 0.95);
      else if (v.vLong > targetSpeed + 1) brake = 0.3;
      v.update(dt, { throttle, brake, steer, handbrake: false }, this.collision);

      if (v.speed < 0.3) {
        car.stuck += dt;
        if (car.stuck > 6) {
          car.stuck = 0;
          v.setPose(v.x + rand(-25, 25), v.z + rand(-25, 25), v.heading);
        }
      } else {
        car.stuck = 0;
      }
      if (Math.hypot(v.x - player.x, v.z - player.z) > 520) {
        const spot = this.net.nearestEdge(player.x + rand(-120, 120), player.z + rand(-120, 120)).edge;
        if (spot) {
          v.setPose(spot.ax + spot.dx * spot.len * 0.5, spot.az + spot.dz * spot.len * 0.5, Math.atan2(spot.dx, spot.dz));
          this.pickTarget(car);
        }
      }
    }
  }
}
