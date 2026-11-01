import * as THREE from 'three';
import { type Ctx, freshPlace, seconds, tween } from '../ctx';
import { say } from '../speak';
import { sfx } from '../sfx';
import { persist, save } from '../state';
import { RAINBOW } from '../three/fx';
import { Unicorn } from '../three/unicorn';
import { buildRanch } from './ranch';

/**
 * Volcano Island: her brother's Mecha Forge, but just the fun part. She
 * flies STRIKER, the yellow fighter jet, through a Volcano Island mission;
 * her unicorns wait at the ranch and cheer when she comes back. The mission
 * itself runs in the Mecha Forge page as a guest visit (src/guest.ts), on its
 * own save, so her brother's game is never touched.
 */

/** The volcano missions she plays in turn (each win moves to the next). */
export const VOLCANO_MISSIONS = ['vol-ash', 'vol-lava', 'vol-forge', 'vol-core'];

/** Off to the volcano: the unicorns line up to wave goodbye, then the page changes. */
export async function volcano(ctx: Ctx): Promise<void> {
  const { stage } = ctx;
  freshPlace(ctx);
  buildRanch(ctx);
  stage.setSky(0x5c2a1a, 0xff8c42, 0xffd8a8, 0xffc8a0, 70, 260);
  const sv = save();
  const crew = waveCrew(ctx);
  await say('Oh no! Aliens are attacking Volcano Island! STRIKER the jet needs a pilot. That\'s you!');
  sfx.neigh();
  crew.forEach((u, i) => setTimeout(() => void u.rear(), i * 200));
  await say('Your unicorns will wait right here at the ranch. Bye bye! Good luck!');
  await seconds(ctx, 0.6);
  const mission = VOLCANO_MISSIONS[(sv.volcano ?? 0) % VOLCANO_MISSIONS.length];
  window.location.href = `../mecha-forge/?guest=unicorn&mission=${mission}`;
  // The page is leaving; never come back to the ranch loop from here.
  await new Promise(() => {});
}

/**
 * Back from the volcano: the unicorns gallop up to say hello. A win gets a
 * medal, and the next time she goes it's the next volcano mission.
 */
export async function welcomeBack(ctx: Ctx, won: boolean): Promise<void> {
  const { ui } = ctx;
  const fx = freshPlace(ctx);
  buildRanch(ctx);
  const sv = save();
  const crew = waveCrew(ctx);
  // They gallop in from the paddock.
  const ends = crew.map((u) => u.holder.position.clone());
  crew.forEach((u) => {
    u.holder.position.z -= 10;
    u.gait = 'gallop';
  });
  await tween(ctx, 1.8, (k) => crew.forEach((u, i) => u.holder.position.lerpVectors(ends[i].clone().setZ(ends[i].z - 10), ends[i], k)));
  crew.forEach((u) => (u.gait = 'idle'));
  if (won) {
    sv.volcano = (sv.volcano ?? 0) + 1;
    sv.ribbons[0]++;
    persist();
    sfx.fanfare();
    ui.toast('🏅 Volcano hero!', 3000);
    fx.confetti(new THREE.Vector3(0, 7, 4), 200, 12);
    for (let i = 0; i < 5; i++) setTimeout(() => fx.firework(new THREE.Vector3((Math.random() - 0.5) * 20, 12 + Math.random() * 6, -6)), i * 300);
  }
  crew.forEach((u, i) => setTimeout(() => {
    void u.rear();
    fx.hearts(u.holder.position.clone().add(new THREE.Vector3(0, 2.8, 0)), 4);
  }, i * 180));
  sfx.neigh();
  fx.rainbowRings(new THREE.Vector3(0, 0.2, 4), 6);
  fx.sparkles(new THREE.Vector3(0, 2, 4), { count: 80, colors: RAINBOW });
  await say(won ? 'You saved Volcano Island! Your unicorns waited for you, and they are so proud!' : 'Welcome back! Your unicorns missed you!');
  await seconds(ctx, 1);
}

/** Her favorite few unicorns lined up in front of the camera. */
function waveCrew(ctx: Ctx): Unicorn[] {
  const { stage } = ctx;
  const sv = save();
  const datas = [...sv.unicorns].sort((a, b) => b.hearts - a.hearts).slice(0, 5);
  const xs = [0, -2.6, 2.6, -5.2, 5.2];
  const crew = datas.map((d, i) => {
    const u = new Unicorn(d.look);
    u.holder.position.set(xs[i], 0, 4 - Math.abs(xs[i]) * 0.2);
    stage.world.add(u.holder);
    return u;
  });
  stage.onFrame((dt) => crew.forEach((u) => u.update(dt)));
  const portrait = innerWidth < innerHeight;
  stage.camera.position.set(0, portrait ? 5 : 4, portrait ? 18 : 14);
  stage.camera.lookAt(0, 1.4, 2);
  return crew;
}
