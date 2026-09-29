// Procedurally painted parallax stages (Canvas 2D → textures), themed around math.

import Phaser from 'phaser';
import { STAGE } from '../sim/constants.js';
import { MATH_FONT, ensureGlyph } from './GlyphCache.js';

export const THEMES = [
  { name: 'THE NUMBER LINE', sky: ['#0b0f2e', '#2a1850', '#6b2a6e'], sun: '#ff9ad5', ridge: ['#1b1440', '#120d2c'], line: '#ff6fd8', floor: ['#140f2a', '#07060f'], grid: 'rgba(255,111,216,', particle: 0xff9ad5 },
  { name: 'CALCULUS CANYON', sky: ['#1a0a12', '#5a1a1a', '#e2702a'], sun: '#ffd27a', ridge: ['#3a130f', '#220a08'], line: '#ffb347', floor: ['#1f0c08', '#090403'], grid: 'rgba(255,179,71,', particle: 0xffc27a },
  { name: "EULER'S ABYSS", sky: ['#02030c', '#061a3a', '#0e4a7a'], sun: '#8fe8ff', ridge: ['#06203c', '#031226'], line: '#3ee8ff', floor: ['#041022', '#010308'], grid: 'rgba(62,232,255,', particle: 0x8fe8ff },
  { name: 'FRACTAL SPIRES', sky: ['#020c08', '#063a2a', '#1f8a5a'], sun: '#c6ffb0', ridge: ['#07261a', '#03140d'], line: '#5dff9e', floor: ['#04140c', '#010604'], grid: 'rgba(93,255,158,', particle: 0xb0ffc8 },
  { name: 'THE VOID OF ZERO', sky: ['#050005', '#1c0210', '#4a0616'], sun: '#ff3a4a', ridge: ['#1c040c', '#0e0206'], line: '#ff3a4a', floor: ['#120208', '#040002'], grid: 'rgba(255,58,74,', particle: 0xff6a7a },
];

const FORMULAS = [
  'e^{iπ} + 1 = 0', '∇·E = ρ/ε₀', 'a² + b² = c²', '∫₀^∞ e^{−x²} dx = √π / 2', 'ζ(s) = Σ n^{−s}', 'F = ma',
  'E = mc²', 'φ = (1 + √5) / 2', 'Δx·Δp ≥ ħ/2', 'lim (1 + 1/n)ⁿ = e', 'i² = −1', '∂u/∂t = α∇²u',
  'f(x) = Σ aₙ cos(nx)', 'det(A − λI) = 0', '∮ B·dl = μ₀I', 'n! ≈ √(2πn)(n/e)ⁿ', 'sin²θ + cos²θ = 1', '∀ε ∃δ',
];

const W = STAGE.width + 240, H = STAGE.height + 160;

