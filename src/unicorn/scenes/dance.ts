import * as THREE from 'three';
import { type Ctx, freshPlace } from '../ctx';
import { say } from '../speak';
import { sfx, startMusic, stopMusic } from '../sfx';
import { save } from '../state';
import { RAINBOW } from '../three/fx';
import { Unicorn } from '../three/unicorn';

/**
 * Dance party, just for fun (no learning): her unicorns bounce to a tune on
 * a glowing dance floor under a disco ball and swinging colored lights. Big
 * buttons make them all spin or jump, change the lights, or set off
 * fireworks; tapping one unicorn makes it rear up.
 */
export async function dance(ctx: Ctx): Promise<void> {
  const { stage, ui } = ctx;
  const fx = freshPlace(ctx);
  const sv = save();
  const w = stage.world;
  stage.setSky(0x0b0623, 0x2b1a5e, 0x5f3dc4, 0x1a1040, 40, 160);
  stage.hemi.intensity = 0.45;
  stage.sun.intensity = 0.5;

  // A dance floor of glowing tiles.
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 0.2, 1.9), new THREE.MeshBasicMaterial({ color: 0xffffff }), 64);
  const m = new THREE.Matrix4();
  let n = 0;
  for (let x = -4; x < 4; x++) for (let z = -4; z < 4; z++) tiles.setMatrixAt(n++, m.makeTranslation(x * 2 + 1, -0.1, z * 2 + 1));
  w.add(tiles);
  const tileColor = new THREE.Color();
  let palette = 0;
  const palettes = [RAINBOW, [0xff4d6d, 0xff8fd0, 0xffd6f0], [0x3fa9f5, 0x63e6be, 0xb197fc], [0xffe14d, 0xff9f1c, 0xffffff]];

  // A spinning disco ball.
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 2), new THREE.MeshStandardMaterial({ color: 0xe9ecef, metalness: 0.95, roughness: 0.15, flatShading: true, emissive: 0x444466 }));
  ball.position.set(0, 6.6, -3);
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 6, 4), new THREE.MeshBasicMaterial({ color: 0x888888 }));
  string.position.set(0, 10.6, -3);
  w.add(ball, string);

  // Swinging colored light beams.
  const beams = [0, 1, 2, 3].map((i) => {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 12, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: RAINBOW[i * 2], transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    cone.geometry.translate(0, -6, 0);
    cone.position.set((i - 1.5) * 4, 12, -6);
    w.add(cone);
    return cone;
  });

  // Her unicorns in a ring, facing out toward the camera side.
  const dancers = [...sv.unicorns].sort((a, b) => b.hearts - a.hearts).slice(0, 6);
  const crew = dancers.map((d, i) => {
    const u = new Unicorn(d.look);
    const a = dancers.length === 1 ? 0 : (i / dancers.length) * Math.PI * 2;
    const r = dancers.length === 1 ? 0 : 3.4;
    u.holder.position.set(Math.sin(a) * r, 0, Math.cos(a) * r);
    u.holder.userData.base = u.holder.position.clone();
    u.holder.rotation.y = 0;
    w.add(u.holder);
    return { u, spin: 0, jump: 0, phase: i * 0.5 };
  });

  const portrait = innerWidth < innerHeight;
  stage.camera.position.set(0, portrait ? 7 : 5.5, portrait ? 17 : 13);
  stage.camera.lookAt(0, 1.8, 0);

  const beat = 0.4;
  let groove = 0;
  stage.onFrame((dt) => {
    groove += dt;
    const b = groove / beat;
    for (const c of crew) {
      c.u.update(dt);
      c.jump = Math.max(0, c.jump - dt * 1.6);
      c.spin = Math.max(0, c.spin - dt);
      const bounce = Math.abs(Math.sin((b + c.phase) * Math.PI)) * 0.35;
      c.u.holder.position.y = bounce + Math.sin(c.jump * Math.PI) * 2.2;
      c.u.holder.rotation.z = Math.sin((b + c.phase) * Math.PI) * 0.12;
      // Face the camera, turned a little toward the middle.
      const base = -c.u.holder.userData.base.x * 0.08;
      // Two full turns while spinning (ending back where it started).
      c.u.holder.rotation.y = base + (c.spin > 0 ? (1 - c.spin) * Math.PI * 4 : 0);
      c.u.headYaw = Math.sin(b * Math.PI * 0.5 + c.phase) * 0.35;
      c.u.gait = 'idle';
    }
    ball.rotation.y += dt * 0.8;
    beams.forEach((cone, i) => {
      cone.rotation.z = Math.sin(groove * 1.3 + i) * 0.6;
      cone.rotation.x = Math.cos(groove * 0.9 + i * 2) * 0.3;
    });
    const pal = palettes[palette];
    for (let i = 0; i < 64; i++) {
      const lit = (Math.floor(b) + i * 7) % 5 === 0;
      tiles.setColorAt(i, tileColor.set(pal[(i + Math.floor(b)) % pal.length]).multiplyScalar(lit ? 1 : 0.35));
    }
    if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
  });

  // Tap a unicorn: it rears up.
  const ray = new THREE.Raycaster();
  const tap = (e: PointerEvent) => {
    if (e.target !== stage.renderer.domElement) return;
    ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), stage.camera);
    for (const c of crew) {
      if (ray.intersectObject(c.u.holder, true).length) {
        void c.u.rear();
        sfx.neigh();
        fx.hearts(c.u.holder.position.clone().add(new THREE.Vector3(0, 2.8, 0)), 4);
        return;
      }
    }
  };
  window.addEventListener('pointerdown', tap);

  // The big buttons.
  const style = document.createElement('style');
  style.textContent = `#party { position: absolute; left: 50%; bottom: 20px; transform: translateX(-50%); display: flex; gap: min(16px, 2.5vw); }
    #party .btn { width: min(96px, 17vw); height: min(96px, 17vw); font-size: min(48px, 9vw); }`;
  const bar = document.createElement('div');
  bar.id = 'party';
  const button = (icon: string, fn: () => void) => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = icon;
    b.addEventListener('click', fn);
    bar.appendChild(b);
    return b;
  };
  button('💫', () => {
    crew.forEach((c) => (c.spin = 1));
    sfx.whoosh();
  });
  button('⬆️', () => {
    crew.forEach((c, i) => setTimeout(() => (c.jump = 1), i * 90));
    sfx.boing();
  });
  button('🌈', () => {
    palette = (palette + 1) % palettes.length;
    beams.forEach((cone, i) => (cone.material as THREE.MeshBasicMaterial).color.set(palettes[palette][i % palettes[palette].length]));
    sfx.twinkle();
  });
  button('🎆', () => {
    for (let i = 0; i < 3; i++) setTimeout(() => fx.firework(new THREE.Vector3((Math.random() - 0.5) * 16, 10 + Math.random() * 4, -6)), i * 200);
    fx.confetti(new THREE.Vector3(0, 8, 0), 80, 10);
  });
  const done = button('✅', () => {});
  ui.root.append(style, bar);

  startMusic();
  void say(dancers.length > 1 ? "It's a dance party! Tap the buttons to make your unicorns dance!" : `It's a dance party! Tap the buttons to make ${dancers[0].name} dance!`);
  // Done when she taps ✅ (or after a good long dance).
  await new Promise<void>((resolve) => {
    done.addEventListener('click', () => resolve());
    setTimeout(resolve, 120000);
  });
  window.removeEventListener('pointerdown', tap);
  style.remove();
  bar.remove();
  stopMusic();
  sfx.fanfare();
  crew.forEach((c) => void c.u.rear());
  fx.confetti(new THREE.Vector3(0, 8, 0), 160, 10);
  await say('What great dancing!');
}
