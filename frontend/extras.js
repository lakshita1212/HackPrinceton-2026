// Three things that make the invisible parts visible to a judge:
//   1. The time lock: how much each role could know on this day (GET /knowledge),
//      and a "signal lost" burst when a question reaches past the station's day.
//   2. Gemini's pinned captions dropping onto a photo texted to the station.
//   3. The real archival recording, as a bubble in the call thread.
import { fetchKnowledge } from './host.js';

const $ = (id) => document.getElementById(id);
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── 1. The time lock ─────────────────────────────────────────────────────
let lockRequest = 0;
export async function updateTimeLock({ pack, date }, roleId, roleName) {
  const el = $('timelock');
  if (!el) return;
  const mine = ++lockRequest;
  const k = pack ? await fetchKnowledge({ pack, date }) : null;
  if (mine !== lockRequest) return; // the dial moved on while we waited
  if (!k) { el.hidden = true; return; }
  const known = k.roles[roleId] ?? 0;
  const pct = Math.round((known / Math.max(1, k.total)) * 100);
  el.hidden = false;
  el.innerHTML = `
    <span class="lock-icon" aria-hidden="true">🔒</span>
    <span class="lock-text"><b></b> knows <b class="lock-n"></b> of <span class="lock-total"></span> facts</span>
    <span class="lock-bar" aria-hidden="true"><span style="width:${pct}%"></span></span>`;
  el.querySelector('b').textContent = `The ${roleName.toLowerCase()}`;
  el.querySelector('.lock-n').textContent = known;
  el.querySelector('.lock-total').textContent = k.total;
  const others = Object.entries(k.roles)
    .map(([r, n]) => `${r[0].toUpperCase()}${r.slice(1)}: ${n}`)
    .join(' · ');
  el.title = `What each role could know on this day. ${others}. ${k.later} facts haven't happened yet.`;
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
}

// A question that reaches past the station's day: the signal drops out.
export function signalLost() {
  const el = $('signalLost');
  if (!el) return;
  // Visual only: no static burst (the team took static sounds out of the app).
  el.hidden = false;
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
  clearTimeout(signalLost.t);
  signalLost.t = setTimeout(() => { el.hidden = true; }, reduceMotion() ? 2500 : 2200);
}

// ── 2. Gemini's pins on a texted photo ───────────────────────────────────
// `frame` wraps the <img>; pins are placed by fractions of its width and height.
export function renderPins(frame, memory, { animate = true } = {}) {
  frame.querySelectorAll('.pin').forEach((p) => p.remove());
  const img = frame.querySelector('img');
  // Size the frame to the photo's own shape (tall phone photos capped at 46% of the
  // screen height), so the picture fills it exactly and the pins line up.
  if (memory.width && memory.height) {
    const ratio = memory.width / memory.height;
    frame.style.width = `min(100%, calc(46vh * ${ratio.toFixed(3)}))`;
    frame.style.aspectRatio = `${memory.width} / ${memory.height}`;
  }
  if (img && memory.alt_text) img.alt = memory.alt_text;
  (memory.pins || []).forEach((p, i) => {
    const pin = document.createElement('span');
    pin.className = 'pin';
    pin.style.left = `${p.x * 100}%`;
    pin.style.top = `${p.y * 100}%`;
    // Keep labels inside the photo: flip them to the left on the right-hand side.
    if (p.x > 0.6) pin.classList.add('left');
    pin.innerHTML = '<span class="pin-dot"></span><span class="pin-label"></span>';
    pin.querySelector('.pin-label').textContent = p.label;
    if (animate && !reduceMotion()) pin.style.animationDelay = `${0.6 + i * 0.45}s`;
    else pin.classList.add('still');
    frame.append(pin);
  });
}

export function eraLine(memory) {
  return memory.era_guess ? `Looks like the ${memory.era_guess} (a guess by Gemini)` : '';
}

// How long a texted photo stays on the air: longer when its pins need time to land.
export function onAirMs(memory) {
  return 7000 + (memory.pins?.length || 0) * 600;
}

// ── 3. The real recording, after the answer ──────────────────────────────
// Returns a function that plays it (used to play it right after a spoken answer).
export function archivalBubble(li, clip, { onStart = () => {}, onEnd = () => {} } = {}) {
  if (!clip) return null;
  const box = document.createElement('div');
  box.className = 'archival';
  box.innerHTML = `
    <button type="button" class="archival-play" aria-label="Play the archival recording">▶</button>
    <div class="archival-body">
      <span class="archival-tag">Archival recording</span>
      <span class="archival-title"></span>
      <q class="archival-quote"></q>
      <span class="archival-bar"><span></span></span>
    </div>`;
  box.querySelector('.archival-title').textContent = clip.title;
  box.querySelector('.archival-title').title = clip.source;
  const quote = box.querySelector('.archival-quote');
  const words = clip.quote.split(/\s+/);
  quote.textContent = clip.quote;
  li.append(box);

  let audio = null;
  const bar = box.querySelector('.archival-bar span');
  const button = box.querySelector('.archival-play');
  const length = clip.end - clip.start;

  const stop = () => {
    audio.pause();
    button.textContent = '▶';
    box.classList.remove('playing');
    quote.textContent = clip.quote;
    onEnd();
  };
  const play = () => {
    if (audio && !audio.paused) { stop(); return; }
    audio = audio || new Audio(clip.src);
    const start = () => { audio.currentTime = clip.start; audio.play().catch(() => {}); };
    if (audio.readyState >= 1) start(); else audio.addEventListener('loadedmetadata', start, { once: true });
    button.textContent = '❚❚';
    box.classList.add('playing');
    onStart();
    audio.onended = stop;
    audio.ontimeupdate = () => {
      const t = Math.max(0, audio.currentTime - clip.start);
      bar.style.width = `${Math.min(100, (t / length) * 100)}%`;
      // The quote appears word by word, like subtitles, as he says it.
      const shown = Math.ceil((t / length) * words.length);
      quote.innerHTML = '';
      const said = document.createElement('span');
      said.textContent = words.slice(0, shown).join(' ');
      const rest = document.createElement('span');
      rest.className = 'unsaid';
      rest.textContent = ' ' + words.slice(shown).join(' ');
      quote.append(said, rest);
      if (audio.currentTime >= clip.end) stop();
    };
  };
  button.addEventListener('click', play);
  return play;
}
