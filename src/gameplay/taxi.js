// The taxi job loop: a passenger hails you, you drive to them, they get in,
// you take them to where they want to go and you get paid.

import * as THREE from 'three';
import { POIS } from '../world/data.js';
import { projectOnEdge } from '../world/network.js';
import { rand, pick, formatMoney, formatDistance } from '../core/util.js';

const NAMES = [
  'Mevrouw Van Dijk', 'Bram', 'Sanne', 'Dhr. Bakker', 'Youssef', 'Marieke',
  'Opa Henk', 'Fatima', 'Joost', 'Lieke', 'Mevr. De Groot', 'Rikkert',
  'Tess', 'Abdel', 'Wilma', 'Niels', 'Anne-Marie', 'Gerrit', 'Priya'
];

const SMALLTALK = [
  'Ik moet naar de tandarts, dus schiet een beetje op.',
  'Geen haast hoor, ik heb de hele middag.',
  'Rij maar via de dijk, dat is mooier.',
  'Ik ben al twee keer natgeregend vandaag.',
  'Mijn fiets staat alweer lek bij het station.',
  'Weet jij hier ergens goede koffie?',
  'Die weg is toch afgesloten? Of niet meer?',
  'Ik woon hier al dertig jaar en nog steeds verdwaal ik.',
  'Sorry, ik heb net gebeld en ik ben een beetje in paniek.',
  'Mijn dochter woont achter de kerk, daar moet ik zijn.'
];

const KINDS = [
  { id: 'normal', label: 'Rit', weight: 60, mult: 1, color: '#f2c230' },
  { id: 'rush', label: 'Spoedrit', weight: 24, mult: 1.45, color: '#e07a3a' },
  { id: 'vip', label: 'VIP-rit', weight: 12, mult: 1.9, color: '#8f7ff0' },
  { id: 'airport', label: 'Lange rit', weight: 4, mult: 2.3, color: '#4fb3c9' }
];

function pickKind() {
  const total = KINDS.reduce((n, k) => n + k.weight, 0);
  let r = Math.random() * total;
  for (const k of KINDS) {
    r -= k.weight;
    if (r <= 0) return k;
  }
  return KINDS[0];
}

function makeMarker(color) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.45, 16, 14, 1, true),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  beam.position.y = 8;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 2.4, 28),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.14;
  group.add(beam, ring);
  group.userData.beam = beam;
  group.userData.ring = ring;
  group.visible = false;
  return group;
}

export class TaxiService {
  constructor(ctx) {
    this.ctx = ctx; // { scene, nav, player, audio, hud, state }
    this.state = 'idle';
    this.timer = 0;
    this.job = null;
    this.fare = 0;
    this.meterDistance = 0;
    this.marker = makeMarker('#f2c230');
    ctx.scene.add(this.marker);
    this.waitForJob = 2.5;
    this.completed = 0;
    this.rating = 5;
    this.harshness = 0;
  }

  setPlayer(player) {
    this.player = player;
  }

  /**
   * Turn a landmark into a place you can actually pull over. The point of
   * interest is often in the middle of a block, so it is snapped onto the
   * nearest street and then placed in the kerb-side lane, with the passenger
   * standing on the pavement beside it.
   *
   * `fromX, fromZ` is where the taxi is coming from, which decides the side:
   * Dutch traffic keeps right, so the car pulls in at the right-hand kerb of
   * its direction of travel. The passenger waits on that pavement — sometimes
   * that means they cross the street, which is what a real pickup does, and is
   * far better than parking nose-on into oncoming traffic.
   *
   * Returns the car's stopping position (x, z) and the passenger's (standX,
   * standZ), so the beacon sits on the pavement and the route ends in the lane.
   */
  kerbStop(poi, fromX = poi.x, fromZ = poi.z) {
    const net = this.ctx.nav.net;
    const near = net.nearestEdge(poi.x, poi.z, (e) => e.width <= 15);
    if (!near || !near.edge) {
      return { ...poi, standX: poi.x, standZ: poi.z };
    }
    const e = near.edge;
    const proj = projectOnEdge(e, poi.x, poi.z);
    // keep clear of the junctions, so the stop is not inside a crossroad
    const pad = Math.min(8, e.len * 0.25);
    const s = Math.max(pad, Math.min(e.len - pad, proj.t * e.len));

    const bx = e.ax + e.dx * s;
    const bz = e.az + e.dz * s;

    // which way the car will arrive along this street
    const fromS = projectOnEdge(e, fromX, fromZ).t * e.len;
    const approach = fromS <= s ? 1 : -1;

    // right of travel for that direction: forward is (dx, dz) * approach, so
    // the right-hand normal is (-dz, dx) * approach
    const rx = -e.dz * approach;
    const rz = e.dx * approach;

    // the taxi pulls in beside the kerb, in the outer lane
    const lane = Math.max(1.2, e.width * 0.5 - 2.2);
    // the passenger waits on the pavement, clear of the carriageway edge
    const stand = e.width * 0.5 + 1.8;

    return {
      name: poi.name,
      kind: poi.kind,
      // where the taxi stops: the kerb-side lane
      x: bx + rx * lane,
      z: bz + rz * lane,
      // where the passenger waits: on the pavement beyond it
      standX: bx + rx * stand,
      standZ: bz + rz * stand,
      // the side of the road this stop is on, as a unit normal
      sideX: rx,
      sideZ: rz,
      edge: e
    };
  }

