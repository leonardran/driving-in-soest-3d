// All the DOM writing for the heads-up display.

import { formatMoney, formatDistance, formatClock, clamp } from '../core/util.js';

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

  setNav(guidance, remaining) {
    if (!guidance) {
      this.el.navCard.classList.add('hidden');
      return;
    }
    this.el.navCard.classList.remove('hidden');
    this.el.navInstruction.textContent = guidance.text || '';
    this.el.navDetail.textContent = guidance.turn === 'arrive' ? 'Je bent er bijna' : 'Volg de blauwe lijn';
    this.el.navDistance.textContent = remaining != null ? formatDistance(remaining) : '';
    const arrows = { left: '←', right: '→', straight: '↑', uturn: '⤺', arrive: '●' };
    this.el.navArrow.textContent = arrows[guidance.turn] || '↑';
    const p = clamp(1 - (remaining || 0) / 600, 0, 1);
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
