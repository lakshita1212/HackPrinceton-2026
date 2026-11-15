// One illustrated room per role, drawn as flat SVG on a 1600 x 1000 canvas.
// Each room is redrawn for the era on the dial (1962, 1969, 1989, 2026): same room,
// that decade's furniture, TV and radio.
//
//   tv      the screen area (canvas units) where video plays; the same in every era
//   svg(e)  the room drawn for era e
// The radio is the element with data-hit="radio". Anything with data-from="YYYY-MM-DD"
// only shows on 1962 stations from that date on, so rooms change across the crisis.

const pick = (era, options) => options[era] ?? options.default;

// Small deterministic random so books and notes don't jump around between redraws.
function rng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// ── Light and atmosphere ────────────────────────────────────────────────────
// Each room is dimmed, then its lights cut warm pools out of the dark and glow
// on top. The TV always throws a cool glow. Drawn last, over the furniture.
const GRADE = {
  1962: { dark: '#2a1608', amount: 0.32, warm: '#ffcf7a' },
  1969: { dark: '#2a1406', amount: 0.32, warm: '#ffad42' },
  1989: { dark: '#1b1219', amount: 0.4, warm: '#ffc27a' },
  2026: { dark: '#17120d', amount: 0.3, warm: '#ffe2b4' },
};

// lights: [{ x, y, r, ry?, strength?, color? }]; ry makes an ellipse (a pool on the floor).
function atmosphere(id, era, lights, tv) {
  const g = GRADE[era];
  const all = [
    ...lights.map((l) => ({ strength: 0.75, color: g.warm, ...l })),
    { x: tv.x + tv.w / 2, y: tv.y + tv.h / 2, r: Math.max(tv.w, tv.h) * 1.25, strength: 0.32, color: '#9fd0ff', tv: true },
  ];
  const shape = (l, attrs) => (l.ry
    ? `<ellipse cx="${l.x}" cy="${l.y}" rx="${l.r}" ry="${l.ry}" ${attrs}/>`
    : `<circle cx="${l.x}" cy="${l.y}" r="${l.r}" ${attrs}/>`);
  const grads = all.map((l, i) => `<radialGradient id="${id}-l${i}">
      <stop offset="0" stop-color="${l.color}" stop-opacity="${l.strength}"/>
      <stop offset=".4" stop-color="${l.color}" stop-opacity="${l.strength * 0.35}"/>
      <stop offset="1" stop-color="${l.color}" stop-opacity="0"/></radialGradient>`).join('');
  return `<defs>${grads}
      <radialGradient id="${id}-hole"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      <mask id="${id}-mask"><rect width="1600" height="1000" fill="#fff"/>
        ${all.map((l) => shape(l, `fill="url(#${id}-hole)" opacity="${Math.min(1, l.strength + 0.25)}"`)).join('')}</mask>
      <linearGradient id="${id}-ceil" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${g.dark}" stop-opacity=".3"/><stop offset=".3" stop-color="${g.dark}" stop-opacity="0"/></linearGradient>
      <radialGradient id="${id}-vig" cx=".5" cy=".5" r=".75">
        <stop offset=".55" stop-color="${g.dark}" stop-opacity="0"/><stop offset="1" stop-color="${g.dark}" stop-opacity=".65"/></radialGradient>
    </defs>
    <rect width="1600" height="1000" fill="url(#${id}-ceil)"/>
    <rect width="1600" height="1000" fill="${g.dark}" opacity="${g.amount}" mask="url(#${id}-mask)"/>
    <g style="mix-blend-mode:screen">${all.map((l, i) => shape(l, `class="${l.tv ? 'tv-glow' : 'lamp-glow'}" fill="url(#${id}-l${i})"`)).join('')}</g>
    <rect width="1600" height="1000" fill="url(#${id}-vig)"/>`;
}

const shadow = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" opacity=".3"/>`;

function planks(color, seam) {
  // Rows get taller toward the viewer, and seams are staggered like real boards.
  let out = `<rect y="720" width="1600" height="280" fill="${color}"/>`;
  let prev = 722;
  for (let y = 748, row = 0; y < 1000; row++, y += 28 + row * 6) {
    out += `<rect y="${y}" width="1600" height="2" fill="${seam}"/>`;
    for (let x = (row * 230) % 400; x < 1600; x += 400) out += `<rect x="${x}" y="${prev}" width="2" height="${y - prev}" fill="${seam}"/>`;
    prev = y;
  }
  return out;
}

// ── TVs: drawn around the screen rect, all with the same footprint ──────────
// The set spans x-28 .. x+w+28 and y-28 .. y+h+70, so furniture goes under y+h+70.
function tvSet(era, { x, y, w, h }) {
  const left = x - 28;
  const top = y - 28;
  const width = w + 56;
  const height = h + 98;
  const knobY = y + h + 36;
  if (era === '2026') {
    return `<rect x="${x - 10}" y="${y - 10}" width="${w + 20}" height="${h + 20}" rx="6" fill="#111"/>
      <rect x="${x + w / 2 - 8}" y="${y + h + 10}" width="16" height="44" fill="#2a2a2a"/>
      <rect x="${x + w / 2 - 70}" y="${y + h + 52}" width="140" height="18" rx="6" fill="#2a2a2a"/>`;
  }
  if (era === '1989') {
    return `<rect x="${left}" y="${top}" width="${width}" height="${height}" rx="10" fill="#2b2b2e"/>
      <rect x="${x - 12}" y="${y - 12}" width="${w + 24}" height="${h + 24}" rx="10" fill="#151517"/>
      <rect x="${x}" y="${knobY - 10}" width="${w * 0.55}" height="22" rx="3" fill="#1c1c1e"/>
      <rect x="${x + 12}" y="${knobY - 3}" width="${w * 0.4}" height="6" fill="#000"/>
      <rect x="${x + w * 0.62}" y="${knobY - 6}" width="34" height="12" fill="#2f2"/>
      ${[0, 1, 2].map((i) => `<rect x="${x + w - 50 + i * 18}" y="${knobY - 6}" width="12" height="12" rx="2" fill="#777"/>`).join('')}`;
  }
  const wood = era === '1969' ? '#8a5a2b' : '#6b4226';
  const knob = era === '1969' ? '#e07a2f' : '#d9b77a';
  return `<line x1="${x + w / 2 - 20}" y1="${top}" x2="${x + w / 2 - 90}" y2="${top - 100}" stroke="#2a2a2a" stroke-width="5"/>
    <line x1="${x + w / 2 + 20}" y1="${top}" x2="${x + w / 2 + 90}" y2="${top - 100}" stroke="#2a2a2a" stroke-width="5"/>
    <rect x="${left}" y="${top}" width="${width}" height="${height}" rx="${era === '1969' ? 34 : 18}" fill="${wood}"/>
    <rect x="${x - 14}" y="${y - 14}" width="${w + 28}" height="${h + 28}" rx="26" fill="#2a2a2a"/>
    <circle cx="${x + w - 30}" cy="${knobY}" r="15" fill="${knob}"/><circle cx="${x + w - 72}" cy="${knobY}" r="15" fill="${knob}"/>
    ${[0, 1, 2, 3, 4].map((i) => `<rect x="${x + 6}" y="${knobY - 16 + i * 8}" width="${w * 0.45}" height="3" fill="#00000040"/>`).join('')}`;
}

