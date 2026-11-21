// Instanced buildings. One draw call per archetype, with a custom shader that
// draws windows procedurally and lights them up at night.

import * as THREE from 'three';
import { GeomBuilder } from '../core/geom.js';
import { makeRng, clamp } from '../core/util.js';
import { zoneAtMap, isBuildableZone, mx, mz } from './data.js';

export function createBuildingMaterial() {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0.4, 0.85, 0.3) },
    uSunColor: { value: new THREE.Color(0xffffff) },
    uSkyColor: { value: new THREE.Color(0x9fc4e8) },
    uGroundColor: { value: new THREE.Color(0x4a4438) },
    uWindowLight: { value: new THREE.Color(0xffd9a0) },
    uFogColor: { value: new THREE.Color(0xbcd4e6) },
    uAmbient: { value: 0.75 },
    uNight: { value: 0 },
    uFogDensity: { value: 0.0018 }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float aPart;
      attribute float aRand;

      varying vec3 vNrm;
      varying vec3 vScaled;
      varying vec3 vTint;
      varying float vPart;
      varying float vRand;
      varying float vDepth;

      void main() {
        vPart = aPart;
        vRand = aRand;
        vTint = vec3(1.0);

        mat4 model = modelMatrix;
        vec3 shaped = position;
        #ifdef USE_INSTANCING
          model = modelMatrix * instanceMatrix;
          shaped = mat3(instanceMatrix) * position;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vTint = instanceColor;
        #endif

        vScaled = shaped;
        vec4 world = model * vec4(position, 1.0);
        vNrm = normalize(mat3(model) * normal);
        vec4 mv = viewMatrix * world;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSkyColor;
      uniform vec3 uGroundColor;
      uniform vec3 uWindowLight;
      uniform vec3 uFogColor;
      uniform float uAmbient;
      uniform float uNight;
      uniform float uFogDensity;

      varying vec3 vNrm;
      varying vec3 vScaled;
      varying vec3 vTint;
      varying float vPart;
      varying float vRand;
      varying float vDepth;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
        vec3 N = normalize(vNrm);
        vec3 base;
        float glass = 0.0;
        vec2 winCell = vec2(0.0);

        if (vPart > 0.5) {
          float n = hash(floor(vScaled.xz * 1.6) + vRand * 7.0);
          base = mix(vec3(0.17, 0.062, 0.043), vec3(0.135, 0.135, 0.125), vRand) * (0.82 + n * 0.4);
        } else {
          float grain = hash(floor(vScaled.zy * 1.3) + floor(vScaled.xy * 1.3) + vRand);
          base = vTint * (0.9 + 0.16 * grain);

          float horiz = abs(N.x) > abs(N.z) ? vScaled.z : vScaled.x;
          vec2 g = vec2(horiz, vScaled.y) / vec2(2.95, 3.35);
          vec2 f = fract(g);
          vec2 fw = fwidth(g) + 0.0005;

          float wx = smoothstep(0.19 - fw.x, 0.19 + fw.x, f.x) * (1.0 - smoothstep(0.81 - fw.x, 0.81 + fw.x, f.x));
          float wy = smoothstep(0.27 - fw.y, 0.27 + fw.y, f.y) * (1.0 - smoothstep(0.83 - fw.y, 0.83 + fw.y, f.y));
          glass = wx * wy;
          winCell = floor(g);

          // ground floor: shop fronts on some buildings
          if (winCell.y < 0.5 && vRand > 0.62) {
            float sx = smoothstep(0.05 - fw.x, 0.05 + fw.x, f.x) * (1.0 - smoothstep(0.95 - fw.x, 0.95 + fw.x, f.x));
            float sy = smoothstep(0.08 - fw.y, 0.08 + fw.y, f.y) * (1.0 - smoothstep(0.88 - fw.y, 0.88 + fw.y, f.y));
            glass = sx * sy;
          }
        }

        // simple two-light model
        float diff = max(dot(N, uSunDir), 0.0);
        vec3 amb = mix(uGroundColor, uSkyColor, N.y * 0.5 + 0.5) * uAmbient;
        vec3 col = base * (amb + uSunColor * diff);

        // ground contact darkening
        float ao = 1.0 - smoothstep(0.0, 2.4, vScaled.y) * 0.28;
        col *= ao;

        if (glass > 0.001) {
          float h = hash(winCell + vRand * 19.3);
          float lit = step(0.48, h);
          vec3 winDay = mix(vec3(0.028, 0.038, 0.05), uSkyColor * 0.2, 0.55);
          vec3 winNight = uWindowLight * (0.45 + h * 0.85);
          vec3 winC = mix(winDay, winNight, uNight * lit);
          vec3 winLitOnly = winNight * (uNight * lit);
          col = mix(col, winC * (0.75 + uNight * 0.9), glass);
          col += winLitOnly * glass * 0.85;
        }

        float fogF = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
        col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });

  return { material, uniforms };
}

