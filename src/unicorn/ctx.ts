import * as THREE from 'three';
import { askLetter } from './ask';
import { lessonNext, letterPool, needsIntro, noteMoment, pickLetters, recordIntro, recordLetter } from './learn';
import { say } from './speak';
import { sfx } from './sfx';
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

/**
 * Is this spot a lesson (say a letter) or just for fun (tap it)? Decided by
 * the fun-first pacing, and remembered.
 */
export function lessonMoment(): boolean {
  const sv = save();
  const lesson = lessonNext(sv.pace);
  noteMoment(sv.pace, lesson);
  persist();
  return lesson;
}

/** One more activity done (learning ramps up with these). */
export function finishedActivity(): void {
  save().pace.played++;
  persist();
}

/**
 * A just-for-fun moment: a bouncing finger points at something, and a tap
 * anywhere sets it off. Gives up waiting after a while, so it never stalls.
 */
export function tapIt(ctx: Ctx, where: () => THREE.Vector3, line?: string): Promise<void> {
  const { stage, ui } = ctx;
  if (line) void say(line);
  return new Promise((resolve) => {
    const v = new THREE.Vector3();
    const offFrame = stage.onFrame(() => {
      v.copy(where()).project(stage.camera);
      ui.pointAt(((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight);
    });
    const nudge = setTimeout(() => void say('Tap it!'), 7000);
    const giveUp = setTimeout(done, 16000);
    const tap = (e: Event) => {
      if (e.target === stage.renderer.domElement || e.target === ui.hand) done();
    };
    const key = () => done();
    window.addEventListener('pointerdown', tap);
    window.addEventListener('keydown', key);
    function done() {
      clearTimeout(nudge);
      clearTimeout(giveUp);
      window.removeEventListener('pointerdown', tap);
      window.removeEventListener('keydown', key);
      offFrame();
      ui.pointAt(null);
      sfx.pop();
      resolve();
    }
    if (import.meta.env.DEV) (window as unknown as { tap: () => void }).tap = done;
  });
}

/**
 * A letter moment. The first times she meets a letter it's taught ("This is
 * a, can you say a?"); after that she's asked ("What letter is this?").
 */
export async function letterMoment(ctx: Ctx, glyph: string, question: string): Promise<void> {
  const sv = save();
  const teach = needsIntro(sv.letters, glyph);
  const a = await askLetter(ctx.ui, glyph, question, teach);
  if (teach) {
    recordIntro(sv.letters, glyph);
    sv.recent = [...sv.recent, glyph].slice(-6);
    persist();
  } else noteLetter(glyph, a.firstTry);
}
