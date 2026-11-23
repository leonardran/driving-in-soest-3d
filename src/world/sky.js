// Sky, sun, moon, stars and the day/night cycle.

import * as THREE from 'three';
import { clamp01, lerp } from '../core/util.js';

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uNight;
  uniform float uSunSize;
  varying vec3 vDir;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y * 1.15 + 0.06, 0.0, 1.0);
    vec3 col = mix(uBottom, uTop, pow(h, 0.62));

    float sd = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSunColor * pow(sd, 5.0) * 0.30;
    col += uSunColor * pow(sd, uSunSize) * 3.2;

    // stars, only well after sunset
    if (uNight > 0.22 && d.y > 0.0) {
      vec2 cell = floor(d.xz / max(d.y, 0.15) * 130.0);
      float s = hash21(cell);
      float star = smoothstep(0.9975, 1.0, s) * (0.35 + 0.65 * hash21(cell + 7.7));
      star *= 1.0 - smoothstep(0.55, 0.95, hash21(cell + 3.3));
      col += vec3(0.92, 0.95, 1.0) * star * smoothstep(0.22, 0.6, uNight) * smoothstep(0.0, 0.3, d.y) * 1.5;
    }

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createSky(scene, buildingUniforms) {
  const uniforms = {
    uTop: { value: new THREE.Color(0x3f7fc4) },
    uBottom: { value: new THREE.Color(0xcfe6f2) },
    uSunColor: { value: new THREE.Color(0xfff3d8) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uNight: { value: 0 },
    uSunSize: { value: 900 }
  };

  const skyGeo = new THREE.SphereGeometry(900, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xbfd8ee, 0x5a5244, 1.1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0d0, 1.5);
  sun.position.set(120, 240, 90);
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x8fb0d8, 0.35);
  fill.position.set(-120, 90, -140);
  scene.add(fill);

  scene.fog = new THREE.FogExp2(0xbcd4e6, 0.0016);

  // --- environment reflections --------------------------------------------
  // A tiny sky dome plus a sun blob is rendered into a prefiltered cube map
  // whenever the light changes. That is what stops car paint, glass and chrome
  // from looking like flat plastic: they get the sky on top and a sun glint.
  const envScene = new THREE.Scene();
  const envDomeGeo = new THREE.SphereGeometry(9, 24, 16);
  const envDome = new THREE.Mesh(
    envDomeGeo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })
  );
  envDome.frustumCulled = false;
  envScene.add(envDome);

  const envSun = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  envSun.frustumCulled = false;
  envScene.add(envSun);

  const envCols = new Float32Array(envDomeGeo.attributes.position.count * 3);
  envDomeGeo.setAttribute('color', new THREE.BufferAttribute(envCols, 3));

  let envRenderer = null;
  let envPMREM = null;
  let envTarget = null;
  let envKey = null;

  const state = {
    hours: 17.2,
    night: 0,
    sunDir: new THREE.Vector3(0.4, 0.8, 0.3),
    sunColor: new THREE.Color(0xfff0d0),
    skyColor: new THREE.Color(0x9fc4e8),
    groundColor: new THREE.Color(0x4a4438),
    fogColor: new THREE.Color(0xbcd4e6),
    ambient: 0.8
  };

  const cA = new THREE.Color();
  const cB = new THREE.Color();

  function paintEnv() {
    const pos = envDomeGeo.attributes.position;
    const top = uniforms.uTop.value;
    const bottom = uniforms.uBottom.value;
    const ground = state.groundColor;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 9;
      const k = Math.pow(Math.max(0, Math.min(1, y * 0.9 + 0.14)), 0.7);
      let r = bottom.r + (top.r - bottom.r) * k;
      let g = bottom.g + (top.g - bottom.g) * k;
      let b = bottom.b + (top.b - bottom.b) * k;
      if (y < 0) {
        const t = Math.min(1, -y * 2.6);
        r += (ground.r * 0.6 - r) * t;
        g += (ground.g * 0.6 - g) * t;
        b += (ground.b * 0.6 - b) * t;
      }
      envCols[i * 3] = r;
      envCols[i * 3 + 1] = g;
      envCols[i * 3 + 2] = b;
    }
    envDomeGeo.attributes.color.needsUpdate = true;
    envSun.position.copy(uniforms.uSunDir.value).multiplyScalar(8);
    envSun.material.color.copy(state.sunColor).multiplyScalar(state.night > 0.55 ? 3 : 11);
  }

  function refreshEnv() {
    if (!envRenderer) return;
    if (!envPMREM) envPMREM = new THREE.PMREMGenerator(envRenderer);
    paintEnv();
    const next = envPMREM.fromScene(envScene, 0, 0.4, 30);
    if (envTarget) envTarget.dispose();
    envTarget = next;
    scene.environment = next.texture;
  }

  function attachRenderer(renderer) {
    envRenderer = renderer;
    envKey = null;
  }

  function lerpColor(out, a, b, t) {
    out.copy(a).lerp(b, t);
    return out;
  }

  const DAY_TOP = new THREE.Color(0x2f6fb8);
  const DAY_BOTTOM = new THREE.Color(0xcfe6f2);
  const DUSK_TOP = new THREE.Color(0x1d3557);
  const DUSK_BOTTOM = new THREE.Color(0xf7a259);
  const NIGHT_TOP = new THREE.Color(0x03060f);
  const NIGHT_BOTTOM = new THREE.Color(0x0d1727);
  const SUN_HIGH = new THREE.Color(0xfff6e2);
  const SUN_LOW = new THREE.Color(0xffa257);
  const MOON = new THREE.Color(0x8fa8d8);

  function update(hours, camera) {
    state.hours = ((hours % 24) + 24) % 24;
    const t = state.hours;

    // sun path: rises 6, noon 13, sets 20
    const dayPhase = (t - 6) / 14;
    const elev = Math.sin(clamp01(dayPhase) * Math.PI) - (dayPhase < 0 || dayPhase > 1 ? 0.55 : 0);
    const azimuth = (t / 24) * Math.PI * 2 + Math.PI * 0.4;
    const cosE = Math.cos(Math.max(-0.35, Math.min(1.2, elev * 1.1)));
    state.sunDir.set(
      Math.cos(azimuth) * Math.max(0.18, cosE),
      Math.max(-0.2, Math.sin(elev * 1.1)),
      Math.sin(azimuth) * Math.max(0.18, cosE)
    ).normalize();

    const daylight = clamp01(state.sunDir.y * 2.2);
    const dusk = clamp01(1 - Math.abs(state.sunDir.y) * 4.5) * (state.sunDir.y > -0.25 ? 1 : 0);
    state.night = clamp01(1 - daylight * 1.35);

    // colours
    lerpColor(cA, NIGHT_TOP, DAY_TOP, daylight);
    lerpColor(cA, cA, DUSK_TOP, dusk * 0.8);
    lerpColor(cB, NIGHT_BOTTOM, DAY_BOTTOM, daylight);
    lerpColor(cB, cB, DUSK_BOTTOM, dusk * 0.85);

    uniforms.uTop.value.copy(cA);
    uniforms.uBottom.value.copy(cB);
    uniforms.uNight.value = state.night;

    lerpColor(state.sunColor, MOON, SUN_HIGH, daylight);
    lerpColor(state.sunColor, state.sunColor, SUN_LOW, dusk * 0.9);
    uniforms.uSunColor.value.copy(state.sunColor);
    uniforms.uSunDir.value.copy(state.night > 0.55 ? state.sunDir.clone().multiplyScalar(-1) : state.sunDir);

    sun.color.copy(state.sunColor);
    sun.intensity = lerp(0.1, 2.1, daylight);
    sun.position.copy(state.night > 0.55 ? state.sunDir.clone().multiplyScalar(-1) : state.sunDir).multiplyScalar(300);
    fill.intensity = lerp(0.22, 0.42, daylight);
    hemi.intensity = lerp(0.3, 0.8, daylight);
    hemi.color.copy(cA);
    hemi.groundColor.copy(state.groundColor);

    state.fogColor.copy(cB).lerp(cA, 0.25);
    scene.fog.color.copy(state.fogColor);
    scene.fog.density = lerp(0.0026, 0.00135, daylight);
    sky.position.copy(camera ? camera.position : new THREE.Vector3());

    if (buildingUniforms) {
      buildingUniforms.uSunDir.value.copy(uniforms.uSunDir.value);
      buildingUniforms.uSunColor.value.copy(state.sunColor).multiplyScalar(lerp(0.25, 1.0, daylight));
      buildingUniforms.uSkyColor.value.copy(cB);
      buildingUniforms.uGroundColor.value.copy(state.groundColor);
      buildingUniforms.uAmbient.value = lerp(0.16, 0.72, daylight);
      buildingUniforms.uNight.value = state.night;
      buildingUniforms.uFogColor.value.copy(scene.fog.color);
      buildingUniforms.uFogDensity.value = scene.fog.density;
    }

    // the reflection cube map is only rebuilt when the light has moved enough
    const key = Math.round(state.night * 16) * 100 + Math.round(dusk * 16);
    if (key !== envKey) {
      envKey = key;
      refreshEnv();
    }
    // the sky reflection is brightest in the day; hemi carries the rest
    scene.environmentIntensity = lerp(0.4, 0.75, daylight);
  }

  return { sky, sun, hemi, fill, uniforms, state, update, attachRenderer };
}
