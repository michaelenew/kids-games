import Phaser from 'phaser';
import { hasSeen, markSeen } from '../state';
import { W, button, text } from './widgets';

/**
 * A "how to" card for a concept he hasn't met yet: a title and a few steps,
 * shown one at a time with a Next button, using the numbers from the
 * problem in front of him. Each concept is introduced only once.
 */

export interface HowTo {
  /** Remembered in the save so the card only shows once. */
  concept: string;
  title: string;
  steps: string[];
}

export function needsIntro(concept: string): boolean {
  return !hasSeen(`how:${concept}`);
}

/**
 * Show the cards in order (skipping ones already seen), then call `done`.
 * `area` is where the card goes, so the problem stays visible.
 */
export function howTo(
  scene: Phaser.Scene,
  cards: HowTo[],
  done: () => void,
  area: { x: number; y: number; w: number; h: number } = { x: W / 2, y: 340, w: 900, h: 330 },
): void {
  const todo = cards.filter((c) => needsIntro(c.concept));
  if (!todo.length) {
    done();
    return;
  }
  const items: Phaser.GameObjects.GameObject[] = [];
  const clear = () => items.splice(0).forEach((o) => o.destroy());
  const { x, y, w, h } = area;
  let ci = 0;
  let si = 0;
  const show = () => {
    clear();
    const card = todo[ci];
    markSeen(`how:${card.concept}`);
    const g = scene.add.graphics().setDepth(900);
    g.fillStyle(0x0b1022, 0.97).fillRoundedRect(x - w / 2, y - h / 2, w, h, 18);
    g.lineStyle(4, 0x06d6a0, 1).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 18);
    items.push(g);
    const title = text(scene, x, y - h / 2 + 30, `HOW TO: ${card.title}`, 26, '#06d6a0').setDepth(901);
    // Narrow cards shrink the title to fit.
    if (title.width > w - 30) title.setScale((w - 30) / title.width);
    items.push(title);
    // Steps so far stay on the card, the newest one highlighted.
    const shown = card.steps.slice(0, si + 1);
    const body = shown.map((s, i) => `${i + 1}. ${s}`).join('\n');
    items.push(
      scene.add.text(x - w / 2 + 30, y - h / 2 + 62, body, {
        fontFamily: 'Arial', fontSize: '21px', color: '#ffffff', wordWrap: { width: w - 60 }, lineSpacing: 6,
      }).setDepth(901),
    );
    const last = si >= card.steps.length - 1 && ci >= todo.length - 1;
    const b = button(scene, x + w / 2 - 110, y + h / 2 - 40, 180, 56, last ? 'Let\'s do it!' : 'Next ▶', () => {
      if (si < card.steps.length - 1) si++;
      else {
        ci++;
        si = 0;
      }
      if (ci >= todo.length) {
        clear();
        done();
        return;
      }
      show();
    }, { fill: 0x2a9d8f, edge: 0x9ff0e3, size: 24 });
    b.setDepth(902);
    items.push(b);
  };
  show();
}
