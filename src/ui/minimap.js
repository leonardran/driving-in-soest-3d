// The map: a live-drawn town plan in the rotating radar for the HUD, and a
// pre-rendered, pannable version with tap-to-navigate for the phone.
//
// The radar is drawn from the vector data every frame and culled to what is
// actually on screen, so it stays sharp at any scale without baking the town
// into a large canvas. The phone's plan is baked once, at a resolution its
// widest zoom can actually use.

import { WORLD, ZONES, POIS, wx, wz } from '../world/data.js';

const BASE_SCALE = 0.8; // pixels per metre in the phone's pre-rendered plan
const VIEW_RADIUS = 118; // metres shown in the radar

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

    // pre-computed bounds so the radar can cull cheaply
    this.zones = ZONES.map((zone) => ({
      kind: zone.kind,
      x0: wx(zone.x),
      x1: wx(zone.x + zone.w),
      z0: wz(zone.y),
      z1: wz(zone.y + zone.h)
    }));
    this.roads = this.net.lines.map((line) => ({
      axis: line.axis,
      fixed: line.fixed,
      a: line.a,
      b: line.b,
      width: line.width,
      name: line.name,
      widthMain: line.width > 14
    }));
    this.boxes = (this.buildings.boxes || []).map((b) => ({
      x: b.x, z: b.z, w: b.w, d: b.d, rotY: b.rotY, r: Math.hypot(b.w, b.d) * 0.5
    }));

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

    // base ground, in the pale paper tones of a navigation map
    c.fillStyle = '#f1eee8';
    c.fillRect(0, 0, W, H);
    // soft edge so the plan does not end in a hard cut
    c.strokeStyle = 'rgba(180,178,170,0.35)';
    c.lineWidth = 8;
    c.strokeRect(4, 4, W - 8, H - 8);

    // land use
    for (const zone of ZONES) {
      const x0 = (wx(zone.x) + WORLD.halfW) * BASE_SCALE;
      const x1 = (wx(zone.x + zone.w) + WORLD.halfW) * BASE_SCALE;
      const z0 = (wz(zone.y) + WORLD.halfH) * BASE_SCALE;
      const z1 = (wz(zone.y + zone.h) + WORLD.halfH) * BASE_SCALE;
      let col = null;
      if (zone.kind === 'lake') col = '#a5d0f2';
      else if (zone.kind === 'dunes') col = '#f0e8d2';
      else if (zone.kind === 'woodland') col = '#c7e5c2';
      else if (zone.kind === 'fields' || zone.kind === 'farm') col = '#e6efd7';
      else if (zone.kind === 'sports') col = '#cfe9c7';
      else if (zone.kind === 'airbase') col = '#e4e2da';
      else if (zone.kind === 'residential' || zone.kind === 'suburb') col = '#f4f1eb';
      else if (zone.kind === 'industrial') col = '#e8e6e1';
      else if (zone.kind === 'landmark' || zone.kind === 'palace') col = '#dcebd4';
      if (!col) continue;
      c.fillStyle = col;
      c.fillRect(x0, z0, x1 - x0, z1 - z0);
    }

    // road casing: a soft grey edge under the white carriageway
    c.lineCap = 'round';
    for (const line of this.net.lines) {
      const w = line.width + 5.0;
      c.strokeStyle = '#dcd9d2';
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
    // white carriageway, the arterials warm yellow like a navigation map
    for (const line of this.net.lines) {
      c.strokeStyle = line.width > 14 ? '#fbd873' : '#ffffff';
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
    c.fillStyle = '#e2ded6';
    c.strokeStyle = '#d3cfc6';
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

    // street names are drawn live by the phone map, at a readable size; baking
    // them into the plan only put 3-pixel smudges on the radar
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

    ctx.fillStyle = '#e9e6e0';
    ctx.fillRect(0, 0, w, h);

    const scale = radius / VIEW_RADIUS;

    this.drawRadarBase(ctx, cx, cy, scale, heading, x, z, radius);

    this.drawRoute(ctx, cx, cy, scale, heading, x, z, route, true, state.progress);
    this.drawBlips(ctx, cx, cy, scale, heading, x, z, blips, radius);
    this.drawTarget(ctx, cx, cy, scale, heading, x, z, target, radius);
    this.drawNextTurn(ctx, cx, cy, scale, heading, x, z, state.nextTurn, radius);

    ctx.restore();

    if (state.night) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = `rgba(18,28,46,${0.34 * state.night})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // player marker: the navigation arrow, white ring around it so it reads on
    // the pale map
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(12, 13);
    ctx.lineTo(0, 7);
    ctx.lineTo(-12, 13);
    ctx.closePath();
    ctx.fillStyle = '#1a73e8';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.4;
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.fill();
    ctx.restore();

    return radius;
  }

  /**
   * The radar's town plan, drawn from the vector data instead of a baked image:
   * land use, building footprints and roads, culled to the circle and drawn in
   * the pale palette of a navigation map. Being vector, it stays sharp however
   * far you zoom.
   */
  drawRadarBase(ctx, cx, cy, scale, heading, x, z, radius) {
    const reach = VIEW_RADIUS + 20;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(heading - Math.PI);
    ctx.scale(scale, scale);

    // land use
    for (const zone of this.zones) {
      const col = zoneColour(zone.kind);
      if (!col) continue;
      if (zone.x1 < x - reach || zone.x0 > x + reach) continue;
      if (zone.z1 < z - reach || zone.z0 > z + reach) continue;
      ctx.fillStyle = col;
      const rx = Math.min(zone.x0, zone.x1);
      const rz = Math.min(zone.z0, zone.z1);
      ctx.fillRect(rx - x, rz - z, Math.abs(zone.x1 - zone.x0), Math.abs(zone.z1 - zone.z0));
    }

    // building footprints
    ctx.fillStyle = '#e2ded6';
    ctx.strokeStyle = '#d3cfc6';
    for (const b of this.boxes) {
      if (Math.abs(b.x - x) > reach + b.r || Math.abs(b.z - z) > reach + b.r) continue;
      const hw = b.w * 0.5;
      const hd = b.d * 0.5;
      ctx.save();
      ctx.translate(b.x - x, b.z - z);
      ctx.rotate(-b.rotY);
      ctx.fillRect(-hw, -hd, hw * 2, hd * 2);
      ctx.strokeRect(-hw, -hd, hw * 2, hd * 2);
      ctx.restore();
    }

    // roads: a grey casing, then the white carriageway
    ctx.lineCap = 'round';
    const drawRoads = (colour, extra, mainColour) => {
      for (const line of this.roads) {
        const a = line.axis === 'v' ? line.a : line.fixed;
        const b = line.axis === 'v' ? line.b : line.fixed;
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        // cull along the road's own axis
        const fixed = line.fixed;
        if (line.axis === 'v') {
          if (Math.abs(fixed - x) > reach + line.width) continue;
          if (hi < z - reach || lo > z + reach) continue;
        } else {
          if (Math.abs(fixed - z) > reach + line.width) continue;
          if (hi < x - reach || lo > x + reach) continue;
        }
        ctx.strokeStyle = line.widthMain && mainColour ? mainColour : colour;
        ctx.lineWidth = line.width + extra;
        ctx.beginPath();
        if (line.axis === 'v') {
          ctx.moveTo(fixed - x, lo - z);
          ctx.lineTo(fixed - x, hi - z);
        } else {
          ctx.moveTo(lo - x, fixed - z);
          ctx.lineTo(hi - x, fixed - z);
        }
        ctx.stroke();
      }
    };
    drawRoads('#c9c5bc', 4.6, null);
    drawRoads('#ffffff', 0, '#fbd873');

    ctx.restore();
  }

  /**
   * The route, drawn in two tones: the stretch up to the next junction bright,
   * the rest of the way dim. Reading "where do I turn" off the minimap is what
   * the bright section is for.
   */
  drawRoute(ctx, cx, cy, scale, heading, x, z, route, thick, progress) {
    if (!route || !route.points || route.points.length < 2) return;
    const split = progress && progress.idx >= 0 ? progress.idx + 2 : route.points.length;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(heading - Math.PI);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const trace = (from, to) => {
      ctx.beginPath();
      for (let i = from; i < Math.min(to, route.points.length); i++) {
        const p = route.points[i];
        const px = (p.x - x) * scale;
        const pz = (p.z - z) * scale;
        if (i === from) ctx.moveTo(px, pz);
        else ctx.lineTo(px, pz);
      }
    };

    // the rest of the route, in a lighter blue
    trace(split, route.points.length);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = thick ? 17 : 12;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(26,115,232,0.45)';
    ctx.lineWidth = thick ? 11 : 8;
    ctx.stroke();

    // the leg you are on: the solid blue of a navigation route
    trace(0, split);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = thick ? 20 : 15;
    ctx.stroke();
    ctx.strokeStyle = '#1a73e8';
    ctx.lineWidth = thick ? 13 : 9;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * A small badge at the next junction with the turn glyph. The glyph stays
   * upright: the minimap is heading-up and the card uses the same arrow, so a
   * rotated arrow would disagree with it and read wrong once the car turns.
   */
  drawNextTurn(ctx, cx, cy, scale, heading, x, z, nextTurn, radius) {
    if (!nextTurn) return;
    const dx = (nextTurn.x - x) * scale;
    const dz = (nextTurn.z - z) * scale;
    const r = Math.hypot(dx, dz);
    const ang = Math.atan2(dx, dz) + (heading - Math.PI) + Math.PI / 2;
    const reach = Math.min(r, radius - 20);
    const px = cx + Math.cos(ang) * reach;
    const py = cy + Math.sin(ang) * reach;
    ctx.save();
    ctx.translate(px, py);
    ctx.beginPath();
    ctx.arc(0, 0, 19, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,64,70,0.28)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.font = '700 23px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1a73e8';
    ctx.fillText(nextTurn.glyph || '↑', 0, 2);
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
    if (r > radius - 18) {
      const px = cx + Math.cos(ang) * (radius - 20);
      const py = cy + Math.sin(ang) * (radius - 20);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ang + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(9, 8);
      ctx.lineTo(-9, 8);
      ctx.closePath();
      ctx.fillStyle = '#ea4335';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.4;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else {
      drawPin(ctx, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, '#ea4335', 1.5);
    }
  }

  /**
   * The phone's full map: pannable, zoomable, with tap-to-navigate.
   * `view` is { zoom, panX, panZ } in metres of world offset from the player.
   */
  /**
   * Screen scale of the phone map: pixels per metre, from the world size rather
   * than the baked plan's resolution, so changing how finely the plan is
   * rendered never changes how big the map draws.
   */
  viewMetrics(canvas, view) {
    const w = canvas.width;
    const h = canvas.height;
    const zoom = view ? view.zoom : 1;
    const fit = Math.min(w / WORLD.w, h / WORLD.h);
    const pxPerMetre = fit * zoom;
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
    ctx.fillStyle = '#e9e6e0';
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
      ctx.lineJoin = 'round';
      for (const line of this.net.lines) {
        if (!line.name || line.b - line.a < 120) continue;
        const mid = (line.a + line.b) * 0.5;
        const [sx, sy] = toScreen(
          line.axis === 'v' ? line.fixed : mid,
          line.axis === 'v' ? mid : line.fixed
        );
        if (sx < -60 || sx > w + 60 || sy < -30 || sy > h + 30) continue;
        // keep the label inside the panel: near an edge, slide it inwards
        const tw = ctx.measureText(line.name).width;
        ctx.save();
        ctx.translate(sx, sy);
        if (line.axis === 'v') {
          if (sy - tw * 0.5 < 10 || sy + tw * 0.5 > h - 10) { ctx.restore(); continue; }
          ctx.rotate(Math.PI / 2);
        } else if (tw < w - 16) {
          const half = tw * 0.5;
          if (sx - half < 8) ctx.translate(8 + half - sx, 0);
          else if (sx + half > w - 8) ctx.translate(w - 8 - half - sx, 0);
        } else {
          ctx.restore();
          continue;
        }
        // white halo, then grey type: how a navigation map sets street names
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 3.4;
        ctx.strokeText(line.name, 0, 1);
        ctx.fillStyle = '#5f6368';
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
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 3.2;
        ctx.strokeText(poi.name, sx, sy + 15);
        ctx.fillStyle = '#3c4043';
        ctx.fillText(poi.name, sx, sy + 15);
        void tw;
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
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 12;
      ctx.stroke();
      ctx.strokeStyle = '#1a73e8';
      ctx.lineWidth = 7;
      ctx.stroke();
    }

    if (state.target) {
      const [px, py] = toScreen(state.target.x, state.target.z);
      drawPin(ctx, px, py, state.target.color || '#ea4335', 1.35);
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
    ctx.moveTo(0, -10);
    ctx.lineTo(7, 7.5);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 7.5);
    ctx.closePath();
    ctx.fillStyle = '#1a73e8';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.4;
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 5;
    ctx.stroke();
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

/** A map pin: round head over a point, the way a navigation map marks a stop. */
function drawPin(ctx, x, y, colour, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-7, -9, -8.5, -13, -8.5, -16);
  ctx.arc(0, -16, 8.5, Math.PI, 0);
  ctx.bezierCurveTo(8.5, -13, 7, -9, 0, 0);
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.6;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -16, 3.2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fill();
  ctx.restore();
}

/** Land-use fill for the pale navigation palette, or null to leave it plain. */
function zoneColour(kind) {
  switch (kind) {
    case 'lake': return '#a5d0f2';
    case 'dunes': return '#f0e8d2';
    case 'woodland': return '#c7e5c2';
    case 'fields':
    case 'farm': return '#e6efd7';
    case 'sports': return '#cfe9c7';
    case 'airbase': return '#e4e2da';
    case 'residential':
    case 'suburb': return '#f4f1eb';
    case 'industrial': return '#e8e6e1';
    case 'landmark':
    case 'palace': return '#dcebd4';
    default: return null;
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