// ── Radios: sit on a surface at `base`, clickable ───────────────────────────
function radioSet(era, x, base, w = 150) {
  const hit = (inner) => `<g class="hit" data-hit="radio">${inner}</g>`;
  if (era === '2026') {
    return hit(`<rect x="${x + 40}" y="${base - 96}" width="62" height="96" rx="26" fill="#5c6066"/>
      <rect x="${x + 40}" y="${base - 96}" width="62" height="16" rx="8" fill="#3f4246"/>
      <ellipse cx="${x + 71}" cy="${base - 90}" rx="22" ry="4" fill="#5fc3ff"/>`);
  }
  if (era === '1989') {
    return hit(`<path d="M${x + 30} ${base - 82} Q${x + w / 2} ${base - 112} ${x + w - 30} ${base - 82}" fill="none" stroke="#222" stroke-width="8"/>
      <rect x="${x - 10}" y="${base - 84}" width="${w + 20}" height="84" rx="10" fill="#2b2b2e"/>
      <circle cx="${x + 26}" cy="${base - 40}" r="28" fill="#111"/><circle cx="${x + 26}" cy="${base - 40}" r="10" fill="#444"/>
      <circle cx="${x + w - 26}" cy="${base - 40}" r="28" fill="#111"/><circle cx="${x + w - 26}" cy="${base - 40}" r="10" fill="#444"/>
      <rect x="${x + w / 2 - 26}" y="${base - 66}" width="52" height="34" rx="3" fill="#9aa0a6"/>
      <rect x="${x + w / 2 - 18}" y="${base - 58}" width="36" height="16" fill="#222"/>
      <rect x="${x + w / 2 - 26}" y="${base - 24}" width="52" height="8" fill="#e04a6a"/>`);
  }
  if (era === '1969') {
    return hit(`<line x1="${x + w - 30}" y1="${base - 70}" x2="${x + w + 20}" y2="${base - 170}" stroke="#bbb" stroke-width="4"/>
      <rect x="${x + 20}" y="${base - 74}" width="${w - 30}" height="74" rx="12" fill="#2f7f7a"/>
      <rect x="${x + 30}" y="${base - 64}" width="${(w - 30) * 0.55}" height="54" rx="6" fill="#e8d6b0"/>
      ${[0, 1, 2, 3, 4].map((i) => `<circle cx="${x + 44 + i * 12}" cy="${base - 37}" r="3.5" fill="#00000044"/>`).join('')}
      <circle cx="${x + w - 30}" cy="${base - 37}" r="13" fill="#e8d6b0"/>`);
  }
  let grille = '';
  for (let gy = base - 68; gy < base - 14; gy += 8) grille += `<rect x="${x + 14}" y="${gy}" width="${w * 0.48}" height="3" fill="#00000033"/>`;
  return hit(`<rect x="${x}" y="${base - 82}" width="${w}" height="82" rx="14" fill="#b5482f"/>
    <rect x="${x + 10}" y="${base - 72}" width="${w * 0.48 + 8}" height="62" rx="6" fill="#e8d6b0"/>${grille}
    <circle cx="${x + w * 0.78}" cy="${base - 41}" r="16" fill="#e8d6b0"/><circle cx="${x + w * 0.78}" cy="${base - 41}" r="6" fill="#3a2a1e"/>`);
}

// ── Desk devices: sit on a surface at `base` ────────────────────────────────
const typewriter = (x, base, color = '#2e2e2e') => `
  <rect x="${x + 50}" y="${base - 136}" width="130" height="78" fill="#f6f2e6"/>
  <rect x="${x + 64}" y="${base - 120}" width="100" height="4" fill="#999"/><rect x="${x + 64}" y="${base - 106}" width="84" height="4" fill="#999"/>
  <rect x="${x}" y="${base - 72}" width="230" height="72" rx="10" fill="${color}"/>
  <rect x="${x + 20}" y="${base - 42}" width="190" height="10" rx="3" fill="#555"/><rect x="${x + 30}" y="${base - 24}" width="170" height="10" rx="3" fill="#555"/>`;

const crtComputer = (x, base) => `
  <rect x="${x + 20}" y="${base - 160}" width="150" height="124" rx="8" fill="#d8d0bc"/>
  <rect x="${x + 34}" y="${base - 148}" width="122" height="88" rx="6" fill="#16301f"/>
  ${[0, 1, 2, 3].map((i) => `<rect x="${x + 44}" y="${base - 136 + i * 16}" width="${60 + (i % 2) * 30}" height="5" fill="#4f4"/>`).join('')}
  <rect x="${x + 60}" y="${base - 36}" width="70" height="14" fill="#c8c0ac"/>
  <rect x="${x}" y="${base - 18}" width="190" height="18" rx="4" fill="#d8d0bc"/>`;

const laptop = (x, base) => `
  <path d="M${x + 14} ${base - 12} L${x + 26} ${base - 110} L${x + 150} ${base - 110} L${x + 162} ${base - 12}Z" fill="#c4c9ce"/>
  <path d="M${x + 24} ${base - 20} L${x + 33} ${base - 100} L${x + 143} ${base - 100} L${x + 152} ${base - 20}Z" fill="#2a3a4a"/>
  <rect x="${x}" y="${base - 12}" width="176" height="12" rx="4" fill="#9aa0a6"/>`;

const phone = (era, x, base) => pick(era, {
  2026: `<rect x="${x + 20}" y="${base - 6}" width="44" height="6" rx="2" fill="#222"/>`,
  1989: `<rect x="${x}" y="${base - 30}" width="96" height="30" rx="6" fill="#d8d0bc"/>
    <rect x="${x + 6}" y="${base - 44}" width="84" height="16" rx="8" fill="#c8c0ac"/>
    ${[0, 1, 2].map((i) => `<rect x="${x + 30 + i * 14}" y="${base - 22}" width="10" height="8" fill="#888"/>`).join('')}`,
  default: `<rect x="${x}" y="${base - 26}" width="100" height="26" rx="10" fill="#151515"/>
    <rect x="${x - 10}" y="${base - 46}" width="120" height="20" rx="10" fill="#151515"/>
    <circle cx="${x + 50}" cy="${base - 13}" r="9" fill="#555"/>`,
});

