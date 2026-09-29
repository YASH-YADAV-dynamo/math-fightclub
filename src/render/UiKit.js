// Drawing helpers for the anime-fighter style UI: slanted plates, bevels,
// speed lines, gradient text. All original, procedurally drawn.

export function slant(g, x, y, w, h, skew, color, alpha = 1) {
  g.fillStyle(color, alpha);
  g.fillPoints([{ x: x + skew, y }, { x: x + w + skew, y }, { x: x + w, y: y + h }, { x, y: y + h }], true);
}

export function slantStroke(g, x, y, w, h, skew, color, alpha = 1, lw = 2) {
  g.lineStyle(lw, color, alpha);
  g.strokePoints([{ x: x + skew, y }, { x: x + w + skew, y }, { x: x + w, y: y + h }, { x, y: y + h }], true, true);
}

// mirror helper: returns points flipped around the screen centre for P2
export const mirrorPts = (pts, on, W = 1280) => (on ? pts.map((p) => ({ x: W - p.x, y: p.y })) : pts);

export function poly(g, pts, color, alpha = 1) { g.fillStyle(color, alpha); g.fillPoints(pts, true); }
export function polyStroke(g, pts, color, alpha = 1, lw = 2) { g.lineStyle(lw, color, alpha); g.strokePoints(pts, true, true); }

export function speedLines(g, cx, cy, r0, r1, count, color, alpha, seed = 1, spin = 0) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle(color, alpha);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rnd() * 0.08 + spin;
    const wdt = 0.006 + rnd() * 0.016;
    const rr0 = r0 * (0.8 + rnd() * 0.5), rr1 = r1 * (0.8 + rnd() * 0.3);
    g.fillTriangle(
      cx + Math.cos(a - wdt) * rr1, cy + Math.sin(a - wdt) * rr1,
      cx + Math.cos(a + wdt) * rr1, cy + Math.sin(a + wdt) * rr1,
      cx + Math.cos(a) * rr0, cy + Math.sin(a) * rr0,
    );
  }
}

export function gradientText(t, stops) {
  const grad = t.context.createLinearGradient(0, 0, 0, t.height);
  stops.forEach((c, i) => grad.addColorStop(i / (stops.length - 1), c));
  t.setFill(grad);
  return t;
}
