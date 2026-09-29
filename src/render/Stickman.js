// Procedural stickman: spring-driven joints (natural overshoot + hit reactions),
// tapered limbs, glow, cloth (scarf / ribbons / cape), afterimages and a Verlet
// ragdoll on K.O.

import Phaser from 'phaser';
import { CHARACTERS } from '../sim/characters.js';
import { STAGE } from '../sim/constants.js';
import { LIMB, KEYS, targetPose, solveSkeleton, resolvePose, POSES } from './poses.js';
import { ensureGlyph } from './GlyphCache.js';

const mix = (a, b, t) => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
};
export { mix as mixColor };

const STYLE = {
  sigma: { L: { ...LIMB, id: 's' }, w: 1.0, cloth: { anchor: 'neck', segs: 9, len: 9, w0: 7, w1: 2, count: 1 } },
  pi: { L: { ...LIMB, id: 'p', torso: 39, ua: 24.5, fa: 24 }, w: 0.88, cloth: { anchor: 'head', segs: 8, len: 8.5, w0: 4, w1: 1.5, count: 2 } },
  nabla: { L: { ...LIMB, id: 'n', torso: 41, ua: 25, fa: 25 }, w: 1.32, cloth: { anchor: 'neck', segs: 5, len: 9, w0: 10, w1: 5, count: 1 } },
  omega: { L: { ...LIMB, id: 'o' }, w: 0.95, cloth: { anchor: 'neck', segs: 10, len: 9.5, w0: 13, w1: 5, count: 1, cape: true } },
};

export class StickmanView {
  constructor(scene, charId, opts = {}) {
    this.scene = scene;
    this.char = CHARACTERS[charId];
    this.style = STYLE[charId];
    this.L = this.style.L;
    this.scale = opts.scale || 1;
    this.isVillain = !!opts.villain;
    this.depth = opts.depth ?? 10;
    this.floorY = opts.floorY ?? null;

    this.shadow = scene.add.graphics().setDepth(this.depth - 2);
    this.after = scene.add.graphics().setDepth(this.depth - 1).setBlendMode(Phaser.BlendModes.ADD);
    this.glow = scene.add.graphics().setDepth(this.depth).setBlendMode(Phaser.BlendModes.ADD);
    this.body = scene.add.graphics().setDepth(this.depth + 1);
    this.emblem = scene.add.image(0, 0, ensureGlyph(scene, this.char.emblem, 'sm')).setDepth(this.depth + 2).setScale(0.55 * this.scale);

    this.pose = { ...resolvePose(POSES.idle, this.L) };
    this.vel = {}; for (const k of KEYS) this.vel[k] = 0;
    this.time = 0; this.walkPhase = 0; this.lastX = null;
    this.flip = 0; this.flipDir = 1;
    this.alpha = 1;
    this.afterimages = []; this.afterTimer = 0;
    this.cloth = [];
    this.ragdoll = null;
    this.J = null; this.wx = 0; this.wy = 0;
    this.shake = 0;
  }

  destroy() {
    for (const o of [this.shadow, this.after, this.glow, this.body, this.emblem]) o.destroy();
  }

  setMask(mask) { for (const o of [this.shadow, this.after, this.glow, this.body, this.emblem]) o.setMask(mask); }

  setVisible(v) { for (const o of [this.shadow, this.after, this.glow, this.body, this.emblem]) o.setVisible(v); }

  impulse(dir, strength, facing) {
    const s = Math.min(1.4, 0.35 + strength);
    const local = dir * facing; // +1 = pushed forward (hit from behind)
    this.vel.lean += local * 16 * s;
    this.vel.head += local * 26 * s;
    this.vel.fs += -local * 12 * s;
    this.vel.bs += -local * 14 * s;
    this.vel.hy -= 60 * s;
    this.shake = 1;
  }

  doFlip(dir) { this.flip = Math.PI * 2; this.flipDir = dir; }