function paperStack(x, yBottom, sheets, from) {
  let out = `<g data-from="${from}">`;
  for (let i = 0; i < sheets; i++) {
    out += `<rect x="${x + (i % 2) * 4}" y="${yBottom - (i + 1) * 9}" width="90" height="9" fill="${i % 2 ? '#f6f2e6' : '#e9e3d2'}" stroke="#cfc6b0"/>`;
  }
  return `${out}</g>`;
}

function books(x0, y0, width, rows, rowH, seed) {
  const rand = rng(seed);
  const colors = ['#8c3b2f', '#3f6b6b', '#c9a24a', '#5a4a7a', '#2f4f3a', '#b5482f', '#d8c3a0'];
  let out = '';
  for (let r = 0; r < rows; r++) {
    const base = y0 + (r + 1) * rowH;
    for (let x = x0; x < x0 + width - 20;) {
      const w = 14 + Math.floor(rand() * 18);
      const h = rowH * (0.6 + rand() * 0.3);
      out += `<rect x="${x}" y="${base - h}" width="${w}" height="${h}" fill="${colors[Math.floor(rand() * colors.length)]}"/>`;
      x += w + 2;
    }
    out += `<rect x="${x0 - 10}" y="${base}" width="${width + 20}" height="12" fill="#4a3324"/>`;
  }
  return out;
}

function pinnedNotes(x0, y0, w, h, count, seed) {
  const rand = rng(seed);
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = x0 + 14 + rand() * (w - 90);
    const y = y0 + 14 + rand() * (h - 80);
    const fill = rand() > 0.5 ? '#f6f2e6' : '#f2e2a0';
    out += `<g transform="rotate(${(rand() - 0.5) * 10} ${x + 30} ${y + 30})"><rect x="${x}" y="${y}" width="64" height="56" fill="${fill}"/>
      <rect x="${x + 8}" y="${y + 14}" width="44" height="3" fill="#999"/><rect x="${x + 8}" y="${y + 24}" width="38" height="3" fill="#999"/>
      <circle cx="${x + 32}" cy="${y + 6}" r="5" fill="#c0392b"/></g>`;
  }
  return out;
}

function flag(x, y, w, h) {
  const stripe = h / 13;
  let out = '';
  for (let i = 0; i < 13; i++) out += `<rect x="${x}" y="${y + i * stripe}" width="${w}" height="${stripe + 0.5}" fill="${i % 2 ? '#f4f0e4' : '#b23a3a'}"/>`;
  return `${out}<rect x="${x}" y="${y}" width="${w * 0.43}" height="${stripe * 7}" fill="#2b3a6b"/>`;
}

function room(wall, floor, trim) {
  return `<rect width="1600" height="730" fill="${wall}"/>
    <rect y="720" width="1600" height="280" fill="${floor}"/>
    <rect y="708" width="1600" height="16" fill="${trim}"/>`;
}