// --- unit geometries (1 x 1 x 1 footprint, y from 0 to 1) -----------------

function boxWalls(builder, top, insetX = 0, insetZ = 0) {
  const hw = 0.5 - insetX;
  const hd = 0.5 - insetZ;
  builder.setPart(0);
  builder.quad([-hw, 0, hd], [hw, 0, hd], [hw, top, hd], [-hw, top, hd], [1, 1, 1]);
  builder.quad([hw, 0, -hd], [-hw, 0, -hd], [-hw, top, -hd], [hw, top, -hd], [1, 1, 1]);
  builder.quad([hw, 0, hd], [hw, 0, -hd], [hw, top, -hd], [hw, top, hd], [1, 1, 1]);
  builder.quad([-hw, 0, -hd], [-hw, 0, hd], [-hw, top, hd], [-hw, top, -hd], [1, 1, 1]);
}

function makeHouseGeom() {
  const b = new GeomBuilder({ withParts: true });
  boxWalls(b, 0.7);
  b.setPart(1);
  b.roof(0, 0.7, 0, 1.02, 0.3, 1.04, [1, 1, 1], { ry: Math.PI / 2 });
  // chimney
  b.box(0.3, 0.86, -0.18, 0.075, 0.2, 0.075, [1, 1, 1]);
  return b.build();
}

function makeVillaGeom() {
  const b = new GeomBuilder({ withParts: true });
  boxWalls(b, 0.62);
  b.setPart(1);
  b.roof(0, 0.62, 0, 1.06, 0.38, 1.08, [1, 1, 1], { ry: Math.PI / 2 });
  b.box(-0.3, 0.84, 0.2, 0.07, 0.22, 0.07, [1, 1, 1]);
  return b.build();
}

function makeBlockGeom() {
  const b = new GeomBuilder({ withParts: true });
  boxWalls(b, 0.975);
  b.setPart(1);
  b.plane(0, 0.976, 0, 1.0, 1.0, [1, 1, 1]);
  // parapet
  b.setPart(0);
  b.box(0, 1.0, 0, 1.03, 0.05, 1.03, [1, 1, 1], { skip: 'top bottom' });
  return b.build();
}

function makeShedGeom() {
  const b = new GeomBuilder({ withParts: true });
  boxWalls(b, 0.9);
  b.setPart(1);
  b.roof(0, 0.9, 0, 1.04, 0.1, 1.06, [1, 1, 1], { ry: Math.PI / 2 });
  return b.build();
}

const HOUSE_COLORS = [
  '#8d4a3a', '#a05844', '#7a3d30', '#b9a48c', '#d6cfc0', '#9c8f7d',
  '#5f6b70', '#7d8a7a', '#c2b6a1', '#8a6b52', '#6d4238', '#a8815f'
];
const BLOCK_COLORS = ['#b3aca0', '#9aa0a4', '#c8c2b6', '#8e9296', '#aab0aa', '#c0b4a2'];
const SHED_COLORS = ['#8f9298', '#6f7378', '#a8a49a', '#7d8580', '#9c9a90'];