  chooseJob() {
    const p = this.player;
    const here = { x: p.x, z: p.z };
    const GOOD = new Set([
      'shop', 'station', 'cinema', 'fastfood', 'hotel', 'market', 'home',
      'church', 'palace', 'watertower', 'garage', 'carwash', 'casino', 'school', 'park'
    ]);
    const candidates = POIS.filter((poi) => {
      if (!GOOD.has(poi.kind)) return false;
      const d = Math.hypot(poi.x - here.x, poi.z - here.z);
      return d > 70 && d < 520;
    });
    if (!candidates.length) return null;
    const pickupPoi = pick(candidates);
    const dests = POIS.filter((poi) => {
      if (!GOOD.has(poi.kind)) return false;
      const d = Math.hypot(poi.x - pickupPoi.x, poi.z - pickupPoi.z);
      return d > 140;
    });
    const pickup = this.kerbStop(pickupPoi, p.x, p.z);
    const destPoi = dests.length ? pick(dests) : pick(POIS);
    // the drop-off is approached from the pickup, so it is the same kind of stop
    const dest = this.kerbStop(destPoi, pickup.x, pickup.z);
    const kind = pickKind();
    const name = pick(NAMES);
    return {
      name,
      kind,
      pickup,
      dest,
      line: pick(SMALLTALK),
      pax: 1 + Math.floor(Math.random() * (kind.id === 'vip' ? 2 : 3))
    };
  }

  start() {
    this.job = this.chooseJob();
    if (!this.job) return;
    this.state = 'toPickup';
    this.meterDistance = 0;
    this.fare = 0;
    this.harshness = 0;
    const route = this.ctx.nav.routeAhead(
      this.player.x, this.player.z, this.player.heading,
      this.job.pickup.x, this.job.pickup.z
    );
    this.route = route;
    this.marker.position.set(this.job.pickup.standX, 0, this.job.pickup.standZ);
    this.marker.visible = true;
    this.marker.userData.beam.material.color.set(this.job.kind.color);
    this.marker.userData.ring.material.color.set(this.job.kind.color);
    this.ctx.hud.setMission(
      this.job.kind.label,
      `Haal ${this.job.name} op`,
      `${this.job.pickup.name} · ${formatDistance(route ? route.distance : 0)}`,
      formatMoney(this.estimateFare())
    );
    this.ctx.audio.playChime('job');
  }

  estimateFare() {
    if (!this.job) return 0;
    const d = Math.hypot(this.job.dest.x - this.job.pickup.x, this.job.dest.z - this.job.pickup.z);
    return Math.round((3.4 + (d / 1000) * 2.3) * this.job.kind.mult);
  }

