import Phaser from 'phaser';
import { createWorld, step } from '../sim/World.js';
import { DT } from '../sim/constants.js';
import { CHARACTERS, CHARACTER_ORDER } from '../sim/characters.js';
import { AIController } from '../ai/AIController.js';
import { Background } from '../render/Background.js';
import { FightRenderer } from '../render/FightRenderer.js';
import { Sfx } from '../render/Sfx.js';
import { ensureGlyph } from '../render/GlyphCache.js';
import { text, moveList, FONT_TITLE, FONT_UI, hex } from './ui.js';
import { slant, speedLines, gradientText } from '../render/UiKit.js';

const MENU = [
  { id: 'arcade', label: 'ARCADE LADDER', hint: 'Climb 8 stages. Every villain is stronger than the last.' },
  { id: 'training', label: 'TRAINING', hint: 'Practice combos on a dummy. T cycles dummy behaviour.' },
  { id: 'moves', label: 'MOVE LIST', hint: 'Every combo, special and transformation.' },
  { id: 'online', label: 'ONLINE VERSUS', hint: 'Coming soon — the engine is already netcode-ready.', disabled: true },
];

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    this.cameras.main.setZoom(1).centerOn(640, 360);
    this.bg = new Background(this, (Math.random() * 5) | 0);
    this.fr = null; // scene instances persist across restarts — never reuse a renderer bound to destroyed objects
    this.startAttract();

    // darkening vignette for readability
    const shade = this.add.graphics().setDepth(50);
    shade.fillGradientStyle(0x05060b, 0x05060b, 0x05060b, 0x05060b, 0.9, 0.9, 0.1, 0.1);
    shade.fillRect(0, 0, 1280, 300);
    shade.fillGradientStyle(0x05060b, 0x05060b, 0x05060b, 0x05060b, 0.92, 0.0, 0.92, 0.0);
    shade.fillRect(0, 280, 640, 440);
    speedLines(shade, 640, 150, 250, 900, 70, 0x3ee8ff, 0.05, 21);

    // ── the title ──
    const title = text(this, 640, 138, 'AXIOM', 170, '#ffffff', { font: FONT_TITLE, weight: 'italic 900', spacing: 16, strokeThickness: 8, stroke: '#05060b', shadow: '#3ee8ff', blur: 34, depth: 60 });
    gradientText(title, ['#ffffff', '#c9f7ff', '#3ee8ff', '#7a5cff', '#b96bff']);
    this.title = title;
    const plate = this.add.graphics().setDepth(59);
    slant(plate, 330, 232, 600, 34, 12, 0x05060b, 0.85);
    plate.fillStyle(0x3ee8ff, 1); plate.fillRect(342, 232, 600, 2);
    text(this, 640, 249, 'S T I C K M A N   ·   M A T H   ·   F I G H T E R S', 19, '#e6ecff', { font: FONT_TITLE, weight: '700', depth: 60, strokeThickness: 0 });
    this.emblems = CHARACTER_ORDER.map((id, i) => {
      const c = CHARACTERS[id];
      return this.add.image(640 + (i - 1.5) * 110, 34, ensureGlyph(this, c.emblem, 'lg')).setTint(c.color).setDepth(60).setBlendMode(Phaser.BlendModes.ADD).setScale(0.8);
    });

    // ── menu: slanted anime-style plates ──
    this.sel = 0;
    this.menuG = this.add.graphics().setDepth(59);
    this.items = MENU.map((m, i) => text(this, 150 + i * -12, 350 + i * 62, m.label, 28, m.disabled ? '#5a6078' : '#ffffff', { font: FONT_TITLE, weight: 'italic 900', spacing: 3, ox: 0, depth: 60 }));
    this.itemNums = MENU.map((m, i) => text(this, 96 + i * -12, 350 + i * 62, ['Σ', 'π', '∇', 'Ω'][i], 30, '#ffffff', { depth: 60, font: FONT_UI }));
    this.hint = text(this, 80, 610, '', 17, '#9aa3c7', { ox: 0, depth: 60 });
    text(this, 1260, 706, 'M  mute   ·   W/S  select   ·   J / Enter  confirm', 14, '#5a6078', { ox: 1, depth: 60 });
    this.refreshMenu();

    this.moveOverlay = null;
    const kb = this.input.keyboard;
    kb.on('keydown', (e) => this.onKey(e.code));
  }

  startAttract() {
    const ids = Phaser.Utils.Array.Shuffle([...CHARACTER_ORDER]);
    this.world = createWorld({ p1: { charId: ids[0], ki: 60 }, p2: { charId: ids[1], ki: 60 }, seed: (Math.random() * 1e9) | 0 });
    this.world.phase = 'fight';
    this.world.fighters.forEach((f) => (f.state = 'idle'));
    this.ais = [new AIController(0, 8, (Math.random() * 1e9) | 0), new AIController(1, 8, (Math.random() * 1e9) | 0)];
    if (this.fr) this.fr.setWorld(this.world);
    else this.fr = new FightRenderer(this, this.world, { sound: false, camera: false, villainSlot: -1 });
    this.acc = 0;
    this.endTimer = 0;
  }

  onKey(code) {
    Sfx.unlock();
    if (code === 'KeyM') { Sfx.toggleMute(); return; }
    if (this.moveOverlay) {
      if (code === 'Escape' || code === 'KeyJ' || code === 'Enter') { this.moveOverlay.destroy(); this.moveOverlay = null; Sfx.ui(); }
      else if (code === 'KeyA' || code === 'ArrowLeft' || code === 'KeyD' || code === 'ArrowRight') {
        const d = code === 'KeyA' || code === 'ArrowLeft' ? -1 : 1;
        this.moveChar = (this.moveChar + d + 4) % 4;
        this.showMoves();
        Sfx.ui();
      }
      return;
    }
    if (code === 'KeyW' || code === 'ArrowUp') { this.sel = (this.sel + MENU.length - 1) % MENU.length; Sfx.ui(); this.refreshMenu(); }
    if (code === 'KeyS' || code === 'ArrowDown') { this.sel = (this.sel + 1) % MENU.length; Sfx.ui(); this.refreshMenu(); }
    if (code === 'KeyJ' || code === 'Enter' || code === 'Space') {
      const m = MENU[this.sel];
      if (m.disabled) { this.cameras.main.shake(120, 0.004); return; }
      Sfx.select();
      if (m.id === 'moves') { this.moveChar = 0; this.showMoves(); return; }
      this.scene.start('Select', { mode: m.id });
    }
  }

  refreshMenu() {
    const g = this.menuG;
    g.clear();
    this.items.forEach((t, i) => {
      const on = i === this.sel;
      const y = 350 + i * 62, x = 60 + i * -12;
      const col = [0x3ee8ff, 0xffa53b, 0xff4d5e, 0xb96bff][i];
      slant(g, x, y - 24, on ? 470 : 420, 48, 16, on ? col : 0x0b0d1c, on ? 0.95 : 0.8);
      if (!on) { g.lineStyle(1.5, col, 0.5); g.strokePoints([{ x: x + 16, y: y - 24 }, { x: x + 436, y: y - 24 }, { x: x + 420, y: y + 24 }, { x, y: y + 24 }], true, true); }
      else { g.fillStyle(0xffffff, 0.9); g.fillRect(x + 490, y - 24, 6, 48); }
      t.setColor(on ? '#05060b' : MENU[i].disabled ? '#5a6078' : '#ffffff').setStroke('#05060b', on ? 0 : 3).setX(on ? 150 + i * -12 + 10 : 150 + i * -12);
      this.itemNums[i].setColor(on ? '#05060b' : hex(col)).setStroke('#05060b', on ? 0 : 3);
    });
    this.hint.setText(MENU[this.sel].hint);
  }

  showMoves() {
    if (this.moveOverlay) this.moveOverlay.destroy();
    this.moveOverlay = buildMoveOverlay(this, CHARACTER_ORDER[this.moveChar], true);
  }

  update(_, delta) {
    const dt = Math.min(0.1, delta / 1000);
    this.bg.update(dt);
    this.acc += dt;
    let n = 0;
    while (this.acc >= DT && n++ < 4) {
      this.fr.beforeStep();
      step(this.world, [this.ais[0].update(this.world), this.ais[1].update(this.world)]);
      this.fr.handleEvents(this.world.events);
      this.acc -= DT;
    }
    this.fr.render(dt, this.acc / DT);
    if (this.world.phase !== 'fight') { this.endTimer += dt; if (this.endTimer > 3) this.startAttract(); }
    const t = this.time.now / 1000;
    this.title.setScale(1 + Math.sin(t * 2) * 0.01);
    this.emblems.forEach((e, i) => e.setY(34 + Math.sin(t * 2 + i) * 5).setAlpha(0.7 + Math.sin(t * 3 + i) * 0.3));
  }
}

