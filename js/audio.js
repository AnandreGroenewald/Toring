// Stapel — klank en vibrasie (sound effects + haptics).
// No audio files: every sound is synthesised from oscillators, a few noise
// buffers made once per context, filters and envelopes. All timing uses
// AudioParam automation scheduled up front, so there is no per-frame JS.
// Chain: voice gain -> master gain -> gentle compressor -> soft-clip -> speakers.
// The context is created lazily on the first user gesture (see bottom of the
// audio section); before that every call is a silent no-op.

const FLOOR = 0.0001;        // exponential ramps cannot reach 0
const MASTER_LEVEL = 0.8;
const MAX_VOICES = 24;       // hard cap on simultaneously sounding voices
const DEFAULT_LIMIT = 2;

// Simultaneous voices allowed per sound name.
const LIMIT = {
  hail: 4, land: 3, creak: 1, click: 3, perfect: 3, warning: 1, rain: 1,
  zap: 1, wind: 2, freeze: 2, fog: 1, heat: 1, thunder: 2, splash: 3, gull: 1,
};
// Minimum ms between two starts of the same sound.
const THROTTLE = {
  creak: 400, hail: 45, warning: 600, wind: 250, rain: 300, zap: 250,
  freeze: 90, land: 35, splash: 70, click: 35, drop: 60, thunder: 200,
  banner: 250, heart: 200, record: 400, gameover: 400, fog: 400, heat: 400, gull: 2000,
};
// At the per-name limit these steal the oldest voice; all others skip the new one.
const STEAL = new Set([
  'perfect', 'good', 'skew', 'lost', 'land', 'drop', 'click', 'splash',
  'thunder', 'banner', 'gameover', 'record', 'heart', 'rainbow',
]);
// Per-sound output trim, balanced with the offline level test (perfect loudest).
const LEVEL = {
  click: 1.0, drop: 0.63, land: 1.05, perfect: 1.6, good: 1.0, skew: 0.73,
  lost: 0.22, splash: 0.99, creak: 0.85, heart: 0.72, wind: 0.9, rain: 0.41,
  thunder: 1.0, zap: 0.39, hail: 0.44, heat: 0.27, rainbow: 0.7, fog: 0.143,
  warning: 0.22, gameover: 0.75, record: 0.62, banner: 0.4, freeze: 0.6, gull: 0.1,
};

const PENTA = [0, 2, 4, 7, 9];   // major pentatonic (semitones)

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const num = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const noop = () => {};

/** Note (midi) of scale degree d of C major pentatonic, degree 0 = C5. */
const pentaNote = (d) => 72 + 12 * Math.floor(d / 5) + PENTA[((d % 5) + 5) % 5];

// ---------------------------------------------------------------------------
// Noise buffers (made once per context, looped from random offsets)
// ---------------------------------------------------------------------------
const bufferCache = new WeakMap();

function normalise(d) {
  let max = 0;
  for (let i = 0; i < d.length; i++) max = Math.max(max, Math.abs(d[i]));
  if (max > 0) for (let i = 0; i < d.length; i++) d[i] /= max;
}

function makeBuffers(ctx) {
  const sr = ctx.sampleRate;
  const mk = (sec) => ctx.createBuffer(1, Math.floor(sr * sec), sr);

  const white = mk(1);
  const w = white.getChannelData(0);
  for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;

  // Pink (Paul Kellet's economy filter) — softer hiss for wind.
  const pink = mk(2);
  const p = pink.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < p.length; i++) {
    const x = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + x * 0.099046;
    b1 = 0.963 * b1 + x * 0.2965164;
    b2 = 0.57 * b2 + x * 1.0526913;
    p[i] = b0 + b1 + b2 + x * 0.1848;
  }
  normalise(p);

  // Brown (leaky integrated white) — deep rumble for thunder.
  const brown = mk(2);
  const r = brown.getChannelData(0);
  let last = 0;
  for (let i = 0; i < r.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    r[i] = last;
  }
  normalise(r);

  // Crackle: sparse decaying impulses — rain pitter, electric crackle.
  const crackle = mk(1);
  const c = crackle.getChannelData(0);
  const density = 140 / sr;
  for (let i = 0; i < c.length; i++) {
    if (Math.random() >= density) continue;
    const amp = 0.25 + 0.75 * Math.random();
    const len = Math.floor((0.0004 + Math.random() * 0.0025) * sr);
    for (let j = 0; j < len && i + j < c.length; j++) {
      c[i + j] += (Math.random() * 2 - 1) * amp * Math.exp(-j / (len * 0.3));
    }
  }
  normalise(c);

  return { white, pink, brown, crackle };
}

function buffersFor(ctx) {
  let b = bufferCache.get(ctx);
  if (!b) {
    b = makeBuffers(ctx);
    bufferCache.set(ctx, b);
  }
  return b;
}

// ---------------------------------------------------------------------------
// Voice: owns every node of one sound; disconnects them all when it ends.
// ---------------------------------------------------------------------------
class Voice {
  constructor(ctx, dest, t, name, level) {
    this.ctx = ctx;
    this.name = name;
    this.t = t;
    this.end = t;
    this.dead = false;
    this.nodes = [];
    this.sources = [];
    this.out = ctx.createGain();
    this.out.gain.value = level;
    this.out.connect(dest);
    this.nodes.push(this.out);
  }

  /** Gain node connected to `to` (pass null for a free-standing modulation depth). */
  gain(value, to = this.out) {
    const g = this.ctx.createGain();
    g.gain.value = value;
    if (to) g.connect(to);
    this.nodes.push(g);
    return g;
  }

