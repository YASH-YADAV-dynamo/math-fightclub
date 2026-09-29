// Pose library for the procedural stickman.
// Angles in radians. Arms/legs measured from straight-down, + = toward facing.
// hy = hip height, lean = torso tilt (+ forward), rot = whole-body rotation.
// fF / fB = planted foot targets [x, y] (solved with 2-bone IK).

import { MOVES } from '../sim/moves.js';
import { PHYS } from '../sim/constants.js';

export const LIMB = { thigh: 31, shin: 31, torso: 40, neck: 8, headR: 12.5, ua: 25, fa: 24 };

export const KEYS = ['hx', 'hy', 'lean', 'head', 'fs', 'fe', 'bs', 'be', 'ft', 'fk', 'bt', 'bk', 'rot'];

const BASE = { hx: 0, hy: 55, lean: 0.1, head: 0, fs: 0.95, fe: 1.75, bs: 0.55, be: 2.0, ft: 0.3, fk: -0.4, bt: -0.3, bk: -0.3, rot: 0 };

const STANCE = { fF: [18, 0], fB: [-20, 0] };
const WIDE = { fF: [28, 0], fB: [-30, 0] };
const CROUCH_LEGS = { fF: [24, 0], fB: [-18, 0] };
const AIR_TUCK = { ft: 0.95, fk: -1.4, bt: 0.15, bk: -1.1 };

const P = (o) => ({ ...BASE, ...o });

export const POSES = {
  idle: P({ ...STANCE }),
  guard: P({ hy: 50, lean: -0.04, head: 0.12, fs: 1.75, fe: 2.05, bs: 1.95, be: 1.85, ...STANCE }),
  guardLow: P({ hy: 36, lean: 0.25, head: 0.1, fs: 1.6, fe: 2.1, bs: 1.8, be: 1.9, ...CROUCH_LEGS }),
  crouch: P({ hy: 36, lean: 0.38, fs: 1.1, fe: 1.8, bs: 0.8, be: 2.0, ...CROUCH_LEGS }),
  land: P({ hy: 40, lean: 0.3, fs: 1.3, fe: 1.3, bs: 1.0, be: 1.4, ...CROUCH_LEGS }),
  rise: P({ lean: 0.04, fs: 2.3, fe: 0.5, bs: 1.7, be: 0.6, ...AIR_TUCK }),
  fall: P({ lean: 0.0, fs: 1.45, fe: 0.35, bs: 1.25, be: 0.45, ft: 0.45, fk: -0.6, bt: -0.25, bk: -0.9 }),
  wallslide: P({ lean: -0.25, head: 0.2, fs: 2.6, fe: 0.4, bs: 2.0, be: 0.8, ft: 0.8, fk: -1.2, bt: 0.3, bk: -1.4 }),
  dash: P({ hy: 46, lean: 0.62, head: -0.2, fs: -1.0, fe: 0.6, bs: -1.35, be: 0.4, ft: 1.05, fk: -0.8, bt: -0.95, bk: -0.6 }),
  backdash: P({ hy: 50, lean: -0.35, head: 0.1, fs: 1.4, fe: 1.2, bs: 0.9, be: 1.4, ft: 0.6, fk: -0.5, bt: -0.3, bk: -1.2 }),
  hurt: P({ hx: -6, lean: -0.45, head: -0.45, fs: 0.5, fe: 0.5, bs: 2.1, be: 0.4, ...STANCE }),
  hurtAir: P({ lean: -0.85, head: -0.5, fs: 2.6, fe: 0.2, bs: 1.9, be: 0.6, ft: 0.9, fk: -0.4, bt: 0.2, bk: -0.9 }),
  knockdown: P({ hy: 10, rot: -1.5, lean: 0, head: 0.25, fs: 0.3, fe: 0.3, bs: -0.4, be: 0.4, ft: 0.08, fk: -0.25, bt: -0.1, bk: -0.1 }),
  getup: P({ hy: 34, lean: 0.45, fs: 1.2, fe: 1.3, bs: 0.2, be: 0.6, ...CROUCH_LEGS }),
  charge: P({ hy: 44, lean: -0.08, head: -0.4, fs: -0.35, fe: 1.75, bs: -0.45, be: 1.7, fF: [30, 0], fB: [-32, 0] }),
  victory: P({ hy: 56, lean: -0.05, head: -0.25, fs: 3.0, fe: 0.3, bs: 0.35, be: 1.4, ...WIDE }),
  intro: P({ hy: 55, lean: 0.02, head: -0.05, fs: 0.3, fe: 1.9, bs: -0.2, be: 2.2, ...STANCE }),
};