  // f: fighter state, x/y: interpolated feet position, dt: seconds (visual)
  update(f, x, y, dt, frozen) {
    this.time += dt;
    this.wx = x; this.wy = y;

    if (f.state === 'charge' && !frozen) this.shake = Math.max(this.shake, 0.55); // trembling power-up
    if (f.state === 'ko' && !this.ragdoll && this.J && !frozen) this.startRagdoll(f);
    if (this.ragdoll) { if (!frozen) this.ragdoll.step(dt); this.drawRagdoll(f); return; }

    if (!frozen) {
      if (this.lastX !== null && f.grounded) this.walkPhase += ((x - this.lastX) * f.facing) / 13;
      this.lastX = x;
      const { pose: target, k } = targetPose(f, this, this.L);
      const c = 2 * Math.sqrt(k) * 0.62; // slightly under-damped → organic overshoot
      const sub = Math.min(4, Math.ceil(dt / (1 / 120)));
      const h = dt / sub;
      for (let i = 0; i < sub; i++) {
        for (const key of KEYS) {
          const a = k * (target[key] - this.pose[key]) - c * this.vel[key];
          this.vel[key] += a * h;
          this.pose[key] += this.vel[key] * h;
        }
      }
      if (this.flip > 0) this.flip = Math.max(0, this.flip - dt * 22);
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 6);
    }

    let extraRot = this.flip > 0 ? -this.flipDir * this.flip * f.facing : 0;
    if (f.state === 'move' && f.move.id === 'pi_spin') extraRot += (f.move.f / 30) * Math.PI * 4;
    if (f.state === 'hitstun' && !f.grounded) extraRot += Math.max(-0.9, Math.min(0.9, -f.vy / 1600)) * 0.8;
    if (f.state === 'dash' && f.dashDirY) extraRot += f.dashDirY * 0.5 * (Math.sign(f.dashDir) === f.facing ? 1 : -1);

    this.J = solveSkeleton(this.pose, this.L, extraRot);

    // alpha for teleports
    let alpha = 1;
    if (f.state === 'move' && f.move.id === 'omega_blink') {
      const fr = f.move.f; alpha = fr < 7 ? 1 - fr / 7 : Math.min(1, (fr - 7) / 6);
    }
    if (f.invuln > 0 && f.state === 'getup') alpha = 0.55 + 0.45 * Math.sin(this.time * 40);
    this.alpha = alpha;

    // afterimages
    const trail = f.state === 'dash' || (f.state === 'move' && (f.move.id === 'dashstrike' || f.move.id === 'pi_spin' || f.move.id.endsWith('super') || f.move.id === 'pi_super_seq' || f.move.id === 'slidekick')) || (f.transformed > 0 && Math.abs(f.vx) > 200);
    this.afterTimer -= dt;
    if (trail && this.afterTimer <= 0 && !frozen) {
      this.afterTimer = 1 / 40;
      this.afterimages.push({ pts: this.worldJoints(f.facing), a: 0.5, facing: f.facing });
      if (this.afterimages.length > 10) this.afterimages.shift();
    }
    for (const ai of this.afterimages) ai.a -= dt * (frozen ? 0 : 2.4);
    this.afterimages = this.afterimages.filter((a) => a.a > 0);

