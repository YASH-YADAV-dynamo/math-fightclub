import Phaser from 'phaser';
import { CHARACTERS, CHARACTER_ORDER } from '../sim/characters.js';
import { MOVES } from '../sim/moves.js';
import { Background } from '../render/Background.js';
import { StickmanView } from '../render/Stickman.js';
import { ensureGlyph } from '../render/GlyphCache.js';
import { Sfx } from '../render/Sfx.js';
import { text, hex, FONT_TITLE } from './ui.js';

const CARD_W = 250, CARD_H = 440, GAP = 30;
const START_X = (1280 - (CARD_W * 4 + GAP * 3)) / 2;
const TOP = 96;

function stats(c) {
  return [
    ['POWER', (c.power - 0.85) / 0.4],
    ['SPEED', (c.speed - 0.8) / 0.45],
    ['DEFENSE', (c.hp * c.weight - 800) / 800],
    ['RANGE', { sigma: 0.7, pi: 0.4, nabla: 0.5, omega: 0.95 }[c.id]],
  ];
}

export class SelectScene extends Phaser.Scene {
  constructor() { super('Select'); }

  init(data) { this.mode = data.mode || 'arcade'; }

  create() {
    this.cameras.main.setZoom(1).centerOn(640, 360);
    this.bg = new Background(this, 2);
    const shade = this.add.graphics().setDepth(-5);
    shade.fillStyle(0x05060b, 0.62); shade.fillRect(0, 0, 1280, 720);

    text(this, 640, 48, this.mode === 'training' ? 'TRAINING  ·  CHOOSE YOUR AXIOM' : 'CHOOSE YOUR AXIOM', 34, '#ffffff', { font: FONT_TITLE, weight: '900', spacing: 6, shadow: '#3ee8ff' });

    this.sel = 0;
    this.cards = CHARACTER_ORDER.map((id, i) => this.buildCard(id, i));
    this.info = this.add.container(0, 0);
    text(this, 640, 700, 'A / D  choose    ·    J / Enter  fight    ·    ESC  back', 16, '#6d7596');

    this.input.keyboard.on('keydown', (e) => {
      Sfx.unlock();
      const c = e.code;
      if (c === 'KeyA' || c === 'ArrowLeft') { this.sel = (this.sel + 3) % 4; Sfx.ui(); this.refresh(); }
      if (c === 'KeyD' || c === 'ArrowRight') { this.sel = (this.sel + 1) % 4; Sfx.ui(); this.refresh(); }
      if (c === 'Escape') this.scene.start('Title');
      if (c === 'KeyJ' || c === 'Enter' || c === 'Space') this.confirm();
    });
    this.refresh();
  }

  buildCard(id, i) {
    const c = CHARACTERS[id];
    const x = START_X + i * (CARD_W + GAP), cx = x + CARD_W / 2;
    const g = this.add.graphics();
    const water = this.add.image(cx, TOP + 150, ensureGlyph(this, c.emblem, 'xxl')).setTint(c.color).setAlpha(0.13).setScale(1.4).setBlendMode(Phaser.BlendModes.ADD);
    const view = new StickmanView(this, id, { scale: 1.45, depth: 5, floorY: TOP + 300 });
    const name = text(this, cx, TOP + 336, c.name, 32, hex(c.color), { font: FONT_TITLE, weight: '900', spacing: 4 });
    const title = text(this, cx, TOP + 366, c.title.toUpperCase(), 15, '#aab3d6', { spacing: 3 });
    const bars = this.add.graphics();
    const labels = stats(c).map(([k], j) => text(this, x + 22, TOP + 392 + j * 12, k, 11, '#7c85a8', { ox: 0 }));
    const fake = {
      charId: id, state: 'idle', move: null, grounded: true, facing: 1, vx: 0, vy: 0, transformed: 0, flash: 0,
      crouch: false, guard: false, threat: false, wallTouch: 0, invuln: 0, dashDir: 0, dashDirY: 0, sf: 0,
    };
    return { id, c, x, cx, g, water, view, name, title, bars, labels, fake, t: Math.random(), animIdx: 0 };
  }

