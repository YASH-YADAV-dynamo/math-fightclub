// Anime-fighter style HUD: live portrait frames, beveled HP bars, bottom
// power gauges, speed-line announcer, super cut-ins with live character art.

import Phaser from 'phaser';
import { CHARACTERS } from '../sim/characters.js';
import { MOVES } from '../sim/moves.js';
import { ensureGlyph } from '../render/GlyphCache.js';
import { StickmanView, mixColor } from '../render/Stickman.js';
import { slant, poly, polyStroke, mirrorPts, speedLines, gradientText } from '../render/UiKit.js';
import { Sfx } from '../render/Sfx.js';
import { text, hex, FONT_TITLE } from './ui.js';
import { buildMoveOverlay } from './TitleScene.js';
import { LADDER_LENGTH } from './FightScene.js';

const HP = { x: 170, y: 22, w: 420, h: 30, skew: 16 };
const PORTRAIT = [{ x: 12, y: 8 }, { x: 178, y: 8 }, { x: 152, y: 120 }, { x: 12, y: 120 }];
const GAUGE_Y = 650;

const fakeFighter = (charId, facing) => ({
  charId, state: 'idle', move: null, grounded: true, facing, vx: 0, vy: 0, transformed: 0, flash: 0,
  crouch: false, guard: false, threat: false, wallTouch: 0, invuln: 0, dashDir: 0, dashDirY: 0, sf: 0,
});

export class HudScene extends Phaser.Scene {
  constructor() { super('Hud'); }

  init(data) { this.fight = data.fight; this.ready = false; }

  create() {
    const fight = this.fight;
    const w = fight.world;
    this.chars = w.fighters.map((f) => CHARACTERS[f.charId]);
    this.t = 0;
    this.ghost = [1, 1]; this.ghostDelay = [0, 0];

    this.back = this.add.graphics().setDepth(0);   // plates behind portraits
    this.g = this.add.graphics().setDepth(3);      // bars & gauges

    // live portraits (the actual fighter, mirroring its current pose)
    this.portraits = [0, 1].map((s) => {
      const c = this.chars[s];
      const pts = mirrorPts(PORTRAIT, s === 1);
      const maskG = this.make.graphics({ add: false });
      maskG.fillStyle(0xffffff); maskG.fillPoints(pts, true);
      const mask = maskG.createGeometryMask();
      const emb = this.add.image(s === 0 ? 70 : 1210, 64, ensureGlyph(this, c.emblem, 'xxl')).setTint(c.color).setAlpha(0.22).setScale(0.8).setDepth(1).setMask(mask);
      const view = new StickmanView(this, c.id, { scale: 1.6, depth: 1, floorY: 999, villain: s === 1 });
      view.setMask(mask);
      const fx = this.add.graphics().setDepth(0.5).setMask(mask);
      return { view, proxy: fakeFighter(c.id, s === 0 ? 1 : -1), pts, emb, fx };
    });

    // names
    this.side = [0, 1].map((s) => {
      const c = this.chars[s];
      const nx = s === 0 ? 188 : 1280 - 188;
      const name = gradientText(text(this, nx, 72, c.name, 22, '#ffffff', { font: FONT_TITLE, weight: 'italic 900', ox: s === 0 ? 0 : 1, spacing: 3, depth: 4, strokeThickness: 4 }), ['#ffffff', hex(mixColor(c.color, 0xffffff, 0.4)), hex(c.color)]);
      const sub = s === 1 ? (fight.training ? 'TRAINING DUMMY' : `VILLAIN  LV ${fight.level}`) : c.title.toUpperCase();
      const tag = text(this, nx, 95, sub, 12, s === 1 && !fight.training ? '#ff6a7a' : '#9aa3c7', { font: FONT_TITLE, ox: s === 0 ? 0 : 1, spacing: 2, depth: 4 });
      const hpNum = text(this, s === 0 ? HP.x + HP.w - 8 : 1280 - HP.x - HP.w + 8, HP.y + HP.h / 2 + 1, '', 13, '#ffffff', { font: FONT_TITLE, weight: '900', ox: s === 0 ? 1 : 0, depth: 5, strokeThickness: 3 });
      // bottom gauges
      const gx = s === 0 ? 0 : 1;
      const kiNum = text(this, s === 0 ? 56 : 1224, GAUGE_Y + 28, '0', 26, '#ffffff', { font: FONT_TITLE, weight: '900', depth: 5, strokeThickness: 4 });
      const kiLbl = text(this, s === 0 ? 56 : 1224, GAUGE_Y + 50, 'KI', 10, '#cfd8ff', { font: FONT_TITLE, depth: 5 });
      const uLbl = text(this, s === 0 ? 452 : 828, GAUGE_Y + 28, 'U', 18, '#ffffff', { font: FONT_TITLE, weight: '900', depth: 5 });
      const iLbl = text(this, s === 0 ? 510 : 770, GAUGE_Y + 28, 'I', 14, '#ffffff', { font: FONT_TITLE, weight: '900', depth: 5 });
      const status = text(this, s === 0 ? 100 : 1180, GAUGE_Y - 6, '', 11, '#ffffff', { font: FONT_TITLE, weight: '700', ox: s === 0 ? 0 : 1, spacing: 2, depth: 5 });
      const combo = text(this, s === 0 ? 210 : 1070, 250, '', 92, '#ffffff', { font: FONT_TITLE, weight: 'italic 900', strokeThickness: 8, depth: 6 }).setAlpha(0);
      gradientText(combo, ['#ffffff', '#fff3b0', hex(c.color)]);
      const comboSub = text(this, s === 0 ? 210 : 1070, 318, '', 20, '#ffffff', { font: FONT_TITLE, weight: 'italic 900', depth: 6, spacing: 2 }).setAlpha(0);
      return { name, tag, hpNum, kiNum, kiLbl, uLbl, iLbl, status, combo, comboSub, comboT: 0, gx };
    });

    // centre: timer + title
    this.timer = text(this, 640, 50, '99', 40, '#ffffff', { font: FONT_TITLE, weight: '900', strokeThickness: 5, depth: 5 });
    gradientText(this.timer, ['#ffffff', '#fff1c2', '#ffc14d']);
    this.titleText = text(this, 640, 104, 'A X I O M', 15, '#ffffff', { font: FONT_TITLE, weight: '900', shadow: '#3ee8ff', blur: 12, strokeThickness: 0, depth: 5 });
    const stageStr = fight.training ? 'TRAINING' : `STAGE ${fight.cfg.stage}${fight.cfg.stage <= LADDER_LENGTH ? '/' + LADDER_LENGTH : ''}`;
    this.stageText = text(this, 640, 124, `${stageStr}  ·  ${fight.stageName}`, 11, '#8e97bd', { font: FONT_TITLE, spacing: 2, depth: 5 });

    // announcer
    this.banner = this.add.graphics().setDepth(48);
    this.announcer = text(this, 640, 330, '', 110, '#ffffff', { font: FONT_TITLE, weight: 'italic 900', strokeThickness: 10, depth: 50 }).setAlpha(0);
    this.announceSub = text(this, 640, 412, '', 24, '#ffffff', { font: FONT_TITLE, weight: '900', spacing: 8, depth: 50 }).setAlpha(0);
    this.bannerT = 0; this.bannerCol = 0xffffff; this.bannerDur = 1;

    const hint = 'A/D move · W up · S down · J attack · K jump · L dash · U super · I unique · hold O charge · O transform · W+D+J beam · S+D+J wave · ESC pause';
    this.hint = text(this, 640, 628, hint, 14, '#dfe5ff', { depth: 5 }).setAlpha(fight.cfg.stage === 1 || fight.training ? 0.95 : 0);
    this.hintT = fight.training ? Infinity : 12;
    this.dummyText = fight.training ? text(this, 640, 606, '', 15, '#ffd27a', { font: FONT_TITLE, depth: 5 }) : null;

    this.overlay = null; this.pauseSel = 0; this.moveOverlay = null; this.resultMode = false;
    this.input.keyboard.on('keydown', (e) => this.onKey(e.code));
    this.ready = true;
    this.events.once('shutdown', () => { this.ready = false; });

    if (fight.splash > 0) this.vsSplash();
  }