function seeded(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function makeCanvas(w = W, h = H) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

function paintSky(theme, rnd) {
  const [cv, ctx] = makeCanvas();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, theme.sky[0]); g.addColorStop(0.55, theme.sky[1]); g.addColorStop(1, theme.sky[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // stars
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.6})`;
    const r = rnd() < 0.9 ? 1 : 2;
    ctx.fillRect(rnd() * W, rnd() * H * 0.62, r, r);
  }
  // great circle "planet" drawn as a unit circle with axes and ticks
  const cx = W * 0.5 + (rnd() - 0.5) * 300, cy = H * 0.38, R = 190;
  const rg = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 2.2);
  rg.addColorStop(0, theme.sun + 'aa'); rg.addColorStop(0.35, theme.sun + '33'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = theme.sun + '88'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = theme.sun + '44'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.62, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - R * 1.4, cy); ctx.lineTo(cx + R * 1.4, cy); ctx.moveTo(cx, cy - R * 1.4); ctx.lineTo(cx, cy + R * 1.4); ctx.stroke();
  for (let a = 0; a < 24; a++) {
    const t = (a / 24) * Math.PI * 2;
    const r1 = R * (a % 6 === 0 ? 0.9 : 0.95);
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(t) * r1, cy + Math.sin(t) * r1); ctx.lineTo(cx + Math.cos(t) * R, cy + Math.sin(t) * R); ctx.stroke();
  }
  // sine curve across the sky
  ctx.strokeStyle = theme.sun + '55'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 6) { const y = cy + Math.sin((x - cx) / R) * R; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  ctx.stroke();
  ctx.fillStyle = theme.sun + '99'; ctx.font = `italic 22px ${MATH_FONT}`;
  ctx.fillText('y = sin x', cx + R * 1.05, cy - R * 0.85);
  return cv;
}

function paintFar(theme, rnd) {
  const [cv, ctx] = makeCanvas();
  // floating formulas
  ctx.textAlign = 'center';
  for (let i = 0; i < 14; i++) {
    const size = 18 + rnd() * 26;
    ctx.font = `italic ${size | 0}px ${MATH_FONT}`;
    ctx.fillStyle = `rgba(255,255,255,${0.05 + rnd() * 0.09})`;
    ctx.fillText(FORMULAS[(i * 7 + (rnd() * 5 | 0)) % FORMULAS.length], rnd() * W, 60 + rnd() * H * 0.45);
  }
  // far ridge: a Fourier series silhouette
  const base = STAGE.groundY - 150;
  const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
  const ridge = (x) => base - 60 * Math.sin(x / 210 + ph[0]) - 34 * Math.sin(x / 97 + ph[1]) - 14 * Math.sin(x / 41 + ph[2]) - 40;
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 4) ctx.lineTo(x, ridge(x));
  ctx.lineTo(W, H); ctx.closePath();
  const g = ctx.createLinearGradient(0, base - 160, 0, H);
  g.addColorStop(0, theme.ridge[0]); g.addColorStop(1, theme.ridge[1]);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = theme.line + '55'; ctx.lineWidth = 1.5;
  ctx.beginPath(); for (let x = 0; x <= W; x += 4) { const y = ridge(x); x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke();
  return cv;
}

function paintNear(theme, rnd) {
  const [cv, ctx] = makeCanvas();
  // spires: tall "bar chart" monoliths with glyph engravings
  const base = STAGE.groundY + 80;
  for (let i = 0; i < 9; i++) {
    const x = (i / 9) * W + rnd() * 80;
    const w = 40 + rnd() * 60, h = 120 + rnd() * 200;
    const g = ctx.createLinearGradient(x, base - h, x + w, base);
    g.addColorStop(0, theme.ridge[0]); g.addColorStop(1, theme.ridge[1]);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x + w * 0.15, base - h); ctx.lineTo(x + w * 0.85, base - h - 16); ctx.lineTo(x + w, base); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = theme.line + '66'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = theme.line + '44'; ctx.font = `${16 + (rnd() * 10 | 0)}px ${MATH_FONT}`; ctx.textAlign = 'center';
    ctx.fillText(['Σ', 'π', '∇', 'Ω', '∫', '∞', '√', 'Δ', 'λ'][i], x + w / 2, base - h * 0.55);
  }
  // near ridge
  const ridge = (x) => STAGE.groundY - 40 - 26 * Math.sin(x / 130 + 1) - 14 * Math.sin(x / 53);
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 4) ctx.lineTo(x, ridge(x));
  ctx.lineTo(W, H); ctx.closePath();
  ctx.fillStyle = theme.ridge[1]; ctx.fill();
  return cv;
}

function paintFloor(theme) {
  const [cv, ctx] = makeCanvas(STAGE.width, STAGE.height);
  const gy = STAGE.groundY;
  const g = ctx.createLinearGradient(0, gy, 0, STAGE.height);
  g.addColorStop(0, theme.floor[0]); g.addColorStop(1, theme.floor[1]);
  ctx.fillStyle = g; ctx.fillRect(0, gy, STAGE.width, STAGE.height - gy);
  // perspective grid (a coordinate plane receding into the distance)
  const vx = STAGE.width / 2, vy = gy - 180;
  ctx.lineWidth = 1;
  for (let i = -24; i <= 24; i++) {
    const x = vx + i * 70;
    ctx.strokeStyle = theme.grid + (i === 0 ? '0.55)' : '0.16)');
    ctx.beginPath();
    const t = (gy - vy) / (STAGE.height - vy);
    ctx.moveTo(vx + (x - vx) * t, gy); ctx.lineTo(x, STAGE.height); ctx.stroke();
  }
  for (let j = 1; j < 8; j++) {
    const y = gy + Math.pow(j / 8, 1.8) * (STAGE.height - gy);
    ctx.strokeStyle = theme.grid + (0.1 + j * 0.02) + ')';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(STAGE.width, y); ctx.stroke();
  }
  // tick marks + numbers along the number line (the ground)
  ctx.fillStyle = theme.grid + '0.55)'; ctx.font = `14px ${MATH_FONT}`; ctx.textAlign = 'center';
  for (let x = 40, n = -8; x < STAGE.width; x += 80, n++) {
    ctx.fillRect(x, gy + 2, 2, n === 0 ? 14 : 8);
    ctx.fillText(String(n), x + 1, gy + 30);
  }
  // glowing ground edge
  ctx.shadowColor = theme.line; ctx.shadowBlur = 18;
  ctx.fillStyle = theme.line; ctx.fillRect(0, gy - 1, STAGE.width, 3);
  ctx.shadowBlur = 0;
  // platforms: glowing intervals
  STAGE.platforms.forEach((p, i) => {
    const w = p.x2 - p.x1;
    const pg = ctx.createLinearGradient(0, p.y, 0, p.y + 22);
    pg.addColorStop(0, theme.ridge[0]); pg.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.moveTo(p.x1, p.y); ctx.lineTo(p.x2, p.y); ctx.lineTo(p.x2 - 18, p.y + 20); ctx.lineTo(p.x1 + 18, p.y + 20); ctx.closePath(); ctx.fill();
    ctx.shadowColor = theme.line; ctx.shadowBlur = 14;
    ctx.fillStyle = theme.line; ctx.fillRect(p.x1, p.y - 1, w, 3);
    ctx.shadowBlur = 0;
    ctx.fillStyle = theme.line + 'aa'; ctx.font = `italic 15px ${MATH_FONT}`;
    ctx.fillText(['[ 0 , 1 ]', '( −∞ , ∞ )', '{ ∅ }'][i % 3], p.x1 + w / 2, p.y + 17);
  });
  // side walls
  for (const x of [STAGE.leftWall, STAGE.rightWall]) {
    const wg = ctx.createLinearGradient(x - 30, 0, x + 30, 0);
    wg.addColorStop(0, 'rgba(0,0,0,0)'); wg.addColorStop(0.5, theme.grid + '0.18)'); wg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = wg; ctx.fillRect(x - 30, 0, 60, gy);
  }
  return cv;
}

export class Background {
  constructor(scene, themeIndex = 0) {
    this.scene = scene;
    this.theme = THEMES[themeIndex % THEMES.length];
    const rnd = seeded(1000 + themeIndex * 77);
    const tag = `bg${themeIndex % THEMES.length}`;
    const add = (key, cv) => { if (!scene.textures.exists(key)) scene.textures.addCanvas(key, cv); return key; };
    const cx = STAGE.width / 2, cy = STAGE.height / 2;
    this.layers = [
      scene.add.image(cx, cy, add(tag + 'sky', paintSky(this.theme, rnd))).setScrollFactor(0.15).setDepth(-10),
      scene.add.image(cx, cy, add(tag + 'far', paintFar(this.theme, rnd))).setScrollFactor(0.35).setDepth(-9),
      scene.add.image(cx, cy, add(tag + 'near', paintNear(this.theme, rnd))).setScrollFactor(0.6).setDepth(-8),
      scene.add.image(cx, cy, add(tag + 'floor', paintFloor(this.theme))).setScrollFactor(1).setDepth(-7),
    ];
    this.motes = [];
    const glyphs = ['0', '1', '+', '−', '×', '÷', '=', 'x', 'y', '∘'];
    for (let i = 0; i < 38; i++) {
      const img = scene.add.image(Math.random() * STAGE.width, Math.random() * STAGE.groundY, ensureGlyph(scene, glyphs[i % glyphs.length], i % 4 === 0 ? 'sm' : 'xs'))
        .setTint(this.theme.particle).setAlpha(0.08 + Math.random() * 0.22).setDepth(-6).setBlendMode(Phaser.BlendModes.ADD).setScrollFactor(0.8);
      this.motes.push({ img, vy: -(8 + Math.random() * 26), vx: (Math.random() - 0.5) * 12, ph: Math.random() * 6 });
    }
  }

  update(dt) {
    for (const m of this.motes) {
      m.ph += dt;
      m.img.y += m.vy * dt;
      m.img.x += (m.vx + Math.sin(m.ph) * 8) * dt;
      if (m.img.y < -20) { m.img.y = STAGE.groundY; m.img.x = Math.random() * STAGE.width; }
    }
  }

  destroy() { for (const l of this.layers) l.destroy(); for (const m of this.motes) m.img.destroy(); }
}
