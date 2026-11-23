// Driving in Soest — entry point.

import * as THREE from 'three';

import { WORLD, POIS, ANCHORS, CAR_TYPES, RADIO_STATIONS } from './world/data.js';
import { buildNetwork, projectOnEdge } from './world/network.js';
import { buildCity } from './world/city.js';
import { buildBuildings, createBuildingMaterial } from './world/buildings.js';
import { buildLandmarks } from './world/landmarks.js';
import { buildProps } from './world/props.js';
import { TEX } from './world/textures.js';
import { createSky } from './world/sky.js';
import { CollisionWorld } from './core/collision.js';
import { GeomBuilder, vcMaterial } from './core/geom.js';
import { lin, clamp, damp, dampAngle, rand, formatMoney } from './core/util.js';
import { Vehicle } from './vehicles/vehicle.js';
import { TrafficSystem, spawnParkedCars } from './gameplay/traffic.js';
import { Crowd } from './gameplay/crowd.js';
import { Navigator, RoutePath, TURN_GLYPH } from './gameplay/nav.js';
import { TaxiService } from './gameplay/taxi.js';
import { PoliceSystem, EmergencyServices } from './gameplay/police.js';
import { Hud } from './ui/hud.js';
import { Minimap } from './ui/minimap.js';
import { AudioEngine } from './ui/audio.js';
import { Phone } from './ui/phone.js';

const tick = () => new Promise((r) => setTimeout(r, 14));

// --- state ---------------------------------------------------------------

const game = {
  running: false,
  paused: false,
  mode: 'taxi',
  time: 17.4,
  cycle: true,
  onFoot: false,
  money: 0,
  rides: 0
};

const wallet = {
  add(n) {
    game.money += n;
    hud.setWallet(game.money);
    save();
  }
};

let renderer;
let scene;
let camera;
let network;
let collision;
let sky;
let cityMesh;
let buildings;
let landmarks;
let hud;
let minimap;
let phone;
let audio;
let nav;
let traffic;
let parked = [];
let crowd;
let police;
let emergency;
let taxi;
let playerVehicle;
let foot;
let ribbon;
let keys = {};
// held buttons from the on-screen pad, merged with the keyboard
const touch = { gas: false, brake: false, left: false, right: false };
let bootFillEl;
let bootLabelEl;

const saved = load();

// --- boot ----------------------------------------------------------------

async function boot() {
  bootFillEl = document.getElementById('bootFill');
  bootLabelEl = document.getElementById('bootLabel');
  hud = new Hud();
  audio = new AudioEngine();

  const canvas = document.getElementById('scene');
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.4, 1400);
  camera.position.set(0, 6, -10);

  setProgress(0.06, 'Straten van Soest uittekenen…');
  await tick();
  network = buildNetwork();

  setProgress(0.24, 'Huizen neerzetten…');
  await tick();
  const buildingMat = createBuildingMaterial();
  buildings = buildBuildings(network, buildingMat.material);
  scene.add(buildings.group);

  setProgress(0.5, 'Grond, bomen en lantaarnpalen…');
  await tick();
  cityMesh = buildCity(network, buildingMat.uniforms, { hedges: buildings.hedges });
  scene.add(cityMesh.group);

  setProgress(0.68, 'Kerk, molen en paleis…');
  await tick();
  landmarks = buildLandmarks();
  scene.add(landmarks.group);

  setProgress(0.78, 'Lucht en licht…');
  await tick();
  sky = createSky(scene, buildingMat.uniforms);
  sky.attachRenderer(renderer);

  setProgress(0.86, 'Botsingen klaarzetten…');
  await tick();
  collision = new CollisionWorld(22);
  collision.setBounds(-WORLD.halfW, WORLD.halfW, -WORLD.halfH, WORLD.halfH);
  collision.addBuildings(buildings.boxes);
  addLandmarkColliders(collision);

  setProgress(0.9, 'Stoepen, bankjes en lantaarns…');
  await tick();
  const props = buildProps(network, buildings, collision);
  scene.add(props.group);

    setProgress(0.94, 'Verkeer en mensen…');
  await tick();
  nav = new Navigator(network);
  traffic = new TrafficSystem(scene, network, collision, 26);
  parked = spawnParkedCars(scene, network, collision, 150);
  crowd = new Crowd(scene, network, 56);
  police = new PoliceSystem(scene, network, collision, nav);
  emergency = new EmergencyServices(scene, network, collision);

  ribbon = new RouteRibbon(scene);
  hud.setWallet(game.money);

  minimap = new Minimap(document.getElementById('minimap'), network, buildings);
  phone = new Phone({
    minimap,
    network,
    nav,
    audio,
    game,
    hud,
    sky,
    camera,
    wallet,
    get taxi() { return taxi; },
    get playerVehicle() { return playerVehicle; },
    getPlayerX: () => (game.onFoot && foot ? foot.x : playerVehicle ? playerVehicle.x : 0),
    getPlayerZ: () => (game.onFoot && foot ? foot.z : playerVehicle ? playerVehicle.z : 0),
    getPlayerHeading: () => (game.onFoot && foot ? foot.heading : playerVehicle ? playerVehicle.heading : 0),
    onCarSelect: (id) => switchCar(id),
    onWaypoint: (wp) => setWaypoint(wp)
  });

  setProgress(1, 'Klaar');
  await tick();

  document.getElementById('menu').classList.remove('hidden');
  setTimeout(() => document.getElementById('boot').classList.add('hidden'), 500);
  window.addEventListener('resize', onResize);
  // a small handle for debugging and for checking the audio in the browser
  window.__soest = {
    get audio() { return audio; },
    get game() { return game; },
    get vehicle() { return playerVehicle; },
    get traffic() { return traffic; },
    // hold a control from the console: __soest.drive('gas', true)
    drive(name, on) {
      if (name in touch) touch[name] = !!on;
      return touch;
    }
  };
  bindMenu();
  bindInput();

  renderer.setAnimationLoop(loop);
  game.running = false;
}

