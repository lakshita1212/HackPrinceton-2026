// Three things that make the invisible parts visible to a judge:
//   1. The time lock: how much each role could know on this day (GET /knowledge),
//      and a "signal lost" burst when a question reaches past the station's day.
//   2. Gemini's pinned captions dropping onto a photo texted to the station.
//   3. The real archival recording, as a bubble in the call thread.
import { fetchKnowledge, connectPhone, fetchConfig, fetchBulletin } from './host.js';

const $ = (id) => document.getElementById(id);
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── 1. The time lock ─────────────────────────────────────────────────────
let lockRequest = 0;
export async function updateTimeLock({ pack, date }, roleId, roleName) {
  const el = $('timelock');
  if (!el) return;
  const mine = ++lockRequest;
  // The point is what's held back, so the historian (who knows everything) and
  // Wikipedia stations (no secrets, nothing ahead of the day) get no pill.
  const k = pack && roleId !== 'historian' && !pack.startsWith('wiki-') ? await fetchKnowledge({ pack, date }) : null;
  if (mine !== lockRequest) return; // the dial moved on while we waited
  if (!k) { el.hidden = true; return; }
  const known = k.roles[roleId] ?? 0;
  const future = k.later;
  const secret = Math.max(0, k.total - future - known);  // already happened, not for this role
  el.hidden = false;
  el.innerHTML = `
    <span class="lock-icon" aria-hidden="true">🔒</span>
    <span class="lock-text"><b></b> knows <b class="lock-n"></b> facts · <span class="lock-future"></span> haven't happened yet<span class="lock-secret"></span></span>`;
  el.querySelector('b').textContent = `The ${roleName.toLowerCase()}`;
  el.querySelector('.lock-n').textContent = known;
  el.querySelector('.lock-future').textContent = future;
  el.querySelector('.lock-secret').textContent = secret ? ` · ${secret} are secret` : '';
  el.title = `Of ${k.total} facts in this story: ${known} known to the ${roleName.toLowerCase()} today, ${future} still in the future, ${secret} known only to others.`;
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

// Text the station: a judge connects their phone, then scans a QR code that
// opens Messages to their assigned number with a first question filled in.
export function initTextCard() {
  const card = $('textCard');
  const toggle = $('textToggle');
  if (!card || !toggle) return;
  // The public copy online has no texting: that runs from our judging-table laptop.
  fetchConfig().then((c) => { if (c.texting === false) toggle.hidden = true; });
  const open = (show) => {
    card.hidden = !show;
    toggle.setAttribute('aria-expanded', String(show));
    if (show) $('textPhone').focus();
  };
  toggle.addEventListener('click', () => open(card.hidden));
  $('textClose').addEventListener('click', () => open(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !card.hidden) open(false); });
  $('textConnect').addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = e.target.querySelector('button');
    button.disabled = true;
    button.textContent = 'Connecting…';
    $('textError').hidden = true;
    const r = await connectPhone($('textPhone').value);
    button.disabled = false;
    button.textContent = 'Connect';
    if (r.error) {
      $('textError').textContent = r.error;
      $('textError').hidden = false;
      return;
    }
    $('textPhone').value = ''; // don't leave their number on screen
    $('textQr').src = r.qr;
    $('textNumber').textContent = r.pretty;
    $('textReady').hidden = false;
  });
}

// ── 2026 TV: this week's news, read by an AI anchor (GET /bulletin) ─────────
// Shown on the big screen for live stations (2026 and any day). Each headline
// card changes as the anchor reads it. Labeled "AI narration": it isn't a real
// broadcast, it's this week's Wikipedia headlines read aloud.
let bulletin = null;  // { audio, el, token }

export async function playBulletin(station, screen) {
  stopBulletin();
  const token = {};
  bulletin = { token };
  const el = document.createElement('div');
  el.className = 'bulletin';
  el.innerHTML = `
    <div class="bulletin-top"><span class="bulletin-brand">Stay Tuned News</span><span class="bulletin-live">AI narration · from Wikipedia</span></div>
    <div class="bulletin-card"><span class="bulletin-date"></span><p class="bulletin-text">Tuning in to this week's news…</p><span class="bulletin-source"></span></div>
    <div class="bulletin-bar"><span class="bulletin-count"></span><span class="bulletin-progress"><span></span></span></div>`;
  screen.append(el);
  bulletin.el = el;

  const b = await fetchBulletin(station);
  if (bulletin?.token !== token) return;  // closed or retuned while it loaded
  const text = el.querySelector('.bulletin-text');
  if (!b || !b.items?.length) { text.textContent = "No news on the wire for this week."; return; }

  const show = (item) => {
    const it = b.items[item];
    el.querySelector('.bulletin-date').textContent = it
      ? new Date(`${it.date}T12:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      : '';
    text.textContent = it ? it.text : (item === 'end' ? "That's the news. Stay tuned." : `The news through ${station.day.replace(/^News through /, '')}`);
    el.querySelector('.bulletin-source').textContent = it ? `Source: ${it.source.title}` : '';
    el.querySelector('.bulletin-count').textContent = it ? `${item + 1} of ${b.items.length}` : '';
    el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip');
  };
  show(null);

  if (b.audio && b.segments?.length) {
    const audio = new Audio(b.audio);
    bulletin.audio = audio;
    let current = null;
    const total = b.segments[b.segments.length - 1].end;
    audio.ontimeupdate = () => {
      const t = audio.currentTime;
      const seg = b.segments.find((s) => t >= s.start && t < s.end + 0.45);
      const item = seg ? (seg.item ?? (seg === b.segments[b.segments.length - 1] ? 'end' : null)) : current;
      if (item !== current) { current = item; show(item); }
      el.querySelector('.bulletin-progress span').style.width = `${Math.min(100, (t / total) * 100)}%`;
    };
    audio.play().catch(() => {});
  } else {
    // No recorded voice: the browser reads the same lines.
    let k = 0;
    const next = () => {
      if (bulletin?.token !== token || k >= b.lines.length) return;
      const item = k === 0 ? null : (k <= b.items.length ? k - 1 : 'end');
      show(item);
      const u = new SpeechSynthesisUtterance(b.lines[k++]);
      u.rate = 0.98;
      u.onend = next;
      speechSynthesis.speak(u);
    };
    next();
  }
}

export function stopBulletin() {
  if (!bulletin) return;
  bulletin.audio?.pause();
  speechSynthesis.cancel();
  bulletin.el?.remove();
  bulletin = null;
}

