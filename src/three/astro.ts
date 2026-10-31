import type { RobotLook } from '../art';
import { Phantom } from './phantom';

/** ASTRO, the space robot (placeholder model, being built). */
export class Astro extends Phantom {
  constructor(look: RobotLook) {
    super(look);
  }
}
