/**
 * Sound effects, made in code with the Web Audio API (no sound files):
 * twinkles, chimes, pops, whooshes and a little fanfare.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function unlockSfx(): void {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  void ctx.resume();
}

function tone(freq: number, at: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, glideTo?: number): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(at: number, dur: number, vol: number, from: number, to: number): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime + at;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

const C = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5, 1568];

export const sfx = {
  /** Right answer: a rising sparkly arpeggio. */
  yay(): void {
    [0, 2, 4, 5, 7].forEach((n, i) => tone(C[n], i * 0.07, 0.35, 'triangle', 0.22));
    for (let i = 0; i < 6; i++) tone(2000 + Math.random() * 2000, 0.3 + i * 0.05, 0.12, 'sine', 0.06);
  },
  /** Not quite: a soft two-note "hmm?" (never a buzzer). */
  hmm(): void {
    tone(440, 0, 0.18, 'sine', 0.15);
    tone(392, 0.16, 0.25, 'sine', 0.15);
  },
  twinkle(): void {
    for (let i = 0; i < 5; i++) tone(1800 + Math.random() * 2200, i * 0.05, 0.15, 'sine', 0.07);
  },
  pop(): void {
    tone(600, 0, 0.08, 'sine', 0.25, 1200);
  },
  /** Counting tick, higher each time. */
  count(n: number): void {
    tone(C[Math.min(C.length - 1, n % C.length)], 0, 0.2, 'triangle', 0.2);
  },
  whoosh(): void {
    noise(0, 0.6, 0.35, 400, 3000);
  },
  shatter(): void {
    noise(0, 0.35, 0.3, 3000, 6000);
    for (let i = 0; i < 8; i++) tone(2500 + Math.random() * 2500, i * 0.03, 0.1, 'sine', 0.05);
  },
  munch(): void {
    for (let i = 0; i < 3; i++) noise(i * 0.14, 0.09, 0.3, 900, 500);
  },
  /** A cartoon whinny: a wobbly falling squeal. */
  neigh(): void {
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(380, t + 0.8);
    lfo.frequency.value = 22;
    lg.gain.value = 60;
    lfo.connect(lg).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    o.connect(f).connect(g).connect(master);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.9);
    lfo.stop(t + 0.9);
  },
  fanfare(): void {
    const notes = [[0, 0], [2, 0.12], [4, 0.24], [7, 0.36], [4, 0.6], [7, 0.72]] as const;
    for (const [n, at] of notes) {
      tone(C[Math.min(8, n)], at, 0.4, 'square', 0.08);
      tone(C[Math.min(8, n)] / 2, at, 0.4, 'triangle', 0.12);
    }
    tone(C[8], 0.95, 0.9, 'triangle', 0.18);
  },
  hoof(): void {
    tone(180, 0, 0.05, 'square', 0.05, 90);
  },
  /** A sparkly laser "pew" from a unicorn horn. */
  zap(): void {
    tone(1800, 0, 0.18, 'sawtooth', 0.07, 300);
    tone(2600, 0.02, 0.12, 'sine', 0.06, 900);
  },
  /** A silly alien "bloop" as it zooms away. */
  bloop(): void {
    tone(300, 0, 0.25, 'sine', 0.2, 900);
    tone(900, 0.12, 0.2, 'triangle', 0.12, 1500);
  },
  boing(): void {
    tone(220, 0, 0.3, 'triangle', 0.18, 520);
  },
  /** A big happy boom (no scary explosion). */
  kaboom(): void {
    noise(0, 0.8, 0.4, 200, 60);
    [0, 4, 7, 12].forEach((n, i) => tone(C[Math.min(8, n % 9)] / (i < 2 ? 2 : 1), 0.1 + i * 0.08, 0.5, 'triangle', 0.15));
  },
};

let musicTimer = 0;

/** A bouncy dance tune that loops until stopMusic(). */
export function startMusic(): void {
  stopMusic();
  const bass = [0, 0, 5, 5, 3, 3, 4, 4];
  const lead = [7, 9, 7, 4, 5, 7, 4, 2, 7, 9, 12, 9, 7, 5, 4, 2];
  let step = 0;
  const beat = 0.2;
  const play = () => {
    const i = step++;
    if (i % 2 === 0) tone(C[bass[(i / 2) % bass.length] % 9] / 4, 0, beat * 1.8, 'triangle', 0.18);
    if (i % 4 === 0) noise(0, 0.08, 0.25, 120, 60);
    if (i % 4 === 2) noise(0, 0.06, 0.12, 5000, 8000);
    const n = lead[i % lead.length];
    tone(C[n % 9] * (n >= 9 ? 2 : 1), 0, beat * 0.9, 'square', 0.04);
  };
  play();
  musicTimer = window.setInterval(play, beat * 1000);
}

export function stopMusic(): void {
  clearInterval(musicTimer);
  musicTimer = 0;
}
