import Phaser from 'phaser';
import { FONT } from '../art';
import { H, W } from './widgets';

export interface ControlState {
  left: boolean;
  right: boolean;
  jump: boolean;
  fire: boolean;
}

interface Pad {
  id: keyof ControlState;
  x: number;
  y: number;
  r: number;
  g: Phaser.GameObjects.Arc;
}

export function isTouchDevice(scene: Phaser.Scene): boolean {
  return scene.sys.game.device.input.touch || navigator.maxTouchPoints > 0;
}

/**
 * Keyboard and on-screen buttons merged into one state, so the level code
 * doesn't care which one the player is using.
 */
export class Controls {
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private pads: Pad[] = [];
  readonly touch: boolean;
  state: ControlState = { left: false, right: false, jump: false, fire: false };
  private prevJump = false;
  jumpPressed = false;

  constructor(private scene: Phaser.Scene) {
    this.touch = isTouchDevice(scene);
    const kb = scene.input.keyboard;
    if (kb) {
      this.keys = kb.addKeys('LEFT,RIGHT,UP,A,D,W,SPACE,F,J,X,K,Z') as Record<string, Phaser.Input.Keyboard.Key>;
    }
    if (this.touch) {
      scene.input.addPointer(3);
      this.makePad('left', 110, H - 100, 66, '◀');
      this.makePad('right', 260, H - 100, 66, '▶');
      this.makePad('fire', W - 270, H - 95, 70, 'FIRE');
      this.makePad('jump', W - 110, H - 160, 78, 'JUMP');
    }
  }

  private makePad(id: keyof ControlState, x: number, y: number, r: number, label: string) {
    const g = this.scene.add.circle(x, y, r, 0xffffff, 0.16).setStrokeStyle(4, 0xffffff, 0.5).setScrollFactor(0).setDepth(500);
    this.scene.add
      .text(x, y, label, { fontFamily: FONT, fontSize: label.length > 1 ? '26px' : '40px', color: '#ffffff' })
      .setOrigin(0.5).setAlpha(0.8).setScrollFactor(0).setDepth(501);
    this.pads.push({ id, x, y, r, g });
  }

  update(): void {
    const k = this.keys;
    const down = (name: string) => !!k[name]?.isDown;
    const s: ControlState = {
      left: down('LEFT') || down('A'),
      right: down('RIGHT') || down('D'),
      jump: down('SPACE') || down('UP') || down('W') || down('Z'),
      fire: down('F') || down('J') || down('X') || down('K'),
    };
    if (this.pads.length) {
      const pressed = new Set<keyof ControlState>();
      for (const p of this.scene.input.manager.pointers) {
        if (!p || !p.isDown) continue;
        for (const pad of this.pads) {
          // A little extra reach so a thumb slightly off the button still counts.
          if (Phaser.Math.Distance.Between(p.x, p.y, pad.x, pad.y) < pad.r * 1.25) pressed.add(pad.id);
        }
      }
      for (const pad of this.pads) {
        const on = pressed.has(pad.id);
        if (on) s[pad.id] = true;
        pad.g.setFillStyle(0xffffff, on ? 0.4 : 0.16);
      }
    }
    this.jumpPressed = s.jump && !this.prevJump;
    this.prevJump = s.jump;
    this.state = s;
  }
}