  filter(type, freq, q, to = this.out) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(to);
    this.nodes.push(f);
    return f;
  }

  /** Gain node: silent at t, linear attack to peak, exponential decay. */
  env(to, t, peak, attack, decay) {
    const g = this.gain(0, to);
    const p = g.gain;
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + attack);
    p.exponentialRampToValueAtTime(FLOOR, t + attack + decay);
    return g;
  }

  /** Gain node: attack, hold at peak, exponential release. */
  envHold(to, t, peak, attack, hold, release) {
    const g = this.gain(0, to);
    const p = g.gain;
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + attack);
    p.setValueAtTime(peak, t + attack + hold);
    p.exponentialRampToValueAtTime(FLOOR, t + attack + hold + release);
    return g;
  }

  osc(type, freq, t, dur, to, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    o.connect(to);
    o.start(t);
    o.stop(t + dur);
    this.track(o, t + dur);
    return o;
  }

  noise(buffer, t, dur, to, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    if (rate !== 1) s.playbackRate.setValueAtTime(rate, t);
    s.connect(to);
    s.start(t, Math.random() * Math.max(0, buffer.duration - 0.1));
    s.stop(t + dur);
    this.track(s, t + dur);
    return s;
  }

  /** Low-frequency oscillator modulating `param` by ±depth. */
  lfo(rate, depth, param, t, dur, type = 'sine') {
    const g = this.gain(depth, param);
    return this.osc(type, rate, t, dur, g);
  }

  track(src, stopAt) {
    this.sources.push(src);
    this.nodes.push(src);
    if (stopAt > this.end) this.end = stopAt;
  }

  /** Called once all nodes are built: dispose when the last source ends. */
  arm() {
    let left = this.sources.length;
    if (!left) {
      this.dispose();
      return;
    }
    const done = () => {
      left -= 1;
      if (left <= 0) this.dispose();
    };
    for (const s of this.sources) s.onended = done;
  }

  /** Quick fade-out (voice stealing / mute). */
  stop(at) {
    if (this.dead) return;
    const g = this.out.gain;
    try {
      g.cancelScheduledValues(at);
      g.setValueAtTime(g.value, at);
      g.linearRampToValueAtTime(0, at + 0.03);
    } catch (e) { /* ignore */ }
    for (const s of this.sources) {
      try { s.stop(at + 0.035); } catch (e) { /* already stopped */ }
    }
    this.end = Math.min(this.end, at + 0.035);
  }

  dispose() {
    if (this.dead) return;
    this.dead = true;
    for (const n of this.nodes) {
      try { n.disconnect(); } catch (e) { /* ignore */ }
    }
    for (const s of this.sources) s.onended = null;
    this.nodes.length = 0;
    this.sources.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------

/** Bell / marimba note: two detuned sines + quick octave + mallet overtone. */
function bell(v, t, f, peak, decay, bright = 1, to = v.out) {
  v.osc('sine', f, t, decay + 0.02, v.env(to, t, peak, 0.003, decay));
  v.osc('sine', f, t, decay * 0.8 + 0.02, v.env(to, t, peak * 0.35, 0.003, decay * 0.8), 5);
  if (bright > 0) {
    v.osc('sine', f * 2, t, decay * 0.35 + 0.02, v.env(to, t, peak * 0.3 * bright, 0.002, decay * 0.35));
    if (bright >= 0.5 && f * 4 < 9000) {
      v.osc('sine', f * 4.01, t, 0.08, v.env(to, t, peak * 0.18 * bright, 0.001, 0.06));
    }
  }
}

/** Single soft sine ping. */
function ping(v, t, f, peak, decay, to = v.out) {
  v.osc('sine', f, t, decay + 0.02, v.env(to, t, peak, 0.002, decay));
}

/** Brassy note: two detuned saws through an opening lowpass. Returns the oscillators. */
function brass(v, t, f, hold, peak, to = v.out) {
  const g = v.envHold(to, t, peak, 0.018, hold, 0.14);
  const lp = v.filter('lowpass', f * 1.5, 1.4, g);
  const c = lp.frequency;
  c.setValueAtTime(f * 1.2, t);
  c.linearRampToValueAtTime(Math.min(9000, f * 7), t + 0.035);
  c.exponentialRampToValueAtTime(Math.min(6000, f * 3.2), t + 0.035 + Math.max(0.05, Math.min(0.25, hold)));
  const dur = hold + 0.18;
  return [v.osc('sawtooth', f, t, dur, lp, -7), v.osc('sawtooth', f, t, dur, lp, 7)];
}

/** Filtered-noise whoosh with a frequency sweep (from -> to Hz). */
function whoosh(v, B, t, dur, from, to, q, peak, attack, buf = B.white) {
  const g = v.env(v.out, t, peak, attack, Math.max(0.02, dur - attack));
  const bp = v.filter('bandpass', from, q, g);
  bp.frequency.setValueAtTime(from, t);
  bp.frequency.exponentialRampToValueAtTime(to, t + dur);
  v.noise(buf, t, dur + 0.02, bp);
  return bp;
}

// Each sound: (voice, startTime, opts, buffers). Keep every sound < 1.2 s.
const SOUNDS = {
  click(v, t) {
    const o = v.osc('triangle', 1500, t, 0.06, v.env(v.out, t, 0.6, 0.001, 0.045));
    o.frequency.exponentialRampToValueAtTime(1050, t + 0.025);
    ping(v, t, 3100, 0.12, 0.015);
  },

  drop(v, t, o, B) {
    // Latch release click + a falling whoosh.
    const lc = v.filter('bandpass', 1900, 1.6, v.env(v.out, t, 0.45, 0.001, 0.03));
    const sq = v.osc('square', 1700, t, 0.04, lc);
    sq.frequency.exponentialRampToValueAtTime(1150, t + 0.02);
    whoosh(v, B, t + 0.01, 0.28, rand(2300, 2700), 520, 1.3, 0.75, 0.05);
  },

  land(v, t, o, B) {
    const I = clamp(num(o.intensity, 0.6), 0, 1);
    const S = clamp(num(o.size, 0.5), 0, 1);
    v.out.gain.value *= 0.4 + 0.6 * I;
    const f0 = (190 - 70 * S) * (0.9 + 0.25 * I) * rand(0.95, 1.05);
    // Pitched-down sine knock: the deep body of the thud (headphones / bigger speakers).
    const knock = v.osc('sine', f0 * 1.9, t, 0.36, v.env(v.out, t, 0.8, 0.002, 0.17 + 0.13 * S));
    knock.frequency.exponentialRampToValueAtTime(f0, t + 0.035);
    knock.frequency.exponentialRampToValueAtTime(f0 * 0.75, t + 0.3);
    // Hollow wooden box resonance an octave up, so phone speakers (no bass) still get the thud.
    const box = v.osc('triangle', f0 * 2.6, t, 0.14, v.env(v.out, t, 0.42, 0.002, 0.1));
    box.frequency.exponentialRampToValueAtTime(f0 * 2, t + 0.05);
    // Short woody "tok" partials.
    const ft = (640 - 260 * S) * rand(0.94, 1.06);
    ping(v, t, ft, 0.4, 0.05);
    ping(v, t, ft * 2.32, 0.14, 0.03);
    // Lowpassed noise for the contact grit.
    const lp = v.filter('lowpass', 700 + 2400 * I, 0.8, v.env(v.out, t, 0.25 + 0.45 * I, 0.001, 0.05 + 0.04 * S));
    v.noise(B.white, t, 0.12, lp);
  },

  perfect(v, t, o, B) {
    const combo = Math.max(1, Math.round(num(o.combo, 1)));
    const k = combo - 1;
    const wrapped = k >= 10;                          // after two octaves, cycle the top octave
    const deg = wrapped ? 5 + ((k - 5) % 5) : k;
    const m = pentaNote(deg);
    const f = mtof(m);
    // Mallet strike transient.
    const hp = v.filter('highpass', 4500, 0.7, v.env(v.out, t, 0.14, 0.001, 0.02));
    v.noise(B.white, t, 0.04, hp);
    bell(v, t, f, 0.48, 0.85, 1);
    ping(v, t, f / 2, 0.12, 0.28);                    // warm body under the chime
    if (wrapped) bell(v, t, f * 2, 0.14, 0.55, 0.4);  // octave doubling keeps high combos exciting
    if (combo >= 3) {
      // Shimmer: a quick pentatonic run an octave above, growing with the combo.
      const n = Math.min(6, combo - 1);
      for (let i = 0; i < n; i++) {
        let fm = mtof(pentaNote(deg + 5 + i));
        while (fm > 4200) fm /= 2;
        ping(v, t + 0.045 + i * 0.042, fm, 0.11 - i * 0.01, 0.32);
      }
    }
  },

  good(v, t) {
    bell(v, t, mtof(67), 0.42, 0.32, 0.8);            // G4 marimba tok
    ping(v, t + 0.055, mtof(74), 0.14, 0.22);         // light D5 answer
  },

  skew(v, t) {
    // Dull, slightly sour "bonk" that bends down.
    const lp = v.filter('lowpass', 1500, 0.9, v.env(v.out, t, 0.6, 0.004, 0.2));
    for (const det of [0, 38]) {
      const o = v.osc('triangle', 330, t, 0.24, lp, det);
      o.frequency.exponentialRampToValueAtTime(262, t + 0.14);
    }
  },

  lost(v, t) {
    // Descending cartoon "boop" with a wobble at the end.
    const g = v.envHold(v.out, t, 0.55, 0.012, 0.22, 0.28);
    const lp = v.filter('lowpass', 1700, 0.8, g);
    const a = v.osc('triangle', 540, t, 0.54, lp);
    a.frequency.exponentialRampToValueAtTime(125, t + 0.48);
    const b = v.osc('sine', 270, t, 0.54, g);
    b.frequency.exponentialRampToValueAtTime(62, t + 0.48);
    v.lfo(9, 14, a.frequency, t + 0.12, 0.42);
  },

  splash(v, t, o, B) {
    whoosh(v, B, t, 0.5, 2800, 340, 1.1, 0.9, 0.008);
    const plop = v.osc('sine', 430, t, 0.16, v.env(v.out, t, 0.45, 0.003, 0.13));
    plop.frequency.exponentialRampToValueAtTime(110, t + 0.12);
    for (let i = 0; i < 4; i++) {
      const st = t + rand(0.06, 0.34);
      const f = rand(950, 1900);
      const d = v.osc('sine', f, st, 0.07, v.env(v.out, st, 0.13, 0.002, 0.05));
      d.frequency.exponentialRampToValueAtTime(f * 1.6, st + 0.03);
    }
  },

  creak(v, t, o) {
    // Slow stick-slip sawtooth through resonant wood-body bandpasses.
    const I = clamp(num(o.intensity, 0.5), 0, 1);
    const dur = 0.45 + 0.25 * I * Math.random() + 0.1;
    v.out.gain.value *= 0.45 + 0.55 * I;
    const g = v.envHold(v.out, t, 1, 0.07, dur - 0.24, 0.17);
    const bp1 = v.filter('bandpass', rand(560, 760), 7, g);
    const bp2 = v.filter('bandpass', rand(1250, 1650), 6, v.gain(0.6, g));
    const base = rand(42, 60);
    const saw = v.osc('sawtooth', base, t, dur, bp1);
    saw.connect(bp2);
    const fq = saw.frequency;
    fq.linearRampToValueAtTime(base * 1.4, t + dur * 0.35);
    fq.linearRampToValueAtTime(base * 0.8, t + dur * 0.7);
    fq.linearRampToValueAtTime(base * 1.15, t + dur);
    v.lfo(rand(5, 8), base * 0.14, fq, t, dur);
  },

  heart(v, t) {
    const notes = [76, 80, 83, 88];                   // E major arpeggio up
    notes.forEach((m, i) => bell(v, t + i * 0.065, mtof(m), 0.3, i === 3 ? 0.55 : 0.28, 0.7));
    ping(v, t + 0.26, mtof(100), 0.07, 0.3);
  },

  wind(v, t, o, B) {
    const S = clamp(num(o.strength, 1), 0.4, 2);
    const dur = 1.12;
    const g = v.gain(0);
    const p = g.gain;
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(0.9, t + 0.42);
    p.exponentialRampToValueAtTime(FLOOR, t + dur);
    const bp = v.filter('bandpass', 320, 1.8, g);
    const peakF = Math.min(1700, 750 * S + 200);
    bp.frequency.setValueAtTime(320, t);
    bp.frequency.exponentialRampToValueAtTime(peakF, t + 0.5);
    bp.frequency.exponentialRampToValueAtTime(420, t + dur);
    v.noise(B.pink, t, dur + 0.02, bp);
    // Faint whistle riding on top.
    const wh = v.filter('bandpass', peakF * 1.6, 16, v.gain(0.55, g));
    wh.frequency.setValueAtTime(peakF * 1.4, t);
    wh.frequency.linearRampToValueAtTime(peakF * 1.9, t + 0.55);
    wh.frequency.linearRampToValueAtTime(peakF * 1.5, t + dur);
    v.noise(B.pink, t, dur + 0.02, wh);
  },

  rain(v, t, o, B) {
    // Soft hiss swell + crackly pitter.
    const hiss = v.envHold(v.out, t, 0.32, 0.15, 0.35, 0.4);
    const hp = v.filter('highpass', 1700, 0.7, v.filter('lowpass', 7500, 0.7, hiss));
    v.noise(B.white, t, 0.95, hp);
    const pit = v.envHold(v.out, t, 1, 0.06, 0.45, 0.35);
    const bp = v.filter('bandpass', 3200, 0.8, pit);
    v.noise(B.crackle, t, 0.9, bp, rand(0.9, 1.1));
    for (let i = 0; i < 5; i++) {
      const st = t + rand(0.02, 0.6);
      ping(v, st, rand(2600, 4600), 0.08, 0.018);
    }
  },

  thunder(v, t, o, B) {
    const I = clamp(num(o.intensity, 0.8), 0, 1);
    v.out.gain.value *= 0.55 + 0.45 * I;
    // Crack: bright noise burst + crackle.
    const crack = v.filter('highpass', 1200, 0.7, v.env(v.out, t, 0.75, 0.002, 0.13));
    v.noise(B.white, t, 0.18, crack);
    const ck = v.filter('bandpass', 1800, 0.8, v.env(v.out, t, 0.6, 0.004, 0.32));
    v.noise(B.crackle, t, 0.4, ck);
    // Rolling rumble: brown noise, lowpass closing, amplitude rolled by an LFO.
    const dur = 1.16;
    const g = v.gain(0);
    const p = g.gain;
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(1, t + 0.07);
    p.exponentialRampToValueAtTime(0.5, t + 0.4);
    p.exponentialRampToValueAtTime(FLOOR, t + dur);
    const roll = v.gain(0.65, g);
    v.lfo(rand(3, 4.5), 0.35, roll.gain, t, dur);
    const lp = v.filter('lowpass', 560, 1.4, roll);
    lp.frequency.setValueAtTime(560, t);
    lp.frequency.exponentialRampToValueAtTime(210, t + 0.6);
    v.noise(B.brown, t, dur + 0.02, lp);
    const sub = v.osc('sine', 52, t, dur, v.env(v.out, t, 0.25, 0.02, dur - 0.05));
    sub.frequency.exponentialRampToValueAtTime(38, t + dur);
  },

  zap(v, t, o, B) {
    const dur = 0.6;
    const g = v.envHold(v.out, t, 0.5, 0.01, dur - 0.2, 0.18);
    const am = v.gain(0.5, g);
    v.lfo(28, 0.5, am.gain, t, dur, 'square');        // choppy electric buzz
    const lp = v.filter('lowpass', 2600, 1.5, am);
    const saw = v.osc('sawtooth', 92, t, dur, lp);
    const sq = v.osc('square', 137, t, dur, v.gain(0.4, lp));
    for (let i = 1; i < 9; i++) {                     // stepped pitch jitter
      const at = t + i * (dur / 9);
      saw.frequency.setValueAtTime(rand(70, 150), at);
      sq.frequency.setValueAtTime(rand(100, 190), at);
    }
    const hp = v.filter('highpass', 2400, 0.7, v.envHold(v.out, t, 0.9, 0.005, dur - 0.15, 0.12));
    v.noise(B.crackle, t, dur, hp, 1.3);
  },

  hail(v, t) {
    // Cheapest possible icy tick: one oscillator, one gain.
    const f = rand(2600, 4400);
    const o = v.osc('triangle', f, t, 0.045, v.env(v.out, t, 0.9, 0.001, 0.032));
    o.frequency.exponentialRampToValueAtTime(f * 0.82, t + 0.03);
  },

  heat(v, t, o, B) {
    // Shimmering high cluster with tremolo + vibrato (heat haze).
    const dur = 1.05;
    const g = v.envHold(v.out, t, 0.3, 0.35, 0.25, 0.42);
    const trem = v.gain(0.6, g);
    v.lfo(10, 0.4, trem.gain, t, dur);
    const vib = v.gain(22, null);
    v.osc('sine', 5.5, t, dur, vib);
    for (const m of [88, 93, 97]) {                   // E6, A6, C#7
      const os = v.osc('sine', mtof(m), t, dur, trem);
      os.frequency.linearRampToValueAtTime(mtof(m) * 1.025, t + dur);
      vib.connect(os.detune);
    }
    const hp = v.filter('highpass', 6500, 0.7, v.envHold(v.out, t, 0.05, 0.3, 0.3, 0.35));
    v.noise(B.white, t, dur, hp);
  },

  rainbow(v, t) {
    // Sparkly upward pentatonic run.
    const notes = [84, 86, 88, 91, 93, 96, 100];
    notes.forEach((m, i) => bell(v, t + i * 0.052, mtof(m), 0.22, i === notes.length - 1 ? 0.5 : 0.32, 0.45));
    ping(v, t + 0.36, mtof(103), 0.06, 0.35);
  },

  fog(v, t, o, B) {
    // Soft, low, slightly mysterious pad swell (D minor-ish).
    const dur = 1.15;
    const g = v.gain(0);
    const p = g.gain;
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(0.5, t + 0.5);
    p.setValueAtTime(0.5, t + 0.62);
    p.exponentialRampToValueAtTime(FLOOR, t + dur);
    const lp = v.filter('lowpass', 420, 0.7, g);
    lp.frequency.setValueAtTime(420, t);
    lp.frequency.linearRampToValueAtTime(950, t + 0.55);
    lp.frequency.linearRampToValueAtTime(380, t + dur);
    for (const [m, det] of [[50, -6], [57, 5], [65, -3], [62, 8]]) {
      v.osc('triangle', mtof(m), t, dur + 0.02, lp, det);
    }
    const breath = v.filter('lowpass', 500, 0.6, v.gain(0.35, g));
    v.noise(B.pink, t, dur + 0.02, breath);
  },

  warning(v, t) {
    // Two-tone alarm blip.
    const lp = v.filter('lowpass', 2600, 0.7);
    v.osc('square', mtof(83), t, 0.09, v.envHold(lp, t, 0.5, 0.005, 0.06, 0.02));
    v.osc('square', mtof(78), t + 0.11, 0.1, v.envHold(lp, t + 0.11, 0.5, 0.005, 0.065, 0.025));
  },

  gameover(v, t) {
    // Descending A-minor arpeggio, the last note held with a sad wobble.
    const notes = [76, 72, 69, 64, 57];
    const step = 0.13;
    const lp = v.filter('lowpass', 2200, 0.7);
    notes.forEach((m, i) => {
      const st = t + i * step;
      const last = i === notes.length - 1;
      const d = last ? 0.56 : 0.24;
      const g = v.env(lp, st, 0.42, 0.012, d);
      const tri = v.osc('triangle', mtof(m), st, d + 0.03, g);
      v.osc('sine', mtof(m) / 2, st, d + 0.03, v.gain(0.5, g));
      if (last) v.lfo(5.5, 18, tri.detune, st + 0.12, d - 0.1);
    });
  },

  record(v, t, o, B) {
    // Fanfare: ta-ta-ta-taaa into a C-major chord with a cymbal shimmer.
    [67, 72, 76].forEach((m, i) => brass(v, t + i * 0.11, mtof(m), 0.07, 0.3));
    const ct = t + 0.34;
    const oscs = [];
    for (const m of [72, 76, 79, 84]) oscs.push(...brass(v, ct, mtof(m), 0.5, 0.17));
    const vib = v.gain(9, null);
    v.osc('sine', 5.5, ct + 0.1, 0.7, vib);
    for (const os of oscs) vib.connect(os.detune);
    const hp = v.filter('highpass', 7000, 0.7, v.env(v.out, ct, 0.18, 0.004, 0.65));
    v.noise(B.white, ct, 0.7, hp);
    bell(v, ct + 0.05, mtof(96), 0.12, 0.55, 0.3);
  },

  banner(v, t, o, B) {
    // Event sting: rising swoosh + quick brassy "ta-daa" a fifth up.
    whoosh(v, B, t, 0.22, 450, 3600, 1.2, 0.35, 0.15);
    brass(v, t + 0.04, mtof(67), 0.06, 0.32);
    brass(v, t + 0.15, mtof(74), 0.22, 0.32);
  },

  freeze(v, t, o, B) {
    // Soft low "set" tick — cement going hard.
    const s = v.osc('sine', 440, t, 0.13, v.env(v.out, t, 0.6, 0.002, 0.1));
    s.frequency.exponentialRampToValueAtTime(210, t + 0.06);
    const lp = v.filter('lowpass', 900, 0.7, v.env(v.out, t, 0.25, 0.001, 0.025));
    v.noise(B.white, t, 0.05, lp);
  },

  gull(v, t, o, B) {
    // A soft, distant gull: 1-2 round "mew" calls. A sine carrier (with only a light 2nd
    // harmonic, no buzz) glides ~900 -> 1400 -> 800 Hz while a small, fast FM wobble (~30 Hz)
    // gives the gentle gull "yodel". Bandpass ~1,2 kHz, then lowpass ~2,4 kHz, and a faint
    // echo over the water (two delay taps at ~180 / 260 ms with low feedback).
    const n = clamp(Math.round(num(o.calls, 1 + Math.floor(Math.random() * 2))), 1, 2);
    const k = clamp(num(o.pitch, rand(0.93, 1.07)), 0.6, 1.5);
    const vol = clamp(num(o.vol, rand(0.6, 1)), 0, 1);
    const pan0 = clamp(num(o.pan, rand(-0.7, 0.7)), -1, 1);
    const calls = [];
    let at = 0;
    for (let i = 0; i < n; i++) {
      const d = rand(0.62, 0.78);
      calls.push({ at, d, k: k * (1 - 0.06 * i) * rand(0.98, 1.02), a: vol * (1 - 0.25 * i) });
      at += d + rand(0.22, 0.34);
    }
    const total = at;
    const run = total + 1.1;   // the carrier idles silently while the echoes ring out
    let dest = v.out;
    try {   // the bird drifts a little across the stereo field
      const pan = v.ctx.createStereoPanner();
      pan.pan.setValueAtTime(pan0, t);
      pan.pan.linearRampToValueAtTime(clamp(pan0 + rand(-0.2, 0.2), -1, 1), t + total);
      pan.connect(dest);
      v.nodes.push(pan);
      dest = pan;
    } catch (e) { /* no StereoPannerNode: centred */ }
    // dry path: amp -> bandpass -> lowpass -> out; the echo taps hang off the lowpass
    const lp = v.filter('lowpass', 2400, 0.6, dest);
    const bp = v.filter('bandpass', 1200, 1.5, v.gain(0.55, lp));
    const amp = v.gain(0, bp);
    for (const [time, level] of [[0.18, 0.26], [0.26, 0.17]]) {
      const dl = v.ctx.createDelay(1);
      dl.delayTime.value = time;
      const fb = v.gain(0.22, dl);                 // low feedback
      const damp = v.filter('lowpass', 1800, 0.5, fb);
      dl.connect(damp);
      lp.connect(dl);
      dl.connect(v.gain(level, dest));             // small wet
      v.nodes.push(dl);
    }
    const car = v.osc('sine', 900 * k, t, run, amp);
    const harm = v.gain(0.14, amp);                // a light 2nd harmonic
    const car2 = v.osc('sine', 1800 * k, t, run, harm);
    v.lfo(rand(25, 35), 26 * k, car.frequency, t, run);     // the soft yodel (small, fast FM)
    v.lfo(rand(25, 35), 52 * k, car2.frequency, t, run);
    const ag = amp.gain;
    ag.setValueAtTime(0, t);
    for (const c of calls) {
      const s = t + c.at;
      const e = s + c.d;
      for (const [osc, mul] of [[car, 1], [car2, 2]]) {
        const fr = osc.frequency;
        fr.setValueAtTime(900 * c.k * mul, s);
        fr.linearRampToValueAtTime(1400 * c.k * mul, s + c.d * 0.38);      // rise ...
        fr.linearRampToValueAtTime(800 * c.k * mul, e);                     // ... and sigh back down
      }
      ag.setValueAtTime(0, s);
      ag.linearRampToValueAtTime(c.a, s + 0.12);                            // soft attack
      ag.setValueAtTime(c.a, s + c.d * 0.45);
      ag.exponentialRampToValueAtTime(c.a * 0.05, e);
      ag.linearRampToValueAtTime(0, e + 0.04);
    }
  },
};

export const SOUND_NAMES = Object.keys(SOUNDS);

let clipCurve = null;

/** Soft-clip transfer curve for inputs in [-2, 2] (fed at half level): linear up to 0.75, then eases to ±0.99. */
function softClipCurve() {
  if (clipCurve) return clipCurve;
  const n = 2048;
  clipCurve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * 2;
    const a = Math.abs(x);
    const y = a <= 0.75 ? a : 0.75 + 0.24 * Math.tanh((a - 0.75) / 0.24);
    clipCurve[i] = Math.sign(x) * y;
  }
  return clipCurve;
}