// ── Citizen: the family living room ─────────────────────────────────────────
const CITIZEN_TV = { x: 1060, y: 420, w: 280, h: 200 };
const citizen = {
  name: 'Living room',
  tv: CITIZEN_TV,
  svg: (era) => {
    const c = pick(era, {
      1962: { wall: '#9cc2a6', stripe: '#84ab8f', floor: '#8a5630', rug: null, sofa: 'url(#cz-plaid)', sofa2: 'url(#cz-plaid)', curtain: '#b5532f' },
      1969: { wall: '#d8b25a', stripe: '#c09a44', floor: '#6f6a2c', rug: '#c85a1e', sofa: '#c85a1e', sofa2: '#de7030', curtain: '#8a3a1e' },
      1989: { wall: '#d9c3cf', stripe: '#cdb2c1', floor: '#8a8a94', rug: '#3a8a8a', sofa: '#9a5a7a', sofa2: '#b06e90', curtain: '#3a6a8a' },
      2026: { wall: '#e9e9e4', stripe: '#e9e9e4', floor: '#c7a77d', rug: '#9aa0a6', sofa: '#6c7178', sofa2: '#7d838a', curtain: '#cfd3d6' },
    });
    const midCentury = era === '1962' || era === '1969';
    const butterfly = (x, y, s, fill) => `<path d="M${x} ${y} l${-s} ${-s * 0.8} l${s * 0.15} ${s * 1.5}Z M${x} ${y} l${s} ${-s * 0.8} l${-s * 0.15} ${s * 1.5}Z" fill="${fill}"/>`;
    const picture = pick(era, {
      1962: `<rect x="676" y="132" width="128" height="8" rx="3" fill="#5a3a24"/><rect x="682" y="138" width="116" height="300" fill="#f4ecd8"/>
        <rect x="676" y="436" width="128" height="8" rx="3" fill="#5a3a24"/>
        ${butterfly(720, 180, 16, '#d9822b')}${butterfly(765, 190, 12, '#c4562a')}${butterfly(740, 250, 26, '#d9822b')}
        ${butterfly(712, 320, 13, '#e0a03a')}${butterfly(770, 330, 15, '#c4562a')}${butterfly(742, 395, 18, '#d9822b')}`,
      1969: `<rect x="640" y="170" width="190" height="140" fill="#5a3a24"/><rect x="656" y="186" width="158" height="108" fill="#0d0d14"/>
        <path d="M656 294 Q735 240 814 294Z" fill="#9a9a9a"/><circle cx="780" cy="214" r="12" fill="#4a7ab5"/>`,
      1989: `<rect x="640" y="170" width="190" height="140" fill="#5a3a24"/><rect x="656" y="186" width="158" height="108" fill="#f4f0e4"/>
        <circle cx="700" cy="230" r="24" fill="#e04a6a"/><path d="M730 280 l40 -60 l30 60Z" fill="#3a8a8a"/><rect x="760" y="200" width="40" height="12" fill="#f2c94c"/>`,
      2026: `<rect x="640" y="170" width="190" height="140" fill="#5a3a24"/><rect x="656" y="186" width="158" height="108" fill="#d6dde3"/>
        <circle cx="706" cy="236" r="18" fill="#9aa0a6"/><circle cx="760" cy="230" r="22" fill="#b0b6bc"/><rect x="690" y="256" width="96" height="38" rx="14" fill="#9aa0a6"/>`,
    });
    // 1962: a built-in rust cabinet with woven cane doors, the TV in the middle bay.
    const builtIn = `
      <rect x="1000" y="110" width="400" height="660" fill="#b4532c"/>
      <rect x="1018" y="128" width="176" height="230" fill="url(#cz-cane)"/><rect x="1206" y="128" width="176" height="230" fill="url(#cz-cane)"/>
      <rect x="1018" y="366" width="364" height="34" fill="#7a3518"/>
      <rect x="1150" y="384" width="100" height="16" fill="#d9a23a"/>
      <ellipse cx="1170" cy="380" rx="24" ry="10" fill="#4f7a3a"/><ellipse cx="1200" cy="374" rx="28" ry="12" fill="#5f8a44"/><ellipse cx="1232" cy="380" rx="22" ry="9" fill="#4f7a3a"/>
      <rect x="1018" y="404" width="364" height="242" fill="#7a3518"/>
      <rect x="1044" y="404" width="312" height="234" rx="18" fill="#3a3632"/>
      <rect x="1018" y="654" width="176" height="106" fill="url(#cz-cane)"/><rect x="1206" y="654" width="176" height="106" fill="url(#cz-cane)"/>
      <path d="M1000 404 L940 388 L940 662 L1000 646Z" fill="url(#cz-cane)" stroke="#b4532c" stroke-width="8"/>
      <path d="M1400 404 L1460 388 L1460 662 L1400 646Z" fill="url(#cz-cane)" stroke="#b4532c" stroke-width="8"/>
      <circle cx="1186" cy="244" r="5" fill="#e6c27a"/><circle cx="1214" cy="244" r="5" fill="#e6c27a"/>`;
    const tvStand = pick(era, {
      1962: builtIn,
      1989: `<rect x="1010" y="690" width="380" height="70" fill="#3a3a40"/>${tvSet(era, CITIZEN_TV)}`,
      2026: `<rect x="990" y="690" width="420" height="56" rx="6" fill="#d8d2c6"/><rect x="1000" y="746" width="10" height="16" fill="#555"/><rect x="1390" y="746" width="10" height="16" fill="#555"/>${tvSet(era, CITIZEN_TV)}`,
      default: `<rect x="1044" y="690" width="14" height="60" fill="#3a2a1e"/><rect x="1342" y="690" width="14" height="60" fill="#3a2a1e"/>${tvSet(era, CITIZEN_TV)}`,
    });
    const pendants = midCentury ? `
      <line x1="880" y1="60" x2="880" y2="262" stroke="#6a4a2a" stroke-width="3"/>
      <path d="M866 262 L894 262 L906 318 L854 318Z" fill="#c8743a"/><ellipse cx="880" cy="318" rx="26" ry="6" fill="#fff0bf"/>
      <line x1="950" y1="60" x2="950" y2="206" stroke="#6a4a2a" stroke-width="3"/>
      <path d="M936 206 L964 206 L976 262 L924 262Z" fill="#c8743a"/><ellipse cx="950" cy="262" rx="26" ry="6" fill="#fff0bf"/>` : '';
    let walls = `<rect width="1600" height="730" fill="${c.wall}"/>`;
    if (midCentury) for (let x = 36; x < 1600; x += 72) walls += `<rect x="${x}" y="0" width="3" height="720" fill="${c.stripe}"/>`;
    else if (era === '1989') walls = `<rect width="1600" height="730" fill="url(#cz-paper-${era})"/>`;
    const floor = pick(era, {
      1962: `<rect y="720" width="1600" height="280" fill="${c.floor}"/><rect y="720" width="1600" height="280" fill="url(#cz-shag)"/>
        <path d="M1180 1000 L1320 800 L1600 800 L1600 1000Z" fill="url(#cz-check)"/>`,
      1969: `<rect y="720" width="1600" height="280" fill="${c.floor}"/><rect y="720" width="1600" height="280" fill="url(#cz-shag)"/>`,
      1989: `<rect y="720" width="1600" height="280" fill="${c.floor}"/>`,
      2026: planks(c.floor, '#00000030'),
    });
    const extras = pick(era, {
      1962: `
        <g data-from="1962-10-24" transform="rotate(-8 460 630)">
          <rect x="420" y="604" width="84" height="58" fill="#f4f0e4"/><rect x="430" y="614" width="64" height="8" fill="#b23a3a"/>
          <rect x="430" y="630" width="54" height="4" fill="#999"/><rect x="430" y="640" width="60" height="4" fill="#999"/></g>
        <g data-from="1962-10-22">
          <rect x="1486" y="680" width="44" height="60" rx="4" fill="#c9a24a"/><rect x="1536" y="680" width="44" height="60" rx="4" fill="#b5482f"/>
          <rect x="1510" y="620" width="44" height="60" rx="4" fill="#3f6b6b"/>
          <rect x="1486" y="700" width="44" height="14" fill="#f4f0e4"/><rect x="1536" y="700" width="44" height="14" fill="#f4f0e4"/></g>
        <g data-from="1962-10-27"><rect x="1512" y="570" width="40" height="50" rx="4" fill="#d9b77a"/><rect x="1556" y="630" width="36" height="50" rx="4" fill="#8c3b2f"/></g>`,
      1969: `<rect x="1460" y="560" width="30" height="40" rx="6" fill="#444"/><path d="M1462 560 Q1475 470 1488 560Z" fill="#e0402f"/>
        <rect x="1440" y="600" width="70" height="120" fill="#6b4a2a"/>`,
      1989: `<rect x="1440" y="640" width="120" height="80" fill="#3a3a40"/><rect x="1470" y="610" width="60" height="30" rx="4" fill="#d8d0bc"/>`,
      2026: `<rect x="1460" y="640" width="70" height="80" rx="8" fill="#b8b0a2"/><path d="M1495 640 C1440 560 1470 520 1495 470 C1520 520 1550 560 1495 640Z" fill="#4f7a4a"/>
        ${laptop(380, 620)}`,
    });
    return `
      <defs>
        <pattern id="cz-paper-${era}" width="48" height="48" patternUnits="userSpaceOnUse">
          <rect width="48" height="48" fill="${c.wall}"/><rect width="18" height="48" fill="${c.stripe}"/></pattern>
        <pattern id="cz-cane" width="14" height="14" patternUnits="userSpaceOnUse">
          <rect width="14" height="14" fill="#e2b25a"/><path d="M0 0 L14 14 M14 0 L0 14" stroke="#b7843a" stroke-width="1.6"/></pattern>
        <pattern id="cz-plaid" width="60" height="60" patternUnits="userSpaceOnUse">
          <rect width="60" height="60" fill="#e3a83c"/><rect width="60" height="12" y="20" fill="#c46a2a" opacity=".55"/>
          <rect width="12" height="60" x="20" fill="#c46a2a" opacity=".55"/><rect width="60" height="3" y="44" fill="#8a3a1e" opacity=".5"/>
          <rect width="3" height="60" x="44" fill="#8a3a1e" opacity=".5"/></pattern>
        <pattern id="cz-shag" width="9" height="9" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="3" r="1.4" fill="#00000026"/><circle cx="6.5" cy="7" r="1.2" fill="#ffffff14"/></pattern>
        <pattern id="cz-check" width="80" height="80" patternUnits="userSpaceOnUse" patternTransform="skewX(-35) scale(1 .55)">
          <rect width="80" height="80" fill="#efe1c4"/><rect width="40" height="40" fill="#b4532c"/><rect x="40" y="40" width="40" height="40" fill="#b4532c"/></pattern>
        <linearGradient id="cz-dusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#3a3f6a"/><stop offset=".6" stop-color="#b8664a"/><stop offset="1" stop-color="#f0a85a"/></linearGradient>
      </defs>
      ${walls}
      ${floor}
      <polygon points="0,0 1600,0 1600,50 0,84" fill="#efe6d2"/><polygon points="0,84 1600,50 1600,58 0,92" fill="#00000026"/>
      <rect y="708" width="1600" height="16" fill="${midCentury ? '#7a3518' : '#00000040'}"/>
      ${c.rug ? `<ellipse cx="760" cy="870" rx="560" ry="95" fill="${c.rug}"/>
        <ellipse cx="760" cy="870" rx="520" ry="82" fill="none" stroke="#00000022" stroke-width="10"/>` : ''}
      ${shadow(460, 714, 340, 22)}${shadow(860, 728, 95, 10)}${shadow(1200, 772, 250, 16)}${shadow(100, 724, 70, 12)}

      <rect x="150" y="130" width="300" height="340" fill="${midCentury ? '#b4532c' : '#f1e6d0'}"/><rect x="168" y="148" width="264" height="304" fill="url(#cz-dusk)"/>
      <path d="M380 452 C350 400 360 360 400 330 C410 380 420 410 400 452Z" fill="#2f3a2a" opacity=".7"/>
      <rect x="296" y="148" width="8" height="304" fill="#f1e6d0"/><rect x="168" y="296" width="264" height="8" fill="#f1e6d0"/>
      <rect x="120" y="115" width="90" height="390" fill="${c.curtain}"/><rect x="390" y="115" width="90" height="390" fill="${c.curtain}"/>
      <rect x="105" y="100" width="390" height="22" rx="8" fill="#5a3a24"/>

      ${picture}
      ${pendants}

      <rect x="96" y="330" width="8" height="390" fill="#3a2a1e"/><ellipse cx="100" cy="722" rx="46" ry="10" fill="#3a2a1e"/>
      <path d="M50 330 L150 330 L130 250 L70 250Z" fill="#ffe7a8"/>
      <path d="M50 330 L150 330 L146 316 L54 316Z" fill="#f2c96a"/>

      <rect x="190" y="540" width="540" height="110" rx="26" fill="${c.sofa}"/>
      <rect x="170" y="610" width="580" height="90" rx="20" fill="${c.sofa2}"/>
      <rect x="150" y="580" width="70" height="130" rx="24" fill="${c.sofa}"/><rect x="700" y="580" width="70" height="130" rx="24" fill="${c.sofa}"/>

      <rect x="780" y="610" width="150" height="16" fill="${midCentury ? '#b4532c' : '#5a3a24'}"/>
      <rect x="792" y="626" width="12" height="100" fill="#5a3a24"/><rect x="906" y="626" width="12" height="100" fill="#5a3a24"/>
      ${radioSet(era, 786, 610, 138)}

      ${tvStand}
      ${extras}
      ${atmosphere(`cz-${era}`, era, [
        { x: 100, y: 295, r: 430, strength: 0.85 },
        { x: 170, y: 770, r: 340, ry: 80, strength: 0.45 },
        { x: 300, y: 380, r: 220, strength: 0.22, color: '#ffb07a' },
        ...(midCentury ? [{ x: 880, y: 330, r: 240, strength: 0.6 }, { x: 950, y: 275, r: 240, strength: 0.6 }] : []),
      ], CITIZEN_TV)}`;
  },
};