    this.updateCloth(f, dt, frozen);
    this.draw(f);
  }

  worldJoints(facing) {
    const s = this.scale, out = {};
    const jx = this.shake > 0 ? (Math.random() - 0.5) * 6 * this.shake : 0;
    for (const k in this.J) out[k] = [this.wx + (this.J[k][0] * facing) * s + jx, this.wy + this.J[k][1] * s];
    return out;
  }

  colors(f) {
    const base = f.transformed > 0 ? this.char.transformColor : this.char.color;
    const light = mix(base, 0xffffff, f.transformed > 0 ? 0.3 : 0.42);
    return {
      glow: base,
      body: f.flash > 0 ? 0xffffff : light,
      back: f.flash > 0 ? 0xdddddd : mix(light, 0x1a1a2e, 0.42),
      cloth: f.transformed > 0 ? mix(this.char.transformColor, this.char.accent, 0.3) : this.char.accent,
    };
  }

  draw(f) {
    const { glow, body, after, shadow } = this;
    glow.clear(); body.clear(); after.clear(); shadow.clear();
    const W = this.worldJoints(f.facing);
    const col = this.colors(f);
    const s = this.scale * this.style.w;
    const a = this.alpha;

    // ground shadow
    const gy = this.floorY ?? groundBelow(this.wx, this.wy);
    const hgt = Math.max(0, gy - this.wy);
    const sw = Math.max(12, 46 - hgt * 0.08) * this.scale;
    shadow.fillStyle(0x000000, 0.35 * Math.max(0.2, 1 - hgt / 500) * a);
    shadow.fillEllipse(this.wx, gy + 2, sw * 2, sw * 0.32);

    for (const ai of this.afterimages) drawStick(after, ai.pts, s * 0.9, col.glow, col.glow, ai.a * 0.5, this.L.headR * this.scale, true);

    // glow layers
    const pulse = f.transformed > 0 ? 1.4 + Math.sin(this.time * 12) * 0.3 : 1;
    drawGlow(glow, W, s, col.glow, a * pulse, this.L.headR * this.scale);

    // cloth behind the body
    this.drawCloth(body, col.cloth, a, s);
    // back limbs, torso, front limbs
    const bw = 7 * s;
    limb(body, W.neck, W.elbowB, bw * 0.95, bw * 0.8, col.back, a);
    limb(body, W.elbowB, W.handB, bw * 0.8, bw * 0.7, col.back, a);
    limb(body, W.hip, W.kneeB, bw * 1.15, bw * 0.9, col.back, a);
    limb(body, W.kneeB, W.footB, bw * 0.9, bw * 0.75, col.back, a);
    limb(body, W.hip, W.neck, bw * 1.2, bw * 1.65, col.body, a);
    limb(body, W.hip, W.kneeF, bw * 1.2, bw * 0.95, col.body, a);
    limb(body, W.kneeF, W.footF, bw * 0.95, bw * 0.78, col.body, a);
    // head
    const hr = this.L.headR * this.scale * (this.style.w > 1.1 ? 1.08 : 1);
    body.fillStyle(col.body, a);
    body.fillCircle(W.head[0], W.head[1], hr);
    // visor / eye
    const eye = this.isVillain ? 0xff2a3a : 0x0b0b16;
    const ang = Math.atan2(W.head[1] - W.neck[1], W.head[0] - W.neck[0]) + Math.PI / 2 * f.facing;
    const ex = W.head[0] + Math.cos(ang) * hr * 0.35, ey = W.head[1] + Math.sin(ang) * hr * 0.35 - hr * 0.1;
    body.lineStyle(3.2 * this.scale, eye, a);
    body.lineBetween(ex - Math.cos(ang) * hr * 0.2, ey - Math.sin(ang) * hr * 0.2, ex + Math.cos(ang) * hr * 0.55, ey + Math.sin(ang) * hr * 0.55);
    // front arm last
    limb(body, W.neck, W.elbowF, bw * 0.95, bw * 0.82, col.body, a);
    limb(body, W.elbowF, W.handF, bw * 0.82, bw * 0.72, col.body, a);
    body.fillStyle(col.body, a);
    body.fillCircle(W.handF[0], W.handF[1], bw * 0.62);

    // chest emblem
    this.emblem.setPosition(W.chest[0], W.chest[1]).setTint(mix(col.glow, 0x000000, 0.35)).setAlpha(a);
    this.emblem.setRotation(Math.atan2(W.neck[0] - W.hip[0], W.hip[1] - W.neck[1]));
  }

  // ── cloth ───────────────────────────────────────────────────────────
  anchorPoints(W) {
    const cl = this.style.cloth;
    if (cl.anchor === 'head') {
      return [0, 1].map((i) => {
        const dx = W.head[0] - W.neck[0], dy = W.head[1] - W.neck[1];
        const len = Math.hypot(dx, dy) || 1;
        const back = -Math.sign(this.facing || 1);
        return [W.head[0] + back * 8 * this.scale + (dy / len) * 0, W.head[1] - 2 + i * 4];
      });
    }
    return [[W.neck[0], W.neck[1] + 3 * this.scale]];
  }

  updateCloth(f, dt, frozen) {
    const cl = this.style.cloth;
    this.facing = f.facing;
    const W = this.worldJoints(f.facing);
    const anchors = this.anchorPoints(W);
    const seg = cl.len * this.scale;
    if (!this.cloth.length) {
      this.cloth = anchors.map(([ax, ay]) => Array.from({ length: cl.segs }, (_, i) => ({ x: ax - f.facing * i * seg, y: ay + i * 2, px: ax - f.facing * i * seg, py: ay + i * 2 })));
    }
    if (frozen) return;
    const h = Math.min(dt, 1 / 30);
    const g = 1400 * this.scale;
    const wind = -f.facing * 60 + Math.sin(this.time * 5) * 90;
    this.cloth.forEach((rope, ri) => {
      const [ax, ay] = anchors[ri] || anchors[0];
      rope[0].x = ax; rope[0].y = ay; rope[0].px = ax; rope[0].py = ay;
      for (let i = 1; i < rope.length; i++) {
        const p = rope[i];
        const vx = (p.x - p.px) * 0.93, vy = (p.y - p.py) * 0.93;
        p.px = p.x; p.py = p.y;
        p.x += vx + wind * h * h * (1 + i * 0.2) * 10;
        p.y += vy + g * h * h;
      }
      for (let it = 0; it < 4; it++) {
        for (let i = 1; i < rope.length; i++) {
          const a = rope[i - 1], b = rope[i];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.001;
          const diff = (d - seg) / d;
          if (i === 1) { b.x -= dx * diff; b.y -= dy * diff; }
          else { a.x += dx * diff * 0.5; a.y += dy * diff * 0.5; b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5; }
        }
        const gy = STAGE.groundY;
        for (const p of rope) if (p.y > gy) p.y = gy;
      }
    });
  }

  drawCloth(g, color, a, s) {
    const cl = this.style.cloth;
    for (const rope of this.cloth) {
      for (let i = 1; i < rope.length; i++) {
        const t = i / rope.length;
        const w = (cl.w0 + (cl.w1 - cl.w0) * t) * this.scale;
        limb(g, [rope[i - 1].x, rope[i - 1].y], [rope[i].x, rope[i].y], w, w * 0.92, mix(color, 0x05050a, t * 0.35), a * (cl.cape ? 0.92 : 1));
      }
    }
  }

  // ── ragdoll ─────────────────────────────────────────────────────────
  startRagdoll(f) {
    const W = this.worldJoints(f.facing);
    this.ragdoll = new Ragdoll(W, f.vx, f.vy, this.scale);
  }

  drawRagdoll(f) {
    const { glow, body, after, shadow } = this;
    glow.clear(); body.clear(); after.clear(); shadow.clear();
    const W = this.ragdoll.joints();
    const col = this.colors(f);
    const s = this.scale * this.style.w;
    const hip = W.hip;
    const gy = groundBelow(hip[0], hip[1]);
    shadow.fillStyle(0x000000, 0.3);
    shadow.fillEllipse(hip[0], gy + 2, 90, 14);
    drawGlow(glow, W, s, col.glow, 0.7, this.L.headR * this.scale);
    this.updateClothFromRagdoll(W);
    this.drawCloth(body, col.cloth, 1, s);
    drawStick(body, W, s, col.body, col.back, 1, this.L.headR * this.scale * (this.style.w > 1.1 ? 1.08 : 1));
    this.emblem.setPosition(W.chest[0], W.chest[1]).setRotation(Math.atan2(W.neck[0] - W.hip[0], W.hip[1] - W.neck[1]));
  }

  updateClothFromRagdoll(W) {
    const h = 1 / 60;
    for (const rope of this.cloth) {
      rope[0].x = W.neck[0]; rope[0].y = W.neck[1];
      for (let i = 1; i < rope.length; i++) {
        const p = rope[i];
        const vx = (p.x - p.px) * 0.93, vy = (p.y - p.py) * 0.93;
        p.px = p.x; p.py = p.y; p.x += vx; p.y += vy + 1400 * h * h;
      }
      const seg = this.style.cloth.len * this.scale;
      for (let it = 0; it < 3; it++) for (let i = 1; i < rope.length; i++) {
        const a = rope[i - 1], b = rope[i];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.001, diff = (d - seg) / d;
        if (i === 1) { b.x -= dx * diff; b.y -= dy * diff; } else { a.x += dx * diff / 2; a.y += dy * diff / 2; b.x -= dx * diff / 2; b.y -= dy * diff / 2; }
        if (b.y > STAGE.groundY) b.y = STAGE.groundY;
      }
    }
  }

  reset() {
    this.ragdoll = null;
    this.afterimages = [];
    this.cloth = [];
    this.pose = { ...resolvePose(POSES.idle, this.L) };
    for (const k of KEYS) this.vel[k] = 0;
    this.lastX = null;
  }
}