// attack animations: w = windup (startup), s = strike (active + early recovery)
export const ANIMS = {
  jab1: { w: { fs: 0.7, fe: 2.35, bs: 0.9, be: 1.8, lean: 0.05, ...STANCE }, s: { fs: 1.6, fe: 0.04, bs: 0.6, be: 2.1, lean: 0.28, hx: 6, fF: [26, 0], fB: [-22, 0] } },
  jab2: { w: { bs: 0.7, be: 2.3, fs: 1.0, fe: 1.6, ...STANCE }, s: { bs: 1.62, be: 0.04, fs: 0.45, fe: 2.0, lean: 0.36, hx: 10, fF: [28, 0], fB: [-20, 0] } },
  kick: { w: { hy: 57, ft: 1.5, fk: -2.2, fB: [-8, 0], lean: -0.15, fs: 0.4, fe: 1.4, bs: 1.2, be: 1.2 }, s: { hy: 60, ft: 1.64, fk: -0.04, fB: [-10, 0], lean: -0.42, head: 0.2, fs: -0.6, fe: 0.8, bs: 1.4, be: 0.6 } },
  airkick: { w: { ft: 1.4, fk: -2.0, bt: 0.3, bk: -1.6, lean: 0.05, fs: 1.8, fe: 0.8, bs: 1.4, be: 0.8 }, s: { ft: 0.95, fk: -0.04, bt: -0.25, bk: -1.6, lean: -0.28, fs: -0.4, fe: 1.0, bs: 1.9, be: 0.6 } },
  launcher: { w: { hy: 36, lean: 0.4, fs: 0.2, fe: 1.2, bs: 0.6, be: 1.8, ...CROUCH_LEGS }, s: { hy: 64, lean: -0.12, head: -0.3, fs: 3.02, fe: 0.04, bs: 0.3, be: 1.6, ft: 0.25, fk: -0.25, bt: -0.5, bk: -0.9 } },
  sweep: { w: { hy: 30, lean: 0.4, fs: 0.8, fe: 1.4, bs: 0.3, be: 1.4, ...CROUCH_LEGS }, s: { hy: 19, lean: 0.62, head: 0.1, fs: 0.1, fe: 0.3, bs: -0.7, be: 0.5, ft: 1.52, fk: -0.02, bt: -0.15, bk: -2.5, rot: 0.08 } },
  dive: { w: { ft: 1.3, fk: -2.0, bt: 0.8, bk: -2.0, fs: 2.5, fe: 0.5, bs: 2.2, be: 0.5, lean: 0 }, s: { lean: 0.28, ft: 0.5, fk: -0.04, bt: -0.6, bk: -1.7, fs: -2.4, fe: 0.3, bs: -2.0, be: 0.3, rot: 0.3 } },
  dashstrike: { w: { lean: 0.55, fs: 0.2, fe: 2.3, bs: -1.0, be: 0.5, ft: 1.0, fk: -0.7, bt: -0.8, bk: -0.5, hy: 48 }, s: { lean: 0.62, fs: 1.6, fe: 0.02, bs: -1.35, be: 0.4, hx: 12, hy: 48, ft: 1.05, fk: -0.55, bt: -0.95, bk: -0.45 } },
  slide: { w: { hy: 24, lean: -0.6, fs: 1.3, fe: 0.5, bs: -0.2, be: 0.6, ft: 1.45, fk: 0, bt: 1.0, bk: -1.6 }, s: { hy: 18, lean: -0.75, rot: -0.2, head: 0.3, fs: 1.2, fe: 0.5, bs: -0.3, be: 0.5, ft: 1.55, fk: 0, bt: 1.15, bk: -1.7 } },
  counter: { w: { hy: 50, lean: -0.08, fs: 1.1, fe: 1.5, bs: 2.7, be: 0.8, ...WIDE }, s: { hy: 50, lean: -0.1, fs: 1.1, fe: 1.5, bs: 2.75, be: 0.75, ...WIDE } },
  counterstrike: { w: { lean: 0.1, fs: 0.6, fe: 2.2, ...STANCE }, s: { lean: 0.42, fs: 1.58, fe: 0.0, bs: -0.5, be: 1.4, hx: 14, fF: [32, 0], fB: [-22, 0] } },
  beam: { w: { hy: 45, lean: -0.14, head: 0.1, fs: -0.75, fe: 1.95, bs: -0.85, be: 1.9, ...WIDE }, s: { hy: 47, lean: 0.18, fs: 1.56, fe: 0.02, bs: 1.5, be: 0.08, ...WIDE } },
  wave: { w: { hy: 56, lean: -0.22, fs: 2.7, fe: 0.4, bs: 2.2, be: 0.4, ...STANCE }, s: { hy: 34, lean: 0.7, fs: 0.9, fe: 0.04, bs: -0.4, be: 0.8, ...WIDE } },
  cast: { w: { fs: 0.4, fe: 2.4, lean: -0.05, ...STANCE }, s: { fs: 1.56, fe: 0.02, bs: 1.4, be: 0.3, lean: 0.2, ...WIDE } },
  spin: { w: { hy: 44, lean: 0.3, ...CROUCH_LEGS }, s: { lean: 0.1, fs: 1.6, fe: 0.0, bs: -1.6, be: 0.0, ft: 1.2, fk: -1.8, bt: 0.9, bk: -1.8 } },
  slam: { w: { fs: 2.95, fe: 0.3, bs: 2.85, be: 0.3, lean: -0.1, head: -0.2, ...AIR_TUCK }, s: { hy: 30, lean: 0.78, head: 0.1, fs: 0.55, fe: 0.1, bs: 0.35, be: 0.1, ...WIDE } },
  blink: { w: { hy: 40, lean: 0.3, fs: 0.8, fe: 1.6, bs: -0.4, be: 0.8, ...CROUCH_LEGS }, s: { hy: 44, lean: 0.25, fs: 1.3, fe: 0.8, bs: -0.6, be: 0.6, ...CROUCH_LEGS } },
  raise: { w: { hy: 50, lean: 0.1, fs: 0.2, fe: 1.8, bs: 0.3, be: 1.8, ...WIDE }, s: { hy: 56, lean: -0.15, head: -0.45, fs: 3.08, fe: 0.02, bs: 0.5, be: 1.9, ...WIDE } },
  stomp: { w: { hy: 58, ft: 1.75, fk: -1.75, fB: [-6, 0], lean: -0.12, fs: 1.8, fe: 0.4, bs: 1.6, be: 0.4 }, s: { hy: 36, lean: 0.32, fs: 0.4, fe: 0.2, bs: 0.3, be: 0.2, ...WIDE } },
  orb: { w: { fs: 0.8, fe: 1.4, bs: 0.8, be: 1.4, hy: 50, lean: -0.1, ...WIDE }, s: { fs: 1.45, fe: 0.3, bs: 1.35, be: 0.35, lean: 0.25, hy: 48, ...WIDE } },
  transform: { w: { hy: 40, lean: 0.5, head: 0.3, fs: 0.9, fe: 2.2, bs: 0.8, be: 2.2, ...WIDE }, s: { hy: 48, lean: -0.22, head: -0.4, fs: 2.45, fe: 0.15, bs: 2.35, be: 0.15, ...WIDE } },
};

