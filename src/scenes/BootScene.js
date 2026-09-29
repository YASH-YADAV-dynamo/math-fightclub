import Phaser from 'phaser';
import { prewarmGlyphs } from '../render/GlyphCache.js';
import { text, FONT_TITLE } from './ui.js';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    const t = text(this, 640, 360, 'Σ  LOADING  ∞', 28, '#9fe8ff', { font: FONT_TITLE, spacing: 8 });
    const fonts = Promise.all([
      document.fonts.load('900 40px Orbitron'),
      document.fonts.load('700 20px Rajdhani'),
    ]).catch(() => {});
    const timeout = new Promise((r) => setTimeout(r, 2500));
    Promise.race([fonts, timeout]).then(() => {
      prewarmGlyphs(this);
      t.destroy();
      this.scene.start('Title');
    });
  }
}
