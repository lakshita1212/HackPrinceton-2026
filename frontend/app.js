import { STATIONS, ROLES } from './stations.js';
import { ROOMS, ROOM_IMAGES } from './rooms.js';
import { mediaFor } from './media.js';
import { createDial } from './dial.js';
import { ask } from './host.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const state = { station: 0, role: 0 };
const radioAudio = new Audio();
let drawn = '';          // role + era of the room currently drawn
let captionTimer = 0;

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
  $('question').placeholder = `Ask the ${r.name.toLowerCase()} a question…`;
  $('screen').className = `screen static era-${era}`;
  // A painted broadcast stays visible: no static, no text, until a clip plays.
  if (ROOM_IMAGES[r.id]?.[era]?.painted) $('screen').classList.replace('static', 'painted');
  stopMedia();

  const stage = $('stage');
  stage.className = `stage era-${era}${ROOM_IMAGES[r.id]?.[era] ? ' has-photo' : ''}`;
  void stage.offsetWidth; // restart the tuning flicker
  stage.classList.add('tuning');
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
const dial = createDial($('dial'), {
  stations: STATIONS,
  onChange: (i) => { state.station = i; sfx.staticBurst(); renderScene(); },
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

$('askForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  sfx.unlock();
  const input = $('question');
  const question = input.value.trim();
  if (!question) return;
  const s = station();
  const r = role();
  const who = `${r.name}, ${s.label}`;

  input.value = '';
  addLine('q', question);
  const button = e.submitter || $('askForm').querySelector('button');
  button.disabled = true;
  const pending = addLine('a', '…', who);

  const reply = await ask({ question, role: r.id, date: s.date, pack: s.pack });
  button.disabled = false;
  if (reply.blocked) {
    // The host sends an in-character refusal; fall back to our own line if it's empty.
    pending.className = 'a blocked';
    pending.textContent = reply.answer || "The line crackles. That hasn't happened yet.";
  } else {
    pending.className = reply.live ? 'a' : 'a scripted';
    pending.textContent = reply.answer;
    addSources(pending, reply.sources);
  }
});

renderScene();
