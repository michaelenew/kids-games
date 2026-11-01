import * as THREE from 'three';
import { type Ctx, freshPlace, stats } from '../ctx';
import { say } from '../speak';
import { sfx } from '../sfx';
import { feedUnlocked } from '../learn';
import { hasUpgrade } from '../upgrades';
import { type OwnedUnicorn, persist, save } from '../state';
import { Unicorn } from '../three/unicorn';
import { barn, cloud, fence, flowers, ground, hills, rainbow, trees } from '../three/world';

export type Activity = 'trail' | 'race' | 'aliens' | 'robots' | 'volcano' | 'magic' | 'stars' | 'dance' | 'style' | 'feed';

const PADDOCK = 13;

interface Roamer {
  u: Unicorn;
  data: OwnedUnicorn;
  target: THREE.Vector3;
  rest: number;
  gallop: boolean;
}

/** Build the ranch scenery (also the backdrop for feeding time). */
export function buildRanch(ctx: Ctx): void {
  const { stage } = ctx;
  stage.setSky(0x5fb2ff, 0xc9ecff, 0xffd6ec, 0xd4ecff, 70, 280);
  const h = hills(24, 4);
  const w = stage.world;
  w.add(ground(h));
  w.add(fence(PADDOCK, 40, 9));
  const b = barn();
  b.position.set(-4, 0, -24);
  b.rotation.y = 0.15;
  w.add(b);
  const rb = rainbow(55, 2.4);
  rb.position.set(10, -6, -120);
  w.add(rb);
  const spots: { x: number; z: number }[] = [];
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + Math.sin(i * 12.9) * 0.2;
    const r = 34 + ((i * 37) % 45);
    spots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }
  w.add(trees(spots, h));
  w.add(flowers(260, (i) => {
    const a = i * 2.39996;
    const r = 15 + ((i * 53) % 18);
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  }, h));
  w.add(flowers(80, (i) => {
    const a = i * 2.39996 + i * i * 0.13;
    const r = 1.5 + (((i * 7919) % 1000) / 1000) * 10.5;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  }, h));
  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 9; i++) {
    const c = cloud(1.4 + (i % 3) * 0.6);
    c.position.set(-120 + i * 30, 32 + (i % 4) * 6, -70 - (i % 3) * 30);
    w.add(c);
    clouds.push(c);
  }
  stage.onFrame((dt) => {
    for (const c of clouds) {
      c.position.x += dt * 1.5;
      if (c.position.x > 140) c.position.x = -140;
    }
  });
}

/**
 * The ranch: her unicorns wander in the paddock while the camera drifts
 * around. Tap a unicorn and it rears up and says hi. Resolves with the
 * activity she picks.
 */
