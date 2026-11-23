// A tiny geometry builder: piles boxes, prisms, quads and cylinders into one
// BufferGeometry with baked vertex colours. Everything in the city is made
// this way, which keeps the draw-call count very low.

import * as THREE from 'three';
import { lin } from './util.js';

const tmpN = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

export class GeomBuilder {
  constructor(opts = {}) {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.uv = [];
    this.part = opts.withParts ? [] : null;
    this.partValue = 0;
    this._xform = null;
    this._stack = [];
  }

  /** Run a callback with an extra local transform applied to everything inside. */
  within(x, y, z, ry = 0, fn) {
    const prev = this._xform;
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
    this._xform = prev ? prev.clone().multiply(m) : m;
    try {
      fn();
    } finally {
      this._xform = prev;
    }
    return this;
  }

  setPart(v) {
    this.partValue = v;
    return this;
  }

  _pushVertex(x, y, z, nx, ny, nz, c, u, v) {
    if (this._xform) {
      tmpV.set(x, y, z).applyMatrix4(this._xform);
      x = tmpV.x;
      y = tmpV.y;
      z = tmpV.z;
      tmpN.set(nx, ny, nz).transformDirection(this._xform);
      nx = tmpN.x;
      ny = tmpN.y;
      nz = tmpN.z;
    }
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.col.push(c[0], c[1], c[2]);
    if (this.uv) this.uv.push(u, v);
    if (this.part) this.part.push(this.partValue);
  }

  _tri(a, b, c, na, nb, nc, col, ua, ub, uc) {
    this._pushVertex(a[0], a[1], a[2], na[0], na[1], na[2], col, ua ? ua[0] : 0, ua ? ua[1] : 0);
    this._pushVertex(b[0], b[1], b[2], nb[0], nb[1], nb[2], col, ub ? ub[0] : 0, ub ? ub[1] : 0);
    this._pushVertex(c[0], c[1], c[2], nc[0], nc[1], nc[2], col, uc ? uc[0] : 0, uc ? uc[1] : 0);
  }

