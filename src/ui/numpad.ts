import Phaser from 'phaser';
import { button, text } from './widgets';

/**
 * A big on-screen number pad (works with touch and the keyboard). Calls
 * `onSubmit` with the typed number when ✓ is pressed.
 */
export function numpad(
  scene: Phaser.Scene,
  x: number,
  y: number,
  onSubmit: (value: number) => void,
  maxDigits = 4,
): { display: Phaser.GameObjects.Text; clear: () => void; objects: Phaser.GameObjects.GameObject[]; destroy: () => void } {
  let typed = '';
  const objects: Phaser.GameObjects.GameObject[] = [];
  const box = scene.add.graphics().fillStyle(0x000000, 0.55).fillRoundedRect(x - 150, y - 60, 300, 90, 16)
    .lineStyle(4, 0x4cc9f0, 1).strokeRoundedRect(x - 150, y - 60, 300, 90, 16);
  const display = text(scene, x, y - 15, '', 60, '#ffd166');
  objects.push(box, display);
  const press = (k: string) => {
    if (k === '⌫') typed = typed.slice(0, -1);
    else if (k === '✓') {
      if (typed) onSubmit(Number(typed));
      return;
    } else if (typed.length < maxDigits) typed += k;
    display.setText(typed).setColor('#ffd166');
  };
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '⌫', '0', '✓'];
  keys.forEach((k, i) => {
    const fill = k === '✓' ? 0x2a9d8f : k === '⌫' ? 0x8d1b2e : 0x3d4458;
    objects.push(button(scene, x - 100 + (i % 3) * 100, y + 80 + Math.floor(i / 3) * 82, 88, 72, k, () => press(k), { size: 36, fill }));
  });
  const onKey = (e: KeyboardEvent) => {
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('⌫');
    else if (e.key === 'Enter') press('✓');
  };
  scene.input.keyboard?.on('keydown', onKey);
  return {
    display,
    objects,
    clear: () => {
      typed = '';
      display.setText('');
    },
    destroy: () => {
      scene.input.keyboard?.off('keydown', onKey);
      objects.forEach((o) => o.destroy());
    },
  };
}
