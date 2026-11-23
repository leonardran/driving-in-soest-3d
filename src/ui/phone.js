// The in-game phone: map, radio, ride history, car select and settings.

import { RADIO_STATIONS, CAR_TYPES, POIS } from '../world/data.js';
import { formatMoney, formatClock } from '../core/util.js';

const APPS = [
  { id: 'map', name: 'Kaart', color: '#4f9dff', icon: 'map' },
  { id: 'radio', name: 'Radio', color: '#f5c445', icon: 'radio' },
  { id: 'rides', name: 'Ritten', color: '#6fd3a0', icon: 'list' },
  { id: 'car', name: 'Auto', color: '#e07a3a', icon: 'car' },
  { id: 'settings', name: 'Opties', color: '#9aa6b2', icon: 'gear' }
];

function icon(name) {
  const common = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  switch (name) {
    case 'map':
      return `<svg viewBox="0 0 24 24" ${common}><path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z"/><path d="M9 4v13M15 6.5v13"/></svg>`;
    case 'radio':
      return `<svg viewBox="0 0 24 24" ${common}><rect x="3" y="8" width="18" height="12" rx="2.5"/><path d="m8 8 9-3.5"/><circle cx="8" cy="14" r="2.4"/><path d="M14.5 12.5h3.5M14.5 16h3.5"/></svg>`;
    case 'list':
      return `<svg viewBox="0 0 24 24" ${common}><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="4" cy="18" r="1.2"/></svg>`;
    case 'car':
      return `<svg viewBox="0 0 24 24" ${common}><path d="M3.5 13.5h17M5.2 13.5v-3l1.8-3.2A2 2 0 0 1 8.7 6.2h6.6a2 2 0 0 1 1.7 1.1l1.8 3.2v3"/><circle cx="7.6" cy="16.4" r="1.5"/><circle cx="16.4" cy="16.4" r="1.5"/></svg>`;
    default:
      return `<svg viewBox="0 0 24 24" ${common}><circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7"/></svg>`;
  }
}

export class Phone {
  constructor(ctx) {
    this.ctx = ctx;
    this.el = document.getElementById('phone');
    this.home = document.getElementById('phoneHome');
    this.view = document.getElementById('phoneView');
    this.body = document.getElementById('phoneBody');
    this.timeEl = document.getElementById('phoneTime');
    this.openApp = null;
    this.mapCanvas = null;
    this.buildHome();
    document.getElementById('phoneBack').addEventListener('click', () => this.showHome());
    document.getElementById('phoneBtn').addEventListener('click', () => this.toggle());
  }

  buildHome() {
    this.home.innerHTML = '';
    for (const app of APPS) {
      if (app.id === 'car' && this.ctx.game.mode !== 'free') continue;
      const b = document.createElement('button');
      b.className = 'phone-app';
      b.dataset.app = app.id;
      b.innerHTML = `<span class="phone-app-icon" style="--c:${app.color}">${icon(app.icon)}</span><span>${app.name}</span>`;
      b.addEventListener('click', () => this.open(app.id));
      this.home.appendChild(b);
    }
  }

  get visible() {
    return !this.el.classList.contains('hidden');
  }

  toggle() {
    if (this.visible) this.close();
    else this.open(null);
  }

  open(appId) {
    this.el.classList.remove('hidden');
    this.buildHome();
    if (appId) this.render(appId);
    else this.showHome();
    if (this.ctx.audio) this.ctx.audio.playChime('ui');
  }

  close() {
    this.el.classList.add('hidden');
    this.mapCanvas = null;
  }

  showHome() {
    this.openApp = null;
    this.home.classList.remove('hidden');
    this.view.classList.add('hidden');
    this.mapCanvas = null;
  }

  render(appId) {
    this.openApp = appId;
    this.home.classList.add('hidden');
    this.view.classList.remove('hidden');
    this.body.innerHTML = '';
    this.mapCanvas = null;
    if (appId === 'map') this.renderMap();
    else if (appId === 'radio') this.renderRadio();
    else if (appId === 'rides') this.renderRides();
    else if (appId === 'car') this.renderCars();
    else if (appId === 'settings') this.renderSettings();
  }

