import { STATIONS, ROLES } from './stations.js';
import { ROOMS, ROOM_IMAGES } from './rooms.js';
import { clipsFor, channelName } from './media.js';
import { createDial } from './dial.js';
import { ask, tuneStation, fetchTranscript, callByVoice } from './host.js';
import { sfx } from './audio.js';
import { createFx } from './fx.js';
import { playIntro } from './intro.js';

const $ = (id) => document.getElementById(id);
const state = { station: 0, role: 0 };
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
  startAmbient();

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

// ── Big screen: the TV and the radio open a player over the room ────────
// The TV plays the room's footage in a large vintage set; the radio opens a
// matching radio. The knobs flip through every channel (TV) or frequency
// (radio) this room can tune in. With no clip, it shows the broadcast line.
const viewerState = { kind: 'tv', clips: [], i: 0 };

function openViewer(kind) {
  sfx.unlock();
  const s = station();
  const r = role();
  const clips = clipsFor(s, r.id, kind === 'tv' ? 'video' : 'audio');
  // The TV opens on whatever was already playing in the room.
  const onAir = clips.findIndex((c) => c.src === ambientClip?.src);
  viewerState.kind = kind;
  viewerState.clips = clips;
  viewerState.i = kind === 'tv' && onAir >= 0 ? onAir : Math.floor(Math.random() * clips.length) || 0;
  const viewer = $('viewer');
  viewer.dataset.kind = kind;
  const what = kind === 'tv' ? 'channel' : 'station';
  $('chanUp').setAttribute('aria-label', `Next ${what}`);
  $('chanDown').setAttribute('aria-label', `Previous ${what}`);
  $('chanUpLabel').textContent = kind === 'tv' ? 'Channel ▲' : 'Tune ▶';
  $('chanDownLabel').textContent = kind === 'tv' ? 'Channel ▼' : 'Tune ◀';
  $('viewerCard').textContent = s.onAir;
  pauseAmbient();
  viewer.hidden = false;
  showClip();
  $('viewerClose').focus();
}

// Put the current channel's clip on the big screen.
function showClip() {
  const s = station();
  const r = role();
  const { kind, clips, i } = viewerState;
  const clip = clips[i];
  const viewer = $('viewer');
  viewer.classList.toggle('has-clip', !!clip);
  viewer.classList.toggle('one-channel', clips.length < 2);
  $('viewerChannel').textContent = clip
    ? `${channelName(kind === 'tv' ? 'video' : 'audio', s.era, i)}${clips.length > 1 ? ` · ${i + 1}/${clips.length}` : ''}`
    : '';
  $('viewerTitle').textContent = clip ? clip.title : kind === 'tv' ? 'On television' : 'On the radio';
  $('viewerMeta').textContent = [s.day, ROOMS[r.id].name, clip?.source].filter(Boolean).join(' · ');
  $('viewerStamp').textContent = clip?.label || '';
  $('viewerStamp').hidden = !clip;
  const video = $('viewerVideo');
  const audio = $('viewerAudio');
  video.hidden = !(clip && kind === 'tv');
  audio.hidden = !(clip && kind === 'radio');
  if (clip && kind === 'tv') { video.src = clip.src; video.play().catch(() => {}); }
  if (clip && kind === 'radio') { audio.src = clip.src; audio.play().catch(() => {}); }
}

// Turn the knob: the next or previous channel, wrapping around.
function changeChannel(step) {
  const n = viewerState.clips.length;
  if (n < 2) return;
  viewerState.i = (viewerState.i + step + n) % n;
  const screen = document.querySelector('.viewer-screen');
  screen.classList.remove('switching');
  void screen.offsetWidth;
  screen.classList.add('switching');
  showClip();
}

function closeViewer() {
  for (const el of [$('viewerVideo'), $('viewerAudio')]) {
    el.pause();
    el.removeAttribute('src');
    el.load();
  }
  $('viewer').hidden = true;
  resumeAmbient();
}

function stopMedia() {
  if (!$('viewer').hidden) closeViewer();
  $('caption').hidden = true;
}

// ── The room's own TV: a random channel plays silently on the set ────────
let ambientClip = null;
function startAmbient() {
  const old = $('screen').querySelector('video');
  if (old) { old.pause(); old.remove(); }
  const clips = clipsFor(station(), role().id, 'video');
  ambientClip = clips[Math.floor(Math.random() * clips.length)] || null;
  $('screen').classList.toggle('on-air', !!ambientClip);
  if (!ambientClip) return;
  const v = document.createElement('video');
  Object.assign(v, { src: ambientClip.src, muted: true, loop: true, autoplay: true, playsInline: true });
  v.setAttribute('aria-hidden', 'true');
  // Start somewhere in the middle, like turning on a set that was already on.
  v.addEventListener('loadedmetadata', () => {
    if (v.duration > 20) v.currentTime = Math.random() * (v.duration - 15);
  }, { once: true });
  $('screen').prepend(v);
  v.play().catch(() => {});
  $('screen').setAttribute('aria-label', `Television, ${ambientClip.title}: open the big screen`);
}
function pauseAmbient() { $('screen').querySelector('video')?.pause(); }
function resumeAmbient() { $('screen').querySelector('video')?.play().catch(() => {}); }

