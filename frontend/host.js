// Talks to the host (backend/). See CONTRACT.md: POST /ask with
// { question, role, date, pack } returns { answer, sources[], blocked, blocked_reason }.
// The host URL defaults to http://localhost:8000; open the app with ?host=http://… to change it.
// If the host is down or rejects the request, a scripted answer comes back instead
// (live: false), so the screen keeps working during the demo.
// Run locally (port 8080, serve.py), the host is on localhost:8000. Deployed, the
// host serves this page itself, so it's the same address.
const LOCAL = ['localhost', '127.0.0.1', ''].includes(location.hostname) && location.port !== '8000';
const HOST_URL = (new URLSearchParams(location.search).get('host')
  || (LOCAL ? 'http://localhost:8000' : location.origin)).replace(/\/+$/, '');
// Long enough for the host to wait out a rate limit rather than fail.
const TIMEOUT_MS = 45000;

export async function ask({ question, role, date, pack }) {
  if (!pack) return { ...scripted(question, role, date), live: false };
  try {
    const res = await fetch(`${HOST_URL}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, role, date, pack }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`host returned ${res.status}`);
    const data = await res.json();
    return {
      answer: data.answer || '', sources: data.sources || [], blocked: !!data.blocked,
      blocked_reason: data.blocked_reason || null, archival: data.archival || null, live: true,
    };
  } catch {
    return { ...scripted(question, role, date), live: false };
  }
}

// This week's headlines read by an AI anchor (GET /bulletin), for the 2026 TV.
// { items, lines, segments, audio (URL or null), label } or null.
export async function fetchBulletin({ pack, date }) {
  if (!pack) return null;
  try {
    const res = await fetch(`${HOST_URL}/bulletin?pack=${encodeURIComponent(pack)}&date=${date}`,
      { signal: AbortSignal.timeout(60000) });
    if (!res.ok) return null;
    const b = await res.json();
    return { ...b, audio: b.audio ? hostAsset(b.audio) : null };
  } catch {
    return null;
  }
}

// What this copy of the host can do. The public copy has no texting.
export async function fetchConfig() {
  try {
    const res = await fetch(`${HOST_URL}/config`, { signal: AbortSignal.timeout(5000) });
    return res.ok ? await res.json() : { texting: true };
  } catch {
    return { texting: true };
  }
}

// Let a judge text the station: register their phone with our Photon line.
// Returns { text_to, pretty, qr } (qr is a URL on the host) or { error }.
export async function connectPhone(phone) {
  try {
    const res = await fetch(`${HOST_URL}/texters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: typeof data.detail === 'string' ? data.detail : "Couldn't connect, try again." };
    return { ...data, qr: hostAsset(data.qr) };
  } catch {
    return { error: "The station isn't reachable right now." };
  }
}

// The time lock as numbers: how many facts each role could know on this day.
// { total, roles: { citizen: n, ... }, today: {...}, later } or null.
export async function fetchKnowledge({ pack, date }) {
  if (!pack) return null;
  try {
    const res = await fetch(`${HOST_URL}/knowledge?pack=${encodeURIComponent(pack)}&date=${date}`,
      { signal: AbortSignal.timeout(5000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// Tell the host what the radio is tuned to, so texts to the station are answered
// by the room on screen. The 2026 station has no pack, so it isn't sent.
export async function tuneStation({ role, date, pack }) {
  if (!pack) return;
  try {
    await fetch(`${HOST_URL}/station`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, date, pack }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* host down: nothing to sync */ }
}

// Call-ins (iMessage texts and voice calls) newer than `since`, oldest first.
export async function fetchTranscript(since) {
  try {
    const res = await fetch(`${HOST_URL}/transcript?since=${since}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    return (await res.json()).items || [];
  } catch {
    return [];
  }
}

// Call the station by voice: a recording in, the question we were heard asking,
// the answer, its sources and (if the host has voices) the answer as base64 WAV.
export async function callByVoice(blob, { role, date, pack }) {
  const form = new FormData();
  form.append('audio', blob, `call.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`);
  if (pack) {
    form.append('role', role);
    form.append('date', date);
    form.append('pack', pack);
  }
  try {
    const res = await fetch(`${HOST_URL}/voice`, { method: 'POST', body: form, signal: AbortSignal.timeout(45000) });
    if (!res.ok) {
      const detail = (await res.json().catch(() => ({}))).detail;
      return { error: typeof detail === 'string' ? detail : "The line is dead. Try typing instead." };
    }
    return await res.json();
  } catch {
    return { error: "The line is dead. Try typing instead." };
  }
}

function scripted(question, role, date) {
  if (role !== 'historian' && date < '1962-10-28' && /\b(end|ends|ending|outcome|who wins|28th)\b/i.test(question)) {
    return { answer: '', sources: [], blocked: true };
  }
  return {
    answer: `(Scripted ${role} on ${date}.) The host isn't connected, so this is a placeholder answer.`,
    sources: [],
    blocked: false,
  };
}

// Build (or reuse) a station for a past day from Wikipedia: POST /stations.
// Returns { pack, date, facts, ... } or null when the host is down or has no page.
export async function buildStation(date) {
  try {
    const res = await fetch(`${HOST_URL}/stations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
      signal: AbortSignal.timeout(30000),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// Photos people texted to the station (GET /memories.json), newest first.
// `since` is the received_at of the newest one already shown.
export async function fetchMemories(since) {
  try {
    const q = since ? `?since=${encodeURIComponent(since)}` : '';
    const res = await fetch(`${HOST_URL}/memories.json${q}`, { signal: AbortSignal.timeout(5000) });
    return res.ok ? (await res.json()).items || [] : [];
  } catch {
    return [];
  }
}
export const hostAsset = (path) => `${HOST_URL}/${path.replace(/^\/+/, '')}`;
