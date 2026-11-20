// Turns the Soest street data into a proper road graph in world metres:
// nodes at every crossing, edges between them, plus everything the renderer,
// the router and the traffic AI need.

import {
  WORLD,
  ROAD_X, ROAD_Z, GRID_X_NAMES, GRID_Z_NAMES,
  LOCAL_ROADS, roadSpan, wx, wz, mx, mz
} from './data.js';
import { clamp } from '../core/util.js';

const MAIN_V = new Set([825, 2550]);
const MAIN_H = new Set([1070]);

function widthFor(axis, fixed, a, b, name) {
  const span = Math.abs(b - a);
  if (name && name.indexOf('A28') === 0) return 17.6; // motorway
  if (name && name.indexOf('Eemrand-Oost') === 0) return 9.0;
  if ((axis === 'v' && MAIN_V.has(fixed)) || (axis === 'h' && MAIN_H.has(fixed))) return 12.4;
  if (span > 520) return 10.2;
  if (span > 260) return 9.0;
  return 7.6;
}

export function buildNetwork() {
  /** @type {Array<{axis:'v'|'h',fixed:number,a:number,b:number,width:number,name:string,main:boolean}>} */
  const lines = [];
  const seen = new Set();

  const push = (line) => {
    const key = line.axis + '|' + Math.round(line.fixed);
    const existing = seen.has(key);
    // A grid line already covers this position; prefer the longer span + its name.
    if (existing) {
      const prev = key === null ? null : lines.find((l) => l.axis === line.axis && Math.abs(l.fixed - line.fixed) < 0.01);
      if (prev) {
        if (line.a < prev.a) prev.a = line.a;
        if (line.b > prev.b) prev.b = line.b;
        if (line.name && !prev.name) prev.name = line.name;
        prev.width = Math.max(prev.width, line.width);
      }
      return;
    }
    seen.add(key);
    lines.push(line);
  };

  // Grid roads (north-south).
  ROAD_X.forEach((mX, i) => {
    const [s, e] = roadSpan('v', i);
    const a = wz(clamp(s, WORLD.minZ, WORLD.maxZ));
    const b = wz(clamp(e, WORLD.minZ, WORLD.maxZ));
    if (b - a < 30) return;
    const fixed = wx(mX);
    const name = GRID_X_NAMES[i] || 'Straat';
    push({ axis: 'v', fixed, a, b, width: widthFor('v', mX, a, b, name), name, main: MAIN_V.has(mX), isGrid: true });
  });

  // Grid roads (east-west).
  ROAD_Z.forEach((mZ, i) => {
    const [s, e] = roadSpan('h', i);
    const a = wx(clamp(s, WORLD.minX, WORLD.maxX));
    const b = wx(clamp(e, WORLD.minX, WORLD.maxX));
    if (b - a < 30) return;
    const fixed = wz(mZ);
    const name = GRID_Z_NAMES[i] || 'Straat';
    push({ axis: 'h', fixed, a, b, width: widthFor('h', mZ, a, b, name), name, main: MAIN_H.has(mZ), isGrid: true });
  });

  // Local streets.
  for (const r of LOCAL_ROADS) {
    if (r.axis === 'v' && (r.fixed < WORLD.minX || r.fixed > WORLD.maxX)) continue;
    if (r.axis === 'h' && (r.fixed < WORLD.minZ || r.fixed > WORLD.maxZ)) continue;
    let a = r.axis === 'v' ? wz(clamp(r.start, WORLD.minZ, WORLD.maxZ)) : wx(clamp(r.start, WORLD.minX, WORLD.maxX));
    let b = r.axis === 'v' ? wz(clamp(r.end, WORLD.minZ, WORLD.maxZ)) : wx(clamp(r.end, WORLD.minX, WORLD.maxX));
    if (Math.abs(b - a) < 20) continue;
    if (a > b) { const t = a; a = b; b = t; }
    const fixed = r.axis === 'v' ? wx(r.fixed) : wz(r.fixed);
    push({ axis: r.axis, fixed, a, b, width: widthFor(r.axis, r.fixed, a, b, r.name), name: r.name, main: false, isGrid: false });
  }

  // --- snap dangling local ends onto the nearest crossing street ----------
  const verts = lines.filter((l) => l.axis === 'v');
  const hors = lines.filter((l) => l.axis === 'h');
  const SNAP = 42;

  for (const line of lines) {
    if (line.isGrid) continue;
    const pool = line.axis === 'v' ? hors : verts;
    let bestA = null;
    let bestB = null;
    for (const other of pool) {
      if (line.fixed < other.a - 1 || line.fixed > other.b + 1) continue;
      const d = other.fixed;
      if (d <= line.a && d > line.a - SNAP && (bestA === null || d > bestA)) bestA = d;
      if (d >= line.b && d < line.b + SNAP && (bestB === null || d < bestB)) bestB = d;
    }
    if (bestA !== null) line.a = bestA;
    if (bestB !== null) line.b = bestB;
  }

  // --- crossings ----------------------------------------------------------
  for (const line of lines) {
    line.cuts = [];
    const pool = line.axis === 'v' ? hors : verts;
    for (const other of pool) {
      if (line.axis === 'v') {
        if (line.fixed >= other.a && line.fixed <= other.b && other.fixed >= line.a && other.fixed <= line.b) {
          line.cuts.push(other.fixed);
        }
      } else if (other.fixed >= line.a && other.fixed <= line.b && line.fixed >= other.a && line.fixed <= other.b) {
        line.cuts.push(other.fixed);
      }
    }
    line.cuts.sort((p, q) => p - q);
  }

  // --- nodes & edges ------------------------------------------------------
  const nodeMap = new Map();
  const nodes = [];
  const edges = [];

  function nodeAt(x, z) {
    const key = Math.round(x * 10) + ',' + Math.round(z * 10);
    let n = nodeMap.get(key);
    if (!n) {
      n = { id: nodes.length, x, z, edges: [], cross: 0 };
      nodeMap.set(key, n);
      nodes.push(n);
    }
    return n;
  }

  for (const line of lines) {
    const marks = [line.a, ...line.cuts.filter((c) => c > line.a + 0.4 && c < line.b - 0.4), line.b];
    const pts = [];
    for (const t of marks) {
      if (pts.length && Math.abs(t - pts[pts.length - 1]) < 0.4) continue;
      pts.push(t);
    }
    line.nodeCoords = pts.slice();
    for (let i = 0; i < pts.length - 1; i++) {
      const t0 = pts[i];
      const t1 = pts[i + 1];
      const len = t1 - t0;
      if (len < 0.6) continue;
      const ax = line.axis === 'v' ? line.fixed : t0;
      const az = line.axis === 'v' ? t0 : line.fixed;
      const bx = line.axis === 'v' ? line.fixed : t1;
      const bz = line.axis === 'v' ? t1 : line.fixed;
      const na = nodeAt(ax, az);
      const nb = nodeAt(bx, bz);
      const e = {
        id: edges.length,
        a: na.id,
        b: nb.id,
        ax, az, bx, bz,
        len,
        dx: (bx - ax) / len,
        dz: (bz - az) / len,
        width: line.width,
        name: line.name,
        line
      };
      edges.push(e);
      na.edges.push(e.id);
      nb.edges.push(e.id);
      na.cross = Math.max(na.cross, line.width);
      nb.cross = Math.max(nb.cross, line.width);
    }
  }

  // Nodes also record the widest *crossing* road so sidewalks can be inset.
  for (const line of lines) {
    for (const t of line.nodeCoords) {
      const n = nodeAt(line.axis === 'v' ? line.fixed : t, line.axis === 'v' ? t : line.fixed);
      n.cross = Math.max(n.cross, line.width);
    }
  }

  // Drop graphs that never cross anything (stray stubs).
  const used = new Set();
  for (const e of edges) {
    if (nodes[e.a].edges.length || nodes[e.b].edges.length) used.add(e.id);
  }

  return {
    lines,
    nodes,
    edges,
    verts,
    hors,
    nodeAt,
    /** nearest edge to a world point */
    nearestEdge(x, z, filter) {
      let best = null;
      let bestD = Infinity;
      for (const e of edges) {
        if (filter && !filter(e)) continue;
        const d = pointSegDistSq(x, z, e.ax, e.az, e.bx, e.bz);
        if (d < bestD) { bestD = d; best = e; }
      }
      return { edge: best, dist: Math.sqrt(bestD) };
    },
    nearestNode(x, z) {
      let best = null;
      let bestD = Infinity;
      for (const n of nodes) {
        const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
        if (d < bestD) { bestD = d; best = n; }
      }
      return best;
    }
  };
}

export function pointSegDistSq(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const wx2 = px - ax;
  const wz2 = pz - az;
  const l2 = vx * vx + vz * vz;
  let t = l2 > 0 ? (wx2 * vx + wz2 * vz) / l2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + vx * t - px;
  const cz = az + vz * t - pz;
  return cx * cx + cz * cz;
}

/** Closest point on an edge, plus how far along it we are. */
export function projectOnEdge(edge, x, z) {
  const vx = edge.bx - edge.ax;
  const vz = edge.bz - edge.az;
  const l2 = vx * vx + vz * vz || 1;
  let t = ((x - edge.ax) * vx + (z - edge.az) * vz) / l2;
  t = clamp(t, 0, 1);
  return { x: edge.ax + vx * t, z: edge.az + vz * t, t };
}
