# AXIOM — Stickman Math Fighters

A 2D stickman fighting game where every power is built out of real mathematical symbols
(Σ π ∇ Ω ∫ √ ∞ % & * …). Built with **Phaser 3** (rendering, input, scenes) on top of a
**deterministic, engine-free simulation** so it can grow into online multiplayer.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run test:sim   # headless AI-vs-AI soak test of the simulation
```

## Controls

| Key | Action |
| --- | --- |
| **A / D** or **← →** | Walk (hold *back* = guard, *back + down* = low guard) |
| **W / S** | Up / down (used in combos) · S in air = fast fall · S + K on platform = drop through |
| **J** | Attack — J, J, J string |
| **K** / Space | Jump · double jump · short hop (tap) · wall jump |
| **L** / Shift | Dash in any of 8 directions (i-frames) · S + L = slide |
| **U** | Super — meter auto-charges every 2 s and on hits |
| **I** | Character-unique ability (Ki + cooldown) |
| **O** | *Hold* = power up / charge Ki (DBZ style) · *tap at full Ki* = transform |
| Esc / P | Pause · M = mute |

### Combos (D = toward opponent)

| Input | Move |
| --- | --- |
| **W + D + J** | Kamehameha-style beam of the fighter's symbols (35 Ki) |
| **S + D + J** | ∫ Integral Wave — ground projectile (20 Ki) |
| **W + J** | √ Root Uppercut launcher → press K to chase in the air |
| **S + J** | ⌊x⌋ Floor Sweep (low) |
| **Back + J** | % Modulo Counter — parry stance (15 Ki) |
| **L then J** | → Vector Strike dash attack |
| Air **S + J** | ↓ Vector Dive |

Normal hits cancel into Ki moves, I, U and dash. Presses are buffered, including during hit-stop.

## Fighters

| | Element | Unique (I) | Super (U) | Transform (O) |
| --- | --- | --- | --- | --- |
| **Σ SIGMA** — balanced | water | Σ Barrage | Infinite Series (1, ½, ¼ … ∞ rain) | Divergent Σ∞ |
| **π PI** — fastest, extra air dash | air | θ Radian Spin | 3.14159… (teleport flurry) | τ = 2π Mode |
| **∇ NABLA** — heavy, armored | earth | ∇ Gradient Slam | Delta Quake (Δ spikes) | Laplacian ∇² |
| **Ω OMEGA** — zoner, floaty | fire | ∫ Blink (teleport) | Event Horizon (singularity) | Ω Absolute |

## Modes

* **Arcade Ladder**: 8 stages (then endless). Best of 3 rounds per stage. Each stage the villain
  gets a higher AI level (faster reactions, blocking, combos, supers, transforms) **and** stat buffs
  (HP, damage, Ki regen, starting meter).
* **Training**: dummy with STAND / GUARD / JUMP / CPU behaviours (T to cycle), infinite meters.

## Architecture

```
src/sim/      Pure deterministic simulation — no Phaser, runs in Node
  World.js      fixed 60 Hz step(world, [input0, input1]) → state + events
  moves.js      frame data (startup / active / recovery, hitboxes, knockback)
  characters.js stats, glyph sets, move names
src/ai/       CPU opponent: reads world with reaction delay, emits input bitmasks
src/input/    Keyboard → input bitmask (tap latching, SOCD cleaning)
src/render/   Phaser-side: procedural spring-animated stickmen, IK feet, cloth,
              Verlet ragdoll, glyph particle effects, parallax stages, synth SFX
src/scenes/   Boot, Title (live AI attract fight), Select, Fight, HUD
```

### Path to multiplayer

Controllers (keyboard, AI, network) all produce the same 10-bit input mask, and the whole
fight state is plain JSON (`snapshot(world)`), seeded RNG included. That enables either:

1. **Rollback netcode (GGPO-style)**: exchange inputs peer-to-peer, predict remote input,
   `snapshot` / restore and re-simulate on mismatch. The sim is headless and fast (see `test:sim`).
2. **Authoritative server**: run `src/sim` in Node (e.g. Colyseus / Socket.IO rooms), clients send
   inputs and render interpolated state.

The title menu already has an **Online Versus** slot reserved for this.