  refresh() {
    this.cards.forEach((card, i) => {
      const on = i === this.sel;
      const { g, x, c } = card;
      g.clear();
      g.fillStyle(on ? 0x10142a : 0x0a0c18, on ? 0.95 : 0.8);
      g.fillRoundedRect(x, TOP, CARD_W, CARD_H, 16);
      g.lineStyle(on ? 3 : 1.5, on ? c.color : 0x2a3050, on ? 1 : 0.8);
      g.strokeRoundedRect(x, TOP, CARD_W, CARD_H, 16);
      if (on) { g.lineStyle(10, c.color, 0.12); g.strokeRoundedRect(x - 4, TOP - 4, CARD_W + 8, CARD_H + 8, 20); }
      card.bars.clear();
      stats(c).forEach(([, v], j) => {
        const y = TOP + 388 + j * 12;
        card.bars.fillStyle(0x1c2038, 1); card.bars.fillRect(x + 90, y, 138, 6);
        card.bars.fillStyle(c.color, on ? 1 : 0.55); card.bars.fillRect(x + 90, y, 138 * Math.max(0.08, Math.min(1, v)), 6);
      });
      card.name.setAlpha(on ? 1 : 0.55);
      card.water.setAlpha(on ? 0.22 : 0.08);
    });
    this.info.removeAll(true);
    const c = this.cards[this.sel].c;
    const y = 572;
    const col = hex(c.color);
    const rows = [['I', c.uniqueName], ['U', c.specialName], ['O', c.transformName], ['W+D+J', c.beamName]];
    rows.forEach(([k, v], i) => {
      const x = 120 + i * 270;
      this.info.add(text(this, x, y, k, 14, '#7c85a8', { ox: 0, font: FONT_TITLE }));
      this.info.add(text(this, x, y + 24, v, 20, col, { ox: 0 }));
    });
    this.info.add(text(this, 640, y + 68, c.bio, 18, '#c9d0ee', { weight: '600' }));
  }

  confirm() {
    Sfx.select();
    const player = CHARACTER_ORDER[this.sel];
    const others = Phaser.Utils.Array.Shuffle(CHARACTER_ORDER.filter((id) => id !== player));
    const others2 = Phaser.Utils.Array.Shuffle([...others]);
    const ladder = [...others, player, ...others2, Phaser.Utils.Array.GetRandom(CHARACTER_ORDER)];
    this.cameras.main.flash(250, 255, 255, 255);
    this.time.delayedCall(260, () => this.scene.start('Fight', { mode: this.mode, playerChar: player, stage: 1, ladder, score: 0 }));
  }

  update(_, delta) {
    const dt = Math.min(0.1, delta / 1000);
    this.bg.update(dt);
    this.cards.forEach((card, i) => {
      const f = card.fake;
      const on = i === this.sel;
      card.t += dt;
      if (on && f.state === 'idle' && card.t > 0.9) {
        const seq = ['jab1', 'jab2', 'kick', 'launcher', card.c.unique, 'beam', 'sweep', 'transform'];
        const id = seq[card.animIdx++ % seq.length];
        f.state = 'move'; f.move = { id, f: 0, data: {} }; card.t = 0; card.mt = 0;
        if (id === 'transform') f.transformed = 1;
      }
      if (f.state === 'move') {
        card.mt += dt;
        while (card.mt >= 1 / 60) {
          card.mt -= 1 / 60;
          f.move.f++;
          const m = MOVES[f.move.id];
          if (f.move.f >= m.startup + m.active + m.recovery) { f.state = 'idle'; f.move = null; card.t = 0; break; }
        }
      }
      if (f.transformed && f.state === 'idle' && card.t > 0.6) f.transformed = 0;
      if (!on && f.state !== 'idle') { f.state = 'idle'; f.move = null; f.transformed = 0; }
      card.view.update(f, card.cx, TOP + 300, dt, false);
      card.view.setVisible(true);
    });
  }
}
