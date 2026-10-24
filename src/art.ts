import Phaser from 'phaser';
import type { Mark } from './state';

export const TILE = 48;

export const COLORS = {
  bg: 0x0b0f1a,
  panel: 0x16213e,
  panelEdge: 0x4cc9f0,
  gold: 0xffd166,
  rust: 0xc8553d,
  steel: 0xb8c0cc,
  dark: 0x2b2d42,
  visor: 0x4cc9f0,
  hot: 0xff5d8f,
  good: 0x06d6a0,
  bad: 0xef476f,
  text: '#f1f5ff',
};

export const FONT = '"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';

export const ROBOT_COLORS = [0x3a86ff, 0xef476f, 0x06d6a0, 0xffd166, 0x9b5de5, 0xff8c42];

export interface RobotLook {
  color: number;
  armor: Mark;
  blaster: Mark;
  boots: Mark;
}

/** Robot canvas size in base units, before scaling. The body centre is at ROBOT_CX. */
export const ROBOT_W = 96;
export const ROBOT_H = 88;
export const ROBOT_CX = 36;

function shade(color: number, amount: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  const f = (v: number) => Phaser.Math.Clamp(Math.round(v * amount), 0, 255);
  return Phaser.Display.Color.GetColor(f(c.red), f(c.green), f(c.blue));
}

/** Draws the player robot facing right. `step` alternates leg poses for walking. */
export function drawRobot(g: Phaser.GameObjects.Graphics, look: RobotLook, s: number, step: 0 | 1): void {
  const R = (x: number, y: number, w: number, h: number, color: number, radius = 0) => {
    g.fillStyle(color, 1);
    if (radius) g.fillRoundedRect(x * s, y * s, w * s, h * s, radius * s);
    else g.fillRect(x * s, y * s, w * s, h * s);
  };
  const body = look.color;
  const dark = shade(body, 0.6);
  const bootColor = look.boots > 0 ? 0xff9f1c : 0x5c677d;

  // Legs and boots (lower when on step 1 to suggest walking).
  const l1 = step === 0 ? 0 : -3;
  const l2 = step === 0 ? -3 : 0;
  R(22, 58 + l1, 9, 18, 0x4a4e69);
  R(40, 58 + l2, 9, 18, 0x4a4e69);
  R(18, 74 + l1, 17, 9, bootColor, 2);
  R(36, 74 + l2, 17, 9, bootColor, 2);
  if (look.boots >= 1) {
    // Spring coils on the boots.
    g.lineStyle(2 * s, 0xffd166, 1);
    for (const [bx, off] of [[18, l1], [36, l2]] as const) {
      for (let i = 0; i < 3; i++) {
        g.lineBetween((bx + 3 + i * 5) * s, (83 + off) * s, (bx + 6 + i * 5) * s, (79 + off) * s);
      }
    }
  }
  if (look.boots >= 3) {
    g.fillStyle(0x4cc9f0, 1);
    g.fillTriangle(14 * s, (80 + l1) * s, 18 * s, (76 + l1) * s, 18 * s, (83 + l1) * s);
    g.fillTriangle(32 * s, (80 + l2) * s, 36 * s, (76 + l2) * s, 36 * s, (83 + l2) * s);
  }

  // Torso.
  R(14, 30, 44, 30, body, 6);
  R(14, 52, 44, 8, dark, 3);
  g.fillStyle(0xffd166, 1);
  g.fillCircle(36 * s, 44 * s, 4 * s);

  // Head.
  R(22, 8, 28, 22, dark, 5);
  R(31, 13, 17, 8, COLORS.visor, 3);
  R(43, 15, 3, 3, 0xffffff);
  g.lineStyle(2 * s, 0x8d99ae, 1);
  g.lineBetween(27 * s, 9 * s, 25 * s, 1 * s);
  g.fillStyle(COLORS.hot, 1);
  g.fillCircle(25 * s, 2 * s, 2.5 * s);

  // Armor upgrades.
  if (look.armor >= 1) {
    R(8, 27, 18, 13, COLORS.steel, 4);
    R(10, 29, 14, 3, 0xe9ecef);
  }
  if (look.armor >= 2) {
    R(18, 34, 30, 16, COLORS.steel, 4);
    g.fillStyle(0x6c757d, 1);
    for (const [x, y] of [[22, 38], [44, 38], [22, 46], [44, 46]]) g.fillCircle(x * s, y * s, 1.6 * s);
    g.fillStyle(0xffd166, 1);
    g.fillCircle(33 * s, 42 * s, 4 * s);
  }
  if (look.armor >= 3) {
    g.fillStyle(0xffd166, 1);
    g.fillTriangle(28 * s, 8 * s, 44 * s, 8 * s, 36 * s, 0);
    R(19, 12, 5, 14, COLORS.steel, 2);
    R(48, 12, 5, 14, COLORS.steel, 2);
  }

  // Arm cannon grows with each blaster mark.
  const len = 18 + look.blaster * 7;
  const thick = 9 + look.blaster * 2;
  const cy = 40 - thick / 2;
  R(46, cy - 1, 10, thick + 2, dark, 3);
  R(54, cy, len, thick, COLORS.dark, 3);
  R(54 + len - 4, cy + 1, 4, thick - 2, COLORS.hot, 1);
  if (look.blaster >= 2) R(58, cy - 3, len - 8, 3, COLORS.steel, 1);
  if (look.blaster >= 3) R(58, cy + thick, len - 8, 3, COLORS.steel, 1);
}

