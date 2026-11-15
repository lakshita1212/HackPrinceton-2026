import { STATIONS, ROLES } from './stations.js';
import { ROOMS, ROOM_IMAGES } from './rooms.js';
import { mediaFor } from './media.js';
import { createDial } from './dial.js';
import { ask, tuneStation, fetchTranscript, callByVoice } from './host.js';
import { sfx } from './audio.js';
import { createFx } from './fx.js';
import { playIntro } from './intro.js';

const $ = (id) => document.getElementById(id);
const state = { station: 0, role: 0 };
const radioAudio = new Audio();
let drawn = '';          // role + era of the room currently drawn
let captionTimer = 0;
let tuneTimer = 0;

const fx = createFx($('stage'), $('roomLayer'));
const station = () => STATIONS[state.station];
const role = () => ROLES[state.role];

// ── Scene ────────────────────────────────────────────────────────────────
// Position an overlay by percentages of the stage.
function place(el, { x, y, w, h }) {
  Object.assign(el.style, { left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` });
}

// Show the painted image for this role and era if there is one, else the drawn room.
function drawRoom(roleId, era) {
  const pic = ROOM_IMAGES[roleId]?.[era];
  $('photo').hidden = !pic;
  $('art').hidden = !!pic;
  $('radioHit').hidden = !pic?.radio;
  $('sprites').replaceChildren();
  if (pic) {
    $('art').innerHTML = '';
    $('photo').src = pic.src;
    $('photo').style.imageRendering = pic.pixel ? 'pixelated' : '';
    place($('screen'), pic.tv);
    if (pic.radio) place($('radioHit'), pic.radio);
    $('glow').style.background = (pic.lamps || [])
      .map((l) => `radial-gradient(circle at ${l.x}% ${l.y}%, rgba(255, 196, 110, .35), transparent ${l.r || 22}%)`)
      .join(', ') || 'none';
    $('stage').style.aspectRatio = pic.aspect || '3 / 2';
    fx.setRoom(pic);
    for (const sp of pic.sprites || []) {
      const el = document.createElement('img');
      el.src = sp.src;
      el.alt = '';
      el.className = `sprite ${sp.anim || ''}`;
      place(el, sp);
      $('sprites').append(el);
    }
  } else {
    const { tv, svg } = ROOMS[roleId];
    $('art').innerHTML = svg(era);
    place($('screen'), { x: tv.x / 16, y: tv.y / 10, w: tv.w / 16, h: tv.h / 10 });
    $('glow').style.background = 'none';
    $('stage').style.aspectRatio = '16 / 10';
    fx.setRoom(null);
  }
}

function renderScene() {
  const s = station();
  const r = role();
  const room = ROOMS[r.id];
  const era = s.era;

  // Redraw the room when the role or the era changes.
  if (drawn !== `${r.id}/${era}`) {
    drawn = `${r.id}/${era}`;
    drawRoom(r.id, era);
  }
  // Day-by-day props only belong to the 1962 crisis.
  $('art').querySelectorAll('[data-from]').forEach((el) => {
    el.style.display = era === '1962' && s.date >= el.dataset.from ? '' : 'none';
  });

  $('room').textContent = room.name;
  $('day').textContent = s.day;
  $('onAir').textContent = s.onAir;
  setPlaceholder();
  $('screen').className = `screen static era-${era}`;
  // A painted broadcast stays visible: no static, no text, until a clip plays.
  if (ROOM_IMAGES[r.id]?.[era]?.painted) $('screen').classList.replace('static', 'painted');
  stopMedia();

  const stage = $('stage');
  stage.className = `stage era-${era}${ROOM_IMAGES[r.id]?.[era] ? ' has-photo' : ''}`;
  void stage.offsetWidth; // restart the tuning flicker
  stage.classList.add('tuning');

  // Tell the host where the dial is, so texts are answered by this room.
  // Waits until the dial settles instead of sending every tick.
  clearTimeout(tuneTimer);
  tuneTimer = setTimeout(() => tuneStation({ role: r.id, date: s.date, pack: s.pack }), 400);
  $('mic').disabled = !s.pack;
}

// ── TV and radio ─────────────────────────────────────────────────────────
function showCaption(text, ms = 0) {
  clearTimeout(captionTimer);
  $('caption').textContent = text;
  $('caption').hidden = false;
  if (ms) captionTimer = setTimeout(() => { $('caption').hidden = true; }, ms);
}

function stopMedia() {
  const video = $('video');
  video.pause();
  video.removeAttribute('src');
  video.hidden = true;
  radioAudio.pause();
  $('tvBadge').hidden = true;
  $('caption').hidden = true;
}

function playTv() {
  sfx.unlock();
  const video = $('video');
  if (!video.hidden) {
    if (video.paused) video.play(); else video.pause();
    return;
  }
  const clip = mediaFor(station().date, role().id, 'video');
  if (!clip) {
    sfx.staticBurst();
    showCaption('Nothing on this channel yet.', 2500);
    return;
  }
  radioAudio.pause();
  video.src = clip.src;
  video.hidden = false;
  $('screen').classList.remove('static');
  $('tvBadge').textContent = clip.label;
  $('tvBadge').hidden = false;
  showCaption(clip.title, 4000);
  video.play();
}

function playRadio() {
  sfx.unlock();
  const clip = mediaFor(station().date, role().id, 'audio');
  if (!clip) {
    sfx.staticBurst();
    showCaption(`On the radio: ${station().onAir}`, 4000);
    return;
  }
  if (!radioAudio.paused) {
    radioAudio.pause();
    $('caption').hidden = true;
    return;
  }
  $('video').pause();
  if (!radioAudio.src.endsWith(clip.src)) radioAudio.src = clip.src;
  showCaption(`Radio: ${clip.title} (${clip.label})`);
  radioAudio.play();
}

$('screen').addEventListener('click', playTv);
$('screen').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playTv(); }
});
$('art').addEventListener('click', (e) => {
  if (e.target.closest('[data-hit="radio"]')) playRadio();
});
$('radioHit').addEventListener('click', playRadio);

// ── Dial and rooms ───────────────────────────────────────────────────────
// Crossing into another decade plays the time-travel tunnel; the new room is
// swapped in while the tunnel hides it. Days within a decade just retune.
let booted = false;
let shownEra = STATIONS[0].era;
let warpTimer = 0;
let warpPending = false;
function flyYear(text) {
  const el = $('warpYear');
  el.textContent = text;
  el.classList.remove('go');
  void el.offsetWidth;
  el.classList.add('go');
}
const dial = createDial($('dial'), {
  stations: STATIONS,
  onChange: (i) => {
    state.station = i;
    const s = STATIONS[i];
    if (booted && s.era !== shownEra) {
      shownEra = s.era;
      sfx.warp();
      fx.warp();
      flyYear(s.era === '1962' ? 'October 1962' : s.era);
      clearTimeout(warpTimer);
      warpPending = true;
      warpTimer = setTimeout(() => { warpPending = false; renderScene(); }, 380);
    } else {
      shownEra = s.era;
      sfx.staticBurst();
      if (!warpPending) renderScene();   // a pending warp will draw the latest station
    }
  },
});

const roleButtons = ROLES.map((r, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('role', 'tab');
  b.textContent = r.name;
  b.addEventListener('click', () => {
    sfx.unlock();
    state.role = i;
    roleButtons.forEach((x, j) => x.setAttribute('aria-selected', String(j === i)));
    renderScene();
  });
  $('roles').append(b);
  return b;
});
roleButtons[0].setAttribute('aria-selected', 'true');

// Deep links for the demo: ?station=Oct%2022&role=official
const params = new URLSearchParams(location.search);
const startRole = ROLES.findIndex((r) => r.id === params.get('role'));
if (startRole > 0) roleButtons[startRole].click();
const startStation = STATIONS.findIndex((s) => s.label === params.get('station'));
if (startStation > 0) dial.setIndex(startStation);

// ── Call-in ──────────────────────────────────────────────────────────────
function addLine(className, text, who) {
  const li = document.createElement('li');
  li.className = className;
  li.textContent = text;
  if (who) li.dataset.who = who;
  $('transcript').append(li);
  li.scrollIntoView({ block: 'end' });
  return li;
}

function addSources(li, sources) {
  if (!sources.length) return;
  const chips = document.createElement('div');
  chips.className = 'chips';
  for (const src of sources) {
    const label = typeof src === 'string' ? src : [src.title, src.date].filter(Boolean).join(', ');
    const chip = document.createElement(src.url ? 'a' : 'span');
    chip.className = 'chip';
    if (src.citation) chip.title = src.citation;
    chip.textContent = label || 'source';
    if (src.url) { chip.href = src.url; chip.target = '_blank'; chip.rel = 'noopener'; }
    chips.append(chip);
  }
  li.append(chips);
}

// Fill in an answer line: in-character refusals in red, sources as chips.
function showAnswer(li, reply) {
  if (reply.blocked) {
    // The host sends an in-character refusal; fall back to our own line if it's empty.
    li.className = 'a blocked';
    li.textContent = reply.answer || "The line crackles. That hasn't happened yet.";
  } else {
    li.className = reply.live === false ? 'a scripted' : 'a';
    li.textContent = reply.answer;
    addSources(li, reply.sources || []);
  }
}

const roleName = (id) => ROLES.find((r) => r.id === id)?.name || id;
const dayLabel = (date) => STATIONS.find((s) => s.date === date)?.label || date;
function setPlaceholder() {
  $('question').placeholder = `Ask the ${role().name.toLowerCase()} a question…`;
}

$('askForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  sfx.unlock();
  const input = $('question');
  const question = input.value.trim();
  if (!question) return;
  const s = station();
  const r = role();

  input.value = '';
  addLine('q', question);
  const button = $('askForm').querySelector('button[type="submit"]');
  button.disabled = true;
  const pending = addLine('a', '…', `${r.name}, ${s.label}`);
  const reply = await ask({ question, role: r.id, date: s.date, pack: s.pack });
  button.disabled = false;
  showAnswer(pending, reply);
});

// ── Switchboard: texts and calls that reach the station from outside ─────
// Polls the host's call log. Starts from what's already there, so only new
// call-ins appear. Voice calls from this laptop are shown when they're made.
let lastSeq = null;
async function pollSwitchboard() {
  const items = await fetchTranscript(lastSeq ?? 0);
  if (lastSeq === null) {
    lastSeq = items.reduce((m, it) => Math.max(m, it.seq), 0);
  } else {
    for (const it of items) {
      lastSeq = Math.max(lastSeq, it.seq);
      if (it.channel === 'voice' && it.caller === 'laptop mic') continue;
      const kind = it.channel === 'imessage' ? 'Text' : 'Call';
      const who = `${roleName(it.role)}, ${dayLabel(it.date)}`;
      addLine('caller', `${kind} from ${it.caller} · ${who}`);
      addLine('q from-caller', it.question);
      showAnswer(addLine('a', '', who), it);
      sfx.tick();
      showCaption(`${kind} coming in from ${it.caller}`, 3000);
    }
  }
  setTimeout(pollSwitchboard, 2000);
}
pollSwitchboard();

// ── Call by voice: hold the mic button (or the space bar) and talk ───────
let recorder = null;
let micStream = null;
let answerAudio = null;

async function startTalking() {
  sfx.unlock();
  if (recorder?.state === 'recording' || $('mic').disabled) return;
  try {
    micStream ??= await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    showCaption('The microphone is blocked. Allow it in the browser, or type your question.', 4000);
    return;
  }
  speechSynthesis.cancel();
  answerAudio?.pause();
  const chunks = [];
  recorder = new MediaRecorder(micStream);
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => sendCall(new Blob(chunks, { type: recorder.mimeType }));
  recorder.start();
  $('mic').classList.add('live');
  $('question').placeholder = 'Listening… let go to hang up';
}

function stopTalking() {
  if (recorder?.state === 'recording') recorder.stop();
  $('mic').classList.remove('live');
  setPlaceholder();
}

async function sendCall(blob) {
  if (blob.size < 1000) {
    showCaption('Hold the button down while you talk.', 2500);
    return;
  }
  const s = station();
  const r = role();
  const q = addLine('q', '…');
  const a = addLine('a', '…', `${r.name}, ${s.label}`);
  const reply = await callByVoice(blob, { role: r.id, date: s.date, pack: s.pack });
  if (reply.error) {
    q.remove();
    a.className = 'a blocked';
    a.textContent = reply.error;
    return;
  }
  q.textContent = reply.question || '(the line crackled)';
  showAnswer(a, reply);
  speakAnswer(reply);
}

// Play the host's voice for the role, or let the browser read it out.
function speakAnswer(reply) {
  if (reply.audio) {
    answerAudio = new Audio(`data:audio/wav;base64,${reply.audio}`);
    answerAudio.play();
  } else if (reply.answer) {
    const u = new SpeechSynthesisUtterance(reply.answer);
    u.rate = 0.95;
    speechSynthesis.speak(u);
  }
}

$('mic').addEventListener('pointerdown', (e) => { e.preventDefault(); startTalking(); });
$('mic').addEventListener('pointerup', stopTalking);
$('mic').addEventListener('pointerleave', stopTalking);
const typing = (el) => el.matches('input, textarea, select, button');
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat && !typing(e.target)) { e.preventDefault(); startTalking(); }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && !typing(e.target)) stopTalking();
});

renderScene();
booted = true;

// Opening scene, once the fonts are in so the radio's dial is lettered properly.
document.fonts.ready.then(() => playIntro($('intro')));
