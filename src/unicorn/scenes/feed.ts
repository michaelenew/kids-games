import * as THREE from 'three';
import { askNumber } from '../ask';
import { type Ctx, freshPlace, praise, seconds, stats, tween } from '../ctx';
import { makeProblem, MATH_LEVELS, noteMoment, type Problem, recordMath } from '../learn';
import { say, wait } from '../speak';
import { sfx } from '../sfx';
import { persist, save } from '../state';
import { glyphSprite } from '../three/fx';
import { toon } from '../three/stage';
import { Unicorn } from '../three/unicorn';
import { buildRanch } from './ranch';

/**
 * Feeding time (the math). Apples pop onto a picnic table; she counts them,
 * or adds two piles, and says (or taps) how many. Then the apples fly into
 * her unicorns' mouths. A miss means counting along together, one apple at
 * a time, then trying again.
 */

const PROBLEMS = 3;

export async function feed(ctx: Ctx): Promise<void> {
  const { stage, ui } = ctx;
  const fx = freshPlace(ctx);
  buildRanch(ctx);
  const sv = save();

  // The picnic table in front, her unicorns waiting behind it.
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 3.2), toon(0xd9a066));
  top.position.y = 0.7;
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(9.1, 0.04, 3.3), toon(0xff8fc8));
  cloth.position.y = 0.87;
  table.add(top, cloth);
  for (const [x, z] of [[-4, -1.2], [4, -1.2], [-4, 1.2], [4, 1.2]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), toon(0xb07a45));
    leg.position.set(x, 0.35, z);
    table.add(leg);
  }
  table.position.set(0, 0, 4);
  stage.world.add(table);

  const eaters = [...sv.unicorns].sort((a, b) => b.hearts - a.hearts).slice(0, 2);
  const unicorns = eaters.map((d, i) => {
    const u = new Unicorn(d.look);
    u.holder.position.set(eaters.length === 1 ? 0 : (i ? 2.4 : -2.4), 0, 1.6);
    u.holder.scale.setScalar(1.25);
    u.holder.rotation.y = i ? -0.15 : 0.15;
    stage.world.add(u.holder);
    return u;
  });
  stage.onFrame((dt) => unicorns.forEach((u) => u.update(dt)));
  const portrait = innerWidth < innerHeight;
  stage.camera.position.set(0, portrait ? 6.5 : 5.2, portrait ? 15 : 11.5);
  // Aim a little low so the table sits above the number buttons.
  stage.camera.lookAt(0, 0.6, 2.8);

  const names = eaters.map((e) => e.name);
  await say(`Feeding time! ${names.join(' and ')} ${names.length > 1 ? 'are' : 'is'} hungry!`);

  for (let n = 0; n < PROBLEMS; n++) {
    const prob = makeProblem(sv.math, Math.random);
    const { apples, extras } = await serve(ctx, prob);
    // Counting along leaves the numbers on the apples until she answers.
    let clearTags = () => {};
    const counting = async () => {
      clearTags();
      clearTags = await countAlong(ctx, apples, prob);
    };
    if (prob.guided) {
      await seconds(ctx, 0.8);
      await say(prob.kind === 'count' ? "Let's count them together! Watch the apples." : "Let's count all the apples together! Watch.", { rate: SLOW });
      await seconds(ctx, 0.6);
      await counting();
      await seconds(ctx, 1);
    }
    const q = prob.kind === 'count' ? 'How many apples?' : 'How many apples altogether?';
    const max = Math.max(10, prob.answer <= 10 ? 10 : 18);
    const ans = await askNumber(ui, prob.answer, max, q, async () => {
      await say("Let's count together, nice and slow.", { rate: SLOW });
      await seconds(ctx, 0.5);
      await counting();
      await seconds(ctx, 1);
    });
    clearTags();
    const up = recordMath(sv.math, ans.firstTry);
    noteMoment(sv.pace, true);
    persist();
    ui.toast(`${prob.answer}! ${praise()}`);

    // Munch time: apples fly into mouths, a few at a time.
    for (let i = 0; i < apples.length; i++) {
      const a = apples[i];
      const u = unicorns[i % unicorns.length];
      const from = a.position.clone();
      const to = u.mouth();
      const peak = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 2, 0));
      void tween(ctx, 0.45, (k) => {
        a.position.set(
          (1 - k) * (1 - k) * from.x + 2 * (1 - k) * k * peak.x + k * k * to.x,
          (1 - k) * (1 - k) * from.y + 2 * (1 - k) * k * peak.y + k * k * to.y,
          (1 - k) * (1 - k) * from.z + 2 * (1 - k) * k * peak.z + k * k * to.z,
        );
        a.scale.setScalar(1 - k * 0.7);
      }).then(() => {
        stage.world.remove(a);
        sfx.munch();
      });
      await seconds(ctx, 0.12);
    }
    for (const e of extras) stage.world.remove(e);
    await seconds(ctx, 0.5);
    unicorns.forEach((u, i) => {
      fx.hearts(u.holder.position.clone().add(new THREE.Vector3(0, 2.8, 0)), 4);
      eaters[i].hearts++;
    });
    void unicorns[n % unicorns.length].rear();
    sfx.neigh();
    persist();
    stats(ctx);
    if (up) {
      ui.toast('New challenge!', 2000);
      fx.confetti(new THREE.Vector3(0, 6, 2), 120, 8);
      sfx.fanfare();
      await say(`Wow! You're ready for something new: ${MATH_LEVELS[sv.math.level].toLowerCase()}!`);
    }
    await seconds(ctx, 1.4);
  }
  await say(`Yum! ${names.join(' and ')} ${names.length > 1 ? 'are' : 'is'} so happy!`);
}

