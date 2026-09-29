// Frame data. Hitboxes are relative to the fighter's feet, x = forward, y = up (negative).
// kbx is forward knockback, kby is vertical (negative = up). All in px/s.

const normal = { cancelable: true };

export const MOVES = {
  // ── Basic string: J, J, J ───────────────────────────────────────────
  jab1: {
    ...normal, anim: 'jab1', startup: 4, active: 3, recovery: 11,
    hitbox: { x: 46, y: -92, w: 58, h: 30 }, dmg: 30, stun: 17, block: 10,
    kbx: 170, kby: 0, hitstop: 5, spark: '+', chain: ['jab2'],
    vel: [{ f: 1, vx: 170 }],
  },
  jab2: {
    ...normal, anim: 'jab2', startup: 5, active: 3, recovery: 12,
    hitbox: { x: 50, y: -94, w: 62, h: 30 }, dmg: 34, stun: 19, block: 11,
    kbx: 200, kby: 0, hitstop: 6, spark: '×', chain: ['jab3'],
    vel: [{ f: 1, vx: 190 }],
  },
  jab3: {
    ...normal, anim: 'kick', startup: 7, active: 4, recovery: 17,
    hitbox: { x: 58, y: -70, w: 74, h: 40 }, dmg: 56, stun: 26, block: 14,
    kbx: 560, kby: -300, hitstop: 9, spark: '*', heavy: true,
    vel: [{ f: 2, vx: 260 }],
  },
  airkick: {
    ...normal, anim: 'airkick', startup: 5, active: 9, recovery: 12, air: true,
    hitbox: { x: 40, y: -44, w: 58, h: 48 }, dmg: 46, stun: 20, block: 12,
    kbx: 320, kby: 120, hitstop: 7, spark: '*', landCancel: true,
  },
  airpunch: {
    ...normal, anim: 'jab1', startup: 4, active: 4, recovery: 10, air: true,
    hitbox: { x: 48, y: -90, w: 60, h: 34 }, dmg: 30, stun: 18, block: 10,
    kbx: 180, kby: -180, hitstop: 5, spark: '+', landCancel: true, chain: ['airkick'],
  },
  // ── Directional normals ─────────────────────────────────────────────
  launcher: {
    ...normal, name: '√ ROOT UPPERCUT', anim: 'launcher', startup: 6, active: 6, recovery: 20,
    hitbox: { x: 34, y: -118, w: 54, h: 90 }, dmg: 64, stun: 38, block: 14,
    kbx: 110, kby: -1180, hitstop: 9, spark: '√', launch: true, heavy: true,
    vel: [{ f: 6, vx: 120, vy: -520 }], jumpCancelOnHit: true,
  },
  sweep: {
    ...normal, name: '⌊x⌋ FLOOR SWEEP', anim: 'sweep', startup: 7, active: 5, recovery: 19,
    hitbox: { x: 56, y: -16, w: 90, h: 28 }, dmg: 52, stun: 30, block: 14, low: true,
    kbx: 220, kby: -420, hitstop: 8, spark: '⌊', knockdown: true, crouchPose: true,
  },
  dive: {
    ...normal, name: '↓ VECTOR DIVE', anim: 'dive', startup: 6, active: 40, recovery: 12, air: true,
    hitbox: { x: 22, y: -26, w: 54, h: 52 }, dmg: 58, stun: 26, block: 14,
    kbx: 380, kby: -420, hitstop: 8, spark: '↓', dive: true, heavy: true,
  },
  dashstrike: {
    ...normal, name: '→ VECTOR STRIKE', anim: 'dashstrike', startup: 3, active: 8, recovery: 16,
    hitbox: { x: 50, y: -88, w: 70, h: 44 }, dmg: 60, stun: 26, block: 14,
    kbx: 720, kby: -300, hitstop: 9, spark: '→', heavy: true,
    vel: [{ f: 0, vx: 760 }], keepMomentum: true,
  },
  slidekick: {
    ...normal, name: '∠ SLIDE', anim: 'slide', startup: 2, active: 14, recovery: 14,
    hitbox: { x: 40, y: -18, w: 76, h: 30 }, dmg: 44, stun: 26, block: 12, low: true,
    kbx: 180, kby: -620, hitstop: 7, spark: '∠', launch: true, keepMomentum: true, crouchPose: true,
  },
  // ── Ki combos ───────────────────────────────────────────────────────
  counter: {
    name: '% MODULO COUNTER', anim: 'counter', startup: 2, active: 24, recovery: 18, cost: 15,
    script: 'counter',
  },
  counterstrike: {
    name: '% REMAINDER!', anim: 'counterstrike', startup: 1, active: 5, recovery: 16,
    hitbox: { x: 50, y: -84, w: 90, h: 70 }, dmg: 95, stun: 40, block: 20,
    kbx: 760, kby: -620, hitstop: 14, spark: '%', knockdown: true, heavy: true, invuln: [0, 8],
  },
  beam: {
    anim: 'beam', startup: 24, active: 48, recovery: 22, cost: 35, script: 'beam',
    noGrav: [0, 94], superArmor: false,
  },
  wave: {
    name: '∫ INTEGRAL WAVE', anim: 'wave', startup: 12, active: 2, recovery: 20, cost: 20,
    spawn: [{ f: 12, proj: 'wave' }],
  },
  // ── Character uniques (I) ───────────────────────────────────────────
  sigma_barrage: {
    anim: 'cast', startup: 8, active: 30, recovery: 14, cost: 15, cooldown: 170,
    spawn: [0, 6, 12, 18, 24].map((o, i) => ({ f: 8 + o, proj: i === 4 ? 'sigma_big' : 'sigma_small' })),
  },
  pi_spin: {
    anim: 'spin', startup: 5, active: 30, recovery: 14, cost: 15, cooldown: 170,
    hitbox: { x: 10, y: -70, w: 130, h: 120 }, dmg: 22, stun: 17, block: 8, multi: 7,
    kbx: 220, kby: -330, hitstop: 3, spark: 'θ',
    vel: [{ f: 5, vx: 380, vy: -420 }], noGrav: [5, 30], airOk: true, invuln: [0, 5],
  },
  nabla_slam: {
    anim: 'slam', startup: 10, active: 40, recovery: 18, cost: 20, cooldown: 220,
    hitbox: { x: 0, y: -40, w: 200, h: 70 }, dmg: 82, stun: 34, block: 18,
    kbx: 300, kby: -760, hitstop: 12, spark: '∇', launch: true, heavy: true,
    armor: [0, 30], script: 'slam', airOk: true,
  },
  omega_blink: {
    anim: 'blink', startup: 7, active: 1, recovery: 10, cost: 15, cooldown: 140,
    invuln: [0, 16], script: 'blink', airOk: true, noGrav: [0, 18],
  },
  // ── Supers (U) ──────────────────────────────────────────────────────
  sigma_super: {
    anim: 'raise', startup: 12, active: 80, recovery: 20, super: true, script: 'sigma_super',
    invuln: [0, 12],
  },
  pi_super: {
    anim: 'dashstrike', startup: 6, active: 16, recovery: 24, super: true, script: 'pi_super',
    hitbox: { x: 40, y: -80, w: 80, h: 80 }, dmg: 30, stun: 30, block: 16,
    kbx: 120, kby: 0, hitstop: 4, spark: '3', invuln: [0, 22],
  },
  pi_super_seq: {
    anim: 'dashstrike', startup: 0, active: 70, recovery: 22, super: true, script: 'pi_seq',
    invuln: [0, 92], noGrav: [0, 70],
  },
  nabla_super: {
    anim: 'stomp', startup: 16, active: 60, recovery: 22, super: true, script: 'nabla_super',
    armor: [0, 76],
  },
  omega_super: {
    anim: 'orb', startup: 16, active: 14, recovery: 20, super: true, script: 'omega_super',
    spawn: [{ f: 16, proj: 'singularity' }], invuln: [0, 16],
  },
  transform: {
    anim: 'transform', startup: 44, active: 1, recovery: 8, invuln: [0, 53], script: 'transform',
    noGrav: [0, 53],
  },
};

