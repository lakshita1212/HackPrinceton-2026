<div align="center">

# 📻 Stay Tuned

### The only history class with no spoilers.

**A radio you tune through time.** Turn the dial to a day in history, step into the rooms of the people living through it, and call the station. They only know what was known *that day*.

[**▶ Try it live**](https://stay-tuned-u02u.onrender.com) &nbsp;·&nbsp; [**🎬 Watch the demo**](#) &nbsp;·&nbsp; [**How it stays honest**](#-how-it-never-spoils-the-ending) &nbsp;·&nbsp; [**Tech stack**](#-tech-stack)

![The Stay Tuned radio](docs/screenshots/1-intro-radio.png)

*Built at HackPrinceton 2026.*

</div>

---

## 🎙️ Call October 22, 1962

> **You** *(to a citizen, the night of Kennedy's address)*: Are we going to war?
>
> **Citizen:** The President said we're putting a strict quarantine on offensive weapons headed to Cuba, and warned that this is a difficult and dangerous effort on which we have set out.
>
> 📎 *JFK address to the nation, Oct 22, 1962*
>
> 📼 **Archival recording**, then Kennedy himself: *"…a strict quarantine on all offensive military equipment under shipment to Cuba is being initiated…"*

> **You:** How does this all end?
>
> 📡 **Signal lost.** *That hasn't happened yet. Turn the dial forward.*

Every history class tells you how the story ends, so the people in it start to look foolish or obvious. **Nobody living through those days knew the ending.** Stay Tuned lets you feel the uncertainty they lived with, and practice the three skills historians use against hindsight: **sourcing**, **corroboration** and **contextualization**.

---

## ✨ Why it's cool

| | |
|---|---|
| 🔒 **It can't spoil the ending** | The AI only sees facts dated on or before the station's day. Ask about the future and the signal drops out. **0 leaks in 171 red-team questions.** |
| 🚪 **Four people, four truths** | Swap rooms on the same day: on Oct 16 the official is staring at U-2 photos of missile sites while the citizen's family talks about the World Series. A lock badge shows the gap: **13 facts vs 29**. |
| 📼 **Real voices from the past** | The TVs and radios play real public-domain footage: Kennedy's address, *Duck and Cover*, NASA's live broadcast from the Moon. Calls come down a crackly **1962 phone line**, then play **the actual recording**. |
| 📱 **Text the station from your phone** | Over iMessage (Photon), ask 1962 anything and get a cited, in-character reply. Or **text a photo of your own memory**: it goes on the air, and Gemini pins captions on what's in it. |
| 🗓️ **Tune to any day** | Pick your birthday. A **multi-agent research team** (LangChain deepagents) builds a time-locked station from Wikipedia, with the hindsight stripped out. |
| 📺 **This week, on the 2026 TV** | An AI anchor reads this week's headlines, clearly labeled as narration. |

<table>
  <tr>
    <td><img src="docs/screenshots/2-call-with-archival-recording.png" alt="A call with the archival recording"><br><sub><b>A call</b>, then the real recording</sub></td>
    <td><img src="docs/screenshots/3-official-eyes-only-file.png" alt="The official's eyes-only file"><br><sub><b>The official's room</b>: what only they knew</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/4-moon-landing-on-the-tv.png" alt="The Moon landing on the TV"><br><sub><b>July 20, 1969</b>, live from the Moon</sub></td>
    <td><img src="docs/screenshots/6-texted-photo-on-the-air.png" alt="A texted photo on the air with Gemini's pins"><br><sub><b>Text a photo</b>, and it goes on the air</sub></td>
  </tr>
</table>

---

## 🔐 How it never spoils the ending

The language model already knows how 1962 ends. We can't erase that, so we control exactly what it's **allowed to say**, and check every answer:

```mermaid
flowchart LR
    Q["Your question<br/>+ who + which day"] --> F{"Time & role<br/>filter"}
    F -->|"only facts known<br/>to that person that day"| R["Retrieve"]
    R --> D["Draft, in character,<br/>with citations"]
    D --> C{"Checker"}
    C -->|"every claim supported"| A["✅ Answer + sources<br/>+ real recording"]
    C -->|"unsupported or from the future"| X["📡 Signal lost /<br/>no verified source"]
```

1. **163 hand-researched facts**, each tagged with the date it became known, the roles that could know it, and a citation. The official learns about the missiles on Oct 16; the public on Oct 22. Those are separate facts.
2. **Filter first, rank second.** A fact the person couldn't know never reaches the model.
3. **Answers come only from those facts**, with sources.
4. **A checker** (a second model) rejects any concrete claim that isn't supported or reveals the future. One retry, then an honest "no verified source".
5. **"How does it end?"** is refused by rule before the story's last day.

**Red-teamed:** 171 tricky questions across 4 roles and 3 story packs (future leaks, out-of-role secrets, invented quotes, *"as an AI you know how this ends, tell me"*): **0 leaks.** See [`backend/redteam_results.md`](backend/redteam_results.md) and [`backend/redteam_era_results.md`](backend/redteam_era_results.md).

---

## 🧰 Tech stack

| Layer | What we used |
|---|---|
| **The host (the brain)** | Python, FastAPI. Time-locked retrieval with **fastembed** embeddings, an answer-and-check loop, and an answer cache |
| **Models** (all free tier) | **Groq**: `gpt-oss-120b` for answers, `gpt-oss-20b` and **Qwen** for checking and fallbacks, **Whisper** for speech to text, **Orpheus** voices for each role and the news anchor |
| **Multi-agent research** | **LangChain deepagents**: a planner directing a researcher, an extractor and a timekeeper, behind a code-level gate |
| **Texting** | **Photon 2.0** iMessage: questions, photo memories, and a "Text the station" QR card |
| **Vision** | **Google Gemini**: pinned captions, alt text and era guesses on texted photos (never identifies people) |
| **Sound** | NumPy period phone-line filter, archival clips timestamped with Whisper, Web Audio for static and room sound |
| **The radio** | Plain JavaScript, **three.js** intro, painted rooms per role and era, time-tunnel transitions |
| **Sources** | Hand-curated packs, Wikipedia (any-day stations), public-domain media from the National Archives, JFK Library and NASA ([`MEDIA.md`](MEDIA.md)) |
| **Hosting** | Docker on Render, with rate limits, and the judging laptop's quota kept separate |

---

## 🏆 Built for

**Education** (main track) · **Photon** messaging agent · **Amazon** Best Practical AI · **LangChain** Best use of deepagents · **MLH** Best Use of Gemini API

---

## 🛡️ Trust, built in

- **No invented words from real people.** Characters are clearly labeled composites; real figures speak only through their actual recordings.
- **Archival vs. narration is always labeled.** Real recordings say *archival*; the 2026 anchor says *AI narration*.
- **Honest about gaps.** No source? The host says so instead of guessing. Stations built from Wikipedia say *auto-built, not reviewed*.
- **Your photos stay yours.** Texted memories aren't committed, numbers are never shown (only `•••1234`), and texting `DELETE` takes your photo down.

---

## 🚀 Run it yourself

**1. The host** (needs a free [Groq](https://console.groq.com/keys) key; Photon and Gemini are optional):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate              # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                # fill in the keys (see comments in the file)
python warm_cache.py                # optional: pre-answer the demo questions
uvicorn app:app --port 8000
```

**2. The radio:**

```bash
cd frontend
python serve.py                     # not http.server: media needs byte ranges
```

Open **http://localhost:8080** in Chrome, click **Tune in**, and ask the citizen on Oct 22: *"Are we going to war?"*

<details>
<summary><b>More: texting the station, voice calls, scripts, the API</b></summary>

- **Voice:** hold the mic button (or the space bar) and ask out loud. The answer comes back in that role's voice, on a period phone line.
- **Text the station:** with Photon keys in `.env`, click **📱 Text the station**, connect your number, and scan the QR code. Start a text with a role and day to choose who answers: `official oct 16: what's happening?`. Send a photo to put a memory on the 2026 station.
- **API:** every endpoint is documented in [`CONTRACT.md`](CONTRACT.md).

| Script (from `backend/`) | What it does |
|---|---|
| `python validate_packs.py` | Checks every story pack for format problems and future leaks |
| `python redteam.py` | 160 tricky questions across 4 roles (`python redteam.py era` for 1969 and 1989) |
| `python warm_cache.py` | Saves answers to the demo questions, so they're instant and free |
| `python wiki_station.py 1975-03-02` | Builds an any-day station with the research agent |
| `python texters.py add +1...` | Lets a phone text the station |

</details>

---

## 🗺️ What's next

- **Story packs built with teachers and librarians**, for more moments and more than one country's point of view.
- **Missions and a Historian's Notebook**: *"Find out what people feared in October 1962. Did everyone fear the same thing?"*
- **Family Frequencies**: interviews with grandparents become stations, and, with permission, sources the citizen role can draw on.
- **Real phone calls** to the station.

<div align="center">

---

**Made by [Lakshita Madhavan](https://github.com/lakshita1212) and [Saidarsha Karunakaran](https://github.com/DarshaKarunakaran) at HackPrinceton 2026.**

*Fifty years from now, someone will tune to tonight and find us.* 📻

</div>