function setProgress(p, label) {
  if (bootFillEl) bootFillEl.style.width = Math.round(p * 100) + '%';
  if (bootLabelEl && label) bootLabelEl.textContent = label;
}

function addLandmarkColliders(col) {
  const boxes = [
    [ANCHORS.church.x, ANCHORS.church.z, 26, 16, 0],
    [ANCHORS.church.x + 13, ANCHORS.church.z, 10, 13, 0],
    [ANCHORS.palace.x, ANCHORS.palace.z, 44, 20, 0],
    [ANCHORS.waterTower.x, ANCHORS.waterTower.z, 14, 14, 0],
    [ANCHORS.windmill.x, ANCHORS.windmill.z, 10, 10, 0],
    [ANCHORS.stationZuid.x, ANCHORS.stationZuid.z, 21, 10, 0],
    [ANCHORS.stationOost.x, ANCHORS.stationOost.z, 21, 10, 0]
  ];
  for (const [x, z, w, d, r] of boxes) col.addBox(x, z, w, d, r);
}

// --- session -------------------------------------------------------------

function startSession(mode) {
  game.mode = mode;
  game.money = saved.money || 0;
  game.rides = saved.rides || 0;

  document.getElementById('menu').classList.add('hidden');
  hud.show(true);
  hud.setWallet(game.money);

  audio.init();
  audio.setRadioVolume(0.5);
  audio.setSfxVolume(0.75);
  if (audio.ready) {
    audio.playRadio(0);
    hud.setRadio(RADIO_STATIONS[0].name, RADIO_STATIONS[0].color);
  }

  const spawn = ANCHORS.spawn;
  const near = network.nearestEdge(spawn.x, spawn.z);
  let heading = 0;
  let sx = spawn.x;
  let sz = spawn.z;
  if (near.edge) {
    const proj = projectOnEdge(near.edge, spawn.x, spawn.z);
    const lane = Math.max(1.25, (near.edge.width * 0.5 - 2.6) * 0.55);
    heading = Math.atan2(near.edge.dx, near.edge.dz);
    // the right-hand lane, whichever way the edge runs
    sx = proj.x - Math.cos(heading) * lane;
    sz = proj.z + Math.sin(heading) * lane;
  }
  if (playerVehicle) scene.remove(playerVehicle.group);
  playerVehicle = new Vehicle({
    type: mode === 'taxi' ? 'taxi' : 'sport',
    x: sx,
    z: sz,
    heading,
    liveWheels: true,
    isPlayer: true,
    spot: true
  });
  scene.add(playerVehicle.group);
  playerVehicle.setHeadlights(sky.state.night > 0.45, 1);

  traffic.clearAround(sx, sz, 60);
  police.clearAround(sx, sz, 90);
  emergency.clearAround(sx, sz, 110);

  if (!taxi) {
    taxi = new TaxiService({ scene, nav, hud, audio, wallet });
  }
  taxi.setPlayer(playerVehicle);
  taxi.cancel();
  taxi.update(0);

  game.onFoot = false;
  game.paused = false;
  game.running = true;
  game.time = 17.4;

  hideFoot();
  hud.setMission(
    mode === 'taxi' ? 'TAXI' : 'VRIJ RIJDEN',
    mode === 'taxi' ? 'Wacht op een rit…' : 'Doe wat je wil',
    mode === 'taxi' ? 'Rijd rond in Soest.' : 'Verken de stad, pak een auto, ga wandelen.',
    ''
  );
  audio.playChime('ui');
}

// --- input ---------------------------------------------------------------

