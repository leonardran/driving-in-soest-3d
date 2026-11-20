// Route finding over the street graph, plus the turn-by-turn instructions.

import { clamp } from '../core/util.js';

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
   * Work out what the driver should do next: which way to turn and how far.
   */
  guidance(routePoints, x, z, heading) {
    if (!routePoints || routePoints.length < 2) {
      return { turn: 'straight', text: 'Rijd naar de bestemming', distance: 0, target: null };
    }
    // find the first segment we are still travelling along
    let idx = 0;
    let bestD = Infinity;
    for (let i = 0; i < routePoints.length - 1; i++) {
      const a = routePoints[i];
      const b = routePoints[i + 1];
      const d = pointSegDist(a.x, a.z, b.x, b.z, x, z);
      if (d < bestD - 0.5) { bestD = d; idx = i; }
    }

    const nextPoint = routePoints[Math.min(idx + 1, routePoints.length - 1)];
    const after = routePoints[Math.min(idx + 2, routePoints.length - 1)];
    const distToNext = Math.hypot(nextPoint.x - x, nextPoint.z - z);

    if (idx >= routePoints.length - 2) {
      const dest = routePoints[routePoints.length - 1];
      return {
        turn: 'arrive',
        text: 'Bestemming bereikt',
        distance: Math.hypot(dest.x - x, dest.z - z),
        target: dest
      };
    }

    const b1 = Math.atan2(nextPoint.x - x, nextPoint.z - z);
    const b2 = Math.atan2(after.x - nextPoint.x, after.z - nextPoint.z);
    let delta = b2 - b1;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    let turn = 'straight';
    if (delta > 0.32) turn = 'right';
    else if (delta < -0.32) turn = 'left';
    if (Math.abs(delta) > 2.5) turn = 'uturn';

    const deg = (delta * 180) / Math.PI;
    let text;
    if (turn === 'left') text = 'Sla linksaf';
    else if (turn === 'right') text = 'Sla rechtsaf';
    else if (turn === 'uturn') text = 'Keer om';
    else text = 'Rijd rechtdoor';

    void heading;
    return { turn, text, distance: distToNext, delta: deg, target: nextPoint };
  }

  remaining(routePoints, x, z) {
    if (!routePoints || routePoints.length < 2) return 0;
    let idx = 0;
    let bestD = Infinity;
    for (let i = 0; i < routePoints.length - 1; i++) {
      const d = pointSegDist(routePoints[i].x, routePoints[i].z, routePoints[i + 1].x, routePoints[i + 1].z, x, z);
      if (d < bestD) { bestD = d; idx = i; }
    }
    const a = routePoints[idx];
    const b = routePoints[idx + 1];
    let d = Math.hypot(b.x - x, b.z - z);
    for (let i = idx + 1; i < routePoints.length - 1; i++) {
      d += Math.hypot(routePoints[i + 1].x - routePoints[i].x, routePoints[i + 1].z - routePoints[i].z);
    }
    void a;
    return d;
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
