import * as THREE from 'three';
import { type Ctx, freshPlace, lessonMoment, letterMoment, nextLetters, praise, seconds, tapIt } from '../ctx';
import { say } from '../speak';
import { sfx } from '../sfx';
import { persist, save } from '../state';
import { glyphSprite, RainbowTrail, RAINBOW } from '../three/fx';
import { damp, toon } from '../three/stage';
import { randomLook, Unicorn } from '../three/unicorn';
import { cloud, pathRibbon, trees } from '../three/world';

/**
 * The cloud race. Her unicorn runs on its own around a road in the sky.
 * At each rainbow gate time slows right down and a letter appears: say it
 * and her unicorn blasts ahead on a rainbow. No steering, no way to crash.
 */

const LANES = [-3.3, -1.1, 1.1, 3.3];
const ME = 1;
const BASE = 11;
const GATES = [0.18, 0.38, 0.58, 0.78];
/** A just-for-fun gate: a star to tap instead of a letter. */
const STAR = 'star';

export async function race(ctx: Ctx): Promise<void> {
  const { stage, ui } = ctx;
  const fx = freshPlace(ctx);
  const sv = save();
  stage.setSky(0x4b3bb5, 0xff9ad5, 0xffe0f0, 0xffc8ea, 80, 300);
  stage.hemi.intensity = 1.1;

  // A loop of road floating over a sea of clouds.
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * (62 + Math.sin(a * 3) * 8), Math.sin(a * 2) * 2.5, Math.sin(a) * (40 + Math.cos(a * 2) * 6)));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  const L = curve.getLength();
  const w = stage.world;
  w.add(pathRibbon(curve, 10.5, 400, null, 0xe9d8ff, 0));
  for (const [off, c] of [[-5.6, 0xff6fae], [5.6, 0x74c0fc]] as const) w.add(edge(curve, off, c));
  w.add(balloons(curve));
  for (let i = 0; i < 40; i++) {
    const c = cloud(2 + (i % 4), i % 5 === 0 ? 0xffe0f5 : 0xffffff);
    const a = i * 2.4;
    const r = 30 + ((i * 41) % 110);
    c.position.set(Math.cos(a) * r, -15 - (i % 3) * 3, Math.sin(a) * r);
    w.add(c);
  }
  // Floating islands with trees.
  const islandSpots: { x: number; z: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const x = Math.cos(a) * 110;
    const z = Math.sin(a) * 80;
    const isl = new THREE.Mesh(new THREE.ConeGeometry(9, 10, 9), toon(0xc9a27a));
    isl.rotation.x = Math.PI;
    isl.position.set(x, -3, z);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 1, 9), toon(0x8fd46a));
    top.position.set(x, 2.5, z);
    w.add(isl, top);
    islandSpots.push({ x, z }, { x: x + 4, z: z + 3 }, { x: x - 3, z: z - 4 });
  }
  const isleTrees = trees(islandSpots, () => 2.5, [0xffb3d9, 0x8ad97a, 0xb197fc]);
  w.add(isleTrees);
  const startArch = arch(curve, 0, null);
  w.add(startArch);

  // The racers: hers, and three friendly rivals.
  const fav = [...sv.unicorns].sort((a, b) => b.hearts - a.hearts)[0];
  const racers = LANES.map((lane, i) => {
    const u = new Unicorn(i === ME ? fav.look : randomLook());
    w.add(u.holder);
    return { u, lane, s: i === ME ? 0 : [3, 0, 0, -1.5][i], v: BASE + [1.3, 0, 1.0, 1.5][i] };
  });
  const me = racers[ME];
  const trail = new RainbowTrail(40, 2.2);
  w.add(trail.mesh);

  // Each gate has a letter to say, or (early on, and in between) a star to tap.
  const letters = nextLetters(GATES.length);
  const lessons = GATES.map(() => lessonMoment());
  const gates = GATES.map((g, i) => {
    const a = arch(curve, g * L, lessons[i] ? letters[i] : STAR);
    w.add(a);
    return { s: g * L, obj: a, done: false };
  });

  let running = false;
  let frozen = false;
  let boost = 0;
  let boostPower = 1;
  let finished = false;
  const baseFov = stage.camera.fov;
  const p = new THREE.Vector3();
  const t = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const look = new THREE.Vector3();
  let first = true;
  let hoofT = 0;

  const place = (r: (typeof racers)[number]) => {
    const u = (((r.s % L) + L) % L) / L;
    curve.getPointAt(u, p);
    curve.getTangentAt(u, t);
    const side = new THREE.Vector3(-t.z, 0, t.x).normalize();
    r.u.holder.position.copy(p).addScaledVector(side, r.lane);
    r.u.holder.rotation.y = Math.atan2(t.x, t.z);
  };

  stage.onFrame((dt) => {
    for (const r of racers) {
      const mine = r === me;
      if (running && !frozen) {
        const v = mine ? BASE * (boost > 0 ? 1 + boostPower : 1) : r.v + Math.sin(stage.time * 0.7 + r.lane) * 0.8;
        r.s += v * dt;
        if (finished && mine) r.s = Math.min(r.s, L + 18);
      }
      if (!mine && r.s > L + 30) r.s = L + 30;
      r.u.gait = running ? 'gallop' : 'idle';
      r.u.stride = r === me && boost > 0 ? 1.6 : 1;
      place(r);
      r.u.update(dt);
    }
    boost = Math.max(0, boost - dt);
    trail.strength = damp(trail.strength, boost > 0 ? 1 : 0, 5, dt);
    trail.update(me.u.holder.position.clone().add(new THREE.Vector3(0, 0.08, 0)));
    stage.camera.fov = damp(stage.camera.fov, baseFov + (boost > 0 ? 14 : 0), 4, dt);
    stage.camera.updateProjectionMatrix();

    // Chase camera: behind her unicorn, closer while time is slowed at a gate.
    const u = ((me.s % L) + L) % L / L;
    curve.getTangentAt(u, t);
    const dist = frozen ? 5 : 7.5;
    camPos.copy(me.u.holder.position).addScaledVector(t, -dist).add(new THREE.Vector3(0, frozen ? 2.4 : 3.3, 0));
    look.copy(me.u.holder.position).addScaledVector(t, 8).add(new THREE.Vector3(0, frozen ? 2.6 : 1.4, 0));
    if (first) {
      stage.camera.position.copy(camPos);
      first = false;
    }
    if (!finished) {
      stage.camera.position.lerp(camPos, 1 - Math.exp(-5 * dt));
      stage.camera.lookAt(look);
    }
    if (running && !frozen) {
      hoofT -= dt;
      if (hoofT < 0) {
        sfx.hoof();
        hoofT = 0.16;
      }
    }
  });

  // Ready, set, go!
  await say(lessons.some(Boolean) ? `${fav.name} is ready to race! At the rainbow gates, do the magic to go super fast!` : `${fav.name} is ready to race! Tap the stars at the rainbow gates to go super fast!`);
  for (const n of ['3', '2', '1']) {
    ui.toast(n, 700);
    sfx.count(Number(n));
    await say(n, { rate: 1.1 });
  }
  ui.toast('GO!', 900);
  sfx.whoosh();
  running = true;

  for (let i = 0; i < gates.length; i++) {
    const g = gates[i];
    await until(ctx, () => me.s >= g.s - 9);
    frozen = true;
    stage.timeScale = 0.15;
    sfx.twinkle();
    const sprite = g.obj.userData.sprite as THREE.Sprite;
    if (lessons[i]) {
      await letterMoment(ctx, letters[i], i === 0 ? 'Rainbow gate! What letter is this?' : 'What letter?');
    } else {
      await tapIt(ctx, () => sprite.getWorldPosition(new THREE.Vector3()), i === 0 ? 'Rainbow gate! Tap the star!' : 'Tap the star!');
    }
    stage.timeScale = 1;
    frozen = false;
    boost = 2.6;
    boostPower = 0.9;
    sfx.whoosh();
    ui.toast(praise());
    fx.sparkles(sprite.getWorldPosition(new THREE.Vector3()), { count: 100, colors: RAINBOW, speed: 7 });
    g.obj.remove(sprite);
    fx.rainbowRings(me.u.holder.position.clone().add(new THREE.Vector3(0, 1, 0)), 3, false);
  }

  await until(ctx, () => me.s >= L);
  finished = true;
  const placeNum = 1 + racers.filter((r) => r !== me && r.s >= L).length;
  sv.ribbons[Math.min(2, placeNum - 1)]++;
  persist();
  const medal = ['🥇', '🥈', '🥉', '🎀'][placeNum - 1];
  const words = ['first', 'second', 'third', 'fourth'][placeNum - 1];
  sfx.fanfare();
  ui.toast(`${medal} ${['1st', '2nd', '3rd', '4th'][placeNum - 1]}!`, 3000);
  const finishAt = me.u.holder.position.clone();
  fx.confetti(finishAt.clone().add(new THREE.Vector3(0, 6, 0)), 200, 12);
  for (let i = 0; i < 6; i++) setTimeout(() => fx.firework(finishAt.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, 18 + Math.random() * 8, (Math.random() - 0.5) * 30))), i * 450);

  // Slow orbit around her unicorn while it celebrates.
  await seconds(ctx, 1.2);
  running = false;
  let orbit = 0;
  stage.onFrame((dt) => {
    orbit += dt * 0.5;
    const c = me.u.holder.position;
    stage.camera.position.set(c.x + Math.sin(orbit) * 7, c.y + 3, c.z + Math.cos(orbit) * 7);
    stage.camera.lookAt(c.x, c.y + 1.5, c.z);
  });
  void me.u.rear();
  sfx.neigh();
  fx.hearts(me.u.holder.position.clone().add(new THREE.Vector3(0, 2.8, 0)), 8);
  await say(placeNum === 1 ? `${fav.name} won ${words} place! You are a super racer!` : `${fav.name} came ${words}! What a great race!`);
  await seconds(ctx, 1.5);
}

