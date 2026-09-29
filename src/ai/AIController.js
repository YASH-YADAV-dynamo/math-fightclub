// CPU opponent. Reads the world (with a reaction delay) and emits the same
// input bitmask a human or a network peer would — so it's swappable.

import { IN, STAGE } from '../sim/constants.js';
import { MOVES } from '../sim/moves.js';
import { CHARACTERS } from '../sim/characters.js';

const lerp = (a, b, t) => a + (b - a) * t;

export function aiParams(level) {
  const t = Math.min(1, Math.max(0, (level - 1) / 9));
  return {
    level,
    reaction: Math.round(lerp(26, 5, t)),   // frames of perception delay
    think: Math.round(lerp(22, 7, t)),       // frames between decisions
    aggression: lerp(0.35, 0.9, t),
    block: lerp(0.08, 0.82, t),
    combo: lerp(0.15, 1, t),
    antiAir: lerp(0.05, 0.75, t),
    zoning: lerp(0.15, 0.6, t),
    useKi: level >= 2,
    useUnique: level >= 2,
    useSuper: level >= 3,
    useTransform: level >= 4,
    dashy: lerp(0.1, 0.55, t),
    whiff: lerp(0.35, 0.04, t),              // chance to fumble an action
  };
}

// symbolic direction tokens resolved each frame against current facing
const F = 'F', B = 'B', U = 'U', D = 'D';

export class AIController {
  constructor(slot, level, seed = 99) {
    this.slot = slot;
    this.p = aiParams(level);
    this.queue = [];
    this.cool = 0;
    this.history = [];
    this.seed = seed >>> 0 || 1;
    this.holdGuard = 0;
    this.lastOppState = '';
  }

  rnd() {
    this.seed ^= this.seed << 13; this.seed >>>= 0;
    this.seed ^= this.seed >>> 17;
    this.seed ^= this.seed << 5; this.seed >>>= 0;
    return this.seed / 4294967296;
  }

  // push a sequence: [[tokens, frames], ...]  tokens like 'F+J' or 'U+F+J'
  plan(seq) { for (const [tok, n] of seq) this.queue.push({ tok, n }); }

  resolve(tok, me) {
    if (!tok) return 0;
    let m = 0;
    for (const t of tok.split('+')) {
      switch (t) {
        case F: m |= me.facing > 0 ? IN.RIGHT : IN.LEFT; break;
        case B: m |= me.facing > 0 ? IN.LEFT : IN.RIGHT; break;
        case U: m |= IN.UP; break;
        case D: m |= IN.DOWN; break;
        case 'J': m |= IN.ATK; break;
        case 'K': m |= IN.JUMP; break;
        case 'L': m |= IN.DASH; break;
        case 'US': m |= IN.SPEC; break;
        case 'I': m |= IN.UNIQ; break;
        case 'O': m |= IN.POW; break;
      }
    }
    return m;
  }

  update(world) {
    const me = world.fighters[this.slot];
    const op = world.fighters[1 - this.slot];
    // perception delay: remember opponent snapshots, act on an old one
    this.history.push({ x: op.x, y: op.y, vy: op.vy, state: op.state, move: op.move && op.move.id, mf: op.move && op.move.f, grounded: op.grounded });
    if (this.history.length > 40) this.history.shift();
    const seen = this.history[Math.max(0, this.history.length - 1 - this.p.reaction)];

    if (world.phase !== 'fight') { this.queue.length = 0; return 0; }
    if (me.state === 'hitstun' || me.state === 'knockdown' || me.state === 'ko') { this.queue.length = 0; this.holdGuard = 0; return 0; }

    // defensive reflex (interrupts plans)
    if (me.threat && (me.state === 'idle' || me.state === 'blockstun' || me.state === 'charge') && me.grounded) {
      if (this.holdGuard > 0 || this.rnd() < this.p.block * 0.25) {
        const low = this.oppLow(world, op, seen);
        if (this.holdGuard <= 0) this.holdGuard = 10 + Math.floor(this.rnd() * 10);
        this.holdGuard--;
        this.queue.length = 0;
        return this.resolve(low ? 'B+D' : B, me);
      }
    }
    this.holdGuard = 0;

    if (me.state === 'charge' && Math.abs(op.x - me.x) < 260) { this.queue.length = 0; return 0; }
    if (this.queue.length) {
      const q = this.queue[0];
      const m = this.resolve(q.tok, me);
      if (--q.n <= 0) this.queue.shift();
      return m;
    }
    if (--this.cool > 0) return this.idleDrift(me, op);
    this.cool = this.p.think + Math.floor(this.rnd() * 6);
    this.decide(world, me, op, seen);
    return 0;
  }

  oppLow(world, op, seen) {
    const id = op.move && op.move.id;
    if (id && MOVES[id].low) return true;
    return world.projectiles.some((p) => p.owner === op.slot && (p.type === 'wave' || p.type === 'delta_shock'));
  }

  idleDrift(me, op) {
    const dx = Math.abs(op.x - me.x);
    if (dx > 260 && this.p.aggression > 0.4) return this.resolve(F, me);
    return 0;
  }

