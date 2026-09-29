// Headless AI-vs-AI soak test of the pure simulation (no renderer).
import { createWorld, step } from '../src/sim/World.js';
import { AIController } from '../src/ai/AIController.js';
import { CHARACTER_ORDER } from '../src/sim/characters.js';

const stats = {};
let rounds = 0, kos = 0, timeups = 0;
for (const c1 of CHARACTER_ORDER) for (const c2 of CHARACTER_ORDER) for (const lvl of [1, 5, 10]) {
  const w = createWorld({ p1: { charId: c1 }, p2: { charId: c2 }, seed: rounds + 7 });
  const a = new AIController(0, lvl, 11 + rounds), b = new AIController(1, lvl, 23 + rounds);
  let n = 0;
  while (w.phase !== 'end' && n < 60 * 120) {
    step(w, [a.update(w), b.update(w)]);
    for (const e of w.events) stats[e.t] = (stats[e.t] || 0) + 1;
    for (const f of w.fighters) {
      if (!Number.isFinite(f.x) || !Number.isFinite(f.y)) throw new Error('NaN position ' + c1 + c2);
      if (f.y > 629 || f.x < 0 || f.x > 1280) throw new Error(`out of bounds ${f.x},${f.y} ${f.state}`);
    }
    n++;
  }
  rounds++;
  if (w.phase !== 'end') console.log('did not end', c1, c2, lvl, w.phase);
  stats['end_' + (w.timer > 0 ? 'ko' : 'time')] = (stats['end_' + (w.timer > 0 ? 'ko' : 'time')] || 0) + 1;
  if (lvl === 10) console.log(c1.padEnd(6), 'vs', c2.padEnd(6), 'L' + lvl, 'winner', w.winner, 'hp', w.fighters.map(f => f.hp).join('/'), 'time', (w.timer / 60) | 0);
}
console.log(rounds, 'rounds');
console.log(stats);
