// The map: a pre-rendered town plan (land use, building footprints, roads,
// street names) drawn into a rotating radar for the HUD, and a pannable,
// zoomable version with tap-to-navigate for the phone.

import { WORLD, ZONES, POIS, wx, wz } from '../world/data.js';

const BASE_SCALE = 1.6; // pixels per metre in the pre-rendered plan
const VIEW_RADIUS = 145; // metres shown in the radar

export class Minimap {
  constructor(canvas, network, buildings) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.net = network;
    this.buildings = buildings || { boxes: [] };
    this.base = document.createElement('canvas');
    this.base.width = Math.ceil(WORLD.w * BASE_SCALE);
    this.base.height = Math.ceil(WORLD.h * BASE_SCALE);
    this.pad = 120;
    this.renderBase();

    // view state for the phone map
    this.zoom = 1;
    this.panX = 0;
    this.panZ = 0;
  }

  toBase(x, z) {
    return [(x + WORLD.halfW) * BASE_SCALE, (z + WORLD.halfH) * BASE_SCALE];
  }

  renderBase() {
    const c = this.base.getContext('2d');
    const W = this.base.width;
    const H = this.base.height;

    // base ground
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#2f3d2c');
    g.addColorStop(1, '#28351f');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    // soft edge so the plan does not end in a hard cut
    c.strokeStyle = 'rgba(160,180,140,0.18)';
    c.lineWidth = 8;
    c.strokeRect(4, 4, W - 8, H - 8);

    // land use
    for (const zone of ZONES) {
      const x0 = (wx(zone.x) + WORLD.halfW) * BASE_SCALE;
      const x1 = (wx(zone.x + zone.w) + WORLD.halfW) * BASE_SCALE;
      const z0 = (wz(zone.y) + WORLD.halfH) * BASE_SCALE;
      const z1 = (wz(zone.y + zone.h) + WORLD.halfH) * BASE_SCALE;
      let col = null;
      if (zone.kind === 'lake') col = '#203f4e';
      else if (zone.kind === 'dunes') col = '#6f6446';
      else if (zone.kind === 'woodland') col = '#22351f';
      else if (zone.kind === 'fields' || zone.kind === 'farm') col = '#3d4a28';
      else if (zone.kind === 'sports') col = '#33532c';
      else if (zone.kind === 'airbase') col = '#4a4a3a';
      else if (zone.kind === 'residential' || zone.kind === 'suburb') col = '#333a30';
      else if (zone.kind === 'industrial') col = '#3a3a3a';
      else if (zone.kind === 'landmark' || zone.kind === 'palace') col = '#33482f';
      if (!col) continue;
      c.fillStyle = col;
      c.fillRect(x0, z0, x1 - x0, z1 - z0);
    }

    // road casing (the pavement/sidewalk silhouette under the asphalt)
    c.lineCap = 'round';
    for (const line of this.net.lines) {
      const w = line.width + 5.0;
      c.strokeStyle = '#585a4e';
      c.lineWidth = Math.max(1.6, w * BASE_SCALE);
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
    // asphalt
    for (const line of this.net.lines) {
      c.strokeStyle = line.width > 14 ? '#4a4a46' : '#2b2f33';
      c.lineWidth = Math.max(1.2, line.width * BASE_SCALE);
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

    // building footprints
    c.fillStyle = '#9d9384';
    c.strokeStyle = 'rgba(20,24,18,0.55)';
    c.lineWidth = 0.8;
    for (const b of this.buildings.boxes) {
      const [cx, cz] = this.toBase(b.x, b.z);
      const hw = b.w * 0.5 * BASE_SCALE;
      const hd = b.d * 0.5 * BASE_SCALE;
      c.save();
      c.translate(cx, cz);
      c.rotate(-b.rotY);
      c.fillRect(-hw, -hd, hw * 2, hd * 2);
      c.strokeRect(-hw, -hd, hw * 2, hd * 2);
      c.restore();
    }

    // street names on the notable roads
    c.font = '600 9px -apple-system, system-ui, sans-serif';
    c.fillStyle = 'rgba(228,226,210,0.62)';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const named = this.net.lines
      .filter((l) => l.name && l.b - l.a > 160)
      .sort((p, q) => (q.b - q.a) - (p.b - p.a))
      .slice(0, 26);
    for (const line of named) {
      const mid = (line.a + line.b) * 0.5;
      const px = (line.axis === 'v' ? line.fixed : mid) + WORLD.halfW;
      const pz = (line.axis === 'v' ? mid : line.fixed) + WORLD.halfH;
      c.save();
      c.translate(px * BASE_SCALE, pz * BASE_SCALE);
      if (line.axis === 'v') c.rotate(Math.PI / 2);
      c.fillText(line.name, 0, 0);
      c.restore();
    }

    // points of interest
    for (const poi of POIS) {
      const [x, y] = this.toBase(poi.x, poi.z);
      c.fillStyle = poiColor(poi.kind);
      c.beginPath();
      c.arc(x, y, 4.5, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.lineWidth = 1.4;
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
    ctx.drawImage(this.base, -bx, -bz);
    ctx.restore();

    this.drawRoute(ctx, cx, cy, scale, heading, x, z, route, true);
    this.drawBlips(ctx, cx, cy, scale, heading, x, z, blips, radius);
    this.drawTarget(ctx, cx, cy, scale, heading, x, z, target, radius);

    ctx.restore();

    if (state.night) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = `rgba(8,16,34,${0.44 * state.night})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // player arrow
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

  drawRoute(ctx, cx, cy, scale, heading, x, z, route, thick) {
    if (!route || !route.points || route.points.length < 2) return;
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
    ctx.strokeStyle = 'rgba(90,171,255,0.3)';
    ctx.lineWidth = thick ? 13 : 9;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.strokeStyle = '#5aabff';
    ctx.lineWidth = thick ? 6 : 4;
    ctx.stroke();
    ctx.restore();
  }

  drawBlips(ctx, cx, cy, scale, heading, x, z, blips, radius) {
    if (!blips) return;
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

  drawTarget(ctx, cx, cy, scale, heading, x, z, target, radius) {
    if (!target) return;
    const dx = (target.x - x) * scale;
    const dz = (target.z - z) * scale;
    const r = Math.hypot(dx, dz);
    const ang = Math.atan2(dx, dz) + (heading - Math.PI) + Math.PI / 2;
    ctx.fillStyle = target.color || '#f2c230';
    if (r > radius - 14) {
      const px = cx + Math.cos(ang) * (radius - 16);
      const py = cy + Math.sin(ang) * (radius - 16);
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
      const px = cx + Math.cos(ang) * r;
      const py = cy + Math.sin(ang) * r;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0d1116';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  /**
   * The phone's full map: pannable, zoomable, with tap-to-navigate.
   * `view` is { zoom, panX, panZ } in metres of world offset from the player.
   */
  viewMetrics(canvas, view) {
    const w = canvas.width;
    const h = canvas.height;
    const zoom = view ? view.zoom : 1;
    const fit = Math.min(w / this.base.width, h / this.base.height);
    const pxPerMetre = BASE_SCALE * fit * zoom;
    return { w, h, zoom, pxPerMetre };
  }

  drawFull(canvas, state, view) {
    const ctx = canvas.getContext('2d');
    const { w, h, pxPerMetre } = this.viewMetrics(canvas, view);
    let focusX = state.x + (view ? view.panX : 0);
    let focusZ = state.z + (view ? view.panZ : 0);

    // keep the plan covering the panel instead of ending in empty green
    const halfW = w / (2 * pxPerMetre);
    const halfH = h / (2 * pxPerMetre);
    if (halfW * 2 < WORLD.w) focusX = Math.max(-WORLD.halfW + halfW, Math.min(WORLD.halfW - halfW, focusX));
    else focusX = 0;
    if (halfH * 2 < WORLD.h) focusZ = Math.max(-WORLD.halfH + halfH, Math.min(WORLD.halfH - halfH, focusZ));
    else focusZ = 0;

    const k = pxPerMetre / BASE_SCALE;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#1b241a';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(k, k);
    const [bx, bz] = this.toBase(focusX, focusZ);
    ctx.drawImage(this.base, -bx, -bz);
    ctx.restore();

    const toScreen = (x, z) => [w / 2 + (x - focusX) * pxPerMetre, h / 2 + (z - focusZ) * pxPerMetre];

    // street names, drawn at a readable size in screen space
    if (pxPerMetre > 0.25) {
      ctx.save();
      ctx.font = '600 11px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const line of this.net.lines) {
        if (!line.name || line.b - line.a < 120) continue;
        const mid = (line.a + line.b) * 0.5;
        const [sx, sy] = toScreen(
          line.axis === 'v' ? line.fixed : mid,
          line.axis === 'v' ? mid : line.fixed
        );
        if (sx < -60 || sx > w + 60 || sy < -30 || sy > h + 30) continue;
        ctx.save();
        ctx.translate(sx, sy);
        if (line.axis === 'v') ctx.rotate(Math.PI / 2);
        ctx.fillStyle = 'rgba(10,16,12,0.62)';
        const tw = ctx.measureText(line.name).width;
        ctx.fillRect(-tw / 2 - 3, -7, tw + 6, 14);
        ctx.fillStyle = 'rgba(232,232,216,0.9)';
        ctx.fillText(line.name, 0, 1);
        ctx.restore();
      }
      ctx.restore();
    }

    // landmarks
    if (pxPerMetre > 0.18) {
      ctx.save();
      ctx.font = '600 10px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      for (const poi of POIS) {
        if (!LABELLED.has(poi.kind)) continue;
        const [sx, sy] = toScreen(poi.x, poi.z);
        if (sx < -40 || sx > w + 40 || sy < -30 || sy > h + 30) continue;
        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fillStyle = poiColor(poi.kind);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        const tw = ctx.measureText(poi.name).width;
        ctx.fillStyle = 'rgba(8,14,10,0.72)';
        ctx.fillRect(sx - tw / 2 - 3, sy + 5, tw + 6, 13);
        ctx.fillStyle = '#eef4ea';
        ctx.fillText(poi.name, sx, sy + 15);
      }
      ctx.restore();
    }

    if (state.route && state.route.points.length > 1) {
      ctx.beginPath();
      for (let i = 0; i < state.route.points.length; i++) {
        const p = state.route.points[i];
        const [px, py] = toScreen(p.x, p.z);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = 'rgba(90,171,255,0.35)';
      ctx.lineWidth = 7;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.strokeStyle = '#5aabff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    if (state.target) {
      const [px, py] = toScreen(state.target.x, state.target.z);
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fillStyle = state.target.color || '#f2c230';
      ctx.fill();
      ctx.strokeStyle = '#0d1116';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (state.waypoint) {
      const [px, py] = toScreen(state.waypoint.x, state.waypoint.z);
      ctx.save();
      ctx.translate(px, py);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-6, -14);
      ctx.lineTo(6, -14);
      ctx.closePath();
      ctx.fillStyle = '#ff5b4a';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -17, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const [px, py] = toScreen(state.x, state.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-state.heading + Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6.5, 7);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-6.5, 7);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.restore();

    // a north marker so the map is readable
    ctx.save();
    ctx.font = '700 15px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(w - 26, 26, 14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,16,22,0.7)';
    ctx.fill();
    ctx.fillStyle = '#f5c445';
    ctx.fillText('N', w - 26, 31);
    ctx.restore();

    return { pxPerMetre, focusX, focusZ };
  }

  /** Canvas point -> world point, for tap-to-navigate. */
  canvasToWorld(canvas, px, py, state, view) {
    const { w, h, pxPerMetre } = this.viewMetrics(canvas, view);
    const focusX = state.x + (view ? view.panX : 0);
    const focusZ = state.z + (view ? view.panZ : 0);
    return {
      x: focusX + (px - w / 2) / pxPerMetre,
      z: focusZ + (py - h / 2) / pxPerMetre
    };
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


/** Landmarks that get a written label on the phone map. */
const LABELLED = new Set([
  'church', 'palace', 'watertower', 'station', 'market',
  'cinema', 'hospital', 'nature', 'sport'
]);