// ── Journalist: the newsroom ────────────────────────────────────────────────
const JOURNALIST_TV = { x: 1340, y: 330, w: 200, h: 150 };
const journalist = {
  name: 'Newsroom',
  tv: JOURNALIST_TV,
  svg: (era) => {
    const c = pick(era, {
      1962: { wall: '#a9a688', floor: '#4f4537' },
      1969: { wall: '#cdb388', floor: '#5e4a33' },
      1989: { wall: '#a39ca4', floor: '#4e4a50' },
      2026: { wall: '#ddd6c9', floor: '#7d7468' },
    });
    // Evening skyline with a few lit office windows.
    const rand = rng(23);
    const towers = [[110, 270, 70], [190, 220, 90], [290, 300, 60], [360, 190, 80], [450, 250, 110]];
    const skyline = towers.map(([x, top, w]) => {
      let lit = '';
      for (let wy = top + 14; wy < 410; wy += 22) {
        for (let wx = x + 8; wx < x + w - 12; wx += 18) if (rand() > 0.62) lit += `<rect x="${wx}" y="${wy}" width="8" height="10" fill="#ffd27a"/>`;
      }
      return `<rect x="${x}" y="${top}" width="${w}" height="${424 - top}" fill="#262a36"/>${lit}`;
    }).join('');
    const deskTool = pick(era, {
      1962: typewriter(330, 600),
      1969: typewriter(330, 600, '#c85a1e'),
      1989: crtComputer(340, 600),
      2026: laptop(360, 600),
    });
    const wire = pick(era, {
      1989: `<rect x="980" y="640" width="210" height="80" fill="#6d5a45"/>
        <rect x="1000" y="580" width="170" height="60" rx="6" fill="#d8d0bc"/><rect x="1030" y="560" width="110" height="24" fill="#f6f2e6"/>`,
      2026: `<rect x="1030" y="600" width="90" height="120" rx="10" fill="#c8ccd0"/><rect x="1045" y="520" width="60" height="80" rx="8" fill="#9fd3e6"/>`,
      default: `<rect x="980" y="470" width="210" height="250" rx="8" fill="#6f7a6a"/>
        <rect x="1000" y="490" width="170" height="60" rx="4" fill="#4e574b"/><rect x="1040" y="440" width="90" height="40" fill="#f6f2e6"/>
        <path d="M1170 560 C1230 600 1180 660 1230 720 L1250 720 C1200 660 1250 600 1190 560Z" fill="#f6f2e6"/>`,
    });
    return `${room(c.wall, c.floor, '#00000033')}
      ${shadow(530, 808, 430, 18)}${shadow(1085, 724, 135, 12)}${shadow(1440, 742, 150, 12)}
      <defs><linearGradient id="nr-dusk-${era}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1d2340"/><stop offset=".75" stop-color="#5a3e52"/><stop offset="1" stop-color="#b8664a"/></linearGradient></defs>
      <rect x="80" y="110" width="520" height="330" fill="#6b5f4b"/><rect x="96" y="126" width="488" height="298" fill="url(#nr-dusk-${era})"/>
      ${skyline}
      <rect x="336" y="126" width="8" height="298" fill="#6b5f4b"/>

      <line x1="740" y1="0" x2="740" y2="62" stroke="#2a2620" stroke-width="4"/>
      <path d="M700 96 L780 96 L762 60 L718 60Z" fill="#3a3f38"/><ellipse cx="740" cy="97" rx="18" ry="6" fill="#fff3c4"/>
      <line x1="1110" y1="0" x2="1110" y2="62" stroke="#2a2620" stroke-width="4"/>
      <path d="M1070 96 L1150 96 L1132 60 L1088 60Z" fill="#3a3f38"/><ellipse cx="1110" cy="97" rx="18" ry="6" fill="#fff3c4"/>

      <circle cx="760" cy="170" r="52" fill="#f6f2e6" stroke="#3e3d38" stroke-width="8"/>
      <line x1="760" y1="170" x2="760" y2="132" stroke="#3e3d38" stroke-width="6"/><line x1="760" y1="170" x2="790" y2="182" stroke="#3e3d38" stroke-width="5"/>

      <rect x="880" y="120" width="380" height="250" fill="#b78b52" stroke="#6d5a45" stroke-width="10"/>
      ${pinnedNotes(880, 120, 380, 250, 7, 11)}

      <rect x="150" y="600" width="760" height="34" fill="#6d5a45"/>
      <rect x="170" y="634" width="180" height="170" fill="#5d4c3a"/><rect x="880" y="634" width="16" height="170" fill="#5d4c3a"/>
      ${deskTool}
      <rect x="590" y="566" width="30" height="34" rx="4" fill="#f6f2e6"/>
      ${radioSet(era, 660, 600, 160)}
      ${phone(era, 230, 600)}
      <ellipse cx="180" cy="598" rx="26" ry="7" fill="#2a2a24"/>
      <path d="M180 596 L166 520 L214 474" fill="none" stroke="#2a2a24" stroke-width="6"/>
      <path d="M192 480 Q222 436 252 480Z" fill="#2f5a3a"/><ellipse cx="222" cy="481" rx="22" ry="5" fill="#fff3c4"/>

      ${wire}
      ${era === '1962' ? paperStack(1220, 760, 3, '1962-10-22') + paperStack(1226, 733, 4, '1962-10-24') + paperStack(1218, 697, 5, '1962-10-27') : ''}

      <rect x="1310" y="578" width="260" height="160" fill="#7d8580"/>
      <rect x="1326" y="608" width="228" height="8" fill="#5f6763"/><rect x="1326" y="668" width="228" height="8" fill="#5f6763"/>
      ${tvSet(era, JOURNALIST_TV)}
      ${atmosphere(`nr-${era}`, era, [
        { x: 740, y: 110, r: 330, strength: 0.6 },
        { x: 1110, y: 110, r: 330, strength: 0.6 },
        { x: 222, y: 500, r: 300, strength: 0.85 },
        { x: 330, y: 600, r: 260, ry: 50, strength: 0.4 },
        { x: 340, y: 270, r: 260, strength: 0.15, color: '#d08a6a' },
      ], JOURNALIST_TV)}`;
  },
};

