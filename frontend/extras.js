// Make the time lock visible to a judge:
//   - a badge with how much this role could know on this day (GET /knowledge)
//   - a "signal lost" burst of static when a question reaches past the station's day
import { fetchKnowledge, connectPhone } from './host.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let lockRequest = 0;
export async function updateTimeLock({ pack, date }, roleId, roleName) {
  const el = $('timelock');
  if (!el) return;
  const mine = ++lockRequest;
  const k = pack ? await fetchKnowledge({ pack, date }) : null;
  if (mine !== lockRequest) return; // the dial moved on while we waited
  if (!k) { el.hidden = true; return; }
  const known = k.roles[roleId] ?? 0;
  const pct = Math.round((known / Math.max(1, k.total)) * 100);
  el.hidden = false;
  el.innerHTML = `
    <span class="lock-icon" aria-hidden="true">🔒</span>
    <span class="lock-text"><b></b> knows <b class="lock-n"></b> of <span class="lock-total"></span> facts</span>
    <span class="lock-bar" aria-hidden="true"><span style="width:${pct}%"></span></span>`;
  el.querySelector('b').textContent = `The ${roleName.toLowerCase()}`;
  el.querySelector('.lock-n').textContent = known;
  el.querySelector('.lock-total').textContent = k.total;
  const others = Object.entries(k.roles)
    .map(([r, n]) => `${r[0].toUpperCase()}${r.slice(1)}: ${n}`)
    .join(' · ');
  el.title = `What each role could know on this day. ${others}. ${k.later} facts haven't happened yet.`;
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
}

// A question that reaches past the station's day: the signal drops out.
export function signalLost() {
  const el = $('signalLost');
  if (!el) return;
  sfx.staticBurst?.();
  el.hidden = false;
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
  clearTimeout(signalLost.t);
  signalLost.t = setTimeout(() => { el.hidden = true; }, reduceMotion() ? 2500 : 2200);
}

// Text the station: a judge connects their phone, then scans a QR code that
// opens Messages to their assigned number with a first question filled in.
export function initTextCard() {
  const card = $('textCard');
  const toggle = $('textToggle');
  if (!card || !toggle) return;
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