  // ── announcer with speed-line banner ──────────────────────────────
  announce(str, color = '#ffffff', sub = '', hold = 0.8, size = 110, bannerColor = 0x000000) {
    const a = this.announcer;
    this.tweens.killTweensOf([a, this.announceSub]);
    a.setText(str).setFontSize(size).setAlpha(0).setScale(2.2);
    gradientText(a, ['#ffffff', color, hex(mixColor(parseInt(color.slice(1), 16), 0x000000, 0.35))]);
    this.tweens.add({ targets: a, alpha: 1, scale: 1, duration: 200, ease: 'Back.Out' });
    this.tweens.add({ targets: a, alpha: 0, scale: 1.15, duration: 280, delay: 200 + hold * 1000 });
    this.announceSub.setText(sub).setAlpha(0);
    if (sub) {
      this.tweens.add({ targets: this.announceSub, alpha: 1, duration: 200, delay: 150 });
      this.tweens.add({ targets: this.announceSub, alpha: 0, duration: 280, delay: 200 + hold * 1000 });
    }
    this.bannerT = 0; this.bannerDur = 0.48 + hold; this.bannerCol = parseInt(color.slice(1), 16); this.bannerBase = bannerColor;
  }

  drawBanner(dt) {
    const b = this.banner;
    b.clear();
    if (this.bannerT >= this.bannerDur) return;
    this.bannerT += dt;
    const t = this.bannerT, d = this.bannerDur;
    const open = Math.min(1, t / 0.12) * Math.min(1, Math.max(0, (d - t) / 0.2));
    const h = 150 * open;
    b.fillStyle(this.bannerBase, 0.62 * open);
    b.fillPoints([{ x: 0, y: 330 - h / 2 + 12 }, { x: 1280, y: 330 - h / 2 - 12 }, { x: 1280, y: 330 + h / 2 - 12 }, { x: 0, y: 330 + h / 2 + 12 }], true);
    b.fillStyle(this.bannerCol, 0.9 * open);
    b.fillRect(0, 330 - h / 2 - 2, 1280, 3); b.fillRect(0, 330 + h / 2 - 1, 1280, 3);
    speedLines(b, 640, 330, 260, 900, 70, 0xffffff, 0.08 * open, 7, t * 0.3);
    speedLines(b, 640, 330, 320, 900, 40, this.bannerCol, 0.12 * open, 13, -t * 0.2);
  }

