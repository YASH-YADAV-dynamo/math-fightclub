// Pre-renders mathematical symbols into white textures at a fixed set of sizes.
// Everything "magic" in the game is built from these, tinted per character.

export const GLYPH_SIZES = { xs: 18, sm: 26, md: 36, lg: 54, xl: 92, xxl: 160 };
export const MATH_FONT = "'Cambria Math','STIX Two Math','Latin Modern Math','Segoe UI Symbol','Times New Roman',serif";

export const SPARK_GLYPHS = ['*', '×', '+', '%', '&', '#', '±', '÷', '!', '∗'];
export const DUST_GLYPHS = ['·', '∘', '˙', '°', '⋅'];
export const PREWARM = [
  'Σ', '∑', '+', 'n', '∞', 'π', 'θ', '3', '1', '4', '°', '∇', 'Δ', '∂', '▲', 'Ω', '∫', '≈', '∅',
  '√', '⌊', '↓', '→', '∠', '%', '≠', '|', '=', '≡', '½', '¼', '⅛', '1/16', '1/32', '1/64', '1/128', '…',
  '5', '9', '2', '.', '!', 'Λ', '∧', '^', '~', '∽', '○', '◆', '■', '@', '∈', '∀', '∃', 'λ', 'φ', 'ε', '∝', '⊥', '‖', '⊕', '⊗', '∓', 'e', 'i', '0',
  ...SPARK_GLYPHS, ...DUST_GLYPHS,
];

export function glyphKey(glyph, size) { return `g:${size}:${glyph}`; }

export function ensureGlyph(scene, glyph, size = 'md') {
  const key = glyphKey(glyph, size);
  if (scene.textures.exists(key)) return key;
  const px = GLYPH_SIZES[size] || GLYPH_SIZES.md;
  const pad = Math.ceil(px * 0.35);
  const measure = document.createElement('canvas').getContext('2d');
  const font = `700 ${px}px ${MATH_FONT}`;
  measure.font = font;
  const tw = Math.ceil(measure.measureText(glyph).width);
  const w = Math.max(tw, px * 0.5) + pad * 2;
  const h = Math.ceil(px * 1.25) + pad * 2;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = w / 2, cy = h / 2 + px * 0.04;
  // soft halo (tints to the character colour)
  ctx.shadowColor = 'rgba(255,255,255,0.9)';
  ctx.shadowBlur = px * 0.22;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(glyph, cx, cy);
  // crisp body with a dark rim so it reads on any background
  ctx.shadowBlur = 0;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, px * 0.07);
  ctx.strokeStyle = 'rgba(20,20,30,0.55)';
  ctx.strokeText(glyph, cx, cy);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(glyph, cx, cy);
  scene.textures.addCanvas(key, cv);
  return key;
}

export function prewarmGlyphs(scene) {
  for (const s of ['xs', 'sm', 'md', 'lg']) for (const g of PREWARM) ensureGlyph(scene, g, s);
  for (const g of ['Σ', '∑', '∞', 'π', '∇', 'Δ', 'Ω', '∅', '∫', '√', '%', 'θ']) { ensureGlyph(scene, g, 'xl'); ensureGlyph(scene, g, 'xxl'); }
}
