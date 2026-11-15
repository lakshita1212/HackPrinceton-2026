// Small sound effects made in the browser, so they work before any media is added.
// Browsers only allow sound after a click or key press, so call sfx.unlock() from one.
let ctx = null;

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
};