  onEvent(e) {
    if (!this.ready) return;
    const fight = this.fight;
    switch (e.t) {
      case 'round': {
        const final = fight.roundWins[0] === 1 && fight.roundWins[1] === 1;
        this.announce(final ? 'FINAL ROUND' : `ROUND ${e.round}`, '#9ff3ff', '', 0.9, final ? 88 : 104);
        break;
      }
      case 'fight': this.announce('FIGHT!', '#ffc14d', '', 0.5, 140, 0x2a0508); break;
      case 'ko': this.announce('K.O.', '#ff4d5e', e.perfect ? 'P E R F E C T' : '', 1.3, 170, 0x1a0004); this.cameras.main.flash(200, 255, 255, 255); break;
      case 'timeup': this.announce('TIME UP', '#ffffff', '', 1.0, 100); break;
      case 'super': this.cutIn(e.slot, e.name, e.charId); break;
      case 'counter': this.announce('COUNTER!', '#ffe27a', '', 0.35, 70); break;
      case 'transform': { const c = CHARACTERS[fight.world.fighters[e.slot].charId]; this.announce(c.transformName, hex(c.transformColor), 'T R A N S F O R M', 0.7, 56); break; }
      case 'hit': {
        if (e.combo >= 2) {
          const s = this.side[e.att];
          s.combo.setText(String(e.combo)).setAlpha(1).setScale(1.5);
          this.tweens.add({ targets: s.combo, scale: 1, duration: 150, ease: 'Quad.Out' });
          s.comboSub.setText(`HITS!   ${fight.world.fighters[e.slot].comboDmg} DMG`).setAlpha(1);
          s.comboT = 1.4;
        }
        break;
      }
      case 'specReady': if (e.slot === 0) Sfx.ui(); break;
    }
  }

  roundResult(winner) {
    const txt = winner === 0 ? 'ROUND WON' : winner === 1 ? 'ROUND LOST' : 'DRAW';
    this.announce(txt, winner === 0 ? '#9ff3ff' : '#ff6a7a', '', 1.1, 80);
  }

  // ── super cut-in with live character art ──────────────────────────
  cutIn(slot, name, charId) {
    const c = CHARACTERS[charId];
    const dir = slot === 0 ? 1 : -1;
    const objs = [];
    const dim = this.add.graphics().setDepth(40); dim.fillStyle(0x000000, 0.55); dim.fillRect(0, 0, 1280, 720); objs.push(dim);
    const band = this.add.graphics().setDepth(41);
    const bandPts = [{ x: 0, y: 262 }, { x: 1280, y: 240 }, { x: 1280, y: 440 }, { x: 0, y: 462 }];
    band.fillGradientStyle(c.accent, c.color, c.accent, c.color, 1, 1, 1, 1);
    band.fillPoints(bandPts, true);
    speedLines(band, slot === 0 ? 300 : 980, 350, 60, 900, 60, 0xffffff, 0.18, 3);
    band.fillStyle(0xffffff, 1); band.fillPoints([{ x: 0, y: 256 }, { x: 1280, y: 234 }, { x: 1280, y: 240 }, { x: 0, y: 262 }], true);
    band.fillPoints([{ x: 0, y: 462 }, { x: 1280, y: 440 }, { x: 1280, y: 446 }, { x: 0, y: 468 }], true);
    objs.push(band);
    const maskG = this.make.graphics({ add: false }); maskG.fillStyle(0xffffff); maskG.fillPoints(bandPts, true);
    const mask = maskG.createGeometryMask();
    const emb = this.add.image(slot === 0 ? 1000 : 280, 350, ensureGlyph(this, c.emblem, 'xxl')).setTint(0xffffff).setAlpha(0.3).setScale(1.6).setDepth(42).setMask(mask);
    objs.push(emb);
    const art = new StickmanView(this, charId, { scale: 3.1, depth: 43, floorY: 999 });
    art.setMask(mask);
    const pose = fakeFighter(charId, dir);
    const m = MOVES[c.special];
    pose.state = 'move'; pose.move = { id: c.special, f: m.startup + 1, data: {} }; pose.transformed = 1;
    const artX = { v: slot === 0 ? -200 : 1480 };
    const n = text(this, slot === 0 ? 560 : 720, 300, c.name, 30, '#ffffff', { font: FONT_TITLE, weight: 'italic 900', ox: slot === 0 ? 0 : 1, spacing: 8, depth: 44 });
    const t = text(this, slot === 0 ? 560 : 720, 366, name, 64, '#ffffff', { font: FONT_TITLE, weight: 'italic 900', ox: slot === 0 ? 0 : 1, strokeThickness: 7, depth: 44 });
    gradientText(t, ['#ffffff', '#fff3b0', hex(mixColor(c.color, 0xffffff, 0.3))]);
    objs.push(n, t);
    band.x = -dir * 1280;
    for (const [o, off, d] of [[n, 700, 40], [t, 900, 70]]) { const fx = o.x; o.x -= dir * off; this.tweens.add({ targets: o, x: fx, duration: 260, delay: d, ease: 'Cubic.Out' }); }
    this.tweens.add({ targets: band, x: 0, duration: 150, ease: 'Cubic.Out' });
    this.tweens.add({ targets: artX, v: slot === 0 ? 300 : 980, duration: 300, ease: 'Cubic.Out' });
    const tick = (_, d) => art.update(pose, artX.v, 610, Math.min(0.05, d / 1000), false);
    this.events.on('update', tick);
    this.tweens.add({
      targets: objs, alpha: 0, duration: 180, delay: 680,
      onUpdate: (tw) => art.setVisible(tw.progress < 0.5),
      onComplete: () => { this.events.off('update', tick); art.destroy(); objs.forEach((o) => o.destroy()); mask.destroy(); },
    });
  }

