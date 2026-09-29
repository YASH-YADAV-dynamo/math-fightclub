import { CHARACTERS } from '../sim/characters.js';

export const FONT_TITLE = 'Orbitron, "Segoe UI", Arial Black, sans-serif';
export const FONT_UI = 'Rajdhani, "Segoe UI", Arial, sans-serif';

export const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export function text(scene, x, y, str, size, color = '#ffffff', opts = {}) {
  const t = scene.add.text(x, y, str, {
    fontFamily: opts.font || FONT_UI,
    fontSize: `${size}px`,
    fontStyle: opts.weight || '700',
    color,
    stroke: opts.stroke || '#05060b',
    strokeThickness: opts.strokeThickness ?? Math.max(2, Math.round(size / 9)),
    align: opts.align || 'left',
    lineSpacing: opts.lineSpacing || 0,
  });
  // pad the canvas so glow / stroke / italics never get clipped into a visible box
  const pad = opts.shadow ? (opts.blur ?? 18) + 6 : Math.ceil(size * 0.15) + 2;
  t.setPadding(pad, pad * 0.6, pad, pad * 0.6);
  t.setOrigin(opts.ox ?? 0.5, opts.oy ?? 0.5);
  t.x += pad * (2 * (opts.ox ?? 0.5) - 1);
  t.y += pad * 0.6 * (2 * (opts.oy ?? 0.5) - 1);
  if (opts.spacing) t.setLetterSpacing(opts.spacing);
  if (opts.shadow) t.setShadow(0, 0, opts.shadow, opts.blur ?? 18, true, true);
  if (opts.depth !== undefined) t.setDepth(opts.depth);
  return t;
}

export function moveList(charId) {
  const c = CHARACTERS[charId];
  return [
    ['MOVEMENT', ''],
    ['A / D  or  ← →', 'Walk  (hold back = guard, back + down = low guard)'],
    ['K  /  Space', 'Jump · press again for double jump · tap for short hop'],
    ['K on a wall', 'Wall jump  (hold toward wall to wall-slide)'],
    ['L  /  Shift', 'Dash in any of 8 directions · air dash · i-frames'],
    ['S + L', '∠ Slide (low, launches)'],
    ['S in air', 'Fast fall   ·   S + K on a platform = drop through'],
    ['ATTACKS', ''],
    ['J, J, J', 'Jab · Jab · Kick string'],
    ['W + J', '√ Root Uppercut (launcher → press K to chase)'],
    ['S + J', '⌊x⌋ Floor Sweep (low, knockdown)'],
    ['L then J', '→ Vector Strike (dash attack)'],
    ['Air: J / D+J / S+J', 'Air punch · Air kick · ↓ Vector Dive'],
    ['KI COMBOS', ''],
    ['W + D + J', `${c.beamName}  (35 Ki · Kamehameha-style beam)`],
    ['S + D + J', '∫ Integral Wave  (20 Ki · ground projectile)'],
    ['Back + J', '% Modulo Counter  (15 Ki · parry stance)'],
    ['POWERS', ''],
    ['I', `${c.uniqueName}  (unique · Ki + cooldown)`],
    ['U', `${c.specialName}  (super · meter charges every 2s + on hits)`],
    ['Hold O', 'Power up — charge Ki fast (DBZ style) · you are open while charging'],
    ['O at full Ki', `${c.transformName}  (transform · 12s aura buff)`],
    ['', 'Normals cancel into Ki moves / I / U / dash on hit.  D = toward opponent.'],
  ];
}
