import * as THREE from 'three';
import { type Ctx, freshPlace, lessonMoment, letterMoment, nextLetters, praise, seconds, tapIt, tween } from '../ctx';
import { say } from '../speak';
import { sfx } from '../sfx';
import { type OwnedUnicorn, persist, save } from '../state';
import { glyphSprite, PASTEL, RAINBOW } from '../three/fx';
import { damp, toon } from '../three/stage';
import { unicornFor } from '../herd';
import { Unicorn } from '../three/unicorn';
import { cloud, flowers, ground, hills, mushroom, pathRibbon, trees } from '../three/world';

/**
 * Exploring a trail. The ride moves on its own (on her unicorn's back once
 * she has one). Glowing letter crystals block the path: say the letter and
 * the crystal bursts and flowers bloom. At the end, a shy wild unicorn: three
 * magic letters and it comes over to be her friend.
 */

interface Theme {
  name: string;
  sky: [number, number, number];
  fog: number;
  ground: [number, number];
  trees: number[];
  path: number;
  crystal: number;
  night?: boolean;
}

const THEMES: Theme[] = [
  { name: 'Blossom Woods', sky: [0x6fb8ff, 0xd8f0ff, 0xffe0f0], fog: 0xe3f2ff, ground: [0x8fd46a, 0xb9e57a], trees: [0xffb3d9, 0xff8fc8, 0x8ad97a, 0xffd1e8], path: 0xffe8c2, crystal: 0xff6fc8 },
  { name: 'Candy Hills', sky: [0x7fcbff, 0xfff0c8, 0xffcf9e], fog: 0xfff0d8, ground: [0xa6e36b, 0xd8f08a], trees: [0xffa94d, 0xffe066, 0x69db7c, 0xff6b6b], path: 0xfff3d6, crystal: 0x4dabf7 },
  { name: 'Twilight Glade', sky: [0x231c66, 0x7d5bd6, 0xff9ad5], fog: 0x6d5bb8, ground: [0x4f9d6a, 0x6fbf7f], trees: [0x9775fa, 0x5c7cfa, 0x63e6be, 0xda77f2], path: 0xd0bfff, crystal: 0x63e6be, night: true },
];

