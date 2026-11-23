// EuroClix advertising: roadside billboards along the town's streets.
//
// The poster is drawn once into a canvas — the logo plus a slogan — and shared
// by every board, so the whole campaign is two draw calls. Boards are lit at
// night, like real illuminated hoardings.

import * as THREE from 'three';
import { makeRng } from '../core/util.js';

const LOGO_URL = 'src/assets/euroclix.svg';

const SLOGANS = [
  ['Elke rit levert punten op', 'euroclix.nl'],
  ['Spaar mee in Soest', 'euroclix.nl/soest'],
  ['Geld terug op je boodschappen', 'euroclix.nl'],
  ['Punten voor je volgende tank', 'euroclix.nl']
];

/** Poster artwork: cream board, the logo, a slogan and the URL. */
function posterTexture() {
  const W = 1024;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');

  const paint = () => {
    ctx.fillStyle = '#f7f4ec';
    ctx.fillRect(0, 0, W, H);
    // orange band down the left, like the logo's own accent
    ctx.fillStyle = '#e25d04';
    ctx.fillRect(0, 0, 26, H);
    ctx.fillStyle = '#0a0e80';
    ctx.fillRect(0, H - 14, W, 14);
  };
  paint();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const img = new Image();
  img.onload = () => {
    paint();
    // the logo lockup, on its blue field
    const lw = W * 0.62;
    const lh = (lw * 66) / 217;
    const lx = (W - lw) * 0.5;
    const ly = 58;
    ctx.drawImage(img, lx, ly, lw, lh);
    const slogan = SLOGANS[Math.floor(Math.random() * SLOGANS.length)];
    ctx.fillStyle = '#14181d';
    ctx.textAlign = 'center';
    ctx.font = '700 62px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
    ctx.fillText(slogan[0], W * 0.5, ly + lh + 96);
    ctx.fillStyle = '#e25d04';
    ctx.font = '800 54px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
    ctx.fillText(slogan[1], W * 0.5, ly + lh + 168);
    tex.needsUpdate = true;
  };
  img.onerror = () => {
    // no logo file: the board still reads as an advert
    ctx.fillStyle = '#e25d04';
    ctx.textAlign = 'center';
    ctx.font = '800 120px -apple-system, system-ui, sans-serif';
    ctx.fillText('euroclix', W * 0.5, H * 0.46);
    ctx.fillStyle = '#14181d';
    ctx.font = '700 54px -apple-system, system-ui, sans-serif';
    ctx.fillText('Spaar mee in Soest', W * 0.5, H * 0.66);
    tex.needsUpdate = true;
  };
  img.src = LOGO_URL;

  return tex;
}

/**
 * True when (x, z) is clear of every building footprint. Boards are set back
 * off the kerb, which puts them in the front gardens — without this check one
 * lands inside a house now and then.
 */
function clearOfBuildings(boxes, x, z, pad = 4.5) {
  if (!boxes) return true;
  for (const b of boxes) {
    const dx = x - b.x;
    const dz = z - b.z;
    if (Math.abs(dx) > 26 || Math.abs(dz) > 26) continue;
    const r = Math.hypot(b.w, b.d) * 0.5;
    if (dx * dx + dz * dz < (r + pad) * (r + pad)) return false;
  }
  return true;
}

export function buildAds(network, collision, buildings) {
  const rng = makeRng(5150);
  const group = new THREE.Group();
  group.name = 'ads';

  const spots = [];
  // a board roughly every 120 m of the busier streets, set back off the kerb
  for (const edge of network.edges) {
    if (edge.len < 50 || edge.width > 15) continue;
    const steps = Math.floor(edge.len / 120);
    for (let i = 0; i < Math.max(1, steps); i++) {
      if (!rng.chance(0.55)) continue;
      const s = 30 + i * 120 + rng.range(0, 40);
      if (s > edge.len - 20) continue;
      const side = rng.chance(0.5) ? 1 : -1;
      // far enough off the kerb to clear the pavement, then onto the verge
      const off = edge.width * 0.5 + rng.range(4.4, 6.4);
      const x = edge.ax + edge.dx * s + edge.dz * off * side;
      const z = edge.az + edge.dz * s - edge.dx * off * side;
      if (!clearOfBuildings(buildings, x, z)) continue;
      // the poster's +Z faces the road
      const nx = edge.dz * side;
      const nz = -edge.dx * side;
      spots.push({ x, z, rot: Math.atan2(-nx, -nz), big: rng.chance(0.3) });
      if (spots.length >= 90) break;
    }
    if (spots.length >= 90) break;
  }

  if (!spots.length) return { group, update() {} };

  const tex = posterTexture();
  const posterMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: true });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.7, metalness: 0.35 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a5158, roughness: 0.6, metalness: 0.5 });

  // panel geometry is a unit box, so each board can be a different size
  const panelGeo = new THREE.BoxGeometry(1, 1, 1);
  const posterGeo = new THREE.PlaneGeometry(1, 1);
  const poleGeo = new THREE.BoxGeometry(1, 1, 1);

  const bigCount = spots.filter((s) => s.big).length;
  const smallCount = spots.length - bigCount;
  const panels = new THREE.InstancedMesh(panelGeo, frameMat, spots.length);
  const posters = new THREE.InstancedMesh(posterGeo, posterMat, spots.length);
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, Math.max(1, spots.length * 2));
  panels.frustumCulled = false;
  posters.frustumCulled = false;
  poles.frustumCulled = false;

  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const P = new THREE.Vector3();
  const S = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  let poleUsed = 0;
  for (let i = 0; i < spots.length; i++) {
    const sp = spots[i];
    const w = sp.big ? 9.5 : 6.2;
    const h = sp.big ? 4.4 : 2.9;
    const base = sp.big ? 5.2 : 2.5;
    const cy = base + h * 0.5;
    Q.setFromAxisAngle(UP, sp.rot);

    // panel
    M.compose(P.set(sp.x, cy, sp.z), Q, S.set(w, h, 0.28));
    panels.setMatrixAt(i, M);

    // the printed face, a hair proud of the panel
    const fx = Math.sin(sp.rot);
    const fz = Math.cos(sp.rot);
    M.compose(
      P.set(sp.x + fx * 0.16, cy, sp.z + fz * 0.16),
      Q,
      S.set(w * 0.97, h * 0.95, 1)
    );
    posters.setMatrixAt(i, M);

    // two legs
    for (const s of [-1, 1]) {
      if (poleUsed >= poles.count) break;
      const lx = sp.x + Math.cos(sp.rot) * s * (w * 0.33);
      const lz = sp.z - Math.sin(sp.rot) * s * (w * 0.33);
      M.compose(P.set(lx, base * 0.5, lz), Q, S.set(0.24, base, 0.24));
      poles.setMatrixAt(poleUsed++, M);
    }

    if (collision) collision.addBox(sp.x, sp.z, w + 0.6, 0.8, sp.rot);
  }
  for (let i = poleUsed; i < poles.count; i++) {
    M.compose(P.set(0, -50, 0), Q, S.set(0.01, 0.01, 0.01));
    poles.setMatrixAt(i, M);
  }

  panels.instanceMatrix.needsUpdate = true;
  posters.instanceMatrix.needsUpdate = true;
  poles.instanceMatrix.needsUpdate = true;
  group.add(panels, posters, poles);

  return {
    group,
    count: spots.length,
    /** Illuminated boards get brighter as the light goes. */
    update(night) {
      const k = 0.82 + night * 0.5;
      posterMat.color.setScalar(k);
    }
  };
}
