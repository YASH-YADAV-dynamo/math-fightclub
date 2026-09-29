// Glue between the pure sim and Phaser: interpolation, stickman views, event → fx/sfx, camera.

import { STAGE } from '../sim/constants.js';
import { CHARACTERS } from '../sim/characters.js';
import { MOVES } from '../sim/moves.js';
import { StickmanView } from './Stickman.js';
import { Effects } from './Effects.js';
import { Sfx } from './Sfx.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class FightRenderer {
  constructor(scene, world, opts = {}) {
    this.scene = scene;
    this.sound = opts.sound !== false;
    this.villainSlot = opts.villainSlot ?? 1;
    this.onEvent = opts.onEvent || (() => {});
    this.cameraFx = opts.camera !== false;
    this.fx = new Effects(scene);
    this.views = [null, null];
    this.prev = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
    this.zoom = 1; this.zoomKick = 0;
    this.cam = scene.cameras.main;
    this.cam.setBounds(0, 0, STAGE.width, STAGE.height);
    this.camX = STAGE.width / 2; this.camY = STAGE.height / 2;
    this.focus = null; this.focusT = 0;
    this.setWorld(world);
  }

  setWorld(world) {
    this.world = world;
    world.fighters.forEach((f, i) => {
      const v = this.views[i];
      if (!v || v.char.id !== f.charId) {
        if (v) v.destroy();
        this.views[i] = new StickmanView(this.scene, f.charId, { villain: i === this.villainSlot, depth: 10 + i * 4 });
      } else v.reset();
      this.prev[i] = { x: f.x, y: f.y };
    });
    this.fx.clearAll();
  }

  beforeStep() {
    this.world.fighters.forEach((f, i) => { this.prev[i].x = f.x; this.prev[i].y = f.y; });
  }

  sfx(name, ...args) { if (this.sound) Sfx[name](...args); }

  shake(ms, intensity) { if (this.cameraFx) this.cam.shake(ms, intensity, true); }

  handleEvents(events) {
    const w = this.world;
    for (const e of events) {
      const f = e.slot !== undefined ? w.fighters[e.slot] : null;
      switch (e.t) {
        case 'hit': {
          this.fx.hitSpark(e);
          const def = w.fighters[e.slot];
          this.views[e.slot].impulse(e.dir, def.hitStrength, def.facing);
          this.sfx('hit', e.heavy);
          if (e.heavy) { this.shake(140, 0.007); this.zoomKick = Math.min(0.06, this.zoomKick + 0.03); }
          else this.shake(60, 0.0025);
          break;
        }
        case 'block': this.fx.blockSpark(e); this.sfx('block'); if (e.heavy) this.shake(60, 0.002); break;
        case 'armor': this.fx.spawn('‖', 'lg', e.x, e.y, { color: 0xffd27a, scale: 0.7, scale1: 1.3, life: 0.25 }); this.sfx('block'); break;
        case 'swing': this.sfx('swing', e.heavy); break;
        case 'jump': this.fx.dust(e.x, e.y, 5, 120); this.sfx('jump'); break;
        case 'djump':
          this.views[e.slot].doFlip(1);
          this.fx.ring(e.x, e.y - 10, '∘', CHARACTERS[f.charId].color, 10, 260, 'sm', 0.3);
          this.sfx('djump');
          break;
        case 'walljump':
          this.views[e.slot].doFlip(-1);
          this.fx.dust(e.x - e.dir * 20, e.y - 50, 6, 100);
          this.sfx('djump');
          break;
        case 'wallslide': this.fx.dust(e.x, e.y, 1, 30, 0xb8c0d8, 40); break;
        case 'land': this.fx.dust(e.x, e.y, e.hard ? 12 : 4, e.hard ? 260 : 120); this.sfx('land', e.hard); if (e.hard) this.shake(80, 0.003); break;
        case 'dash': this.fx.dust(e.x, e.y, e.slide ? 8 : 6, 200); this.sfx('dash'); break;
        case 'fastfall': this.fx.spawn('↓', 'sm', f.x, f.y - 140, { color: 0xffffff, vy: 200, life: 0.2, alpha: 0.7 }); break;
        case 'move': this.fx.moveName(f, e.name); break;
        case 'super':
          this.sfx('super');
          this.focus = e.slot; this.focusT = 0.9;
          break;
        case 'beamCharge': this.sfx('charge'); break;
        case 'beamFire': this.sfx('beam'); this.shake(300, 0.003); break;
        case 'transformStart': this.sfx('charge'); break;
        case 'chargeStart': if (this.sound) Sfx.chargeLoop(e.slot, true); break;
        case 'chargeEnd': if (this.sound) Sfx.chargeLoop(e.slot, false); break;
        case 'kiMax': {
          const c = CHARACTERS[f.charId];
          this.fx.ring(e.x, e.y - 70, c.emblem, c.color, 14, 600, 'sm', 0.4);
          this.fx.floatText('MAX KI', e.x, e.y - 190, 26, '#ffffff', 0.5);
          this.sfx('select');
          break;
        }
        case 'transform': {
          const c = CHARACTERS[f.charId];
          this.fx.powerPillar(e.x, e.y, c.transformColor, [...c.glyphs, 'Λ', '∧']);
          this.fx.ring(e.x, e.y - 70, c.emblem, c.transformColor, 20, 900, 'md', 0.6);
          this.fx.ring(e.x, e.y - 70, '∞', 0xffffff, 12, 500, 'sm', 0.5);
          this.sfx('transform'); this.shake(300, 0.008);
          break;
        }
        case 'untransform': this.fx.ring(f.x, f.y - 70, '·', 0xffffff, 12, 300, 'sm', 0.4); break;
        case 'clash':
          for (let i = 0; i < (e.beam ? 3 : 8); i++) this.fx.spawn(['≠', '±', '∓', '*'][i % 4], 'md', e.x, e.y, { color: 0xffffff, vx: (Math.random() - 0.5) * 900, vy: (Math.random() - 0.5) * 900, drag: 4, life: 0.35 });
          if (!e.beam) this.sfx('clash'); else if (Math.random() < 0.3) this.shake(60, 0.004);
          break;
        case 'wallbounce':
          this.fx.ring(e.x, e.y, '‖', 0xffffff, 8, 420, 'sm', 0.3);
          this.shake(160, 0.009); this.sfx('land', true);
          break;
        case 'groundbounce':
          this.fx.dust(e.x, e.y, 14, 320, 0xb8c0d8, 220);
          this.shake(140, 0.007); this.sfx('land', true);
          break;
        case 'quake':
          this.fx.quake(e.x, e.y, e.power, CHARACTERS[w.fighters[e.slot].charId].color);
          this.shake(200 + e.power * 150, 0.006 + e.power * 0.004); this.sfx('quake');
          break;
        case 'spike': this.sfx('quake'); this.shake(90, e.big ? 0.012 : 0.004); break;
        case 'blink': {
          const c = CHARACTERS[f.charId];
          if (!e.quiet) {
            this.fx.ring(e.fromX, e.fromY - 70, '∫', c.color, 8, 280, 'sm', 0.35);
            this.fx.spawn('∫', 'xl', e.x, e.y - 70, { color: c.color, scale: 1.4, scale1: 0.6, life: 0.3 });
          } else {
            this.fx.spawn(['3', '.', '1', '4', '1', '5', '9', '2'][(Math.random() * 8) | 0], 'lg', e.x, e.y - 70, { color: c.color, vy: -120, life: 0.35 });
          }
          this.sfx('blink');
          break;
        }
        case 'blast': this.shake(420, 0.016); this.sfx('ko'); break;
        case 'impact':
          this.fx.ring(e.x, e.y - 20, e.glyph, 0xffffff, e.big ? 16 : 6, e.big ? 700 : 300, e.big ? 'md' : 'sm', 0.4);
          if (e.big) { this.shake(300, 0.014); this.sfx('quake'); }
          break;
        case 'counter':
          this.fx.spawn('%', 'xl', e.x, e.y, { color: CHARACTERS[f.charId].color, scale: 0.5, scale1: 1.5, life: 0.4, ease: 'pop' });
          this.sfx('counter');
          break;
        case 'ko':
          this.sfx('ko');
          this.shake(500, 0.015);
          this.focus = e.slot; this.focusT = 1.6;
          break;
        case 'round': case 'fight': this.sfx('announce'); break;
      }
      this.onEvent(e);
    }
  }

  render(dt, alpha) {
    const w = this.world;
    const frozen = w.hitstop > 0 || w.superFreeze > 0;
    this.fx.beginFrame(dt, frozen);
    let charging = false;
    w.fighters.forEach((f, i) => {
      const p = this.prev[i];
      const x = p.x + (f.x - p.x) * alpha;
      const y = p.y + (f.y - p.y) * alpha;
      const v = this.views[i];
      v.update(f, x, y, dt, frozen);
      const W = v.ragdoll ? null : v.worldJoints(f.facing);
      const isSuper = f.state === 'move' && (MOVES[f.move.id].super || f.move.id === 'transform' || f.move.id === 'beam');
      const inten = f.state === 'charge' ? 1 : isSuper ? 0.85 : f.transformed > 0 ? 0.6 : 0;
      this.fx.aura(f, W, inten, dt, frozen);
      if (f.state === 'charge') { charging = true; if (!frozen) this.fx.chargeFx(f, dt); }
      if (!frozen) this.fx.fighterFx(f, dt, W);
    });
    if (charging && this.cameraFx && !this.cam.shakeEffect.isRunning) this.cam.shake(120, 0.0022);
    this.fx.syncProjectiles(w, dt, frozen);
    this.fx.update(dt, frozen && w.superFreeze > 0);
    this.updateCamera(dt);
  }

  updateCamera(dt) {
    if (!this.cameraFx) return;
    const [a, b] = this.world.fighters;
    let mx = (a.x + b.x) / 2;
    let my = Math.min(a.y, b.y);
    const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) * 0.4;
    // frame both fighters with margin: close fights get a big cinematic zoom
    let tz = clamp(STAGE.width / (dist + 560), 1.0, 1.38);
    if (this.focusT > 0) {
      this.focusT -= dt;
      const f = this.world.fighters[this.focus];
      mx = f.x; my = f.y; tz = 1.5;
    }
    this.zoomKick = Math.max(0, this.zoomKick - dt * 0.25);
    this.zoom += (tz - this.zoom) * Math.min(1, dt * 4);
    const z = this.zoom + this.zoomKick;
    this.cam.setZoom(z);
    const hw = STAGE.width / 2 / z, hh = STAGE.height / 2 / z;
    const tx = clamp(mx, hw, STAGE.width - hw);
    const ty = clamp(Math.min(STAGE.height - hh, my - 60), hh, STAGE.height - hh);
    this.camX += (tx - this.camX) * Math.min(1, dt * 6);
    this.camY += (ty - this.camY) * Math.min(1, dt * 6);
    this.cam.centerOn(this.camX, this.camY);
  }

  destroy() {
    Sfx.chargeLoop(0, false); Sfx.chargeLoop(1, false);
    this.views.forEach((v) => v && v.destroy());
    this.fx.clearAll();
  }
}