// ── IK ────────────────────────────────────────────────────────────────
function legIK(hx, hy, fx, fy, a, b) {
  // local coords, y down. Hip at (hx, -hy), foot at (fx, fy).
  const Hy = -hy;
  let dx = fx - hx, dy = fy - Hy;
  let d = Math.hypot(dx, dy);
  const maxD = a + b - 0.5;
  if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
  d = Math.max(d, Math.abs(a - b) + 1);
  const base = Math.atan2(dx, dy); // angle from down
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const t = base + alpha; // knee forward
  const kx = hx + a * Math.sin(t), ky = Hy + a * Math.cos(t);
  const s = Math.atan2(hx + dx - kx, Hy + dy - ky);
  return [t, s - t];
}

export function resolvePose(src, L = LIMB) {
  const p = { ...BASE, ...src };
  if (src.fF) { const [t, k] = legIK(p.hx, p.hy, src.fF[0], src.fF[1], L.thigh, L.shin); p.ft = t; p.fk = k; }
  if (src.fB) { const [t, k] = legIK(p.hx, p.hy, src.fB[0], src.fB[1], L.thigh, L.shin); p.bt = t; p.bk = k; }
  delete p.fF; delete p.fB;
  return p;
}

// ── forward kinematics ────────────────────────────────────────────────
export function solveSkeleton(p, L = LIMB, extraRot = 0) {
  const s = Math.sin, c = Math.cos;
  const hip = [p.hx, -p.hy];
  const neck = [hip[0] + L.torso * s(p.lean), hip[1] - L.torso * c(p.lean)];
  const ha = p.lean + p.head;
  const hd = L.neck + L.headR;
  const head = [neck[0] + hd * s(ha), neck[1] - hd * c(ha)];
  const chest = [hip[0] + L.torso * 0.62 * s(p.lean), hip[1] - L.torso * 0.62 * c(p.lean)];
  const arm = (a1, e) => {
    const el = [neck[0] + L.ua * s(a1), neck[1] + L.ua * c(a1)];
    const a2 = a1 + e;
    return [el, [el[0] + L.fa * s(a2), el[1] + L.fa * c(a2)]];
  };
  const leg = (t, k) => {
    const kn = [hip[0] + L.thigh * s(t), hip[1] + L.thigh * c(t)];
    const a2 = t + k;
    return [kn, [kn[0] + L.shin * s(a2), kn[1] + L.shin * c(a2)]];
  };
  const [elbowF, handF] = arm(p.fs, p.fe);
  const [elbowB, handB] = arm(p.bs, p.be);
  const [kneeF, footF] = leg(p.ft, p.fk);
  const [kneeB, footB] = leg(p.bt, p.bk);
  const J = { hip, neck, head, chest, elbowF, handF, elbowB, handB, kneeF, footF, kneeB, footB };
  const r = p.rot + extraRot;
  if (r) {
    // rotate about the body's centre so flips look natural
    const px = (hip[0] + neck[0]) / 2, py = (hip[1] + neck[1]) / 2;
    const cr = c(r), sr = s(r);
    for (const k in J) {
      const [x, y] = J[k];
      const dx = x - px, dy = y - py;
      J[k] = [px + dx * cr - dy * sr, py + dx * sr + dy * cr];
    }
  }
  return J;
}

