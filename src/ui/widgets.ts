import Phaser from 'phaser';
import { COLORS, FONT } from '../art';
import { save } from '../state';

export const W = 1280;
export const H = 720;

export function text(
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: string,
  size = 28,
  color: string = COLORS.text,
  style: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, value, { fontFamily: FONT, fontSize: `${size}px`, color, align: 'center', ...style })
    .setOrigin(0.5);
}

export interface ButtonOptions {
  fill?: number;
  edge?: number;
  size?: number;
  textColor?: string;
  disabled?: boolean;
}

export type Button = Phaser.GameObjects.Container & { label: Phaser.GameObjects.Text };

/** A big rounded button. Works with touch, mouse, and gets a press animation. */
export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  onClick: () => void,
  opts: ButtonOptions = {},
): Button {
  const fill = opts.disabled ? 0x3d4458 : opts.fill ?? 0x1f6feb;
  const edge = opts.disabled ? 0x5c677d : opts.edge ?? 0x9ad1ff;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2 + 4, -h / 2 + 6, w, h, 18);
  g.fillStyle(fill, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 18);
  g.lineStyle(4, edge, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
  const t = text(scene, 0, 0, label, opts.size ?? 30, opts.textColor ?? (opts.disabled ? '#9aa3b5' : '#ffffff'), {
    wordWrap: { width: w - 24 },
  });
  const c = scene.add.container(x, y, [g, t]) as Button;
  c.label = t;
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: !opts.disabled });
  c.on('pointerdown', () => {
    if (opts.disabled) return;
    scene.tweens.add({ targets: c, scale: 0.94, duration: 60, yoyo: true });
  });
  c.on('pointerup', () => {
    if (!opts.disabled) onClick();
  });
  return c;
}

export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, fill = COLORS.panel, edge = COLORS.panelEdge) {
  const g = scene.add.graphics();
  g.fillStyle(fill, 0.96).fillRoundedRect(x - w / 2, y - h / 2, w, h, 20);
  g.lineStyle(4, edge, 1).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 20);
  return g;
}

export function scrapBadge(scene: Phaser.Scene, x: number, y: number, amount: number) {
  const icon = scene.add.image(x, y, 'scrap').setScale(1.3);
  const t = scene.add
    .text(x + 24, y, `${amount}`, { fontFamily: FONT, fontSize: '32px', color: '#ffd166' })
    .setOrigin(0, 0.5);
  return { icon, text: t };
}

// ---- Voice -------------------------------------------------------------

export type Speaker = 'sprocket' | 'volt';

export function speak(line: string, who: Speaker = 'sprocket'): void {
  if (!save().voice || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    // Say fractions and symbols the way a kid would hear them.
    const spoken = line
      .replace(/(\d)¼/g, '$1 and a quarter').replace(/(\d)½/g, '$1 and a half').replace(/(\d)¾/g, '$1 and three quarters')
      .replace(/¼/g, 'one quarter').replace(/½/g, 'one half').replace(/¾/g, 'three quarters')
      .replace(/−/g, ' minus ');
    const u = new SpeechSynthesisUtterance(spoken);
    u.pitch = who === 'sprocket' ? 1.5 : 0.6;
    u.rate = who === 'sprocket' ? 1.05 : 0.95;
    window.speechSynthesis.speak(u);
  } catch {
    // Speech is a bonus; ignore failures.
  }
}

export function stopSpeaking(): void {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    // ignore
  }
}

// ---- Dialog ------------------------------------------------------------

export interface Line {
  who: Speaker;
  text: string;
}

/**
 * Shows lines one at a time at the bottom of the screen. Tap or press
 * Space/Enter to advance; calls onDone after the last line.
 */
export function dialog(scene: Phaser.Scene, lines: Line[], onDone: () => void): void {
  const depth = 1000;
  const blocker = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.25).setScrollFactor(0).setDepth(depth).setInteractive();
  const box = panel(scene, W / 2, H - 120, W - 80, 190).setScrollFactor(0).setDepth(depth);
  const portrait = scene.add.image(150, H - 120, 'sprocket').setScrollFactor(0).setDepth(depth);
  const name = scene.add
    .text(230, H - 200, '', { fontFamily: FONT, fontSize: '24px', color: '#ffd166' })
    .setScrollFactor(0).setDepth(depth);
  const body = scene.add
    .text(230, H - 165, '', { fontFamily: FONT, fontSize: '30px', color: COLORS.text, wordWrap: { width: W - 340 }, lineSpacing: 6 })
    .setScrollFactor(0).setDepth(depth);
  const hint = scene.add
    .text(W - 70, H - 50, 'tap ▶', { fontFamily: FONT, fontSize: '22px', color: '#9ad1ff' })
    .setOrigin(1, 0.5).setScrollFactor(0).setDepth(depth);
  scene.tweens.add({ targets: hint, alpha: 0.3, duration: 600, yoyo: true, repeat: -1 });

  let i = -1;
  let typing: Phaser.Time.TimerEvent | null = null;
  let full = '';

  const show = () => {
    i++;
    if (i >= lines.length) {
      cleanup();
      onDone();
      return;
    }
    const line = lines[i];
    portrait.setTexture(line.who);
    name.setText(line.who === 'sprocket' ? 'SPROCKET' : 'COMMANDER VOLT (radio)');
    full = line.text;
    body.setText('');
    speak(line.text, line.who);
    let n = 0;
    typing = scene.time.addEvent({
      delay: 22,
      repeat: full.length - 1,
      callback: () => body.setText(full.slice(0, ++n)),
    });
  };

  const advance = () => {
    if (typing && typing.getRepeatCount() > 0) {
      typing.remove();
      typing = null;
      body.setText(full);
      return;
    }
    show();
  };

  const keys = scene.input.keyboard?.addKeys('SPACE,ENTER') as Record<string, Phaser.Input.Keyboard.Key> | undefined;
  const onKey = () => advance();
  keys?.SPACE.on('down', onKey);
  keys?.ENTER.on('down', onKey);
  blocker.on('pointerup', advance);

  const cleanup = () => {
    typing?.remove();
    keys?.SPACE.off('down', onKey);
    keys?.ENTER.off('down', onKey);
    [blocker, box, portrait, name, body, hint].forEach((o) => o.destroy());
    stopSpeaking();
  };

  show();
}

/** A short floating message, e.g. "+5 scrap" or "Too short!". */
export function toast(scene: Phaser.Scene, x: number, y: number, message: string, color = '#ffd166', size = 34) {
  const t = text(scene, x, y, message, size, color).setDepth(900);
  t.setStroke('#000000', 6);
  scene.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 1400, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  return t;
}

export function sparks(scene: Phaser.Scene, x: number, y: number, color = 0xffd166, count = 14) {
  const p = scene.add.particles(x, y, 'spark', {
    speed: { min: 120, max: 360 },
    angle: { min: 0, max: 360 },
    scale: { start: 1, end: 0 },
    lifespan: 600,
    gravityY: 600,
    tint: color,
    emitting: false,
  });
  p.setDepth(800);
  p.explode(count);
  scene.time.delayedCall(800, () => p.destroy());
}
