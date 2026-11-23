// Route finding over the street graph, plus the turn-by-turn instructions.

import { clamp } from '../core/util.js';
import { projectOnEdge } from '../world/network.js';

/** One glyph per turn type, shared by the HUD card and the minimap. */
export const TURN_GLYPH = {
  left: '←',
  right: '→',
  straight: '↑',
  uturn: '⤺',
  arrive: '●',
  keepLeft: '↖',
  keepRight: '↗',
  sharpLeft: '⇦',
  sharpRight: '⇨'
};

export class Navigator {
  constructor(network) {
    this.net = network;
    this.nodeCount = network.nodes.length;
    this.gScore = new Float64Array(this.nodeCount);
    this.fScore = new Float64Array(this.nodeCount);
    this.cameFrom = new Int32Array(this.nodeCount);
    this.closed = new Uint8Array(this.nodeCount);
    this.open = [];
  }

  nearestNode(x, z) {
    return this.net.nearestNode(x, z);
  }

  /** A* between two world points. Returns a polyline in metres. */
  route(ax, az, bx, bz) {
    const net = this.net;
    const start = net.nearestNode(ax, az);
    const goal = net.nearestNode(bx, bz);
    if (!start || !goal) return null;

    if (start.id === goal.id) {
      return {
        points: [{ x: ax, z: az }, { x: start.x, z: start.z }, { x: bx, z: bz }],
        distance: Math.hypot(bx - ax, bz - az)
      };
    }

    const n = this.nodeCount;
    this.gScore.fill(Infinity);
    this.fScore.fill(Infinity);
    this.closed.fill(0);
    this.cameFrom.fill(-1);
    this.open.length = 0;

    this.gScore[start.id] = 0;
    this.fScore[start.id] = this.heuristic(start, goal);
    this.open.push(start.id);

    let found = false;
    let guard = 0;
    while (this.open.length && guard++ < 20000) {
      // pick the lowest f (linear scan is fine at this graph size)
      let bestI = 0;
      let bestF = Infinity;
      for (let i = 0; i < this.open.length; i++) {
        const f = this.fScore[this.open[i]];
        if (f < bestF) { bestF = f; bestI = i; }
      }
      const current = this.open.splice(bestI, 1)[0];
      if (current === goal.id) { found = true; break; }
      this.closed[current] = 1;

      const node = net.nodes[current];
      for (const eid of node.edges) {
        const e = net.edges[eid];
        const other = e.a === current ? e.b : e.a;
        if (this.closed[other]) continue;
        const tentative = this.gScore[current] + e.len;
        if (tentative < this.gScore[other]) {
          this.cameFrom[other] = current;
          this.gScore[other] = tentative;
          this.fScore[other] = tentative + this.heuristic(net.nodes[other], goal);
          if (this.open.indexOf(other) === -1) this.open.push(other);
        }
      }
      if (guard > n * 8) break;
    }

    if (!found) return null;

    const chain = [];
    let cur = goal.id;
    let safety = 0;
    while (cur !== -1 && safety++ < 5000) {
      chain.push(net.nodes[cur]);
      if (cur === start.id) break;
      cur = this.cameFrom[cur];
    }
    chain.reverse();

    const points = [{ x: ax, z: az }];
    for (const node of chain) points.push({ x: node.x, z: node.z });
    points.push({ x: bx, z: bz });

    let distance = 0;
    for (let i = 1; i < points.length; i++) {
      distance += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    }
    return { points, distance, nodes: chain };
  }

