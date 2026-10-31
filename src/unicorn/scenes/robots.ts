import * as THREE from 'three';
import { type Ctx, freshPlace, lessonMoment, letterMoment, nextLetters, praise, seconds, tapIt, tween } from '../ctx';
import { hideButton } from '../hide';
import { hornLaser } from '../laser';
import { byPower, hasUpgrade } from '../upgrades';
import { say } from '../speak';
import { sfx } from '../sfx';
import { type OwnedUnicorn, persist, save } from '../state';
import { Badbot } from '../three/badbot';
import { type Fx, glyphSprite, PASTEL, RAINBOW } from '../three/fx';
import { Unicorn } from '../three/unicorn';
import { buildRanch } from './ranch';

/**
 * Robot rescue: evil grabber robots roll in through the ranch gate to carry
 * unicorns off. The unicorns team up: tap a robot and every free unicorn
 * zaps it with its horn, and it falls apart into springs and bolts. If a
 * robot grabs a unicorn, zap it and the unicorn drops free. Zapping charges a
 * TEAM UP button: a rainbow blast that clears every robot. Three waves, then
 * the giant boss robot with a cage on its back; anyone carried off is in the
 * cage and comes home at the end, so no unicorn is ever lost.
 */

const WAVES = [3, 5, 6];
const BOSS_HITS = 14;
const TEAM_UP_AT = 5;
const ESCAPE_Z = 44;

interface Member {
  u: Unicorn;
  data: OwnedUnicorn;
  home: THREE.Vector3;
  /** The robot carrying it, if any. */
  heldBy: Bot | null;
  /** Carried off the field: waiting in the boss's cage. */
  caged: boolean;
  returning: boolean;
  /** Has Invisibility: hidden from robots while the Hide button is on. */
  sneaky: boolean;
}

interface Bot {
  b: Badbot;
  state: 'approach' | 'grab' | 'carry' | 'broken';
  target: Member | null;
  t: number;
  speed: number;
  glyph?: string;
}

