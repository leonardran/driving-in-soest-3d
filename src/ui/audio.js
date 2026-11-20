// Audio: the four radio stations (real tracks from the original game) plus a
// fully procedural engine, tyres, sirens, horn and UI sounds.

import { RADIO_STATIONS, RADIO_TALK } from '../world/data.js';
import { clamp } from '../core/util.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.radioIndex = -1;
    this.radioVolume = 0.55;
    this.sfxVolume = 0.8;
    this.masterVolume = 1;
    this.engineNodes = null;
    this.sirenNodes = null;
    this.currentLoad = 0;
  }

  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.ctx.resume();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.masterVolume;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.radioVolume;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.master);

    this.buildEngine();
    this.buildSkid();
    this.buildSiren();
    this.buildNoise();
    this.ready = true;

    // radio element
    this.radio = new Audio();
    this.radio.loop = true;
    this.radio.preload = 'none';
    this.radio.crossOrigin = 'anonymous';
    this.radioSource = this.ctx.createMediaElementSource(this.radio);
    this.radioSource.connect(this.musicGain);
  }

  buildNoise() {
    const len = 2 * this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  }

  buildEngine() {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.sfxGain);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    filter.Q.value = 3.2;
    filter.connect(out);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 60;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 30;
    const g1 = ctx.createGain();
    g1.gain.value = 0.32;
    const g2 = ctx.createGain();
    g2.gain.value = 0.16;
    osc1.connect(g1).connect(filter);
    osc2.connect(g2).connect(filter);

    // a bit of intake noise
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 900;
    nf.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.value = 0.05;
    noise.connect(nf).connect(ng).connect(filter);

    osc1.start();
    osc2.start();
    noise.start();

    this.engineNodes = { out, filter, osc1, osc2, ng, g1, g2 };
  }

  buildSkid() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2400;
    f.Q.value = 4;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start();
    this.skidNodes = { g, f };
  }

  buildSiren() {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.sfxGain);
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 700;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(osc.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    osc.connect(f).connect(out);
    osc.start();
    lfo.start();
    this.sirenNodes = { out, osc, lfo };
  }

  setEngine(rpm01, load, speed01) {
    if (!this.ready || !this.engineNodes) return;
    const n = this.engineNodes;
    const freq = 42 + rpm01 * 165;
    n.osc1.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.05);
    n.osc2.frequency.setTargetAtTime(freq * 0.5, this.ctx.currentTime, 0.05);
    n.filter.frequency.setTargetAtTime(420 + rpm01 * 1800 + load * 500, this.ctx.currentTime, 0.08);
    n.out.gain.setTargetAtTime(0.035 + load * 0.12 + speed01 * 0.05, this.ctx.currentTime, 0.09);
  }

  setSkid(amount) {
    if (!this.ready || !this.skidNodes) return;
    this.skidNodes.g.gain.setTargetAtTime(clamp(amount, 0, 1) * 0.16, this.ctx.currentTime, 0.05);
  }

  setSiren(volume, on) {
    if (!this.ready || !this.sirenNodes) return;
    this.sirenNodes.out.gain.setTargetAtTime(on ? clamp(volume, 0, 1) * 0.07 : 0, this.ctx.currentTime, 0.15);
  }

  playRadio(index) {
    if (!this.ready) return;
    if (index < 0 || index >= RADIO_STATIONS.length) {
      this.stopRadio();
      return;
    }
    if (this.radioIndex === index && !this.radio.paused) return;
    this.radioIndex = index;
    const station = RADIO_STATIONS[index];
    this.radio.src = station.file;
    this.radio.volume = 1;
    const p = this.radio.play();
    if (p && p.catch) p.catch(() => {});
    this.musicGain.gain.setTargetAtTime(this.radioVolume, this.ctx.currentTime, 0.2);
  }

  stopRadio() {
    this.radioIndex = -1;
    if (this.radio) {
      this.radio.pause();
      this.radio.removeAttribute('src');
    }
  }

  nextRadio() {
    if (!this.ready) return -1;
    const next = (this.radioIndex + 1) % (RADIO_STATIONS.length + 1) - 1;
    if (next < 0) this.stopRadio();
    else this.playRadio(next);
    return next;
  }

  playTalk() {
    if (!this.ready) return;
    const file = RADIO_TALK[(Math.random() * RADIO_TALK.length) | 0];
    const a = new Audio(file);
    a.volume = this.radioVolume * 0.9;
    a.play().catch(() => {});
  }

  setRadioVolume(v) {
    this.radioVolume = v;
    if (this.ready) this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setSfxVolume(v) {
    this.sfxVolume = v;
    if (this.ready) this.sfxGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  blip(freq, dur, type = 'sine', gain = 0.2, slideTo = null) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(this.sfxGain);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  playChime(kind) {
    if (!this.ready) return;
    if (kind === 'cash') {
      this.blip(880, 0.12, 'triangle', 0.16);
      setTimeout(() => this.blip(1320, 0.16, 'triangle', 0.14), 90);
      setTimeout(() => this.blip(1760, 0.22, 'triangle', 0.12), 190);
    } else if (kind === 'job') {
      this.blip(660, 0.16, 'sine', 0.14);
      setTimeout(() => this.blip(990, 0.22, 'sine', 0.12), 120);
    } else if (kind === 'board') {
      this.blip(520, 0.1, 'sine', 0.1, 780);
    } else if (kind === 'crash') {
      this.blip(120, 0.18, 'sawtooth', 0.18, 60);
    } else if (kind === 'ui') {
      this.blip(1040, 0.06, 'sine', 0.07);
    }
  }

  horn() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    for (const f of [392, 466]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(0.09, now + 0.015);
      g.gain.setValueAtTime(0.09, now + 0.28);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      o.connect(g).connect(this.sfxGain);
      o.start(now);
      o.stop(now + 0.42);
    }
  }
}
