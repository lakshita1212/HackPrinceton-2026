// Background sound for each room. Offices get period office noise (typewriters
// in the 1960s, keyboards later, a ticking clock in the official's office); the
// historian's study gets a grandfather clock. The living room has no loop here:
// its own TV plays softly instead (app.js). Typing comes in bursts with pauses,
// like a real office, instead of one endless loop. Files are in media/ambience/
// (sources in MEDIA.md). Off until the first click, as browsers require.
const DIR = 'media/ambience/';
const TYPEWRITER = { file: 'typewriter-smith-corona.ogg', volume: 0.3, bursts: true };
const KEYBOARD_1989 = { file: 'keyboard-model-m-1986.ogg', volume: 0.25, bursts: true };
const KEYBOARD_NOW = { file: 'keyboard-modern.ogg', volume: 0.22, bursts: true };
const CLOCK = { file: 'clock-ticking.ogg', volume: 0.22 };
const GRANDFATHER = { file: 'grandfather-clock.ogg', volume: 0.28 };

const ROOMS = {
  journalist: { 1962: [TYPEWRITER], 1969: [TYPEWRITER], 1989: [KEYBOARD_1989], 2026: [KEYBOARD_NOW] },
  official: {
    1962: [CLOCK], 1969: [CLOCK],
    1989: [CLOCK, { ...KEYBOARD_1989, volume: 0.12 }],
    2026: [{ ...CLOCK, volume: 0.15 }, { ...KEYBOARD_NOW, volume: 0.1 }],
  },
  historian: { 1962: [GRANDFATHER], 1969: [GRANDFATHER], 1989: [GRANDFATHER], 2026: [GRANDFATHER] },
};

const KEY = 'stay-tuned-sound';
let enabled = true;
try { enabled = localStorage.getItem(KEY) !== 'off'; } catch { /* default on */ }
let unlocked = false;
let ducked = false;
let current = [];  // { el, layer, timer }
let room = { role: null, era: null };

function stopAll() {
  for (const c of current) {
    clearTimeout(c.timer);
    c.el.pause();
    c.el.removeAttribute('src');
    c.el.load();
  }
  current = [];
}

function play() {
  stopAll();
  if (!enabled || !unlocked) return;
  for (const layer of ROOMS[room.role]?.[room.era] || []) {
    const el = new Audio(DIR + layer.file);
    el.volume = ducked ? layer.volume * 0.2 : layer.volume;
    const c = { el, layer, timer: 0 };
    if (layer.bursts) {
      // A few seconds of typing, then a pause, from a random point in the recording.
      const burst = () => {
        if (!el.duration) return;
        el.currentTime = Math.random() * Math.max(0, el.duration - 6);
        el.play().catch(() => {});
        c.timer = setTimeout(() => { el.pause(); c.timer = setTimeout(burst, 1500 + Math.random() * 5000); },
          2500 + Math.random() * 4000);
      };
      el.addEventListener('loadedmetadata', burst, { once: true });
    } else {
      el.loop = true;
      el.play().catch(() => {});
    }
    current.push(c);
  }
}

export const ambience = {
  setRoom(role, era) {
    if (room.role === role && room.era === era && current.length) return;
    room = { role, era };
    play();
  },
  // Quieter while the big screen, a paper or a spoken answer has the floor.
  duck(on) {
    ducked = on;
    for (const c of current) c.el.volume = on ? c.layer.volume * 0.2 : c.layer.volume;
  },
  // Browsers only allow sound after the first click; call this from one.
  unlock() {
    if (unlocked) return;
    unlocked = true;
    play();
  },
  setEnabled(on) {
    enabled = on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* fine */ }
    play();
  },
  get enabled() { return enabled; },
  get unlocked() { return unlocked; },
  get ducked() { return ducked; },
};
