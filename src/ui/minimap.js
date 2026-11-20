// The radar-style minimap: a pre-rendered town map drawn rotated around the
// player, GTA style.

import { WORLD, ZONES, POIS, wx, wz } from '../world/data.js';

const BASE_SCALE = 1.6; // pixels per metre in the pre-rendered map
const VIEW_RADIUS = 145; // metres visible in the radar

export class Minimap {
  constructor(canvas, network) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.net = network;
    this.base = document.createElement('canvas');
    this.baseScale = BASE_SCALE;
    this.base.width = Math.ceil(WORLD.w * BASE_SCALE);
    this.base.height = Math.ceil(WORLD.h * BASE_SCALE);
    this.renderBase();
  }

  toBase(x, z) {
    return [
      (x + WORLD.halfW) * BASE_SCALE,
      (z + WORLD.halfH) * BASE_SCALE
    ];
  }

  renderBase() {
    const c = this.base.getContext('2d');
    const W = this.base.width;
    const H = this.base.height;
    c.fillStyle = '#22331f';
    c.fillRect(0, 0, W, H);

    // land use
    for (const zone of ZONES) {
      const x0 = (wx(zone.x) + WORLD.halfW) * BASE_SCALE;
      const x1 = (wx(zone.x + zone.w) + WORLD.halfW) * BASE_SCALE;
      const z0 = (wz(zone.y) + WORLD.halfH) * BASE_SCALE;
      const z1 = (wz(zone.y + zone.h) + WORLD.halfH) * BASE_SCALE;
      let col = null;
      if (zone.kind === 'lake') col = '#1e3f4d';
      else if (zone.kind === 'dunes') col = '#7d6f4e';
      else if (zone.kind === 'woodland') col = '#1b2b18';
      else if (zone.kind === 'fields' || zone.kind === 'farm') col = '#3b4423';
      else if (zone.kind === 'sports') col = '#32502a';
      else if (zone.kind === 'airbase') col = '#4a4a38';
      if (col) {
        c.fillStyle = col;
        c.fillRect(x0, z0, x1 - x0, z1 - z0);
      }
    }

    // pavements first (wider, lighter), then asphalt
    c.lineCap = 'butt';
    for (const pass of [0, 1]) {
      for (const line of this.net.lines) {
        const w = pass === 0 ? line.width + 5.6 : line.width;
        c.strokeStyle = pass === 0 ? '#4d4f45' : '#2e3236';
        c.lineWidth = Math.max(1.4, w * BASE_SCALE);
        c.beginPath();
        if (line.axis === 'v') {
          const bx = (line.fixed + WORLD.halfW) * BASE_SCALE;
          c.moveTo(bx, (line.a + WORLD.halfH) * BASE_SCALE);
          c.lineTo(bx, (line.b + WORLD.halfH) * BASE_SCALE);
        } else {
          const bz = (line.fixed + WORLD.halfH) * BASE_SCALE;
          c.moveTo((line.a + WORLD.halfW) * BASE_SCALE, bz);
          c.lineTo((line.b + WORLD.halfW) * BASE_SCALE, bz);
        }
        c.stroke();
      }
    }

    // points of interest
    for (const poi of POIS) {
      const [x, y] = this.toBase(poi.x, poi.z);
      c.fillStyle = poiColor(poi.kind);
      c.beginPath();
      c.arc(x, y, 5, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.45)';
      c.lineWidth = 1.5;
      c.stroke();
    }
  }

  draw(state) {
    const { x, z, heading, route, target, blips } = state;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = w / 2 - 4;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#1b2a1a';
    ctx.fillRect(0, 0, w, h);

    const scale = radius / VIEW_RADIUS;
    const k = scale / BASE_SCALE;
    const [bx, bz] = this.toBase(x, z);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(heading - Math.PI);
    ctx.scale(k, k);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.base, -bx, -bz);
    ctx.restore();

    // --- route -----------------------------------------------------------
    if (route && route.points && route.points.length > 1) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(heading - Math.PI);
      ctx.beginPath();
      for (let i = 0; i < route.points.length; i++) {
        const p = route.points[i];
        const px = (p.x - x) * scale;
        const pz = (p.z - z) * scale;
        if (i === 0) ctx.moveTo(px, pz);
        else ctx.lineTo(px, pz);
      }
      ctx.strokeStyle = 'rgba(90,170,255,0.35)';
      ctx.lineWidth = 13;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.strokeStyle = '#5aabff';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.restore();
    }

    // --- traffic blips ---------------------------------------------------
    if (blips) {
      for (const b of blips) {
        const dx = (b.x - x) * scale;
        const dz = (b.z - z) * scale;
        const r = Math.hypot(dx, dz);
        if (r > radius - 6) continue;
        const ang = Math.atan2(dx, dz) + (heading - Math.PI) + Math.PI / 2;
        const px = cx + Math.cos(ang) * r;
        const py = cy + Math.sin(ang) * r;
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(px, py, b.size || 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- target marker ---------------------------------------------------
    if (target) {
      const dx = (target.x - x) * scale;
      const dz = (target.z - z) * scale;
      let r = Math.hypot(dx, dz);
      let px;
      let py;
      if (r > radius - 14) {
        const ang = Math.atan2(dx, dz) + (heading - Math.PI) + Math.PI / 2;
        r = radius - 16;
        px = cx + Math.cos(ang) * r;
        py = cy + Math.sin(ang) * r;
        ctx.fillStyle = target.color || '#f2c230';
        // arrow pointing outward
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(7, 6);
        ctx.lineTo(-7, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        const ang = Math.atan2(dx, dz) + (heading - Math.PI) + Math.PI / 2;
        px = cx + Math.cos(ang) * r;
        py = cy + Math.sin(ang) * r;
        ctx.fillStyle = target.color || '#f2c230';
        ctx.beginPath();
        ctx.arc(px, py, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0d1116';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    ctx.restore();

    // --- night tint -------------------------------------------------------
    if (state.night) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = `rgba(10,18,38,${0.42 * state.night})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // --- player arrow ----------------------------------------------------
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(8.5, 9);
    ctx.lineTo(0, 4.5);
    ctx.lineTo(-8.5, 9);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.restore();

    return radius;
  }
}

function poiColor(kind) {
  switch (kind) {
    case 'church': return '#e9d9a8';
    case 'palace': return '#f0e2b4';
    case 'station': return '#4f8fd0';
    case 'shop': return '#d9a83c';
    case 'fastfood': return '#e07a3a';
    case 'cinema': return '#b174d6';
    case 'hotel': return '#6fb3c9';
    case 'casino': return '#d05f8f';
    case 'fuel': return '#7fc07f';
    case 'police': return '#5a7fe0';
    case 'fire': return '#e05a4a';
    case 'hospital': return '#e8e8e8';
    case 'nature': return '#8fae6a';
    case 'park': return '#5e8a4a';
    case 'sport': return '#7fc06a';
    case 'farm': return '#a8a05a';
    case 'watertower': return '#9fb8c9';
    case 'garage': return '#c9a06a';
    case 'road': return '#8a8f96';
    case 'market': return '#e0b050';
    default: return '#c8c8c8';
  }
}