export function makeRobotTextures(scene: Phaser.Scene, look: RobotLook, prefix = 'robot', s = 1): void {
  for (const step of [0, 1] as const) {
    const key = `${prefix}${step}`;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    drawRobot(g, look, s, step);
    g.generateTexture(key, ROBOT_W * s, ROBOT_H * s);
    g.destroy();
  }
  const animKey = `${prefix}-walk`;
  if (scene.anims.exists(animKey)) scene.anims.remove(animKey);
  scene.anims.create({
    key: animKey,
    frames: [{ key: `${prefix}0` }, { key: `${prefix}1` }],
    frameRate: 8,
    repeat: -1,
  });
}

function tex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

/** All the non-player art, drawn once at boot. */
export function makeWorldTextures(scene: Phaser.Scene): void {
  tex(scene, 'ground', TILE, TILE, (g) => {
    g.fillStyle(0x5a3d31, 1).fillRect(0, 0, TILE, TILE);
    g.fillStyle(0x7a5240, 1).fillRect(0, 0, TILE, 10);
    g.fillStyle(0x9c6b4e, 1).fillRect(0, 0, TILE, 4);
    g.fillStyle(0x4a3128, 1);
    g.fillRect(6, 20, 10, 6).fillRect(28, 32, 12, 5).fillRect(14, 40, 6, 4);
  });
  tex(scene, 'dirt', TILE, TILE, (g) => {
    g.fillStyle(0x4a3128, 1).fillRect(0, 0, TILE, TILE);
    g.fillStyle(0x3c271f, 1).fillRect(8, 10, 12, 6).fillRect(28, 28, 10, 6);
  });
  tex(scene, 'crate', TILE, TILE, (g) => {
    g.fillStyle(0x6c757d, 1).fillRect(0, 0, TILE, TILE);
    g.fillStyle(0x8d99ae, 1).fillRect(3, 3, TILE - 6, TILE - 6);
    g.lineStyle(4, 0x6c757d, 1).lineBetween(4, 4, TILE - 4, TILE - 4).lineBetween(TILE - 4, 4, 4, TILE - 4);
    g.fillStyle(0xadb5bd, 1).fillRect(3, 3, TILE - 6, 4);
  });
  tex(scene, 'spike', TILE, TILE, (g) => {
    g.fillStyle(0xadb5bd, 1);
    for (let i = 0; i < 4; i++) g.fillTriangle(i * 12, TILE, i * 12 + 6, 22, i * 12 + 12, TILE);
    g.fillStyle(0xef476f, 1);
    for (let i = 0; i < 4; i++) g.fillTriangle(i * 12 + 4, 30, i * 12 + 6, 22, i * 12 + 8, 30);
  });
  tex(scene, 'scrap', 26, 26, (g) => {
    g.fillStyle(0xffd166, 1);
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      pts.push({ x: 13 + Math.cos(a) * 12, y: 13 + Math.sin(a) * 12 });
    }
    g.fillPoints(pts, true);
    g.fillStyle(0xb8860b, 1).fillCircle(13, 13, 5);
    g.fillStyle(0xfff3c4, 1).fillCircle(9, 8, 2);
  });
  tex(scene, 'oil', 30, 36, (g) => {
    g.fillStyle(0x06d6a0, 1).fillRoundedRect(2, 8, 26, 28, 4);
    g.fillStyle(0x2b2d42, 1).fillRect(11, 0, 8, 9);
    g.fillStyle(0xffffff, 1).fillRect(13, 14, 4, 16).fillRect(7, 20, 16, 4);
  });
  tex(scene, 'flag', 56, 120, (g) => {
    g.fillStyle(0x8d99ae, 1).fillRect(4, 0, 6, 120);
    g.fillStyle(0x06d6a0, 1).fillTriangle(10, 6, 54, 24, 10, 42);
    g.fillStyle(0xffffff, 1).fillCircle(24, 24, 5);
  });
  for (const [key, light] of [['beacon-off', 0x6c757d], ['beacon-on', 0x06d6a0]] as const) {
    tex(scene, key, 32, 72, (g) => {
      g.fillStyle(0x4a4e69, 1).fillRect(12, 20, 8, 52);
      g.fillStyle(0x2b2d42, 1).fillRect(4, 64, 24, 8);
      g.fillStyle(light, 1).fillCircle(16, 14, 12);
      g.fillStyle(0xffffff, 0.5).fillCircle(12, 10, 4);
    });
  }

  // Enemies.
  for (const step of [0, 1]) {
    tex(scene, `rustbot${step}`, 60, 52, (g) => {
      g.fillStyle(0xc8553d, 1).fillRoundedRect(8, 6, 44, 32, 6);
      g.fillStyle(0x8a3a2a, 1).fillRect(8, 30, 44, 8);
      g.fillStyle(0x2b2d42, 1).fillRoundedRect(4, 38, 52, 14, 6);
      g.fillStyle(0x6c757d, 1);
      for (let i = 0; i < 5; i++) g.fillCircle(12 + i * 9 + (step ? 4 : 0), 45, 3);
      g.fillStyle(0x111111, 1).fillRect(14, 12, 30, 12);
      g.fillStyle(0xff3b3b, 1).fillCircle(20 + (step ? 2 : 0), 18, 4);
      g.fillStyle(0x8a3a2a, 1).fillRect(26, 0, 4, 7);
    });
  }
  tex(scene, 'turret', 52, 52, (g) => {
    g.fillStyle(0x495057, 1).fillRect(4, 36, 44, 16);
    g.fillStyle(0x9d4edd, 1).fillCircle(26, 34, 18);
    g.fillStyle(0x2b2d42, 1).fillRect(0, 28, 26, 9);
    g.fillStyle(0xff3b3b, 1).fillCircle(30, 28, 4);
  });
  tex(scene, 'drone', 56, 40, (g) => {
    g.fillStyle(0x8d99ae, 1).fillRect(4, 2, 48, 4);
    g.fillStyle(0x495057, 1).fillRect(26, 4, 4, 8);
    g.fillStyle(0xf77f00, 1).fillRoundedRect(10, 12, 36, 22, 8);
    g.fillStyle(0x111111, 1).fillCircle(28, 23, 7);
    g.fillStyle(0xff3b3b, 1).fillCircle(28, 23, 3);
  });
  for (const [key, eye] of [['crusher', 0xffd166], ['crusher-angry', 0xff3b3b]] as const) {
    tex(scene, key, 140, 150, (g) => {
      g.fillStyle(0x495057, 1).fillRect(30, 110, 26, 30).fillRect(84, 110, 26, 30);
      g.fillStyle(0x2b2d42, 1).fillRoundedRect(22, 132, 42, 18, 6).fillRoundedRect(76, 132, 42, 18, 6);
      g.fillStyle(0x6a040f, 1).fillRoundedRect(20, 30, 100, 86, 14);
      g.fillStyle(0x9d0208, 1).fillRoundedRect(28, 38, 84, 30, 8);
      g.fillStyle(0x370617, 1).fillRoundedRect(44, 4, 52, 34, 8);
      g.fillStyle(eye, 1).fillRect(52, 14, 14, 8).fillRect(74, 14, 14, 8);
      g.fillStyle(0x495057, 1).fillRoundedRect(0, 44, 24, 60, 8).fillRoundedRect(116, 44, 24, 60, 8);
      g.fillStyle(0x6c757d, 1).fillRoundedRect(0, 92, 28, 26, 6).fillRoundedRect(112, 92, 28, 26, 6);
      g.fillStyle(0xffd166, 1);
      for (let i = 0; i < 4; i++) g.fillTriangle(34 + i * 20, 80, 44 + i * 20, 80, 39 + i * 20, 96);
    });
  }
  tex(scene, 'bullet', 22, 12, (g) => {
    g.fillStyle(0xff5d8f, 1).fillRoundedRect(0, 0, 22, 12, 6);
    g.fillStyle(0xfff3c4, 1).fillRoundedRect(6, 3, 14, 6, 3);
  });
  tex(scene, 'ebullet', 16, 16, (g) => {
    g.fillStyle(0xff3b3b, 1).fillCircle(8, 8, 8);
    g.fillStyle(0xffd166, 1).fillCircle(8, 8, 4);
  });
  tex(scene, 'shock', 48, 30, (g) => {
    g.fillStyle(0xf77f00, 1).fillTriangle(0, 30, 24, 0, 48, 30);
    g.fillStyle(0xffd166, 1).fillTriangle(10, 30, 24, 10, 38, 30);
  });
  tex(scene, 'spark', 8, 8, (g) => {
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 8, 8);
  });

  // Portraits for dialog.
  tex(scene, 'sprocket', 110, 110, (g) => {
    g.fillStyle(0x16213e, 1).fillRoundedRect(0, 0, 110, 110, 16);
    g.fillStyle(0xffd166, 1).fillCircle(55, 62, 36);
    g.fillStyle(0xe0a800, 1);
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i;
      g.fillCircle(55 + Math.cos(a) * 38, 62 + Math.sin(a) * 38, 7);
    }
    g.fillStyle(0xffd166, 1).fillCircle(55, 62, 34);
    g.fillStyle(0x111111, 1).fillRoundedRect(30, 46, 50, 22, 10);
    g.fillStyle(0x4cc9f0, 1).fillCircle(44, 57, 6).fillCircle(66, 57, 6);
    g.lineStyle(3, 0x111111, 1).beginPath().arc(55, 76, 9, 0.2, Math.PI - 0.2).strokePath();
    g.lineStyle(3, 0x8d99ae, 1).lineBetween(55, 28, 55, 12);
    g.fillStyle(0xef476f, 1).fillCircle(55, 11, 5);
  });
  tex(scene, 'volt', 110, 110, (g) => {
    g.fillStyle(0x16213e, 1).fillRoundedRect(0, 0, 110, 110, 16);
    g.fillStyle(0x495057, 1).fillRoundedRect(22, 22, 66, 72, 12);
    g.fillStyle(0x2b2d42, 1).fillRect(28, 42, 54, 16);
    g.fillStyle(0x06d6a0, 1).fillRect(32, 46, 46, 8);
    g.fillStyle(0x6c757d, 1);
    for (let i = 0; i < 4; i++) g.fillRect(34 + i * 12, 70, 6, 14);
    g.lineStyle(4, 0x8d99ae, 1).lineBetween(78, 22, 92, 6);
    g.fillStyle(0x06d6a0, 1).fillCircle(92, 6, 5);
  });

  // Background layers.
  tex(scene, 'bg-far', 1600, 720, (g) => {
    g.fillGradientStyle(0x0b0f1a, 0x0b0f1a, 0x3a1c4a, 0x3a1c4a, 1).fillRect(0, 0, 1600, 720);
    g.fillStyle(0xffffff, 0.8);
    for (let i = 0; i < 150; i++) g.fillRect((i * 97) % 1600, (i * 53) % 380, 2, 2);
    g.fillStyle(0xff8c42, 0.9).fillCircle(470, 140, 46);
    g.fillStyle(0x3a1c4a, 0.6).fillCircle(450, 130, 40);
  });
  tex(scene, 'bg-near', 640, 720, (g) => {
    g.fillStyle(0x1b1530, 1);
    const heights = [260, 340, 220, 400, 300, 360, 240, 320];
    heights.forEach((h, i) => g.fillRect(i * 80, 720 - h, 70, h));
    g.fillStyle(0x2a2045, 1);
    heights.forEach((h, i) => {
      for (let y = 720 - h + 20; y < 700; y += 40) g.fillRect(i * 80 + 14, y, 10, 14).fillRect(i * 80 + 44, y, 10, 14);
    });
    g.fillStyle(0x110d20, 1).fillRect(0, 600, 640, 120);
  });
}