const appleGeo = new THREE.SphereGeometry(0.32, 16, 12);
appleGeo.userData.shared = true;

function apple(color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(appleGeo, toon(color));
  body.scale.set(1, 0.92, 1);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 5), toon(0x7a4a2a));
  stem.position.y = 0.34;
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), toon(0x52c45a));
  leaf.scale.set(1, 0.3, 0.5);
  leaf.position.set(0.1, 0.38, 0);
  g.add(body, stem, leaf);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** Put the apples on the table, popping in one by one. */
async function serve(ctx: Ctx, prob: Problem): Promise<{ apples: THREE.Group[]; extras: THREE.Object3D[] }> {
  const out: THREE.Group[] = [];
  const extras: THREE.Object3D[] = [];
  const groups = prob.kind === 'count' ? [{ n: prob.a, color: 0xe03131, x0: 0 }] : [{ n: prob.a, color: 0xe03131, x0: -2.2 }, { n: prob.b, color: 0xfab005, x0: 2.2 }];
  const sv = save();
  const who = [...sv.unicorns].sort((a, b) => b.hearts - a.hearts).map((u) => u.name);
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    if (prob.kind === 'add') {
      if (gi > 0) await seconds(ctx, prob.guided ? 1.2 : 0.5);
      await say(gi === 0 ? (g.n === 1 ? 'Here is 1 red apple.' : `Here are ${g.n} red apples.`) : g.n === 1 ? 'And here comes 1 yellow apple!' : `And here come ${g.n} yellow apples!`, { rate: prob.guided ? SLOW : undefined });
    } else {
      void say(`Apples for ${who[0]}!`);
    }
    const cols = Math.min(5, g.n);
    for (let i = 0; i < g.n; i++) {
      const a = apple(g.color);
      const row = Math.floor(i / 5);
      const col = i % 5;
      const spread = prob.kind === 'count' ? 0.85 : 0.7;
      const target = new THREE.Vector3(g.x0 + (col - (cols - 1) / 2) * spread, 1.22, 4.75 - row * 0.95);
      a.position.copy(target).add(new THREE.Vector3(0, 3, 0));
      a.scale.setScalar(0.01);
      ctx.stage.world.add(a);
      out.push(a);
      sfx.pop();
      void tween(ctx, 0.35, (k) => {
        a.position.lerpVectors(target.clone().add(new THREE.Vector3(0, 3, 0)), target, k);
        a.scale.setScalar(0.01 + k);
      }, (k) => 1 - Math.pow(1 - k, 3));
      // One at a time while she's learning, so she can follow along.
      await seconds(ctx, prob.guided ? 0.55 : 0.25);
    }
    await seconds(ctx, prob.guided ? 0.9 : 0.4);
    if (prob.kind === 'add' && gi === 0) {
      const plus = glyphSprite('+', { size: 1.1 });
      plus.position.set(0, 1.9, 4.4);
      ctx.stage.world.add(plus);
      extras.push(plus);
    }
  }
  return { apples: out, extras };
}

/**
 * Count along, slowly: each apple hops and gets its number, said out loud,
 * then the total. Returns a function that takes the numbers off again.
 */
async function countAlong(ctx: Ctx, apples: THREE.Group[], prob: Problem): Promise<() => void> {
  const tags: THREE.Sprite[] = [];
  for (let i = 0; i < apples.length; i++) {
    const a = apples[i];
    const y0 = a.position.y;
    sfx.count(i);
    void tween(ctx, 0.35, (k) => (a.position.y = y0 + Math.sin(k * Math.PI) * 0.5));
    // The number sits on the apple itself, so it never hides the apples behind.
    const tag = glyphSprite(String(i + 1), { size: 0.55 });
    tag.position.set(0, 0.05, 0.42);
    a.add(tag);
    tags.push(tag);
    await Promise.all([say(String(i + 1), { rate: SLOW }), wait(1100)]);
  }
  await seconds(ctx, 0.6);
  const n = apples.length;
  await say(prob.kind === 'add' ? `${prob.a} and ${prob.b} make ${n}. ${n} apples!` : `${n} apples!`, { rate: SLOW });
  return () => tags.forEach((t) => t.removeFromParent());
}

/** Speaking speed for walk-throughs (1 is normal). */
const SLOW = 0.8;