// ── Official: the Washington office ─────────────────────────────────────────
const OFFICIAL_TV = { x: 1290, y: 380, w: 220, h: 170 };
const official = {
  name: 'Washington office',
  tv: OFFICIAL_TV,
  svg: (era) => {
    const carpet = pick(era, { 1962: '#4a2a22', 1969: '#5a3a24', 1989: '#3e3440', 2026: '#4a4038' });
    const deskTool = pick(era, { 1989: crtComputer(860, 610), 2026: laptop(870, 610), default: '' });
    return `<rect width="1600" height="730" fill="#4e3526"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `<rect x="${i * 160 + 10}" y="20" width="140" height="680" fill="none" stroke="#5e4332" stroke-width="6"/>`).join('')}
      <rect y="720" width="1600" height="280" fill="${carpet}"/><rect y="708" width="1600" height="16" fill="#3a2418"/>
      <rect x="300" y="760" width="1000" height="200" rx="6" fill="none" stroke="#c9a24a33" stroke-width="8"/>
      ${shadow(830, 806, 390, 18)}${shadow(1400, 762, 185, 12)}${shadow(110, 724, 40, 8)}

      <rect x="106" y="140" width="8" height="580" fill="#c9a24a"/><circle cx="110" cy="134" r="12" fill="#c9a24a"/>
      ${flag(114, 150, 200, 130)}

      <rect x="380" y="110" width="560" height="340" fill="#2f2318"/><rect x="396" y="126" width="528" height="308" fill="#a9bfae"/>
      ${[1, 2, 3, 4, 5].map((i) => `<line x1="${396 + i * 88}" y1="126" x2="${396 + i * 88}" y2="434" stroke="#7d8f80" stroke-width="1.5"/><line x1="396" y1="${126 + i * 51}" x2="924" y2="${126 + i * 51}" stroke="#7d8f80" stroke-width="1.5"/>`).join('')}
      <path d="M520 126 L600 126 L612 210 L588 262 L562 236 L540 172Z" fill="#d6c193"/>
      <path d="M560 330 C620 300 700 302 760 318 C810 330 860 350 900 372 L888 384 C840 372 780 362 720 354 C660 348 610 354 572 346Z" fill="#d6c193"/>
      <rect x="396" y="126" width="528" height="308" fill="#8a6a3a" opacity=".18"/>
      <g data-from="1962-10-16" stroke="#b23a3a" stroke-width="5">
        <path d="M640 322 l14 14 m0 -14 l-14 14"/><path d="M700 326 l14 14 m0 -14 l-14 14"/><path d="M770 332 l14 14 m0 -14 l-14 14"/></g>
      <g data-from="1962-10-22" fill="#b23a3a"><circle cx="905" cy="200" r="7"/><circle cx="912" cy="250" r="7"/><circle cx="900" cy="300" r="7"/></g>
      <g data-from="1962-10-24">
        <path d="M700 140 Q 880 230 860 430" fill="none" stroke="#1f2f55" stroke-width="5" stroke-dasharray="14 10"/>
        <g fill="#1f2f55"><circle cx="760" cy="168" r="8"/><circle cx="830" cy="230" r="8"/><circle cx="862" cy="320" r="8"/><circle cx="864" cy="400" r="8"/></g></g>

      <rect x="480" y="610" width="700" height="40" fill="#3a2418"/><rect x="500" y="650" width="660" height="150" fill="#2e1c12"/>
      <rect x="530" y="676" width="280" height="100" fill="none" stroke="#3a2418" stroke-width="6"/>
      <rect x="850" y="676" width="280" height="100" fill="none" stroke="#3a2418" stroke-width="6"/>
      <rect x="566" y="560" width="10" height="50" fill="#c9a24a"/><rect x="540" y="600" width="62" height="10" fill="#c9a24a"/>
      <path d="M520 566 Q571 520 622 566Z" fill="#2f6b4a"/><ellipse cx="571" cy="567" rx="46" ry="6" fill="#fff3c4"/>
      ${radioSet(era, 650, 610, 150)}
      ${deskTool}
      ${era === '1962' ? paperStack(850, 610, 2, '1962-10-16') + paperStack(856, 592, 3, '1962-10-24') + paperStack(848, 565, 3, '1962-10-27') : ''}
      ${phone(era, 1050, 610)}

      <rect x="1240" y="648" width="320" height="110" fill="#3a2418"/>
      <rect x="1256" y="664" width="140" height="80" fill="none" stroke="#2e1c12" stroke-width="5"/>
      <rect x="1404" y="664" width="140" height="80" fill="none" stroke="#2e1c12" stroke-width="5"/>
      ${tvSet(era, OFFICIAL_TV)}
      ${atmosphere(`of-${era}`, era, [
        { x: 571, y: 580, r: 380, strength: 0.9 },
        { x: 640, y: 612, r: 240, ry: 40, strength: 0.5 },
        { x: 660, y: 280, r: 320, strength: 0.25 },
      ], OFFICIAL_TV)}`;
  },
};

