import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { SelectScene } from './scenes/SelectScene.js';
import { FightScene } from './scenes/FightScene.js';
import { HudScene } from './scenes/HudScene.js';

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#05060b',
  antialias: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  fps: { target: 60, smoothStep: true },
  scene: [BootScene, TitleScene, SelectScene, FightScene, HudScene],
});

// handle for debugging / automated smoke tests
window.__AXIOM = game;