  // ── VS splash with big character art ──────────────────────────────
  vsSplash() {
    const fight = this.fight;
    const [a, b] = this.chars;
    const objs = [];
    const g = this.add.graphics().setDepth(60);
    g.fillStyle(0x05060b, 1); g.fillRect(0, 0, 1280, 720);
    const left = [{ x: 0, y: 0 }, { x: 700, y: 0 }, { x: 580, y: 720 }, { x: 0, y: 720 }];
    const right = [{ x: 700, y: 0 }, { x: 1280, y: 0 }, { x: 1280, y: 720 }, { x: 580, y: 720 }];
    g.fillGradientStyle(a.accent, a.color, a.accent, a.color, 0.9, 0.35, 0.9, 0.35); g.fillPoints(left, true);
    g.fillGradientStyle(b.color, b.accent, b.color, b.accent, 0.35, 0.9, 0.35, 0.9); g.fillPoints(right, true);
    speedLines(g, 640, 360, 120, 1000, 90, 0xffffff, 0.07, 5);
    g.fillStyle(0xffffff, 1); g.fillPoints([{ x: 692, y: 0 }, { x: 712, y: 0 }, { x: 592, y: 720 }, { x: 572, y: 720 }], true);
    objs.push(g);
    const views = [];
    [[a, 0, left], [b, 1, right]].forEach(([c, s, pts]) => {
      const maskG = this.make.graphics({ add: false }); maskG.fillStyle(0xffffff); maskG.fillPoints(pts, true);
      const mask = maskG.createGeometryMask();
      const emb = this.add.image(s === 0 ? 330 : 950, 250, ensureGlyph(this, c.emblem, 'xxl')).setTint(0xffffff).setAlpha(0.18).setScale(2.4).setDepth(61).setMask(mask);
      objs.push(emb);
      const view = new StickmanView(this, c.id, { scale: 3.3, depth: 62, floorY: 999, villain: s === 1 });
      view.setMask(mask);
      const pose = fakeFighter(c.id, s === 0 ? 1 : -1);
      pose.state = s === 0 ? 'victory' : 'move';
      if (s === 1) { const m = MOVES[c.unique]; pose.move = { id: 'jab1', f: MOVES.jab1.startup + 1, data: {} }; void m; }
      views.push({ view, pose, x: { v: s === 0 ? -300 : 1580 }, tx: s === 0 ? 300 : 980 });
    });
    const n1 = text(this, 60, 560, a.name, 64, '#ffffff', { font: FONT_TITLE, weight: 'italic 900', ox: 0, spacing: 6, depth: 66, strokeThickness: 7 });
    const n2 = text(this, 1220, 560, b.name, 64, '#ffffff', { font: FONT_TITLE, weight: 'italic 900', ox: 1, spacing: 6, depth: 66, strokeThickness: 7 });
    gradientText(n1, ['#ffffff', hex(mixColor(a.color, 0xffffff, 0.3))]);
    gradientText(n2, ['#ffffff', hex(mixColor(b.color, 0xffffff, 0.3))]);
    const t1 = text(this, 64, 612, a.title.toUpperCase(), 18, '#ffffff', { ox: 0, spacing: 4, depth: 66 });
    const t2 = text(this, 1216, 612, b.title.toUpperCase(), 18, '#ffffff', { ox: 1, spacing: 4, depth: 66 });
    const vs = text(this, 640, 350, 'VS', 150, '#ffffff', { font: FONT_TITLE, weight: 'italic 900', strokeThickness: 12, depth: 67 });
    gradientText(vs, ['#ffffff', '#ffe27a', '#ff7a2a']);
    const m = fight.mods;
    const pct = (v) => `+${Math.round((v - 1) * 100)}%`;
    const plate = this.add.graphics().setDepth(65);
    slant(plate, 380, 36, 520, 44, 14, 0x05060b, 0.8);
    const stage = text(this, 640, 58, `STAGE ${fight.cfg.stage}  ·  ${fight.stageName}`, 22, '#ffffff', { font: FONT_TITLE, weight: '900', spacing: 5, depth: 66 });
    const villain = text(this, 1216, 648, fight.level > 1 ? `VILLAIN LV ${fight.level}   ▲HP ${pct(m.hpMul)}   ▲DMG ${pct(m.dmgMul)}   ▲KI ${pct(m.kiRegenMul)}` : 'VILLAIN LV 1', 16, '#ffd0d6', { font: FONT_TITLE, weight: '700', ox: 1, depth: 66 });
    objs.push(n1, n2, t1, t2, vs, plate, stage, villain);
    n1.x -= 500; t1.x -= 500; n2.x += 500; t2.x += 500; vs.setScale(3).setAlpha(0);
    this.tweens.add({ targets: [n1, t1], x: '+=500', duration: 380, delay: 120, ease: 'Cubic.Out' });
    this.tweens.add({ targets: [n2, t2], x: '-=500', duration: 380, delay: 120, ease: 'Cubic.Out' });
    views.forEach((v) => this.tweens.add({ targets: v.x, v: v.tx, duration: 420, ease: 'Cubic.Out' }));
    this.tweens.add({ targets: vs, scale: 1, alpha: 1, duration: 300, delay: 350, ease: 'Back.Out', onStart: () => { Sfx.announce(); this.cameras.main.shake(200, 0.01); } });
    const tick = (_, d) => views.forEach((v) => v.view.update(v.pose, v.x.v, 700, Math.min(0.05, d / 1000), false));
    this.events.on('update', tick);
    this.tweens.add({
      targets: objs, alpha: 0, duration: 350, delay: fight.splash * 1000 - 350,
      onUpdate: (tw) => views.forEach((v) => v.view.setVisible(tw.progress < 0.4)),
      onComplete: () => { this.events.off('update', tick); views.forEach((v) => v.view.destroy()); objs.forEach((o) => o.destroy()); },
    });
  }