// ── Historian: the study and archive ────────────────────────────────────────
const HISTORIAN_TV = { x: 1220, y: 300, w: 260, h: 190 };
const historian = {
  name: 'Archive',
  tv: HISTORIAN_TV,
  svg: (era) => {
    const c = pick(era, {
      1962: { wall: '#cbb894', floor: '#7a5636' },
      1969: { wall: '#d6bb86', floor: '#6e4c2c' },
      1989: { wall: '#c4b8a8', floor: '#836a50' },
      2026: { wall: '#ddd2bd', floor: '#a07a50' },
    });
    const deskTool = pick(era, {
      1962: typewriter(860, 620),
      1969: typewriter(860, 620, '#2f7f7a'),
      1989: crtComputer(870, 620),
      2026: laptop(880, 620),
    });
    return `<rect width="1600" height="730" fill="${c.wall}"/>${planks(c.floor, '#00000030')}<rect y="708" width="1600" height="16" fill="#00000040"/>
      ${shadow(320, 744, 290, 12)}${shadow(910, 812, 270, 14)}${shadow(1350, 764, 205, 12)}${shadow(650, 724, 60, 10)}
      <rect x="60" y="100" width="520" height="640" fill="#6b4a33"/><rect x="76" y="116" width="488" height="608" fill="#4a3324"/>
      ${books(86, 116, 468, 5, 118, 7)}

      <rect x="646" y="330" width="8" height="390" fill="#2a1e14"/><ellipse cx="650" cy="722" rx="36" ry="8" fill="#2a1e14"/>
      <path d="M600 330 L700 330 L680 262 L620 262Z" fill="#ffe7a8"/><path d="M600 330 L700 330 L696 318 L604 318Z" fill="#f2c96a"/>

      <rect x="700" y="620" width="420" height="30" fill="#8a6a4a"/>
      <rect x="716" y="650" width="20" height="150" fill="#7a5a3a"/><rect x="1084" y="650" width="20" height="150" fill="#7a5a3a"/>
      ${radioSet(era, 710, 620, 140)}
      ${deskTool}

      <rect x="610" y="640" width="80" height="80" fill="#c8b48a" stroke="#a8946a" stroke-width="4"/>
      <rect x="620" y="570" width="70" height="70" fill="#d4c098" stroke="#a8946a" stroke-width="4"/>
      <rect x="626" y="666" width="44" height="18" fill="#f4f0e4"/><rect x="632" y="592" width="44" height="18" fill="#f4f0e4"/>

      <rect x="1170" y="560" width="360" height="200" fill="#6b4a33"/>
      <rect x="1188" y="590" width="150" height="150" fill="none" stroke="#4a3324" stroke-width="5"/>
      <rect x="1362" y="590" width="150" height="150" fill="none" stroke="#4a3324" stroke-width="5"/>
      ${tvSet(era, HISTORIAN_TV)}
      ${atmosphere(`hs-${era}`, era, [
        { x: 650, y: 300, r: 430, strength: 0.85 },
        { x: 720, y: 780, r: 340, ry: 80, strength: 0.4 },
      ], HISTORIAN_TV)}`;
  },
};

export const ROOMS = { citizen, journalist, official, historian };

// Painted room images, one per role and era, in frontend/rooms/<role>-<era>.jpg
// (AI-generated from rooms/PROMPTS.txt). Positions are percentages of the image:
//   tv       the TV screen, where video plays
//   painted  the TV already shows a painted broadcast: leave it visible, no static or text
//   radio    the clickable radio (leave out if the room has none)
//   lamps    lit lamps that get a soft flickering glow ({ x, y, r? })
//   sprites  cut-out pieces of the painting that animate on top of it
// A role and era with no entry here falls back to the drawn room above.
// face: where the person in the painting is (% of the image), used for chat avatars.
// mugs: where steam rises from a cup (% of the image, the rim's centre).
// props: things you can click (% of the image). 'paper' opens that role's reading for
// the day (papers.js); 'culture' opens what was popular then (culture.js).
const painting = (role, era, spec) => ({ src: `rooms/${role}-${era}.jpg`, ...spec });

