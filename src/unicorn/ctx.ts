import * as THREE from 'three';
import { pickLetters, recordLetter, letterPool } from './learn';
import { persist, save } from './state';
import { Fx } from './three/fx';
import type { Stage } from './three/stage';
import type { UI } from './ui';

/** What every place in the game gets handed. */
export interface Ctx {
  stage: Stage;
  ui: UI;
}

/** Start a fresh place: empty world, a new effects layer ticking each frame. */
export function freshPlace(ctx: Ctx): Fx {
  ctx.stage.clear();
  const fx = new Fx(ctx.stage);
  ctx.stage.onFrame((dt) => fx.update(dt));
  return fx;
}

/** Wait this many seconds of game time (stretches out in slow motion). */
export function seconds(ctx: Ctx, s: number): Promise<void> {
  return new Promise((resolve) => {
    let t = 0;
    const off = ctx.stage.onFrame((dt) => {
      t += dt;
      if (t >= s) {
        off();
        resolve();
      }
    });
  });
}

/** Animate something over `s` seconds: `fn` gets 0→1 (eased). */
export function tween(ctx: Ctx, s: number, fn: (k: number) => void, ease = (k: number) => k * k * (3 - 2 * k)): Promise<void> {
  return new Promise((resolve) => {
    let t = 0;
    const off = ctx.stage.onFrame((dt) => {
      t += dt;
      const k = Math.min(1, t / s);
      fn(ease(k));
      if (k >= 1) {
        off();
        resolve();
      }
    });
  });
}

/** The letters for one activity, chosen by the flashcard boxes. */
export function nextLetters(n: number): string[] {
  const sv = save();
  const ls = pickLetters(sv.letters, letterPool(sv.caseMode), sv.recent, n, Math.random);
  return ls;
}

/** Remember how a letter went. */
export function noteLetter(glyph: string, firstTry: boolean): void {
  const sv = save();
  recordLetter(sv.letters, glyph, firstTry);
  sv.recent = [...sv.recent, glyph].slice(-6);
  persist();
}

const PRAISE = ['Great job!', 'You did it!', 'Wow!', 'Amazing!', 'Super!', 'Yay!', 'Magic!', 'Hooray!'];
export function praise(): string {
  return PRAISE[Math.floor(Math.random() * PRAISE.length)];
}

export function stats(ctx: Ctx): void {
  const sv = save();
  const hearts = sv.unicorns.reduce((a, u) => a + u.hearts, 0);
  const ribbons = sv.ribbons.reduce((a, b) => a + b, 0);
  ctx.ui.setStats(sv.unicorns.length ? `<span>🦄 ${sv.unicorns.length}</span><span>🎀 ${ribbons}</span><span>❤️ ${hearts}</span>` : '');
}

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
