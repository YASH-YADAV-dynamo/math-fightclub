// Pure simulation constants. No engine imports — this layer must stay runnable
// headless (Node / server) so it can later power online multiplayer.

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export const STAGE = {
  width: 1280,
  height: 720,
  groundY: 628,
  leftWall: 24,
  rightWall: 1256,
  platforms: [
    { x1: 150, x2: 420, y: 430 },
    { x1: 860, x2: 1130, y: 430 },
    { x1: 520, x2: 760, y: 265 },
  ],
};

export const PHYS = {
  gravity: 2750,
  fallGravityMul: 1.18,      // heavier on the way down = snappy arcs
  fastFallMul: 1.9,
  maxFall: 1450,
  fastFallMax: 1900,
  walkSpeed: 340,
  backWalkMul: 0.72,
  groundAccel: 4200,
  groundFriction: 3600,
  hitstunFriction: 1500,
  airAccel: 2300,
  airDrag: 420,
  jumpVel: 1020,
  doubleJumpVel: 930,
  jumpCutMul: 0.42,          // release K early = short hop
  coyoteFrames: 6,
  jumpBufferFrames: 7,
  airJumps: 1,
  wallSlideMax: 260,
  wallJumpVx: 560,
  wallJumpVy: 940,
  dashSpeed: 1020,
  dashFrames: 11,
  dashCooldown: 18,
  airDashes: 1,
  slideSpeed: 820,
  slideFrames: 20,
  landingLag: 3,
  hardLandingLag: 8,
  wallBounceMin: 620,
  groundBounceMin: 620,
};

export const BODY = { w: 40, h: 124, crouchH: 78 };

export const METER = {
  kiMax: 100,
  specMax: 100,
  kiRegenPerSec: 3.2,
  specTickFrames: 120,       // U meter auto-charges every 2 seconds…
  specTickAmount: 6,         // …by this much
  specOnHitMul: 0.14,        // …plus damage dealt * this
  specOnHurtMul: 0.07,
  kiOnHitMul: 0.11,
  kiOnHurtMul: 0.06,
  transformFrames: 60 * 12,
  chargeRate: 34,            // Ki per second while holding O
};

export const ROUND = { timeSeconds: 99, introFrames: 110, koFrames: 170 };

// Input bitmask — the only thing a controller (keyboard, AI, network) produces.
export const IN = {
  LEFT: 1, RIGHT: 2, UP: 4, DOWN: 8,
  ATK: 16,   // J
  JUMP: 32,  // K
  DASH: 64,  // L
  SPEC: 128, // U
  UNIQ: 256, // I
  POW: 512,  // O
};
export const BUTTONS = ['ATK', 'JUMP', 'DASH', 'SPEC', 'UNIQ', 'POW'];
