// All the DOM writing for the heads-up display.

import { formatMoney, formatDistance, formatClock, clamp } from '../core/util.js';
import { TURN_GLYPH } from '../gameplay/nav.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'),
      missionKicker: $('missionKicker'),
      missionTitle: $('missionTitle'),
      missionSub: $('missionSub'),
      missionFare: $('missionFare'),
      navArrow: $('navArrow'),
      navInstruction: $('navInstruction'),
      navDetail: $('navDetail'),
      navDistance: $('navDistance'),
      navEta: $('navEta'),
      navProgress: $('navProgress'),
      navCard: $('navCard'),
      speed: $('speedValue'),
      gear: $('gearValue'),
      dial: $('dialFill'),
      fuel: $('fuelFill'),
      clock: $('clockTime'),
      phase: $('clockPhase'),
      wanted: $('wanted'),
      radioName: $('radioName'),
      radioDot: $('radioDot'),
      wallet: $('walletValue'),
      notice: $('notice'),
      prompt: $('prompt')
    };
    this.noticeTimer = 0;
    this.promptText = '';
    this.lastSpeed = -1;
    this.dialCircumference = 2 * Math.PI * 52;
    if (this.el.dial) {
      this.el.dial.style.strokeDasharray = String(this.dialCircumference);
      this.el.dial.style.strokeDashoffset = String(this.dialCircumference);
    }
    this.buildWanted();
  }

  show(v) {
    this.el.hud.classList.toggle('hidden', !v);
  }

  buildWanted() {
    const w = this.el.wanted;
    if (!w) return;
    w.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const s = document.createElement('i');
      w.appendChild(s);
    }
  }

  setWanted(n) {
    const w = this.el.wanted;
    if (!w) return;
    const stars = w.children;
    for (let i = 0; i < stars.length; i++) stars[i].classList.toggle('on', i < n);
    w.classList.toggle('active', n > 0);
  }

  setMission(kicker, title, sub, fare) {
    this.el.missionKicker.textContent = kicker || '';
    this.el.missionTitle.textContent = title || '';
    this.el.missionSub.textContent = sub || '';
    this.el.missionFare.textContent = fare || '';
    this.el.missionFare.style.opacity = fare ? '1' : '0';
  }

  setNav(guidance, remaining, total, eta) {
    if (!guidance) {
      this.el.navCard.classList.add('hidden');
      return;
    }
    this.el.navCard.classList.remove('hidden');
    this.el.navInstruction.textContent = guidance.text || '';
    this.el.navArrow.textContent = TURN_GLYPH[guidance.turn] || '↑';
    // under the instruction: how far to the junction, and where it takes you
    let detail;
    if (guidance.turn === 'arrive') detail = 'U bent er bijna';
    else if (guidance.street) detail = formatDistance(guidance.distance) + ' · ' + guidance.street;
    else if (guidance.distance > 3) detail = formatDistance(guidance.distance) + ' vooruit';
    else detail = 'Volg de blauwe lijn';
    this.el.navDetail.textContent = detail;
    this.el.navDistance.textContent = remaining != null ? formatDistance(remaining) : '';
    if (this.el.navEta) {
      // the row a navigation app puts under the turn: arrival, time, distance
      if (eta && eta.minutes > 0) {
        this.el.navEta.textContent =
          formatClock(eta.arrive) + ' · ' + Math.max(1, Math.round(eta.minutes)) + ' min';
      } else {
        this.el.navEta.textContent = '';
      }
    }
    const p = total > 0 ? clamp(1 - (remaining || 0) / total, 0, 1) : 0;
    this.el.navProgress.style.width = (p * 100).toFixed(1) + '%';
  }

  setSpeed(kmh, gear, fuel) {
    const v = Math.round(Math.abs(kmh));
    if (v !== this.lastSpeed) {
      this.el.speed.textContent = String(v);
      this.lastSpeed = v;
    }
    this.el.gear.textContent = gear || 'N';
    const t = clamp(Math.abs(kmh) / 160, 0, 1);
    this.el.dial.style.strokeDashoffset = String(this.dialCircumference * (1 - t));
    this.el.dial.style.stroke = t > 0.78 ? '#e2583c' : t > 0.5 ? '#f2c230' : '#6fd3a0';
    if (fuel != null) this.el.fuel.style.width = clamp(fuel, 0, 100).toFixed(1) + '%';
  }

  setClock(hours, night) {
    this.el.clock.textContent = formatClock(hours);
    let phase = 'Dag';
    if (hours < 5.5 || hours > 22) phase = 'Nacht';
    else if (hours < 8) phase = 'Ochtend';
    else if (hours > 19) phase = 'Avond';
    this.el.phase.textContent = phase;
    void night;
  }

  setRadio(name, color) {
    this.el.radioName.textContent = name || 'Radio uit';
    this.el.radioDot.style.background = color || '#4a5560';
    this.el.radioDot.classList.toggle('live', !!name);
  }

  setWallet(n) {
    this.el.wallet.textContent = formatMoney(n);
  }

  toast(text, seconds = 2.6) {
    const n = this.el.notice;
    n.textContent = text;
    n.classList.add('show');
    this.noticeTimer = seconds;
  }

  prompt(text) {
    if (text === this.promptText) return;
    this.promptText = text;
    const p = this.el.prompt;
    if (!text) {
      p.classList.remove('show');
      p.textContent = '';
      return;
    }
    p.textContent = text;
    p.classList.add('show');
  }

  update(dt) {
    if (this.noticeTimer > 0) {
      this.noticeTimer -= dt;
      if (this.noticeTimer <= 0) this.el.notice.classList.remove('show');
    }
  }
}