/**
 * Master chain on any context: gain -> gentle compressor -> soft-clip safety -> dest.
 * Returns the input node.
 */
export function createMaster(ctx, dest = ctx.destination) {
  const input = ctx.createGain();
  input.gain.value = MASTER_LEVEL;
  let node = input;
  try {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    node.connect(comp);
    node = comp;
  } catch (e) { /* no compressor: go straight on */ }
  try {
    // Coincident transients can slip past the compressor; never let them hard-clip.
    const half = ctx.createGain();
    half.gain.value = 0.5;
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClipCurve();
    node.connect(half);
    half.connect(shaper);
    node = shaper;
  } catch (e) { /* optional */ }
  node.connect(dest);
  return input;
}

/**
 * Schedule one sound on any BaseAudioContext (also OfflineAudioContext, for tests).
 * Returns the Voice (with .end / .stop(at)), or null for an unknown name.
 */
export function renderSound(ctx, name, opts = {}, dest = ctx.destination, when = ctx.currentTime) {
  const make = SOUNDS[name];
  if (!make) return null;
  const v = new Voice(ctx, dest, when, name, LEVEL[name] ?? 0.6);
  try {
    make(v, when, opts || {}, buffersFor(ctx));
    v.arm();
  } catch (err) {
    v.dispose();
    throw err;
  }
  return v;
}

