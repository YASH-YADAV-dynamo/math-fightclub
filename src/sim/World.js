// Deterministic fixed-step fight simulation.
// State is plain JSON-able data (no classes, no engine refs), so a world can be
// snapshotted / restored for rollback netcode or run authoritatively on a server.

import { DT, STAGE, PHYS, BODY, METER, ROUND, IN, BUTTONS } from './constants.js';
import { CHARACTERS } from './characters.js';
import { MOVES, PROJECTILES } from './moves.js';

// ─── helpers ──────────────────────────────────────────────────────────
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const approach = (v, target, amt) => (v < target ? Math.min(v + amt, target) : Math.max(v - amt, target));
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function rand(w) {
  // mulberry32, state stored in world for determinism
  let t = (w.rng = (w.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const ev = (w, e) => w.events.push(e);
const charOf = (f) => CHARACTERS[f.charId];

export function dirsOf(f, mask) {
  const x = (mask & IN.RIGHT ? 1 : 0) - (mask & IN.LEFT ? 1 : 0);
  const y = (mask & IN.DOWN ? 1 : 0) - (mask & IN.UP ? 1 : 0);
  return { x, y, up: y < 0, down: y > 0, fwd: x !== 0 && x === f.facing, back: x !== 0 && x === -f.facing };
}

// ─── creation ─────────────────────────────────────────────────────────
export function createFighter(slot, charId, opts = {}) {
  const c = CHARACTERS[charId];
  const maxHp = Math.round(c.hp * (opts.hpMul ?? 1));
  return {
    slot, charId,
    x: slot === 0 ? 400 : 880, y: STAGE.groundY, vx: 0, vy: 0,
    facing: slot === 0 ? 1 : -1,
    grounded: true, platform: -1, dropFrames: 0, coyote: 0, wallTouch: 0, wallJumpLock: 0,
    maxHp, hp: maxHp, ki: opts.ki ?? 20, spec: opts.spec ?? 0, specTimer: 0,
    state: 'intro', sf: 0, move: null,
    hitstun: 0, blockstun: 0, lag: 0, invuln: 0, knockdown: false, bounced: false,
    airJumps: PHYS.airJumps, airDashes: PHYS.airDashes + (c.extraAirDash || 0),
    dashCd: 0, uniqueCd: 0, jumpCut: true, fastFall: false,
    crouch: false, guard: false, threat: false,
    combo: 0, comboDmg: 0, lastComboShown: 0,
    transformed: 0, dmgMul: opts.dmgMul ?? 1, kiRegenMul: opts.kiRegenMul ?? 1,
    buf: {}, bufDir: {}, input: 0, prev: 0,
    flash: 0, dashDir: 0, dashDirY: 0, lastDash: -99, lastHitFrame: -99,
    hitDir: 0, hitStrength: 0,
  };
}

export function createWorld({ p1, p2, seed = 1234, training = false, round = 1 }) {
  return {
    frame: 0, phase: 'intro', phaseFrame: 0, round,
    timer: ROUND.timeSeconds * 60,
    fighters: [createFighter(0, p1.charId, p1), createFighter(1, p2.charId, p2)],
    projectiles: [], events: [],
    hitstop: 0, superFreeze: 0, superOwner: -1,
    nextId: 1, rng: seed | 0, winner: -1, training,
  };
}

export const snapshot = (w) => JSON.parse(JSON.stringify(w));

// ─── main step ────────────────────────────────────────────────────────
export function step(w, inputs) {
  w.events = [];
  if (w.superFreeze > 0 || w.hitstop > 0) {
    // world is frozen, but keep buffering presses so combos typed during hitstop still land
    if (w.phase === 'fight') { readInput(w.fighters[0], inputs[0] | 0, true); readInput(w.fighters[1], inputs[1] | 0, true); }
    if (w.superFreeze > 0) w.superFreeze--; else w.hitstop--;
    return;
  }

  w.frame++;
  w.phaseFrame++;
  const [a, b] = w.fighters;
  let in0 = inputs[0] | 0, in1 = inputs[1] | 0;

  if (w.phase === 'intro') {
    in0 = in1 = 0;
    if (w.phaseFrame === 1) ev(w, { t: 'round', round: w.round });
    if (w.phaseFrame >= ROUND.introFrames) {
      w.phase = 'fight'; w.phaseFrame = 0;
      for (const f of w.fighters) { f.state = 'idle'; f.sf = 0; }
      ev(w, { t: 'fight' });
    }
  } else if (w.phase === 'fight') {
    if (!w.training) w.timer--;
    if (w.timer <= 0) {
      w.timer = 0; w.phase = 'timeup'; w.phaseFrame = 0;
      const ra = a.hp / a.maxHp, rb = b.hp / b.maxHp;
      w.winner = ra > rb ? 0 : rb > ra ? 1 : -1;
      ev(w, { t: 'timeup', winner: w.winner });
    }
  } else {
    in0 = in1 = 0;
    const settle = w.phase === 'ko' ? ROUND.koFrames : 130;
    if (w.phaseFrame === 70 && w.winner >= 0) {
      const wf = w.fighters[w.winner];
      if (wf.state !== 'ko') { wf.state = 'victory'; wf.sf = 0; wf.move = null; }
    }
    if (w.phaseFrame >= settle && w.phase !== 'end') { w.phase = 'end'; ev(w, { t: 'end', winner: w.winner }); }
  }

  readInput(a, in0);
  readInput(b, in1);
  stepFighter(w, a, b);
  stepFighter(w, b, a);
  separate(a, b);
  updateProjectiles(w);

  if (w.training) {
    for (const f of w.fighters) {
      if (f.slot === 1 && f.state !== 'hitstun' && f.hp < f.maxHp && w.frame - f.lastHitFrame > 90) f.hp = Math.min(f.maxHp, f.hp + 12);
      if (f.slot === 0) { f.ki = Math.min(100, f.ki + 0.25); }
      if (f.hp <= 0) f.hp = 1;
    }
  }
}

// ─── input ────────────────────────────────────────────────────────────
function readInput(f, mask, frozen = false) {
  f.prev = f.input;
  f.input = mask;
  const pressed = mask & ~f.prev;
  for (const b of BUTTONS) {
    if (pressed & IN[b]) { f.buf[b] = PHYS.jumpBufferFrames + 1; f.bufDir[b] = mask & 15; }
    else if (f.buf[b] > 0 && !frozen) f.buf[b]--;
  }
}
const has = (f, b) => f.buf[b] > 0;
const use = (f, b) => { f.buf[b] = 0; };
const held = (f, bit) => (f.input & bit) !== 0;

// ─── fighter ──────────────────────────────────────────────────────────
const CONTROL = { idle: 1, air: 1 };

function stepFighter(w, f, o) {
  const c = charOf(f);
  f.sf++;
  if (f.dashCd > 0) f.dashCd--;
  if (f.uniqueCd > 0) f.uniqueCd--;
  if (f.invuln > 0) f.invuln--;
  if (f.flash > 0) f.flash--;
  if (f.dropFrames > 0) f.dropFrames--;
  if (f.coyote > 0) f.coyote--;
  if (f.wallJumpLock > 0) f.wallJumpLock--;
  if (f.transformed > 0) {
    f.transformed--;
    if (f.transformed === 0) ev(w, { t: 'untransform', slot: f.slot });
  }

  // meters — U auto-charges every 2 seconds (and on hits, see resolveHit)
  if (w.phase === 'fight' && f.state !== 'ko') {
    const boost = f.transformed ? 2.5 : 1;
    f.ki = Math.min(METER.kiMax, f.ki + METER.kiRegenPerSec * DT * boost * f.kiRegenMul);
    if (++f.specTimer >= METER.specTickFrames) {
      f.specTimer = 0;
      const before = f.spec;
      f.spec = Math.min(METER.specMax, f.spec + METER.specTickAmount * (f.transformed ? 1.5 : 1));
      if (before < 100 && f.spec >= 100) ev(w, { t: 'specReady', slot: f.slot });
    }
  }

  // threat = opponent is swinging at me or a projectile is incoming (used for guard pose + AI)
  f.threat = isThreatened(w, f, o);

  switch (f.state) {
    case 'intro':
    case 'victory':
      f.vx = approach(f.vx, 0, PHYS.groundFriction * DT);
      break;
    case 'ko':
      break;
    case 'hitstun':
      if (--f.hitstun <= 0) {
        f.state = f.grounded ? 'idle' : 'air';
        f.sf = 0; f.knockdown = false; f.bounced = false;
        endCombo(w, f);
      }
      break;
    case 'blockstun':
      f.vx = approach(f.vx, 0, PHYS.hitstunFriction * DT);
      if (--f.blockstun <= 0) { f.state = 'idle'; f.sf = 0; }
      break;
    case 'knockdown':
      if (f.sf >= 38) { f.state = 'getup'; f.sf = 0; f.invuln = 22; }
      break;
    case 'getup':
      if (f.sf >= 14) { f.state = 'idle'; f.sf = 0; endCombo(w, f); }
      break;
    case 'land':
      if (--f.lag <= 0) { f.state = 'idle'; f.sf = 0; }
      else tryAction(w, f, o, true); // allow buffered specials out of landing
      break;
    case 'charge':
      updateCharge(w, f, o);
      break;
    case 'dash':
      updateDash(w, f, o);
      break;
    case 'move':
      updateMove(w, f, o);
      break;
    default:
      control(w, f, o, c);
  }

  physics(w, f, c);

  // auto-face opponent in neutral
  if ((f.state === 'idle' || f.state === 'land' || (f.state === 'air' && f.wallJumpLock === 0)) && Math.abs(o.x - f.x) > 6) {
    f.facing = sign(o.x - f.x);
  }
}

function endCombo(w, f) {
  if (f.combo > 1) ev(w, { t: 'comboEnd', slot: f.slot, hits: f.combo, dmg: f.comboDmg });
  f.combo = 0; f.comboDmg = 0;
}

function isThreatened(w, f, o) {
  if (o.state === 'move') {
    const m = MOVES[o.move.id];
    if ((m.hitbox || m.script) && o.move.f < m.startup + m.active && Math.abs(o.x - f.x) < 320) return true;
  }
  for (const p of w.projectiles) {
    if (p.owner === f.slot) continue;
    const dx = f.x - p.x;
    if (p.kind === 'beam' || p.kind === 'spike' || p.kind === 'singularity') { if (Math.abs(dx) < 900) return true; }
    else if (Math.abs(dx) < 420 && sign(p.vx) === sign(dx)) return true;
  }
  return false;
}

// ─── neutral control ──────────────────────────────────────────────────
function control(w, f, o, c) {
  if (tryAction(w, f, o, false)) return;
  if (!f.grounded && f.state === 'idle') f.state = 'air';
  // DBZ-style power-up: hold O on the ground to charge Ki (you're wide open while doing it)
  if (f.grounded && held(f, IN.POW) && f.ki < METER.kiMax && w.phase === 'fight') {
    f.state = 'charge'; f.sf = 0; f.crouch = false; f.guard = false;
    ev(w, { t: 'chargeStart', slot: f.slot, x: f.x, y: f.y });
    return;
  }
  const d = dirsOf(f, f.input);
  const spd = PHYS.walkSpeed * c.speed * (f.transformed ? 1.12 : 1);

  if (f.grounded) {
    f.crouch = d.down;
    f.guard = d.back;
    let target = f.crouch ? 0 : d.x * spd * (d.back ? PHYS.backWalkMul : 1);
    if (f.guard && f.threat) target = 0; // blocking plants your feet
    const accel = Math.sign(target) !== Math.sign(f.vx) && f.vx !== 0 ? PHYS.groundFriction + PHYS.groundAccel * 0.5 : PHYS.groundAccel;
    f.vx = approach(f.vx, target, (target === 0 ? PHYS.groundFriction : accel) * DT);
  } else {
    f.crouch = false; f.guard = false;
    if (d.x !== 0 && f.wallJumpLock === 0) {
      const cap = Math.max(Math.abs(f.vx), spd * 1.08);
      f.vx = clamp(f.vx + d.x * PHYS.airAccel * DT, -cap, cap);
      // don't let air accel push beyond the cap in the input direction
      if (Math.abs(f.vx) > spd * 1.08 && sign(f.vx) === d.x) f.vx = approach(f.vx, d.x * spd * 1.08, PHYS.airDrag * DT);
    } else if (d.x === 0) {
      f.vx = approach(f.vx, 0, PHYS.airDrag * DT);
    }
    if (d.down && f.vy > -150 && !f.fastFall) { f.fastFall = true; ev(w, { t: 'fastfall', slot: f.slot }); }
    if (!held(f, IN.JUMP) && f.vy < 0 && !f.jumpCut) { f.vy *= PHYS.jumpCutMul; f.jumpCut = true; }
  }
}

// Buffered actions in priority order. Returns true if something started.
function tryAction(w, f, o, fromLanding) {
  const c = charOf(f);
  if (w.phase !== 'fight') return false;

  if (has(f, 'POW') && f.ki >= METER.kiMax && !f.transformed) { use(f, 'POW'); startMove(w, f, 'transform'); return true; }
  if (has(f, 'SPEC') && f.spec >= METER.specMax) {
    use(f, 'SPEC');
    f.spec = 0;
    startMove(w, f, c.special);
    w.superFreeze = 48; w.superOwner = f.slot;
    ev(w, { t: 'super', slot: f.slot, name: c.specialName, charId: f.charId });
    return true;
  }
  if (has(f, 'UNIQ') && f.uniqueCd === 0) {
    const m = MOVES[c.unique];
    if (f.ki >= m.cost && (f.grounded || m.airOk)) { use(f, 'UNIQ'); startMove(w, f, c.unique); return true; }
  }
  if (has(f, 'ATK')) { use(f, 'ATK'); startMove(w, f, selectAttack(f, dirsOf(f, f.bufDir.ATK | (f.input & 15)))); return true; }
  if (fromLanding) return false;
  if (has(f, 'DASH') && f.dashCd === 0 && (f.grounded || f.airDashes > 0)) { use(f, 'DASH'); startDash(w, f); return true; }
  if (has(f, 'JUMP')) return tryJump(w, f);
  return false;
}

function beamCost(f) { return f.transformed ? 22 : MOVES.beam.cost; }

function selectAttack(f, d) {
  if (f.grounded) {
    if (d.up && d.fwd) return f.ki >= beamCost(f) ? 'beam' : 'launcher';
    if (d.down && d.fwd) return f.ki >= MOVES.wave.cost ? 'wave' : 'sweep';
    if (d.up) return 'launcher';
    if (d.down) return 'sweep';
    if (d.back && f.ki >= MOVES.counter.cost) return 'counter';
    return 'jab1';
  }
  if (d.up && d.fwd && f.ki >= beamCost(f)) return 'beam';
  if (d.down) return 'dive';
  if (d.fwd) return 'airkick';
  return 'airpunch';
}

function tryJump(w, f) {
  const c = charOf(f);
  const d = dirsOf(f, f.input);
  const jv = c.jump;
  if (f.grounded || f.coyote > 0) {
    if (f.grounded && d.down && f.platform >= 0) {
      use(f, 'JUMP');
      f.grounded = false; f.platform = -1; f.dropFrames = 14; f.y += 3; f.vy = 120; f.state = 'air';
      ev(w, { t: 'drop', slot: f.slot });
      return true;
    }
    use(f, 'JUMP');
    f.vy = -PHYS.jumpVel * jv;
    f.vx += d.x * 90; // small directional kick for responsive jumps
    f.grounded = false; f.coyote = 0; f.state = 'air'; f.sf = 0; f.jumpCut = false; f.fastFall = false;
    ev(w, { t: 'jump', slot: f.slot, x: f.x, y: f.y });
    return true;
  }
  if (f.wallTouch !== 0) {
    use(f, 'JUMP');
    f.vx = -f.wallTouch * PHYS.wallJumpVx;
    f.vy = -PHYS.wallJumpVy * jv;
    f.facing = -f.wallTouch; f.wallJumpLock = 10;
    f.jumpCut = false; f.fastFall = false; f.state = 'air';
    f.airDashes = PHYS.airDashes + (c.extraAirDash || 0);
    ev(w, { t: 'walljump', slot: f.slot, x: f.x, y: f.y, dir: f.facing });
    return true;
  }
  if (f.airJumps > 0) {
    use(f, 'JUMP');
    f.airJumps--;
    f.vy = -PHYS.doubleJumpVel * jv;
    if (d.x !== 0) f.vx = d.x * Math.max(Math.abs(f.vx), PHYS.walkSpeed * c.speed); // re-aim momentum
    f.jumpCut = false; f.fastFall = false; f.state = 'air'; f.sf = 0;
    ev(w, { t: 'djump', slot: f.slot, x: f.x, y: f.y });
    return true;
  }
  return false;
}

// ─── Ki charge ────────────────────────────────────────────────────────
function updateCharge(w, f, o) {
  f.vx = approach(f.vx, 0, PHYS.groundFriction * DT);
  const stop = (why) => { f.state = 'idle'; f.sf = 0; ev(w, { t: 'chargeEnd', slot: f.slot, why }); };
  if (!held(f, IN.POW) || !f.grounded || w.phase !== 'fight') { stop('release'); return; }
  if (has(f, 'ATK') || has(f, 'JUMP') || has(f, 'DASH') || has(f, 'UNIQ') || has(f, 'SPEC')) { stop('cancel'); tryAction(w, f, o, false); return; }
  f.ki = Math.min(METER.kiMax, f.ki + METER.chargeRate * DT);
  f.spec = Math.min(METER.specMax, f.spec + 2.5 * DT);
  if (f.ki >= METER.kiMax) { ev(w, { t: 'kiMax', slot: f.slot, x: f.x, y: f.y }); stop('max'); }
}

// ─── dash / slide ─────────────────────────────────────────────────────
function startDash(w, f) {
  const c = charOf(f);
  const d = dirsOf(f, f.input);
  const spd = PHYS.dashSpeed * (c.speed * 0.5 + 0.5) * (f.transformed ? 1.1 : 1);
  if (f.grounded && d.down) {
    const dir = d.x || f.facing;
    f.facing = dir;
    startMove(w, f, 'slidekick');
    f.vx = dir * PHYS.slideSpeed * (c.speed * 0.5 + 0.5);
    f.dashCd = PHYS.dashCooldown;
    ev(w, { t: 'dash', slot: f.slot, x: f.x, y: f.y, dir, slide: true });
    return;
  }
  let dx = d.x, dy = f.grounded ? Math.min(0, d.y) : d.y;
  if (dx === 0 && dy === 0) dx = f.facing;
  const len = Math.hypot(dx, dy);
  dx /= len; dy /= len;
  f.state = 'dash'; f.sf = 0; f.move = null;
  f.dashDir = dx; f.dashDirY = dy;
  f.vx = dx * spd; f.vy = dy * spd * 0.85;
  if (dy < 0) f.grounded = false;
  if (!f.grounded) f.airDashes--;
  f.dashCd = PHYS.dashCooldown; f.invuln = Math.max(f.invuln, 6); f.lastDash = w.frame;
  f.fastFall = false; f.jumpCut = true;
  ev(w, { t: 'dash', slot: f.slot, x: f.x, y: f.y, dir: sign(dx) || f.facing, dy });
}

function updateDash(w, f, o) {
  const c = charOf(f);
  const spd = PHYS.dashSpeed * (c.speed * 0.5 + 0.5) * (f.transformed ? 1.1 : 1);
  if (f.sf <= 8) { f.vx = f.dashDir * spd; if (f.dashDirY) f.vy = f.dashDirY * spd * 0.85; }
  else { f.vx *= 0.82; if (f.dashDirY) f.vy *= 0.7; }

  // dash cancels: attack → vector strike, jump → momentum jump
  if (has(f, 'ATK') && f.sf >= 2) {
    use(f, 'ATK');
    if (sign(f.dashDir) === sign(o.x - f.x) || f.dashDir === 0) f.facing = sign(o.x - f.x) || f.facing;
    startMove(w, f, f.grounded ? 'dashstrike' : selectAttack(f, dirsOf(f, f.bufDir.ATK | (f.input & 15))));
    return;
  }
  if (has(f, 'SPEC') || has(f, 'UNIQ') || has(f, 'POW')) { if (tryAction(w, f, o, true)) return; }
  if (has(f, 'JUMP') && f.sf >= 3) {
    const vx = f.vx;
    f.state = f.grounded ? 'idle' : 'air';
    if (tryJump(w, f)) { f.vx = vx * 0.85; return; } // dash-jump keeps momentum
    f.state = 'dash';
  }
  if (f.sf >= PHYS.dashFrames) {
    f.state = f.grounded ? 'idle' : 'air'; f.sf = 0;
    if (!f.grounded) { f.vx *= 0.75; f.vy *= 0.4; }
  }
}

// ─── moves ────────────────────────────────────────────────────────────
function startMove(w, f, id) {
  const m = MOVES[id];
  const c = charOf(f);
  if (m.cost) f.ki = Math.max(0, f.ki - (id === 'beam' ? beamCost(f) : m.cost));
  if (m.cooldown) f.uniqueCd = f.transformed ? Math.round(m.cooldown / 2) : m.cooldown;
  f.state = 'move'; f.sf = 0;
  f.move = { id, f: 0, hit: {}, connected: false, data: {} };
  f.crouch = false; f.guard = false; f.fastFall = false;
  if (f.grounded && !m.keepMomentum) f.vx *= 0.35;
  let name = m.name;
  if (id === 'beam') name = c.beamName;
  else if (id === c.unique) name = c.uniqueName;
  else if (id === 'transform') name = c.transformName;
  if (name && !m.super) ev(w, { t: 'move', slot: f.slot, name, id });
  if (id === 'beam') ev(w, { t: 'beamCharge', slot: f.slot });
}

function endMove(f) {
  f.move = null;
  f.state = f.grounded ? 'idle' : 'air';
  f.sf = 0;
}

function inRange(r, fr) { return r && fr >= r[0] && fr <= r[1]; }

function updateMove(w, f, o) {
  const mi = f.move;
  const m = MOVES[mi.id];
  const fr = mi.f;
  const c = charOf(f);
  const spdMul = c.speed * (f.transformed ? 1.1 : 1);

  if (m.vel) for (const v of m.vel) {
    if (v.f === fr) {
      if (v.vx !== undefined) f.vx = v.vx * f.facing * spdMul;
      if (v.vy !== undefined) { f.vy = v.vy; if (v.vy < 0) f.grounded = false; }
    }
  }
  if (m.spawn) for (const s of m.spawn) if (s.f === fr) spawnProjectile(w, f, s.proj);
  if (m.invuln && fr === m.invuln[0]) f.invuln = Math.max(f.invuln, m.invuln[1] - m.invuln[0] + 1);
  if (fr === m.startup && (m.hitbox || m.spawn)) ev(w, { t: 'swing', slot: f.slot, heavy: !!m.heavy, id: mi.id });

  let hitActive = m.hitbox && fr >= m.startup && fr < m.startup + m.active;
  if (m.script) {
    const r = runScript(w, f, o, m, mi, fr);
    if (r === 'done') return;
    if (r !== undefined) hitActive = r;
  }
  if (m.dive) hitActive = fr >= m.startup && !f.grounded;
  if (hitActive && m.hitbox) meleeHit(w, f, o, m, mi);
  if (f.state !== 'move' || f.move !== mi) return; // got countered / switched move

  // chains & cancels
  const afterActive = fr >= m.startup + Math.min(2, m.active);
  if (has(f, 'ATK') && m.chain && afterActive) {
    const d = dirsOf(f, f.bufDir.ATK | (f.input & 15));
    const next = (mi.connected && (d.up || d.down || d.fwd && (d.up || d.down)))
      ? selectAttack(f, d) : m.chain[0];
    use(f, 'ATK'); startMove(w, f, next); return;
  }
  if (m.cancelable && mi.connected) {
    if (has(f, 'ATK')) {
      const d = dirsOf(f, f.bufDir.ATK | (f.input & 15));
      const next = selectAttack(f, d);
      if (next !== mi.id && next !== 'jab1' && next !== 'airpunch' && !(next === 'airkick' && mi.id === 'airkick')) {
        use(f, 'ATK'); startMove(w, f, next); return;
      }
    }
    if (has(f, 'SPEC') || has(f, 'UNIQ') || has(f, 'POW')) { if (tryAction(w, f, o, true)) return; }
    if (has(f, 'DASH') && f.dashCd === 0 && (f.grounded || f.airDashes > 0)) { use(f, 'DASH'); startDash(w, f); return; }
    if (m.jumpCancelOnHit && has(f, 'JUMP')) {
      f.state = 'air'; f.move = null;
      f.airJumps = Math.max(f.airJumps, 1);
      f.vy = Math.min(f.vy, 0);
      f.grounded = false;
      if (!tryJump(w, f)) { f.vy = -PHYS.doubleJumpVel; }
      return;
    }
  }

  mi.f++;
  if (m.dive && f.grounded && fr >= m.startup) {
    if (mi.f < m.startup + m.active) mi.f = m.startup + m.active;
  }
  if (m.landCancel && f.grounded && fr > 1) { toLand(f, 5); return; }
  if (mi.f >= m.startup + m.active + m.recovery) endMove(f);
}

function toLand(f, lag) {
  f.move = null; f.state = 'land'; f.lag = lag; f.sf = 0;
}

function meleeHit(w, f, o, m, mi) {
  const hb = m.hitbox;
  const box = {
    x: f.facing > 0 ? f.x + hb.x - hb.w / 2 : f.x - hb.x - hb.w / 2,
    y: f.y + hb.y - hb.h / 2, w: hb.w, h: hb.h,
  };
  if (!canBeHit(o)) return;
  const last = mi.hit[o.slot];
  if (last !== undefined && (!m.multi || w.frame - last < m.multi)) return;
  const hurt = hurtbox(o);
  if (!overlap(box, hurt)) return;
  mi.hit[o.slot] = w.frame;
  const px = (Math.max(box.x, hurt.x) + Math.min(box.x + box.w, hurt.x + hurt.w)) / 2;
  const py = (Math.max(box.y, hurt.y) + Math.min(box.y + box.h, hurt.y + hurt.h)) / 2;
  const r = resolveHit(w, f, o, m, { dir: f.facing, x: px, y: py, melee: true });
  if (r === 'hit' || r === 'blocked' || r === 'armored') mi.connected = true;
  if (r === 'hit' && m.script === 'pi_super') mi.data.confirmed = true;
}

function canBeHit(o) {
  return o.invuln <= 0 && o.state !== 'knockdown' && o.state !== 'ko' && o.state !== 'intro';
}

export function hurtbox(f) {
  let h = BODY.h;
  if (f.crouch && f.state === 'idle') h = BODY.crouchH;
  if (f.state === 'move' && MOVES[f.move.id].crouchPose) h = BODY.crouchH;
  if (f.state === 'knockdown' || f.state === 'getup') h = 40;
  return { x: f.x - BODY.w / 2, y: f.y - h, w: BODY.w, h };
}

// ─── scripted moves ───────────────────────────────────────────────────
const SERIES_GLYPHS = ['1', '½', '¼', '⅛', '1/16', '1/32', '1/64', '1/128', '…', 'Σ'];
const PI_DIGITS = ['3', '.', '1', '4', '1', '5', '9', '2'];

function runScript(w, f, o, m, mi, fr) {
  switch (m.script) {
    case 'counter':
      mi.data.active = fr >= m.startup && fr < m.startup + m.active;
      return false;

    case 'beam':
      if (fr === m.startup) {
        const p = spawnProjectile(w, f, 'beam');
        mi.data.beamId = p.id;
        ev(w, { t: 'beamFire', slot: f.slot, name: charOf(f).beamName });
      }
      if (!f.grounded) f.vy *= 0.7;
      return false;

    case 'slam': {
      if (fr === 2 && f.grounded) { f.vy = -820; f.grounded = false; f.vx = f.facing * 160; }
      if (fr >= m.startup && !mi.data.landed) {
        if (!f.grounded) { f.vy = Math.max(f.vy, 1900); f.vx = approach(f.vx, 0, 400 * DT); mi.f = Math.min(mi.f, m.startup + 2); }
        else {
          mi.data.landed = true;
          mi.f = m.startup + m.active - 6; mi.data.landF = mi.f;
          const s1 = spawnProjectile(w, f, 'delta_shock'); s1.x = f.x + 30; s1.vx = Math.abs(s1.vx); s1.dir = 1;
          const s2 = spawnProjectile(w, f, 'delta_shock'); s2.x = f.x - 30; s2.vx = -Math.abs(s2.vx); s2.dir = -1;
          ev(w, { t: 'quake', slot: f.slot, x: f.x, y: f.y, power: 1 });
          return true;
        }
        return false;
      }
      if (mi.data.landed) {
        if (fr - mi.data.landF < 4) return true;
        return false;
      }
      return false;
    }

    case 'blink':
      if (fr === m.startup) {
        const fromX = f.x, fromY = f.y;
        const side = f.x < o.x ? 1 : -1; // appear on the far side
        let nx = o.x + side * 84;
        if (nx < STAGE.leftWall + 30 || nx > STAGE.rightWall - 30) nx = o.x - side * 84;
        f.x = clamp(nx, STAGE.leftWall + 22, STAGE.rightWall - 22);
        f.y = o.grounded ? o.y : Math.min(o.y, STAGE.groundY);
        f.grounded = o.grounded; f.platform = o.platform;
        f.vx = 0; f.vy = 0;
        f.facing = sign(o.x - f.x) || -side;
        ev(w, { t: 'blink', slot: f.slot, fromX, fromY, x: f.x, y: f.y });
      }
      return false;

    case 'transform':
      if (fr === 0) { f.ki = 0; ev(w, { t: 'transformStart', slot: f.slot }); }
      if (fr === m.startup) {
        f.transformed = METER.transformFrames;
        ev(w, { t: 'transform', slot: f.slot, x: f.x, y: f.y, name: charOf(f).transformName });
        const dx = o.x - f.x;
        if (Math.abs(dx) < 240 && canBeHit(o)) {
          resolveHit(w, f, o, { dmg: 20, stun: 22, block: 16, kbx: 700, kby: -420, hitstop: 8, spark: '!', heavy: true, unblockable: true },
            { dir: sign(dx) || f.facing, x: o.x, y: o.y - 60 });
        }
      }
      return false;

    case 'sigma_super':
      if (fr >= m.startup && fr < m.startup + 60 && (fr - m.startup) % 6 === 0) {
        const k = (fr - m.startup) / 6;
        const p = spawnProjectile(w, f, 'series', { glyph: SERIES_GLYPHS[k] });
        p.x = o.x + (rand(w) - 0.5) * 90; p.y = -40; p.vx = 0; p.vy = 300;
      }
      if (fr === m.startup + 66) {
        const p = spawnProjectile(w, f, 'series_final');
        p.x = o.x; p.y = -120; p.vx = 0; p.vy = 600;
      }
      return false;

    case 'pi_super':
      if (fr === m.startup) f.vx = f.facing * 1750;
      if (mi.data.confirmed) {
        startMove(w, f, 'pi_super_seq');
        f.move.data.target = o.slot;
        return 'done';
      }
      if (fr === m.startup + m.active) f.vx *= 0.2;
      return undefined;

    case 'pi_seq': {
      // lock the victim in place while PI blinks around them
      if (o.state !== 'ko') {
        o.state = 'hitstun'; o.hitstun = Math.max(o.hitstun, 24); o.move = null;
        o.vx = 0; o.vy = fr < 64 ? -60 : o.vy;
        if (fr < 64 && o.grounded && fr === 0) { o.y -= 40; o.grounded = false; }
      }
      f.vx = 0; f.vy = 0;
      if (fr < 64 && fr % 8 === 0) {
        const k = fr / 8;
        const side = k % 2 === 0 ? -1 : 1;
        f.x = clamp(o.x + side * 78, STAGE.leftWall + 22, STAGE.rightWall - 22);
        f.y = o.y; f.grounded = false;
        f.facing = sign(o.x - f.x) || 1;
        ev(w, { t: 'blink', slot: f.slot, fromX: f.x, fromY: f.y, x: f.x, y: f.y, quiet: true });
        if (o.state !== 'ko') resolveHit(w, f, o, { dmg: 24, stun: 30, block: 10, kbx: 0, kby: 0, hitstop: 3, spark: PI_DIGITS[k], unblockable: true, super: true },
          { dir: f.facing, x: o.x, y: o.y - 70, keepVel: true });
      }
      if (fr === 64 && o.state !== 'ko') {
        resolveHit(w, f, o, { dmg: 90, stun: 50, block: 20, kbx: 820, kby: -1050, hitstop: 18, spark: 'π', heavy: true, knockdown: true, unblockable: true, super: true },
          { dir: f.facing, x: o.x, y: o.y - 70 });
      }
      return false;
    }

    case 'nabla_super':
      if (fr === m.startup) ev(w, { t: 'quake', slot: f.slot, x: f.x, y: f.y, power: 2 });
      if (fr >= m.startup && (fr - m.startup) % 6 === 0) {
        const k = (fr - m.startup) / 6;
        if (k <= 7) {
          const x = f.x + f.facing * (95 + k * 108);
          if (x > STAGE.leftWall && x < STAGE.rightWall) {
            const p = spawnProjectile(w, f, k === 7 ? 'spike_final' : 'spike');
            p.x = x; p.y = STAGE.groundY; p.vx = 0;
            ev(w, { t: 'spike', x, y: p.y, big: k === 7 });
          }
        }
      }
      return false;
  }
  return undefined;
}

// ─── hit resolution ───────────────────────────────────────────────────
function resolveHit(w, att, def, p, opt) {
  const dir = opt.dir || 1;
  const x = opt.x ?? def.x, y = opt.y ?? def.y - 70;
  const attChar = charOf(att);
  def.lastHitFrame = w.frame;

  // % modulo counter
  if (def.state === 'move' && def.move.id === 'counter' && def.move.data.active && !p.super && !p.unblockable) {
    def.facing = sign(att.x - def.x) || def.facing;
    startMove(w, def, 'counterstrike');
    w.hitstop = Math.max(w.hitstop, 12);
    ev(w, { t: 'counter', slot: def.slot, x, y });
    return 'countered';
  }

  // guarding
  const d = dirsOf(def, def.input);
  const attackFrom = opt.fromX ?? att.x;
  const holdingAway = d.x !== 0 && d.x === -sign(attackFrom - def.x || -dir);
  const canGuard = def.grounded && (def.state === 'idle' || def.state === 'blockstun' || def.state === 'land');
  const crouching = d.down;
  const guarded = canGuard && holdingAway && !p.unblockable && !(p.low && !crouching) && !(p.air && crouching);
  const mul = attChar.power * att.dmgMul * (att.transformed ? 1.25 : 1);

  if (guarded) {
    const chip = Math.max(1, Math.round(p.dmg * mul * 0.12));
    def.hp = Math.max(1, def.hp - chip);
    def.state = 'blockstun'; def.blockstun = p.block || 10; def.sf = 0; def.move = null;
    def.crouch = crouching; def.guard = true;
    def.vx = -sign(attackFrom - def.x || -dir) * (Math.abs(p.kbx) * 0.45 + 160) / charOf(def).weight;
    w.hitstop = Math.max(w.hitstop, Math.ceil((p.hitstop || 4) * 0.6));
    att.ki = Math.min(100, att.ki + 1.5);
    def.ki = Math.min(100, def.ki + 2);
    ev(w, { t: 'block', slot: def.slot, x, y, heavy: !!p.heavy });
    return 'blocked';
  }

  // super armor
  if (def.state === 'move' && inRange(MOVES[def.move.id].armor, def.move.f) && !p.super) {
    const dmg = Math.round(p.dmg * mul * 0.55);
    def.hp = Math.max(1, def.hp - dmg);
    def.flash = 4;
    w.hitstop = Math.max(w.hitstop, 5);
    ev(w, { t: 'armor', slot: def.slot, x, y, dmg });
    return 'armored';
  }

  // clean hit
  const scaling = Math.max(0.35, 1 - 0.085 * def.combo);
  const dmg = Math.max(1, Math.round(p.dmg * mul * scaling));
  const prevHp = def.hp;
  def.hp = Math.max(0, def.hp - dmg);
  def.combo++; def.comboDmg += dmg;

  // kill any beam the victim was firing
  if (def.state === 'move') for (const pr of w.projectiles) if (pr.owner === def.slot && pr.kind === 'beam') pr.dead = true;

  def.state = 'hitstun'; def.sf = 0; def.move = null;
  def.hitstun = p.stun || 14; def.crouch = false; def.guard = false; def.fastFall = false;
  def.knockdown = !!p.knockdown;
  def.hitDir = dir; def.hitStrength = Math.min(1, (Math.abs(p.kbx) + Math.abs(p.kby)) / 1200 + (p.heavy ? 0.3 : 0));

  if (!opt.keepVel) {
    const wmul = 1 / charOf(def).weight;
    const juggle = 1 + Math.min(0.4, def.combo * 0.025);
    def.vx = dir * (p.kbx || 0) * wmul * juggle;
    if (p.kby) {
      def.vy = p.kby * (p.kby < 0 ? Math.sqrt(wmul) : 1);
      if (def.vy < 0) def.grounded = false;
    } else if (!def.grounded) {
      def.vy = Math.min(def.vy, -260); // air hits pop you up a little: juggles
    }
  }

  // meters
  att.spec = Math.min(METER.specMax, att.spec + dmg * METER.specOnHitMul * (att.transformed ? 1.5 : 1));
  att.ki = Math.min(METER.kiMax, att.ki + dmg * METER.kiOnHitMul);
  def.spec = Math.min(METER.specMax, def.spec + dmg * METER.specOnHurtMul);
  def.ki = Math.min(METER.kiMax, def.ki + dmg * METER.kiOnHurtMul);

  w.hitstop = Math.max(w.hitstop, p.hitstop || 4);
  def.flash = 5;
  ev(w, { t: 'hit', slot: def.slot, att: att.slot, x, y, dmg, heavy: !!p.heavy, glyph: p.spark || '*', combo: def.combo, dir, charId: att.charId });

  if (def.hp <= 0 && prevHp > 0) {
    def.state = 'ko'; def.knockdown = true; def.invuln = 9999;
    def.vx = dir * Math.max(Math.abs(def.vx) * 1.3, 650);
    def.vy = Math.min(def.vy, -760);
    def.grounded = false;
    const other = w.fighters[1 - def.slot];
    if (w.phase === 'fight') {
      w.phase = 'ko'; w.phaseFrame = 0;
      w.winner = other.hp > 0 ? other.slot : -1;
      w.hitstop = 24;
      ev(w, { t: 'ko', slot: def.slot, winner: w.winner, x, y, perfect: other.hp === other.maxHp });
    }
  }
  return 'hit';
}

// ─── physics ──────────────────────────────────────────────────────────
function physics(w, f, c) {
  const mi = f.move;
  const m = mi && MOVES[mi.id];
  const noGrav = (m && inRange(m.noGrav, mi.f)) || (f.state === 'dash' && !f.grounded && f.sf <= 9);

  if (!f.grounded && !noGrav) {
    let g = PHYS.gravity;
    if (f.vy > 0) g *= PHYS.fallGravityMul;
    if (f.state === 'hitstun' || f.state === 'ko') g *= 1 + Math.min(0.5, f.combo * 0.035);
    if (f.fastFall && CONTROL[f.state]) g *= PHYS.fastFallMul;
    if (c.floaty && f.vy > 0 && held(f, IN.JUMP) && CONTROL[f.state]) g *= 0.35;
    f.vy += g * DT;
    const maxF = f.fastFall ? PHYS.fastFallMax : (c.floaty && held(f, IN.JUMP) && CONTROL[f.state] ? 380 : PHYS.maxFall);
    if (f.vy > maxF) f.vy = maxF;
  }

  if (f.grounded) {
    if (f.state === 'hitstun' || f.state === 'knockdown' || f.state === 'ko') f.vx = approach(f.vx, 0, PHYS.hitstunFriction * DT);
    else if (f.state === 'move') f.vx = approach(f.vx, 0, (m.keepMomentum ? 1300 : PHYS.groundFriction) * DT);
    else if (f.state === 'land' || f.state === 'getup' || f.state === 'victory') f.vx = approach(f.vx, 0, PHYS.groundFriction * DT);
  }

  const prevY = f.y;
  f.x += f.vx * DT;
  f.y += f.vy * DT;

  // walls (with wall bounce on hard knockback, wall slide when pressing into them)
  const half = BODY.w / 2;
  f.wallTouch = 0;
  for (const side of [-1, 1]) {
    const limit = side < 0 ? STAGE.leftWall + half : STAGE.rightWall - half;
    if ((side < 0 && f.x <= limit) || (side > 0 && f.x >= limit)) {
      f.x = limit;
      const into = f.vx * side;
      if ((f.state === 'hitstun' || f.state === 'ko') && into > PHYS.wallBounceMin) {
        f.vx = -f.vx * 0.48;
        f.vy = Math.min(f.vy, -320);
        ev(w, { t: 'wallbounce', slot: f.slot, x: f.x + side * half, y: f.y - 60, side });
      } else if (into > 0) f.vx = 0;
    }
    if (!f.grounded && Math.abs(f.x - limit) < 6) {
      {
        f.wallTouch = side;
        if (f.state === 'air' && (f.input & (side < 0 ? IN.LEFT : IN.RIGHT)) && f.vy > PHYS.wallSlideMax) {
          f.vy = PHYS.wallSlideMax;
          if (w.frame % 5 === 0) ev(w, { t: 'wallslide', slot: f.slot, x: f.x + side * half, y: f.y - 40 });
        }
      }
    }
  }
  if (f.y < -400) { f.y = -400; if (f.vy < 0) f.vy = 0; }

  // floor + one-way platforms
  let landedOn = null;
  if (f.y > STAGE.groundY && f.vy < 0) f.y = STAGE.groundY; // e.g. wall bounce while skidding on the floor
  if (f.vy >= 0) {
    if (f.y >= STAGE.groundY) { f.y = STAGE.groundY; landedOn = -1; }
    else if (f.dropFrames <= 0) {
      for (let i = 0; i < STAGE.platforms.length; i++) {
        const p = STAGE.platforms[i];
        if (prevY <= p.y + 0.5 && f.y >= p.y && f.x >= p.x1 - 10 && f.x <= p.x2 + 10) { f.y = p.y; landedOn = i; break; }
      }
    }
  }
  if (landedOn !== null) {
    const impact = f.vy;
    const wasAir = !f.grounded;
    f.grounded = true; f.platform = landedOn;
    if (wasAir && onLand(w, f, impact)) { f.grounded = false; }
    else f.vy = 0;
  } else if (f.grounded) {
    const p = f.platform >= 0 ? STAGE.platforms[f.platform] : null;
    if (p && (f.x < p.x1 - 10 || f.x > p.x2 + 10)) {
      f.grounded = false; f.platform = -1;
      if (CONTROL[f.state]) { f.state = 'air'; f.coyote = PHYS.coyoteFrames; }
    } else if (!p && f.y < STAGE.groundY - 0.5) f.grounded = false;
  }
}

// returns true if the fighter should stay airborne (bounce)
function onLand(w, f, impact) {
  const c = charOf(f);
  f.airJumps = PHYS.airJumps;
  f.airDashes = PHYS.airDashes + (c.extraAirDash || 0);
  f.fastFall = false; f.jumpCut = true;

  if (f.state === 'hitstun' || f.state === 'ko') {
    if ((f.knockdown || f.state === 'ko') && impact > PHYS.groundBounceMin && !f.bounced) {
      f.bounced = true;
      f.vy = -impact * 0.42;
      f.vx *= 0.8;
      ev(w, { t: 'groundbounce', slot: f.slot, x: f.x, y: f.y, power: impact });
      return true;
    }
    if (f.state === 'ko') { f.vx *= 0.6; ev(w, { t: 'land', slot: f.slot, x: f.x, y: f.y, hard: true }); return false; }
    if (f.knockdown || impact > 900) {
      f.state = 'knockdown'; f.sf = 0; f.hitstun = 0; f.knockdown = false; f.bounced = false; f.vx *= 0.5;
      endCombo(w, f);
      ev(w, { t: 'land', slot: f.slot, x: f.x, y: f.y, hard: true });
      return false;
    }
    f.hitstun = Math.min(f.hitstun, 8);
    return false;
  }
  if (f.state === 'air') {
    f.state = 'land'; f.sf = 0;
    f.lag = impact > 1500 ? PHYS.hardLandingLag : PHYS.landingLag;
    ev(w, { t: 'land', slot: f.slot, x: f.x, y: f.y, hard: impact > 1500 });
    return false;
  }
  if (f.state === 'dash') { f.vy = 0; ev(w, { t: 'land', slot: f.slot, x: f.x, y: f.y }); return false; }
  if (f.state === 'move') {
    const m = MOVES[f.move.id];
    if (m.dive) ev(w, { t: 'quake', slot: f.slot, x: f.x, y: f.y, power: 0.6 });
    else if (!m.landCancel && m.air) { toLand(f, 6); }
    ev(w, { t: 'land', slot: f.slot, x: f.x, y: f.y, hard: !!m.dive });
  }
  return false;
}

// pushboxes: fighters can't overlap, but can jump over each other
function separate(a, b) {
  if (a.state === 'ko' || b.state === 'ko') return;
  if (Math.abs(a.y - b.y) > BODY.h * 0.72) return;
  const dx = b.x - a.x;
  const minD = BODY.w * 0.95;
  if (Math.abs(dx) >= minD) return;
  const s = dx === 0 ? (a.slot === 0 ? 1 : -1) : sign(dx);
  const push = (minD - Math.abs(dx)) / 2;
  a.x -= s * push; b.x += s * push;
  const lo = STAGE.leftWall + BODY.w / 2, hi = STAGE.rightWall - BODY.w / 2;
  for (const [f, g] of [[a, b], [b, a]]) {
    if (f.x < lo) { g.x += lo - f.x; f.x = lo; }
    if (f.x > hi) { g.x -= f.x - hi; f.x = hi; }
  }
}

// ─── projectiles ──────────────────────────────────────────────────────
function spawnProjectile(w, f, type, extra = {}) {
  const P = PROJECTILES[type];
  const c = charOf(f);
  let glyph = extra.glyph ?? P.glyph;
  if (type === 'sigma_small') glyph = c.glyphs[(w.frame >> 1) % 3 === 0 ? 0 : (w.frame % 2 ? 1 : 2)];
  if (type === 'wave') glyph = f.charId === 'sigma' ? '∫' : c.glyphs[0];
  if (type === 'beam') glyph = c.glyphs[0];
  const big = f.transformed > 0;
  const p = {
    id: w.nextId++, type, kind: P.kind, owner: f.slot,
    x: f.x + f.facing * 52, y: f.y + (P.y || 0), vx: f.facing * (P.speed || 0), vy: 0,
    w: P.w * (big ? 1.2 : 1), h: P.h * (big ? 1.2 : 1),
    life: P.life || 0, age: 0, dir: f.facing, glyph, size: P.size, big,
    hit: {}, dead: false, len: 0, clash: false,
    ...extra,
  };
  if (p.kind === 'beam') p.h = P.h * (big ? 1.45 : 1);
  w.projectiles.push(p);
  return p;
}

function projBox(p) {
  if (p.kind === 'beam') {
    const x0 = p.x;
    return p.dir > 0 ? { x: x0, y: p.y - p.h / 2, w: p.len, h: p.h } : { x: x0 - p.len, y: p.y - p.h / 2, w: p.len, h: p.h };
  }
  if (p.kind === 'spike') {
    const rise = Math.min(1, p.age / 4);
    return { x: p.x - p.w / 2, y: p.y - p.h * rise, w: p.w, h: p.h * rise };
  }
  if (p.kind === 'blast') return { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
  return { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
}

function updateProjectiles(w) {
  const list = w.projectiles;
  for (const p of list) {
    if (p.dead) continue;
    const P = PROJECTILES[p.type];
    const owner = w.fighters[p.owner];
    const target = w.fighters[1 - p.owner];
    p.age++;

    if (p.kind === 'beam') {
      if (owner.state !== 'move' || owner.move.id !== 'beam') { p.dead = true; ev(w, { t: 'beamEnd', slot: p.owner }); continue; }
      const m = MOVES.beam;
      p.dir = owner.facing;
      p.x = owner.x + owner.facing * 46;
      p.y = owner.y - 90;
      const wallDist = p.dir > 0 ? STAGE.rightWall - p.x : p.x - STAGE.leftWall;
      p.len = Math.min(p.len + 2800 * DT, wallDist);
      p.clash = false;
      if (owner.move.f >= m.startup + m.active) { p.dead = true; ev(w, { t: 'beamEnd', slot: p.owner }); continue; }
    } else {
      if (P.gravity) p.vy += P.gravity * DT;
      if (p.kind === 'singularity') {
        p.vx = approach(p.vx, 0, 60 * DT);
        const dx = p.x - target.x, dy = p.y - (target.y - 60);
        const dist = Math.hypot(dx, dy);
        if (dist < P.pullRadius && target.state !== 'ko' && target.invuln <= 0) {
          const k = (1 - dist / P.pullRadius) * P.pull * DT;
          target.vx += (dx / (dist || 1)) * k;
          if (!target.grounded || dy < -20) target.vy += (dy / (dist || 1)) * k * 0.6;
          if (target.state === 'idle' || target.state === 'air') target.vx = clamp(target.vx, -700, 700);
        }
        if (p.age >= p.life) {
          p.dead = true;
          const b = spawnProjectile(w, owner, 'singularity_blast');
          b.x = p.x; b.y = p.y; b.vx = 0;
          ev(w, { t: 'blast', x: p.x, y: p.y, slot: p.owner });
          continue;
        }
      }
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      if (P.groundDie && p.y >= STAGE.groundY - p.h * 0.3) {
        p.dead = true; ev(w, { t: 'impact', x: p.x, y: STAGE.groundY, glyph: p.glyph, big: p.type === 'series_final' });
        continue;
      }
      if (p.x < STAGE.leftWall - 60 || p.x > STAGE.rightWall + 60) { p.dead = true; continue; }
      if (p.life && p.age >= p.life) { p.dead = true; if (p.kind === 'glyph' || p.kind === 'wave') ev(w, { t: 'fizzle', x: p.x, y: p.y, glyph: p.glyph }); continue; }
    }

    // hit the opposing fighter
    const active = p.kind !== 'spike' || (p.age >= 2 && p.age <= p.life - 3);
    if (active && canBeHit(target)) {
      const last = p.hit[target.slot];
      const multi = P.multi;
      if (last === undefined || (multi && w.frame - last >= multi)) {
        const box = projBox(p);
        const hurt = hurtbox(target);
        if (overlap(box, hurt)) {
          p.hit[target.slot] = w.frame;
          const hx = p.kind === 'beam' ? target.x - p.dir * 20 : (Math.max(box.x, hurt.x) + Math.min(box.x + box.w, hurt.x + hurt.w)) / 2;
          const hy = (Math.max(box.y, hurt.y) + Math.min(box.y + box.h, hurt.y + hurt.h)) / 2;
          const dir = p.kind === 'blast' || p.kind === 'spike' ? (sign(target.x - p.x) || p.dir) : p.dir;
          const big = p.big ? 1.2 : 1;
          const params = { ...P, dmg: P.dmg * big, spark: p.glyph, unblockable: false };
          if (p.kind === 'singularity') { params.kbx = 0; params.kby = 0; }
          const r = resolveHit(w, owner, target, params, { dir, x: hx, y: hy, fromX: p.x, keepVel: p.kind === 'singularity' });
          if (r !== 'countered' && (p.kind === 'glyph' || p.kind === 'wave')) p.dead = true;
          if (r === 'countered' && (p.kind === 'glyph' || p.kind === 'wave')) p.dead = true;
        }
      }
    }
  }

  // projectile vs projectile clashes
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.dead) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.dead || a.owner === b.owner) continue;
      const A = projBox(a), B = projBox(b);
      if (!overlap(A, B)) continue;
      if (a.kind === 'beam' && b.kind === 'beam') {
        // beam struggle: both beams meet in the middle
        const mid = (a.x + b.x) / 2;
        a.len = Math.max(0, Math.abs(mid - a.x)); b.len = Math.max(0, Math.abs(mid - b.x));
        a.clash = b.clash = true;
        if (w.frame % 4 === 0) ev(w, { t: 'clash', x: mid, y: (a.y + b.y) / 2, beam: true });
        continue;
      }
      const pa = PROJECTILES[a.type].power, pb = PROJECTILES[b.type].power;
      if (a.kind === 'beam' || b.kind === 'beam') {
        const other = a.kind === 'beam' ? b : a;
        if (other.kind === 'glyph' || other.kind === 'wave') { other.dead = true; ev(w, { t: 'clash', x: other.x, y: other.y }); }
        continue;
      }
      if (pa >= 9 || pb >= 9) { if (pa < 9) a.dead = true; if (pb < 9) b.dead = true; }
      else if (pa === pb) { a.dead = b.dead = true; }
      else if (pa < pb) a.dead = true; else b.dead = true;
      ev(w, { t: 'clash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    }
  }

  w.projectiles = list.filter((p) => !p.dead);
}