// ── state → target pose ───────────────────────────────────────────────
const cache = new Map();
function cached(key, src, L) {
  const k = key + (L.id || '');
  let v = cache.get(k);
  if (!v) { v = resolvePose(src, L); cache.set(k, v); }
  return v;
}

export function targetPose(f, view, L) {
  const st = f.state;
  if (st === 'move') {
    const m = MOVES[f.move.id];
    const a = ANIMS[m.anim] || ANIMS.jab1;
    const fr = f.move.f;
    let phase = fr < m.startup ? 'w' : 's';
    if (fr >= m.startup + m.active + m.recovery * 0.55) phase = 'r';
    if (phase === 'r') return { pose: f.grounded ? cached('idle', POSES.idle, L) : cached('fall', POSES.fall, L), k: 700 };
    let src = a[phase];
    if (!f.grounded && !src.ft && src.fF) {
      // grounded attack pose used in the air: tuck the legs instead of planting them
      const { fF, fB, ...upper } = src;
      src = { ...upper, ...AIR_TUCK };
      return { pose: resolvePose(src, L), k: phase === 's' ? 2600 : 1500 };
    }
    return { pose: cached(m.anim + phase, src, L), k: phase === 's' ? 2600 : 1500 };
  }
  switch (st) {
    case 'dash': {
      if (f.dashDir !== 0 && Math.sign(f.dashDir) !== f.facing) return { pose: cached('backdash', POSES.backdash, L), k: 1800 };
      return { pose: cached('dash', POSES.dash, L), k: 1800 };
    }
    case 'hitstun':
      return f.grounded ? { pose: cached('hurt', POSES.hurt, L), k: 1500 } : { pose: cached('hurtAir', POSES.hurtAir, L), k: 900 };
    case 'blockstun':
      return { pose: cached(f.crouch ? 'guardLow' : 'guard', f.crouch ? POSES.guardLow : POSES.guard, L), k: 2200 };
    case 'knockdown': return { pose: cached('knockdown', POSES.knockdown, L), k: 700 };
    case 'getup': return { pose: cached('getup', POSES.getup, L), k: 900 };
    case 'land': return { pose: cached('land', POSES.land, L), k: 1800 };
    case 'charge': return { pose: cached('charge', POSES.charge, L), k: 1600 };
    case 'victory': return { pose: cached('victory', POSES.victory, L), k: 500 };
    case 'intro': return { pose: cached('intro', POSES.intro, L), k: 400 };
    case 'air':
    case 'idle':
    default:
      break;
  }
  if (!f.grounded) {
    if (f.wallTouch !== 0 && f.vy > 0) return { pose: cached('wallslide', POSES.wallslide, L), k: 900 };
    const t = Math.max(0, Math.min(1, (f.vy + 500) / 1000));
    return { pose: blend(cached('rise', POSES.rise, L), cached('fall', POSES.fall, L), t), k: 800 };
  }
  if (f.guard && f.threat) return { pose: cached(f.crouch ? 'guardLow' : 'guard', f.crouch ? POSES.guardLow : POSES.guard, L), k: 2000 };
  if (f.crouch) return { pose: cached('crouch', POSES.crouch, L), k: 1400 };
  const speed = Math.abs(f.vx);
  if (speed > 30) return { pose: walkPose(view.walkPhase, f.vx * f.facing, speed, L), k: 1100 };
  const idle = { ...cached('idle', POSES.idle, L) };
  const br = Math.sin(view.time * 3.2);
  idle.hy -= 1.2 + br * 1.3; idle.fs += br * 0.05; idle.bs -= br * 0.04; idle.head += br * 0.02;
  const [t1, k1] = legIK(idle.hx, idle.hy, 18, 0, L.thigh, L.shin);
  const [t2, k2] = legIK(idle.hx, idle.hy, -20, 0, L.thigh, L.shin);
  idle.ft = t1; idle.fk = k1; idle.bt = t2; idle.bk = k2;
  return { pose: idle, k: 600 };
}

function walkPose(phase, dirVel, speed, L) {
  const fwd = dirVel >= 0;
  const amt = Math.min(1, speed / PHYS.walkSpeed);
  const stride = 22 * amt, lift = 13 * amt;
  const sp = Math.sin(phase), cp = Math.cos(phase);
  const hy = 53 - Math.abs(Math.sin(phase)) * 2.5 * amt;
  const lean = fwd ? 0.12 + 0.12 * amt : -0.02;
  const fx = 2 + sp * stride, fy = -Math.max(0, cp) * lift;
  const bx = -2 - sp * stride, by = -Math.max(0, -cp) * lift;
  const [ft, fk] = legIK(0, hy, fx, fy, L.thigh, L.shin);
  const [bt, bk] = legIK(0, hy, bx, by, L.thigh, L.shin);
  return {
    ...BASE, hy, lean, ft, fk, bt, bk,
    fs: 1.0 - sp * 0.25 * amt, fe: 1.7, bs: 0.6 + sp * 0.3 * amt, be: 1.9,
    head: -0.03, hx: 0, rot: 0,
  };
}

export function blend(a, b, t) {
  const o = {};
  for (const k of KEYS) o[k] = a[k] + (b[k] - a[k]) * t;
  return o;
}
