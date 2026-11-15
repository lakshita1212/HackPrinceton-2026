import { STATIONS, ROLES } from './stations.js';
import { ROOMS, ROOM_IMAGES } from './rooms.js';
import { clipsFor, channelName, checkLocal } from './media.js';
import { createDial } from './dial.js';
import { ask, tuneStation, fetchTranscript, callByVoice, fetchMemories, hostAsset, buildStation } from './host.js';
import { sfx } from './audio.js';
import { createFx } from './fx.js';
import { playIntro } from './intro.js';
import { liveStation, headlines } from './news.js';
import { PAPERS } from './papers.js';
import { cultureFor } from './culture.js';
import { ambience } from './ambience.js';
import * as polish from './polish.js';
import { updateTimeLock, signalLost, renderPins, eraLine, onAirMs, archivalBubble, initTextCard, playBulletin, stopBulletin, callScreen, initCallScreen, stopArchival } from './extras.js';

initTextCard();
initCallScreen();

const $ = (id) => document.getElementById(id);
const state = { station: 0, role: 0 };
let drawn = '';          // role + era of the room currently drawn
let captionTimer = 0;
let tuneTimer = 0;

const fx = createFx($('stage'), $('roomLayer'));
let anyDay = null;  // a station built for any date (the picker under the dial); null = the dial
const station = () => anyDay || STATIONS[state.station];
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
  $('props').replaceChildren();
  for (const prop of pic?.props || []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'prop-hit';
    b.setAttribute('aria-label', prop.label);
    b.dataset.label = prop.label;
    b.addEventListener('click', () => openPaper(prop));
    place(b, prop);
    $('props').append(b);
  }
  polish.setRoom(pic);
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
  ambience.setRoom(r.id, era);

  const stage = $('stage');
  stage.className = `stage era-${era}${ROOM_IMAGES[r.id]?.[era] ? ' has-photo' : ''}`;
  void stage.offsetWidth; // restart the tuning flicker
  stage.classList.add('tuning');

  // Tell the host where the dial is, so texts are answered by this room.
  // Waits until the dial settles instead of sending every tick.
  clearTimeout(tuneTimer);
  tuneTimer = setTimeout(() => {
    tuneStation({ role: r.id, date: s.date, pack: s.pack });
    updateTimeLock(s, r.id, r.name);
  }, 400);
  $('mic').disabled = !s.pack && !s.live;
  showLive(s);
}

// ── 2026: this week's news ─────────────────────────────────────────────────
// The host builds the station from Wikipedia the first time you tune in; the
// ticker shows the same days' headlines and the call panel says where they're from.
async function readyLive(s) {
  if (!s.live || s.pack) return s;
  if (s.anyDay) {
    s.building ||= buildStation(s.date);
    const st = await s.building;
    if (st?.pack) s.pack = st.pack;
    else s.failed = true;
    return s;
  }
  const st = await liveStation();
  if (st) {
    s.pack = st.pack;
    s.date = st.date;
    s.day = `News through ${longDate(st.date)}`;
  }
  return s;
}

const longDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

async function showLive(s) {
  if (!s.live) { clearInterval(tvTimer); showTvFrame(null); }
  $('liveNote').hidden = !s.live;
  if (!s.live) return;
  await readyLive(s);
  if (station() !== s) return; // tuned away meanwhile
  updateTimeLock(s, role().id, role().name);  // its pack exists only now
  if (s.failed) showCaption("Wikipedia has no day-by-day page for that day, so there's no station. Try another date.", 6000);
  $('day').textContent = s.day;
  if (s.pack) tuneStation({ role: role().id, date: s.date, pack: s.pack });
  const items = await headlines(s.date);
  if (station() !== s) return;
  // The painted TVs show a made-up broadcast; this week's stories play on them instead,
  // one at a time, between any photos texted to the station.
  s.headlines = items;
  if (items.length) {
    s.onAir = items[0].text;
    $('screen').classList.remove('painted', 'static');
    $('screen').classList.add('news-card');
    $('screen').classList.toggle('past-news', !!s.anyDay);
  }
  startTvRotation(s);
}