  // ── pause / results ───────────────────────────────────────────────
  showPause(on) {
    if (this.overlay) { this.overlay.destroy(); this.overlay = null; }
    if (this.moveOverlay) { this.moveOverlay.destroy(); this.moveOverlay = null; }
    if (!on) return;
    this.pauseSel = 0;
    this.menu = [['RESUME', () => this.fight.togglePause()], ['MOVE LIST', () => { this.moveOverlay = buildMoveOverlay(this, this.fight.cfg.playerChar, false); }], ['RESTART STAGE', () => this.fight.scene.restart({ ...this.fight.cfg, score: this.fight.stageStartScore })], ['QUIT TO TITLE', () => this.fight.quit()]];
    this.buildMenu('PAUSED', '#ffffff', []);
  }

  showResult(won, s) {
    this.resultMode = true;
    const title = s.champion ? 'CHAMPION' : won ? 'STAGE CLEAR' : 'DEFEAT';
    const color = won ? '#9ff3ff' : '#ff4d5e';
    this.menu = won
      ? [[s.champion ? 'ENDLESS MODE' : 'NEXT STAGE', () => this.fight.nextStage()], ['QUIT TO TITLE', () => this.fight.quit()]]
      : [['RETRY STAGE', () => this.fight.retry()], ['QUIT TO TITLE', () => this.fight.quit()]];
    this.pauseSel = 0;
    const lines = [`SCORE   ${s.score.toLocaleString()}`, `BEST COMBO   ${s.maxCombo} HIT${s.maxCombo === 1 ? "" : "S"}`, won ? `NEXT: VILLAIN LV ${this.fight.level + 1}  —  STRONGER · FASTER · SMARTER` : 'The villain grows no weaker. Rise again.'];
    if (s.champion) lines.push('All 8 stages cleared. The series diverges — keep climbing.');
    this.buildMenu(title, color, lines);
    Sfx.announce();
  }

  buildMenu(title, color, lines) {
    if (this.overlay) this.overlay.destroy();
    const cont = this.add.container(0, 0).setDepth(100);
    const g = this.add.graphics();
    g.fillStyle(0x05060b, 0.78); g.fillRect(0, 0, 1280, 720);
    speedLines(g, 640, 300, 200, 900, 60, parseInt(color.slice(1), 16), 0.06, 11);
    slant(g, 300, 150, 640, 430, 30, 0x0c0f20, 0.96);
    g.lineStyle(2, parseInt(color.slice(1), 16), 0.8);
    g.strokePoints([{ x: 330, y: 150 }, { x: 970, y: 150 }, { x: 940, y: 580 }, { x: 300, y: 580 }], true, true);
    g.fillStyle(parseInt(color.slice(1), 16), 1); g.fillPoints([{ x: 330, y: 150 }, { x: 970, y: 150 }, { x: 968, y: 156 }, { x: 329, y: 156 }], true);
    cont.add(g);
    const tt = text(this, 640, 212, title, 64, color, { font: FONT_TITLE, weight: 'italic 900', spacing: 6, strokeThickness: 7 });
    gradientText(tt, ['#ffffff', color]);
    cont.add(tt);
    lines.forEach((l, i) => cont.add(text(this, 640, 274 + i * 30, l, 18, '#cfd8ff')));
    const y0 = 292 + lines.length * 30 + 24;
    this.menuG = this.add.graphics();
    cont.add(this.menuG);
    this.menuY0 = y0; this.menuColor = parseInt(color.slice(1), 16);
    this.menuTexts = this.menu.map(([label], i) => { const t = text(this, 640, y0 + i * 50, label, 26, '#ffffff', { font: FONT_TITLE, weight: 'italic 700', spacing: 3 }); cont.add(t); return t; });
    this.overlay = cont;
    this.refreshMenu();
  }

