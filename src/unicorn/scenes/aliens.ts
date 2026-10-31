import * as THREE from 'three';
import { type Ctx, freshPlace, lessonMoment, letterMoment, nextLetters, praise, seconds, tapIt, tween } from '../ctx';
import { say } from '../speak';
import { sfx } from '../sfx';
import { persist, save } from '../state';
import { hideButton } from '../hide';
import { hornLaser } from '../laser';
import { byPower, hasUpgrade } from '../upgrades';
import { Saucer } from '../three/alien';
import { glyphSprite, PASTEL, RAINBOW } from '../three/fx';
import { toon } from '../three/stage';
import { Unicorn } from '../three/unicorn';
import { ground, hills, mushroom, trees } from '../three/world';

/**
 * Alien attack! Silly aliens in flying saucers float over the ranch at
 * night. Tap one and her unicorn zaps it with a rainbow laser from its horn,
 * and the alien spins away home. Their goo splats harmlessly on the
 * unicorn's shield. Three waves, then the big mothership, which all her
 * unicorns zap together. Now and then an alien has a letter shield to say.
 */

const WAVES = [4, 6, 8];
const BOSS_HITS = 12;

interface Alien {
  s: Saucer;
  from: THREE.Vector3;
  target: THREE.Vector3;
  age: number;
  leaving: boolean;
  /** A letter shield: say it to zap this one. */
  glyph?: string;
}

