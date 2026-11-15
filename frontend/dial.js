// Round tuning dial: drag it, scroll over it, or use the arrow keys.
// It snaps to each station with a tick, like a detented radio knob.
import { sfx } from './audio.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const STEP = 30;            // degrees of turn per station
const SWITCH_PAST = 18;     // must turn past this before the station changes
const DETENT_PULL = 0.35;   // how far the knob follows between detents
const WHEEL_PER_STEP = 120; // wheel delta that moves one station

export function createDial(svg, { stations, onChange }) {
  const max = (stations.length - 1) * STEP;
  const arcStart = -max / 2;
  let angle = 0;
  let index = 0;
  let snapTimer = 0;

  svg.setAttribute('viewBox', '0 0 300 300');
  svg.setAttribute('tabindex', '0');
  svg.setAttribute('role', 'slider');
  svg.setAttribute('aria-label', 'Station dial');
  const polar = (deg, r) => {
    const rad = (deg * Math.PI) / 180;
    return [150 + r * Math.sin(rad), 150 - r * Math.cos(rad)];
  };

  // A vintage radio dial: brass bezel, ivory face, red needle, ribbed bakelite knob.
  const minorTicks = [];
  for (let d = arcStart - 12; d <= -arcStart + 12; d += 6) {
    const [x1, y1] = polar(d, 104);
    const [x2, y2] = polar(d, 109);
    minorTicks.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="dial-minor"/>`);
  }
  const [ax1, ay1] = polar(arcStart - 14, 100);
  const [ax2, ay2] = polar(-arcStart + 14, 100);
  const ribs = Array.from({ length: 40 }, (_, i) => {
    const [x1, y1] = polar(i * 9, 56);
    const [x2, y2] = polar(i * 9, 64);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="dial-rib"/>`;
  }).join('');
  svg.innerHTML = `
    <defs>
      <linearGradient id="dial-brass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f3d58a"/><stop offset=".45" stop-color="#b8862f"/>
        <stop offset=".7" stop-color="#e6c06a"/><stop offset="1" stop-color="#7a5418"/></linearGradient>
      <radialGradient id="dial-ivory" cx=".45" cy=".4" r=".7">
        <stop offset="0" stop-color="#fbf1d6"/><stop offset=".8" stop-color="#ead7a8"/><stop offset="1" stop-color="#cdb07a"/></radialGradient>
      <radialGradient id="dial-bakelite" cx=".38" cy=".32" r=".75">
        <stop offset="0" stop-color="#8a4a26"/><stop offset=".55" stop-color="#4a2412"/><stop offset="1" stop-color="#24110a"/></radialGradient>
      <radialGradient id="dial-cap" cx=".4" cy=".35" r=".7">
        <stop offset="0" stop-color="#f7e2a4"/><stop offset="1" stop-color="#9a6d24"/></radialGradient>
    </defs>
    <circle cx="150" cy="154" r="147" fill="#000" opacity=".35"/>
    <circle class="dial-bezel" cx="150" cy="150" r="147" fill="url(#dial-brass)"/>
    <circle class="dial-face" cx="150" cy="150" r="137" fill="url(#dial-ivory)"/>
    <path d="M${ax1} ${ay1} A100 100 0 1 1 ${ax2} ${ay2}" class="dial-band"/>
    ${minorTicks.join('')}
    <g class="dial-labels"></g>
    <text x="150" y="246" class="dial-brand">STAY TUNED</text>
    <text x="150" y="262" class="dial-sub">BROADCAST · 1962–2026</text>
    <g class="dial-knob">
      <line class="dial-pointer" x1="150" y1="150" x2="150" y2="40"/>
      <circle cx="150" cy="153" r="64" fill="#000" opacity=".35"/>
      <circle class="dial-cap" cx="150" cy="150" r="64" fill="url(#dial-bakelite)"/>
      ${ribs}
      <circle cx="150" cy="150" r="20" fill="url(#dial-cap)"/>
      <circle cx="150" cy="96" r="4" fill="#f3d58a"/>
    </g>
    <ellipse cx="112" cy="84" rx="70" ry="34" fill="#fff" opacity=".13" transform="rotate(-28 112 84)" pointer-events="none"/>`;
  const knob = svg.querySelector('.dial-knob');
  const labelsGroup = svg.querySelector('.dial-labels');
  const el = (tag, attrs) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };

  const labels = stations.map((s, i) => {
    const deg = arcStart + i * STEP;
    const [x1, y1] = polar(deg, 102);
    const [x2, y2] = polar(deg, 112);
    const [tx, ty] = polar(deg, 124);
    const text = el('text', { x: tx, y: ty, class: 'dial-label' });
    text.textContent = s.label;
    text.addEventListener('click', () => setIndex(i));
    labelsGroup.append(el('line', { x1, y1, x2, y2, class: 'dial-tick' }), text);
    return text;
  });

  function render(animate) {
    const shown = index * STEP + (angle - index * STEP) * DETENT_PULL;
    knob.style.transition = animate ? 'transform .18s ease-out' : 'none';
    knob.style.transform = `rotate(${arcStart + shown}deg)`;
    labels.forEach((t, i) => t.classList.toggle('on', i === index));
    svg.setAttribute('aria-valuetext', stations[index].label);
  }

  function setAngle(next) {
    angle = Math.min(max, Math.max(0, next));
    const target = Math.round(angle / STEP);
    if (target !== index && Math.abs(angle - index * STEP) > SWITCH_PAST) {
      index = target;
      sfx.tick();
      onChange(index);
    }
    render(false);
    clearTimeout(snapTimer);
    snapTimer = setTimeout(snap, 250);
  }

  function snap() {
    angle = index * STEP;
    render(true);
  }

  function setIndex(i) {
    setAngle(i * STEP);
    snap();
  }

  // Drag around the centre.
  let dragFrom = null;
  const pointerAngle = (e) => {
    const r = svg.getBoundingClientRect();
    return (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI;
  };
  const wrap = (d) => (d > 180 ? d - 360 : d < -180 ? d + 360 : d);
  svg.addEventListener('pointerdown', (e) => {
    sfx.unlock();
    dragFrom = pointerAngle(e);
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => {
    if (dragFrom === null) return;
    const a = pointerAngle(e);
    setAngle(angle + wrap(a - dragFrom));
    dragFrom = a;
  });
  const endDrag = () => { if (dragFrom !== null) { dragFrom = null; snap(); } };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  // Scroll wheel or trackpad.
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    sfx.unlock();
    setAngle(angle + (e.deltaY / WHEEL_PER_STEP) * STEP);
  }, { passive: false });

  // Arrow keys when the dial has focus.
  svg.addEventListener('keydown', (e) => {
    const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    sfx.unlock();
    setIndex(Math.min(stations.length - 1, Math.max(0, index + dir)));
  });

  render(false);
  return { setIndex, get index() { return index; } };
}