  refreshMenu() {
    this.menuG.clear();
    this.menuTexts.forEach((t, i) => {
      const on = i === this.pauseSel;
      if (on) { slant(this.menuG, 450, t.y - 20, 380, 40, 12, this.menuColor, 0.85); }
      t.setAlpha(on ? 1 : 0.55).setScale(on ? 1.06 : 1).setColor(on ? '#05060b' : '#ffffff').setStroke(on ? '#ffffff' : '#05060b', on ? 0 : 3);
    });
  }

  onKey(code) {
    if (!this.overlay) return;
    if (this.moveOverlay) {
      if (code === 'Escape' || code === 'KeyJ' || code === 'Enter') { this.moveOverlay.destroy(); this.moveOverlay = null; }
      return;
    }
    if (code === 'KeyW' || code === 'ArrowUp') { this.pauseSel = (this.pauseSel + this.menu.length - 1) % this.menu.length; Sfx.ui(); this.refreshMenu(); }
    if (code === 'KeyS' || code === 'ArrowDown') { this.pauseSel = (this.pauseSel + 1) % this.menu.length; Sfx.ui(); this.refreshMenu(); }
    if (code === 'KeyJ' || code === 'Enter') { Sfx.select(); this.menu[this.pauseSel][1](); }
    if (code === 'Escape' && this.resultMode) this.fight.quit();
  }

  // ── per frame ─────────────────────────────────────────────────────
  update(_, delta) {
    if (!this.ready) return;
    const dt = Math.min(0.1, delta / 1000);
    this.t += dt;
    const fight = this.fight;
    const w = fight.world;
    const g = this.g, back = this.back;
    g.clear(); back.clear();

    this.drawCenter(g, w);

    w.fighters.forEach((f, s) => {
      const c = this.chars[s];
      const side = this.side[s];
      const col = f.transformed > 0 ? c.transformColor : c.color;
      const M = (pts) => mirrorPts(pts, s === 1);

      // ── portrait frame + live bust ──
      const P = this.portraits[s];
      poly(back, M([{ x: 6, y: 2 }, { x: 186, y: 2 }, { x: 158, y: 126 }, { x: 6, y: 126 }]), 0x05060b, 0.9);
      P.fx.clear();
      poly(P.fx, P.pts, mixColor(c.accent, 0x05060b, 0.35), 1);
      speedLines(P.fx, s === 0 ? 96 : 1184, 60, 34, 170, 28, col, 0.16, 3 + s, this.t * 0.2);
      const pr = P.proxy;
      Object.assign(pr, f);
      pr.facing = s === 0 ? 1 : -1; pr.grounded = true; pr.vx = 0; pr.vy = 0; pr.wallTouch = 0; pr.invuln = 0;
      if (f.state === 'ko' || f.state === 'knockdown' || f.state === 'getup') pr.state = 'hitstun';
      if (f.state === 'air' || f.state === 'dash' || f.state === 'land') pr.state = 'idle';
      P.view.update(pr, s === 0 ? 100 : 1180, 272, dt, w.hitstop > 0 && f.state === 'hitstun');
      P.emb.setTint(col);
      polyStroke(g, P.pts, 0xffffff, 0.85, 2);
      polyStroke(g, M([{ x: 6, y: 2 }, { x: 186, y: 2 }, { x: 158, y: 126 }, { x: 6, y: 126 }]), col, 0.7, 2);
      if (f.state === 'hitstun' && f.flash > 0) poly(g, P.pts, 0xffffff, 0.35);

      // ── HP bar ──
      const ratio = Math.max(0, f.hp / f.maxHp);
      if (ratio < this.ghost[s]) { if (this.ghostDelay[s] <= 0) this.ghost[s] = Math.max(ratio, this.ghost[s] - dt * 0.5); else this.ghostDelay[s] -= dt; }
      else { this.ghost[s] = ratio; this.ghostDelay[s] = 0.7; }
      if (f.state === 'hitstun') this.ghostDelay[s] = 0.7;
      const { x, y, w: bw, h, skew } = HP;
      poly(g, M([{ x: x - 4, y: y - 6 }, { x: x + bw + skew + 10, y: y - 6 }, { x: x + bw + 4, y: y + h + 6 }, { x: x - 10, y: y + h + 6 }]), 0x05060b, 0.92);
      hpBar(g, s, 1, 0x1b0d16, 1);
      hpBar(g, s, this.ghost[s], 0xff2e4d, 1);
      const low = ratio < 0.25;
      const fill = low ? (Math.sin(this.t * 14) > 0 ? 0xff3b4d : 0xffa23b) : col;
      hpBar(g, s, ratio, fill, 1);
      hpBar(g, s, ratio, 0xffffff, 0.35, 0, 0.32);
      hpBar(g, s, ratio, 0x000000, 0.25, 0.72, 1);
      for (let k = 1; k < 10; k++) {
        const tx = x + skew * 0.5 + (bw - skew) * (k / 10);
        const pts = M([{ x: tx + skew * 0.5, y }, { x: tx + 2 + skew * 0.5, y }, { x: tx + 2 - skew * 0.5, y: y + h }, { x: tx - skew * 0.5, y: y + h }]);
        poly(g, pts, 0x05060b, k === 5 ? 0.6 : 0.3);
      }
      polyStroke(g, M([{ x: x + skew, y }, { x: x + bw + skew, y }, { x: x + bw, y: y + h }, { x, y: y + h }]), 0xffffff, 0.7, 2);
      side.hpNum.setText(String(Math.ceil(f.hp)));

      // name plate
      poly(back, M([{ x: 178, y: 60 }, { x: 440, y: 60 }, { x: 430, y: 106 }, { x: 170, y: 106 }]), 0x05060b, 0.72);
      poly(back, M([{ x: 178, y: 60 }, { x: 184, y: 60 }, { x: 176, y: 106 }, { x: 170, y: 106 }]), col, 1);

      // round wins (diamonds)
      for (let r = 0; r < 2; r++) {
        const rx = s === 0 ? 560 - r * 22 : 720 + r * 22, ry = 78;
        const won = r < fight.roundWins[s];
        poly(g, [{ x: rx, y: ry - 9 }, { x: rx + 8, y: ry }, { x: rx, y: ry + 9 }, { x: rx - 8, y: ry }], won ? 0xffc14d : 0x1b2038, 1);
        polyStroke(g, [{ x: rx, y: ry - 9 }, { x: rx + 8, y: ry }, { x: rx, y: ry + 9 }, { x: rx - 8, y: ry }], won ? 0xffffff : 0x4a5278, 1, 1.5);
      }

      this.drawGauges(g, back, f, s, c, col, side);

      // combo fade
      if (side.comboT > 0) {
        side.comboT -= dt;
        if (side.comboT < 0.4) { side.combo.setAlpha(Math.max(0, side.comboT / 0.4)); side.comboSub.setAlpha(Math.max(0, side.comboT / 0.4)); }
      }
    });

    this.drawBanner(dt);
    if (this.hintT !== Infinity && this.hint.alpha > 0) { this.hintT -= dt; if (this.hintT < 1) this.hint.setAlpha(Math.max(0, this.hintT)); }
    if (this.dummyText) this.dummyText.setText(`DUMMY: ${fight.dummyLabel}   [T] change   ·   U meter refills in training`);
  }

