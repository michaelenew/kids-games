/**
 * Where things go on the picture-stamp page (see `groupsPaper` in paper.ts):
 * the "+ Group" and "Start over" buttons in a row under the number sentence,
 * and the group circles in two rows below them. Kept apart from the drawing
 * code so a test can check that every group the problem needs has its own
 * place, on the page, clear of the buttons (tests/solvable.test.ts).
 */

export interface Box { x: number; y: number; w: number; h: number }

export interface StampLayout {
  /** How many groups he can draw: always at least as many as the problem has. */
  slots: number;
  /** Circle radius. */
  r: number;
  /** The centre of each group's circle, in the order they're drawn. */
  spots: { x: number; y: number }[];
  /** The two buttons (centre and size). */
  addButton: Box;
  resetButton: Box;
}

const ROWS = 2;

export function stampLayout(page: { left: number; top: number; w: number; h: number }, groups: number): StampLayout {
  // Three across is roomy; a problem with more than six groups gets as many across as it needs.
  const cols = Math.max(3, Math.ceil(groups / ROWS));
  const slots = cols * ROWS;
  const top = page.top + 160;
  const room = page.h - 160 - 34;
  const r = Math.min(58, (page.w - 40) / cols / 2 - 6, (room - 10) / (ROWS * 2));
  const across = cols * 2 * r + (cols - 1) * 12;
  const x0 = page.left + (page.w - across) / 2 + r;
  const spots = Array.from({ length: slots }, (_, i) => ({
    x: x0 + (i % cols) * (2 * r + 12),
    y: top + r + Math.floor(i / cols) * (2 * r + 10),
  }));
  const mid = page.left + page.w / 2;
  return {
    slots, r, spots,
    addButton: { x: mid - 82, y: page.top + 128, w: 150, h: 44 },
    resetButton: { x: mid + 82, y: page.top + 128, w: 150, h: 44 },
  };
}
