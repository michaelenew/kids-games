import Phaser from 'phaser';
import type { RobotLook } from '../art';
import { lookFromSave } from '../armor';
import { type GadgetId, gadgetInfo, type GearId, activeBot, gearInfo, save } from '../state';
import { Jet } from '../three/jet';
import { Showcase } from '../three/showcase';
import { getStage } from '../three/stage';
import { H, W, button, text } from '../ui/widgets';

const ROMAN = ['', 'I', 'II', 'III'];

export interface InstallData {
  gear: GearId;
  mark: 1 | 2 | 3;
  before: RobotLook;
  /** A super gadget was built (instead of a gear mark). */
  gadget?: GadgetId;
}

/** The payoff after a bench job: the new part flies onto the robot, then the robot shows it off. */
export class InstallScene extends Phaser.Scene {
  private data_!: InstallData;

  constructor() {
    super('Install');
  }

  init(data: InstallData) {
    this.data_ = data;
  }

  create() {
    const { gear, mark, before, gadget } = this.data_;
    const s = save();
    const after: RobotLook = lookFromSave(s);
    const show = new Showcase(getStage(this.game.canvas), [{ look: before, x: W / 2, y: 600, height: 430, spin: 0.7, yaw: 0.4 }]);
    const robot = show.robots[0];

    const head = text(this, W / 2, 70, 'INSTALLING…', 52, '#ffd166').setStroke('#000000', 8);
    this.tweens.add({ targets: head, alpha: 0.4, duration: 300, yoyo: true, repeat: 2 });

    const flash = this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0).setDepth(10);

    this.time.delayedCall(900, () => {
      robot.setLook(after, true);
      show.held[0] = false;
    });
    this.time.delayedCall(1350, () => {
      show.sparkle(0);
      flash.setFillStyle(0xffffff, 0.75);
      this.tweens.add({ targets: flash, fillAlpha: 0, duration: 450 });
      this.cameras.main.shake(250, 0.006);
      head.setText(gadget ? `${gadgetInfo(activeBot(), gadget).title.toUpperCase()} READY!` : `${gearInfo(activeBot())[gear].title.toUpperCase()} MARK ${ROMAN[mark]} INSTALLED!`).setColor('#06d6a0').setAlpha(1);
      this.tweens.add({ targets: head, scale: { from: 1.25, to: 1 }, duration: 350, ease: 'Back.easeOut' });
    });

    // Show off the new part.
    this.time.delayedCall(1900, () => {
      show.held[0] = true;
      if (robot.spin !== null) robot.spin = 1.0;
      if (gadget === 'mega' || gadget === 'shield') {
        this.time.addEvent({ delay: 160, repeat: 8, callback: () => (gadget === 'mega' ? robot.fire() : robot.powerUp()) });
      } else if (gadget === 'drones') {
        robot.powerUp();
      } else if (gear === 'blaster' && !gadget) {
        this.time.addEvent({ delay: mark === 3 ? 90 : 220, repeat: mark === 3 ? 16 : 6, callback: () => robot.fire() });
      } else if (gear === 'boots') {
        robot.thrust = mark >= 3 || robot instanceof Jet ? 1 : 0;
        // The jet shows off its new afterburners with a barrel roll.
        if (robot instanceof Jet) this.time.delayedCall(350, () => robot.roll());
        const slot = show.slots[0];
        const baseY = slot.position.y;
        this.tweens.addCounter({
          from: 0, to: 1, duration: 900, yoyo: true, ease: 'Sine.easeOut',
          onUpdate: (tw) => {
            slot.position.y = baseY + (tw.getValue() ?? 0) * (1 + mark * 0.6);
            robot.grounded = (tw.getValue() ?? 0) < 0.05;
          },
          onComplete: () => {
            robot.thrust = robot instanceof Jet ? 0.35 : 0;
            robot.grounded = true;
          },
        });
      } else {
        this.time.addEvent({ delay: 300, repeat: 2, callback: () => robot.powerUp() });
      }
    });

    this.time.delayedCall(2600, () => {
      show.held[0] = false;
      const perk = gadget ? `${gadgetInfo(activeBot(), gadget).perk}, for the next mission` : gearInfo(activeBot())[gear].perks[mark];
      text(this, W / 2, 140, perk, 34, '#ffffff').setStroke('#000000', 6);
      button(this, W / 2 - 330, 660, 300, 80, 'Engineering Zone', () => this.scene.start('Engineering'), {
        fill: 0xf77f00, edge: 0xffd166, size: 26,
      });
      button(this, W / 2 + 330, 660, 300, 80, 'Go play!', () => this.scene.start('Garage'), { fill: 0x2a9d8f, edge: 0x9ff0e3 });
    });
  }
}
