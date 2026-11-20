// The named buildings that make Soest recognisable: the old church, the
// windmill, the water tower, Paleis Soestdijk, the stations and the shops.

import * as THREE from 'three';
import { GeomBuilder, vcMaterial } from '../core/geom.js';
import { ANCHORS } from './data.js';
import { signTexture } from './textures.js';

const BRICK = '#8e4a38';
const BRICK_DARK = '#6f3a2c';
const PLASTER = '#e6e0d2';
const SLATE = '#4a4f55';
const COPPER = '#4f8c74';
const WOOD = '#7a5637';
const WHITE = '#f2efe6';

function bx(b, x, y, z, w, h, d, color, ry) {
  b.box(x, y + h * 0.5, z, w, h, d, color, ry ? { ry } : undefined);
}

function signMesh(text, opts = {}) {
  const tex = signTexture(text, opts);
  const w = opts.w || 7;
  const h = opts.h || 1.8;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: !!opts.transparent });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(opts.x || 0, opts.y || 0, opts.z || 0);
  if (opts.ry) mesh.rotation.y = opts.ry;
  return mesh;
}

export function buildLandmarks() {
  const group = new THREE.Group();
  group.name = 'landmarks';
  const mat = vcMaterial({ roughness: 0.86 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x2b3742,
    roughness: 0.18,
    metalness: 0.6
  });
  const animators = [];

  const add = (builder, opts = {}) => {
    const mesh = new THREE.Mesh(builder.build(), opts.material || mat);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
    return mesh;
  };

  // --- Oude Kerk ---------------------------------------------------------
  {
    const b = new GeomBuilder();
    const x = ANCHORS.church.x;
    const z = ANCHORS.church.z;
    bx(b, x, 0, z, 22, 11, 14, BRICK);
    b.roof(x, 11, z, 14, 8, 23, SLATE, { ry: Math.PI / 2 });
    // tower
    bx(b, x - 9, 0, z + 7, 7.4, 27, 7.4, BRICK_DARK);
    bx(b, x - 9, 27, z + 7, 8.6, 1.1, 8.6, PLASTER);
    b.cone(x - 9, 28.1, z + 7, 4.2, 11, 4, COPPER);
    bx(b, x - 9, 39, z + 7, 0.3, 2.2, 0.3, '#d9c27a');
    // clock faces
    bx(b, x - 9, 22, z + 10.8, 3.4, 3.4, 0.24, '#f0ead6');
    bx(b, x - 5.2, 22, z + 7, 0.24, 3.4, 3.4, '#f0ead6');
    // side aisle
    bx(b, x + 13, 0, z, 8, 7, 12, BRICK_DARK);
    b.roof(x + 13, 7, z, 12, 5, 8.6, SLATE, { ry: Math.PI / 2 });
    // entrance
    bx(b, x + 1, 0, z + 7.6, 5, 5.4, 1.6, WOOD);
    bx(b, x + 1, 5.4, z + 7.8, 5.6, 0.6, 1.4, PLASTER);
    // graveyard wall + trees handled by the city
    add(b);
  }

  // --- Molen De Windhond -------------------------------------------------
  {
    const x = ANCHORS.windmill.x;
    const z = ANCHORS.windmill.z;
    const b = new GeomBuilder();
    b.cylinder(x, 5.4, z, 4.6, 10.8, 8, BRICK, { rTop: 3.4 });
    b.cylinder(x, 11.6, z, 3.6, 1.6, 8, '#3b3128');
    b.cone(x, 12.4, z, 3.5, 3.0, 8, SLATE);
    // balcony
    b.cylinder(x, 9.6, z, 5.0, 0.4, 8, '#4a3a2a', { cap: false });
    // door + windows
    bx(b, x, 0, z + 4.0, 1.8, 2.6, 0.5, WOOD);
    bx(b, x + 2.6, 5.0, z + 2.6, 0.8, 1.4, 0.4, '#d8cfae');
    bx(b, x - 2.6, 5.0, z + 2.6, 0.8, 1.4, 0.4, '#d8cfae');
    add(b);

    // rotating sails, built around the hub at the origin so they spin in place
    const sails = new THREE.Group();
    const sailB = new GeomBuilder();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      for (let k = 0; k < 5; k++) {
        const r0 = 2.4 + k * 2.4;
        const r1 = r0 + 2.1;
        const cx = dx * (r0 + r1) * 0.5;
        const cy = dy * (r0 + r1) * 0.5;
        const w = Math.abs(dx) * 1.15 + 0.18;
        sailB.box(cx, cy, 0, w, 2.0, 0.14, '#c9bfa6');
        sailB.box(cx, cy - 1.02, 0, w, 0.16, 0.2, WOOD);
      }
      sailB.box(dx * 9.6, dy * 9.6, 0, Math.abs(dx) * 19.2 + 0.26, Math.abs(dy) * 19.2 + 0.26, 0.26, WOOD);
    }
    const sailMesh = new THREE.Mesh(sailB.build(), mat);
    sailMesh.position.set(x, 13.1, z + 4.6);
    group.add(sailMesh);
    animators.push((t) => {
      sailMesh.rotation.z = t * 0.5;
    });
  }

  // --- Watertoren --------------------------------------------------------
  {
    const x = ANCHORS.waterTower.x;
    const z = ANCHORS.waterTower.z;
    const b = new GeomBuilder();
    b.cylinder(x, 13, z, 5.6, 26, 10, '#b8b2a2', { rTop: 4.4 });
    b.cylinder(x, 27.5, z, 7.6, 9, 10, '#a8a294', { rTop: 7.0 });
    b.cylinder(x, 32.2, z, 7.8, 0.9, 10, '#8f8a7c');
    b.cone(x, 33, z, 7.6, 4.4, 10, SLATE);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      bx(b, x + Math.cos(a) * 2.6, 28.5, z + Math.sin(a) * 2.6, 1.4, 2.2, 0.4, '#3d444b', -a + Math.PI / 2);
    }
    bx(b, x, 0, z + 4.4, 2.2, 3.2, 0.8, WOOD);
    add(b);
  }

  // --- Paleis Soestdijk ---------------------------------------------------
  {
    const x = ANCHORS.palace.x;
    const z = ANCHORS.palace.z;
    const b = new GeomBuilder();
    bx(b, x, 0, z, 40, 13, 17, PLASTER);
    bx(b, x, 13, z, 41, 0.9, 18, '#d8d2c2');
    b.roof(x, 13.9, z, 18.6, 5.4, 41, SLATE, { ry: Math.PI / 2 });
    // pediment
    b.roof(x, 13.9, z + 8.9, 4, 3.4, 20, '#efe9db', { ry: Math.PI / 2 });
    // wings
    for (const s of [-1, 1]) {
      bx(b, x + s * 25, 0, z + 2, 14, 10, 14, '#e2dccd');
      b.roof(x + s * 25, 10, z + 2, 15, 3.6, 14.6, SLATE, { ry: Math.PI / 2 });
    }
    // portico columns
    for (let i = 0; i < 6; i++) {
      const cx = x - 8 + i * 3.2;
      b.cylinder(cx, 3.6, z + 9.6, 0.55, 7.2, 8, WHITE);
    }
    bx(b, x, 7.2, z + 9.6, 18, 1.0, 3.4, WHITE);
    b.roof(x, 8.2, z + 9.6, 3.6, 2.6, 18.6, WHITE, { ry: Math.PI / 2 });
    // windows (dark glass)
    for (let i = 0; i < 8; i++) {
      bx(b, x - 15 + i * 4.3, 2.4, z + 8.6, 2.0, 4.2, 0.3, '#33506b');
      bx(b, x - 15 + i * 4.3, 10.2, z + 8.6, 2.0, 2.6, 0.3, '#33506b');
    }
    // garden gate
    bx(b, x, 0, z + 34, 24, 0.5, 0.6, '#8b8577');
    for (let i = 0; i < 7; i++) {
      bx(b, x - 12 + i * 4, 0, z + 34, 0.7, 4.2, 0.7, '#c8c2b2');
    }
    add(b);
    group.add(signMesh('PALEIS SOESTDIJK', { x, y: 6.5, z: z + 40, w: 14, h: 2.4, bg: '#1d2a33', fg: '#e8dcc0' }));
  }

  // --- stations ----------------------------------------------------------
  const station = (ax, az, name, ry) => {
    const b = new GeomBuilder();
    bx(b, ax, 0, az, 20, 5.4, 9, '#c9b8a0');
    b.roof(ax, 5.4, az, 10, 3.2, 21, '#5d4b3c', { ry: Math.PI / 2 });
    bx(b, ax, 0, az + 5.6, 24, 0.35, 4.5, '#8e8c86');
    for (let i = 0; i < 5; i++) {
      b.cylinder(ax - 10 + i * 5, 2.4, az + 7.4, 0.13, 4.8, 6, '#3f4750');
    }
    bx(b, ax, 4.8, az + 7.4, 24, 0.3, 5.2, '#3f4750');
    bx(b, ax, 2.0, az + 5.4, 16, 2.4, 0.2, '#33475a');
    add(b);
    const s = signMesh(name, { x: ax, y: 4.2, z: az + 4.6, w: 11, h: 1.6, bg: '#0f3f7a', fg: '#ffffff' });
    if (ry) s.rotation.y = ry;
    group.add(s);
  };
  station(ANCHORS.stationZuid.x, ANCHORS.stationZuid.z, 'STATION SOEST-ZUID');
  station(ANCHORS.stationOost.x, ANCHORS.stationOost.z, 'STATION SOEST-OOST');

  // --- shop blocks with signs --------------------------------------------
  const block = (x, z, w, h, d, color, label, signColor, signFg) => {
    const b = new GeomBuilder();
    bx(b, x, 0, z, w, h, d, color);
    bx(b, x, 0, z + d * 0.5, w * 0.86, Math.min(3.4, h * 0.5), 0.3, '#2f4657');
    bx(b, x, h, z, w + 0.6, 0.4, d + 0.6, '#8b8578');
    add(b);
    if (label) {
      group.add(signMesh(label, {
        x,
        y: Math.min(h - 1.1, 4.6),
        z: z + d * 0.5 + 0.25,
        w: Math.min(w * 0.8, 14),
        h: 1.9,
        bg: signColor || '#151a20',
        fg: signFg || '#ffffff'
      }));
    }
  };

  block(-500, -604, 42, 7, 24, '#d8d2c2', 'WINKELCENTRUM SOEST', '#123a2e', '#f4e9c8');
  block(-146, -600, 22, 9, 18, '#c9c3b4', 'CINEMA SOEST', '#20242c', '#ffd45e');
  block(-38, -600, 18, 6.5, 14, '#efe9da', 'BURGER QUEEN', '#7a1f2b', '#ffe9b8');
  block(320, -600, 26, 15, 18, '#e2dccc', 'VAN DER VALK', '#1d3b58', '#e9f2ff');
  block(-540, 452, 26, 11, 20, '#3a3346', 'CASINO SOEST', '#2a1b3a', '#ffcf6b');
  block(-344, -352, 24, 8, 16, '#cfd3d6', 'CARWASH SOEST', '#1c4f6b', '#dff2ff');
  block(-203, 252, 22, 7.5, 16, '#b8b3a6', 'GARAGE SOEST', '#2c2a26', '#f3d27a');
  block(-1090, -524, 20, 8, 15, '#dfe3e6', 'POLITIE', '#12336b', '#ffffff');
  block(-500, 172, 24, 8, 16, '#b7412f', 'BRANDWEER', '#7d1a12', '#ffe6c8');
  block(-356, -490, 34, 16, 22, '#e8e6df', 'ZIEKENHUIS SOEST', '#1f6b62', '#eafaf4');
  block(170, 150, 20, 8, 16, '#c9bfa8', 'BIBLIOTHEEK', '#243b4f', '#ffeed2');

  // --- sportpark stand ---------------------------------------------------
  {
    const b = new GeomBuilder();
    const x = -30;
    const z = 330;
    for (let i = 0; i < 8; i++) {
      bx(b, x - 12 + i * 3.4, 0, z, 3.0, 0.7 + i * 0.35, 4, i % 2 ? '#3f6b8c' : '#c8ccc9');
    }
    bx(b, x, 3.4, z - 2.2, 28, 0.3, 0.4, '#8e8f8a');
    add(b);
  }

  // --- kinderboerderij ---------------------------------------------------
  {
    const b = new GeomBuilder();
    const x = -370;
    const z = -430;
    bx(b, x, 0, z, 16, 5, 10, '#7b5233');
    b.roof(x, 5, z, 10.6, 4.2, 16.6, '#5a3d28', { ry: Math.PI / 2 });
    bx(b, x + 12, 0, z + 4, 5, 3, 5, '#8a6140');
    b.roof(x + 12, 3, z + 4, 5.2, 2.4, 5.2, '#4a3524', { ry: Math.PI / 2 });
    add(b);
    group.add(signMesh('KINDERBOERDERIJ', { x, y: 6.4, z: z + 5.4, w: 8, h: 1.4, bg: '#2b3b28', fg: '#dff0c8' }));
  }

  // --- billboards along the A28 -----------------------------------------
  {
    const b = new GeomBuilder();
    for (const [px, pz] of [[-260, 60], [120, 60], [-460, 60]]) {
      b.box(px, 4, pz, 0.3, 8, 0.3, '#4a4f55');
      b.box(px, 8.6, pz, 7.5, 4, 0.2, '#e8e4d8');
    }
    add(b);
  }

  void glassMat;

  return {
    group,
    update(elapsed) {
      for (const fn of animators) fn(elapsed);
    }
  };
}
