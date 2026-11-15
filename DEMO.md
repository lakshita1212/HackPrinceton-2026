# Demo script

Two minutes at the judging table. One person drives the laptop, the other talks and texts the station from a phone. Every question below has a saved answer (`backend/warm_cache.py`), so it comes back instantly even if Groq is slow or out of quota.

## Before judges arrive

1. **Host:** `cd backend && .venv/bin/uvicorn app:app --port 8000`. Check that only one laptop has `PHOTON_IMESSAGE=on`, or every text gets two replies.
2. **Front end:** `cd frontend && python3 serve.py`. Don't use `python3 -m http.server`: the TV and radio stick at 0:00 with it.
3. **Saved answers:** if the packs changed since the last warm-up, delete `backend/cache/answers.json`, run `.venv/bin/python warm_cache.py`, then restart the host.
4. **2026 news:** tune to 2026 once while online, so the host builds and saves this week's station.
5. Open http://localhost:8080 in Chrome, full screen, with the volume up. Leave it on the intro screen.

## The two minutes

| Time | Do | Say |
|---|---|---|
| 0:00 | Click **Tune in** on the radio. | "History class tells you how everything ends. We wanted to know what it felt like when nobody knew." |
| 0:10 | You land on **Oct 22, 1962, Citizen**. Point at the TV playing on the set. | "It's the night Kennedy goes on TV about missiles in Cuba. You're a regular person in your living room." |
| 0:20 | Ask: **Are we going to war?** | "The answer only uses what was public that night, with real sources underneath." |
| 0:35 | Click **Official**. Ask the same question: **Are we going to war?** | "Same night, same question, inside the government. Different knowledge, different person: see the profile picture." |
| 0:50 | Click **Citizen**. Ask: **How does this all end?** | "And nobody can spoil it. Ask about the future and the line goes dead." |
| 1:00 | Drag the dial to **1969** (the tunnel plays). Ask: **Did they make it?** Then click the **TV** and turn the channel knob once. | "Every station has real public-domain footage and audio, different in each room. This is NASA's broadcast from the Moon." |
| 1:20 | Close the TV. Drag to **1989**. Ask: **What's happening at the border tonight?** | "November 9, 1989: the Berlin Wall opens tonight, and this citizen is hearing it as it happens." |
| 1:35 | Drag to **2026**. Point at the ticker. Ask: **What's in the news this week?** | "And it works on any day, including this week. This station was built from Wikipedia this morning." |
| 1:50 | Partner texts the station from their phone: **What's happening?** The text and answer appear in the call panel. | "You can text the station from your own phone. It answers as whoever is on the screen." |
| 2:00 | Stop. | "Stay Tuned: the only history class with no spoilers." |

## Optional extras, if they ask

- **Click things in the room:** the dad's newspaper (that day's front page), the kids' toys (what was popular in 1962), the official's map (the "Eyes only" briefing file), the historian's books (what we only learned later). Each one shows only what that person could know that day.
- **Room sound:** the living-room TV plays softly; the newsroom has typewriters and the office a ticking clock. Use the **Sound on/off** button at the top right if the room is noisy.
- **Voice:** hold the mic button (or the space bar), ask a question, and let go. The answer is spoken in that role's voice.
- **Official, 1969:** *What would the President say if they got stuck up there?* The answer quotes the real speech prepared in case the astronauts were stranded (Safire's memo, July 18, 1969).
- **Official, 1989:** *Why did Schabowski say immediately?* "He wasn't briefed properly…"
- **How it stays honest:** every fact has a date, the roles that could know it, and a citation. Retrieval only sees facts dated on or before the station's day, and a checker rejects any claim that isn't supported or is about the future.
- **Media sources:** every video and radio clip is public domain; two room sounds are openly licensed with credit. See `MEDIA.md`.

## If something breaks

| Problem | Fix |
|---|---|
| Answers are greyed out ("scripted") | The host is down or can't reach Groq. Restart it, and stick to the questions above (they're saved). |
| "Host unavailable" after several questions | Groq's per-minute limit. Wait 10 seconds, or use a saved question. |
| TV or radio stuck at 0:00 | The front end is running on `http.server`. Restart it with `python3 serve.py`. |
| 2026 shows no ticker | No internet. The ticker falls back to the headlines saved in `frontend/news.js`. |
| A text gets two answers | Both laptops have `PHOTON_IMESSAGE=on`. Turn it off on one. |