export const ROOM_IMAGES = {
  citizen: {
    1962: painting('citizen', 1962, {
      face: { x: 11, y: 60 },
      props: [{ x: 16, y: 61, w: 18, h: 19, kind: 'paper', label: 'Newspaper' }, { x: 53, y: 62, w: 31, h: 26, kind: 'culture', label: 'Toys' }],
      tv: { x: 77.0, y: 38.5, w: 12.5, h: 15.5 },
      radio: { x: 14.5, y: 47.5, w: 16, h: 11 },
      lamps: [{ x: 53.6, y: 35.2, r: 24 }, { x: 46.5, y: 8.8, r: 12 }, { x: 61.8, y: 10.7, r: 12 }],
    }),
    1969: painting('citizen', 1969, {
      face: { x: 55, y: 63 },
      props: [{ x: 47, y: 83, w: 15, h: 11, kind: 'paper', label: 'Magazine' }, { x: 68, y: 30, w: 7, h: 17, kind: 'culture', label: 'Lava lamp' }],
      tv: { x: 75.2, y: 38.2, w: 13.5, h: 15.5 },
      radio: { x: 11.5, y: 54, w: 11, h: 7.5 },
      lamps: [{ x: 49.5, y: 33, r: 24 }, { x: 46.4, y: 7.8, r: 12 }, { x: 62.4, y: 9.8, r: 12 }],
    }),
    1989: painting('citizen', 1989, {
      face: { x: 15, y: 36 },
      props: [{ x: 69, y: 72, w: 16, h: 9, kind: 'paper', label: 'Magazines' }, { x: 53, y: 41, w: 14, h: 11, kind: 'culture', label: 'Boombox' }],
      tv: { x: 73.5, y: 37, w: 16, h: 19 }, painted: true,
      radio: { x: 53.2, y: 42, w: 12.8, h: 9.6 },
      lamps: [{ x: 3.9, y: 34.8, r: 20 }],
    }),
    2026: painting('citizen', 2026, {
      face: { x: 16, y: 40 },
      mugs: [{ x: 75, y: 66.5 }],
      props: [{ x: 30, y: 49, w: 14, h: 21, kind: 'paper', label: 'Laptop' }],
      tv: { x: 70.3, y: 9.5, w: 29, h: 33 }, painted: true,
      radio: { x: 69.5, y: 45.5, w: 4, h: 4 },
      lamps: [{ x: 8.1, y: 18.2, r: 20 }],
    }),
  },
  journalist: {
    1962: painting('journalist', 1962, {
      face: { x: 33, y: 47 },
      mugs: [{ x: 51, y: 70.5 }],
      props: [{ x: 57, y: 37, w: 16, h: 45, kind: 'paper', label: 'Teletype' }],
      tv: { x: 81, y: 27.3, w: 13.4, h: 16.7 },
      radio: { x: 3.9, y: 42, w: 15.6, h: 13.5 },
      lamps: [{ x: 43.9, y: 7.8, r: 16 }, { x: 48.2, y: 51.8, r: 14 }],
    }),
    1969: painting('journalist', 1969, {
      face: { x: 35, y: 37 },
      mugs: [{ x: 64.6, y: 61.5 }],
      props: [{ x: 52, y: 71, w: 36, h: 15, kind: 'paper', label: 'Wire copy' }],
      tv: { x: 79.7, y: 21.9, w: 12.3, h: 15.2 }, painted: true,
      radio: { x: 52.3, y: 55.5, w: 10.5, h: 9 },
      lamps: [{ x: 47.1, y: 45, r: 14 }],
    }),
    1989: painting('journalist', 1989, {
      face: { x: 25, y: 39 },
      mugs: [{ x: 60, y: 63 }],
      props: [{ x: 53, y: 74, w: 38, h: 17, kind: 'paper', label: 'Newspaper' }],
      tv: { x: 76.8, y: 7, w: 13, h: 16 }, painted: true,
      radio: { x: 77.5, y: 34.2, w: 13.6, h: 8.2 },
      lamps: [{ x: 57.3, y: 38.7, r: 14 }],
    }),
    2026: painting('journalist', 2026, {
      face: { x: 19, y: 37 },
      mugs: [{ x: 65, y: 69 }],
      props: [{ x: 59, y: 32, w: 23, h: 28, kind: 'paper', label: 'News feed' }],
      tv: { x: 77.7, y: 4.5, w: 21.5, h: 22.5 }, painted: true,
    }),
  },
  official: {
    1962: painting('official', 1962, {
      face: { x: 35, y: 47 },
      props: [{ x: 39, y: 16, w: 22, h: 34, kind: 'paper', label: 'Map of Cuba' }],
      tv: { x: 77.5, y: 34.2, w: 16, h: 19.5 },
      radio: { x: 12.3, y: 45.8, w: 11.5, h: 12.8 },
      lamps: [{ x: 53.4, y: 6.8, r: 14 }, { x: 64.5, y: 52.7, r: 16 }],
    }),
    1969: painting('official', 1969, {
      face: { x: 19, y: 38 },
      mugs: [{ x: 61, y: 62 }],
      props: [{ x: 71, y: 62, w: 20, h: 13, kind: 'paper', label: 'Mission file' }],
      tv: { x: 79.7, y: 30.3, w: 13, h: 17.6 }, painted: true,
      radio: { x: 60.4, y: 41, w: 9.5, h: 7.8 },
      lamps: [{ x: 58.2, y: 3.5, r: 14 }, { x: 48, y: 44, r: 16 }],
    }),
    1989: painting('official', 1989, {
      face: { x: 15, y: 38 },
      mugs: [{ x: 63, y: 63 }],
      props: [{ x: 63, y: 69, w: 27, h: 15, kind: 'paper', label: 'Briefing folder' }],
      tv: { x: 82, y: 6.4, w: 17, h: 22.5 }, painted: true,
      radio: { x: 70.7, y: 37.7, w: 15.2, h: 10.7 },
      lamps: [{ x: 33.2, y: 37.7, r: 14 }],
    }),
    2026: painting('official', 2026, {
      face: { x: 23, y: 42 },
      mugs: [{ x: 48, y: 62.5 }],
      props: [{ x: 31, y: 54, w: 12, h: 17, kind: 'paper', label: 'Tablet' }],
      tv: { x: 75.1, y: 9.4, w: 24.1, h: 25.4 }, painted: true,
      radio: { x: 69.5, y: 58, w: 4, h: 8 },
      lamps: [{ x: 38, y: 36.7, r: 14 }],
    }),
  },
  historian: {
    1962: painting('historian', 1962, {
      face: { x: 38, y: 46 },
      mugs: [{ x: 57.7, y: 70.5 }],
      props: [{ x: 67, y: 66, w: 20, h: 12, kind: 'paper', label: 'Books' }],
      tv: { x: 77.7, y: 23.4, w: 15.8, h: 20.6 },
      radio: { x: 3.9, y: 41, w: 16.3, h: 13.7 },
      lamps: [{ x: 47.9, y: 6.8, r: 14 }, { x: 56, y: 47.9, r: 14 }],
    }),
    1969: painting('historian', 1969, {
      face: { x: 17, y: 39 },
      mugs: [{ x: 58, y: 65.5 }],
      props: [{ x: 78, y: 63, w: 21, h: 22, kind: 'paper', label: 'Books' }],
      tv: { x: 81, y: 25.4, w: 11.7, h: 17.6 }, painted: true,
      lamps: [{ x: 31.5, y: 27.3, r: 20 }],
    }),
    1989: painting('historian', 1989, {
      face: { x: 14, y: 44 },
      mugs: [{ x: 52, y: 61.5 }],
      props: [{ x: 79, y: 53, w: 20, h: 23, kind: 'paper', label: 'Books' }],
      tv: { x: 79.7, y: 19.1, w: 16, h: 20.5 }, painted: true,
      radio: { x: 56, y: 38.7, w: 13, h: 10.7 },
      lamps: [{ x: 33.2, y: 27, r: 20 }],
    }),
    2026: painting('historian', 2026, {
      face: { x: 20, y: 40 },
      mugs: [{ x: 70.5, y: 69 }],
      props: [{ x: 77, y: 53, w: 22, h: 30, kind: 'paper', label: 'Books' }],
      tv: { x: 71.2, y: 7.4, w: 28, h: 28.3 }, painted: true,
      lamps: [{ x: 69.3, y: 34.8, r: 10 }],
    }),
  },
};