// ── Memories: photos people text to the station (GET /memories.json) ─────
// A new photo goes "on the air" as a card over the room, and the 2026 TV
// rotates it in between the week's stories.
let memories = [];
let tvTimer = 0;
const MEMORIES_ON_TV = 5;

async function pollMemories(first = false) {
  const fresh = await fetchMemories(first ? null : memories[0]?.received_at);
  const known = new Set(memories.map((m) => m.id));
  const added = fresh.filter((m) => !known.has(m.id));
  if (added.length) {
    memories = [...added, ...memories].sort((a, b) => b.received_at.localeCompare(a.received_at));
    if (!first) {
      added.forEach((m, i) => setTimeout(() => announceMemory(m), i * 7500));
      if (station().live) startTvRotation(station());
    }
  }
  setTimeout(pollMemories, 3000);
}

function announceMemory(m) {
  const card = $('onAirCard');
  $('onAirPhoto').src = hostAsset(m.image);
  $('onAirPhoto').alt = m.alt_text || m.caption || 'A photo texted to the station';
  renderPins($('onAirFrame'), m);
  $('onAirCaption').textContent = m.caption || '';
  $('onAirEra').textContent = eraLine(m);
  $('onAirFrom').textContent = `Texted in from ${m.from || 'a listener'}${station().live ? '' : ' · on the 2026 station'}`;
  card.hidden = false;
  card.classList.remove('show');
  void card.offsetWidth;
  card.classList.add('show');
  clearTimeout(announceMemory.timer);
  announceMemory.timer = setTimeout(() => { card.hidden = true; }, onAirMs(m));
}

// 2026 and any-day stations: the TV cycles through the headlines, one story at
// a time, with the photos texted to the 2026 station mixed in.
const shortDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();

function startTvRotation(s) {
  clearInterval(tvTimer);
  const stories = (s.headlines || []).map((h) => ({ story: h }));
  const photos = s.anyDay ? [] : memories.slice(0, MEMORIES_ON_TV).map((m) => ({ photo: m }));
  // Interleave: a story, a photo, a story, …
  const frames = [];
  for (let i = 0; i < Math.max(stories.length, photos.length); i++) {
    if (stories[i]) frames.push(stories[i]);
    if (photos[i]) frames.push(photos[i]);
  }
  if (!s.live || !frames.length) { showTvFrame(null); return; }
  let i = 0;
  showTvFrame(frames[0]);
  if (frames.length < 2) return;
  tvTimer = setInterval(() => {
    if (station() !== s) { clearInterval(tvTimer); showTvFrame(null); return; }
    i = (i + 1) % frames.length;
    showTvFrame(frames[i]);
  }, 6000);
}