  decide(world, me, op, seen) {
    const p = this.p;
    const r = () => this.rnd();
    if (r() < p.whiff) return; // hesitate
    const dx = Math.abs(seen.x - me.x);
    const dy = seen.y - me.y;
    const c = CHARACTERS[me.charId];
    const oppVulnerable = seen.state === 'hitstun' || seen.state === 'getup' || (seen.state === 'move' && seen.mf > (MOVES[seen.move]?.startup ?? 0) + (MOVES[seen.move]?.active ?? 0));
    const nearWall = me.x < STAGE.leftWall + 120 || me.x > STAGE.rightWall - 120;
    const beamCost = me.transformed ? 22 : 35;

    // resources first
    if (p.useTransform && me.ki >= 100 && !me.transformed && dx > 200 && r() < 0.6) { this.plan([['O', 2]]); return; }
    if (p.useSuper && me.spec >= 100 && r() < 0.55) {
      const good = { sigma_super: dx < 700, pi_super: dx < 330, nabla_super: dx < 780, omega_super: dx < 520 }[c.special];
      if (good) { this.plan([['US', 2]]); return; }
    }

    // anti-air
    if (!seen.grounded && dy < -40 && dx < 170 && seen.vy > -200 && r() < p.antiAir) { this.plan([['U+J', 2], ['', 8]]); return; }

    // punish / pressure when opponent is open
    if (oppVulnerable && dx < 150 && r() < p.aggression) { this.comboString(me, dx); return; }

    if (p.useUnique && me.uniqueCd === 0 && me.ki >= 20 && r() < 0.28) {
      const ok = { sigma_barrage: dx > 250, pi_spin: dx < 220, nabla_slam: dx < 260, omega_blink: dx > 220 || nearWall }[c.unique];
      if (ok) {
        this.plan([['I', 2], ['', 10]]);
        if (c.unique === 'omega_blink' && r() < p.combo) this.plan([['', 4], ['J', 2], ['', 5], ['J', 2], ['', 5], ['U+J', 2]]);
        return;
      }
    }

    // power up from a safe distance
    if (p.useKi && me.ki < 55 && dx > 460 && seen.state !== 'move' && r() < 0.3) { this.plan([['O', 30 + Math.floor(r() * 40)]]); return; }

    if (dx > 380) {
      const roll = r();
      if (p.useKi && me.ki >= beamCost && roll < p.zoning * 0.5) { this.plan([['U+F+J', 2], ['', 30]]); return; }
      if (p.useKi && me.ki >= 20 && roll < p.zoning) { this.plan([['D+F+J', 2], ['', 12]]); return; }
      if (roll < p.zoning + p.dashy * 0.5) { this.plan([['F+L', 2], ['F', 6]]); return; }
      if (roll < 0.9) { this.plan([[F, 16 + Math.floor(r() * 14)]]); return; }
      this.plan([['F+K', 10], ['F', 12], ['F+J', 2]]);
      return;
    }

    if (dx > 150) {
      const roll = r();
      if (roll < p.dashy) { this.plan([['F+L', 2], ['', 3], ['J', 2], ['', 4]]); return; }
      if (roll < p.dashy + 0.18) { this.plan([['F+K', 12], ['F', 8], ['F+J', 2], ['', 6]]); return; } // jump-in
      if (roll < p.dashy + 0.3 && dx < 260) { this.plan([['D+L', 2], ['', 16]]); return; }   // slide
      if (p.useKi && me.ki >= 20 && roll < p.dashy + 0.4) { this.plan([['D+F+J', 2], ['', 10]]); return; }
      this.plan([[F, 10 + Math.floor(r() * 12)]]);
      return;
    }

    // close range
    const roll = r();
    if (roll < p.aggression) { this.comboString(me, dx); return; }
    if (roll < p.aggression + 0.1) { this.plan([['D+J', 2], ['', 10]]); return; }
    if (roll < p.aggression + 0.16 && me.ki >= 15) { this.plan([['B+J', 2], ['', 20]]); return; } // counter stance
    if (roll < p.aggression + 0.3) { this.plan([['B+L', 2], ['', 8]]); return; } // backdash
    this.plan([['B', 14]]); // guard / space out
  }

  comboString(me, dx) {
    const p = this.p;
    const r = () => this.rnd();
    const seq = [['J', 2], ['', 5], ['J', 2], ['', 5], ['J', 2], ['', 5]];
    if (r() < p.combo) {
      const roll = r();
      const beamCost = me.transformed ? 22 : 35;
      if (roll < 0.35) {
        // launcher → jump cancel → air string
        seq.splice(4, 2);
        seq.push(['U+J', 2], ['', 6], ['K', 3], ['', 5], ['J', 2], ['', 5], ['F+J', 2], ['', 6]);
        if (r() < p.combo * 0.6) seq.push(['D+J', 2], ['', 8]);
      } else if (roll < 0.6 && me.ki >= beamCost && p.useKi) {
        seq.push(['U+F+J', 2], ['', 20]);
      } else if (roll < 0.8 && me.ki >= 20 && p.useKi) {
        seq.push(['D+F+J', 2], ['', 8]);
      } else if (me.uniqueCd === 0 && me.ki >= 20 && p.useUnique) {
        seq.push(['I', 2], ['', 8]);
      } else {
        seq.push(['F+L', 2], ['', 2], ['J', 2], ['', 6]);
      }
    } else if (r() < 0.5) {
      seq.length = 2 + Math.floor(r() * 3) * 2;
    }
    this.plan(seq);
  }
}