// ---------------------------------------------------------------------------
// Beach ambience: a soft surf bed (looping filtered noise swelled by slow LFOs, so
// there is no per-frame JS) and, in the live engine, an occasional distant gull.
// ---------------------------------------------------------------------------
const SURF_LEVEL = 0.1;

/**
 * Surf bed on any context (also OfflineAudioContext, for tests): two deep decorrelated
 * noise layers (left/right) and a faint foam hiss, all swelling with two slow sine LFOs
 * (~7,6 s and ~11,3 s, so the waves never repeat evenly). Runs for `dur` seconds, or
 * until stop(at) when `dur` is omitted. Returns { out, stop(at), dispose() }.
 */
export function renderSurf(ctx, dest = ctx.destination, when = ctx.currentTime, dur = Infinity) {
  const B = buffersFor(ctx);
  const nodes = [];
  const sources = [];
  const end = when + dur;
  const add = (n) => { nodes.push(n); return n; };
  const begin = (src, offset = 0) => {
    src.start(when, offset);
    if (Number.isFinite(dur)) src.stop(end);
    sources.push(src);
    return add(src);
  };
  const gain = (value, to) => {
    const g = add(ctx.createGain());
    g.gain.value = value;
    g.connect(to);
    return g;
  };
  const filter = (type, freq, q, to) => {
    const f = add(ctx.createBiquadFilter());
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(to);
    return f;
  };
  const panTo = (p, to) => {
    try {
      const n = add(ctx.createStereoPanner());
      n.pan.value = p;
      n.connect(to);
      return n;
    } catch (e) { return to; }
  };
  const lfo = (period) => {
    const o = ctx.createOscillator();
    o.frequency.value = 1 / period;
    return begin(o);
  };
  const mod = (o, depth, param) => o.connect(gain(depth, param));
  const noise = (buf, to) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(to);
    return begin(src, Math.random() * Math.max(0, buf.duration - 0.1));
  };

  const out = gain(SURF_LEVEL, dest);
  const swell = lfo(7.6);
  const drift = lfo(11.3);
  const foam = lfo(6.7);
  for (const side of [-1, 1]) {
    const g = gain(0.32, panTo(side * 0.55, out));
    const lp = filter('lowpass', 480, 0.7, g);
    noise(B.pink, lp);
    mod(swell, 0.2, g.gain);          // louder ...
    mod(drift, 0.07, g.gain);
    mod(swell, 260, lp.frequency);    // ... and brighter on the crest
    mod(drift, 80, lp.frequency);
  }
  const fg = gain(0.07, out);
  noise(B.white, filter('lowpass', 4500, 0.5, filter('highpass', 1400, 0.5, fg)));
  mod(foam, 0.055, fg.gain);

  let dead = false;
  const dispose = () => {
    if (dead) return;
    dead = true;
    for (const n of nodes) { try { n.disconnect(); } catch (e) { /* ignore */ } }
    for (const src of sources) src.onended = null;
    nodes.length = 0;
    sources.length = 0;
  };
  let left = sources.length;
  for (const src of sources) src.onended = () => { if (--left <= 0) dispose(); };
  return {
    out,
    stop(at) { for (const src of sources) { try { src.stop(at); } catch (e) { /* already stopped */ } } },
    dispose,
  };
}

