import * as THREE from 'three';
import { type Ctx, freshPlace, lessonMoment, letterMoment, nextLetters, seconds, tapIt, tween } from '../ctx';
import { hornLaser } from '../laser';
import { say } from '../speak';
import { sfx } from '../sfx';
import { persist, save } from '../state';
import { RAINBOW } from '../three/fx';
import { Unicorn } from '../three/unicorn';
import { addUpgrade, hasUpgrade, UPGRADES } from '../upgrades';
import { buildRanch } from './ranch';

/**
 * The Magic tower: pick a unicorn and give it an upgrade (Invisibility, for
 * now). Three magic crystals float around it; each one is charged with a tap
 * (or, when it's learning's turn, by saying its letter) and beams its magic
 * into the horn. Then the unicorn tries out its new power.
 */
export async function magic(ctx: Ctx): Promise<void> {
  const { stage, ui } = ctx;
  const fx = freshPlace(ctx);
  buildRanch(ctx);
  stage.setSky(0x2b1a6e, 0x9775fa, 0xffc9de, 0xb197fc, 60, 240);
  stage.hemi.intensity = 0.9;
  const sv = save();
  const w = stage.world;

  // A glowing magic circle to stand on.
  const circle = new THREE.Group();
  circle.position.set(0, 0.05, 4);
  RAINBOW.forEach((c, i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2 + i * 0.12, 0.04, 6, 48), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8 }));
    ring.rotation.x = Math.PI / 2;
    circle.add(ring);
  });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(2, 40), new THREE.MeshBasicMaterial({ color: 0xd0bfff, transparent: true, opacity: 0.35 }));
  glow.rotation.x = -Math.PI / 2;
  circle.add(glow);
  w.add(circle);
  const portrait = innerWidth < innerHeight;
  stage.camera.position.set(0, portrait ? 4.2 : 3.4, portrait ? 13.5 : 10.5);
  stage.camera.lookAt(0, 1.7, 4);

  let index = 0;
  let current: Unicorn | null = null;
  let spin = 0;
  stage.onFrame((dt) => {
    spin += dt;
    circle.rotation.y = spin * 0.3;
    if (current) {
      current.holder.rotation.y = Math.sin(spin * 0.6) * 0.5;
      current.update(dt);
    }
  });
  const show = () => {
    if (current) w.remove(current.holder);
    current = new Unicorn(sv.unicorns[index].look);
    current.holder.position.set(0, 0, 4);
    w.add(current.holder);
    fx.sparkles(new THREE.Vector3(0, 1.8, 4), { count: 50, speed: 3 });
    refresh();
  };

  // Buttons: pick a unicorn, pick an upgrade, done.
  const style = document.createElement('style');
  style.textContent = `#lab { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); display: flex; gap: 14px; }
    #lab .card { min-width: min(220px, 40vw); height: 96px; border-radius: 28px; font-size: 22px; display: flex; align-items: center; justify-content: center; gap: 10px; padding: 0 18px; }
    #lab .card b { font-size: 44px; }
    #lab .card.have { background: #e6fcf5; }
    #lab-nav { position: absolute; top: 42%; left: 0; right: 0; display: flex; justify-content: space-between; padding: 0 14px; pointer-events: none; }
    #lab-nav .btn { pointer-events: auto; width: 76px; height: 76px; font-size: 40px; }
    #lab-done { position: absolute; right: 16px; top: 80px; width: 84px; height: 84px; font-size: 44px; }
    #lab-name { position: absolute; left: 50%; top: 168px; transform: translateX(-50%); font-size: 30px; color: #fff; text-shadow: 0 3px 0 #7048e8; pointer-events: none; white-space: nowrap; }`;
  const bar = document.createElement('div');
  bar.id = 'lab';
  const nav = document.createElement('div');
  nav.id = 'lab-nav';
  const done = document.createElement('button');
  done.id = 'lab-done';
  done.className = 'btn';
  done.textContent = '✅';
  const nameTag = document.createElement('div');
  nameTag.id = 'lab-name';
  const mk = (cls: string, html: string, fn: () => void) => {
    const b = document.createElement('button');
    b.className = `btn ${cls}`;
    b.innerHTML = html;
    b.addEventListener('click', fn);
    return b;
  };
  let busy = false;
  const step = (d: number) => {
    if (busy) return;
    index = (index + d + sv.unicorns.length) % sv.unicorns.length;
    sfx.pop();
    show();
    void say(sv.unicorns[index].name);
  };
  if (sv.unicorns.length > 1) nav.append(mk('', '◀', () => step(-1)), mk('', '▶', () => step(1)));
  function refresh() {
    const u = sv.unicorns[index];
    nameTag.textContent = u.name + (u.upgrades?.length ? ' ' + UPGRADES.filter((g) => hasUpgrade(u, g.id)).map((g) => g.icon).join('') : '');
    bar.innerHTML = '';
    for (const g of UPGRADES) {
      const have = hasUpgrade(u, g.id);
      bar.appendChild(mk(`card${have ? ' have' : ''}`, `<b>${g.icon}</b>${g.name}${have ? ' ✓' : ''}`, () => void (have ? tryIt(g.id) : install(g.id))));
    }
  }
  ui.root.append(style, nameTag, bar, nav, done);
  show();

  /** Show off a power she already has. */
  async function tryIt(id: string) {
    if (busy || !current) return;
    busy = true;
    if (id === 'invisible') await vanish(current, sv.unicorns[index].name);
    busy = false;
  }

  async function vanish(u: Unicorn, name: string) {
    sfx.twinkle();
    fx.sparkles(new THREE.Vector3(0, 1.6, 4), { count: 80, colors: [0xe7f5ff, 0xd0bfff, 0xffffff], speed: 3 });
    u.invisible = true;
    await say(`Where did ${name} go?`);
    await seconds(ctx, 1.4);
    u.invisible = false;
    fx.sparkles(new THREE.Vector3(0, 1.6, 4), { count: 60, colors: RAINBOW, speed: 4 });
    sfx.yay();
    void u.rear();
    await say(`Peekaboo! There's ${name}!`);
  }

  /** The upgrade ritual: charge three crystals, then the magic goes in. */
  async function install(id: string) {
    if (busy || !current) return;
    busy = true;
    bar.style.visibility = nav.style.visibility = done.style.visibility = 'hidden';
    const u = current;
    const who = sv.unicorns[index];
    const g = UPGRADES.find((x) => x.id === id)!;
    await say(`Let's give ${who.name} ${g.name.toLowerCase()}! Charge up the magic crystals!`);

    const crystals = [0, 1, 2].map((i) => {
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.45, 0),
        new THREE.MeshStandardMaterial({ color: RAINBOW[i * 2], emissive: RAINBOW[i * 2], emissiveIntensity: 0.4, flatShading: true }),
      );
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      m.position.set(Math.cos(a) * 2.6, 2.4, 4 + Math.sin(a) * 1.6);
      m.scale.set(1, 1.5, 1);
      w.add(m);
      return m;
    });
    const bob = stage.onFrame(() => crystals.forEach((c, i) => {
      c.rotation.y += 0.03;
      c.position.y = 2.4 + Math.sin(stage.time * 2 + i) * 0.15;
    }));
    for (let i = 0; i < crystals.length; i++) {
      const c = crystals[i];
      const mat = c.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 1.2;
      if (lessonMoment()) await letterMoment(ctx, nextLetters(1)[0], 'Say the magic letter! What letter is this?');
      else await tapIt(ctx, () => c.position.clone(), i === 0 ? 'Tap the crystal!' : 'Tap the next crystal!');
      // Its magic beams into the horn.
      hornLaser(ctx, fx, u, c.position.clone(), RAINBOW[i * 2], 1.4);
      sfx.zap();
      fx.shards(c.position, RAINBOW[i * 2], 12);
      w.remove(c);
      u.setGlow(1);
      fx.sparkles(u.hornTip(), { count: 30, colors: [RAINBOW[i * 2], 0xffffff] });
      await seconds(ctx, 0.5);
    }
    bob();

    // The magic swirls in.
    sfx.fanfare();
    for (let k = 0; k < 6; k++) setTimeout(() => fx.ring(new THREE.Vector3(0, 0.2 + k * 0.4, 4), RAINBOW[k], 2.2), k * 120);
    fx.sparkles(new THREE.Vector3(0, 1.5, 4), { count: 120, colors: RAINBOW, speed: 5 });
    await tween(ctx, 1, (k) => (u.holder.position.y = Math.sin(k * Math.PI) * 1.2));
    void u.rear();
    addUpgrade(who, id);
    persist();
    ui.toast(`${g.icon} ${g.name}!`, 2200);
    refresh();
    await say(`${who.name} ${g.blurb}! Let's try it!`);
    if (id === 'invisible') await vanish(u, who.name);
    bar.style.visibility = nav.style.visibility = done.style.visibility = '';
    busy = false;
  }

  const first = sv.unicorns[index];
  void say(hasUpgrade(first, 'invisible') ? 'The magic tower! Pick a unicorn to give it magic powers.' : `The magic tower! Tap Invisibility to give ${first.name} a magic power!`);
  await new Promise<void>((resolve) => done.addEventListener('click', () => !busy && resolve()));
  for (const e of [style, nameTag, bar, nav, done]) e.remove();
  sfx.yay();
}