function showTvFrame(frame) {
  const screen = $('screen');
  screen.querySelector('.memory-shot')?.remove();
  screen.classList.toggle('memory-on', !!frame?.photo);
  if (frame?.story) $('onAir').textContent = `${shortDay(frame.story.date)} · ${frame.story.text}`;
  if (frame?.story?.image) {
    const st = frame.story;
    screen.classList.add('memory-on');
    const fig = document.createElement('figure');
    fig.className = 'memory-shot story-shot';
    const img = document.createElement('img');
    img.src = st.image;
    img.alt = st.credit || st.text;
    const cap = document.createElement('figcaption');
    cap.textContent = `${shortDay(st.date)} · ${st.text}`;
    const credit = document.createElement('small');
    credit.textContent = [st.source, st.credit].filter(Boolean).join(' · ');
    cap.append(credit);
    fig.append(img, cap);
    screen.append(fig);
    return;
  }
  if (!frame?.photo) return;
  const m = frame.photo;
  const fig = document.createElement('figure');
  fig.className = 'memory-shot';
  const img = document.createElement('img');
  img.src = hostAsset(m.image);
  img.alt = m.alt_text || m.caption || 'A photo texted to the station';
  const cap = document.createElement('figcaption');
  cap.textContent = [m.caption || `From ${m.from}`, eraLine(m)].filter(Boolean).join(' · ');
  fig.append(img, cap);
  screen.append(fig);
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
  ambience.duck(true);
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
  // Live stations (2026, any day) have no footage: the TV runs this week's news,
  // read by an AI anchor and labeled as narration.
  if (kind === 'tv' && s.live && !clips.length) {
    viewer.classList.add('has-clip', 'one-channel');
    $('viewerChannel').textContent = '';
    $('viewerTitle').textContent = 'The news this week';
    $('viewerMeta').textContent = [s.day, ROOMS[r.id].name].filter(Boolean).join(' · ');
    $('viewerStamp').textContent = 'AI narration';
    $('viewerStamp').hidden = false;
    $('viewerVideo').hidden = true;
    $('viewerAudio').hidden = true;
    readyLive(s).then(() => { if (!viewer.hidden) playBulletin(s, viewer.querySelector('.viewer-screen')); });
    return;
  }
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
  if (clip && kind === 'tv') { setGain(video, clip.gain); video.src = clip.src; video.play().catch(() => {}); }
  if (clip && kind === 'radio') { setGain(audio, clip.gain); audio.src = clip.src; audio.play().catch(() => {}); }
}

// Some archive clips are far quieter than the rest (NASA's Moon TV is about
// 20 dB down), so the big screen plays through a per-clip gain and a limiter
// that keeps the loud parts from distorting.
let mediaCtx = null;
const boosters = new Map();
function setGain(el, gain = 1) {
  if (gain === 1 && !boosters.has(el)) return; // no need to reroute it yet
  try {
    mediaCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (mediaCtx.state === 'suspended') mediaCtx.resume();
    if (!boosters.has(el)) {
      const source = mediaCtx.createMediaElementSource(el);
      const boost = mediaCtx.createGain();
      const limiter = mediaCtx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 3;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      source.connect(boost).connect(limiter).connect(mediaCtx.destination);
      boosters.set(el, boost);
    }
    boosters.get(el).gain.value = gain;
  } catch { /* no Web Audio: the clip plays at its own level */ }
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
  stopBulletin();
  for (const el of [$('viewerVideo'), $('viewerAudio')]) {
    el.pause();
    el.removeAttribute('src');
    el.load();
  }
  $('viewer').hidden = true;
  ambience.duck(!$('paperView').hidden);
  resumeAmbient();
  updateTvSound();
}

function stopMedia() {
  if (!$('viewer').hidden) closeViewer();
  if (!$('paperView').hidden) closePaper();
  $('caption').hidden = true;
}

// ── The room's own TV: a random channel plays silently on the set ────────
let ambientClip = null;
function startAmbient() {
  const old = $('screen').querySelector('video');
  // Unload it as well as removing it: a removed <video> keeps downloading,
  // and a few of those use up the browser's connections, so new clips stall at 0:00.
  if (old) { old.pause(); old.removeAttribute('src'); old.load(); old.remove(); }
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
  updateTvSound();
  $('screen').setAttribute('aria-label', `Television, ${ambientClip.title}: open the big screen`);
}
function pauseAmbient() { $('screen').querySelector('video')?.pause(); }
// At home the set is on in the background, so you hear it softly; in the
// offices the room has its own noise instead (ambience.js).
function updateTvSound() {
  const v = $('screen').querySelector('video');
  if (!v) return;
  const audible = role().id === 'citizen' && ambience.enabled && ambience.unlocked && !ambience.ducked;
  v.muted = !audible;
  v.volume = Math.min(1, 0.12 * (ambientClip?.gain || 1));
}
function resumeAmbient() { $('screen').querySelector('video')?.play().catch(() => {}); }