// ---------------------------------------------------------------------------
// Live engine
// ---------------------------------------------------------------------------
const Ctor = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
// Sounds that may be cut first when the global voice cap is reached.
const LOW_PRIORITY = new Set(['gull', 'hail', 'creak', 'wind', 'rain', 'warning', 'freeze', 'click', 'drop', 'land', 'fog', 'heat']);
const HOLD_GRACE_MS = 500;   // taps this soon after suspend() (the pause tap itself) don't undo it
const STALL_MS = 1000;       // context still not running this long after an unlock => drop sounds
const IDLE_SUSPEND_MS = 12000; // no sound for this long (menu, results): let the audio thread sleep
let ctx = null;
let master = null;
let enabled = true;
let held = false;            // suspended on purpose by suspend() (pause / tab hidden)
let heldAt = 0;
let unlockAt = 0;
let listening = false;
let idleTimer = 0;
let idleAsleep = false;      // suspended by the idle timer (not by the player or the browser)
const AMB_TC = 0.35;         // ambience level smoothing (time constant, s): settles in about a second
const GULL_MIN_LEVEL = 0.2;  // no gulls once the beach has mostly faded away
let ambTarget = 0;           // requested ambience level 0..1 (kept even before the first tap)
let ambHold = false;         // silenced by suspend() until resume(): a tap on the pause card must not bring the surf back
let amb = null;              // { bus, surf }: built lazily, only while there is something to play
let ambLevel = 0;            // level last sent to the bus
let gullTimer = 0;
let ambStopTimer = 0;
const voices = [];
const lastStart = Object.create(null);
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function settle(p) {
  if (p && typeof p.catch === 'function') p.catch(noop);
}