  /** Flat quad from four corners in order (counter-clockwise when seen from the front). */
  quad(a, b, c, d, col, uvs) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = d[0] - a[0];
    const vy = d[1] - a[1];
    const vz = d[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const n = [nx, ny, nz];
    const q = uvs || [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1]
    ];
    this._tri(a, b, c, n, n, n, col, q[0], q[1], q[2]);
    this._tri(a, c, d, n, n, n, col, q[0], q[2], q[3]);
    return this;
  }

  /** Axis aligned (optionally Y-rotated) box, centred on cx/cy/cz. */
  box(cx, cy, cz, sx, sy, sz, hex, opts = {}) {
    const col = Array.isArray(hex) ? hex : lin(hex);
    const hw = sx * 0.5;
    const hh = sy * 0.5;
    const hd = sz * 0.5;
    const ry = opts.ry || 0;
    const skip = opts.skip || '';
    const cos = Math.cos(ry);
    const sin = Math.sin(ry);
    const P = (x, y, z) => {
      const rx = x * cos + z * sin;
      const rz = -x * sin + z * cos;
      return [cx + rx, cy + y, cz + rz];
    };
    const top = col === null ? null : opts.top || col;
    const sides = opts.sides || col;
    if (!skip.includes('front'))
      this.quad(P(-hw, -hh, hd), P(hw, -hh, hd), P(hw, hh, hd), P(-hw, hh, hd), sides);
    if (!skip.includes('back'))
      this.quad(P(hw, -hh, -hd), P(-hw, -hh, -hd), P(-hw, hh, -hd), P(hw, hh, -hd), sides);
    if (!skip.includes('right'))
      this.quad(P(hw, -hh, hd), P(hw, -hh, -hd), P(hw, hh, -hd), P(hw, hh, hd), sides);
    if (!skip.includes('left'))
      this.quad(P(-hw, -hh, -hd), P(-hw, -hh, hd), P(-hw, hh, hd), P(-hw, hh, -hd), sides);
    if (!skip.includes('top') && top) this.quad(P(-hw, hh, hd), P(hw, hh, hd), P(hw, hh, -hd), P(-hw, hh, -hd), top);
    if (!skip.includes('bottom'))
      this.quad(P(-hw, -hh, -hd), P(hw, -hh, -hd), P(hw, -hh, hd), P(-hw, -hh, hd), opts.bottom || sides);
    return this;
  }

  /** Triangular prism (a pitched roof) running along Z. */
  roof(cx, cy, cz, sx, sy, sz, hex, opts = {}) {
    const col = Array.isArray(hex) ? hex : lin(hex);
    const hw = sx * 0.5;
    const hd = sz * 0.5;
    const ry = opts.ry || 0;
    const cos = Math.cos(ry);
    const sin = Math.sin(ry);
    const P = (x, y, z) => [cx + x * cos + z * sin, cy + y, cz + -x * sin + z * cos];
    const a = P(-hw, 0, hd);
    const b = P(hw, 0, hd);
    const c = P(0, sy, hd);
    const d = P(-hw, 0, -hd);
    const e = P(hw, 0, -hd);
    const f = P(0, sy, -hd);
    this.quad(a, b, c, c, col); // front gable
    this.quad(e, d, f, f, col); // back gable
    this.quad(b, e, f, c, col); // right slope
    this.quad(d, a, c, f, col); // left slope
    return this;
  }

  cylinder(cx, cy, cz, radius, height, segments, hex, opts = {}) {
    const col = Array.isArray(hex) ? hex : lin(hex);
    const rTop = opts.rTop != null ? opts.rTop : radius;
    const y0 = cy - height * 0.5;
    const y1 = cy + height * 0.5;
    const cap = opts.cap !== false;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const x0 = Math.cos(a0);
      const z0 = Math.sin(a0);
      const x1 = Math.cos(a1);
      const z1 = Math.sin(a1);
      const p0 = [cx + x0 * radius, y0, cz + z0 * radius];
      const p1 = [cx + x1 * radius, y0, cz + z1 * radius];
      const p2 = [cx + x1 * rTop, y1, cz + z1 * rTop];
      const p3 = [cx + x0 * rTop, y1, cz + z0 * rTop];
      this.quad(p0, p1, p2, p3, col);
      if (cap && rTop > 0.001) {
        this._tri(
          [cx, y1, cz],
          p3,
          p2,
          [0, 1, 0],
          [0, 1, 0],
          [0, 1, 0],
          opts.top || col
        );
      }
    }
    return this;
  }

  cone(cx, cy, cz, radius, height, segments, hex) {
    const col = Array.isArray(hex) ? hex : lin(hex);
    const y0 = cy;
    const y1 = cy + height;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * radius, y0, cz + Math.sin(a0) * radius];
      const p1 = [cx + Math.cos(a1) * radius, y0, cz + Math.sin(a1) * radius];
      this._tri(p0, p1, [cx, y1, cz], [0, 0.6, 0], [0, 0.6, 0], [0, 1, 0], col);
    }
    return this;
  }

  /** A flat quad lying on the XZ plane, handy for decals and road paint. */
  plane(cx, y, cz, sx, sz, hex, ry = 0) {
    const col = Array.isArray(hex) ? hex : lin(hex);
    const cos = Math.cos(ry);
    const sin = Math.sin(ry);
    const P = (x, z) => [cx + x * cos + z * sin, y, cz + -x * sin + z * cos];
    this.quad(P(-sx / 2, -sz / 2), P(-sx / 2, sz / 2), P(sx / 2, sz / 2), P(sx / 2, -sz / 2), col);
    return this;
  }

  get vertexCount() {
    return this.pos.length / 3;
  }

  build(opts = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.part) g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    if (opts.center) g.center();
    return g;
  }
}

/** Convenience: build a mesh from a builder callback. */
export function meshFrom(fn, material, opts) {
  const b = new GeomBuilder(opts);
  fn(b);
  const m = new THREE.Mesh(b.build(opts), material);
  m.matrixAutoUpdate = false;
  m.updateMatrix();
  return m;
}

/** Vertex-coloured standard material used by most props. */
export function vcMaterial(params = {}) {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.02,
    envMapIntensity: 0.45,
    ...params
  });
}
