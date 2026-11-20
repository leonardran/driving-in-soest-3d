// Arcade-simulated car: a bicycle model with a grip-limited lateral scrub and
// real collision response against the city.

import * as THREE from 'three';
import { CAR_TYPES, WORLD } from '../world/data.js';
import { clamp, damp } from '../core/util.js';
import { makeCarModel } from './models.js';
import { TEX } from '../world/textures.js';

export class Vehicle {
  constructor(opts) {
    this.typeId = opts.type || 'taxi';
    this.spec = CAR_TYPES[this.typeId] || CAR_TYPES.taxi;
    const model = makeCarModel(this.typeId, this.spec, opts.color || this.spec.color, {
      liveWheels: opts.liveWheels !== false
    });
    this.model = model;
    this.group = model.group;
    this.profile = model.profile;
    this.radius = model.group.userData.radius;

    this.x = opts.x || 0;
    this.z = opts.z || 0;
    this.heading = opts.heading || 0;
    this.vx = 0;
    this.vz = 0;
    this.steer = 0;
    this.yawRate = 0;
    this.wheelSpin = 0;
    this.mass = this.spec.mass;
    this.impact = 0;
    this.damage = 0;
    this.fuel = 100;
    this.isPlayer = !!opts.isPlayer;
    this.driver = opts.driver || null;
    this.headlightsOn = false;
    this.braking = false;
    this.honkCooldown = 0;

    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;

    for (const w of model.wheels) w.rotation.order = 'YXZ';

    // headlight pool, only used when it is dark
    if (opts.headlights !== false) {
      const geo = new THREE.PlaneGeometry(9, 22);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        map: TEX.headlights(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const pool = new THREE.Mesh(geo, mat);
      pool.position.set(0, 0.06, model.profile.l * 0.5 + 9);
      pool.renderOrder = 3;
      this.group.add(pool);
      this.pool = pool;
    }
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  get forwardX() {
    return Math.sin(this.heading);
  }

  get forwardZ() {
    return Math.cos(this.heading);
  }

  get vLong() {
    return this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading);
  }

  get vLat() {
    return this.vx * Math.cos(this.heading) - this.vz * Math.sin(this.heading);
  }

  setPose(x, z, heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.vx = 0;
    this.vz = 0;
    this.yawRate = 0;
    this.steer = 0;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = heading;
  }

  update(dt, input, world) {
    dt = Math.min(dt, 0.05);
    const spec = this.spec;
    const throttle = clamp(input.throttle || 0, 0, 1);
    const brake = clamp(input.brake || 0, 0, 1);
    const handbrake = !!input.handbrake;
    const steerIn = clamp(input.steer || 0, -1, 1);
    this.braking = brake > 0.2 || handbrake;

    const speed = Math.hypot(this.vx, this.vz);
    const maxSteer = spec.steer * (1 - clamp(speed / 64, 0, 0.5));
    this.steer = damp(this.steer, steerIn * maxSteer, 11, dt);

    let sin = Math.sin(this.heading);
    let cos = Math.cos(this.heading);
    let vLong = this.vx * sin + this.vz * cos;
    let vLat = this.vx * cos - this.vz * sin;

    let accel = 0;
    if (throttle > 0.01) {
      const ratio = clamp(vLong / spec.maxSpeed, 0, 1);
      accel += (spec.power * throttle * (1 - ratio * ratio * 0.92)) / this.mass;
    }
    if (brake > 0.01) {
      if (vLong > 0.4) accel -= (spec.brake * brake) / this.mass;
      else accel -= (spec.brake * brake * 0.42) / this.mass;
    }
    accel -= Math.sign(vLong) * 0.55;
    accel -= (spec.power / (this.mass * spec.maxSpeed * spec.maxSpeed * 2.2)) * vLong * Math.abs(vLong);
    if (handbrake) accel -= Math.sign(vLong) * 6.5;

    vLong += accel * dt;
    const revMax = -spec.maxSpeed * 0.3;
    if (vLong < revMax) vLong = revMax;
    if (vLong > spec.maxSpeed + 1.5) vLong = spec.maxSpeed + 1.5;
    if (Math.abs(vLong) < 0.05 && throttle < 0.01 && brake < 0.01) vLong = 0;

    this.vx = vLong * sin + vLat * cos;
    this.vz = vLong * cos - vLat * sin;

    // steering turns the car; grip decides how much the tyres follow
    const yawTarget = (vLong / Math.max(this.profile.wb, 0.6)) * Math.tan(this.steer);
    this.yawRate = damp(this.yawRate, yawTarget * (handbrake ? 1.45 : 1), 9, dt);
    this.heading += this.yawRate * dt;

    sin = Math.sin(this.heading);
    cos = Math.cos(this.heading);
    vLong = this.vx * sin + this.vz * cos;
    vLat = this.vx * cos - this.vz * sin;

    const latGrip = (handbrake ? 3.4 : 12.5) * spec.grip;
    const scrub = Math.min(Math.abs(vLat), latGrip * dt);
    vLat -= Math.sign(vLat) * scrub;

    this.vx = vLong * sin + vLat * cos;
    this.vz = vLong * cos - vLat * sin;

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // world edges
    const limX = WORLD.halfW + 60;
    const limZ = WORLD.halfH + 60;
    if (this.x < -limX) { this.x = -limX; this.vx = Math.abs(this.vx) * 0.3; }
    if (this.x > limX) { this.x = limX; this.vx = -Math.abs(this.vx) * 0.3; }
    if (this.z < -limZ) { this.z = -limZ; this.vz = Math.abs(this.vz) * 0.3; }
    if (this.z > limZ) { this.z = limZ; this.vz = -Math.abs(this.vz) * 0.3; }

    if (world) {
      const hit = world.resolve(this.x, this.z, this.radius);
      if (hit) {
        this.x = hit.x;
        this.z = hit.z;
        const vn = this.vx * hit.nx + this.vz * hit.nz;
        if (vn < 0) {
          this.vx -= 1.32 * vn * hit.nx;
          this.vz -= 1.32 * vn * hit.nz;
          const sev = Math.min(1, -vn / 13);
          this.impact = Math.max(this.impact, sev);
          this.damage = Math.min(1, this.damage + sev * 0.16);
        }
        this.vx *= 0.88;
        this.vz *= 0.88;
      }
    }

    this.impact = Math.max(0, this.impact - dt * 2.2);

    // --- visuals ---------------------------------------------------------
    const m = this.model;
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;

    this.wheelSpin += (vLong / Math.max(this.profile.wheelR, 0.15)) * dt;
    const roll = clamp(-vLat * 0.013, -0.085, 0.085);
    const pitch = clamp(-accel * 0.0055, -0.055, 0.055);
    m.bodyPivot.rotation.z = damp(m.bodyPivot.rotation.z, roll, 7, dt);
    m.bodyPivot.rotation.x = damp(m.bodyPivot.rotation.x, pitch, 7, dt);
    m.bodyPivot.position.y = damp(m.bodyPivot.position.y, Math.min(0.03, Math.abs(vLat) * 0.004), 6, dt);

    for (const w of m.wheels) {
      w.rotation.x = this.wheelSpin;
      if (w.userData.front) w.rotation.y = -this.steer;
    }
  }

  setHeadlights(on, strength = 1) {
    this.headlightsOn = on;
    if (this.pool) this.pool.material.opacity = on ? 0.85 * strength : 0;
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh) {
        if (o.geometry && o.geometry.dispose) o.geometry.dispose();
        if (o.material && o.material.dispose && !o.material.userData?.shared) o.material.dispose();
      }
    });
  }
}