function until(ctx: Ctx, test: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const off = ctx.stage.onFrame(() => {
      if (test()) {
        off();
        resolve();
      }
    });
  });
}

/** A rainbow arch across the road; with a letter on top for a gate. */
function arch(curve: THREE.CatmullRomCurve3, s: number, glyph: string | null): THREE.Group {
  const L = curve.getLength();
  const u = (((s % L) + L) % L) / L;
  const g = new THREE.Group();
  g.position.copy(curve.getPointAt(u));
  const t = curve.getTangentAt(u);
  g.rotation.y = Math.atan2(t.x, t.z);
  const colors = glyph ? RAINBOW : [0xffffff, 0x222222, 0xffffff, 0x222222];
  colors.forEach((c, i) => {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(6.6 - i * 0.32, 0.17, 8, 40, Math.PI),
      new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: glyph ? 0.45 : 0.05, roughness: 0.4 }),
    );
    g.add(m);
  });
  if (glyph) {
    const sp = glyph === STAR ? glyphSprite('★', { size: 2.8, ring: '#ffd43b', color: '#ffb703' }) : glyphSprite(glyph, { size: 2.8, ring: '#ffd43b' });
    // Inside the arch's opening and a little in front of it (toward the
    // runners), so the rainbow bands never cover the letter.
    sp.position.set(0, 3.3, -1.8);
    g.add(sp);
    g.userData.sprite = sp;
  } else {
    // Checkered finish banner.
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 32;
    const x = c.getContext('2d')!;
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) {
      x.fillStyle = (i + j) % 2 ? '#222' : '#fff';
      x.fillRect(i * 16, j * 16, 16, 16);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.25), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    banner.position.y = 5.2;
    g.add(banner);
  }
  return g;
}

