import Phaser from 'phaser';
import { createWorld, step } from '../sim/World.js';
import { DT, IN } from '../sim/constants.js';
import { AIController } from '../ai/AIController.js';
import { KeyboardController } from '../input/Keyboard.js';
import { Background, THEMES } from '../render/Background.js';
import { FightRenderer } from '../render/FightRenderer.js';
import { Sfx } from '../render/Sfx.js';

export const LADDER_LENGTH = 8;

// Villain power curve: each stage the CPU gets tougher AND stronger.
export function villainMods(level) {
  const l = level - 1;
  return {
    hpMul: Math.min(1.9, 1 + 0.085 * l),
    dmgMul: Math.min(1.65, 1 + 0.065 * l),
    kiRegenMul: 1 + 0.12 * l,
    ki: Math.min(100, 15 + 10 * l),
    spec: Math.min(90, 8 * l),
  };
}

const DUMMY_MODES = ['STAND', 'GUARD', 'JUMP', 'CPU'];

export class FightScene extends Phaser.Scene {
  constructor() { super('Fight'); }

  init(data) {
    this.cfg = { mode: 'arcade', playerChar: 'sigma', stage: 1, score: 0, ladder: ['pi', 'nabla', 'omega', 'sigma'], ...data };
  }

  create() {
    const { mode, stage, ladder } = this.cfg;
    this.training = mode === 'training';
    this.themeIndex = this.training ? 2 : (stage - 1) % THEMES.length;
    this.stageName = THEMES[this.themeIndex].name;
    this.oppChar = ladder[(stage - 1) % ladder.length];
    this.level = this.training ? 1 : stage;
    this.mods = this.training ? { hpMul: 1, dmgMul: 1 } : villainMods(this.level);

    this.cameras.main.setZoom(1).centerOn(640, 360);
    this.bg = new Background(this, this.themeIndex);
    this.kb = new KeyboardController(this);
    this.roundWins = [0, 0];
    this.round = 1;
    this.paused = false;
    this.slowmo = 0;
    this.acc = 0;
    this.splash = this.training ? 0 : 2.6;
    this.roundEnding = false;
    this.matchOver = false;
    this.maxCombo = 0;
    this.dummyMode = 0;
    this.stageStartScore = this.cfg.score;

    this.world = this.makeWorld();
    this.fr = new FightRenderer(this, this.world, { villainSlot: 1, onEvent: (e) => this.onEvent(e) });

    this.scene.launch('Hud', { fight: this });
    this.scene.bringToTop('Hud');
    this.hud = this.scene.get('Hud');

    this.input.keyboard.on('keydown-ESC', () => { if (!this.matchOver) this.togglePause(); });
    this.input.keyboard.on('keydown-P', () => { if (!this.matchOver) this.togglePause(); });
    this.input.keyboard.on('keydown-M', () => Sfx.toggleMute());
    this.input.keyboard.on('keydown-T', () => { if (this.training) { this.dummyMode = (this.dummyMode + 1) % DUMMY_MODES.length; } });
    this.events.once('shutdown', () => { this.scene.stop('Hud'); this.fr.destroy(); this.bg.destroy(); });
    Sfx.unlock();
  }

  get dummyLabel() { return DUMMY_MODES[this.dummyMode]; }

  makeWorld() {
    const seed = (this.cfg.stage * 7919 + this.round * 104729 + ((Math.random() * 1e6) | 0)) | 0;
    this.ai = new AIController(1, this.training ? 5 : this.level, seed ^ 0x5bd1e995);
    return createWorld({
      p1: { charId: this.cfg.playerChar, ki: 40 },
      p2: { charId: this.oppChar, ...this.mods },
      seed, round: this.round, training: this.training,
    });
  }

  togglePause() {
    this.paused = !this.paused;
    this.kb.latched = 0;
    this.hud.showPause(this.paused);
  }

  dummyInput() {
    const w = this.world, me = w.fighters[1], op = w.fighters[0];
    const away = op.x < me.x ? IN.RIGHT : IN.LEFT;
    switch (DUMMY_MODES[this.dummyMode]) {
      case 'GUARD': {
        const low = op.state === 'move' && ['sweep', 'slidekick'].includes(op.move.id);
        const lowProj = w.projectiles.some((p) => p.owner === 0 && (p.type === 'wave' || p.type === 'delta_shock'));
        return away | (low || lowProj ? IN.DOWN : 0);
      }
      case 'JUMP': return w.frame % 50 < 10 ? IN.JUMP : 0;
      case 'CPU': return this.ai.update(w);
      default: this.ai.update(w); return 0;
    }
  }

  onEvent(e) {
    if (e.t === 'hit' && e.att === 0) this.maxCombo = Math.max(this.maxCombo, e.combo);
    if (e.t === 'hit' && e.att === 0 && !this.training) this.cfg.score += e.dmg * 10;
    if (e.t === 'ko') this.slowmo = 1.5;
    this.hud.onEvent(e);
  }

  update(_, delta) {
    const dt = Math.min(0.1, delta / 1000);
    if (this.paused) return;
    this.bg.update(dt);

    let simDt = dt;
    if (this.slowmo > 0) { this.slowmo -= dt; simDt *= 0.3; }

    if (this.splash > 0) {
      this.splash -= dt;
      this.fr.render(dt, 1);
      return;
    }

    this.acc += simDt;
    let n = 0;
    while (this.acc >= DT && n++ < 5) {
      this.fr.beforeStep();
      const p1 = this.kb.update();
      const p2 = this.training ? this.dummyInput() : this.ai.update(this.world);
      if (this.training) { const f = this.world.fighters[0]; f.spec = Math.min(100, f.spec + 0.35); }
      step(this.world, [p1, p2]);
      this.fr.handleEvents(this.world.events);
      this.acc -= DT;
    }
    if (n >= 5) this.acc = 0;
    this.fr.render(simDt, this.acc / DT);

    if (this.world.phase === 'end' && !this.roundEnding) this.roundEnd();
  }

  roundEnd() {
    this.roundEnding = true;
    const w = this.world;
    const winner = w.winner;
    if (winner >= 0) this.roundWins[winner]++;
    if (winner === 0) {
      const me = w.fighters[0];
      this.cfg.score += Math.round(me.hp * 5 + (w.timer / 60) * 50 + (me.hp === me.maxHp ? 20000 : 0));
    }
    const done = this.roundWins[0] >= 2 || this.roundWins[1] >= 2;
    if (!done) {
      this.hud.roundResult(winner);
      this.time.delayedCall(1700, () => {
        this.round++;
        this.world = this.makeWorld();
        this.fr.setWorld(this.world);
        this.roundEnding = false;
        this.acc = 0;
      });
      return;
    }
    this.matchOver = true;
    const won = this.roundWins[0] >= 2;
    this.time.delayedCall(600, () => this.hud.showResult(won, {
      score: this.cfg.score, stage: this.cfg.stage, maxCombo: this.maxCombo,
      champion: won && this.cfg.stage === LADDER_LENGTH,
    }));
  }

  nextStage() { this.scene.restart({ ...this.cfg, stage: this.cfg.stage + 1 }); }
  retry() { this.scene.restart({ ...this.cfg, score: Math.floor(this.stageStartScore / 2) }); }
  quit() { this.scene.stop('Hud'); this.scene.start('Title'); }
}