const playTv = () => openViewer('tv');
const playRadio = () => openViewer('radio');
$('viewerClose').addEventListener('click', closeViewer);
$('viewer').addEventListener('click', (e) => { if (e.target === $('viewer')) closeViewer(); });
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('viewer').hidden) closeViewer();
  else if (!$('paperView').hidden) closePaper();
});

// ── Things in the room: the newspaper, wire copy, files, books, toys ─────
// 'paper' props show that role's reading for the day, built from the story
// packs (papers.js), so it follows the same no-spoiler rules as the host.
// 'culture' props show what was popular at home then (culture.js).
const PAPER_STYLE = {
  citizen: { style: 'newspaper', kicker: { 1962: 'The Evening Dispatch', 1969: 'Picture Weekly', 1989: 'The Weekly Review' }, title: "Today's news" },
  journalist: { style: 'wire', kicker: 'Wire service · bulletins', title: 'Off the wire' },
  official: { style: 'files', kicker: 'Eyes only', title: 'Briefing file' },
  historian: { style: 'books', kicker: 'From the history books', title: 'What we know now' },
};
const shortDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

async function openPaper(prop) {
  const s = station();
  const r = role();
  let style;
  let kicker;
  let title;
  let items;
  let foot = '';
  if (prop.kind === 'culture' && !s.anyDay) {
    const card = cultureFor(s.era, s.date);
    style = 'culture';
    kicker = prop.label;
    title = card?.title || 'At home';
    items = card?.items || [];
  } else if (s.live) {
    // 2026: this week's headlines, the same ones the host knows.
    await readyLive(s);
    style = 'feed';
    kicker = `${s.anyDay ? 'That week' : 'This week'} · auto-built from Wikipedia, not reviewed`;
    title = r.id === 'official' ? 'No classified files: only what is public' : s.anyDay ? s.label : 'This week';
    const yr = s.date.slice(0, 4);
    items = (await headlines(s.date)).map((h) => ({ date: h.date, text: h.text, source: h.source || `Wikipedia: ${yr}`, url: h.url || `https://en.wikipedia.org/wiki/${yr}` }));
  } else {
    const look = PAPER_STYLE[r.id];
    style = look.style;
    kicker = typeof look.kicker === 'string' ? look.kicker : look.kicker[s.era] || look.kicker[1962];
    title = look.title;
    items = PAPERS[s.date]?.[r.id] || [];
    if (r.id === 'historian') foot = 'Written long after the fact. Nobody on this day knew any of it.';
  }
  const paper = $('paper');
  paper.dataset.style = style;
  $('paperKicker').textContent = kicker;
  $('paperTitle').textContent = title;
  $('paperDate').textContent = prop.kind === 'culture' ? '' : s.day;
  $('paperFoot').textContent = foot;
  $('paperItems').replaceChildren(...items.map((it) => {
    const li = document.createElement('li');
    const p = document.createElement('p');
    p.textContent = it.text;
    li.append(p);
    if (it.quote) {
      const q = document.createElement('blockquote');
      q.textContent = `"${it.quote}"`;
      li.append(q);
    }
    const src = document.createElement(it.url ? 'a' : 'span');
    src.className = 'paper-source';
    src.textContent = [it.source, style === 'books' && it.date ? shortDate(it.date) : ''].filter(Boolean).join(' · ');
    if (it.url) { src.href = it.url; src.target = '_blank'; src.rel = 'noopener'; }
    li.append(src);
    if (it.listen) {
      const a = document.createElement('a');
      a.className = 'paper-listen';
      a.textContent = 'Listen ▶';
      a.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(it.listen)}`;
      a.target = '_blank';
      a.rel = 'noopener';
      li.append(a);
    }
    return li;
  }));
  if (!items.length) $('paperItems').innerHTML = '<li><p>Nothing here yet.</p></li>';
  $('paperView').hidden = false;
  ambience.duck(true);
  updateTvSound();
  $('paperClose').focus();
}

function closePaper() {
  $('paperView').hidden = true;
  ambience.duck(!$('viewer').hidden);
  updateTvSound();
}
$('paperClose').addEventListener('click', closePaper);
$('paperView').addEventListener('click', (e) => { if (e.target === $('paperView')) closePaper(); });

// ── Room sound: on after the first click (browsers require one), with a switch ──
function showSoundSwitch() {
  $('soundToggle').textContent = ambience.enabled ? 'Sound on' : 'Sound off';
  $('soundToggle').setAttribute('aria-pressed', String(ambience.enabled));
}
showSoundSwitch();
$('soundToggle').addEventListener('click', () => {
  ambience.setEnabled(!ambience.enabled);
  showSoundSwitch();
  updateTvSound();
});
const unlockSound = () => { ambience.unlock(); updateTvSound(); };
window.addEventListener('pointerdown', unlockSound, { once: true });
window.addEventListener('keydown', unlockSound, { once: true });
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
    if (anyDay) { anyDay = null; $('anyDay').value = ''; }
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

// ── Any day: build a station for a date from Wikipedia (POST /stations) ──
// The room is drawn for the nearest decade we have paintings for; the TV,
// ticker and papers show that day's headlines. Turning the dial goes back.
const eraFor = (year) => (year < 1966 ? '1962' : year < 1980 ? '1969' : year < 2008 ? '1989' : '2026');
{
  const input = $('anyDay');
  const yesterday = new Date(Date.now() - 864e5);
  input.max = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  input.addEventListener('change', () => {
    const date = input.value;
    if (!date) return;
    const d = new Date(`${date}T12:00:00`);
    anyDay = {
      date,
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      day: `${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · from Wikipedia`,
      era: eraFor(d.getFullYear()),
      pack: null,
      live: true,
      anyDay: true,
      onAir: 'Tuning in…',
    };
    showCaption(`Tuning to ${anyDay.label}: building the station from Wikipedia…`, 3000);
    renderScene();
  });
}

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
    if (reply.blocked_reason === 'future') signalLost();
  } else {
    li.className = `${reply.live === false ? 'a scripted' : 'a'} with-avatar`;
    textOf(li).textContent = reply.answer;
    addSources(msgOf(li), reply.sources || []);
    // The real recording behind the answer, if there is one; voice calls play it next.
    li.playArchival = archivalBubble(msgOf(li), reply.archival, {
      onStart: () => { ambience.duck(true); updateTvSound(); },
      onEnd: () => { ambience.duck(false); updateTvSound(); if (callScreen.isOpen()) callScreen.ready(); },
    });
  }
  li.scrollIntoView({ block: 'end' });  // sources and the recording make the line taller
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
  await readyLive(s);
  const reply = await ask({ question, role: r.id, date: s.date, pack: s.pack });
  button.disabled = false;
  showAnswer(pending, reply);
  pending.playArchival?.();  // the real recording right after a typed answer
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
pollMemories(true);
checkLocal();

// ── Call by voice: hold the mic button (or the space bar) and talk ───────
let recorder = null;
let micStream = null;
let answerAudio = null;

let holdingMic = false;  // is "Hold to talk" (or the space bar) still held down?
let callCancelled = false;  // hung up while recording: don't send it

// 📞 Call: open the phone screen for whoever is on the dial. It asks for the
// microphone now, so Chrome's permission prompt never interrupts a question.
async function openCall() {
  sfx.unlock();
  if ($('mic').disabled) return;
  const s = station();
  callScreen.open({ who: `${role().name} · ${s.day}`, era: s.era });
  try {
    micStream ??= await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    callScreen.status('The microphone is blocked. Allow it in the browser (the lock icon by the address), or type instead.', 'ended');
  }
}

async function startTalking() {
  if (!callScreen.isOpen() || recorder?.state === 'recording' || !micStream) return;
  holdingMic = true;
  callCancelled = false;
  speechSynthesis.cancel();
  answerAudio?.pause();
  stopArchival();
  // Quiet the room while they talk, so the mic hears them and not the TV.
  pauseAmbient();
  ambience.duck(true);
  const chunks = [];
  recorder = new MediaRecorder(micStream);
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => { if (!callCancelled) sendCall(new Blob(chunks, { type: recorder.mimeType })); };
  recorder.start();
  callScreen.listening();
}

function stopTalking() {
  if (!holdingMic) return;
  holdingMic = false;
  if (recorder?.state === 'recording') {
    recorder.stop();
    callScreen.sending();
  }
  ambience.duck(false);
  resumeAmbient();
}

async function sendCall(blob) {
  if (blob.size < 1000) {
    callScreen.ready('That was too short. Hold to talk while you speak.');
    return;
  }
  const s = station();
  const r = role();
  const q = addLine('q', '…');
  const a = addLine('a', '…', `${r.name}, ${s.label}`, { role: r.id, date: s.date });
  await readyLive(s);
  const reply = await callByVoice(blob, { role: r.id, date: s.date, pack: s.pack });
  if (reply.error) {
    q.remove();
    a.className = 'a blocked with-avatar';
    textOf(a).textContent = reply.error;
    callScreen.ready(reply.error);
    return;
  }
  q.textContent = reply.question || '(the line crackled)';
  showAnswer(a, reply);
  if (!callScreen.isOpen()) return;  // hung up while it was answering
  // The call screen: big, readable lines, then the real recording if there is one.
  callScreen.exchange({
    question: reply.question || '(the line crackled)',
    answer: reply.answer,
    sources: reply.sources || [],
    blocked: !!reply.blocked,
    archival: reply.archival,
  });
  callScreen.status('On the line…', 'connected');
  const afterAnswer = () => {
    if (!callScreen.isOpen()) return;
    if (a.playArchival && reply.archival) {
      callScreen.status('📼 Now, the real recording', 'archival');
      a.playArchival();  // its onEnd puts the call back to "hold to talk"
    } else {
      callScreen.ready();
    }
  };
  speakAnswer(reply, afterAnswer);
}

// Hanging up stops the voice and any recording that's playing.
callScreen.onTalkStart = startTalking;
callScreen.onTalkStop = stopTalking;
callScreen.onHangup = () => {
  if (recorder?.state === 'recording') { callCancelled = true; recorder.stop(); }
  holdingMic = false;
  answerAudio?.pause();
  speechSynthesis.cancel();
  stopArchival();
  ambience.duck(false);
  updateTvSound();
};

// Play the host's voice for the role, or let the browser read it out.
// Speak the answer, then (on a call) play the real recording behind it.
function speakAnswer(reply, then) {
  const done = () => { ambience.duck(false); updateTvSound(); if (then) setTimeout(then, 400); };
  if (reply.audio) {
    answerAudio = new Audio(`data:audio/wav;base64,${reply.audio}`);
    ambience.duck(true);
    updateTvSound();
    answerAudio.addEventListener('ended', done, { once: true });
    answerAudio.play();
  } else if (reply.answer) {
    const u = new SpeechSynthesisUtterance(reply.answer);
    u.rate = 0.95;
    ambience.duck(true);
    updateTvSound();
    u.addEventListener('end', done);
    speechSynthesis.speak(u);
  }
}

// 📞 Call opens the phone screen; talking happens there (extras.js).
$('mic').addEventListener('click', openCall);
// The space bar talks while a call is open (handled by the call screen in extras.js).

renderScene();
booted = true;

// Opening scene, once the fonts are in so the radio's dial is lettered properly.
document.fonts.ready.then(() => playIntro($('intro')));
