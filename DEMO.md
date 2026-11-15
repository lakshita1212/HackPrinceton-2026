# Demo script

Two minutes at the judging table. One person drives the laptop, the other talks and texts the station from a phone. Every question below has a saved answer (`backend/warm_cache.py`), so it comes back instantly even if Groq is slow or out of quota.

## Before judges arrive

1. **Host:** `cd backend && .venv/bin/uvicorn app:app --port 8000`. Check that only one laptop has `PHOTON_IMESSAGE=on`, or every text gets two replies.
2. **Front end:** `cd frontend && python3 serve.py`. Don't use `python3 -m http.server`: the TV and radio stick at 0:00 with it.
3. **Saved answers:** if the packs changed since the last warm-up, delete `backend/cache/answers.json`, run `.venv/bin/python warm_cache.py`, then restart the host.
4. **2026 news:** tune to 2026 once while online, so the host builds and saves this week's station. The headlines then play on its TV.
5. Open http://localhost:8080 in Chrome, full screen, with the volume up. Leave it on the intro screen.

## The two minutes

The same script works live at the table and for the video. Every question is already saved, so answers come back instantly.

| Time | Do | Say |
|---|---|---|
| 0:00 | Click **Tune in** on the radio. | "History class tells you how everything ends. We wanted to know what it felt like when nobody knew." |
| 0:10 | You land on **Oct 22, 1962, Citizen**. Point at Kennedy on the TV, then at the pill by the date. | "October 22, 1962. Kennedy is on TV about missiles in Cuba. This citizen knows 22 facts. 54 haven't happened yet, and 26 are secret." |
| 0:22 | Ask: **Are we going to war?** Let the answer show, then let JFK's real voice play for about 5 seconds. | "Every claim has a real source. And when there's a recording, you hear the actual voice from that night." |
| 0:40 | Click **Official**. Ask the same question. | "Same night, same question, inside the government. Different person, different knowledge, and no secrets locked away." |
| 0:55 | Click **Citizen**. Ask: **How does this all end?** "Signal lost" fills the screen. | "And nobody can spoil it. Ask about the future, and the signal drops." |
| 1:05 | Click the **dad's newspaper**. Close it after a beat. | "Everything in the room is real. That's the actual front page of the day." |
| 1:15 | Drag the dial to **1969** (the tunnel plays). Click the **TV**, then turn the channel knob once. | "Every decade has real public-domain footage, and a different channel in each room. This is NASA's broadcast from the Moon." |
| 1:30 | Close the TV. Drag to **2026**. Let the Nvidia story play on the TV. | "And it works on today. This station was built from this week's news." |
| 1:40 | Partner texts a **photo with a caption** to the station (live: a judge scans the QR code in **📱 Text the station**). It pops up "On the air" with Gemini's pins. | "Text the station from your own phone. Google Gemini pins captions on what's in your photo and guesses its era." |
| 1:55 | Stop. | "Stay Tuned: the only history class with no spoilers." |

## Recording the video

**Easiest: let it run itself.** Open http://localhost:8080/?demo=1, start recording, and press **Tune in**. That's the only click. The demo plays the whole script by itself, with the narration as captions and the cursor hidden, then ends on a title card (about 1.5 minutes). No talking needed. If someone texts the station a photo before you record, the demo shows it on the air at the end; otherwise it shows the QR code card. Record at 1920×1080 so the header fits on one line.


- **Record your Mac's sound.** JFK's voice and the room sound are half the demo. QuickTime and Cmd+Shift+5 don't capture what the Mac plays, but OBS Studio does (macOS 13 or later: Sources → macOS Screen Capture, which captures audio too). Talk over it live with a mic, or add the voiceover after.
- **A clean screen.** Use Chrome in full screen (Ctrl+Cmd+F) with no other tabs, turn on Focus mode so no notifications pop up, and make the window about 1440×900.
- **Reset between takes.** Reload `http://localhost:8080` and it starts from the intro. The texted photo stays on the 2026 TV; to clear it, text DELETE from the same phone.
- **Keep it under 2:30.** Judges skim, and the first 10 seconds decide whether they keep watching.
- **Upload it to YouTube as Unlisted** and paste the link into Devpost.

## Live at the table

- **Hand them the dial early.** After your first minute, let a judge pick a day and ask anything. The trick questions in "Optional extras" are the ones judges tend to try.
- **Texting:** open **📱 Text the station**, have the judge connect their number, scan the QR code and send a question or a photo.
- **Keep the volume up.** The archival clip and the room sound sell it.

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
| 2026 TV shows no headlines | No internet. The TV falls back to the headlines saved in `frontend/news.js`. |
| A text gets two answers | Both laptops have `PHOTON_IMESSAGE=on`. Turn it off on one. |