function safeResume() {
  if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') {
    unlockAt = nowMs();
    try { settle(ctx.resume()); } catch (e) { /* ignore */ }
  }
}

function safeSuspend() {
  if (ctx && ctx.state === 'running') {
    try { settle(ctx.suspend()); } catch (e) { /* ignore */ }
  }
}

const isHidden = () => typeof document !== 'undefined' && document.hidden;

/** False only when the browser can tell us the user has not interacted yet. */
function hasActivation() {
  const act = typeof navigator !== 'undefined' ? navigator.userActivation : null;
  return !act || act.hasBeenActive;
}

function onVisibility() {
  if (!ctx) return;
  if (isHidden()) safeSuspend();
  else if (enabled && !held) safeResume();
}

function ensureContext() {
  if (ctx && ctx.state === 'closed') {
    ctx = null;
    master = null;
    amb = null;
    ambLevel = 0;
    clearTimeout(gullTimer);
    gullTimer = 0;
    voices.length = 0;
  }
  if (ctx || !Ctor) return ctx;
  try {
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch (e) {
      ctx = new Ctor();
    }
    master = createMaster(ctx);
    // Build the noise buffers just after the gesture so the first thunder doesn't hitch.
    setTimeout(() => { if (ctx) buffersFor(ctx); }, 0);
    if (!listening && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
      listening = true;
    }
  } catch (e) {
    ctx = null;
    master = null;
  }
  return ctx;
}

