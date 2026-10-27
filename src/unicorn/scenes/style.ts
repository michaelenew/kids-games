import * as THREE from 'three';
import { type Ctx, freshPlace } from '../ctx';
import { say } from '../speak';
import { sfx } from '../sfx';
import { persist, save } from '../state';
import { BODIES, HORNS, MANES, Unicorn, type UnicornLook } from '../three/unicorn';
import { buildRanch } from './ranch';

/**
 * The style salon, just for fun (no learning): pick a unicorn and tap
 * colors for its coat, mane and horn. Every change sparkles.
 */
export async function style(ctx: Ctx): Promise<void> {
  const { stage, ui } = ctx;
  const fx = freshPlace(ctx);
  buildRanch(ctx);
  const sv = save();

  // A little round stage with a spotlight-ish glow.
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.4, 32), new THREE.MeshStandardMaterial({ color: 0xffd6f0, emissive: 0xff8fd0, emissiveIntensity: 0.25 }));
  stand.position.set(0, 0.2, 4);
  stage.world.add(stand);
  const portrait = innerWidth < innerHeight;
  stage.camera.position.set(0, portrait ? 4 : 3.2, portrait ? 13 : 10);
  stage.camera.lookAt(0, portrait ? 2.2 : 1.6, 4);

  let index = 0;
  let current: Unicorn | null = null;
  let spin = 0;
  stage.onFrame((dt) => {
    spin += dt * 0.6;
    if (current) {
      current.holder.rotation.y = Math.sin(spin) * 0.7;
      current.update(dt);
    }
  });

  const show = (sparkle: boolean) => {
    if (current) stage.world.remove(current.holder);
    current = new Unicorn(sv.unicorns[index].look);
    current.holder.position.set(0, 0.4, 4);
    stage.world.add(current.holder);
    if (sparkle) {
      fx.sparkles(new THREE.Vector3(0, 1.8, 4), { count: 80, speed: 4 });
      fx.rainbowRings(new THREE.Vector3(0, 0.5, 4), 3);
    }
  };
  show(false);

  const change = (key: keyof UnicornLook, value: number) => {
    sv.unicorns[index].look = { ...sv.unicorns[index].look, [key]: value };
    persist();
    show(true);
    sfx.twinkle();
    if (Math.random() < 0.4) {
      void current!.rear();
      sfx.neigh();
    }
    if (Math.random() < 0.3) void say(['So pretty!', 'Beautiful!', 'Wow, sparkly!', 'I love it!'][Math.floor(Math.random() * 4)]);
  };

  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  const swatch = (bg: string, onTap: () => void) => {
    const b = document.createElement('button');
    b.className = 'btn swatch';
    b.style.background = bg;
    b.addEventListener('click', onTap);
    return b;
  };
  const panel = document.createElement('div');
  panel.id = 'salon';
  const row = (label: string, items: HTMLElement[]) => {
    const r = document.createElement('div');
    r.className = 'srow';
    const l = document.createElement('span');
    l.textContent = label;
    r.append(l, ...items);
    return r;
  };
  panel.append(
    row('🦄', BODIES.map((c, i) => swatch(hex(c), () => change('body', i)))),
    row('🌈', MANES.map((m, i) => swatch(`linear-gradient(135deg, ${m.map(hex).join(', ')})`, () => change('mane', i)))),
    row('✨', HORNS.map((c, i) => swatch(hex(c), () => change('horn', i)))),
  );
  const style = document.createElement('style');
  style.textContent = `#salon { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); display: flex; flex-direction: column; gap: 10px;
    background: rgba(255,255,255,.75); padding: 12px 16px; border-radius: 26px; max-width: 94vw; }
    #salon .srow { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: center; }
    #salon .srow span { font-size: 30px; width: 40px; text-align: center; }
    #salon .swatch { width: min(52px, 9vw); height: min(52px, 9vw); border: 4px solid #fff; }
    #salon-nav { position: absolute; top: 40%; left: 0; right: 0; display: flex; justify-content: space-between; padding: 0 14px; pointer-events: none; }
    #salon-nav .btn { pointer-events: auto; width: 76px; height: 76px; font-size: 40px; }
    #salon-done { position: absolute; right: 16px; top: 80px; width: 84px; height: 84px; font-size: 44px; }`;
  const nav = document.createElement('div');
  nav.id = 'salon-nav';
  const step = (d: number) => {
    index = (index + d + sv.unicorns.length) % sv.unicorns.length;
    show(true);
    sfx.pop();
    void say(sv.unicorns[index].name);
  };
  if (sv.unicorns.length > 1) {
    const prev = swatch('#fff', () => step(-1));
    prev.textContent = '◀';
    const next = swatch('#fff', () => step(1));
    next.textContent = '▶';
    nav.append(prev, next);
  }
  const done = document.createElement('button');
  done.id = 'salon-done';
  done.className = 'btn';
  done.textContent = '✅';
  ui.root.append(style, panel, nav, done);

  void say(`Style time! Tap the colors to make ${sv.unicorns[index].name} beautiful!`);
  await new Promise<void>((resolve) => done.addEventListener('click', () => resolve()));
  sfx.fanfare();
  fx.confetti(new THREE.Vector3(0, 5, 4), 120, 6);
  void current!.rear();
  for (const e of [style, panel, nav, done]) e.remove();
  await say(`${sv.unicorns[index].name} looks amazing!`);
}
