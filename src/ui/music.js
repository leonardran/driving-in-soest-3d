// Procedural radio music.
//
// The original game shipped four 8-second music loops, which is why every
// station sounded like the same four bars over and over. This is a small
// generative band instead: a chord progression, a drum kit, a bass line and a
// melody that is re-written every eight bars, so a station can play for an hour
// without repeating itself.

const STEPS = 16; // sixteenth notes per bar

const DRUMS = {
  pop: {
    kick: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    bass: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0]
  },
  lofi: {
    kick: [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    hat: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    bass: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  },
  four: {
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    open: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    bass: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]
  },
  rock: {
    kick: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
    bass: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]
  }
};

/**
 * Four stations, each a key, a tempo and a progression. Chord notes are
 * semitones above the station's root note.
 */
export const MUSIC_STATIONS = {
  soestfm: {
    title: 'Zomeravond',
    bpm: 98, root: 57, drums: 'pop', pad: true, lead: true, swing: 0.02,
    scale: [0, 2, 3, 5, 7, 8, 10],
    chords: [[0, 3, 7, 10], [-4, 0, 3, 7], [3, 7, 10, 14], [-2, 2, 5, 7]],
    tracks: ['Zomeravond', 'Soester Duinen', 'Lange Jaap', 'Marktplein', 'Vrijdagavond', 'Kerkstraat']
  },
  duinen: {
    title: 'Duinpad',
    bpm: 78, root: 50, drums: 'lofi', pad: true, lead: true, swing: 0.06,
    scale: [0, 2, 3, 5, 7, 9, 10],
    chords: [[0, 3, 7, 10], [5, 8, 12, 15], [8, 12, 15, 19], [7, 11, 14, 17]],
    tracks: ['Duinpad', 'Zand en wind', 'Late trein', 'Kaarslicht', 'Wandelpad', 'Stille straat']
  },
  eemland: {
    title: 'Hartslag',
    bpm: 116, root: 48, drums: 'pop', pad: true, lead: true, swing: 0,
    scale: [0, 2, 4, 5, 7, 9, 11],
    chords: [[0, 4, 7, 11], [7, 11, 14, 17], [9, 12, 16, 19], [5, 9, 12, 16]],
    tracks: ['Hartslag', 'Zon op de A1', 'Alles of niets', 'Stadslucht', 'Doorrijden', 'Nachtdienst']
  },
  nachtrit: {
    title: 'Neonbaan',
    bpm: 122, root: 54, drums: 'four', pad: true, lead: true, swing: 0,
    scale: [0, 2, 3, 5, 7, 8, 10],
    chords: [[0, 3, 7], [-4, 0, 3], [-3, 1, 4], [-6, -2, 2]],
    tracks: ['Neonbaan', 'Kilometerpaal', 'Middernacht', 'Rode lichten', 'Snelweggeest', 'Koude start']
  }
};

const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

export class RadioMusic {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(dest);

    // a small plate reverb, so the band sounds like it is in a room
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(1.8);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.3;
    this.reverb.connect(this.wet);
    this.wet.connect(this.bus);