  renderMap() {
    const title = document.createElement('h3');
    title.textContent = 'Soest';
    this.body.appendChild(title);

    const tools = document.createElement('div');
    tools.className = 'phone-maptools';
    tools.innerHTML =
      '<button data-map="in" type="button">+</button>' +
      '<button data-map="out" type="button">−</button>' +
      '<button data-map="center" type="button">Ik</button>' +
      '<button data-map="clear" type="button">Wis</button>';
    this.body.appendChild(tools);

    const canvas = document.createElement('canvas');
    canvas.width = 620;
    canvas.height = 640;
    canvas.className = 'phone-map';
    this.body.appendChild(canvas);
    this.mapCanvas = canvas;
    this.mapView = { zoom: 2.0, panX: 0, panZ: 0 };
    this.drawMap();
    this.bindMap(canvas);

    tools.querySelectorAll('[data-map]').forEach((b) => {
      b.addEventListener('click', () => {
        const v = this.mapView;
        const a = b.dataset.map;
        if (a === 'in') v.zoom = Math.min(6, v.zoom * 1.45);
        else if (a === 'out') v.zoom = Math.max(0.7, v.zoom / 1.45);
        else if (a === 'center') { v.panX = 0; v.panZ = 0; }
        else this.ctx.onWaypoint(null);
        this.drawMap();
      });
    });

    const legend = document.createElement('p');
    legend.className = 'phone-note';
    legend.textContent = 'Sleep om te verschuiven, tik op de kaart om een waypoint te zetten.';
    this.body.appendChild(legend);

    if (this.ctx.network) {
      const list = document.createElement('div');
      list.className = 'phone-poi-list';
      for (const poi of POIS.slice(0, 14)) {
        const b = document.createElement('button');
        b.className = 'phone-poi';
        b.textContent = poi.name;
        b.addEventListener('click', () => {
          this.ctx.onWaypoint({ x: poi.x, z: poi.z });
        });
        list.appendChild(b);
      }
      this.body.appendChild(list);
    }
  }

  bindMap(canvas) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let moved = 0;
    let startPan = null;

