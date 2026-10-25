import { save } from './state';

/**
 * All game sound is made on the fly with the Web Audio API (no sound files):
 * oscillators and filtered noise shaped with quick volume envelopes.
 *
 * iPad Safari only allows audio after a tap, so `unlockAudio()` is called
 * from the first tap (see main.ts).
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    // A gentle limiter so stacked explosions don't distort.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 8;
    master.connect(comp).connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.32;
    musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

export function unlockAudio() {
  const a = audio();
  if (a && a.state !== 'running') void a.resume().catch(() => {});
}

function on(): boolean {
  return save().sound !== false;
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, when = 0, dest?: AudioNode) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, peak, 0.005, dur);
  o.connect(g).connect(dest ?? master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, peak: number, filter: BiquadFilterType, f0: number, f1: number, when = 0, q = 1) {
  const a = audio();
  if (!a || !master || !noiseBuf) return;
  const t = a.currentTime + when;
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  const f = a.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = a.createGain();
  env(g, t, peak, 0.004, dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

export const sfx = {
  /** Blaster shot; bigger blasters sound heavier. */
  laser(mark = 0) {
    if (!on()) return;
    const base = 1400 - mark * 180;
    tone('sawtooth', base, base * 0.25, 0.12 + mark * 0.02, 0.16);
    tone('square', base * 1.5, base * 0.4, 0.08, 0.06);
    if (mark >= 2) tone('sine', 180, 60, 0.12, 0.25);
  },
  /** Explosion; size 0..1. */
  boom(size = 0.5) {
    if (!on()) return;
    noise(0.35 + size * 0.6, 0.5 + size * 0.4, 'lowpass', 2400, 120, 0, 0.7);
    tone('sine', 120, 35, 0.3 + size * 0.5, 0.7 + size * 0.3);
    noise(0.08, 0.3, 'highpass', 3000, 6000);
  },
  /** Small hit spark. */
  tick() {
    if (!on()) return;
    noise(0.05, 0.25, 'bandpass', 4000, 2500, 0, 3);
  },
  /** A heavy metal plate landing: bright strike plus a ringing, slightly out-of-tune resonance. */
  clang(weight = 1) {
    if (!on()) return;
    noise(0.04, 0.6, 'highpass', 1800, 4000);
    for (const [f, v, d] of [[220, 0.35, 0.9], [523, 0.22, 0.7], [811, 0.16, 0.5], [1317, 0.1, 0.35], [2110, 0.06, 0.25]] as const) {
      tone('sine', f * (1.1 - weight * 0.15), f * (1.08 - weight * 0.15), d * (0.7 + weight * 0.5), v);
    }
    tone('sine', 90, 45, 0.25, 0.5 * weight);
  },
  /** Wrong answer: a low buzz. */
  buzz() {
    if (!on()) return;
    tone('square', 140, 110, 0.25, 0.12);
    tone('square', 147, 115, 0.25, 0.1);
  },
  /** Small pieces flying, like a whoosh. */
  whoosh() {
    if (!on()) return;
    noise(0.3, 0.25, 'bandpass', 600, 2400, 0, 2);
  },
  /** Bright rising chime for success. */
  success() {
    if (!on()) return;
    [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.25, 0.18, i * 0.07));
  },
  /** Scrap pickup. */
  coin() {
    if (!on()) return;
    tone('square', 988, 988, 0.06, 0.08);
    tone('square', 1319, 1319, 0.12, 0.08, 0.06);
  },
  /** The robot getting hit. */
  hurt() {
    if (!on()) return;
    noise(0.2, 0.5, 'lowpass', 1800, 200);
    tone('sawtooth', 220, 70, 0.25, 0.25);
  },
  /** An alien charging a shot: rising whine. */
  charge() {
    if (!on()) return;
    tone('sine', 300, 1400, 0.6, 0.08);
  },
  /** Alien screech for big enemies appearing. */
  screech() {
    if (!on()) return;
    tone('sawtooth', 700, 260, 0.45, 0.12);
    tone('sawtooth', 760, 240, 0.45, 0.1, 0.03);
  },
  /** Transform: mechanical ratchet. */
  transform() {
    if (!on()) return;
    for (let i = 0; i < 7; i++) {
      noise(0.03, 0.35, 'bandpass', 1200 + i * 200, 900, i * 0.07, 6);
      tone('square', 200 + i * 60, 160 + i * 60, 0.04, 0.05, i * 0.07);
    }
    tone('sawtooth', 120, 400, 0.5, 0.08);
  },
  /** Menu tap. */
  ui() {
    if (!on()) return;
    tone('triangle', 880, 660, 0.06, 0.08);
  },
  alarm() {
    if (!on()) return;
    for (let i = 0; i < 3; i++) tone('square', 880, 660, 0.18, 0.08, i * 0.22);
  },
};

// ---- Engine hum (dropship rotors, car) ------------------------------------