function bindInput() {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    if (e.repeat) {
      keys[e.code] = true;
      return;
    }
    keys[e.code] = true;
    onKey(e.code);
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });
  window.addEventListener('blur', () => {
    keys = {};
  });

  window.addEventListener('mousedown', () => {
    if (game.running) {
      audio.init();
      audio.unlock();
    }
  });

  bindDrivePad();
}

/**
 * The on-screen pad. Pointer events cover mouse, touch and pen, and the state
 * lives in `touch` so the same path drives the car as the keyboard. Without
 * this the game was only playable with a physical keyboard.
 */
function bindDrivePad() {
  const pad = document.getElementById('drivePad');
  if (!pad) return;
  const btns = pad.querySelectorAll('[data-drive]');

  const set = (name, on, el) => {
    if (!(name in touch)) return;
    touch[name] = on;
    if (el) el.classList.toggle('held', on);
  };

  btns.forEach((el) => {
    const name = el.dataset.drive;
    const down = (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      set(name, true, el);
      if (game.running) audio.init();
    };
    const up = (e) => {
      e.preventDefault();
      set(name, false, el);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // a stuck button must never be able to lock the throttle on
  window.addEventListener('blur', () => {
    for (const k of Object.keys(touch)) touch[k] = false;
    btns.forEach((el) => el.classList.remove('held'));
  });
}

function onKey(code) {
  if (!game.running) return;
  switch (code) {
    case 'Escape':
      if (phone && phone.visible) {
        phone.close();
        break;
      }
      togglePause();
      break;
    case 'KeyE':
      if (game.paused) break;
      toggleVehicle();
      break;
    case 'KeyR': {
      const idx = audio.nextRadio();
      if (idx < 0) hud.setRadio(null);
      else hud.setRadio(RADIO_STATIONS[idx].name, RADIO_STATIONS[idx].color);
      break;
    }
    case 'KeyH':
      if (!game.onFoot) audio.horn();
      break;
    case 'KeyC':
      game.camMode = ((game.camMode || 0) + 1) % 3;
      break;
    case 'KeyN':
      game.time = (game.time + 3) % 24;
      break;
    case 'KeyM':
    case 'Tab':
      if (phone) phone.open('map');
      break;
    case 'KeyP':
      if (phone) phone.toggle();
      break;
    default:
      break;
  }
}

function toggleVehicle() {
  if (game.onFoot) {
    // find a car to get into
    const candidates = [playerVehicle, ...traffic.vehicles(), ...police.cars.map((c) => c.vehicle)];
    let best = null;
    let bd = 16;
    for (const v of candidates) {
      if (!v) continue;
      const d = Math.hypot(v.x - foot.x, v.z - foot.z);
      if (d < bd) { bd = d; best = v; }
    }
    if (!best) {
      hud.toast('Geen auto in de buurt');
      return;
    }
    if (best !== playerVehicle) {
      // swap: leave the old car where it is
      playerVehicle = best;
      if (taxi) taxi.setPlayer(playerVehicle);
    }
    game.onFoot = false;
    hideFoot();
    audio.playChime('ui');
    hud.prompt('');
  } else {
    if (playerVehicle.speed > 6) {
      hud.toast('Stop eerst even');
      return;
    }
    game.onFoot = true;
    showFoot();
    foot.x = playerVehicle.x + Math.cos(playerVehicle.heading) * 2.2;
    foot.z = playerVehicle.z - Math.sin(playerVehicle.heading) * 2.2;
    foot.heading = playerVehicle.heading;
    foot.camYaw = playerVehicle.heading;
    audio.playChime('ui');
  }
}

function showFoot() {
  if (!foot) createFoot();
  foot.group.visible = true;
}

function hideFoot() {
  if (foot) foot.group.visible = false;
}

function createFoot() {
  const g = new THREE.Group();
  const b = new GeomBuilder();
  b.box(0, 1.16, 0, 0.46, 0.62, 0.26, lin('#2c4a6b'));
  b.box(0, 1.44, 0, 0.5, 0.12, 0.28, lin('#2c4a6b'));
  b.box(0, 1.63, 0, 0.24, 0.27, 0.24, lin('#d9a97e'));
  b.box(0, 1.76, -0.01, 0.26, 0.11, 0.26, lin('#2b2118'));
  b.box(0.3, 1.14, 0, 0.13, 0.56, 0.16, lin('#35587e'));
  b.box(-0.3, 1.14, 0, 0.13, 0.56, 0.16, lin('#35587e'));
  const body = new THREE.Mesh(b.build(), vcMaterial());
  g.add(body);

  const lb = new GeomBuilder();
  lb.box(0, -0.42, 0, 0.17, 0.82, 0.18, lin('#2b323c'));
  lb.box(0, -0.85, 0.04, 0.19, 0.1, 0.26, lin('#20242a'));
  const legGeo = lb.build();
  const l1 = new THREE.Mesh(legGeo, vcMaterial());
  l1.position.set(0.11, 0.9, 0);
  const l2 = new THREE.Mesh(legGeo, vcMaterial());
  l2.position.set(-0.11, 0.9, 0);
  g.add(l1, l2);

  scene.add(g);
  foot = { group: g, legL: l1, legR: l2, x: 0, z: 0, heading: 0, camYaw: 0, phase: 0, speed: 0 };
}

// --- loop ----------------------------------------------------------------

let lastTime = 0;

function loop(now) {
  const raw = lastTime ? (now - lastTime) / 1000 : 0.016;
  lastTime = now;
  const dt = Math.min(raw, 0.05);

  if (game.time) {
    sky.update(game.time, camera);
    landmarkAndCityUpdate(dt);
  }

  if (game.running && !game.paused) {
    step(dt);
  } else if (renderer && scene && camera && !game.running) {
    idleCamera(raw);
  }

  if (renderer && scene && camera) renderer.render(scene, camera);
  if (phone) phone.update();
}

let idleAngle = 0.8;
const idleTarget = { x: ANCHORS.church.x, z: ANCHORS.church.z };
function idleCamera(dt) {
  idleAngle += dt * 0.035;
  const r = 62;
  camera.position.set(
    idleTarget.x + Math.sin(idleAngle) * r,
    17,
    idleTarget.z + Math.cos(idleAngle) * r
  );
  camera.lookAt(idleTarget.x - 6, 9.5, idleTarget.z - 4);
  sky.update(game.time, camera);
  if (cityMesh) cityMesh.setNight(sky.state.night);
  if (landmarks) landmarks.update(performance.now() * 0.001);
  if (traffic) {
    traffic.setNight(sky.state.night);
    traffic.update(dt, null);
  }
  if (crowd) crowd.update(dt);
}

function landmarkAndCityUpdate(dt) {
  if (cityMesh) cityMesh.setNight(sky.state.night);
}

function step(dt) {
  if (game.cycle) {
    game.time = (game.time + dt / 50) % 24; // one day ≈ 20 minutes
  }
  sky.update(game.time, camera);
  cityMesh.setNight(sky.state.night);
  landmarks.update(performance.now() * 0.001);

  const night = sky.state.night;
  const beam = clamp(night * 1.4, 0, 1);

  // everything with a driver in it switches its lights on after dusk
  traffic.setNight(night);
  if (police) {
    for (const car of police.cars) car.vehicle.setHeadlights(night > 0.42, beam);
  }
  if (emergency) {
    for (const car of emergency.cars) car.vehicle.setHeadlights(night > 0.42, beam);
  }

  if (game.onFoot) {
    updateFoot(dt);
    playerVehicle.update(dt, { throttle: 0, brake: 1, steer: 0, handbrake: true }, collision);
  } else {
    const input = readDriveInput();
    playerVehicle.update(dt, input, collision);
    playerVehicle.setHeadlights(night > 0.42, clamp(night * 1.4, 0, 1));
  }

  traffic.update(dt, playerVehicle);
  crowd.update(dt);
  police.update(dt, playerVehicle, audio, onBusted);
  emergency.update(dt, playerVehicle);

  if (game.mode === 'taxi' && !game.onFoot) {
    taxi.update(dt);
  } else if (taxi) {
    taxi.marker.visible = false;
  }

  // route ribbon + hud
  const taxiRoute = game.mode === 'taxi' && taxi ? taxi.route : null;
  let route = taxiRoute;
  let target = taxi && taxi.target ? taxi.target : null;
  if (game.waypoint) {
    // re-route only when the driver has actually left the line, not on a timer
    const off = game.waypointRoute
      ? nav.progress(game.waypointRoute.points, playerVehicle.x, playerVehicle.z).off
      : Infinity;
    game.waypointTimer = (game.waypointTimer || 0) + dt;
    if (game.waypointTimer > 5 || (off > 25 && game.waypointTimer > 1)) {
      game.waypointTimer = 0;
      const r = nav.routeAhead(playerVehicle.x, playerVehicle.z, playerVehicle.heading, game.waypoint.x, game.waypoint.z);
      if (r) game.waypointRoute = r;
    }
    const d = Math.hypot(game.waypoint.x - playerVehicle.x, game.waypoint.z - playerVehicle.z);
    if (d < 12) {
      hud.toast('Waypoint bereikt');
      game.waypoint = null;
      game.waypointRoute = null;
    } else if (!route) {
      route = game.waypointRoute;
      target = { x: game.waypoint.x, z: game.waypoint.z, color: '#ff5b4a' };
    }
  }
  if (route && route.points && route.points.length > 1) {
    // the line is drawn in the same lane the car drives, using the lane width of
    // the street under it
    const under = nav.net.nearestEdge(playerVehicle.x, playerVehicle.z);
    const laneOff = under && under.edge
      ? Math.max(1.2, (under.edge.width * 0.5 - 2.6) * 0.55)
      : 1.4;
    ribbon.set(route.points, playerVehicle.x, playerVehicle.z, laneOff);
    const g = nav.guidance(route.points, playerVehicle.x, playerVehicle.z);
    const prog = nav.progress(route.points, playerVehicle.x, playerVehicle.z);
    // arrival estimate: the car's own pace, floored so a standstill does not
    // promise an arrival next week
    const kmh = Math.max(18, playerVehicle.speed * 3.6);
    const minutes = (prog.remaining / 1000) / kmh * 60;
    hud.setNav(g, prog.remaining, prog.total, { minutes, arrive: (game.time + minutes / 60) % 24 });
  } else {
    ribbon.clear();
    hud.setNav(null);
  }

  hud.setSpeed(playerVehicle.speed * 3.6, gearFor(playerVehicle), playerVehicle.fuel);
  hud.setClock(game.time, night);
  hud.setWanted(police.wanted);
  hud.update(dt);

  // prompt for entering/exiting
  if (game.onFoot) {
    const near = nearestVehicle();
    hud.prompt(near ? `E · Instappen (${CAR_TYPES[near.typeId].name})` : null);
  } else if (playerVehicle.speed < 1.5) {
    hud.prompt('E · Uitstappen');
  } else {
    hud.prompt(null);
  }

  if (playerVehicle.impact > 0.35) {
    audio.playChime('crash');
  }

  resolveVehicleCollisions();

  game.rides = taxi ? taxi.completed : 0;

  const skid = clamp(Math.abs(playerVehicle.vLat || 0) / 9, 0, 1);
  audio.setSkid(skid);
  const rpm = clamp(Math.abs(playerVehicle.vLong) / playerVehicle.spec.maxSpeed, 0, 1);
  audio.setEngine(rpm, inputLoad, clamp(playerVehicle.speed / 40, 0, 1));

  traffic.maintain(playerVehicle.x, playerVehicle.z);
  crowd.relocateFar(playerVehicle.x, playerVehicle.z);

  updateCamera(dt);
  updateMinimap();

  if (Math.random() < dt * 0.06) save();
}

let inputLoad = 0;

function readDriveInput() {
  const fwd = keys.KeyW || keys.ArrowUp || touch.gas ? 1 : 0;
  const back = keys.KeyS || keys.ArrowDown || touch.brake ? 1 : 0;
  const left = keys.KeyA || keys.ArrowLeft || touch.left ? 1 : 0;
  const right = keys.KeyD || keys.ArrowRight || touch.right ? 1 : 0;
  const boost = keys.ShiftLeft || keys.ShiftRight ? 1 : 0;
  const handbrake = keys.Space;

  const throttle = clamp(fwd + boost * 0.55, 0, 1);
  inputLoad = damp(inputLoad, throttle, 6, 0.016);
  return {
    throttle,
    brake: back,
    steer: left - right,
    handbrake
  };
}

function gearFor(v) {
  const kmh = v.speed * 3.6;
  if (v.vLong < -0.4) return 'R';
  if (kmh < 1) return 'N';
  if (kmh < 18) return '1';
  if (kmh < 34) return '2';
  if (kmh < 52) return '3';
  if (kmh < 72) return '4';
  if (kmh < 95) return '5';
  return '6';
}

/** Place a custom waypoint and navigate to it (used by the phone map). */
function setWaypoint(wp) {
  if (!wp) {
    game.waypoint = null;
    game.waypointRoute = null;
    hud.toast('Waypoint gewist');
    return;
  }
  game.waypoint = wp;
  const route = nav.routeAhead(playerVehicle.x, playerVehicle.z, playerVehicle.heading, wp.x, wp.z);
  game.waypointRoute = route;
  if (route) hud.toast('Route ingesteld · ' + Math.round(route.distance) + ' m');
  else hud.toast('Geen route gevonden');
  if (phone) phone.close();
}

function switchCar(typeId) {
  if (!playerVehicle) return;
  const old = playerVehicle;
  const x = old.x;
  const z = old.z;
  const heading = old.heading;
  scene.remove(old.group);
  playerVehicle = new Vehicle({
    type: typeId,
    x,
    z,
    heading,
    liveWheels: true,
    isPlayer: true,
    spot: true
  });
  scene.add(playerVehicle.group);
  if (taxi) taxi.setPlayer(playerVehicle);
  hud.toast(`${CAR_TYPES[typeId].name} gepakt`);
  audio.playChime('ui');
}

function nearestVehicle() {
  const candidates = [playerVehicle, ...traffic.vehicles(), ...police.cars.map((c) => c.vehicle)];
  let best = null;
  let bd = 3.8;
  for (const v of candidates) {
    if (!v) continue;
    const d = Math.hypot(v.x - foot.x, v.z - foot.z);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

/** Two-body collision so the player cannot drive through other cars. */
const collisionList = [];
function resolveVehicleCollisions() {
  collisionList.length = 0;
  for (const c of traffic.cars) collisionList.push(c.vehicle);
  for (const c of police.cars) collisionList.push(c.vehicle);
  for (const c of emergency.cars) collisionList.push(c.vehicle);
  for (const c of parked) collisionList.push(c);

  const p = playerVehicle;
  for (const o of collisionList) {
    if (o === p) continue;
    const dx = p.x - o.x;
    const dz = p.z - o.z;
    const rr = p.bodyRadius + (o.bodyRadius || 1);
    const d2 = dx * dx + dz * dz;
    if (d2 >= rr * rr || d2 < 1e-5) continue;
    const d = Math.sqrt(d2);
    // ignore pairs that overlap only because the circles are rough
    const nx = dx / d;
    const nz = dz / d;
    const pen = rr - d;
    if (pen < 0.08) continue;
    p.x += nx * pen * 0.62;
    p.z += nz * pen * 0.62;
    o.x -= nx * pen * 0.38;
    o.z -= nz * pen * 0.38;

    const rel = (p.vx - o.vx) * nx + (p.vz - o.vz) * nz;
    if (rel < 0) {
      const imp = -rel * 1.15;
      p.vx += nx * imp * 0.6;
      p.vz += nz * imp * 0.6;
      o.vx -= nx * imp * 0.4;
      o.vz -= nz * imp * 0.4;
      const sev = Math.min(1, -rel / 12);
      if (sev > p.impact) p.impact = sev;
      p.damage = Math.min(1, p.damage + sev * 0.1);
    }
    o.group.position.set(o.x, 0, o.z);
    p.group.position.set(p.x, 0, p.z);
  }
}

function updateFoot(dt) {
  const cy = foot.camYaw;
  const fx = Math.sin(cy);
  const fz = Math.cos(cy);
  const rx = -Math.cos(cy);
  const rz = Math.sin(cy);

  const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let dx = fx * f + rx * s;
  let dz = fz * f + rz * s;
  const len = Math.hypot(dx, dz);
  const run = keys.ShiftLeft || keys.ShiftRight ? 1.9 : 1;
  const speed = 2.6 * run;

  if (len > 0.01) {
    dx /= len;
    dz /= len;
    foot.heading = dampAngle(foot.heading, Math.atan2(dx, dz), 12, dt);
    foot.phase += dt * (6 + speed);
    const nx = foot.x + dx * speed * dt;
    const nz = foot.z + dz * speed * dt;
    const hit = collision.resolve(nx, nz, 0.45);
    if (hit) {
      foot.x = hit.x;
      foot.z = hit.z;
    } else {
      foot.x = nx;
      foot.z = nz;
    }
    foot.speed = speed;
  } else {
    foot.speed = 0;
    foot.phase += dt * 1.2;
  }

  foot.group.position.set(foot.x, 0, foot.z);
  foot.group.rotation.y = foot.heading;
  const swing = Math.sin(foot.phase) * (foot.speed > 0 ? 0.6 : 0.05);
  foot.legL.rotation.x = swing;
  foot.legR.rotation.x = -swing;
  foot.camYaw = dampAngle(foot.camYaw, foot.heading, 3.2, dt);
}

function updateCamera(dt, raw) {
  const t = raw || dt;if (game.onFoot && foot) {
    const back = 5.4;
    const gy = 2.2;
    camGoal.set(
      foot.x - Math.sin(foot.camYaw) * back,
      gy,
      foot.z - Math.cos(foot.camYaw) * back
    );
    camLook.set(foot.x, 1.45, foot.z);
  } else {
    const v = playerVehicle;
    const mode = game.camMode || 0;
    const back = mode === 2 ? 13 : mode === 1 ? 0 : 7.4 + Math.min(v.speed * 0.09, 3.4);
    const height = mode === 2 ? 7.5 : mode === 1 ? 1.55 : 3.0 + Math.min(v.speed * 0.012, 0.7);
    if (mode === 1) {
      camGoal.set(
        v.x + v.forwardX * 1.1,
        1.45,
        v.z + v.forwardZ * 1.1
      );
      camLook.set(v.x + v.forwardX * 14, 1.3, v.z + v.forwardZ * 14);
    } else {
      camGoal.set(v.x - v.forwardX * back, height, v.z - v.forwardZ * back);
      camLook.set(v.x + v.forwardX * 5.5, 1.5, v.z + v.forwardZ * 5.5);
    }
  }

  const lambda = game.onFoot ? 9 : 6.5;
  camera.position.x = damp(camera.position.x, camGoal.x, lambda, t);
  camera.position.y = damp(camera.position.y, camGoal.y, lambda, t);
  camera.position.z = damp(camera.position.z, camGoal.z, lambda, t);
  lookSmooth.x = damp(lookSmooth.x, camLook.x, 10, t);
  lookSmooth.y = damp(lookSmooth.y, camLook.y, 10, t);
  lookSmooth.z = damp(lookSmooth.z, camLook.z, 10, t);
  camera.lookAt(lookSmooth);
  const fov = 66 + Math.min(playerVehicle ? playerVehicle.speed : 0, 40) * 0.22;
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = damp(camera.fov, fov, 3, t);
    camera.updateProjectionMatrix();
  }
}

const camGoal = new THREE.Vector3();
const camLook = new THREE.Vector3();
const lookSmooth = new THREE.Vector3(0, 0, 10);

const blips = [];

function updateMinimap() {
  if (!minimap) return;
  blips.length = 0;
  for (const car of traffic.cars) {
    blips.push({ x: car.vehicle.x, z: car.vehicle.z, color: 'rgba(96,104,116,0.55)', size: 2.4 });
  }
  for (const car of police.cars) {
    blips.push({ x: car.vehicle.x, z: car.vehicle.z, color: '#2f6bff', size: 4 });
  }
  for (const car of emergency.cars) {
    blips.push({ x: car.vehicle.x, z: car.vehicle.z, color: '#ea4335', size: 4 });
  }

  const target = taxi && taxi.target
    ? { x: taxi.target.x, z: taxi.target.z, color: taxi.job ? taxi.job.kind.color : '#f2c230' }
    : game.waypoint
      ? { x: game.waypoint.x, z: game.waypoint.z, color: '#ff5b4a' }
      : null;

  const px = game.onFoot ? foot.x : playerVehicle.x;
  const pz = game.onFoot ? foot.z : playerVehicle.z;
  const heading = game.onFoot ? foot.heading : playerVehicle.heading;

  // route progress and the next junction, for the two-tone route and its arrow
  const route = (taxi && taxi.route) || game.waypointRoute;
  let progress = null;
  let nextTurn = null;
  if (route && route.points && route.points.length > 1) {
    progress = nav.progress(route.points, px, pz);
    const g = nav.guidance(route.points, px, pz);
    if (g && g.target && g.turn !== 'arrive') {
      nextTurn = { x: g.target.x, z: g.target.z, glyph: TURN_GLYPH[g.turn] || '↑' };
    }
  }

  minimap.draw({
    x: px,
    z: pz,
    heading,
    route,
    progress,
    nextTurn,
    target,
    blips,
    night: sky ? sky.state.night : 0
  });
}

function onBusted() {
  const fine = Math.min(game.money, 250);
  game.money -= fine;
  hud.setWallet(game.money);
  hud.toast(`Opgepakt! Boete ${formatMoney(fine)}`);
  save();
}

// --- pause / menu --------------------------------------------------------

function togglePause() {
  if (!game.running) return;
  game.paused = !game.paused;
  const el = document.getElementById('pause');
  el.classList.toggle('hidden', !game.paused);
  if (game.paused) {
    const stats = document.getElementById('pauseStats');
    stats.innerHTML =
      `<div><small>Contant</small><b>${formatMoney(game.money)}</b></div>` +
      `<div><small>Ritten</small><b>${game.rides}</b></div>` +
      `<div><small>Tijd</small><b>${String(Math.floor(game.time)).padStart(2, '0')}:${String(Math.floor((game.time % 1) * 60)).padStart(2, '0')}</b></div>`;
    const st = document.getElementById('setTime');
    st.value = String(game.time);
  }
}

function bindMenu() {
  document.querySelectorAll('.mode-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      audio.init();
      audio.playChime('ui');
      startSession(btn.dataset.mode);
    });
  });

  document.getElementById('pauseResume').addEventListener('click', () => togglePause());
  document.getElementById('pauseQuit').addEventListener('click', () => {
    game.paused = false;
    game.running = false;
    document.getElementById('pause').classList.add('hidden');
    document.getElementById('menu').classList.remove('hidden');
    hud.show(false);
    ribbon.clear();
  });

  const setTime = document.getElementById('setTime');
  if (setTime) {
    setTime.addEventListener('input', () => {
      game.time = parseFloat(setTime.value);
      game.cycle = false;
      document.getElementById('setCycle').checked = false;
    });
  }
  const setRadio = document.getElementById('setRadio');
  if (setRadio) setRadio.addEventListener('input', () => audio.setRadioVolume(parseFloat(setRadio.value)));
  const setSfx = document.getElementById('setSfx');
  if (setSfx) setSfx.addEventListener('input', () => audio.setSfxVolume(parseFloat(setSfx.value)));
  const setFar = document.getElementById('setFar');
  if (setFar) {
    setFar.addEventListener('change', () => {
      camera.far = setFar.checked ? 2400 : 1400;
      camera.updateProjectionMatrix();
    });
  }
  const setCycle = document.getElementById('setCycle');
  if (setCycle) setCycle.addEventListener('change', () => { game.cycle = setCycle.checked; });
}

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

// --- save ----------------------------------------------------------------

function load() {
  try {
    return JSON.parse(localStorage.getItem('soest3d.save') || '{}') || {};
  } catch {
    return {};
  }
}

function save() {
  try {
    saved.money = game.money;
    saved.rides = game.rides;
    localStorage.setItem('soest3d.save', JSON.stringify(saved));
  } catch {
    /* ignore */
  }
}

// --- route guidance ------------------------------------------------------
// A chain of flat arrow decals on the tarmac plus a soft glow, built from
// shared PlaneGeometry meshes (the same path the car's light pool uses).

class RouteRibbon {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.frustumCulled = false;
    scene.add(this.group);
    this.key = '';
    this.path = null;
    this.maxSeg = 260;
    // The casing and the blue core are drawn in that order and depth writes are
    // off, so the core needs a higher renderOrder to always land on top of it.
    this.outer = this.makeStrip(2.5, 0xffffff, 0.9, 0.2, 5);
    this.inner = this.makeStrip(1.75, 0x1a73e8, 1, 0.32, 7);
    this.group.visible = false;
  }

  /** One triangle strip of a given width and colour, lying on the road. */
  makeStrip(width, color, opacity, y, order) {
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array(this.maxSeg * 2 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < this.maxSeg - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = (i + 1) * 2;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -9,
      polygonOffsetUnits: -9
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    this.group.add(mesh);
    return { geo, verts, width, y };
  }

  /**
   * Paint the route ahead of the car as a solid blue line with a white edge,
   * the way a navigation app draws one. It is rebuilt every frame for the
   * stretch in front of the driver, so the line never runs out.
   */
  set(points, playerX, playerZ, laneOffset = 1.6) {
    if (!points || points.length < 2) {
      this.clear();
      return;
    }
    // rebuild the distance lookup only when the route itself changes
    let key = points.length + ':';
    for (let i = 0; i < points.length; i++) {
      key += Math.round(points[i].x / 4) + ',' + Math.round(points[i].z / 4) + ';';
    }
    if (key !== this.key) {
      this.key = key;
      this.path = new RoutePath(points);
    }
    const path = this.path;
    if (!path || path.length < 2) {
      this.clear();
      return;
    }

    const s0 = Math.max(0, path.project(playerX, playerZ) - 6);
    const AHEAD = 400;
    const s1 = Math.min(path.length, s0 + AHEAD);
    const step = Math.max(1.6, (s1 - s0) / (this.maxSeg - 1));
    let n = 0;
    for (let s = s0; s <= s1 && n < this.maxSeg; s += step) {
      const p = path.at(Math.min(s, path.length));
      if (!p) break;
      n++;
      // taper the far end so the line does not simply stop square
      const fade = Math.min(1, Math.max(0, (s1 - s) / 18));
      // the route runs down the middle of the road; the car drives the right
      // hand lane, so the line is shifted into that lane
      const nx = Math.cos(p.angle);
      const nz = -Math.sin(p.angle);
      const point = { x: p.x - nx * laneOffset, z: p.z - nz * laneOffset };
      this.writePair(this.outer, n - 1, point, nx, nz, fade);
      this.writePair(this.inner, n - 1, point, nx, nz, fade);
    }
    for (const strip of [this.outer, this.inner]) {
      strip.geo.attributes.position.needsUpdate = true;
      strip.geo.setDrawRange(0, Math.max(0, n - 1) * 6);
      strip.geo.computeBoundingSphere();
    }
    this.group.visible = n > 1;
  }

  writePair(strip, i, p, nx, nz, fade) {
    const half = strip.width * 0.5 * (0.35 + 0.65 * fade);
    const v = strip.verts;
    const o = i * 6;
    v[o] = p.x + nx * half;
    v[o + 1] = strip.y;
    v[o + 2] = p.z + nz * half;
    v[o + 3] = p.x - nx * half;
    v[o + 4] = strip.y;
    v[o + 5] = p.z - nz * half;
  }

  clear() {
    this.group.visible = false;
    this.key = '';
    this.path = null;
    if (this.outer) this.outer.geo.setDrawRange(0, 0);
    if (this.inner) this.inner.geo.setDrawRange(0, 0);
  }

  show() {
    if (this.path) this.group.visible = true;
  }
}

// --- go ------------------------------------------------------------------

window.addEventListener('error', (e) => {
  const el = document.getElementById('error');
  if (el) {
    el.classList.remove('hidden');
    el.textContent = 'Fout: ' + (e.message || e.error);
  }
});

boot().then(() => {
  /* ready */
}).catch((err) => {
  console.error(err);
  const el = document.getElementById('error');
  if (el) {
    el.classList.remove('hidden');
    el.textContent = 'Kon het spel niet starten: ' + err.message;
  }
});

void POIS;
void rand;
