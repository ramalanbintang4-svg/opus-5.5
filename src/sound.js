// Tiny procedural sound effects with WebAudio (no audio files).
let ctx = null;
let noiseBuf = null;
let master = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
}

function noise({ dur = 0.12, freq = 800, q = 1, type = 'lowpass', gain = 0.5, attack = 0.005, rate = 1 }) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = rate;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}

function tone(f0, f1, dur, gain = 0.2, type = 'square') {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

const MATERIAL = {
  stone: { freq: 1800, q: 0.8, gain: 0.35 },
  wood: { freq: 600, q: 2, gain: 0.45 },
  gravel: { freq: 1200, q: 0.5, gain: 0.4 },
  grass: { freq: 2600, q: 0.4, gain: 0.25 },
  glass: { freq: 4000, q: 3, gain: 0.3, type: 'highpass' },
};

export const sfx = {
  dig(mat = 'grass') { noise({ dur: 0.16, ...(MATERIAL[mat] || MATERIAL.grass) }); },
  step(mat = 'grass') { const m = MATERIAL[mat] || MATERIAL.grass; noise({ dur: 0.07, freq: m.freq * 0.7, q: m.q, gain: m.gain * 0.35 }); },
  place(mat = 'grass') { noise({ dur: 0.1, ...(MATERIAL[mat] || MATERIAL.grass), rate: 0.7 }); },
  hit() { noise({ dur: 0.08, freq: 900, q: 1, gain: 0.35 }); },
  hurt() { tone(320, 180, 0.18, 0.18, 'square'); },
  pop() { tone(500, 1200, 0.08, 0.12, 'sine'); },
  hiss() { noise({ dur: 1.4, freq: 5000, q: 0.5, type: 'highpass', gain: 0.25, attack: 0.3 }); },
  fuse() { noise({ dur: 2.5, freq: 4500, q: 0.5, type: 'highpass', gain: 0.18, attack: 0.1 }); },
  explode() { noise({ dur: 1.6, freq: 400, q: 0.6, gain: 1.0, attack: 0.005, rate: 0.5 }); tone(90, 30, 0.8, 0.5, 'sine'); },
  splash() { noise({ dur: 0.35, freq: 1400, q: 0.6, gain: 0.3, attack: 0.02 }); },
  oink() { tone(260, 200, 0.12, 0.08, 'sawtooth'); setTimeout(() => tone(240, 190, 0.1, 0.07, 'sawtooth'), 140); },
};

export function materialOf(id) {
  // ids from blocks.js
  if ([3, 4, 11, 13, 18, 19, 26, 27].includes(id)) return 'stone';
  if ([7, 9, 21, 22, 24, 25].includes(id)) return 'wood';
  if ([5, 12, 23].includes(id)) return 'gravel';
  if (id === 10) return 'glass';
  return 'grass';
}