let engine: { stop: () => void; set: (kind: 'ship' | 'car' | 'off') => void } | null = null;

export function engineSound(kind: 'ship' | 'car' | 'off') {
  const a = audio();
  if (!a || !master) return;
  if (!engine) {
    const g = a.createGain();
    g.gain.value = 0;
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400;
    const o1 = a.createOscillator();
    const o2 = a.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'sawtooth';
    const lfo = a.createOscillator();
    const lfoGain = a.createGain();
    lfo.frequency.value = 0;
    lfoGain.gain.value = 0;
    lfo.connect(lfoGain).connect(g.gain);
    o1.connect(f);
    o2.connect(f);
    f.connect(g).connect(master);
    o1.start();
    o2.start();
    lfo.start();
    engine = {
      stop: () => g.gain.setTargetAtTime(0, a.currentTime, 0.2),
      set: (k) => {
        const t = a.currentTime;
        if (k === 'off' || !on()) {
          g.gain.setTargetAtTime(0, t, 0.3);
          lfoGain.gain.setTargetAtTime(0, t, 0.3);
          return;
        }
        if (k === 'ship') {
          o1.frequency.setTargetAtTime(55, t, 0.3);
          o2.frequency.setTargetAtTime(56.5, t, 0.3);
          f.frequency.setTargetAtTime(300, t, 0.3);
          lfo.frequency.setTargetAtTime(11, t, 0.3);
          lfoGain.gain.setTargetAtTime(0.03, t, 0.3);
          g.gain.setTargetAtTime(0.06, t, 0.3);
        } else {
          o1.frequency.setTargetAtTime(70, t, 0.3);
          o2.frequency.setTargetAtTime(105, t, 0.3);
          f.frequency.setTargetAtTime(700, t, 0.3);
          lfo.frequency.setTargetAtTime(0, t, 0.3);
          lfoGain.gain.setTargetAtTime(0, t, 0.3);
          g.gain.setTargetAtTime(0.05, t, 0.3);
        }
      },
    };
  }
  engine.set(kind);
}

// ---- Music: a looping arcade beat -----------------------------------------

let musicTimer: ReturnType<typeof setInterval> | null = null;

/** Start (or stop with null) a simple driving loop: kick, snare, hats and a bass line. */
export function music(style: 'battle' | 'calm' | null) {
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
  const a = audio();
  if (!style || !a || !musicBus || !on()) return;
  const bpm = style === 'battle' ? 132 : 92;
  const step = 60 / bpm / 4;
  // A minor riff in semitones from A1.
  const bass = style === 'battle'
    ? [0, 0, 12, 0, 3, 0, 12, 3, 5, 5, 17, 5, 3, 3, 15, 2]
    : [0, -1, -1, -1, 3, -1, -1, -1, 5, -1, -1, -1, 3, -1, 2, -1];
  let n = 0;
  let next = a.currentTime + 0.05;
  const bus = musicBus;
  const schedule = () => {
    while (next < a.currentTime + 0.2) {
      const i = n % 16;
      const t = next;
      const play = (fn: (t: number) => void) => fn(t);
      if (style === 'battle') {
        if (i % 4 === 0) play((tt) => drum(a, bus, tt, 'kick'));
        if (i % 8 === 4) play((tt) => drum(a, bus, tt, 'snare'));
        if (i % 2 === 1) play((tt) => drum(a, bus, tt, 'hat'));
      } else if (i % 8 === 0) {
        play((tt) => drum(a, bus, tt, 'kick'));
      }
      if (bass[i] >= 0) {
        const f = 55 * Math.pow(2, bass[i] / 12);
        const o = a.createOscillator();
        const g = a.createGain();
        const flt = a.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.value = f;
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(900, t);
        flt.frequency.exponentialRampToValueAtTime(200, t + step * 1.8);
        env(g, t, 0.35, 0.005, step * 1.8);
        o.connect(flt).connect(g).connect(bus);
        o.start(t);
        o.stop(t + step * 2);
      }
      n++;
      next += step;
    }
  };
  schedule();
  musicTimer = setInterval(schedule, 50);
}

function drum(a: AudioContext, dest: AudioNode, t: number, kind: 'kick' | 'snare' | 'hat') {
  const g = a.createGain();
  g.connect(dest);
  if (kind === 'kick') {
    const o = a.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    env(g, t, 0.9, 0.002, 0.18);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.25);
    return;
  }
  if (!noiseBuf) return;
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  const f = a.createBiquadFilter();
  f.type = kind === 'hat' ? 'highpass' : 'bandpass';
  f.frequency.value = kind === 'hat' ? 7000 : 1800;
  env(g, t, kind === 'hat' ? 0.12 : 0.45, 0.002, kind === 'hat' ? 0.04 : 0.14);
  src.connect(f).connect(g);
  src.start(t, Math.random());
  src.stop(t + 0.2);
}