export function buildMoveOverlay(scene, charId, withNav) {
  const c = CHARACTERS[charId];
  const cont = scene.add.container(0, 0).setDepth(200);
  const g = scene.add.graphics();
  g.fillStyle(0x05060b, 0.94); g.fillRect(0, 0, 1280, 720);
  g.lineStyle(2, c.color, 0.8); g.strokeRoundedRect(120, 40, 1040, 640, 18);
  cont.add(g);
  cont.add(text(scene, 640, 82, `${c.emblem}  ${c.name}  —  MOVE LIST`, 34, hex(c.color), { font: FONT_TITLE, weight: '900', spacing: 3 }));
  let y = 128;
  for (const [k, v] of moveList(charId)) {
    if (!v) { cont.add(text(scene, 170, y + 5, k, 15, hex(c.color), { ox: 0, font: FONT_TITLE, spacing: 4 })); y += 27; continue; }
    cont.add(text(scene, 170, y, k, 18, '#ffffff', { ox: 0 }));
    cont.add(text(scene, 470, y, v, 18, '#b9c2e6', { ox: 0, weight: '600' }));
    y += 22;
  }
  cont.add(text(scene, 640, 660, withNav ? '←  →  change fighter      ESC  close' : 'ESC  close', 16, '#6d7596'));
  return cont;
}
