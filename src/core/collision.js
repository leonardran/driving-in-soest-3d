// Circle-vs-box collision with a uniform spatial grid, so thousands of
// buildings can be queried in constant time.

import { clamp } from './util.js';

export class CollisionWorld {
  constructor(cellSize = 22) {
    this.cell = cellSize;
    this.cells = new Map();
    this.count = 0;
    this.bounds = { minX: -2000, maxX: 2000, minZ: -2000, maxZ: 2000 };
  }

  setBounds(minX, maxX, minZ, maxZ) {
    this.bounds = { minX, maxX, minZ, maxZ };
  }

  addBox(x, z, w, d, rotY = 0) {
    const box = { x, z, hw: w * 0.5, hd: d * 0.5, rotY, cos: Math.cos(rotY), sin: Math.sin(rotY) };
    const r = Math.hypot(box.hw, box.hd) + 1;
    const c = this.cell;
    const x0 = Math.floor((x - r) / c);
    const x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c);
    const z1 = Math.floor((z + r) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = cx + ',' + cz;
        let list = this.cells.get(k);
        if (!list) {
          list = [];
          this.cells.set(k, list);
        }
        list.push(box);
      }
    }
    this.count++;
    return box;
  }

  addBuildings(list) {
    for (const b of list) this.addBox(b.x, b.z, b.w, b.d, b.rotY);
  }

  /** Push a circle out of every static box it overlaps. */
  resolve(x, z, radius) {
    const c = this.cell;
    const cx = Math.floor(x / c);
    const cz = Math.floor(z / c);
    let px = x;
    let pz = z;
    let hit = false;
    let nX = 0;
    let nZ = 0;
    let deepest = 0;

    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      for (let iz = cz - 1; iz <= cz + 1; iz++) {
        const list = this.cells.get(ix + ',' + iz);
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const box = list[i];
          const dxw = px - box.x;
          const dzw = pz - box.z;
          const lx = dxw * box.cos - dzw * box.sin;
          const lz = dxw * box.sin + dzw * box.cos;
          const clx = clamp(lx, -box.hw, box.hw);
          const clz = clamp(lz, -box.hd, box.hd);
          let dx = lx - clx;
          let dz = lz - clz;
          let d2 = dx * dx + dz * dz;
          if (d2 > radius * radius) continue;

          let nlx;
          let nlz;
          let pen;
          if (d2 < 1e-6) {
            // centre inside the box: escape along the closest side
            const ox = box.hw - Math.abs(lx);
            const oz = box.hd - Math.abs(lz);
            if (ox < oz) {
              nlx = Math.sign(lx) || 1;
              nlz = 0;
              pen = ox + radius;
            } else {
              nlx = 0;
              nlz = Math.sign(lz) || 1;
              pen = oz + radius;
            }
          } else {
            const d = Math.sqrt(d2);
            nlx = dx / d;
            nlz = dz / d;
            pen = radius - d;
          }
          if (pen <= 0) continue;

          // normal back to world
          const nx = nlx * box.cos + nlz * box.sin;
          const nz = -nlx * box.sin + nlz * box.cos;
          px += nx * pen;
          pz += nz * pen;
          hit = true;
          if (pen > deepest) {
            deepest = pen;
            nX = nx;
            nZ = nz;
          }
        }
      }
    }

    if (!hit) return null;
    return { x: px, z: pz, nx: nX, nz: nZ, depth: deepest };
  }

  /** Is this point free? Used for spawn searches. */
  isFree(x, z, radius) {
    return this.resolve(x, z, radius) === null;
  }
}
