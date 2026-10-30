import * as THREE from 'three';
import { type Ctx, freshPlace, lessonMoment, letterMoment, nextLetters, praise, seconds, tween } from '../ctx';
import { say } from '../speak';
import { sfx } from '../sfx';
import { save } from '../state';
import { glyphSprite, RainbowTrail, RAINBOW } from '../three/fx';
import { Unicorn } from '../three/unicorn';
import { cloud, flowers, ground, hills, trees } from '../three/world';

/**
 * Star catch, mostly just for fun: golden stars drift down over a twilight
 * meadow. Tap one and it zooms into her unicorn's horn. After a dozen, a
 * star shower, then a shooting star to wish on. Now and then a big letter
 * star stops in the sky to be named.
 */

const GOAL = 12;

interface Star {
  m: THREE.Mesh;
  v: number;
  spin: number;
  caught: boolean;
  /** A letter star hangs in the sky until it's named. */
  glyph?: string;
}

let starGeo: THREE.ExtrudeGeometry | null = null;
function starGeometry(): THREE.ExtrudeGeometry {
  if (!starGeo) {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.25 : 0.6;
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    s.closePath();
    starGeo = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
    starGeo.center();
    starGeo.userData.shared = true;
  }
  return starGeo;
}

export async function stars(ctx: Ctx): Promise<void> {
  const { stage, ui } = ctx;
  const fx = freshPlace(ctx);
  const sv = save();
  const w = stage.world;

  stage.setSky(0x2b2370, 0xb197fc, 0xffc9de, 0xd0bfff, 50, 220);
  stage.hemi.intensity = 0.8;
  stage.sun.intensity = 1;
  const h = hills(14, 3);
  w.add(ground(h, 300, [0x74c69d, 0x95d5b2]));
  const spots: { x: number; z: number }[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 20 + ((i * 41) % 35);
    spots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r - 10 });
  }
  w.add(trees(spots, h, [0xffb3d9, 0xb197fc, 0x8ad97a]));
  w.add(flowers(200, (i) => ({ x: Math.cos(i * 2.4) * (3 + (i % 15)), z: Math.sin(i * 2.4) * (3 + (i % 15)) }), h));
  for (let i = 0; i < 6; i++) {
    const c = cloud(1.6, 0xffd6f0);
    c.position.set(-50 + i * 20, 26 + (i % 2) * 4, -70);
    w.add(c);
  }

  const fav = [...sv.unicorns].sort((a, b) => b.hearts - a.hearts)[0];
  const u = new Unicorn(fav.look);
  u.holder.scale.setScalar(1.25);
  w.add(u.holder);
  const portrait = innerWidth < innerHeight;
  stage.camera.position.set(0, portrait ? 4.4 : 3.6, portrait ? 12 : 9.5);
  stage.camera.lookAt(0, 3.3, 0);

  const list: Star[] = [];
  let caught = 0;
  let hop = 0;
  let paused = false;
  let rate = 1.2;
  let spawnIn = 0;
  let spawning = true;
  let lastTap = performance.now();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd43b, emissive: 0xffb703, emissiveIntensity: 0.7, metalness: 0.4, roughness: 0.3 });
  gold.userData.shared = true;

  const spawn = (glyph?: string, fast = false) => {
    const m = new THREE.Mesh(starGeometry(), glyph ? gold.clone() : gold);
    m.position.set((Math.random() - 0.5) * 9, 10 + Math.random() * 2, (Math.random() - 0.5) * 3);
    m.scale.setScalar(1.35);
    if (glyph) {
      m.position.set(0, 10, 1);
      m.scale.setScalar(1.8);
      const sign = glyphSprite(glyph, { size: 1.1, ring: '#ffd43b' });
      sign.position.z = 0.4;
      m.add(sign);
    }
    w.add(m);
    const st: Star = { m, v: fast ? 3 + Math.random() * 2 : 1.2 + Math.random() * 0.9, spin: (Math.random() - 0.5) * 3, caught: false, glyph };
    list.push(st);
    return st;
  };

  stage.onFrame((dt) => {
    u.update(dt);
    hop = Math.max(0, hop - dt * 2.2);
    u.holder.position.y = Math.sin(hop * Math.PI) * 0.9;
    if (spawning && !paused) {
      spawnIn -= dt;
      if (spawnIn <= 0) {
        spawn(undefined, rate < 0.5);
        spawnIn = rate * (0.6 + Math.random() * 0.8);
      }
    }
    for (const s of [...list]) {
      if (s.caught) continue;
      s.m.rotation.z += s.spin * dt;
      s.m.rotation.y = Math.sin(stage.time * 2 + s.v) * 0.5;
      // A letter star stops in the middle of the sky.
      if (s.glyph) s.m.position.y = Math.max(5, s.m.position.y - s.v * dt);
      else if (!paused) s.m.position.y -= s.v * dt;
      if (s.m.position.y < 0.4) {
        fx.sparkles(s.m.position, { count: 10, colors: [0xffe066], speed: 1.5, up: 1, life: 0.6, size: 0.3 });
        w.remove(s.m);
        list.splice(list.indexOf(s), 1);
      }
    }
    const idle = (performance.now() - lastTap) / 1000;
    const near = list.find((s) => !s.caught && !s.glyph && s.m.position.y < 8);
    if (!paused && idle > 5 && near) {
      const v = near.m.position.clone().project(stage.camera);
      ui.pointAt(((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight);
    } else if (!paused) ui.pointAt(null);
  });

  /** The star flies in an arc into her unicorn's horn. */
  const collect = (s: Star) => {
    s.caught = true;
    const from = s.m.position.clone();
    const to = u.hornTip();
    const peak = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 2, 2));
    sfx.twinkle();
    void tween(ctx, 0.55, (k) => {
      s.m.position.set(
        (1 - k) * (1 - k) * from.x + 2 * (1 - k) * k * peak.x + k * k * to.x,
        (1 - k) * (1 - k) * from.y + 2 * (1 - k) * k * peak.y + k * k * to.y,
        (1 - k) * (1 - k) * from.z + 2 * (1 - k) * k * peak.z + k * k * to.z,
      );
      s.m.scale.setScalar((s.glyph ? 1.8 : 1.35) * (1 - k * 0.7));
    }).then(() => {
      w.remove(s.m);
      list.splice(list.indexOf(s), 1);
      fx.sparkles(u.hornTip(), { count: 40, colors: [0xffe066, 0xffffff, ...RAINBOW.slice(0, 3)], speed: 4 });
      u.setGlow(1);
      setTimeout(() => u.setGlow(0.2), 400);
      sfx.count(caught);
      caught++;
      ui.setStats(`<span>⭐ ${caught}</span>`);
      hop = 1;
      if (caught % 5 === 0) {
        void u.rear();
        sfx.neigh();
        ui.toast(praise(), 1000);
      }
    });
  };

  const ray = new THREE.Raycaster();
  const tap = (e: PointerEvent) => {
    if (e.target !== stage.renderer.domElement || paused) return;
    lastTap = performance.now();
    ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), stage.camera);
    let best: Star | null = null;
    let bestD = Infinity;
    for (const s of list) {
      if (s.caught || s.glyph) continue;
      const d = ray.ray.distanceToPoint(s.m.position);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    if (best && bestD < 1.8) collect(best);
  };
  window.addEventListener('pointerdown', tap);
  if (import.meta.env.DEV) (window as unknown as { catchAll: () => void }).catchAll = () => list.filter((s) => !s.caught && !s.glyph).forEach(collect);
  ui.setStats('<span>⭐ 0</span>');

  await say(`The stars are falling! Tap them to catch them for ${fav.name}!`);

  const until = (test: () => boolean) =>
    new Promise<void>((resolve) => {
      const off = stage.onFrame(() => {
        if (test()) {
          off();
          resolve();
        }
      });
    });

  // A letter star, once or twice along the way (when it's learning's turn).
  for (const at of [4, 9]) {
    await until(() => caught >= at);
    if (!lessonMoment()) continue;
    const glyph = nextLetters(1)[0];
    const st = spawn(glyph);
    paused = true;
    ui.pointAt(null);
    await until(() => st.m.position.y <= 5.1);
    await letterMoment(ctx, glyph, 'A magic letter star! What letter is this?');
    paused = false;
    collect(st);
  }
  await until(() => caught >= GOAL);

  // Star shower!
  ui.toast('Star shower!', 1600);
  void say('Wow! A star shower! Catch as many as you can!');
  rate = 0.18;
  await seconds(ctx, 6);
  spawning = false;
  await seconds(ctx, 2.5);
  window.removeEventListener('pointerdown', tap);
  ui.pointAt(null);

  // A shooting star to wish on.
  void say('Look! A shooting star! Make a wish!');
  const shooting = new THREE.Mesh(starGeometry(), gold);
  shooting.scale.setScalar(1.4);
  const trail = new RainbowTrail(50, 1.4);
  w.add(shooting, trail.mesh);
  const a = new THREE.Vector3(-26, 18, -20);
  const b = new THREE.Vector3(26, 10, -14);
  await tween(ctx, 2.6, (k) => {
    shooting.position.lerpVectors(a, b, k);
    shooting.rotation.z += 0.3;
    trail.strength = 1;
    trail.update(shooting.position);
  }, (k) => k);
  for (let i = 0; i < 5; i++) setTimeout(() => fx.firework(new THREE.Vector3((Math.random() - 0.5) * 24, 12 + Math.random() * 6, -12)), i * 280);
  sfx.fanfare();
  void u.rear();
  fx.hearts(u.holder.position.clone().add(new THREE.Vector3(0, 2.8, 0)), 8);
  await say(`You caught ${caught} stars! ${fav.name} is sparkling!`);
  await seconds(ctx, 1.2);
}