    this.timer = null;
    this.config = null;
    this.volume = 0.5;
    this.ducked = false;
    this.step = 0;
    this.bar = 0;
    this.nextTime = 0;
    this.melody = new Map();
    this.intensity = 0;
  }

  makeImpulse(seconds) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6);
      }
    }
    return buf;
  }

  // --- station control ----------------------------------------------------

  setStation(config) {
    if (!config) return;
    if (this.config === config) return;
    this.config = config;
    this.step = 0;
    this.bar = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.planSection();
  }

  get playing() {
    return this.timer !== null;
  }

  start() {
    if (this.timer !== null || !this.config) return;
    this.nextTime = Math.max(this.nextTime, this.ctx.currentTime + 0.08);
    this.timer = setInterval(() => this.tick(), 25);
    this.applyGain();
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.bus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
  }

  setVolume(v) {
    this.volume = v;
    this.applyGain();
  }

  /** Music drops back while a jingle or the presenter is talking. */
  duck(on) {
    this.ducked = on;
    this.applyGain();
  }

  applyGain() {
    const target = this.playing ? this.volume * 0.5 * (this.ducked ? 0.22 : 1) : 0;
    this.bus.gain.setTargetAtTime(target, this.ctx.currentTime, 0.15);
  }

  /** The name of the piece currently playing, for the phone and the HUD. */
  nowPlaying() {
    if (!this.config) return '';
    const list = this.config.tracks || [this.config.title || 'Radio'];
    return list[Math.floor(this.bar / 16) % list.length];
  }

  // --- sequencing ---------------------------------------------------------

  get beatDur() {
    return 60 / this.config.bpm;
  }

  get stepDur() {
    return this.beatDur / 4;
  }

  tick() {
    const ctx = this.ctx;
    if (!this.config || ctx.state !== 'running') return;
    // after a suspended context the clock can be far behind: never try to
    // schedule a backlog of steps into the past
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    const horizon = ctx.currentTime + 0.3;
    let guard = 0;
    while (this.nextTime < horizon && guard++ < 64) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += this.stepDur;
      this.step++;
      if (this.step >= STEPS) {
        this.step = 0;
        this.bar++;
        if (this.bar % 8 === 0) this.planSection();
      }
    }
  }

  /**
   * Every eight bars the band changes gear: a new intensity, and a fresh
   * four-bar melody built from a rhythmic figure so it repeats as a phrase
   * rather than as a random walk.
   */
  planSection() {
    const cfg = this.config;
    if (!cfg) return;
    const section = Math.floor(this.bar / 8);
    // alternate between a full band and a stripped-back passage
    this.intensity = section % 3 === 0 ? 2 : section % 3 === 1 ? 1 : 1;
    if (section === 0) this.intensity = 1;

    const rests = [0, 1, 2, 3, 4, 6];
    const lens = [2, 2, 3, 4];
    const figure = [];
    let pos = 0;
    while (pos < 64) {
      pos += rests[Math.floor(Math.random() * rests.length)];
      if (pos >= 64) break;
      figure.push({ at: pos, len: lens[Math.floor(Math.random() * lens.length)], deg: Math.floor(Math.random() * 9) });
      pos += 3 + Math.floor(Math.random() * 4);
    }

    // the phrase plays twice: the second time an octave of colour higher
    this.melody = new Map();
    for (const n of figure) {
      this.melody.set(n.at, { len: n.len, deg: n.deg });
      this.melody.set(n.at + 64, { len: n.len, deg: n.deg + (Math.random() < 0.4 ? 1 : 0) });
    }
    this.melodySection = section;
  }

  chordAt(bar) {
    const cfg = this.config;
    const idx = Math.floor(bar / 2) % cfg.chords.length;
    return cfg.chords[idx];
  }

  /** A melody degree mapped onto the station's scale, snapped to the chord. */
  melodyNote(deg, chord, strong) {
    const scale = this.config.scale;
    const oct = Math.floor(deg / scale.length);
    let semi = scale[deg % scale.length] + oct * 12;
    if (strong) {
      // on a strong beat, land on the nearest chord tone
      let best = semi;
      let bestDist = 99;
      for (const c of chord) {
        const cand = c + oct * 12;
        const dist = Math.abs(cand - semi);
        if (dist < bestDist) { bestDist = dist; best = cand; }
      }
      semi = best;
    }
    return this.config.root + 12 + semi;
  }

  playStep(step, time) {
    const cfg = this.config;
    const bar = this.bar;
    const chord = this.chordAt(bar);
    const kit = DRUMS[cfg.drums];
    const swing = (step % 2 === 1 ? cfg.swing : 0) * this.stepDur;
    const t = time + swing;
    const fill = bar % 8 === 7 && step > 11;

    // drums
    if (kit.kick[step] || (fill && step % 2 === 0)) this.kick(t, step === 0 ? 1 : 0.8);
    if (kit.snare[step] || (fill && step === 14)) this.snare(t, 0.5);
    if (kit.hat && kit.hat[step]) this.hat(t, step % 4 === 0 ? 0.16 : 0.1);
    if (kit.open && kit.open[step]) this.hat(t, 0.22, 0.16);

    // bass, on the chord root, walking to the fifth on the last beat
    if (kit.bass[step]) {
      const note = step === 14 ? chord[0] + 7 : chord[0];
      this.bass(t, cfg.root - 12 + note, this.stepDur * 1.7);
    }

    // pad: a chord on beat one, held for the bar
    if (step === 0 && cfg.pad) {
      this.pad(t, chord, this.beatDur * 3.6);
    }

    // lead melody
    if (cfg.lead && this.intensity > 0) {
      const note = this.melody.get(bar * STEPS + step - (this.melodySection * 8 * STEPS));
      if (note) {
        const midi = this.melodyNote(note.deg, chord, step % 4 === 0);
        this.lead(t, midi, note.len * this.stepDur * 0.9);
      }
    }
  }

  // --- instruments --------------------------------------------------------

  voice(peak, t, attack, decay, toReverb = 0.2) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.bus);
    if (toReverb > 0) {
      const send = ctx.createGain();
      send.gain.value = toReverb;
      g.connect(send);
      send.connect(this.reverb);
    }
    return g;
  }

  kick(t, level = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
    const g = this.voice(0.5 * level, t, 0.004, 0.26, 0.05);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.32);
  }

  noiseBurst(t, freqHz, q, peak, decay, type = 'bandpass') {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer || (this.noiseBuffer = this.makeNoise());
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freqHz;
    f.Q.value = q;
    const g = this.voice(peak, t, 0.003, decay, 0.16);
    src.connect(f);
    f.connect(g);
    src.start(t);
    src.stop(t + decay + 0.05);
  }

  makeNoise() {
    const rate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, rate, rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  snare(t, level = 1) {
    this.noiseBurst(t, 1900, 0.8, 0.22 * level, 0.16);
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.1);
    const g = this.voice(0.12 * level, t, 0.004, 0.12, 0.1);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.18);
  }

  hat(t, peak, decay = 0.045) {
    this.noiseBurst(t, 8200, 1.2, peak, decay, 'highpass');
  }

  bass(t, midi, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq(midi);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(620, t);
    f.frequency.exponentialRampToValueAtTime(240, t + dur);
    f.Q.value = 3;
    const g = this.voice(0.26, t, 0.01, dur, 0.05);
    o.connect(f);
    f.connect(g);
    o.start(t);
    o.stop(t + dur + 0.08);
  }

  pad(t, chord, dur) {
    const ctx = this.ctx;
    const g = this.voice(0.075, t, 0.35, dur, 0.35);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1500;
    f.Q.value = 0.6;
    f.connect(g);
    for (const semi of chord) {
      for (const detune of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = freq(this.config.root + 12 + semi);
        o.detune.value = detune;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.4);
      }
    }
  }

  lead(t, midi, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq(midi);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq(midi + 12);
    const g = this.voice(0.13, t, 0.01, Math.max(0.09, dur), 0.4);
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    o.start(t);
    o.stop(t + dur + 0.2);
    o2.start(t);
    o2.stop(t + dur + 0.2);
  }
}
