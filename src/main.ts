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
import { InvasionScene } from './scenes/Invasion';
import { ArmorForge } from './scenes/ArmorForge';
import { WallForge } from './scenes/WallForge';
import { ControlScene } from './scenes/Control';
import { RecapScene } from './scenes/Recap';
import { TraderScene } from './scenes/Trader';
import { PreLaunchScene } from './scenes/PreLaunch';
import { unlockAudio } from './audio';
import { getStage, hasStage } from './three/stage';
import { H, W } from './ui/widgets';
import { updatePreviewBanner } from './ui/previewBanner';
import * as state from './state';

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
  scene: [BootScene, TitleScene, GarageScene, LevelScene, EngineeringScene, ArmorBench, BlasterBench, BootsBench, InstallScene, InvasionScene, ArmorForge, ControlScene, RecapScene, TraderScene, PreLaunchScene, WallForge],
});

// Draw the 3D layer once per game step, after the game logic has run.
game.events.on('poststep', (_time: number, delta: number) => {
  if (hasStage()) getStage().frame(delta / 1000);
});

// Handy for poking at the game from the browser console while developing.
(window as unknown as { game: Phaser.Game }).game = game;
Object.defineProperty(window, 'stage', { get: () => (hasStage() ? getStage() : null) });
// The live save module, for test scripts (dev server only).
if (import.meta.env.DEV) (window as unknown as { state: typeof state }).state = state;

// Progress is saved in this browser's local storage (see state.ts). Ask the
// browser to keep it rather than clear it when space runs low.
navigator.storage?.persist?.().catch(() => {});

updatePreviewBanner();

// iPad Safari only allows sound after the first tap.
window.addEventListener('pointerup', () => unlockAudio(), { once: true });