const playTv = () => openViewer('tv');
const playRadio = () => openViewer('radio');
$('viewerClose').addEventListener('click', closeViewer);
$('viewer').addEventListener('click', (e) => { if (e.target === $('viewer')) closeViewer(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('viewer').hidden) closeViewer(); });
$('chanUp').addEventListener('click', () => changeChannel(1));
$('chanDown').addEventListener('click', () => changeChannel(-1));
window.addEventListener('keydown', (e) => {
  if ($('viewer').hidden || e.target.matches('video, audio')) return;
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); changeChannel(1); }
  if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); changeChannel(-1); }
});
// the radio's speaker bars dance only while it's playing
$('viewerAudio').addEventListener('play', () => $('viewer').classList.add('playing'));
$('viewerAudio').addEventListener('pause', () => $('viewer').classList.remove('playing'));

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
// Answers are laid out like a text thread: the role's face from its painted
// room as the profile picture, then who it is and what they said.
function addLine(className, text, who, speaker) {
  const li = document.createElement('li');
  li.className = className;
  if (who) li.dataset.who = who;
  if (speaker) {
    li.classList.add('with-avatar');
    const msg = document.createElement('div');
    msg.className = 'msg';
    const name = document.createElement('span');
    name.className = 'who';
    name.textContent = who;
    const body = document.createElement('span');
    body.className = 'text';
    body.textContent = text;
    msg.append(name, body);
    li.append(avatar(speaker.role, speaker.date), msg);
  } else {
    li.textContent = text;
  }
  $('transcript').append(li);
  li.scrollIntoView({ block: 'end' });
  return li;
}

// The text part of a line, and where its source chips go.
const textOf = (li) => li.querySelector('.text') || li;
const msgOf = (li) => li.querySelector('.msg') || li;

// A round crop of the person in this role's room for that day's era.
function avatar(roleId, date) {
  const era = (STATIONS.find((s) => s.date === date) || station()).era;
  const pic = ROOM_IMAGES[roleId]?.[era];
  const el = document.createElement('span');
  el.className = `avatar avatar-${roleId}`;
  el.setAttribute('aria-hidden', 'true');
  if (pic?.face) {
    // Zoom the painting k times the avatar's width and centre it on the face.
    const k = 5;
    const kh = k * 2 / 3; // paintings are 3:2
    const px = Math.min(100, Math.max(0, ((pic.face.x / 100) * k - 0.5) / (k - 1) * 100));
    const py = Math.min(100, Math.max(0, ((pic.face.y / 100) * kh - 0.5) / (kh - 1) * 100));
    Object.assign(el.style, {
      backgroundImage: `url(${pic.src})`,
      backgroundSize: `${k * 100}% auto`,
      backgroundPosition: `${px}% ${py}%`,
    });
  } else {
    el.textContent = roleName(roleId).charAt(0);
  }
  return el;
}

function addSources(li, sources) {
  if (!sources.length) return;
  const chips = document.createElement('div');
  chips.className = 'chips';
  const seen = new Set();
  for (const src of sources) {
    const label = typeof src === 'string' ? src : [src.title, src.date].filter(Boolean).join(', ');
    // Several facts often cite the same document; show each source once.
    if (seen.has(label)) continue;
    seen.add(label);
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
    li.className = 'a blocked with-avatar';
    textOf(li).textContent = reply.answer || "The line crackles. That hasn't happened yet.";
  } else {
    li.className = `${reply.live === false ? 'a scripted' : 'a'} with-avatar`;
    textOf(li).textContent = reply.answer;
    addSources(msgOf(li), reply.sources || []);
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
  const pending = addLine('a', '…', `${r.name}, ${s.label}`, { role: r.id, date: s.date });
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
      showAnswer(addLine('a', '', who, { role: it.role, date: it.date }), it);
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
  const a = addLine('a', '…', `${r.name}, ${s.label}`, { role: r.id, date: s.date });
  const reply = await callByVoice(blob, { role: r.id, date: s.date, pack: s.pack });
  if (reply.error) {
    q.remove();
    a.className = 'a blocked with-avatar';
    textOf(a).textContent = reply.error;
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