export function buildBuildings(network, material) {
  const rng = makeRng(20240117);
  const buckets = { house: [], villa: [], block: [], shed: [] };
  const hedges = [];

  const archetypeFor = (zone, r) => {
    if (zone && (zone.kind === 'industrial' || zone.kind === 'sports')) return 'shed';
    if (zone && (zone.kind === 'mall' || zone.kind === 'casino' || zone.kind === 'cinema' ||
                 zone.kind === 'hotel' || zone.kind === 'station' || zone.kind === 'fastfood' ||
                 zone.kind === 'carwash' || zone.kind === 'school')) return 'block';
    if (!zone) return r() < 0.62 ? 'house' : 'villa';
    if (zone.kind === 'suburb' || zone.kind === 'residential') return r() < 0.55 ? 'house' : 'villa';
    if (zone.kind === 'landmark') return 'house';
    return r() < 0.45 ? 'house' : 'block';
  };

  const SIDEWALK = 2.4;

  for (const edge of network.edges) {
    if (edge.width > 15) continue; // no frontage along the motorway
    const na = network.nodes[edge.a];
    const nb = network.nodes[edge.b];
    const insetA = na.cross * 0.5 + 4;
    const insetB = nb.cross * 0.5 + 4;
    const usable = edge.len - insetA - insetB;
    if (usable < 8) continue;

    for (const side of [1, -1]) {
      const nx = edge.dz * side;
      const nz = -edge.dx * side;
      let t = rng.range(0.5, 2.5);
      while (t < usable - 4) {
        const probeX = edge.ax + edge.dx * (insetA + t) + nx * (edge.width * 0.5 + SIDEWALK);
        const probeZ = edge.az + edge.dz * (insetA + t) + nz * (edge.width * 0.5 + SIDEWALK);
        const zone = zoneAtMap(mx(probeX), mz(probeZ));
        const buildHere = zone ? isBuildableZone(zone) : rng.chance(0.62);
        if (!buildHere) {
          t += rng.range(10, 30);
          continue;
        }

        const arch = archetypeFor(zone, rng);
        let w; let d; let h; let garden;
        if (arch === 'house') {
          w = rng.range(6.2, 10); d = rng.range(8, 11); h = rng.range(5.8, 8.6); garden = rng.range(0.5, 1.8);
        } else if (arch === 'villa') {
          w = rng.range(9, 14.5); d = rng.range(8, 12); h = rng.range(5.4, 7.8); garden = rng.range(2.2, 5);
        } else if (arch === 'block') {
          w = rng.range(14, 26); d = rng.range(12, 20); h = rng.range(9, 24); garden = rng.range(0.4, 2.5);
        } else {
          w = rng.range(16, 34); d = rng.range(12, 26); h = rng.range(5, 9.5); garden = rng.range(3, 8);
        }

        if (t + w > usable - 1) break;

        const offset = edge.width * 0.5 + SIDEWALK + garden + d * 0.5;
        const mid = insetA + t + w * 0.5;
        const px = edge.ax + edge.dx * mid + nx * offset;
        const pz = edge.az + edge.dz * mid + nz * offset;
        const rotY = Math.atan2(-nx, -nz);

        const palette = arch === 'house' || arch === 'villa' ? HOUSE_COLORS : arch === 'block' ? BLOCK_COLORS : SHED_COLORS;
        const color = rng.pick(palette);

        buckets[arch].push({
          x: px, z: pz, rotY,
          w: w * rng.range(0.96, 1.04),
          h,
          d,
          color,
          rand: rng()
        });

        // a low hedge or fence along the front garden
        if ((arch === 'house' || arch === 'villa') && rng.chance(0.62)) {
          const hedgeOff = edge.width * 0.5 + SIDEWALK + Math.max(0.5, garden * 0.5);
          hedges.push({
            x: edge.ax + edge.dx * mid + nx * hedgeOff,
            z: edge.az + edge.dz * mid + nz * hedgeOff,
            len: Math.max(3, w * rng.range(0.8, 1.05)),
            rotY: Math.atan2(edge.dx, edge.dz),
            h: rng.range(0.7, 1.5),
            tint: rng()
          });
        }

        t += w + rng.range(arch === 'villa' ? 1.5 : 0.35, arch === 'villa' ? 6 : 2.4);
      }
    }
  }

  const group = new THREE.Group();
  group.name = 'buildings';

  const boxes = [];
  for (const key of Object.keys(buckets)) {
    for (const b of buckets[key]) {
      boxes.push({ x: b.x, z: b.z, w: b.w, d: b.d, rotY: b.rotY, h: b.h });
    }
  }

  const geoms = {
    house: makeHouseGeom(),
    villa: makeVillaGeom(),
    block: makeBlockGeom(),
    shed: makeShedGeom()
  };

  const meshes = {};
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();

  for (const key of Object.keys(buckets)) {
    const list = buckets[key];
    if (!list.length) continue;
    const geom = geoms[key];
    const rand = new Float32Array(list.length);
    const mesh = new THREE.InstancedMesh(geom, material, list.length);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      pos.set(b.x, 0, b.z);
      quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rotY);
      scl.set(b.w, b.h, b.d);
      matrix.compose(pos, quat, scl);
      mesh.setMatrixAt(i, matrix);
      col.set(b.color);
      mesh.setColorAt(i, col);
      rand[i] = b.rand;
    }
    geom.setAttribute('aRand', new THREE.InstancedBufferAttribute(rand, 1));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    meshes[key] = mesh;
  }

  const total = Object.values(buckets).reduce((n, l) => n + l.length, 0);
  return { group, meshes, total, boxes, hedges };
}
