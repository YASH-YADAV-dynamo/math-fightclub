// Keyboard → input bitmask. Presses are latched between sim ticks so taps
// shorter than a frame are never lost.

import { IN } from '../sim/constants.js';

const MAP = {
  LEFT: ['A', 'LEFT'], RIGHT: ['D', 'RIGHT'], UP: ['W', 'UP'], DOWN: ['S', 'DOWN'],
  ATK: ['J'], JUMP: ['K', 'SPACE'], DASH: ['L', 'SHIFT'], SPEC: ['U'], UNIQ: ['I'], POW: ['O'],
};

export class KeyboardController {
  constructor(scene) {
    this.keys = {};
    this.latched = 0;
    const kb = scene.input.keyboard;
    for (const [bit, names] of Object.entries(MAP)) {
      this.keys[bit] = names.map((n) => {
        const k = kb.addKey(n, true);
        k.on('down', () => { this.latched |= IN[bit]; });
        return k;
      });
    }
  }

  // called once per sim tick
  update() {
    let m = this.latched;
    this.latched = 0;
    for (const [bit, keys] of Object.entries(this.keys)) if (keys.some((k) => k.isDown)) m |= IN[bit];
    // opposite directions cancel (clean SOCD)
    if ((m & IN.LEFT) && (m & IN.RIGHT)) m &= ~(IN.LEFT | IN.RIGHT);
    if ((m & IN.UP) && (m & IN.DOWN)) m &= ~(IN.UP | IN.DOWN);
    return m;
  }
}