// ── drawing helpers ───────────────────────────────────────────────────
export function limb(g, a, b, wa, wb, color, alpha) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 0.001;
  const nx = -dy / len, ny = dx / len;
  g.fillStyle(color, alpha);
  g.fillPoints([
    { x: a[0] + nx * wa / 2, y: a[1] + ny * wa / 2 },
    { x: b[0] + nx * wb / 2, y: b[1] + ny * wb / 2 },
    { x: b[0] - nx * wb / 2, y: b[1] - ny * wb / 2 },
    { x: a[0] - nx * wa / 2, y: a[1] - ny * wa / 2 },
  ], true);
  g.fillCircle(a[0], a[1], wa / 2);
  g.fillCircle(b[0], b[1], wb / 2);
}

const BONES = [['neck', 'elbowB'], ['elbowB', 'handB'], ['hip', 'kneeB'], ['kneeB', 'footB'], ['hip', 'neck'], ['hip', 'kneeF'], ['kneeF', 'footF'], ['neck', 'elbowF'], ['elbowF', 'handF']];

function drawGlow(g, W, s, color, a, headR) {
  for (const [w, al] of [[22, 0.07], [13, 0.16]]) {
    g.lineStyle(w * s, color, al * a);
    for (const [p, q] of BONES) g.lineBetween(W[p][0], W[p][1], W[q][0], W[q][1]);
    g.fillStyle(color, al * a * 0.9);
    g.fillCircle(W.head[0], W.head[1], headR + w * 0.45 * s);
  }
}