// Projectile archetypes. Glyphs chosen at spawn time from the owner's set.
export const PROJECTILES = {
  sigma_small: { kind: 'glyph', speed: 980, w: 34, h: 34, life: 80, dmg: 24, stun: 14, block: 8, kbx: 140, kby: -40, hitstop: 3, size: 'md', glyph: 'Σ', y: -88, power: 1 },
  sigma_big: { kind: 'glyph', speed: 1080, w: 60, h: 60, life: 80, dmg: 52, stun: 26, block: 14, kbx: 520, kby: -360, hitstop: 8, size: 'lg', glyph: '∑', y: -88, power: 2, heavy: true },
  wave: { kind: 'wave', speed: 760, w: 54, h: 70, life: 90, dmg: 64, stun: 28, block: 14, kbx: 280, kby: -560, hitstop: 8, size: 'lg', glyph: '∫', y: -35, low: true, launch: true, power: 2 },
  delta_shock: { kind: 'wave', speed: 640, w: 50, h: 56, life: 46, dmg: 40, stun: 22, block: 10, kbx: 260, kby: -520, hitstop: 5, size: 'md', glyph: 'Δ', y: -28, low: true, launch: true, power: 1 },
  series: { kind: 'glyph', speed: 0, w: 46, h: 46, life: 80, dmg: 24, stun: 22, block: 6, kbx: 60, kby: 280, hitstop: 4, size: 'md', glyph: '1', y: 0, power: 3, gravity: 1800, groundDie: true },
  series_final: { kind: 'glyph', speed: 0, w: 120, h: 120, life: 90, dmg: 110, stun: 40, block: 20, kbx: 420, kby: -900, hitstop: 16, size: 'xl', glyph: '∞', y: 0, power: 9, gravity: 2600, groundDie: true, knockdown: true, heavy: true },
  spike: { kind: 'spike', speed: 0, w: 92, h: 170, life: 16, dmg: 44, stun: 30, block: 10, kbx: 120, kby: -980, hitstop: 6, size: 'xl', glyph: 'Δ', y: 0, launch: true, power: 9 },
  spike_final: { kind: 'spike', speed: 0, w: 160, h: 260, life: 20, dmg: 100, stun: 44, block: 20, kbx: 300, kby: -1300, hitstop: 16, size: 'xxl', glyph: '∇', y: 0, launch: true, heavy: true, power: 9 },
  singularity: { kind: 'singularity', speed: 170, w: 120, h: 120, life: 120, dmg: 16, stun: 14, block: 4, kbx: 0, kby: 0, hitstop: 1, size: 'xl', glyph: '∅', y: -110, multi: 8, power: 9, pull: 2600, pullRadius: 420 },
  singularity_blast: { kind: 'blast', speed: 0, w: 340, h: 300, life: 8, dmg: 120, stun: 44, block: 24, kbx: 820, kby: -900, hitstop: 16, size: 'xxl', glyph: 'Ω', y: 0, knockdown: true, heavy: true, power: 9 },
  beam: { kind: 'beam', w: 0, h: 50, dmg: 15, stun: 16, block: 6, kbx: 300, kby: -60, hitstop: 2, multi: 5, glyph: 'Σ', size: 'md', power: 5 },
};