export async function robots(ctx: Ctx): Promise<void> {
  const { stage, ui } = ctx;
  const fx = freshPlace(ctx);
  buildRanch(ctx);
  stage.setSky(0x4a3fa0, 0xffa8a8, 0xffd8a8, 0xffd8c8, 70, 260);
  // The robots face the camera, away from the sun: extra sky light so they aren't silhouettes.
  stage.hemi.intensity = 1.6;
  const sv = save();
  const w = stage.world;

  // Her team: up to five unicorns in a line, facing the gate.
  // Unicorns with magic powers join the team first.
  const datas = [...sv.unicorns].sort(byPower).slice(0, 5);
  const xs = [0, -3, 3, -6, 6];
  const team: Member[] = datas.map((data, i) => {
    const u = new Unicorn(data.look);
    const home = new THREE.Vector3(xs[i], 0, i === 0 ? 1 : 0);
    u.holder.position.copy(home);
    w.add(u.holder);
    return { u, data, home, heldBy: null, caged: false, returning: false, sneaky: hasUpgrade(data, 'invisible') };
  });

  const portrait = innerWidth < innerHeight;
  const camBase = new THREE.Vector3(0, portrait ? 8 : 6.5, portrait ? -17 : -13);
  const camLook = new THREE.Vector3(0, 1.4, 12);
  stage.camera.position.copy(camBase);
  stage.camera.lookAt(camLook);
  let shake = 0;

  const bots: Bot[] = [];
  let paused = false;
  let charge = 0;
  let lastTap = performance.now();
  // Invisibility: hidden unicorns can't be found, and a grabbed one slips free.
  let hidden = false;
  const unseen = (m: Member) => hidden && m.sneaky;
  const hide = team.some((m) => m.sneaky)
    ? hideButton(ui, (on) => {
        hidden = on;
        for (const m of team.filter((x) => x.sneaky)) {
          m.u.invisible = on;
          fx.sparkles(m.u.holder.position.clone().add(new THREE.Vector3(0, 1.5, 0)), { count: 30, colors: [0xe7f5ff, 0xd0bfff, 0xffffff], speed: 2 });
          if (on && m.heldBy) {
            // Poof: it slips right out of the robot's claws.
            const r = m.heldBy;
            m.heldBy = null;
            m.returning = true;
            r.state = 'approach';
            r.target = null;
            r.b.reach = 0;
            void say(`${m.data.name} turned invisible and escaped!`);
          }
        }
      })
    : null;
  if (import.meta.env.DEV) Object.assign(window, { hide: () => hide?.press() });

  const free = () => team.filter((m) => !m.heldBy && !m.caged && !m.returning);

  stage.onFrame((dt) => {
    // Unicorns: face the gate, gallop home after a rescue, kick while carried.
    for (const m of team) {
      if (m.caged) {
        m.u.update(dt);
        continue;
      }
      if (m.heldBy) {
        // Hoisted up over the robot's head, legs kicking.
        const rb = m.heldBy.b;
        m.u.holder.position.copy(rb.holder.position).add(new THREE.Vector3(0, 2.75 * rb.size, 0));
        m.u.holder.rotation.y = Math.PI + Math.sin(stage.time * 3) * 0.3;
        m.u.holder.rotation.z = Math.sin(stage.time * 5) * 0.15;
        m.u.gait = 'gallop';
      } else if (m.returning) {
        const to = m.home.clone().sub(m.u.holder.position);
        to.y = 0;
        m.u.holder.rotation.z = 0;
        if (to.length() < 0.3) {
          m.returning = false;
          m.u.holder.position.copy(m.home);
        } else {
          m.u.gait = 'gallop';
          m.u.holder.rotation.y = Math.atan2(to.x, to.z);
          m.u.holder.position.addScaledVector(to.normalize(), Math.min(to.length(), dt * 7));
          m.u.holder.position.y = Math.max(0, m.u.holder.position.y - dt * 6);
        }
      } else {
        m.u.gait = 'idle';
        m.u.holder.rotation.y += (0 - m.u.holder.rotation.y) * Math.min(1, dt * 4);
      }
      m.u.update(dt);
    }
    // Robots.
    for (const r of bots) {
      r.b.update(dt);
      if (paused || r.state === 'broken') continue;
      const p = r.b.holder.position;
      if (r.state === 'approach') {
        if (!r.target || r.target.heldBy || r.target.caged || r.target.returning || unseen(r.target)) r.target = pickTarget(r);
        const goal = r.glyph ? new THREE.Vector3(p.x, 0, 9) : r.target ? r.target.u.holder.position.clone().add(new THREE.Vector3(0, 0, 2.4 * r.b.size)) : new THREE.Vector3(0, 0, 6);
        const to = goal.sub(p);
        to.y = 0;
        r.b.moving = to.length() > 0.2;
        r.b.holder.rotation.y = Math.atan2(to.x, to.z);
        if (to.length() > 0.2) p.addScaledVector(to.normalize(), Math.min(to.length(), dt * r.speed));
        else if (r.target && !r.glyph) {
          r.state = 'grab';
          r.t = 0;
          r.b.reach = 1;
        }
      } else if (r.state === 'grab') {
        r.t += dt;
        r.b.moving = false;
        if (r.target && unseen(r.target)) {
          // Its unicorn vanished! Back to looking.
          r.state = 'approach';
          r.b.reach = 0;
          r.target = null;
        } else if (r.t > 0.7 && r.target && !r.target.heldBy) {
          r.target.heldBy = r;
          r.state = 'carry';
          r.b.reach = 1.25;
          sfx.neigh();
          void say(`Oh no! A robot grabbed ${r.target.data.name}! Tap it!`);
        }
      } else if (r.state === 'carry') {
        r.b.moving = true;
        r.b.holder.rotation.y = 0;
        p.z += dt * r.speed * 0.55;
        if (p.z > ESCAPE_Z && r.target) {
          // Carried off: it'll be in the boss's cage, rescued at the end.
          r.target.heldBy = null;
          r.target.caged = true;
          r.target.u.holder.visible = false;
          void say(`The robot took ${r.target.data.name} away! Don't worry, we'll rescue ${r.target.data.name}!`);
          r.state = 'broken';
          w.remove(r.b.holder);
        }
      }
    }
    // Camera, with a little shake for big moments.
    shake = Math.max(0, shake - dt * 2.5);
    stage.camera.position.copy(camBase).add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
    stage.camera.lookAt(camLook);
    // Show where to tap if she hasn't for a while.
    const idle = (performance.now() - lastTap) / 1000;
    const near = bots.find((r) => r.state !== 'broken' && !r.glyph && r.b.holder.position.z < 30);
    if (!paused && idle > 6 && near) {
      const v = near.b.center().project(stage.camera);
      ui.pointAt(((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight);
    } else if (!paused) ui.pointAt(null);
  });

  function pickTarget(r: Bot): Member | null {
    const taken = new Set(bots.filter((o) => o !== r && o.state !== 'broken').map((o) => o.target));
    const visible = free().filter((m) => !unseen(m));
    const options = visible.filter((m) => !taken.has(m));
    const list = options.length ? options : visible;
    if (!list.length) return null;
    return list.reduce((a, b) => (a.u.holder.position.distanceTo(r.b.holder.position) < b.u.holder.position.distanceTo(r.b.holder.position) ? a : b));
  }

  const spawn = (glyph?: string, size = 1) => {
    const b = new Badbot(size, glyph ? 0x8d99ae : [0x9d7fbf, 0x7f9cc4, 0xc48f7f][Math.floor(Math.random() * 3)]);
    b.holder.position.set((Math.random() - 0.5) * 18, 0, 38 + Math.random() * 6);
    b.holder.rotation.y = Math.PI;
    w.add(b.holder);
    const r: Bot = { b, state: 'approach', target: null, t: 0, speed: 2 + Math.random() * 0.8, glyph };
    if (glyph) {
      b.holder.position.x = 0;
      const screen = glyphSprite(glyph, { size: 1.1, ring: '#ff2d55' });
      screen.position.set(0, 1.4, 0.62);
      b.holder.add(screen);
    }
    bots.push(r);
    return r;
  };

  /** Every free unicorn zaps the robot at once: unicorn teamwork! */
  const teamZap = (r: Bot) => {
    const c = r.b.center();
    for (const m of free()) hornLaser(ctx, fx, m.u, c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, 0)));
    sfx.zap();
  };

  const breakBot = (r: Bot) => {
    if (r.state === 'broken') return;
    teamZap(r);
    const c = r.b.center();
    const rescued = r.state === 'carry' ? r.target : null;
    r.state = 'broken';
    setTimeout(() => {
      fallApart(fx, r.b, c);
      sfx.boing();
      sfx.shatter();
      w.remove(r.b.holder);
      if (rescued) {
        rescued.heldBy = null;
        rescued.returning = true;
        fx.hearts(c, 6);
        sfx.neigh();
        void say(`You saved ${rescued.data.name}!`);
      }
    }, 140);
    charge = Math.min(TEAM_UP_AT, charge + 1);
    updateTeamButton();
  };

  // TEAM UP: a rainbow blast from every unicorn that clears the field.
  const style = document.createElement('style');
  style.textContent = `#teamup { position: absolute; right: 16px; bottom: 20px; width: min(150px, 26vw); height: min(150px, 26vw); font-size: min(24px, 4.4vw); font-weight: 800;
      display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1; color: #fff;
      background: conic-gradient(#ff4d6d 0 var(--c), rgba(255,255,255,.35) var(--c) 100%); border: 6px solid #fff; text-shadow: 0 2px 4px rgba(0,0,0,.4); }
    #teamup span { font-size: min(52px, 9vw); }
    #teamup.ready { background: linear-gradient(135deg, #ff4d6d, #ff9f1c, #ffe14d, #52d273, #3fa9f5, #7b6cf6); animation: glow 0.9s ease-in-out infinite; }`;
  const teamBtn = document.createElement('button');
  teamBtn.id = 'teamup';
  teamBtn.className = 'btn';
  teamBtn.innerHTML = '<span>🦄</span>TEAM UP';
  ui.root.append(style, teamBtn);
  function updateTeamButton() {
    teamBtn.style.setProperty('--c', `${(charge / TEAM_UP_AT) * 100}%`);
    const ready = charge >= TEAM_UP_AT;
    if (ready && !teamBtn.classList.contains('ready')) void say('Team up is ready! Tap the rainbow button!');
    teamBtn.classList.toggle('ready', ready);
  }
  updateTeamButton();
  const teamUp = () => {
    if (charge < TEAM_UP_AT || paused) return;
    charge = 0;
    updateTeamButton();
    sfx.fanfare();
    void say('Team up! Unicorn power!');
    shake = 0.6;
    for (const m of free()) {
      void m.u.rear();
      m.u.setGlow(1);
      fx.sparkles(m.u.hornTip(), { count: 40, colors: RAINBOW, speed: 4 });
    }
    fx.rainbowRings(new THREE.Vector3(0, 0.3, 4), 40);
    setTimeout(() => {
      for (const r of bots.filter((x) => x.state !== 'broken' && !x.glyph)) breakBot(r);
      charge = 0;
      updateTeamButton();
    }, 450);
  };
  teamBtn.addEventListener('click', teamUp);

  // Tap a robot: everybody zaps it.
  const ray = new THREE.Raycaster();
  let onBossTap: (() => void) | null = null;
  const tap = (e: PointerEvent) => {
    if (e.target !== stage.renderer.domElement || paused) return;
    lastTap = performance.now();
    ui.pointAt(null);
    if (onBossTap) return onBossTap();
    ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), stage.camera);
    let best: Bot | null = null;
    let bestD = Infinity;
    for (const r of bots) {
      if (r.state === 'broken' || r.glyph) continue;
      const d = ray.ray.distanceToPoint(r.b.center()) / r.b.size;
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    if (best && bestD < 2.8) breakBot(best);
  };
  window.addEventListener('pointerdown', tap);
  if (import.meta.env.DEV) {
    Object.assign(window, {
      zapAll: () => bots.filter((r) => r.state !== 'broken' && !r.glyph).forEach(breakBot),
      teamUp: () => {
        charge = TEAM_UP_AT;
        teamUp();
      },
    });
  }

  const waitClear = () =>
    new Promise<void>((resolve) => {
      const off = stage.onFrame(() => {
        if (bots.every((r) => r.state === 'broken')) {
          off();
          resolve();
        }
      });
    });

  await say(`Oh no! Evil robots are coming to grab the unicorns! Unicorns, team up! Tap the robots to zap them!`);
  if (hide) void say('Some of your unicorns can turn invisible! Tap the ghost button to hide them from the robots!');

  for (let wave = 0; wave < WAVES.length; wave++) {
    if (wave > 0) await say(['More robots! Unicorn team, get ready!', 'Here comes a big bunch of robots!'][wave - 1]);
    const letterBot = wave > 0 && lessonMoment() ? nextLetters(1)[0] : undefined;
    for (let i = 0; i < WAVES[wave]; i++) {
      spawn();
      await seconds(ctx, 1.6);
    }
    if (letterBot) {
      const r = spawn(letterBot);
      await new Promise<void>((resolve) => {
        const off = stage.onFrame(() => {
          if (r.b.holder.position.z <= 9.3) {
            off();
            resolve();
          }
        });
      });
      paused = true;
      ui.pointAt(null);
      r.b.moving = false;
      await letterMoment(ctx, letterBot, 'This robot has a letter on its screen! What letter is this?');
      paused = false;
      r.glyph = undefined;
      breakBot(r);
    }
    await waitClear();
    ui.toast(praise(), 1200);
    sfx.yay();
    await seconds(ctx, 1);
  }

  // The giant boss robot, with a cage on its back.
  paused = true;
  ui.pointAt(null);
  await say('Uh oh! The giant robot boss is coming!');
  const boss = new Badbot(3.2, 0x6c757d);
  // It carries its cage in front, so she can see who's inside.
  const cage = makeCage();
  cage.position.set(0, 0.25, 1.15);
  boss.holder.add(cage);
  // Anyone carried off is in the cage, waiting to be rescued.
  const caged = team.filter((m) => m.caged);
  caged.forEach((m, i) => {
    m.u.holder.visible = true;
    m.u.holder.rotation.set(0, Math.PI, 0);
    m.u.holder.scale.setScalar(0.28);
    m.u.holder.position.set((i - (caged.length - 1) / 2) * 0.32, 0.05, 0);
    cage.add(m.u.holder);
  });
  const bossFrom = new THREE.Vector3(0, 0, 60);
  const bossAt = new THREE.Vector3(0, 0, 24);
  boss.holder.position.copy(bossFrom);
  boss.holder.rotation.y = Math.PI;
  w.add(boss.holder);
  stage.onFrame((dt) => boss.update(dt));
  boss.moving = true;
  let stomp = 0;
  await tween(ctx, 4, (k) => {
    boss.holder.position.lerpVectors(bossFrom, bossAt, k);
    if (Math.floor(k * 8) > stomp) {
      stomp = Math.floor(k * 8);
      shake = 0.35;
      sfx.boing();
    }
  }, (k) => k);
  boss.moving = false;
  if (caged.length) await say(caged.length === 1 ? `${caged[0].data.name} is in its cage! Let's save ${caged[0].data.name}!` : 'Our unicorn friends are in its cage! Let\'s save them!');

  // Its force field first: a letter, or a tap.
  const field = new THREE.Mesh(new THREE.SphereGeometry(2.4, 28, 18), new THREE.MeshStandardMaterial({ color: 0xff2d55, emissive: 0xff2d55, emissiveIntensity: 0.35, transparent: true, opacity: 0.22, depthWrite: false }));
  field.position.y = 1.5;
  boss.holder.add(field);
  const bossCenter = () => boss.center();
  if (lessonMoment()) {
    const glyph = nextLetters(1)[0];
    const sign = glyphSprite(glyph, { size: 2.6, ring: '#ff2d55' });
    sign.position.copy(bossCenter()).add(new THREE.Vector3(0, 1, -3));
    w.add(sign);
    await letterMoment(ctx, glyph, 'The robot boss has a force field! What letter is this?');
    w.remove(sign);
  } else {
    await tapIt(ctx, bossCenter, 'It has a force field! Tap it to pop it!');
  }
  boss.holder.remove(field);
  fx.shards(bossCenter(), 0xff2d55, 30);
  sfx.shatter();
  paused = false;
  void say(free().length > 1 ? 'Unicorns, team up! Everybody tap tap tap!' : 'Zap it! Tap tap tap!');

  let hits = 0;
  await new Promise<void>((resolve) => {
    onBossTap = () => {
      const c = bossCenter();
      for (const m of free()) hornLaser(ctx, fx, m.u, c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0)), undefined, 1.6);
      sfx.zap();
      fx.sparkles(c, { count: 30, colors: [0xffd43b, 0xff9f1c, 0xffffff], speed: 6 });
      boss.holder.rotation.z = (Math.random() - 0.5) * 0.12;
      shake = 0.15;
      hits++;
      boss.reach = hits % 3 === 0 ? 1 : 0;
      if (hits === Math.floor(BOSS_HITS / 2)) void say('Keep going! It is wobbling!');
      if (hits >= BOSS_HITS) {
        onBossTap = null;
        resolve();
      }
    };
    if (import.meta.env.DEV) (window as unknown as { bossTap: () => void }).bossTap = () => onBossTap?.();
  });
  window.removeEventListener('pointerdown', tap);
  hide?.remove();
  teamBtn.remove();
  style.remove();

  // It falls apart. The cage pops open and everyone comes home.
  const c = bossCenter();
  sfx.kaboom();
  shake = 1;
  fallApart(fx, boss, c, 3);
  fx.confetti(new THREE.Vector3(0, 8, 14), 220, 16);
  for (let i = 0; i < 6; i++) setTimeout(() => fx.firework(c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 20, 6 + Math.random() * 8, 0))), i * 300);
  w.remove(boss.holder);
  for (const m of caged) {
    m.caged = false;
    m.u.holder.scale.setScalar(1);
    w.add(m.u.holder);
    m.u.holder.position.copy(c).setY(0);
    m.returning = true;
    fx.hearts(c, 4);
  }
  await seconds(ctx, 1.6);
  sfx.fanfare();
  for (const m of team) void m.u.rear();
  sfx.neigh();
  sv.ribbons[0]++;
  persist();
  ui.toast('🏅 Unicorn team!', 3000);
  for (const m of team) fx.hearts(m.home.clone().add(new THREE.Vector3(0, 2.8, 0)), 4);
  fx.sparkles(new THREE.Vector3(0, 3, 2), { count: 100, colors: PASTEL });
  await say('You did it! The robots are gone, and every unicorn is safe! What a team!');
  await seconds(ctx, 1);
}

/** A robot breaking into flying springs, bolts and panels. */
function fallApart(fx: Fx, b: Badbot, at: THREE.Vector3, scale = 1): void {
  fx.shards(at, 0xadb5bd, 18 * scale);
  fx.shards(at, 0x6c5b7b, 10 * scale);
  fx.sparkles(at, { count: 60 * scale, colors: [0xffd43b, 0xff9f1c, 0xffffff], speed: 6 * scale });
  fx.ring(at, 0xffd43b, 3 * scale * b.size, false);
}

/** A round cage of bars (on the boss's back). */
function makeCage(): THREE.Group {
  const g = new THREE.Group();
  const bar = new THREE.MeshStandardMaterial({ color: 0xffd43b, metalness: 0.3, roughness: 0.4 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 5), bar);
    b.position.set(Math.cos(a) * 0.6, 0.6, Math.sin(a) * 0.6);
    g.add(b);
  }
  for (const y of [0, 1.2]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 6, 24), bar);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    g.add(ring);
  }
  return g;
}