function drawStick(g, W, s, color, backColor, a, headR, outlineOnly) {
  const bw = 7 * s;
  if (outlineOnly) {
    g.lineStyle(bw * 0.9, color, a);
    for (const [p, q] of BONES) g.lineBetween(W[p][0], W[p][1], W[q][0], W[q][1]);
    g.fillStyle(color, a); g.fillCircle(W.head[0], W.head[1], headR);
    return;
  }
  limb(g, W.neck, W.elbowB, bw * 0.95, bw * 0.8, backColor, a);
  limb(g, W.elbowB, W.handB, bw * 0.8, bw * 0.7, backColor, a);
  limb(g, W.hip, W.kneeB, bw * 1.15, bw * 0.9, backColor, a);
  limb(g, W.kneeB, W.footB, bw * 0.9, bw * 0.75, backColor, a);
  limb(g, W.hip, W.neck, bw * 1.2, bw * 1.65, color, a);
  limb(g, W.hip, W.kneeF, bw * 1.2, bw * 0.95, color, a);
  limb(g, W.kneeF, W.footF, bw * 0.95, bw * 0.78, color, a);
  g.fillStyle(color, a); g.fillCircle(W.head[0], W.head[1], headR);
  limb(g, W.neck, W.elbowF, bw * 0.95, bw * 0.82, color, a);
  limb(g, W.elbowF, W.handF, bw * 0.82, bw * 0.72, color, a);
}

