import Phaser from 'phaser';
import { ArmorBench } from './scenes/ArmorBench';
import { BlasterBench } from './scenes/BlasterBench';
import { BootScene } from './scenes/Boot';
import { BootsBench } from './scenes/BootsBench';
import { EngineeringScene } from './scenes/Engineering';
import { GarageScene } from './scenes/Garage';
import { LevelScene } from './scenes/Level';
import { TitleScene } from './scenes/Title';
import { InstallScene } from './scenes/Install';
import { getStage, hasStage } from './three/stage';
import { H, W } from './ui/widgets';

// Add ?canvas to the URL to skip WebGL (useful on older devices and in headless testing).
const forceCanvas = new URLSearchParams(window.location.search).has('canvas');

const game = new Phaser.Game({
  type: forceCanvas ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  // Transparent so the 3D layer underneath shows through.
  transparent: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { activePointers: 4 },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 1500 }, debug: false },
  },
  scene: [BootScene, TitleScene, GarageScene, LevelScene, EngineeringScene, ArmorBench, BlasterBench, BootsBench, InstallScene],
});

// Draw the 3D layer once per game step, after the game logic has run.
game.events.on('poststep', (_time: number, delta: number) => {
  if (hasStage()) getStage().frame(delta / 1000);
});

// Handy for poking at the game from the browser console while developing.
(window as unknown as { game: Phaser.Game }).game = game;
Object.defineProperty(window, 'stage', { get: () => (hasStage() ? getStage() : null) });

// iPad Safari only allows speech after the first tap. Speak a silent line on
// that first tap so Sprocket's voice works for the rest of the session.
window.addEventListener(
  'pointerup',
  () => {
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis?.speak(u);
    } catch {
      // No speech support: the game is fully playable without it.
    }
  },
  { once: true },
);
