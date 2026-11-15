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
    <span class="lock-text"><b></b> <b class="lock-n"></b> facts · <span class="lock-future"></span> still ahead<span class="lock-secret"></span></span>`;
  el.querySelector('b').textContent = 'Knows';
  el.querySelector('.lock-n').textContent = known;
  el.querySelector('.lock-future').textContent = future;
  el.querySelector('.lock-secret').textContent = secret ? ` · ${secret} secret` : '';
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
// Every archival recording that has started, so hanging up can stop them.
const playingClips = new Set();
export function stopArchival() {
  playingClips.forEach((a) => a.pause());
}

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
    playingClips.add(audio);
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


// ── The call screen: a telephone and big, readable lines during a voice call ──
// Opens when you hold the mic: the phone of that era (rotary through the '60s,
// push-button from the '80s), the status of the call, what you said, what they
// said, and the real recording if there is one.
const ROTARY = `
<svg viewBox="0 0 240 200" aria-hidden="true">
  <ellipse cx="120" cy="184" rx="96" ry="10" fill="rgba(0,0,0,.35)"/>
  <path d="M40 176 C40 120 62 92 120 92 C178 92 200 120 200 176 Z" style="fill:var(--phone)"/>
  <path d="M52 172 C54 128 72 104 120 104 C168 104 186 128 188 172 Z" style="fill:var(--phone-shine)" opacity=".18"/>
  <circle cx="120" cy="140" r="34" fill="#f3ead6"/>
  <g fill="#2a2018">${[...Array(10)].map((_, i) => {
    const a = (-60 + i * 30) * Math.PI / 180;
    return `<circle cx="${(120 + 23 * Math.cos(a)).toFixed(1)}" cy="${(140 + 23 * Math.sin(a)).toFixed(1)}" r="5.2"/>`;
  }).join('')}</g>
  <circle cx="120" cy="140" r="10" style="fill:var(--phone)"/>
  <g class="handset"><path d="M30 78 C30 58 52 52 64 60 L176 60 C188 52 210 58 210 78 C210 90 196 92 186 86 L170 76 L70 76 L54 86 C44 92 30 90 30 78 Z" style="fill:var(--phone)"/>
  <path d="M60 64 L180 64" style="stroke:var(--phone-shine)" stroke-opacity=".25" stroke-width="3"/></g>
  <path class="cord" d="M196 168 q12 8 4 16 q-8 8 4 16" fill="none" style="stroke:var(--phone)" stroke-width="4"/>
</svg>`;
const TOUCHTONE = `
<svg viewBox="0 0 240 200" aria-hidden="true">
  <ellipse cx="120" cy="186" rx="92" ry="9" fill="rgba(0,0,0,.3)"/>
  <path d="M44 178 L58 104 C60 96 66 92 74 92 L166 92 C174 92 180 96 182 104 L196 178 Z" style="fill:var(--phone)"/>
  <rect x="88" y="108" width="64" height="62" rx="5" fill="rgba(0,0,0,.12)"/>
  <g fill="#f6f1e6">${[...Array(12)].map((_, i) =>
    `<rect x="${94 + (i % 3) * 19}" y="${113 + Math.floor(i / 3) * 14}" width="14" height="10" rx="2"/>`).join('')}</g>
  <g class="handset"><path d="M34 76 C34 58 54 54 66 62 L174 62 C186 54 206 58 206 76 C206 88 192 90 182 84 L168 76 L72 76 L58 84 C48 90 34 88 34 76 Z" style="fill:var(--phone)"/></g>
  <path class="cord" d="M192 170 q12 8 4 16 q-8 8 4 16" fill="none" style="stroke:var(--phone)" stroke-width="4"/>