export function groundBelow(x, y) {
  let best = STAGE.groundY;
  for (const p of STAGE.platforms) if (x >= p.x1 && x <= p.x2 && p.y >= y - 2 && p.y < best) best = p.y;
  return best;
}

// ── Verlet ragdoll ────────────────────────────────────────────────────
const RD_LINKS = [['head', 'neck'], ['neck', 'hip'], ['neck', 'elbowF'], ['elbowF', 'handF'], ['neck', 'elbowB'], ['elbowB', 'handB'], ['hip', 'kneeF'], ['kneeF', 'footF'], ['hip', 'kneeB'], ['kneeB', 'footB'], ['head', 'hip'], ['kneeF', 'kneeB', 0.6], ['neck', 'kneeF', 0.5], ['neck', 'kneeB', 0.5]];

class Ragdoll {
  constructor(W, vx, vy, scale) {
    this.p = {};
    const h = 1 / 60;
    let i = 0;
    for (const k of ['head', 'neck', 'hip', 'elbowF', 'handF', 'elbowB', 'handB', 'kneeF', 'footF', 'kneeB', 'footB']) {
      const [x, y] = W[k];
      const spin = (k === 'head' ? 1.6 : k === 'neck' ? 1.3 : k.startsWith('foot') ? 0.6 : 1) ;
      const jitter = ((i++ * 37) % 11 - 5) * 0.6;
      this.p[k] = { x, y, px: x - vx * h * spin - jitter, py: y - vy * h * (k === 'head' ? 1.1 : 1) };
    }
    this.links = RD_LINKS.map(([a, b, stiff = 1]) => {
      const A = this.p[a], B = this.p[b];
      return { a, b, len: Math.hypot(A.x - B.x, A.y - B.y), stiff };
    });
    this.acc = 0;
    this.scale = scale;
  }

  step(dt) {
    this.acc += dt;
    const h = 1 / 60;
    while (this.acc >= h) {
      this.acc -= h;
      for (const k in this.p) {
        const q = this.p[k];
        const vx = (q.x - q.px) * 0.995, vy = (q.y - q.py) * 0.995;
        q.px = q.x; q.py = q.y;
        q.x += vx; q.y += vy + 2400 * h * h;
      }
      for (let it = 0; it < 8; it++) {
        for (const l of this.links) {
          const A = this.p[l.a], B = this.p[l.b];
          const dx = B.x - A.x, dy = B.y - A.y;
          const d = Math.hypot(dx, dy) || 0.001;
          if (l.stiff < 1 && d > l.len * 0.7 && d < l.len * 1.3) continue; // loose "muscle" links
          const diff = ((d - l.len) / d) * 0.5 * l.stiff;
          A.x += dx * diff; A.y += dy * diff; B.x -= dx * diff; B.y -= dy * diff;
        }
        for (const k in this.p) {
          const q = this.p[k];
          const gy = groundBelow(q.x, q.py) - (k === 'head' ? 11 : 3);
          if (q.y > gy) {
            q.y = gy;
            const vx = q.x - q.px;
            q.px = q.x - vx * 0.8; // ground friction
            if (q.py > q.y) q.py = q.y + (q.py - q.y) * -0.3;
          }
          if (q.x < STAGE.leftWall + 4) { q.x = STAGE.leftWall + 4; q.px = q.x + (q.x - q.px) * 0.4; }
          if (q.x > STAGE.rightWall - 4) { q.x = STAGE.rightWall - 4; q.px = q.x + (q.x - q.px) * 0.4; }
        }
      }
    }
  }

  joints() {
    const o = {};
    for (const k in this.p) o[k] = [this.p[k].x, this.p[k].y];
    o.chest = [o.hip[0] + (o.neck[0] - o.hip[0]) * 0.62, o.hip[1] + (o.neck[1] - o.hip[1]) * 0.62];
    return o;
  }
}
