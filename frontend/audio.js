// Small sound effects made in the browser, so they work before any media is added.
// Browsers only allow sound after a click or key press, so call sfx.unlock() from one.
let ctx = null;
let rainGain = null;
let rainLevel = 0;

function noise(seconds, { freq, q = 1, gain = 0.4, decay = 3 }) {
  if (!ctx || ctx.state !== 'running') return;
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const vol = ctx.createGain();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  vol.gain.value = gain;
  src.buffer = buf;
  src.connect(filter).connect(vol).connect(ctx.destination);
  src.start();
}

export const sfx = {
  unlock() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    }
    if (ctx.state === 'suspended') ctx.resume();
  },
  tick() { noise(0.015, { freq: 2400, gain: 0.8 }); },
  staticBurst() { noise(0.45, { freq: 1800, q: 0.4, gain: 0.25, decay: 1.5 }); },
  // Steady rain: looping filtered noise whose volume follows the rain (0..1).
  rain(level) {
    if (!ctx || ctx.state !== 'running') return;
    if (!rainGain) {
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      rainGain = ctx.createGain();
      rainGain.gain.value = 0;
      src.connect(lp).connect(rainGain).connect(ctx.destination);
      src.start();
    }
    const v = Math.max(0, level) * 0.07;
    if (Math.abs(v - rainLevel) > 0.002) {
      rainLevel = v;
      rainGain.gain.setTargetAtTime(v, ctx.currentTime, 0.3);
    }
  },
  // Distant thunder: a low rumble that swells and rolls away.
  thunder() {
    if (!ctx || ctx.state !== 'running') return;
    const len = Math.floor(ctx.sampleRate * 3);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    const lp = ctx.createBiquadFilter();
    const vol = ctx.createGain();
    const now = ctx.currentTime;
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    vol.gain.setValueAtTime(0.001, now);
    vol.gain.exponentialRampToValueAtTime(0.9, now + 0.3);
    vol.gain.exponentialRampToValueAtTime(0.001, now + 3);
    src.buffer = buf;
    src.connect(lp).connect(vol).connect(ctx.destination);
    src.start();
  },
  // Time-travel whoosh: static that sweeps up in pitch, swells and falls away.
  warp(seconds = 1.7) {
    if (!ctx || ctx.state !== 'running') return;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const vol = ctx.createGain();
    const now = ctx.currentTime;
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(250, now);
    filter.frequency.exponentialRampToValueAtTime(3200, now + seconds * 0.6);
    filter.frequency.exponentialRampToValueAtTime(600, now + seconds);
    vol.gain.setValueAtTime(0.001, now);
    vol.gain.exponentialRampToValueAtTime(0.35, now + seconds * 0.45);
    vol.gain.exponentialRampToValueAtTime(0.001, now + seconds);
    src.buffer = buf;
    src.connect(filter).connect(vol).connect(ctx.destination);
    src.start();
  },
};