export async function trail(ctx: Ctx): Promise<OwnedUnicorn> {
  const { stage, ui } = ctx;
  const fx = freshPlace(ctx);
  const sv = save();
  const theme = THEMES[sv.trails % THEMES.length];
  stage.setSky(...theme.sky, theme.fog, 40, 170);
  stage.hemi.intensity = theme.night ? 0.55 : 1.0;
  stage.sun.intensity = theme.night ? 0.6 : 1.7;

  // The trail winds away from the camera through the trees.
  const h = hills(0, 1.4);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const z = -i * 16;
    const x = Math.sin(i * 0.8) * 7 + Math.sin(i * 0.31) * 5;
    pts.push(new THREE.Vector3(x, h(x, z), z));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const L = curve.getLength();
  const w = stage.world;
  w.add(ground(h, 360, theme.ground));
  w.add(pathRibbon(curve, 3.6, 300, h, theme.path, 0.06));

  // Trees and mushrooms along both sides, never on the path.
  const spots: { x: number; z: number }[] = [];
  const shrooms = new THREE.Group();
  for (let i = 0; i < 150; i++) {
    const u = (i / 150) * 1.05 - 0.02;
    const p = curve.getPointAt(Math.min(1, Math.max(0, u)));
    const t = curve.getTangentAt(Math.min(1, Math.max(0, u)));
    const side = i % 2 ? 1 : -1;
    const off = 6 + ((i * 37) % 20) + (i % 5 === 0 ? 14 : 0);
    spots.push({ x: p.x - t.z * off * side, z: p.z + t.x * off * side });
    if (i % 6 === 0) {
      const m = mushroom(RAINBOW[i % RAINBOW.length]);
      const o = 2.8 + (i % 3) * 0.6;
      const x = p.x - t.z * o * -side;
      const z = p.z + t.x * o * -side;
      m.position.set(x, h(x, z), z);
      m.scale.setScalar(0.9 + (i % 4) * 0.25);
      shrooms.add(m);
    }
  }
  w.add(trees(spots, h, theme.trees), shrooms);
  w.add(flowers(300, (i) => {
    const u = (i / 300);
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const off = (2.6 + ((i * 13) % 9)) * (i % 2 ? 1 : -1);
    return { x: p.x - t.z * off, z: p.z + t.x * off };
  }, h));
  for (let i = 0; i < 6; i++) {
    const c = cloud(1.6, theme.night ? 0xb197fc : 0xffffff);
    c.position.set(-60 + i * 25, 30 + (i % 3) * 5, -90 - i * 15);
    w.add(c);
  }
  // Fireflies (or floating pollen in the daytime).
  const motes = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(
      Array.from({ length: 240 * 3 }, (_, i) => {
        const k = Math.floor(i / 3);
        const p = curve.getPointAt((k * 0.618) % 1);
        return i % 3 === 0 ? p.x + Math.sin(k * 7) * 9 : i % 3 === 1 ? p.y + 0.5 + (k % 7) * 0.6 : p.z + Math.cos(k * 3) * 9;
      }), 3)),
    new THREE.PointsMaterial({ color: theme.night ? 0xfff3a3 : 0xffffff, size: 0.18, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  w.add(motes);

  // Her ride (her favorite unicorn), or walking if she doesn't have one yet.
  const fav = [...sv.unicorns].sort((a, b) => b.hearts - a.hearts)[0];
  const ride = fav ? new Unicorn(fav.look) : null;
  if (ride) w.add(ride.holder);

  // Each crystal is a letter to say, or (early on, and in between) just one to tap.
  const letters = nextLetters(3);
  const lessons = [0, 1, 2].map(() => lessonMoment());
  const stones = [0.15, 0.38, 0.61].map((u, i) => makeStone(ctx, curve, u, lessons[i] ? letters[i] : null, theme.crystal));
  const bubbles = floatingBubbles(ctx, curve, fx);
  const bloomSets = [0.19, 0.42, 0.65].map((u) => bloomFlowers(curve, u, h, w));

  let s = 0;
  let speed = 0;
  let want = ride ? 9 : 6;
  let bob = 0;
  const camPos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const p = new THREE.Vector3();
  const t = new THREE.Vector3();
  let first = true;
  stage.onFrame((dt) => {
    speed = damp(speed, want, 2.5, dt);
    s = Math.min(L - 0.01, s + speed * dt);
    curve.getPointAt(s / L, p);
    curve.getTangentAt(s / L, t);
    bob += dt * speed * 1.4;
    if (ride) {
      ride.holder.position.set(p.x, h(p.x, p.z), p.z);
      ride.holder.rotation.y = Math.atan2(t.x, t.z);
      ride.gait = speed > 4 ? 'gallop' : speed > 0.6 ? 'walk' : 'idle';
      ride.update(dt);
      // Stopped at a letter: look over her unicorn's shoulder so it doesn't hide the letter.
      const stopped = Math.max(0, 1 - speed / 2);
      camPos.copy(p).addScaledVector(t, -6.5).add(new THREE.Vector3(-t.z * 2.4 * stopped, 3.6 + stopped * 0.8, t.x * 2.4 * stopped));
      look.copy(p).addScaledVector(t, 8).add(new THREE.Vector3(0, 1.6, 0));
    } else {
      camPos.copy(p).add(new THREE.Vector3(0, 1.7 + Math.sin(bob) * 0.06 * Math.min(1, speed), 0));
      look.copy(p).addScaledVector(t, 10).add(new THREE.Vector3(0, 1.4, 0));
    }
    if (first) {
      stage.camera.position.copy(camPos);
      first = false;
    }
    stage.camera.position.lerp(camPos, 1 - Math.exp(-6 * dt));
    stage.camera.lookAt(look);
    shrooms.children.forEach((m, i) => (m.rotation.y = Math.sin(stage.time + i) * 0.1));
    motes.position.y = Math.sin(stage.time * 0.7) * 0.3;
  });

  const goTo = (target: number) =>
    new Promise<void>((resolve) => {
      want = ride ? 9 : 6;
      const off = stage.onFrame(() => {
        const left = target - s;
        if (left < 6) want = Math.max(1.2, left * 1.1);
        if (left < 0.3) {
          want = 0;
          off();
          resolve();
        }
      });
    });

  void say(lessons.some(Boolean) ? `Let's explore ${theme.name}! Look out for magic letters!` : `Let's explore ${theme.name}! Tap the bubbles to pop them!`);

  for (let i = 0; i < stones.length; i++) {
    const st = stones[i];
    await goTo(st.at - (ride ? 8 : 11));
    st.sparkleWith(fx);
    st.wake();
    if (lessons[i]) {
      await letterMoment(ctx, letters[i], i === 0 ? 'A magic crystal is blocking the path! What letter is this?' : 'What letter is this?');
    } else {
      await tapIt(ctx, st.center, i === 0 ? 'A magic crystal is blocking the path! Tap it!' : 'Another crystal! Tap it!');
    }
    st.burst(fx);
    ui.toast(praise());
    if (ride) {
      void ride.rear();
      sfx.neigh();
    }
    void tween(ctx, 1.4, (k) => bloomSets[i].grow(k));
    await seconds(ctx, 0.9);
  }

  // The wild unicorn in the glade.
  // The next unicorn in her fixed order (the same one on every device).
  const newcomer = unicornFor(sv.unicorns.length);
  const look2 = newcomer.look;
  const wild = new Unicorn(look2);
  const gladeAt = L - 3;
  const gp = curve.getPointAt(gladeAt / L);
  const gt = curve.getTangentAt(gladeAt / L);
  wild.holder.position.set(gp.x, h(gp.x, gp.z), gp.z);
  wild.holder.rotation.y = Math.atan2(-gt.x, -gt.z);
  wild.setGlow(0.6);
  w.add(wild.holder);
  const aura = setInterval(() => fx.sparkles(wild.hornTip(), { count: 6, speed: 1, up: 0.6, life: 1, size: 0.3 }), 300);
  stage.onFrame((dt) => wild.update(dt));
  await goTo(gladeAt - 13);

  bubbles.stop();
  await say('Look! A wild unicorn! It is a little shy.');
  const tameLetters = nextLetters(3);
  const tameLessons = [0, 1, 2].map(() => lessonMoment());
  void say(tameLessons[0] ? 'Say the magic letters to make friends!' : "Let's make friends!");
  for (let i = 0; i < 3; i++) {
    if (tameLessons[i]) {
      const glyph = tameLetters[i];
      const bubble = glyphSprite(glyph, { size: 2.2, ring: '#ffd43b' });
      const from = wild.hornTip();
      bubble.position.copy(from);
      bubble.scale.setScalar(0.01);
      w.add(bubble);
      sfx.twinkle();
      // Float the letter to the upper middle of the view, wherever the unicorn is.
      const above = stage.camera.localToWorld(new THREE.Vector3(0, 1.1, -7));
      await tween(ctx, 0.8, (k) => {
        bubble.position.lerpVectors(from, above, k);
        bubble.scale.setScalar(0.01 + k * 2.2);
      });
      const bob2 = stage.onFrame(() => (bubble.position.y = above.y + Math.sin(stage.time * 3) * 0.12));
      await letterMoment(ctx, glyph, i === 0 ? 'What letter is this?' : 'And this one?');
      bob2();
      fx.sparkles(bubble.position, { count: 70, colors: [0xffd43b, ...PASTEL] });
      w.remove(bubble);
    } else {
      await tapIt(ctx, () => wild.hornTip().add(new THREE.Vector3(0, -0.4, 0)), ['Pet the unicorn! Tap it!', 'Pet it again!', 'One more pat!'][i]);
      sfx.neigh();
      fx.sparkles(wild.hornTip(), { count: 50, colors: [0xffd43b, ...PASTEL] });
    }
    fx.hearts(wild.holder.position.clone().add(new THREE.Vector3(0, 2.8, 0)), 4);
    ui.toast(praise());
    // It trots a little closer each time.
    if (i < 2) {
      const start = wild.holder.position.clone();
      const end = start.clone().addScaledVector(gt, -3);
      end.y = h(end.x, end.z);
      wild.gait = 'walk';
      await tween(ctx, 1.4, (k) => wild.holder.position.lerpVectors(start, end, k));
      wild.gait = 'idle';
      void say(i === 0 ? 'It is coming closer!' : 'Almost friends!');
    }
  }
  clearInterval(aura);

  // Friends!
  const name = newcomer.name;
  sfx.fanfare();
  sfx.neigh();
  void wild.rear();
  wild.setGlow(1);
  fx.rainbowRings(wild.holder.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 7);
  fx.confetti(wild.holder.position.clone().add(new THREE.Vector3(0, 5, 0)), 160, 8);
  fx.hearts(wild.holder.position.clone().add(new THREE.Vector3(0, 2.8, 0)), 10);
  ui.toast('New friend!', 2200);
  await say(`Hooray! You made a new friend! Let's call it ${name}!`);
  wild.setGlow(0.2);
  const owned: OwnedUnicorn = { name, look: look2, hearts: 0 };
  sv.unicorns.push(owned);
  sv.trails++;
  persist();
  await say(`${name} is coming home to your ranch!`);
  return owned;
}

/** A glowing crystal with a letter in front of it, standing on the path. */
function makeStone(ctx: Ctx, curve: THREE.CatmullRomCurve3, u: number, glyph: string | null, color: number) {
  const L = curve.getLength();
  const p = curve.getPointAt(u);
  const grp = new THREE.Group();
  grp.position.copy(p);
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1, 0),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.1, metalness: 0.2, flatShading: true, transparent: true, opacity: 0.92 }),
  );
  crystal.scale.set(0.8, 1.25, 0.8);
  crystal.position.y = 1.6;
  crystal.castShadow = true;
  grp.add(crystal);
  for (let i = 0; i < 6; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35, 0), toon(0xcfc6e8));
    const a = (i / 6) * Math.PI * 2;
    r.position.set(Math.cos(a) * 1.3, 0.15, Math.sin(a) * 1.3);
    grp.add(r);
  }
  // A letter crystal has its letter floating above it; a tap crystal is bigger and sparklier.
  const sprite = glyph ? glyphSprite(glyph, { size: 2.3 }) : new THREE.Object3D();
  const t = curve.getTangentAt(u);
  sprite.position.set(-t.x * 0.6, 3.8, -t.z * 0.6);
  grp.add(sprite);
  if (!glyph) crystal.scale.multiplyScalar(1.3);
  ctx.stage.world.add(grp);
  let awake = false;
  const off = ctx.stage.onFrame((dt) => {
    crystal.rotation.y += dt * (awake ? 2 : 0.6);
    crystal.position.y = 1.6 + Math.sin(ctx.stage.time * 2) * 0.15;
    sprite.position.y = 3.8 + Math.sin(ctx.stage.time * 2 + 1) * 0.12;
    if (!glyph && awake && Math.random() < dt * 6) burstTwinkle();
    (crystal.material as THREE.MeshStandardMaterial).emissiveIntensity = awake ? 0.8 + Math.sin(ctx.stage.time * 6) * 0.3 : 0.5;
  });
  const twinkles: (() => void)[] = [];
  const burstTwinkle = () => twinkles.forEach((f) => f());
  return {
    at: u * L,
    center: () => crystal.getWorldPosition(new THREE.Vector3()),
    sparkleWith(fx: import('../three/fx').Fx) {
      twinkles.push(() => fx.sparkles(crystal.getWorldPosition(new THREE.Vector3()), { count: 4, speed: 1.5, up: 0.5, life: 0.8, size: 0.3 }));
    },
    wake() {
      awake = true;
      sfx.twinkle();
    },
    burst(fx: import('../three/fx').Fx) {
      off();
      const at = grp.position.clone().add(new THREE.Vector3(0, 1.8, 0));
      fx.shards(at, color);
      fx.sparkles(at, { count: 90, colors: [color, ...PASTEL], speed: 6 });
      fx.rainbowRings(grp.position.clone().add(new THREE.Vector3(0, 0.2, 0)), 5);
      sfx.shatter();
      grp.remove(crystal, sprite);
    },
  };
}

