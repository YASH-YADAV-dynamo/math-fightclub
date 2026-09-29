// Visual effects built entirely from mathematical glyphs: hit sparks, beams,
// projectiles, dust, auras. Purely cosmetic — never feeds back into the sim.

import Phaser from 'phaser';
import { ensureGlyph, SPARK_GLYPHS, DUST_GLYPHS } from './GlyphCache.js';
import { CHARACTERS } from '../sim/characters.js';
import { STAGE } from '../sim/constants.js';
import { MOVES } from '../sim/moves.js';
import { mixColor } from './Stickman.js';

const rnd = (a, b) => a + Math.random() * (b - a);
export const ELEMENT = { sigma: 'water', pi: 'air', nabla: 'earth', omega: 'fire' };
const ELEMENT_GLYPHS = { water: ['~', '≈', '∽'], air: ['∘', '○', '∘'], earth: ['▲', '◆', '■'], fire: ['∧', 'Λ', '^'] };
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.pool = [];
    this.projViews = new Map();
    this.band = scene.add.graphics().setDepth(19).setBlendMode(Phaser.BlendModes.ADD);
    this.auraG = scene.add.graphics().setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
    this.bolts = [];
    this.time = 0;
    this.texts = [];
  }

  // ── particles ───────────────────────────────────────────────────────
  spawn(glyph, size, x, y, o = {}) {
    const key = ensureGlyph(this.scene, glyph, size);
    let img = this.pool.pop();
    if (img) img.setTexture(key).setVisible(true).setActive(true);
    else img = this.scene.add.image(0, 0, key);
    img.setPosition(x, y).setTint(o.color ?? 0xffffff).setAlpha(o.alpha ?? 1)
      .setDepth(o.depth ?? 20).setBlendMode(o.add === false ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD)
      .setRotation(o.rot ?? 0).setScale(o.scale ?? 1);
    if (o.flipX) img.setFlipX(true); else img.setFlipX(false);
    const p = {
      img, x, y, vx: o.vx ?? 0, vy: o.vy ?? 0, g: o.g ?? 0, drag: o.drag ?? 0,
      life: o.life ?? 0.5, age: 0, vr: o.vr ?? 0, rot: o.rot ?? 0,
      s0: o.scale ?? 1, s1: o.scale1 ?? (o.scale ?? 1), a0: o.alpha ?? 1, a1: o.alpha1 ?? 0,
      target: o.target || null, ease: o.ease || 'lin', sy: o.sy || 1, wob: o.wob || null,
    };
    this.parts.push(p);
    return p;
  }

  update(dt, frozen) {
    if (!frozen) {
      for (const p of this.parts) {
        p.age += dt;
        const t = Math.min(1, p.age / p.life);
        if (p.target) {
          p.x += (p.target.x - p.x) * Math.min(1, dt * 9);
          p.y += (p.target.y - p.y) * Math.min(1, dt * 9);
        } else {
          p.vy += p.g * dt;
          if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
          p.x += p.vx * dt; p.y += p.vy * dt;
        }
        p.rot += p.vr * dt;
        const e = p.ease === 'out' ? 1 - (1 - t) * (1 - t) : p.ease === 'pop' ? Math.sin(Math.min(1, t * 1.6) * Math.PI / 2) : t;
        const sc = p.s0 + (p.s1 - p.s0) * e;
        const wy = p.wob ? Math.sin(p.wob.ph + p.age * p.wob.freq) * p.wob.amp : 0;
        p.img.setPosition(p.x, p.y + wy).setRotation(p.rot).setScale(sc, sc * p.sy).setAlpha(p.a0 + (p.a1 - p.a0) * t);
      }
      const keep = [];
      for (const p of this.parts) {
        if (p.age >= p.life) { p.img.setVisible(false).setActive(false); this.pool.push(p.img); }
        else keep.push(p);
      }
      this.parts = keep;
    }
    for (const t of this.texts) {
      if (frozen) continue;
      t.age += dt;
      t.obj.y -= dt * 40;
      t.obj.setAlpha(Math.max(0, 1 - Math.max(0, t.age - t.hold) / 0.4));
    }
    this.texts = this.texts.filter((t) => { if (t.age > t.hold + 0.4) { t.obj.destroy(); return false; } return true; });
  }

  // ── event handlers ──────────────────────────────────────────────────
  hitSpark(e) {
    const c = CHARACTERS[e.charId];
    const col = c.color;
    const n = e.heavy ? 14 : 8;
    // headline glyph (the move's own symbol)
    this.spawn(e.glyph, e.heavy ? 'xl' : 'lg', e.x, e.y, { color: mixColor(col, 0xffffff, 0.4), scale: 0.4, scale1: e.heavy ? 1.25 : 1, life: e.heavy ? 0.45 : 0.3, ease: 'pop', vr: rnd(-3, 3), depth: 25 });
    // radiating sparks: * × + % & …
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.3, 0.3);
      const sp = rnd(260, e.heavy ? 820 : 520);
      this.spawn(pick(SPARK_GLYPHS), pick(['xs', 'sm', 'sm']), e.x, e.y, {
        color: i % 3 === 0 ? 0xffffff : col, vx: Math.cos(a) * sp + e.dir * 120, vy: Math.sin(a) * sp, drag: 5,
        life: rnd(0.25, 0.5), vr: rnd(-12, 12), scale: 1, scale1: 0.4, depth: 24,
      });
    }
    // impact ring of dots
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.spawn('·', 'md', e.x, e.y, { color: 0xffffff, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, drag: 9, life: 0.22, depth: 23 });
    }
    // damage readout, in "math" style
    if (e.dmg >= 20) this.floatText(`−${e.dmg}`, e.x + e.dir * 20, e.y - 40, e.heavy ? 30 : 22, e.heavy ? '#ffffff' : '#ffe9a8', 0.45);
  }

  blockSpark(e) {
    this.spawn('≠', 'lg', e.x, e.y, { color: 0x9fd8ff, scale: 0.6, scale1: 1.1, life: 0.28, ease: 'pop', depth: 25 });
    for (let i = 0; i < 6; i++) {
      const a = rnd(-1.2, 1.2) + (Math.random() < 0.5 ? 0 : Math.PI);
      this.spawn(pick(['|', '‖', '⊥']), 'sm', e.x, e.y, { color: 0x9fd8ff, vx: Math.cos(a) * 360, vy: Math.sin(a) * 360, drag: 7, life: 0.3, depth: 24 });
    }
  }

  dust(x, y, n = 5, spread = 160, col = 0xb8c0d8, up = 120) {
    for (let i = 0; i < n; i++) {
      this.spawn(pick(DUST_GLYPHS), pick(['xs', 'sm']), x + rnd(-12, 12), y - 4, {
        color: col, vx: rnd(-spread, spread), vy: -rnd(20, up), drag: 4, g: -40, life: rnd(0.3, 0.6), alpha: 0.7, scale: 1, scale1: 1.6, add: true, depth: 8,
      });
    }
  }

  ring(x, y, glyph, color, count = 16, speed = 600, size = 'sm', life = 0.45) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this.spawn(glyph, size, x, y, { color, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, drag: 3.5, life, vr: rnd(-4, 4), depth: 22 });
    }
  }

  quake(x, y, power, color) {
    const n = Math.round(10 * power);
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1;
      this.spawn(pick(['Δ', '▲', '∂', '·']), pick(['sm', 'md']), x + dir * rnd(10, 60), y - 6, {
        color: i % 3 ? color : 0xffffff, vx: dir * rnd(150, 520) * power, vy: -rnd(200, 620) * power, g: 1800, life: rnd(0.4, 0.8), vr: rnd(-8, 8), depth: 21,
      });
    }
    this.dust(x, y, 10, 380 * power, 0xa0a8c0, 200);
  }

  floatText(str, x, y, size, color, hold = 0.6, font = 'Orbitron') {
    const obj = this.scene.add.text(x, y, str, {
      fontFamily: font, fontSize: `${size}px`, fontStyle: '900', color,
      stroke: '#07070d', strokeThickness: Math.max(3, size / 6),
    }).setOrigin(0.5).setDepth(40);
    this.texts.push({ obj, age: 0, hold });
    return obj;
  }

  moveName(f, name) {
    const c = CHARACTERS[f.charId];
    const col = '#' + mixColor(c.color, 0xffffff, 0.3).toString(16).padStart(6, '0');
    this.floatText(name, f.x, f.y - 175, 18, col, 0.55, 'Rajdhani');
  }

  // ── DBZ-style aura: flame silhouette + glyph flame tongues + lightning ─
  beginFrame(dt, frozen) {
    if (!frozen) this.time += dt;
    this.auraG.clear();
    for (const b of this.bolts) {
      if (!frozen) b.life -= dt;
      for (const [w, col, al] of [[7, b.color, 0.35], [2.5, 0xffffff, 0.95]]) {
        this.auraG.lineStyle(w, col, al * Math.max(0, b.life / b.max));
        this.auraG.strokePoints(b.pts, false);
      }
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);
  }

  aura(f, W, inten, dt, frozen) {
    if (inten <= 0 || !W) return;
    const c = CHARACTERS[f.charId];
    const col = f.transformed > 0 ? c.transformColor : c.color;
    const g = this.auraG;
    const t = this.time;
    const cx = (W.hip[0] + W.neck[0]) / 2, cy = (W.hip[1] + W.neck[1]) / 2 + 8;
    const N = 30;
    for (const [scale, alpha] of [[1.0, 0.09], [0.78, 0.13], [0.55, 0.12]]) {
      const pts = [];
      for (let k = 0; k < N; k++) {
        const a = (k / N) * Math.PI * 2;
        const up = -Math.sin(a);
        const flick = Math.sin(t * 17 + k * 1.7) * 0.5 + Math.sin(t * 29 + k * 3.3) * 0.5;
        let r = 1 + flick * 0.07;
        if (up > 0) r += up * (0.3 + 0.3 * flick) * inten;
        if (up > 0.25 && k % 2 === 0) r += 0.28 * up * inten; // pointed flame tongues
        const grow = 0.75 + 0.25 * inten;
        pts.push({ x: cx + Math.cos(a) * 46 * scale * r * grow, y: cy + Math.sin(a) * 86 * scale * r * grow - (up > 0 ? up * 26 * scale * inten : 0) });
      }
      g.fillStyle(col, alpha * inten);
      g.fillPoints(pts, true);
    }
    if (frozen) return;
    const joints = ['footF', 'footB', 'kneeF', 'kneeB', 'hip', 'handF', 'handB', 'neck', 'head', 'elbowF', 'elbowB'];
    let n = 55 * inten * dt;
    while (n > 0) {
      if (n < 1 && Math.random() > n) break;
      n -= 1;
      const j = W[pick(joints)];
      this.spawn(pick(['Λ', '∧', '^', '∧', c.emblem]), pick(['sm', 'md', 'sm']), j[0] + rnd(-16, 16), j[1] + rnd(-8, 8), {
        color: Math.random() < 0.3 ? 0xffffff : col, vy: -rnd(260, 540) * (0.6 + 0.4 * inten), vx: rnd(-30, 30),
        life: rnd(0.22, 0.42), sy: 1.9, scale: 1, scale1: 0.25, alpha: 0.95, alpha1: 0, depth: 9,
      });
    }
    if ((f.transformed > 0 || f.state === 'charge') && Math.random() < dt * (f.state === 'charge' ? 16 : 7)) {
      let [x, y] = W[pick(joints)];
      const pts = [{ x, y }];
      for (let i = 0; i < 6; i++) { x += rnd(-18, 18); y += rnd(-20, 12); pts.push({ x, y }); }
      this.bolts.push({ pts, color: col, life: 0.09, max: 0.09 });
    }
  }

  chargeFx(f, dt) {
    const c = CHARACTERS[f.charId];
    if (Math.random() < dt * 26) {
      this.spawn(pick(['▲', '◆', '■', '0', '1', '▲']), pick(['xs', 'sm']), f.x + rnd(-140, 140), f.y - 2, {
        color: 0xa9b0c8, add: false, vy: -rnd(70, 200), vx: rnd(-12, 12), vr: rnd(-3, 3), life: rnd(0.9, 1.5), alpha: 0.9, alpha1: 0, depth: 8,
      });
    }
    if (Math.random() < dt * 14) this.dust(f.x + rnd(-40, 40), f.y, 2, 320, 0xb8c0d8, 30);
    if (Math.random() < dt * 30) {
      const a = rnd(0, Math.PI * 2), r = rnd(130, 240);
      this.spawn(pick(c.glyphs), 'sm', f.x + Math.cos(a) * r, f.y - 70 + Math.sin(a) * r, { color: c.color, target: { x: f.x, y: f.y - 70 }, life: 0.32, alpha: 1, alpha1: 0.2, scale1: 0.3, depth: 22 });
    }
  }

  powerPillar(x, y, color, glyphs) {
    for (let i = 0; i < 80; i++) {
      this.spawn(pick(glyphs), pick(['sm', 'md', 'lg']), x + rnd(-40, 40), y - rnd(0, 60), {
        color: i % 3 ? color : 0xffffff, vy: -rnd(1400, 2800), vx: rnd(-50, 50), life: rnd(0.35, 0.65), sy: 1.7, scale1: 0.4, depth: 26,
      });
    }
    for (let i = 0; i < 28; i++) {
      const d = i % 2 ? 1 : -1;
      this.spawn(pick(['~', '≈', '∽']), 'md', x, y - 8, { color, vx: d * rnd(500, 1300), vy: -rnd(0, 60), drag: 2.4, life: 0.65, sy: 0.7, depth: 21 });
    }
    this.quake(x, y, 1.3, color);
  }

  // Avatar-style elemental trails for each fighter's energy
  elementTrail(el, x, y, vx, color, t, big = false) {
    const sz = big ? 'md' : 'sm';
    switch (el) {
      case 'water':
        for (const s of [1, -1]) this.spawn(pick(['~', '≈', '∽']), sz, x, y + s * Math.sin(t * 22) * 16, { color: s > 0 ? color : 0xffffff, vx: -vx * 0.15, life: 0.38, alpha: 0.85, scale1: 0.4, depth: 17 });
        break;
      case 'air': {
        const a = t * 26;
        this.spawn(pick(['∘', '○', '∘']), sz, x + Math.cos(a) * 24, y + Math.sin(a) * 24, { color, vx: -Math.sin(a) * 180 - vx * 0.1, vy: Math.cos(a) * 180, life: 0.3, scale1: 1.7, alpha: 0.8, depth: 17 });
        break;
      }
      case 'earth':
        this.spawn(pick(['▲', '◆', '■']), pick(['xs', 'sm']), x + rnd(-12, 12), y + rnd(-12, 12), { color: mixColor(color, 0x8a7a66, 0.45), add: false, vx: -vx * 0.05 + rnd(-70, 70), vy: -rnd(60, 240), g: 1700, vr: rnd(-8, 8), life: 0.55, alpha1: 0.5, depth: 17 });
        break;
      case 'fire':
        this.spawn(pick(['∧', 'Λ', '^']), sz, x + rnd(-10, 10), y + rnd(-10, 10), { color: Math.random() < 0.5 ? color : 0xffd27a, vx: -vx * 0.1, vy: -rnd(140, 300), sy: 1.7, life: 0.32, scale1: 0.2, depth: 17 });
        break;
    }
  }

  // ── per-frame ambient effects driven by fighter state ───────────────
  fighterFx(f, dt, W) {
    const c = CHARACTERS[f.charId];
    if (f.transformed > 0 && Math.random() < dt * 34) {
      this.spawn(pick(c.glyphs), pick(['xs', 'sm', 'md']), f.x + rnd(-34, 34), f.y - rnd(0, 40), {
        color: Math.random() < 0.5 ? c.transformColor : c.color, vy: -rnd(140, 320), vx: rnd(-20, 20), life: rnd(0.5, 0.9), alpha: 0.9, scale1: 0.5, vr: rnd(-2, 2), depth: 9,
      });
    }
    if (f.state === 'move') {
      const m = MOVES[f.move.id];
      const handX = f.x + f.facing * 26, handY = f.y - 86;
      if (f.move.id === 'beam' && f.move.f < m.startup && W) {
        // Kamehameha-style energy orb growing between the hands
        const prog = f.move.f / m.startup;
        const ox = (W.handF[0] + W.handB[0]) / 2, oy = (W.handF[1] + W.handB[1]) / 2;
        this.spawn(c.emblem, 'lg', ox, oy, { color: 0xffffff, scale: 0.25 + prog * 0.9, scale1: 0.25 + prog * 0.9, life: 0.05, alpha: 0.95, rot: this.time * 6, depth: 23 });
        this.spawn('○', 'lg', ox, oy, { color: c.color, scale: 0.4 + prog * 1.1, scale1: 0.6 + prog * 1.3, life: 0.08, alpha: 0.6, depth: 22 });
        for (let k = 0; k < 3; k++) {
          const a = this.time * 9 + (k / 3) * Math.PI * 2, r = 22 + prog * 26;
          this.spawn(pick(c.glyphs), 'xs', ox + Math.cos(a) * r, oy + Math.sin(a) * r * 0.6, { color: c.color, life: 0.06, depth: 23 });
        }
      }
      if (f.move.id === 'beam' && f.move.f < m.startup) {
        // glyphs converge into the hands while charging
        for (let i = 0; i < 2; i++) {
          const a = rnd(0, Math.PI * 2), r = rnd(90, 150);
          this.spawn(pick(c.glyphs), 'sm', handX - f.facing * 40 + Math.cos(a) * r, handY + 10 + Math.sin(a) * r, {
            color: c.color, target: { x: handX - f.facing * 40, y: handY + 12 }, life: 0.3, alpha: 0.9, alpha1: 0.2, scale: 1.2, scale1: 0.4, depth: 22,
          });
        }
      }
      if (f.move.id === 'transform' && f.move.f < m.startup) {
        for (let i = 0; i < 3; i++) {
          const a = rnd(0, Math.PI * 2), r = rnd(100, 220);
          this.spawn(pick(c.glyphs), pick(['sm', 'md']), f.x + Math.cos(a) * r, f.y - 70 + Math.sin(a) * r, {
            color: c.transformColor, target: { x: f.x, y: f.y - 70 }, life: 0.35, alpha: 1, alpha1: 0.3, scale1: 0.3, depth: 22,
          });
        }
      }
      if (f.move.id === 'counter' && f.move.data.active && Math.random() < dt * 20) {
        this.spawn('%', 'md', f.x + f.facing * 20, f.y - 110, { color: c.color, vy: -60, life: 0.4, scale1: 1.4, depth: 22 });
      }
      if ((f.move.id === 'omega_super' || f.move.id === 'sigma_super') && f.move.f < m.startup) {
        this.spawn(pick(c.glyphs), 'sm', handX + rnd(-30, 30), handY + rnd(-30, 30), { color: c.color, vy: -200, life: 0.3, depth: 22 });
      }
    }
  }

  // ── projectile visuals (keyed by sim projectile id) ─────────────────
  syncProjectiles(world, dt, frozen) {
    const seen = new Set();
    this.band.clear();
    for (const p of world.projectiles) {
      seen.add(p.id);
      const c = CHARACTERS[world.fighters[p.owner].charId];
      const color = p.big ? c.transformColor : c.color;
      let v = this.projViews.get(p.id);
      if (!v) {
        v = { img: null, t: 0 };
        if (p.kind !== 'beam') {
          const size = p.big && p.size === 'md' ? 'lg' : p.size;
          v.img = this.scene.add.image(p.x, p.y, ensureGlyph(this.scene, p.glyph, size)).setTint(mixColor(color, 0xffffff, 0.25)).setDepth(18).setBlendMode(Phaser.BlendModes.ADD);
          if (p.kind === 'spike') v.img.setOrigin(0.5, 0.85);
          if (p.kind === 'singularity') {
            v.orbit = Array.from({ length: 8 }, (_, i) => this.scene.add.image(0, 0, ensureGlyph(this.scene, ['∞', '≈', '≠', '∈', 'Ω', '∫', '∂', '∅'][i], 'sm')).setTint(i % 2 ? color : 0xffffff).setDepth(18).setBlendMode(Phaser.BlendModes.ADD));
          }
          if (p.kind === 'blast') { this.ring(p.x, p.y, 'Ω', color, 18, 900, 'md', 0.55); this.ring(p.x, p.y, '∞', 0xffffff, 12, 600, 'sm', 0.5); }
        }
        this.projViews.set(p.id, v);
      }
      if (!frozen) v.t += dt;
      switch (p.kind) {
        case 'glyph':
          if (!frozen && Math.random() < dt * 45) this.elementTrail(ELEMENT[c.id], p.x, p.y, p.vx, color, v.t, p.big);
          v.img.setPosition(p.x, p.y).setRotation(p.type === 'series' || p.type === 'series_final' ? 0 : Math.sin(v.t * 18) * 0.15).setScale(1 + Math.sin(v.t * 30) * 0.05);
          if (!frozen && Math.random() < dt * 40) this.spawn(p.glyph, 'xs', p.x - p.vx * 0.02, p.y - p.vy * 0.02, { color, alpha: 0.6, life: 0.25, vx: -p.vx * 0.1, vy: -p.vy * 0.1, scale1: 0.3, depth: 17 });
          break;
        case 'wave':
          if (!frozen && Math.random() < dt * 55) this.elementTrail(ELEMENT[c.id], p.x - p.dir * 16, p.y, p.vx, color, v.t, true);
          v.img.setPosition(p.x, p.y).setScale(1, 1.25 + Math.sin(v.t * 25) * 0.1).setFlipX(p.dir < 0);
          if (!frozen && Math.random() < dt * 50) this.spawn(pick([p.glyph, '~', '·']), 'sm', p.x - p.dir * 20, STAGE.groundY - rnd(4, 30), { color, vy: -rnd(40, 160), vx: -p.dir * rnd(30, 120), life: 0.4, alpha: 0.8, depth: 17 });
          break;
        case 'spike': {
          const rise = Math.min(1, p.age / 4);
          const fall = p.age > p.life - 5 ? Math.max(0, (p.life - p.age) / 5) : 1;
          v.img.setPosition(p.x, p.y + 10).setScale(1.05, rise * (p.type === 'spike_final' ? 1.8 : 1.6) * fall).setAlpha(fall);
          if (p.age === 1 && !v.burst) { v.burst = true; this.quake(p.x, p.y, p.type === 'spike_final' ? 1.4 : 0.7, color); }
          break;
        }
        case 'singularity': {
          const s = 1 + Math.sin(v.t * 8) * 0.08;
          v.img.setPosition(p.x, p.y).setRotation(v.t * 3).setScale(s);
          v.orbit.forEach((o, i) => {
            const a = v.t * (2.4 + (i % 3) * 0.7) + (i / 8) * Math.PI * 2;
            const r = 64 + Math.sin(v.t * 3 + i) * 14;
            o.setPosition(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.7).setRotation(-a);
          });
          if (!frozen && Math.random() < dt * 60) {
            const a = rnd(0, Math.PI * 2), r = rnd(160, 300);
            this.spawn(pick(['·', '∘', '+', '×']), 'sm', p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, { color, target: { x: p.x, y: p.y }, life: 0.45, alpha: 0.9, alpha1: 0, scale1: 0.3, depth: 17 });
          }
          break;
        }
        case 'blast': {
          const t = p.age / p.life;
          v.img.setPosition(p.x, p.y).setScale(0.6 + t * 1.5).setAlpha(1 - t);
          break;
        }
        case 'beam':
          this.drawBeam(p, color, c, dt, frozen, v);
          break;
      }
    }
    for (const [id, v] of this.projViews) {
      if (!seen.has(id)) {
        if (v.img) {
          if (v.img.visible) this.spawn(v.img.texture.key.split(':').slice(2).join(':'), 'md', v.img.x, v.img.y, { color: 0xffffff, scale: 1, scale1: 2, life: 0.2, depth: 18 });
          v.img.destroy();
        }
        if (v.orbit) v.orbit.forEach((o) => o.destroy());
        this.projViews.delete(id);
      }
    }
  }

  drawBeam(p, color, c, dt, frozen, v) {
    const x0 = p.x, len = p.len, dir = p.dir, y = p.y, h = p.h;
    const x1 = x0 + dir * len;
    // faint cohesive band (the beam itself is made of glyphs below)
    const flick = 0.85 + Math.sin(v.t * 40) * 0.15;
    this.band.fillStyle(color, 0.10 * flick);
    this.band.fillRect(Math.min(x0, x1), y - h * 0.5, len, h);
    this.band.fillStyle(color, 0.16 * flick);
    this.band.fillRect(Math.min(x0, x1), y - h * 0.22, len, h * 0.44);
    if (frozen) return;
    // glyph stream
    const rate = p.big ? 110 : 80;
    const n = Math.max(1, Math.round(rate * dt + Math.random()));
    for (let i = 0; i < n; i++) {
      const lane = rnd(-0.42, 0.42) * h;
      const size = Math.abs(lane) < h * 0.15 ? pick(['md', 'lg']) : pick(['sm', 'md']);
      const glyph = Math.random() < 0.72 ? pick(c.glyphs) : pick(['=', '≡', '+', '→']);
      const speed = rnd(1900, 2600);
      this.spawn(glyph, size, x0 + dir * rnd(0, 30), y + lane, {
        color: Math.random() < 0.3 ? 0xffffff : mixColor(color, 0xffffff, 0.2), vx: dir * speed, vy: lane * 0.3,
        life: Math.max(0.05, (len - 20) / speed), alpha: 0.95, alpha1: 0.6, vr: rnd(-3, 3), depth: 20,
      });
    }
    // elemental double helix spiralling along the beam
    const eg = ELEMENT_GLYPHS[ELEMENT[c.id]];
    for (const ph of [0, Math.PI]) {
      if (Math.random() < dt * 55) {
        this.spawn(pick(eg), p.big ? 'md' : 'sm', x0 + dir * 10, y, {
          color: ph ? 0xffffff : color, vx: dir * 2300, life: Math.max(0.05, len / 2300), alpha: 0.95, alpha1: 0.5,
          wob: { amp: h * 0.62, freq: 16, ph: ph + v.t * 10 }, depth: 21,
        });
      }
    }
    // head of the beam
    if (Math.random() < dt * 30) {
      this.spawn(pick(c.glyphs), p.big ? 'xl' : 'lg', x1, y + rnd(-10, 10), { color: 0xffffff, scale: 0.8, scale1: 1.4, life: 0.12, alpha: 0.9, depth: 21 });
      this.spawn(pick(SPARK_GLYPHS), 'sm', x1, y, { color, vx: -dir * rnd(100, 400), vy: rnd(-400, 400), life: 0.3, depth: 21 });
    }
    // muzzle
    if (Math.random() < dt * 20) this.spawn(c.emblem, 'lg', x0, y, { color: mixColor(color, 0xffffff, 0.5), scale: 0.9, scale1: 1.3, life: 0.1, depth: 21 });
    if (p.clash && Math.random() < dt * 40) this.spawn(pick(['≠', '±', '∓', '*']), 'md', x1, y + rnd(-h / 2, h / 2), { color: 0xffffff, vx: rnd(-200, 200), vy: rnd(-500, 500), life: 0.35, depth: 22 });
  }

  clearAll() {
    for (const p of this.parts) { p.img.setVisible(false); this.pool.push(p.img); }
    this.parts = [];
    for (const [, v] of this.projViews) { if (v.img) v.img.destroy(); if (v.orbit) v.orbit.forEach((o) => o.destroy()); }
    this.projViews.clear();
    for (const t of this.texts) t.obj.destroy();
    this.texts = [];
    this.band.clear();
  }
}