  heuristic(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  /**
   * Route from the junction the driver is heading towards, so the guidance
   * always points forward instead of back to the crossing behind the car.
   */
  routeAhead(ax, az, heading, bx, bz) {
    const near = this.net.nearestEdge(ax, az);
    if (!near.edge || near.dist > 40) return this.route(ax, az, bx, bz);
    const e = near.edge;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const along = e.dx * fx + e.dz * fz;
    const target = along >= 0 ? this.net.nodes[e.b] : this.net.nodes[e.a];
    if (!target) return this.route(ax, az, bx, bz);
    const proj = projectOnEdge(e, ax, az);
    const rest = this.route(target.x, target.z, bx, bz);
    if (!rest) return this.route(ax, az, bx, bz);
    const points = [{ x: proj.x, z: proj.z }, { x: target.x, z: target.z }];
    for (let i = 1; i < rest.points.length; i++) points.push(rest.points[i]);
    let distance = 0;
    for (let i = 1; i < points.length; i++) {
      distance += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    }
    return { points, distance };
  }

  /**
   * Where the driver is on a route: which leg they are on, how far off the
   * line they have drifted, and how much road is left. This is the one place
   * that works out progress, so guidance, the card and the re-route check all
   * agree with each other.
   */
  progress(routePoints, x, z) {
    if (!routePoints || routePoints.length < 2) {
      return { off: Infinity, idx: 0, remaining: 0, total: 0 };
    }
    let idx = 0;
    let off = Infinity;
    for (let i = 0; i < routePoints.length - 1; i++) {
      const a = routePoints[i];
      const b = routePoints[i + 1];
      const d = pointSegDist(a.x, a.z, b.x, b.z, x, z);
      if (d < off) {
        off = d;
        idx = i;
      }
    }
    let total = 0;
    for (let i = 1; i < routePoints.length; i++) {
      total += Math.hypot(routePoints[i].x - routePoints[i - 1].x, routePoints[i].z - routePoints[i - 1].z);
    }
    let remaining = Math.hypot(routePoints[idx + 1].x - x, routePoints[idx + 1].z - z);
    for (let i = idx + 1; i < routePoints.length - 1; i++) {
      remaining += Math.hypot(routePoints[i + 1].x - routePoints[i].x, routePoints[i + 1].z - routePoints[i].z);
    }
    return { off, idx, remaining, total };
  }

  /** Name of the street closest to a point, for the instruction card. */
  streetAt(x, z) {
    const near = this.net.nearestEdge(x, z);
    return near && near.edge && near.edge.name ? near.edge.name : '';
  }

  /**
   * Work out what the driver should do next: which way to turn, how far to the
   * junction, and which street they join. Bends are graded from "hold left"
   * to "sharp right" so the arrow and the wording match the road.
   */
  guidance(routePoints, x, z) {
    if (!routePoints || routePoints.length < 2) {
      return { turn: 'straight', text: 'Rijd naar de bestemming', street: '', distance: 0, remaining: 0, target: null };
    }
    const p = this.progress(routePoints, x, z);
    const idx = p.idx;
    const nextPoint = routePoints[Math.min(idx + 1, routePoints.length - 1)];
    const after = routePoints[Math.min(idx + 2, routePoints.length - 1)];
    const distToNext = Math.hypot(nextPoint.x - x, nextPoint.z - z);

    if (idx >= routePoints.length - 2) {
      const dest = routePoints[routePoints.length - 1];
      return {
        turn: 'arrive',
        text: distToNext < 20 ? 'U bent er' : 'Bestemming vooruit',
        street: '',
        distance: distToNext,
        remaining: p.remaining,
        target: dest
      };
    }

    const b1 = Math.atan2(nextPoint.x - x, nextPoint.z - z);
    const b2 = Math.atan2(after.x - nextPoint.x, after.z - nextPoint.z);
    let delta = b2 - b1;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const ad = Math.abs(delta);

    let turn = 'straight';
    let text = 'Rijd rechtdoor';
    if (ad > 2.6) {
      turn = 'uturn';
      text = 'Keer om';
    } else if (ad > 1.5) {
      turn = delta > 0 ? 'sharpRight' : 'sharpLeft';
      text = delta > 0 ? 'Scherp rechtsaf' : 'Scherp linksaf';
    } else if (ad > 0.55) {
      turn = delta > 0 ? 'right' : 'left';
      text = delta > 0 ? 'Sla rechtsaf' : 'Sla linksaf';
    } else if (ad > 0.22) {
      turn = delta > 0 ? 'keepRight' : 'keepLeft';
      text = delta > 0 ? 'Houd rechts aan' : 'Houd links aan';
    }

    return {
      turn,
      text,
      // going straight, name the street you stay on; turning, the one you join
      street: turn === 'straight' || turn === 'keepLeft' || turn === 'keepRight'
        ? this.streetAt(x, z)
        : this.streetAt(after.x, after.z),
      distance: distToNext,
      remaining: p.remaining,
      delta: (delta * 180) / Math.PI,
      target: nextPoint
    };
  }

  remaining(routePoints, x, z) {
    return this.progress(routePoints, x, z).remaining;
  }
}

function pointSegDist(ax, az, bx, bz, px, pz) {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const l2 = vx * vx + vz * vz;
  let t = l2 > 0 ? (wx * vx + wz * vz) / l2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + vx * t - px;
  const cz = az + vz * t - pz;
  return Math.hypot(cx, cz);
}

/**
 * A route polyline with its cumulative lengths, so the guidance can ask "where
 * is 40 m ahead of me on this line?". Built once per route change.
 */
export class RoutePath {
  constructor(points) {
    this.points = points || [];
    this.cum = [0];
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1];
      const b = this.points[i];
      this.cum.push(this.cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
    }
    this.length = this.cum.length ? this.cum[this.cum.length - 1] : 0;
  }

  /** Distance along the line of the point nearest (px, pz). */
  project(px, pz) {
    if (this.points.length < 2) return 0;
    let bestS = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i];
      const b = this.points[i + 1];
      const vx = b.x - a.x;
      const vz = b.z - a.z;
      const l2 = vx * vx + vz * vz;
      let t = l2 > 0 ? ((px - a.x) * vx + (pz - a.z) * vz) / l2 : 0;
      t = clamp(t, 0, 1);
      const cx = a.x + vx * t;
      const cz = a.z + vz * t;
      const d = (cx - px) * (cx - px) + (cz - pz) * (cz - pz);
      if (d < bestD) {
        bestD = d;
        bestS = this.cum[i] + Math.sqrt(l2) * t;
      }
    }
    return bestS;
  }

  /** Position and heading along the line at distance s. */
  at(s) {
    if (this.points.length < 2) return null;
    const d = clamp(s, 0, this.length);
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < d) i++;
    const a = this.points[i - 1];
    const b = this.points[i];
    const segLen = this.cum[i] - this.cum[i - 1] || 1;
    const t = (d - this.cum[i - 1]) / segLen;
    return {
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
      angle: Math.atan2(b.x - a.x, b.z - a.z)
    };
  }
}