    const toCanvas = (e) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / r.width) * canvas.width,
        y: ((e.clientY - r.top) / r.height) * canvas.height
      };
    };

    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      moved = 0;
      startX = e.clientX;
      startY = e.clientY;
      startPan = { x: this.mapView.panX, z: this.mapView.panZ };
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      moved = Math.max(moved, Math.hypot(dx, dy));
      if (moved > 4) {
        const state = { x: this.ctx.getPlayerX(), z: this.ctx.getPlayerZ() };
        const a = this.ctx.minimap.canvasToWorld(canvas, 0, 0, state, {
          zoom: this.mapView.zoom, panX: 0, panZ: 0
        });
        const b = this.ctx.minimap.canvasToWorld(canvas, canvas.width, 0, state, {
          zoom: this.mapView.zoom, panX: 0, panZ: 0
        });
        const metresPerPx = (b.x - a.x) / canvas.width;
        this.mapView.panX = startPan.x - dx * metresPerPx;
        this.mapView.panZ = startPan.z - dy * metresPerPx;
        this.drawMap();
      }
    });

    const finish = (e) => {
      if (!dragging) return;
      dragging = false;
      if (moved > 6) return;
      const p = toCanvas(e);
      const state = { x: this.ctx.getPlayerX(), z: this.ctx.getPlayerZ() };
      const wp = this.ctx.minimap.canvasToWorld(canvas, p.x, p.y, state, this.mapView);
      this.ctx.onWaypoint(wp);
      this.drawMap();
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', () => { dragging = false; });
  }

  drawMap() {
    if (!this.mapCanvas || !this.ctx.minimap) return;
    const game = this.ctx.game;
    this.ctx.minimap.drawFull(this.mapCanvas, {
      x: this.ctx.getPlayerX(),
      z: this.ctx.getPlayerZ(),
      heading: this.ctx.getPlayerHeading(),
      route: (this.ctx.taxi && this.ctx.taxi.route) || game.waypointRoute || null,
      target: this.ctx.taxi && this.ctx.taxi.target,
      waypoint: game.waypoint || null
    }, this.mapView);
  }

  renderRadio() {
    const h = document.createElement('h3');
    h.textContent = 'Radio';
    this.body.appendChild(h);
    const audio = this.ctx.audio;
    for (let i = 0; i < RADIO_STATIONS.length; i++) {
      const s = RADIO_STATIONS[i];
      const row = document.createElement('button');
      row.className = 'phone-row';
      row.innerHTML =
        `<span class="phone-dot" style="background:${s.color}"></span>` +
        `<span class="phone-row-copy"><b>${s.name}</b><small>${s.genre}</small></span>` +
        `<span class="phone-row-action">${audio.radioIndex === i ? 'Speelt' : 'Speel'}</span>`;
      row.addEventListener('click', () => {
        audio.playRadio(i);
        this.ctx.hud.setRadio(s.name, s.color);
        this.render('radio');
      });
      this.body.appendChild(row);
    }
    const now = document.createElement('p');
    now.className = 'phone-note';
    const track = audio.nowPlaying();
    now.textContent = audio.radioIndex >= 0
      ? (track ? `Nu op ${RADIO_STATIONS[audio.radioIndex].name}: ${track}` : 'De band is aan het inspelen…')
      : 'Kies een zender om te beginnen.';
    this.body.appendChild(now);
    const off = document.createElement('button');
    off.className = 'phone-row';
    off.innerHTML = '<span class="phone-dot" style="background:#4a5560"></span><span class="phone-row-copy"><b>Radio uit</b><small>Rust in de auto</small></span><span class="phone-row-action">Stop</span>';
    off.addEventListener('click', () => {
      audio.stopRadio();
      this.ctx.hud.setRadio(null);
      this.render('radio');
    });
    this.body.appendChild(off);

    const vol = document.createElement('label');
    vol.className = 'phone-slider';
    vol.innerHTML = `<span>Volume</span><input type="range" min="0" max="1" step="0.01" value="${audio.radioVolume}" />`;
    vol.querySelector('input').addEventListener('input', (e) => audio.setRadioVolume(parseFloat(e.target.value)));
    this.body.appendChild(vol);
  }

  renderRides() {
    const h = document.createElement('h3');
    h.textContent = 'Ritten';
    this.body.appendChild(h);
    const taxi = this.ctx.taxi;
    const money = document.createElement('div');
    money.className = 'phone-stats';
    money.innerHTML =
      `<div><small>Contant</small><b>${formatMoney(this.ctx.game.money)}</b></div>` +
      `<div><small>Ritten</small><b>${taxi ? taxi.completed : 0}</b></div>` +
      `<div><small>Beoordeling</small><b>${taxi ? taxi.rating.toFixed(1) : '5.0'}</b></div>`;
    this.body.appendChild(money);
    const note = document.createElement('p');
    note.className = 'phone-note';
    note.textContent = taxi && taxi.job
      ? `Nu: ${taxi.job.kind.label} — ${taxi.job.name} naar ${taxi.job.dest.name}`
      : 'Geen rit onderweg. Rijd rond of wacht op een klant.';
    this.body.appendChild(note);
  }

  renderCars() {
    const h = document.createElement('h3');
    h.textContent = 'Kies een auto';
    this.body.appendChild(h);
    const ids = ['taxi', 'compact', 'estate', 'van', 'sport', 'classic', 'police', 'ambulance', 'fire'];
    for (const id of ids) {
      const t = CAR_TYPES[id];
      const row = document.createElement('button');
      row.className = 'phone-row';
      row.innerHTML =
        `<span class="phone-dot" style="background:${t.color}"></span>` +
        `<span class="phone-row-copy"><b>${t.name}</b><small>${t.desc}</small></span>` +
        `<span class="phone-row-action">Pak</span>`;
      row.addEventListener('click', () => {
        this.ctx.onCarSelect(id);
        this.showHome();
      });
      this.body.appendChild(row);
    }
  }

  renderSettings() {
    const h = document.createElement('h3');
    h.textContent = 'Opties';
    this.body.appendChild(h);
    const g = this.ctx.game;

    const time = document.createElement('label');
    time.className = 'phone-slider';
    time.innerHTML = `<span>Tijd</span><input type="range" min="0" max="24" step="0.1" value="${g.time}" />`;
    time.querySelector('input').addEventListener('input', (e) => {
      g.time = parseFloat(e.target.value);
      g.cycle = false;
    });
    this.body.appendChild(time);

    const cycle = document.createElement('button');
    cycle.className = 'phone-row';
    cycle.innerHTML = `<span class="phone-row-copy"><b>Dag- en nachtcyclus</b><small>Laat de tijd doorlopen</small></span><span class="phone-row-action">${g.cycle ? 'Aan' : 'Uit'}</span>`;
    cycle.addEventListener('click', () => {
      g.cycle = !g.cycle;
      this.render('settings');
    });
    this.body.appendChild(cycle);

    const far = document.createElement('button');
    far.className = 'phone-row';
    far.innerHTML = `<span class="phone-row-copy"><b>Verre zichtafstand</b><small>Kost meer rekenkracht</small></span><span class="phone-row-action">${g.far ? 'Aan' : 'Uit'}</span>`;
    far.addEventListener('click', () => {
      g.far = !g.far;
      this.ctx.camera.far = g.far ? 2400 : 1400;
      this.ctx.camera.updateProjectionMatrix();
      this.render('settings');
    });
    this.body.appendChild(far);

    // adverts on or off (the boards stay; the pop-ups stop)
    const adsOn = g.ads !== false;
    const adsRow = document.createElement('button');
    adsRow.className = 'phone-row';
    adsRow.innerHTML = `<span class="phone-row-copy"><b>Advertenties</b><small>Pop-ups van EuroClix</small></span><span class="phone-row-action">${adsOn ? 'Aan' : 'Uit'}</span>`;
    adsRow.addEventListener('click', () => {
      g.ads = !adsOn;
      if (this.ctx.popups) this.ctx.popups.setEnabled(g.ads);
      this.render('settings');
    });
    this.body.appendChild(adsRow);
  }

  update() {
    if (this.timeEl) this.timeEl.textContent = formatClock(this.ctx.game.time);
    if (this.visible && this.openApp === 'map') {
      this.mapTimer = (this.mapTimer || 0) + 1;
      if (this.mapTimer % 10 === 0) this.drawMap();
    }
  }
}