/** iOS: a buffer started inside a gesture fully unlocks output. */
function playSilentBuffer() {
  const s = ctx.createBufferSource();
  s.buffer = ctx.createBuffer(1, 1, 22050);
  s.connect(ctx.destination);
  s.onended = () => { try { s.disconnect(); } catch (e) { /* ignore */ } };
  s.start(0);
}

/** Let the audio thread sleep after a quiet spell (never while the beach is playing). */
function armIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (held || !ctx || ctx.state !== 'running') return;
    if (enabled && ambTarget > 0) return;
    prune(ctx.currentTime);
    if (voices.length) return;
    idleAsleep = true;
    safeSuspend();
  }, IDLE_SUSPEND_MS);
}

function buildAmbience() {
  const bus = ctx.createGain();
  bus.gain.value = 0;
  bus.connect(master);
  return { bus, surf: renderSurf(ctx, bus) };
}

function dropAmbience() {
  ambStopTimer = 0;
  clearTimeout(gullTimer);
  gullTimer = 0;
  if (!amb || ambTarget > 0) return;
  const a = amb;
  amb = null;
  ambLevel = 0;
  try {
    const t = ctx.currentTime;
    const g = a.bus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 0.05);
    a.surf.stop(t + 0.06);
    setTimeout(() => { try { a.bus.disconnect(); } catch (e) { /* ignore */ } }, 400);
  } catch (e) { /* ignore */ }
  armIdle();
}

/** Bring the surf bed to the level the current state allows (sound on, not paused, level > 0). Idempotent. */
function syncAmbience() {
  if (!ctx || !master) return;
  try {
    const want = enabled && !ambHold ? ambTarget : 0;
    if (!amb) {
      if (want <= 0) return;
      amb = buildAmbience();
      ambLevel = 0;
    }
    clearTimeout(ambStopTimer);
    ambStopTimer = 0;
    if (want !== ambLevel) {
      const g = amb.bus.gain;
      const t = ctx.currentTime;
      g.cancelScheduledValues(t);
      if (ambHold) {
        g.setValueAtTime(0, t);   // paused: gone from the first sample, even if a later tap restarts the context
      } else {
        g.setValueAtTime(g.value, t);
        g.setTargetAtTime(want, t, enabled ? AMB_TC : 0.015);
      }
      ambLevel = want;
      if (want > 0 && idleAsleep && !held) {
        idleAsleep = false;
        safeResume();
      }
    }
    if (ambTarget > 0) {
      if (!gullTimer) scheduleGull(true);
    } else {
      clearTimeout(gullTimer);
      gullTimer = 0;
      ambStopTimer = setTimeout(dropAmbience, 1800);
    }
  } catch (e) { /* ambience is optional */ }
}

function scheduleGull(first = false) {
  clearTimeout(gullTimer);
  gullTimer = setTimeout(gullTick, first ? rand(3000, 7000) : rand(15000, 30000));
}

function gullTick() {
  gullTimer = 0;
  if (!amb || ambTarget <= 0) return;   // syncAmbience() re-arms when the beach comes back
  const audible = enabled && !ambHold && !held && !isHidden() && ctx && ctx.state === 'running' && ambTarget >= GULL_MIN_LEVEL;
  if (!audible) {
    gullTimer = setTimeout(gullTick, 3000);
    return;
  }
  try {
    const t = ctx.currentTime;
    prune(t);
    if (voices.length < MAX_VOICES - 2 && !voices.some((v) => v.name === 'gull')) {
      const v = renderSound(ctx, 'gull', {}, amb.bus, t + 0.02);
      if (v) voices.push(v);
    }
  } catch (e) { /* a gull must never break the game */ }
  scheduleGull();
}

