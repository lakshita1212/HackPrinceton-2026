// Talks to the host (backend/). See CONTRACT.md: POST /ask with
// { question, role, date, pack } returns { answer, sources[], blocked, blocked_reason }.
// The host URL defaults to http://localhost:8000; open the app with ?host=http://… to change it.
// If the host is down or rejects the request, a scripted answer comes back instead
// (live: false), so the screen keeps working during the demo.
const HOST_URL = (new URLSearchParams(location.search).get('host') || 'http://localhost:8000').replace(/\/+$/, '');
const TIMEOUT_MS = 20000;

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
    return { answer: data.answer || '', sources: data.sources || [], blocked: !!data.blocked, live: true };
  } catch {
    return { ...scripted(question, role, date), live: false };
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