/** A thin colored stripe along one edge of the road. */
function edge(curve: THREE.CatmullRomCurve3, off: number, color: number): THREE.Mesh {
  const shifted = new THREE.CatmullRomCurve3(
    curve.getSpacedPoints(200).slice(0, 200).map((p, i) => {
      const t = curve.getTangentAt(i / 200);
      return p.clone().add(new THREE.Vector3(-t.z, 0, t.x).normalize().multiplyScalar(off));
    }),
    true,
  );
  return pathRibbon(shifted, 0.7, 400, null, color, 0.03);
}

/** Balloons on posts along both sides of the road. */
function balloons(curve: THREE.CatmullRomCurve3): THREE.Group {
  const g = new THREE.Group();
  const n = 60;
  const ball = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 12, 10), toon(0xffffff), n * 2);
  const stick = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 4), toon(0xffffff), n * 2);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  let k = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const side = new THREE.Vector3(-t.z, 0, t.x).normalize();
    for (const s of [-6.3, 6.3]) {
      const q = p.clone().addScaledVector(side, s);
      stick.setMatrixAt(k, m.makeTranslation(q.x, q.y + 1.1, q.z));
      ball.setMatrixAt(k, m.makeScale(1, 1.2, 1).setPosition(q.x, q.y + 2.6, q.z));
      ball.setColorAt(k, c.set(RAINBOW[(i + (s > 0 ? 3 : 0)) % RAINBOW.length]));
      k++;
    }
  }
  g.add(ball, stick);
  return g;
}