export function ranch(ctx: Ctx, opts: { arrival?: OwnedUnicorn; backdrop?: boolean } = {}): Promise<Activity> {
  const { arrival, backdrop } = opts;
  const { stage, ui } = ctx;
  const fx = freshPlace(ctx);
  buildRanch(ctx);
  const sv = save();
  stats(ctx);

  // The newest few, so older iPads stay smooth.
  const shown = sv.unicorns.slice(-8);
  const roamers: Roamer[] = shown.map((data, i) => {
    const u = new Unicorn(data.look);
    const a = (i / Math.max(1, shown.length)) * Math.PI * 2;
    u.holder.position.set(Math.cos(a) * 5, 0, Math.sin(a) * 5);
    u.holder.rotation.y = Math.random() * 6;
    stage.world.add(u.holder);
    return { u, data, target: u.holder.position.clone(), rest: 1 + Math.random() * 3, gallop: false };
  });

  // A newly tamed unicorn gallops in through the gate.
  const newcomer = arrival ? roamers.find((r) => r.data === arrival) : undefined;
  if (newcomer) {
    newcomer.u.holder.position.set(0, 0, 30);
    newcomer.target.set(0, 0, 2);
    newcomer.gallop = true;
    newcomer.rest = 0;
  }

  let camA = 0.6;
  const camLook = new THREE.Vector3(0, 1.5, 0);
  stage.onFrame((dt) => {
    camA += dt * 0.04;
    const portrait = innerWidth < innerHeight;
    const r = portrait ? 26 : 21;
    stage.camera.position.set(Math.sin(camA) * r, portrait ? 11 : 8, Math.cos(camA) * r);
    stage.camera.lookAt(camLook);
    for (const ro of roamers) roam(ro, dt);
    for (const ro of roamers) ro.u.update(dt);
  });

  // Tap a unicorn: it rears up, neighs and says its name.
  const ray = new THREE.Raycaster();
  const onTap = (e: PointerEvent) => {
    if (e.target !== stage.renderer.domElement) return;
    const p = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(p, stage.camera);
    for (const ro of roamers) {
      if (ray.intersectObject(ro.u.holder, true).length && !ro.u.rearing) {
        ro.rest = 2.5;
        ro.u.gait = 'idle';
        void ro.u.rear();
        sfx.neigh();
        fx.hearts(ro.u.holder.position.clone().add(new THREE.Vector3(0, 2.6, 0)), 5);
        fx.sparkles(ro.u.hornTip(), { count: 40 });
        if (hasUpgrade(ro.data, 'invisible')) {
          // Show off: vanish, then pop back.
          void say(`Hi! I'm ${ro.data.name}! Now you see me...`);
          setTimeout(() => (ro.u.invisible = true), 900);
          setTimeout(() => {
            ro.u.invisible = false;
            fx.sparkles(ro.u.hornTip(), { count: 40, colors: [0xe7f5ff, 0xd0bfff, 0xffffff] });
            sfx.twinkle();
          }, 3200);
        } else void say(`Hi! I'm ${ro.data.name}!`);
        break;
      }
    }
  };
  stage.renderer.domElement.addEventListener('pointerdown', onTap);

  return new Promise((resolve) => {
    // Behind the title screen: just scenery, no buttons or talking.
    if (backdrop) return;
    const pick = (a: Activity) => {
      stage.renderer.domElement.removeEventListener('pointerdown', onTap);
      ui.hideMenu();
      sfx.pop();
      resolve(a);
    };
    const none = sv.unicorns.length === 0;
    const needOne = () => void say('First, find a unicorn on the trail!');
    // Feeding time (the math) joins the menu once learning has started.
    const feed = feedUnlocked(sv.pace) && !none;
    const feedIsNew = feed && !sv.feedShown;
    if (feedIsNew) {
      sv.feedShown = true;
      persist();
    }
    ui.showMenu([
      { icon: '🌳', label: 'Explore', glow: none, onTap: () => pick('trail') },
      { icon: '🏁', label: 'Race', locked: none, onTap: () => (none ? needOne() : pick('race')) },
      { icon: '🛸', label: 'Aliens', locked: none, onTap: () => (none ? needOne() : pick('aliens')) },
      { icon: '🌋', label: 'Volcano', locked: none, onTap: () => (none ? needOne() : pick('volcano')) },
      { icon: '🤖', label: 'Robots', locked: none, onTap: () => (none ? needOne() : pick('robots')) },
      { icon: '⭐', label: 'Stars', locked: none, onTap: () => (none ? needOne() : pick('stars')) },
      { icon: '💃', label: 'Dance', locked: none, onTap: () => (none ? needOne() : pick('dance')) },
      { icon: '🔮', label: 'Magic', locked: none, onTap: () => (none ? needOne() : pick('magic')) },
      { icon: '🎀', label: 'Style', locked: none, onTap: () => (none ? needOne() : pick('style')) },
      ...(feed ? [{ icon: '🍎', label: 'Feed', glow: feedIsNew, onTap: () => pick('feed') }] : []),
    ]);

    if (none) {
      void say("Welcome to your unicorn ranch! It's empty! Let's explore the trail and find a unicorn.");
    } else if (newcomer) {
      sfx.fanfare();
      setTimeout(() => {
        fx.confetti(new THREE.Vector3(0, 6, 2), 140, 10);
        fx.rainbowRings(new THREE.Vector3(0, 0.2, 2), 6);
      }, 1800);
      void say(`${newcomer.data.name} is home! Welcome to the ranch, ${newcomer.data.name}!`);
    } else if (feedIsNew) {
      void say('Your unicorns are hungry! Tap the apple to feed them!');
    } else if (Math.random() < 0.5) {
      void say(['What should we do now?', 'Your unicorns missed you!', 'Uh oh, aliens? Or a dance party?'][Math.floor(Math.random() * 3)]);
    }
  });
}

function roam(ro: Roamer, dt: number): void {
  const pos = ro.u.holder.position;
  if (ro.u.rearing) return;
  if (ro.rest > 0) {
    ro.rest -= dt;
    ro.u.gait = 'idle';
    if (ro.rest <= 0) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * (PADDOCK - 3);
      ro.target.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      ro.gallop = Math.random() < 0.25;
      ro.u.grazing = false;
    }
    return;
  }
  const to = ro.target.clone().sub(pos);
  to.y = 0;
  const d = to.length();
  if (d < 0.4) {
    ro.rest = 2 + Math.random() * 5;
    ro.u.grazing = Math.random() < 0.5;
    return;
  }
  const speed = ro.gallop ? 6 : 1.6;
  ro.u.gait = ro.gallop ? 'gallop' : 'walk';
  // Turn smoothly toward where it's going.
  const want = Math.atan2(to.x, to.z);
  let diff = want - ro.u.holder.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  ro.u.holder.rotation.y += diff * Math.min(1, dt * 4);
  if (Math.abs(diff) < 1.2) pos.addScaledVector(to.normalize(), Math.min(d, speed * dt));
}
