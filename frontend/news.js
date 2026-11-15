// The 2026 station: this week's news. The host builds a time-locked station from
// Wikipedia for the latest past day (POST /stations; today counts as the future),
// and the ticker across the room shows the same days' headlines, read from
// Wikipedia's page for the year. Labeled "Auto-built from Wikipedia, not reviewed".
import { buildStation } from './host.js';

// The host reads the station's day and the 3 days before it; the ticker matches.
const WINDOW_DAYS = 4;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

export function latestPastDay(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return iso(d);
}

// Build the station once per page load; retry next time if the host was down.
let building = null;
export function liveStation() {
  building ||= buildStation(latestPastDay()).then((st) => {
    if (!st?.pack) { building = null; return null; }
    return { pack: st.pack, date: st.date };
  });
  return building;
}

// What the headlines looked like when this was written, for when Wikipedia
// can't be reached (venue Wi-Fi). Only used if they fall in the window.
const SNAPSHOT = [
  { date: '2026-11-10', text: 'A pile-up on the Trakia motorway near Yambol kills 13 and injures 51; Bulgaria holds a national day of mourning.' },
  { date: '2026-11-12', text: 'Nvidia CEO Jensen Huang resigns amid an alleged Chinese spying scandal.' },
  { date: '2026-11-12', text: 'Microsoft outage: a global outage disrupts Microsoft 365, including Outlook, Teams and Copilot.' },
  { date: '2026-11-13', text: 'FAA ground stop: the largest since 9/11 shuts down U.S. airspace after communication failures.' },
  { date: '2026-11-14', text: 'The first Eurovision Song Contest Asia is held in Bangkok, Thailand.' },
];

// Headlines for the window ending on `date`, newest first: [{ date, text }].
export async function headlines(date) {
  const key = `stay-tuned-headlines-${date}`;
  try {
    const cached = JSON.parse(localStorage.getItem(key) || 'null');
    if (cached?.length) return cached;
  } catch { /* storage blocked: fetch again */ }

  const end = parse(date);
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (WINDOW_DAYS - 1));
  const inWindow = (d) => d >= iso(start) && d <= date;
  let items = [];
  try {
    items = await fromWikipedia(end.getFullYear(), end.getMonth());
    if (start.getMonth() !== end.getMonth()) items = items.concat(await fromWikipedia(start.getFullYear(), start.getMonth()));
  } catch { /* offline: fall back below */ }
  items = items.filter((h) => inWindow(h.date));
  if (!items.length) items = SNAPSHOT.filter((h) => inWindow(h.date));
  items.sort((a, b) => b.date.localeCompare(a.date));
  try { localStorage.setItem(key, JSON.stringify(items)); } catch { /* fine */ }
  return items;
}

// A year page ("2026") lists each month's events as "November 13 – text",
// "November 12–14 – text", or a bare "November 7" line followed by events.
async function fromWikipedia(year, monthIndex) {
  const url = 'https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1'
    + `&titles=${year}&format=json&origin=*`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const page = Object.values((await res.json()).query.pages)[0];
  const text = page.extract || '';
  const month = MONTHS[monthIndex];
  const head = new RegExp(`^===\\s*${month}\\s*===\\s*$`, 'm').exec(text);
  if (!head) return [];
  const rest = text.slice(head.index + head[0].length);
  const next = /^==/m.exec(rest);
  const section = next ? rest.slice(0, next.index) : rest;
  const line = new RegExp(`^${month} (\\d{1,2})(?:\\s*[–-]\\s*\\d{1,2})?(?:\\s+[–-]\\s+(.*))?$`);
  const out = [];
  let current = null;
  for (const raw of section.split('\n')) {
    const ln = raw.trim();
    if (!ln) continue;
    const hit = line.exec(ln);
    if (hit) {
      current = iso(new Date(year, monthIndex, Number(hit[1])));
      if (hit[2]) out.push({ date: current, text: tidy(hit[2], year) });
    } else if (current && !ln.startsWith(month)) {
      out.push({ date: current, text: tidy(ln, year) });
    } else {
      current = null;
    }
  }
  return out;
}

// "2026 FAA ground stop: The United States ..." → "FAA ground stop: The United States ..."
function tidy(text, year) {
  let t = text.replace(new RegExp(`^${year}\\s+`), '').replace(/\s+/g, ' ').trim();
  if (t.length > 170) t = `${t.slice(0, 167).replace(/\s+\S*$/, '')}…`;
  return t;
}