  update(dt) {
    if (!this.player) return;
    const p = this.player;

    // marker pulse
    if (this.marker.visible) {
      const t = performance.now() * 0.002;
      this.marker.userData.beam.material.opacity = 0.22 + Math.sin(t) * 0.1;
      const s = 1 + Math.sin(t * 1.4) * 0.06;
      this.marker.userData.ring.scale.set(s, s, s);
      this.marker.rotation.y += dt * 0.7;
    }

    if (this.state === 'idle') {
      this.waitForJob -= dt;
      if (this.waitForJob <= 0) {
        this.waitForJob = rand(3.5, 7);
        this.start();
      }
      return;
    }

    if (this.state === 'toPickup') {
      // measured from the kerb where the taxi pulls in, not from the pavement
      const d = Math.hypot(this.job.pickup.x - p.x, this.job.pickup.z - p.z);
      // Re-route when the driver leaves the line, not on every frame: a fresh
      // A* each frame made the ribbon jitter and cost more than it was worth.
      this.routeTimer = (this.routeTimer || 0) + dt;
      if (this.route) {
        const off = this.ctx.nav.progress(this.route.points, p.x, p.z).off;
        if (this.routeTimer > 5 || (off > 25 && this.routeTimer > 1)) {
          this.routeTimer = 0;
          const r = this.ctx.nav.routeAhead(p.x, p.z, p.heading, this.job.pickup.x, this.job.pickup.z);
          if (r) this.route = r;
        }
      }
      if (d < 8 && p.speed < 2.5) {
        this.state = 'boarding';
        this.timer = 1.8;
        this.ctx.hud.toast(`${this.job.name} stapt in…`);
        this.ctx.audio.playChime('board');
      }
      return;
    }

    if (this.state === 'boarding') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'toDrop';
        this.meterDistance = 0;
        this.marker.position.set(this.job.dest.standX, 0, this.job.dest.standZ);
        const route = this.ctx.nav.routeAhead(p.x, p.z, p.heading, this.job.dest.x, this.job.dest.z);
        this.route = route;
        this.ctx.hud.setMission(
          this.job.kind.label,
          `Breng ${this.job.name} naar ${this.job.dest.name}`,
          `${this.job.pax} ${this.job.pax === 1 ? 'passagier' : 'passagiers'} · ${formatDistance(route ? route.distance : 0)}`,
          '€ 3,40'
        );
      }
      return;
    }

    if (this.state === 'toDrop') {
      const d = Math.hypot(this.job.dest.x - p.x, this.job.dest.z - p.z);
      if (this.route) {
        // top the route up once the driver drifts off it
        this.routeTimer = (this.routeTimer || 0) + dt;
        const off = this.ctx.nav.progress(this.route.points, p.x, p.z).off;
        if (this.routeTimer > 5 || (off > 25 && this.routeTimer > 1)) {
          this.routeTimer = 0;
          const r = this.ctx.nav.routeAhead(p.x, p.z, p.heading, this.job.dest.x, this.job.dest.z);
          if (r) this.route = r;
        }
      }
      this.meterDistance += Math.abs(p.speed) * dt;
      this.fare = 3.4 + (this.meterDistance / 1000) * 2.3;
      this.harshness += p.impact * dt * 7;
      if (d < 9 && p.speed < 2.5) {
        this.finish();
      }
      return;
    }
  }

  finish() {
    const job = this.job;
    const base = this.fare * job.kind.mult;
    const tipFactor = Math.max(0, 1 - this.harshness * 0.55);
    const tip = base * 0.22 * tipFactor;
    const total = Math.round(base + tip);
    this.completed++;
    this.rating = Math.min(5, Math.max(1, this.rating + (this.harshness < 0.25 ? 0.06 : -0.18)));
    this.ctx.wallet.add(total);
    this.state = 'idle';
    this.waitForJob = rand(2.5, 5.5);
    this.job = null;
    this.marker.visible = false;
    this.route = null;
    this.ctx.audio.playChime('cash');
    this.ctx.hud.toast(`Rit klaar · ${formatMoney(total)}${tipFactor > 0.8 ? ' · fooi!' : ''}`);
    this.ctx.hud.setMission('Taxi', 'Wacht op een nieuwe rit…', 'Rijd rond of blijf staan.', '');
  }

  cancel() {
    this.state = 'idle';
    this.job = null;
    this.marker.visible = false;
    this.route = null;
    this.waitForJob = rand(2, 4);
  }

  get target() {
    if (!this.job) return null;
    const stop = this.state === 'toPickup'
      ? this.job.pickup
      : this.state === 'toDrop'
        ? this.job.dest
        : null;
    if (!stop) return null;
    // the beacon and the map pin sit on the pavement, beside the pull-in
    return {
      x: stop.standX != null ? stop.standX : stop.x,
      z: stop.standZ != null ? stop.standZ : stop.z,
      name: stop.name,
      color: this.job.kind.color
    };
  }
}
