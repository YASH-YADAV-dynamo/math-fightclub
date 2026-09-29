// Tiny WebAudio synth — every sound is generated, no asset files needed.

let ctx = null, master = null, muted = false, noiseBuf = null;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}

function tone(type, f0, f1, dur, vol, delay = 0) {
  const c = ac(); if (!c || muted) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.005, vol, dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur, vol, fStart, fEnd, q = 1, type = 'bandpass', delay = 0) {
  const c = ac(); if (!c || muted) return;
  const t = c.currentTime + delay;
  const s = c.createBufferSource(); s.buffer = noiseBuf;
  const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(fStart, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, fEnd), t + dur);
  const g = c.createGain(); env(g, t, 0.004, vol, dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}

const loops = {};

export const Sfx = {
  // rising power-up drone while holding O
  chargeLoop(slot, on) {
    const c = ac();
    if (!c) return;
    if (loops[slot]) {
      const l = loops[slot];
      l.g.gain.setTargetAtTime(0.0001, c.currentTime, 0.05);
      l.o.stop(c.currentTime + 0.3); l.o2.stop(c.currentTime + 0.3);
      delete loops[slot];
    }
    if (!on || muted) return;
    const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    const t = c.currentTime;
    o.type = 'sawtooth'; o2.type = 'square';
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(260, t + 3);
    o2.frequency.setValueAtTime(35, t); o2.frequency.exponentialRampToValueAtTime(130, t + 3);
    f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2400, t + 3);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.2);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(master); o.start(); o2.start();
    loops[slot] = { o, o2, g };
  },
  unlock() { ac(); },
  toggleMute() { muted = !muted; return muted; },
  get muted() { return muted; },
  hit(heavy) {
    tone('sine', heavy ? 160 : 220, 45, heavy ? 0.28 : 0.14, heavy ? 0.9 : 0.6);
    noise(heavy ? 0.22 : 0.1, heavy ? 0.7 : 0.45, heavy ? 2400 : 3200, 400, 0.8);
    if (heavy) tone('square', 90, 40, 0.18, 0.2);
  },
  block() { tone('triangle', 900, 600, 0.08, 0.35); noise(0.06, 0.3, 5000, 2000, 3); },
  swing(heavy) { noise(heavy ? 0.16 : 0.1, heavy ? 0.28 : 0.18, 800, heavy ? 3500 : 5000, 1.5); },
  jump() { tone('sine', 300, 620, 0.1, 0.18); },
  djump() { tone('sine', 420, 900, 0.12, 0.2); noise(0.1, 0.12, 2000, 6000, 2); },
  land(hard) { tone('sine', hard ? 120 : 160, 50, hard ? 0.18 : 0.08, hard ? 0.5 : 0.22); },
  dash() { noise(0.14, 0.3, 600, 6000, 1.2); },
  charge() { tone('sawtooth', 110, 440, 0.45, 0.12); },
  beam() { tone('sawtooth', 70, 60, 0.9, 0.22); noise(0.9, 0.25, 800, 300, 0.7, 'lowpass'); tone('square', 140, 130, 0.9, 0.08); },
  super() { [0, 0.06, 0.12].forEach((d, i) => tone('sawtooth', 220 * (1 + i * 0.25), 880 * (1 + i * 0.25), 0.5, 0.14, d)); noise(0.6, 0.3, 300, 5000, 0.8); },
  transform() { tone('sawtooth', 80, 640, 0.9, 0.2); tone('sine', 160, 1280, 0.9, 0.2, 0.05); noise(0.9, 0.3, 200, 8000, 0.6); },
  ko() { tone('sine', 110, 30, 1.2, 1); noise(1.0, 0.6, 1500, 80, 0.6, 'lowpass'); },
  quake() { tone('sine', 70, 28, 0.5, 0.9); noise(0.5, 0.5, 400, 60, 0.5, 'lowpass'); },
  blink() { tone('sine', 1400, 300, 0.12, 0.2); tone('sine', 300, 1400, 0.12, 0.15, 0.08); },
  counter() { tone('square', 1200, 1800, 0.08, 0.25); tone('square', 1800, 2400, 0.1, 0.2, 0.06); },
  clash() { tone('triangle', 1600, 800, 0.1, 0.25); noise(0.08, 0.2, 6000, 3000, 4); },
  ui() { tone('triangle', 660, 880, 0.06, 0.18); },
  select() { tone('triangle', 520, 1040, 0.12, 0.25); tone('sine', 780, 1560, 0.15, 0.15, 0.05); },
  announce() { tone('sawtooth', 110, 110, 0.4, 0.15); tone('sawtooth', 165, 165, 0.4, 0.1); },
};
