// Slide-rule tuning dial, like an old radio: a lit glass window with a red
// needle that moves left to right through time. Days of the same year are
// grouped under that year. Move it by dragging the needle, clicking a date,
// turning the knob, the arrow buttons, the scroll wheel or the arrow keys.
import { sfx } from './audio.js';

const GROUP_STEP = 9;   // spacing between days in the same year (percent of the window)
const ERA_GAP = 18;     // spacing between years
const EDGE = 9;         // margin at each end of the window

// Lay the stations out as a timeline: close together within a year, wider between years.
function layout(stations) {
  const raw = [];
  stations.forEach((s, i) => {
    if (i === 0) raw.push(0);
    else raw.push(raw[i - 1] + (s.era === stations[i - 1].era ? GROUP_STEP : ERA_GAP));
  });
  const span = raw[raw.length - 1] || 1;
  return raw.map((x) => EDGE + (x / span) * (100 - 2 * EDGE));
}

export function createDial(root, { stations, onChange }) {
  const pos = layout(stations);
  let index = 0;
  let needle = pos[0];          // where the needle is drawn (percent)

  // Years with several days get one label under a bracket; single-day years are labelled once.
  const eras = [];
  stations.forEach((s, i) => {
    const last = eras[eras.length - 1];
    if (last && last.era === s.era) last.to = i;
    else eras.push({ era: s.era, from: i, to: i });
  });

  const single = (era) => eras.find((e) => e.era === era).from === eras.find((e) => e.era === era).to;
  root.innerHTML = `
    <div class="tuner" tabindex="0" role="slider" aria-label="Station dial: drag or use the arrow keys">
      <div class="tuner-glass">
        <div class="tuner-scale">
          ${stations.map((s, i) => `
            <button type="button" class="tuner-stop" data-i="${i}" style="left:${pos[i]}%">
              <span class="tuner-tick"></span>
              <span class="tuner-day${single(s.era) ? ' tuner-yearstop' : ''}">${single(s.era) ? s.era : s.label.replace(/^[A-Za-z]+ /, '')}</span>
            </button>`).join('')}
          ${eras.filter((e) => e.to > e.from).map((e) => `
            <div class="tuner-era" style="left:${pos[e.from]}%;width:${pos[e.to] - pos[e.from]}%">
              <span class="tuner-bracket"></span>
              <span class="tuner-year">${stations[e.from].day.split(', ')[1].split(' ')[0]} ${e.era}</span>
            </div>`).join('')}
        </div>
        <div class="tuner-needle"></div>
        <div class="tuner-shine"></div>
      </div>
    </div>
    <div class="tuner-controls">
      <button type="button" class="tuner-arrow" data-dir="-1" aria-label="Earlier">◀</button>
      <div class="tuner-knob" aria-hidden="true"><div class="tuner-knob-face"></div></div>
      <button type="button" class="tuner-arrow" data-dir="1" aria-label="Later">▶</button>
    </div>
    <p class="tuner-hint">Drag the needle or click a date</p>`;

  const tuner = root.querySelector('.tuner');
  const glass = root.querySelector('.tuner-glass');
  const needleEl = root.querySelector('.tuner-needle');
  const knobFace = root.querySelector('.tuner-knob-face');
  const stops = [...root.querySelectorAll('.tuner-stop')];

  function render(animate) {
    needleEl.style.transition = animate ? 'left .25s cubic-bezier(.3, 1.4, .5, 1)' : 'none';
    needleEl.style.left = `${needle}%`;
    knobFace.style.transition = animate ? 'transform .25s ease-out' : 'none';
    knobFace.style.transform = `rotate(${needle * 5.4}deg)`;
    stops.forEach((b, i) => b.classList.toggle('on', i === index));
    tuner.setAttribute('aria-valuetext', stations[index].day);
  }

  function nearest(p) {
    let best = 0;
    pos.forEach((x, i) => { if (Math.abs(x - p) < Math.abs(pos[best] - p)) best = i; });
    return best;
  }

  function select(i) {
    if (i === index) return;
    index = i;
    sfx.tick();
    onChange(index);
  }

  function setIndex(i) {
    const clamped = Math.min(stations.length - 1, Math.max(0, i));
    select(clamped);
    needle = pos[clamped];
    render(true);
  }

  // Drag the needle anywhere along the glass (or turn the knob by dragging sideways).
  let dragging = null;
  const percentAt = (e) => {
    const r = glass.getBoundingClientRect();
    return Math.min(100 - EDGE / 2, Math.max(EDGE / 2, ((e.clientX - r.left) / r.width) * 100));
  };
  glass.addEventListener('pointerdown', (e) => {
    sfx.unlock();
    dragging = { from: 'glass' };
    glass.setPointerCapture(e.pointerId);
    needle = percentAt(e);
    select(nearest(needle));
    render(false);
  });
  const knob = root.querySelector('.tuner-knob');
  knob.addEventListener('pointerdown', (e) => {
    sfx.unlock();
    dragging = { from: 'knob', x: e.clientX, start: needle };
    knob.setPointerCapture(e.pointerId);
  });
  const move = (e) => {
    if (!dragging) return;
    needle = dragging.from === 'glass'
      ? percentAt(e)
      : Math.min(100 - EDGE / 2, Math.max(EDGE / 2, dragging.start + (e.clientX - dragging.x) * 0.5));
    select(nearest(needle));
    render(false);
  };
  const end = () => {
    if (!dragging) return;
    dragging = null;
    needle = pos[index];   // settle onto the station
    render(true);
  };
  for (const el of [glass, knob]) {
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // Click a date, or the arrows.
  stops.forEach((b, i) => b.addEventListener('click', (e) => { e.stopPropagation(); setIndex(i); }));
  stops.forEach((b) => b.addEventListener('pointerdown', (e) => e.stopPropagation()));
  root.querySelectorAll('.tuner-arrow').forEach((b) => b.addEventListener('click', () => {
    sfx.unlock();
    setIndex(index + Number(b.dataset.dir));
  }));

  // Scroll wheel: one station per notch.
  let wheelAt = 0;
  root.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (performance.now() - wheelAt < 180) return;
    wheelAt = performance.now();
    sfx.unlock();
    setIndex(index + (e.deltaY + e.deltaX > 0 ? 1 : -1));
  }, { passive: false });

  // Arrow keys when the dial has focus.
  tuner.addEventListener('keydown', (e) => {
    const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    sfx.unlock();
    setIndex(index + dir);
  });

  render(false);
  return { setIndex, get index() { return index; } };
}