</svg>`;

// How a call works: 📞 Call opens this screen and the phone rings, then connects.
// Hold "Hold to talk" (or the space bar), ask, let go. The answer is spoken, then
// the real recording plays if there is one. Ask again the same way; Hang up ends it.
export const callScreen = {
  onHangup: () => {},
  onTalkStart: () => {},
  onTalkStop: () => {},
  open({ who, era }) {
    const el = $('callScreen');
    if (!el) return;
    el.dataset.era = era;
    $('callPhone').innerHTML = Number(era) >= 1980 ? TOUCHTONE : ROTARY;
    $('callWho').textContent = who;
    $('callLog').innerHTML = '';
    el.hidden = false;
    this.status('Ringing…', 'dialing');
    clearTimeout(this.ringTimer);
    this.ringTimer = setTimeout(() => this.ready('Connected. Hold to talk.'), 1400);
    $('callTalk').focus();
  },
  // Waiting for the caller: they can hold to talk.
  ready(text = 'Hold to talk to ask another question') {
    this.status(text, 'connected');
    $('callTalk').disabled = false;
  },
  listening() {
    clearTimeout(this.ringTimer);
    this.status("Listening… let go when you're done", 'listening');
  },
  sending() {
    this.status('One moment…', 'dialing');
    $('callTalk').disabled = true;
  },
  status(text, phase) {
    if (!this.isOpen()) return;
    $('callStatus').textContent = text;
    if (phase) $('callScreen').className = `call-screen ${phase}`;
  },
  // One question and its answer, added to the conversation on screen.
  exchange({ question, answer, sources = [], blocked = false, archival = null }) {
    const log = $('callLog');
    const you = document.createElement('div');
    you.className = 'call-row you';
    you.innerHTML = '<span class="call-label">You</span><p></p>';
    you.querySelector('p').textContent = question;
    const them = document.createElement('div');
    them.className = `call-row them${blocked ? ' blocked' : ''}`;
    them.innerHTML = '<span class="call-label">On the line</span><p></p><div class="call-sources"></div>';
    them.querySelector('p').textContent = answer;
    for (const src of sources.slice(0, 3)) {
      const chip = document.createElement('span');
      chip.className = 'call-source';
      chip.textContent = src.title;
      chip.title = src.citation || '';
      them.querySelector('.call-sources').append(chip);
    }
    log.append(you, them);
    if (archival) {
      const ar = document.createElement('div');
      ar.className = 'call-archival';
      ar.innerHTML = '<span class="call-label">📼 Archival recording</span><span class="call-archival-title"></span><q></q>';
      ar.querySelector('.call-archival-title').textContent = archival.title;
      ar.querySelector('q').textContent = archival.quote;  // <q> adds the quotation marks
      log.append(ar);
    }
    log.scrollTop = log.scrollHeight;
  },
  close() {
    clearTimeout(this.ringTimer);
    const el = $('callScreen');
    if (el) el.hidden = true;
  },
  isOpen() {
    return !!$('callScreen') && !$('callScreen').hidden;
  },
};

export function initCallScreen() {
  const el = $('callScreen');
  if (!el) return;
  const hangUp = () => { callScreen.onHangup(); callScreen.close(); };
  $('callHangup').addEventListener('click', hangUp);
  // Hold to talk. The pointer is captured while held, so sliding off the button
  // doesn't cut you off mid-sentence; only letting go does.
  const talk = $('callTalk');
  talk.addEventListener('pointerdown', (e) => {
    if (talk.disabled) return;
    e.preventDefault();
    talk.setPointerCapture?.(e.pointerId);
    callScreen.onTalkStart();
  });
  talk.addEventListener('pointerup', () => callScreen.onTalkStop());
  talk.addEventListener('pointercancel', () => callScreen.onTalkStop());
  // While a call is open, the space bar always means "talk" (never "press the
  // focused button", so it can't hang up by accident), and Esc hangs up.
  window.addEventListener('keydown', (e) => {
    if (!callScreen.isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); hangUp(); return; }
    if (e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat && !talk.disabled) callScreen.onTalkStart();
    }
  }, true);
  window.addEventListener('keyup', (e) => {
    if (!callScreen.isOpen() || e.code !== 'Space') return;
    e.preventDefault();
    e.stopPropagation();
    callScreen.onTalkStop();
  }, true);
}

// The two telephones, for previews and tests.
export const PHONES = { ROTARY, TOUCHTONE };
