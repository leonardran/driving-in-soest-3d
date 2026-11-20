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

    // stars, only at night
    if (uNight > 0.02 && d.y > 0.0) {
      vec2 cell = floor(d.xz / max(d.y, 0.15) * 90.0);
      float s = hash21(cell);
      float star = step(0.9965, s) * (0.4 + 0.6 * hash21(cell + 7.7));
      col += vec3(0.9, 0.94, 1.0) * star * uNight * smoothstep(0.0, 0.25, d.y) * 2.2;
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
    hemi.intensity = lerp(0.34, 1.15, daylight);
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
  }

  return { sky, sun, hemi, fill, uniforms, state, update };
}