function prune(t) {
  let j = 0;
  for (let i = 0; i < voices.length; i++) {
    const v = voices[i];
    if (!v.dead && v.end > t) voices[j++] = v;
  }
  voices.length = j;
}

function stealVoice(v, t) {
  v.stop(t);
  const i = voices.indexOf(v);
  if (i >= 0) voices.splice(i, 1);
}

/** Voice to cut at the global cap: oldest low-priority one, else the oldest (unless the newcomer is low priority). */
function capVictim(name) {
  for (const v of voices) if (LOW_PRIORITY.has(v.name)) return v;
  return LOW_PRIORITY.has(name) ? null : voices[0] || null;
}

function stopAll() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const v of voices) v.stop(t);
  voices.length = 0;
}

export const audio = {
  /** Create/resume the context. Idempotent and cheap; safe to call on every pointerdown/keydown. */
  unlock() {
    if (!enabled || !Ctor || isHidden() || !hasActivation()) return;
    if (held) {
      if (nowMs() - heldAt < HOLD_GRACE_MS) return;
      held = false;   // a later tap (e.g. on the pause or results screen) brings sound back
    }
    try {
      if (!ensureContext()) return;
      syncAmbience();
      if (ctx.state === 'running') return;
      safeResume();
      playSilentBuffer();
    } catch (e) { /* audio is optional */ }
  },

  setEnabled(on) {
    enabled = !!on;
    if (!ctx) {
      // Turned on from a tap (settings toggle): unlock right away.
      if (enabled) this.unlock();
      return;
    }
    try {
      const g = master.gain;
      const t = ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(enabled ? MASTER_LEVEL : 0, t + 0.05);
      if (enabled) {
        if (!held) safeResume();
      } else {
        stopAll();
        setTimeout(() => { if (!enabled) safeSuspend(); }, 120);
      }
      syncAmbience();
    } catch (e) { /* ignore */ }
  },

  get enabled() {
    return enabled;
  },

  /** Pause / tab hidden: silence until resume() (or a user tap ≥ 0,5 s later). */
  suspend() {
    held = true;
    heldAt = nowMs();
    ambHold = true;
    syncAmbience();
    safeSuspend();
  },

  resume() {
    held = false;
    idleAsleep = false;
    ambHold = false;
    if (enabled && !isHidden()) safeResume();
    syncAmbience();
  },

  /**
   * Beach ambience (soft surf + distant gulls): target level 0..1, eased in over ~1 s.
   * 0 stops the gulls and fades the surf out. Follows the sound toggle and suspend()/resume().
   */
  setAmbience(level) {
    ambTarget = clamp(num(level, 0), 0, 1);
    syncAmbience();
  },

  get ambience() {
    return ambTarget;
  },

  play(name, opts = {}) {
    if (!enabled || held || !ctx || !master || !SOUNDS[name] || isHidden()) return;
    const ms = nowMs();
    // asleep after a quiet spell: wake it (the sound plays as soon as it runs again)
    if (idleAsleep) {
      idleAsleep = false;
      safeResume();
    }
    armIdle();
    // Don't pile sounds up in a context that refuses to start (they'd burst out later).
    if (ctx.state !== 'running' && ms - unlockAt > STALL_MS) return;
    const gap = THROTTLE[name];
    if (gap && ms - (lastStart[name] ?? -1e9) < gap) return;
    try {
      const t = ctx.currentTime;
      prune(t);
      const limit = LIMIT[name] ?? DEFAULT_LIMIT;
      let same = 0;
      let oldest = null;
      for (const v of voices) {
        if (v.name !== name) continue;
        same++;
        if (!oldest || v.t < oldest.t) oldest = v;
      }
      if (same >= limit) {
        if (!STEAL.has(name)) return;
        stealVoice(oldest, t);
      }
      if (voices.length >= MAX_VOICES) {
        const victim = capVictim(name);
        if (!victim) return;
        stealVoice(victim, t);
      }
      const v = renderSound(ctx, name, opts, master, t);
      if (v) voices.push(v);
      lastStart[name] = ms;
    } catch (e) { /* a sound must never break the game */ }
  },

  /** Debug/test helper: number of voices currently sounding. */
  get activeVoices() {
    if (ctx) prune(ctx.currentTime);
    return voices.length;
  },
};

// Unlock on every activating gesture. On Android a touch pointerdown is not yet a
// user activation (pointerup/touchend/click are), and iOS needs a real gesture.
if (Ctor && typeof document !== 'undefined') {
  const onGesture = () => audio.unlock();
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'keydown', 'click']) {
    document.addEventListener(type, onGesture, { capture: true, passive: true });
  }
}

// ---------------------------------------------------------------------------
// Haptics (navigator.vibrate) — silently a no-op where unsupported (iOS).
// ---------------------------------------------------------------------------
let hapticsOn = true;
let busyUntil = 0;

function canVibrate() {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  // Before any user gesture Chrome blocks vibrate() and logs an intervention.
  const act = navigator.userActivation;
  return !(act && !act.hasBeenActive);
}

function vibrate(pattern, weak = false) {
  if (!hapticsOn || !canVibrate()) return;
  const ms = nowMs();
  if (weak && ms < busyUntil) return;   // a light tap must not cut a longer pattern short
  try {
    navigator.vibrate(pattern);
    const total = Array.isArray(pattern) ? pattern.reduce((a, b) => a + b, 0) : pattern;
    busyUntil = ms + total;
  } catch (e) { /* ignore */ }
}

export const haptics = {
  setEnabled(on) {
    hapticsOn = !!on;
    if (!hapticsOn && canVibrate()) {
      try { navigator.vibrate(0); } catch (e) { /* ignore */ }
    }
  },
  get enabled() {
    return hapticsOn;
  },
  tap() { vibrate(10, true); },
  perfect() { vibrate([12, 40, 18]); },
  lost() { vibrate([60]); },
  heavy() { vibrate([30, 30, 80]); },
};