/** Flowers along the next stretch of path that pop up when a crystal bursts. */
function bloomFlowers(curve: THREE.CatmullRomCurve3, u0: number, h: (x: number, z: number) => number, w: THREE.Group) {
  const n = 70;
  const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 10, 8), toon(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.15 }), n);
  const spots: THREE.Vector3[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const u = Math.min(1, u0 + (i / n) * 0.16);
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const off = (2.3 + (i % 3) * 0.5) * (i % 2 ? 1 : -1);
    const x = p.x - t.z * off;
    const z = p.z + t.x * off;
    spots.push(new THREE.Vector3(x, h(x, z) + 0.25, z));
    inst.setColorAt(i, c.set(RAINBOW[i % RAINBOW.length]));
  }
  const m = new THREE.Matrix4();
  const grow = (k: number) => {
    for (let i = 0; i < n; i++) {
      const ki = THREE.MathUtils.clamp(k * 1.6 - (i / n) * 0.6, 0, 1);
      const s = ki * (1 + Math.sin(ki * Math.PI) * 0.4);
      m.makeScale(s, s * 0.7, s).setPosition(spots[i]);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
  };
  grow(0);
  w.add(inst);
  return { grow };
}

/**
 * Shiny bubbles floating along the trail, just for fun: tap one to pop it.
 * Returns stop(), which ends the popping (the rest float on).
 */