export async function aliens(ctx: Ctx): Promise<void> {
  const { stage, ui } = ctx;
  const fx = freshPlace(ctx);
  const sv = save();
  const w = stage.world;

  // A starry night over the hills.
  stage.setSky(0x120a3a, 0x4b2a8a, 0xff8fd0, 0x2d1b5e, 60, 240);
  stage.hemi.intensity = 0.7;
  stage.sun.intensity = 0.9;
  const h = hills(12, 3);
  w.add(ground(h, 320, [0x3f8f6a, 0x5fb37f]));
  const spots: { x: number; z: number }[] = [];
  for (let i = 0; i < 50; i++) {
    const a = (i / 50) * Math.PI * 2;
    const r = 22 + ((i * 37) % 40);
    spots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }
  w.add(trees(spots, h, [0x9775fa, 0x5c7cfa, 0x63e6be, 0xda77f2]));
  for (let i = 0; i < 10; i++) {
    const m = mushroom(RAINBOW[i % RAINBOW.length]);
    const x = (i - 4.5) * 3.2;
    const z = -6 - (i % 3) * 3;
    m.position.set(x, h(x, z), z);
    w.add(m);
  }
  const starPos: number[] = [];
  for (let i = 0; i < 400; i++) {
    const v = new THREE.Vector3().randomDirection();
    v.y = Math.abs(v.y) * 0.9 + 0.1;
    v.normalize().multiplyScalar(220);
    starPos.push(v.x, v.y, v.z);
  }
  const sky = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3)),
    new THREE.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: true, fog: false }),
  );
  const moon = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff3bf, fog: false }));
  moon.position.set(-60, 70, -170);
  w.add(sky, moon);

  // Her unicorn (and later its friends), facing the aliens.
  // A unicorn with magic powers leads the team, if she has one.
  const team = [...sv.unicorns].sort(byPower);
  const hero = new Unicorn(team[0].look);
  hero.holder.rotation.y = Math.PI;
  w.add(hero.holder);
  const helpers: Unicorn[] = [];
  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(2.3, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x99e9f2, transparent: true, opacity: 0, depthWrite: false }),
  );
  shield.position.y = 1.4;
  w.add(shield);

  const portrait = innerWidth < innerHeight;
  stage.camera.position.set(0, portrait ? 4.6 : 3.8, portrait ? 9.5 : 7.2);
  stage.camera.lookAt(0, 3.6, -14);

  const list: Alien[] = [];
  const goo: { m: THREE.Mesh; from: THREE.Vector3; age: number }[] = [];
  let paused = false;
  let shieldFlash = 0;
  let lastTap = performance.now();
  let gooIn = 3;
  // Invisibility: unicorns with the upgrade can hide (see hide.ts).
  let hidden = false;
  const sneaky = team.slice(0, 5).filter((d) => hasUpgrade(d, 'invisible'));
  const hideUnicorns = (on: boolean) => {
    hidden = on;
    for (const u of [hero, ...helpers]) if (u.holder.userData.invisible) u.invisible = on;
    fx.sparkles(new THREE.Vector3(0, 1.6, 0), { count: 60, colors: [0xe7f5ff, 0xd0bfff, 0xffffff], speed: 3 });
    if (on) for (const a of list.filter((x) => !x.leaving)) confused(a.s.holder);
  };
  hero.holder.userData.invisible = hasUpgrade(team[0], 'invisible');
  const hide = sneaky.length ? hideButton(ui, hideUnicorns) : null;
  if (import.meta.env.DEV) Object.assign(window, { hide: () => hide?.press() });
  /** A "?" over a confused alien. */
  const confused = (o: THREE.Object3D) => {
    const q = glyphSprite('?', { size: 1, ring: '#d0bfff' });
    q.position.set(0, 1.8, 0);
    o.add(q);
    setTimeout(() => o.remove(q), 1800);
  };
  /** The sneak-attack laser hopping from one alien to the next. */
  const bounce = (from: THREE.Vector3, to: THREE.Vector3) => {
    const len = from.distanceTo(to);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, len, 6), new THREE.MeshBasicMaterial({ color: 0xd0bfff, transparent: true, blending: THREE.AdditiveBlending }));
    beam.position.copy(from).lerp(to, 0.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    w.add(beam);
    void tween(ctx, 0.3, (k) => ((beam.material as THREE.MeshBasicMaterial).opacity = 1 - k)).then(() => w.remove(beam));
  };

  stage.onFrame((dt) => {
    hero.update(dt);
    helpers.forEach((u) => u.update(dt));
    for (const a of list) {
      a.age += dt;
      if (a.leaving) {
        a.s.holder.rotation.y += dt * 14;
        a.s.holder.position.y += dt * (4 + a.age * 6);
        a.s.holder.position.z -= dt * 10;
        a.s.holder.scale.multiplyScalar(1 - dt * 1.2);
      } else {
        const k = Math.min(1, a.age / 2.4);
        const e = 1 - Math.pow(1 - k, 3);
        a.s.holder.position.lerpVectors(a.from, a.target, e);
        a.s.holder.position.x += Math.sin(a.age * 0.9 + a.target.z) * 1.2 * k;
        a.s.holder.position.y += Math.sin(a.age * 1.7 + a.target.x) * 0.5 * k;
        a.s.update(dt, hidden ? undefined : stage.camera.position);
        // Can't see her invisible unicorn: the aliens look all around, confused.
        if (hidden) a.s.holder.rotation.y += dt * 2.5;
      }
    }
    // Aliens that finished zooming away are gone.
    for (const a of list.filter((x) => x.leaving && x.age > 1.4)) {
      w.remove(a.s.holder);
      list.splice(list.indexOf(a), 1);
    }
    // Goo blobs arc toward her unicorn and splat on the shield.
    for (const g of [...goo]) {
      g.age += dt;
      const k = g.age / 1.8;
      const to = new THREE.Vector3(0, 1.6, 0);
      g.m.position.lerpVectors(g.from, to, k);
      if (hidden) g.m.position.x += (k - 0.5) * 6;
      g.m.position.y += Math.sin(k * Math.PI) * 2;
      g.m.rotation.x += dt * 6;
      if (hidden && k >= 0.86) {
        // It can't find her invisible unicorn: the goo sails past.
        if (k >= 1.6) {
          w.remove(g.m);
          goo.splice(goo.indexOf(g), 1);
        }
        continue;
      }
      if (k >= 0.86) {
        shieldFlash = 1;
        fx.sparkles(g.m.position, { count: 30, colors: [0x8ce99a, 0xc0eb75, 0xffffff], speed: 3, up: 1 });
        sfx.boing();
        w.remove(g.m);
        goo.splice(goo.indexOf(g), 1);
        if (!hero.rearing && Math.random() < 0.4) void hero.rear();
      }
    }
    shieldFlash = Math.max(0, shieldFlash - dt * 2.5);
    (shield.material as THREE.MeshBasicMaterial).opacity = shieldFlash * 0.45;
    shield.scale.setScalar(1 + shieldFlash * 0.08);
    // Every few seconds, a hovering alien lobs some goo.
    if (!paused && !hidden) {
      gooIn -= dt;
      const throwers = list.filter((a) => !a.leaving && a.age > 2.5 && !a.glyph);
      if (gooIn <= 0 && throwers.length) {
        gooIn = 2.5 + Math.random() * 2.5;
        const from = throwers[Math.floor(Math.random() * throwers.length)].s.holder.position.clone();
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), toon(0x8ce99a, { emissive: 0x2f9e44, emissiveIntensity: 0.4 }));
        m.position.copy(from);
        w.add(m);
        goo.push({ m, from, age: 0 });
      }
    }
    // A finger shows where to tap if she hasn't for a while.
    const idle = (performance.now() - lastTap) / 1000;
    const near = list.find((a) => !a.leaving && a.age > 2.4 && !a.glyph);
    if (!paused && idle > 6 && near) {
      const v = near.s.holder.position.clone().project(stage.camera);
      ui.pointAt(((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight);
    } else if (!paused) ui.pointAt(null);
  });

  const laser = (u: Unicorn, to: THREE.Vector3) => {
    u.headYaw = THREE.MathUtils.clamp(Math.atan2(to.x - u.holder.position.x, -(to.z - u.holder.position.z)) * -0.6, -0.6, 0.6);
    hornLaser(ctx, fx, u, to);
  };

  let zapped = 0;
  const zap = (a: Alien, chain = true) => {
    // Sneak attack: an invisible unicorn's blast bounces on to the next alien too.
    if (chain && hidden) {
      const next = list
        .filter((o) => o !== a && !o.leaving && !o.glyph)
        .sort((p, q) => p.s.holder.position.distanceTo(a.s.holder.position) - q.s.holder.position.distanceTo(a.s.holder.position))[0];
      if (next) setTimeout(() => {
        if (next.leaving) return;
        bounce(a.s.holder.position.clone(), next.s.holder.position.clone());
        zap(next, false);
      }, 220);
    }
    laser(hero, a.s.holder.position.clone());
    sfx.zap();
    setTimeout(() => {
      sfx.bloop();
      fx.sparkles(a.s.holder.position, { count: 70, colors: RAINBOW, speed: 6 });
      fx.confetti(a.s.holder.position, 30, 2);
      a.leaving = true;
      a.age = 0;
    }, 120);
    zapped++;
    if (zapped % 4 === 0) ui.toast(['Zap!', 'Bye bye, alien!', praise(), 'Pew pew!'][(zapped / 4) % 4 | 0], 1000);
  };

  // Tap to zap: the alien nearest where she tapped (generously), or just a
  // laser toward the tap if there's nothing near.
  const ray = new THREE.Raycaster();
  let onBossTap: (() => void) | null = null;
  const tap = (e: PointerEvent) => {
    if (e.target !== stage.renderer.domElement || paused) return;
    lastTap = performance.now();
    ui.pointAt(null);
    if (onBossTap) return onBossTap();
    ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), stage.camera);
    const blob = goo.find((g) => ray.ray.distanceToPoint(g.m.position) < 1.2);
    if (blob) {
      laser(hero, blob.m.position.clone());
      sfx.zap();
      fx.sparkles(blob.m.position, { count: 25, colors: [0x8ce99a, 0xffffff], speed: 3 });
      w.remove(blob.m);
      goo.splice(goo.indexOf(blob), 1);
      return;
    }
    let best: Alien | null = null;
    let bestD = Infinity;
    for (const a of list) {
      if (a.leaving || a.glyph) continue;
      const d = ray.ray.distanceToPoint(a.s.holder.position) / a.s.size;
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    if (best && bestD < 2.6) zap(best);
    else {
      laser(hero, ray.ray.at(25, new THREE.Vector3()));
      sfx.zap();
    }
  };
  window.addEventListener('pointerdown', tap);
  if (import.meta.env.DEV) (window as unknown as { zapAll: () => void }).zapAll = () => list.filter((a) => !a.leaving && !a.glyph).forEach((a) => zap(a));

  const spawn = (glyph?: string) => {
    const s = new Saucer(1.3);
    const side = Math.random() < 0.5 ? -1 : 1;
    const from = new THREE.Vector3(side * (20 + Math.random() * 15), 14 + Math.random() * 6, -50);
    const target = glyph ? new THREE.Vector3(0, 4.6, -12) : new THREE.Vector3((Math.random() - 0.5) * 16, 3.2 + Math.random() * 4.5, -13 - Math.random() * 10);
    s.holder.position.copy(from);
    w.add(s.holder);
    const a: Alien = { s, from, target, age: 0, leaving: false, glyph };
    if (glyph) {
      const sign = glyphSprite(glyph, { size: 1.6, ring: '#63e6be' });
      sign.position.set(0, 1.9, 0.4);
      s.holder.add(sign);
    }
    list.push(a);
    return a;
  };

  const waitClear = () =>
    new Promise<void>((resolve) => {
      const off = stage.onFrame(() => {
        if (list.every((a) => a.leaving)) {
          off();
          resolve();
        }
      });
    });

  await say(`Oh no! Silly aliens are flying over the ranch! Tap them, and ${team[0].name} will zap them with rainbow lasers!`);
  if (hide) void say(`${team[0].name} can turn invisible! Tap the ghost button, and the aliens won't find ${team[0].name}!`);

  for (let wave = 0; wave < WAVES.length; wave++) {
    if (wave > 0) await say(['Here come more aliens!', 'Even more aliens! Zap zap!'][wave - 1]);
    // Later waves may bring one alien with a letter shield.
    const letterAlien = wave > 0 && lessonMoment() ? nextLetters(1)[0] : undefined;
    for (let i = 0; i < WAVES[wave]; i++) {
      spawn();
      await seconds(ctx, 1.1);
    }
    if (letterAlien) {
      const a = spawn(letterAlien);
      await seconds(ctx, 2.6);
      paused = true;
      ui.pointAt(null);
      stage.timeScale = 0.25;
      await letterMoment(ctx, letterAlien, 'This alien has a magic shield! What letter is this?');
      stage.timeScale = 1;
      paused = false;
      a.glyph = undefined;
      fx.shards(a.s.holder.position, 0x63e6be);
      zap(a);
    }
    await waitClear();
    ui.toast(praise(), 1200);
    sfx.yay();
    await seconds(ctx, 1);
  }

  // The mothership!
  await say('Uh oh! Here comes the big mothership!');
  const boss = new Saucer(4.2, 0x8ce99a);
  const bossFrom = new THREE.Vector3(0, 30, -90);
  const bossAt = new THREE.Vector3(0, 9, -32);
  boss.holder.position.copy(bossFrom);
  w.add(boss.holder);
  const offBoss = stage.onFrame((dt) => boss.update(dt, stage.camera.position));
  await tween(ctx, 3, (k) => boss.holder.position.lerpVectors(bossFrom, bossAt, k));
  const bob = stage.onFrame(() => (boss.holder.position.y = bossAt.y + Math.sin(stage.time * 1.2) * 0.6));

  // Her other unicorns gallop in to help.
  const friends = team.slice(1, 5);
  if (friends.length) {
    void say(friends.length === 1 ? `${friends[0].name} came to help!` : 'Your unicorns came to help!');
    const spotsX = [-2.6, 2.6, -5, 5];
    await Promise.all(
      friends.map((f, i) => {
        const u = new Unicorn(f.look);
        u.holder.rotation.y = Math.PI;
        const end = new THREE.Vector3(spotsX[i], 0, 1.2 + (i > 1 ? 1 : 0));
        const start = end.clone().add(new THREE.Vector3(Math.sign(end.x) * 14, 0, 8));
        u.holder.position.copy(start);
        u.gait = 'gallop';
        w.add(u.holder);
        u.holder.userData.invisible = hasUpgrade(f, 'invisible');
        if (hidden && u.holder.userData.invisible) u.invisible = true;
        helpers.push(u);
        return tween(ctx, 1.8, (k) => u.holder.position.lerpVectors(start, end, k)).then(() => (u.gait = 'idle'));
      }),
    );
  }

  // Its shield first: a letter, or just a big tap.
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(7, 28, 18), new THREE.MeshStandardMaterial({ color: 0x63e6be, emissive: 0x20c997, emissiveIntensity: 0.4, transparent: true, opacity: 0.25, depthWrite: false }));
  boss.holder.add(bubble);
  bubble.scale.setScalar(1 / boss.size);
  bubble.position.y = 0.2;
  const bossCenter = () => boss.holder.getWorldPosition(new THREE.Vector3());
  if (lessonMoment()) {
    const glyph = nextLetters(1)[0];
    const sign = glyphSprite(glyph, { size: 3, ring: '#63e6be' });
    sign.position.copy(bossCenter()).add(new THREE.Vector3(0, 0, 6));
    w.add(sign);
    paused = true;
    await letterMoment(ctx, glyph, 'The mothership has a shield! What letter is this?');
    paused = false;
    w.remove(sign);
  } else {
    paused = true;
    await tapIt(ctx, bossCenter, 'It has a shield! Tap it to pop it!');
    paused = false;
  }
  boss.holder.remove(bubble);
  fx.shards(bossCenter(), 0x63e6be, 30);
  sfx.shatter();
  void say(team.length > 1 ? 'Now everybody zap it! Tap tap tap!' : 'Now zap it! Tap tap tap!');

  // Every tap: all her unicorns fire at once.
  let hits = 0;
  await new Promise<void>((resolve) => {
    onBossTap = () => {
      const c = bossCenter();
      for (const u of [hero, ...helpers]) laser(u, c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 2, 0)));
      sfx.zap();
      fx.sparkles(c, { count: 40, colors: RAINBOW, speed: 7 });
      boss.holder.rotation.x = (Math.random() - 0.5) * 0.3;
      hits += hidden ? 2 : 1;
      if (hidden) ui.toast('Sneak attack! ×2', 600);
      if (hits === Math.floor(BOSS_HITS / 2) || hits === Math.floor(BOSS_HITS / 2) + 1) void say('Keep going!');
      if (hits >= BOSS_HITS) {
        onBossTap = null;
        resolve();
      }
    };
    if (import.meta.env.DEV) (window as unknown as { bossTap: () => void }).bossTap = () => onBossTap?.();
  });
  window.removeEventListener('pointerdown', tap);
  hide?.remove();
  bob();

  // It spins away home in a burst of fireworks.
  sfx.kaboom();
  const c = bossCenter();
  fx.rainbowRings(c, 12, false);
  fx.confetti(new THREE.Vector3(0, 7, -6), 220, 16);
  for (let i = 0; i < 8; i++) setTimeout(() => fx.firework(c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, Math.random() * 12, (Math.random() - 0.5) * 10))), i * 300);
  const spinFrom = boss.holder.position.clone();
  void tween(ctx, 2.2, (k) => {
    boss.holder.rotation.y += 0.4;
    boss.holder.position.lerpVectors(spinFrom, new THREE.Vector3(30, 60, -150), k);
    boss.holder.scale.setScalar(boss.size * (1 - k * 0.9));
  }).then(() => {
    offBoss();
    w.remove(boss.holder);
  });
  sfx.bloop();
  await seconds(ctx, 1);
  sfx.fanfare();
  for (const u of [hero, ...helpers]) void u.rear();
  sfx.neigh();
  sv.ribbons[0]++;
  persist();
  ui.toast('🏅 Space hero!', 3000);
  for (const u of [hero, ...helpers]) fx.hearts(u.holder.position.clone().add(new THREE.Vector3(0, 2.8, 0)), 4);
  fx.sparkles(new THREE.Vector3(0, 3, 0), { count: 100, colors: PASTEL });
  await say('You did it! The aliens went home, and the ranch is safe! You won a space medal!');
  await seconds(ctx, 1);
}