  drawCenter(g, w) {
    const cx = 640, cy = 50, r = 40;
    poly(g, [{ x: cx - 70, y: 0 }, { x: cx + 70, y: 0 }, { x: cx + 52, y: 96 }, { x: cx - 52, y: 96 }], 0x05060b, 0.9);
    g.fillStyle(0x0d1024, 1); g.fillCircle(cx, cy, r);
    g.lineStyle(3, 0xffc14d, 0.9); g.strokeCircle(cx, cy, r);
    g.lineStyle(1.5, 0xffffff, 0.35); g.strokeCircle(cx, cy, r - 7);
    // rotating tick ring
    const secs = w.timer / 60;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + this.t * 0.4;
      const lit = this.fight.training || i / 24 < secs / 99;
      g.lineStyle(2, lit ? 0xffc14d : 0x2a3050, lit ? 0.9 : 1);
      g.lineBetween(cx + Math.cos(a) * (r + 4), cy + Math.sin(a) * (r + 4), cx + Math.cos(a) * (r + 9), cy + Math.sin(a) * (r + 9));
    }
    const s = Math.ceil(secs);
    this.timer.setText(this.fight.training ? '∞' : String(s));
    this.timer.setScale(s <= 10 && !this.fight.training ? 1 + Math.max(0, Math.sin(this.t * 10)) * 0.08 : 1);
    slant(g, 568, 94, 136, 22, 6, 0x05060b, 0.85);
  }

  drawGauges(g, back, f, s, c, col, side) {
    const M = (pts) => mirrorPts(pts, s === 1);
    const Y = GAUGE_Y;
    // plate
    poly(back, M([{ x: 8, y: Y - 16 }, { x: 560, y: Y - 16 }, { x: 540, y: Y + 64 }, { x: 8, y: Y + 64 }]), 0x05060b, 0.78);
    poly(back, M([{ x: 8, y: Y - 16 }, { x: 560, y: Y - 16 }, { x: 559, y: Y - 13 }, { x: 8, y: Y - 13 }]), col, 0.9);

    // Ki level orb (4 segments)
    const ox = s === 0 ? 56 : 1224, oy = Y + 30;
    g.fillStyle(0x0d1024, 1); g.fillCircle(ox, oy, 28);
    const lvl = Math.floor(f.ki / 25);
    for (let k = 0; k < 4; k++) {
      const a0 = -Math.PI / 2 + k * (Math.PI / 2) + 0.08, a1 = a0 + Math.PI / 2 - 0.16;
      const fillAmt = Math.max(0, Math.min(1, (f.ki - k * 25) / 25));
      g.lineStyle(6, 0x1b2038, 1); g.beginPath(); g.arc(ox, oy, 24, a0, a1); g.strokePath();
      if (fillAmt > 0) { g.lineStyle(6, fillAmt >= 1 ? col : mixColor(col, 0x000000, 0.4), 1); g.beginPath(); g.arc(ox, oy, 24, a0, a0 + (a1 - a0) * fillAmt); g.strokePath(); }
    }
    side.kiNum.setText(String(lvl));

    // Ki bar (4 chunks)
    const bx = 96, by = Y + 18, bw = 300, bh = 16, sk = 8, gap = 6;
    const cw = (bw - gap * 3) / 4;
    for (let k = 0; k < 4; k++) {
      const x0 = bx + k * (cw + gap);
      const fillAmt = Math.max(0, Math.min(1, (f.ki - k * 25) / 25));
      poly(g, M([{ x: x0 + sk, y: by }, { x: x0 + cw + sk, y: by }, { x: x0 + cw, y: by + bh }, { x: x0, y: by + bh }]), 0x1b2038, 1);
      if (fillAmt > 0) {
        const fw = cw * fillAmt;
        const full = f.ki >= 100;
        const cc = full ? (Math.sin(this.t * 10) > 0 ? c.transformColor : 0xffffff) : fillAmt >= 1 ? col : mixColor(col, 0xffffff, 0.3);
        poly(g, M([{ x: x0 + sk, y: by }, { x: x0 + fw + sk, y: by }, { x: x0 + fw, y: by + bh }, { x: x0, y: by + bh }]), cc, 1);
        poly(g, M([{ x: x0 + sk, y: by }, { x: x0 + fw + sk, y: by }, { x: x0 + fw + sk * 0.7, y: by + 5 }, { x: x0 + sk * 0.7, y: by + 5 }]), 0xffffff, 0.35);
      }
    }
    if (f.transformed > 0) {
      const tw = bw * (f.transformed / (60 * 12));
      poly(g, M([{ x: bx, y: by + bh + 5 }, { x: bx + tw, y: by + bh + 5 }, { x: bx + tw, y: by + bh + 9 }, { x: bx, y: by + bh + 9 }]), c.transformColor, 1);
    }

    // U super gauge (ring)
    const ux = s === 0 ? 452 : 828, uy = Y + 26;
    const full = f.spec >= 100;
    g.fillStyle(0x0d1024, 1); g.fillCircle(ux, uy, 24);
    g.lineStyle(5, 0x1b2038, 1); g.strokeCircle(ux, uy, 21);
    g.lineStyle(5, full ? (Math.sin(this.t * 12) > 0 ? 0xffffff : col) : 0xffc14d, 1);
    g.beginPath(); g.arc(ux, uy, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, f.spec / 100)); g.strokePath();
    if (full) speedLines(g, ux, uy, 28, 44, 16, col, 0.7, 9, this.t * 2);
    side.uLbl.setColor(full ? '#ffffff' : '#8e97bd');

    // I skill cooldown
    const ix = s === 0 ? 510 : 770, iy = Y + 26;
    const cd = f.uniqueCd / (MOVES[c.unique].cooldown || 1);
    const ready = cd <= 0 && f.ki >= MOVES[c.unique].cost;
    g.fillStyle(0x0d1024, 1); g.fillCircle(ix, iy, 16);
    g.lineStyle(4, ready ? col : 0x3a4262, 1);
    g.beginPath(); g.arc(ix, iy, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - cd)); g.strokePath();
    side.iLbl.setColor(ready ? '#ffffff' : '#5a6078');

    // status line
    const st = [];
    if (full) st.push('U · SUPER READY');
    if (f.ki >= 100 && !f.transformed) st.push('O · TRANSFORM READY');
    if (f.transformed > 0) st.push(`${c.transformName}  ${Math.ceil(f.transformed / 60)}s`);
    side.status.setText(st.join('    ')).setColor(f.transformed > 0 || f.ki >= 100 ? hex(c.transformColor) : '#ffffff');
    side.status.setAlpha(st.length ? 0.75 + Math.sin(this.t * 8) * 0.25 : 0);
  }
}

// HP bar layer; v0..v1 = vertical band (for highlight / shade strips)
function hpBar(g, side, ratio, color, alpha, v0 = 0, v1 = 1) {
  if (ratio <= 0) return;
  const { x, y, w, h, skew } = HP;
  const len = (w - skew) * Math.min(1, ratio) + skew;
  // bar drains toward the portrait side (outer edge stays anchored at the portrait)
  const ya = y + h * v0, yb = y + h * v1;
  const sa = skew * (1 - v0), sb = skew * (1 - v1);
  let pts = [{ x: x + sa, y: ya }, { x: x + sa + len - skew, y: ya }, { x: x + sb + len - skew, y: yb }, { x: x + sb, y: yb }];
  if (side === 1) pts = pts.map((p) => ({ x: 1280 - p.x, y: p.y }));
  g.fillStyle(color, alpha);
  g.fillPoints(pts, true);
}