function floatingBubbles(ctx: Ctx, curve: THREE.CatmullRomCurve3, fx: import('../three/fx').Fx) {
  const { stage } = ctx;
  const geo = new THREE.SphereGeometry(0.7, 18, 14);
  const shineGeo = new THREE.SphereGeometry(0.12, 8, 6);
  const bubbles: THREE.Mesh[] = [];
  for (let i = 0; i < 22; i++) {
    const u = 0.06 + (i / 22) * 0.84 + Math.sin(i * 7.3) * 0.015;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const off = (1.2 + ((i * 37) % 10) / 4) * (i % 2 ? 1 : -1);
    const color = RAINBOW[i % RAINBOW.length];
    const b = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, transparent: true, opacity: 0.6, roughness: 0.05, metalness: 0.1 }));
    const shine = new THREE.Mesh(shineGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    shine.position.set(-0.28, 0.32, 0.38);
    b.add(shine);
    b.position.set(p.x - t.z * off, p.y + 1.6 + ((i * 13) % 7) * 0.3, p.z + t.x * off);
    b.userData.y0 = b.position.y;
    b.userData.phase = i;
    stage.world.add(b);
    bubbles.push(b);
  }
  stage.onFrame(() => {
    for (const b of bubbles) b.position.y = b.userData.y0 + Math.sin(stage.time * 1.5 + b.userData.phase) * 0.3;
  });
  const ray = new THREE.Raycaster();
  let popped = 0;
  const tap = (e: PointerEvent) => {
    if (e.target !== stage.renderer.domElement) return;
    ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), stage.camera);
    // Generous: count a tap near a bubble, not just on it.
    const hit = bubbles.find((b) => b.parent && ray.ray.distanceToPoint(b.position) < 1.1);
    if (!hit) return;
    stage.world.remove(hit);
    fx.sparkles(hit.position, { count: 40, colors: RAINBOW, speed: 4, up: 1 });
    sfx.pop();
    sfx.twinkle();
    popped++;
    if (popped % 5 === 0) ctx.ui.toast(['Pop!', 'Pop pop!', 'Bubbles!'][(popped / 5) % 3 | 0], 900);
  };
  window.addEventListener('pointerdown', tap);
  return { stop: () => window.removeEventListener('pointerdown', tap) };
}
