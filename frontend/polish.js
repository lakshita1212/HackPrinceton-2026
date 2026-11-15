// Small life in the room (issue #14): steam curling up from the mugs and cups
// in the paintings, and now and then a car's headlights sweeping across the
// walls, since every room is painted at night. Both are skipped when the
// visitor asks for reduced motion.
const $ = (id) => document.getElementById(id);
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let headlightTimer = 0;

export function setRoom(pic) {
  const steam = $('steam');
  steam.replaceChildren();
  clearTimeout(headlightTimer);
  if (!pic || reduceMotion()) return;
  // Steam: three faint wisps per mug, each rising and fading on its own beat.
  for (const mug of pic.mugs || []) {
    const spot = document.createElement('span');
    spot.className = 'steam-spot';
    spot.style.left = `${mug.x}%`;
    spot.style.top = `${mug.y}%`;
    for (let i = 0; i < 3; i++) {
      const wisp = document.createElement('i');
      wisp.style.animationDelay = `${i * 1.3 + Math.random()}s`;
      wisp.style.left = `${(i - 1) * 4}px`;
      spot.append(wisp);
    }
    steam.append(spot);
  }
  scheduleHeadlights();
}

// A car passing outside: a soft band of light slides across the room.
function scheduleHeadlights() {
  headlightTimer = setTimeout(() => {
    const el = $('headlights');
    el.classList.remove('sweep', 'reverse');
    void el.offsetWidth;
    el.classList.add('sweep');
    if (Math.random() < 0.5) el.classList.add('reverse');
    scheduleHeadlights();
  }, 14000 + Math.random() * 22000);
}
