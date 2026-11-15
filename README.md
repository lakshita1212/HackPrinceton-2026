# Stay Tuned

**The only history class with no spoilers.** A radio you tune through time: turn the dial to land on a day in history, step into the rooms of the people living through it, and call the station to talk to them. They only know what was known on that day.

Built at HackPrinceton 2026.

## Stack

| Part | Tech | Folder |
|------|------|--------|
| Host (the brain) | Python, FastAPI, LangChain deepagents, Groq | [backend/](backend/) |
| Radio app (the experience) | JS front end on the laptop | [frontend/](frontend/) |
| Text the station | Photon 2.0 iMessage | [backend/photon_imessage.py](backend/photon_imessage.py) |
| Call the station | Laptop mic: Groq Whisper, the host, Groq Orpheus voices | [backend/voice.py](backend/voice.py) |
| Sources | Curated, cited facts per day and role | [backend/packs/](backend/packs/) |

The app and the host talk through the endpoints in [CONTRACT.md](CONTRACT.md).

## How the host stays in its moment

1. Every fact in a story pack has a date and the roles that could have known it.
2. Retrieval only sees facts dated on or before the station's day and allowed for the role. The historian sees everything, with hindsight.
3. The answer is written only from those facts, in character, citing them.
4. A checker rejects anything unsupported, from the future or invented, and the host retries once before saying it has no verified source.
5. "How does it end?" questions are refused before the story's last day.

## Run the host

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # then fill in the keys (see comments in the file)
uvicorn app:app --reload --port 8000
```

Then:

- **Ask by text:**
  ```bash
  curl -X POST localhost:8000/ask -H "Content-Type: application/json" \
    -d '{"question":"Are we going to war?","role":"citizen","date":"1962-10-22","pack":"cmc-1962"}'
  ```
- **Call the station:** open http://localhost:8000/call, hold the button (or space bar) and ask out loud.
- **Text the station:** with the Photon keys in `.env`, iMessage the station's number while the server runs. Start a message with a role and day to choose who answers, e.g. `official oct 16: what's happening?`.

## Useful scripts (from `backend/`)

| Command | What it does |
|---------|--------------|
| `python validate_packs.py` | Checks every story pack for format problems and future leaks |
| `python try_host.py` | Asks the host 10 tricky questions (`--sample` for the small test pack) |
| `python hello_agent.py` | Confirms deepagents runs with your model key |

## Workflow

- Branch off `main` for each change: `git checkout -b <short-name>`
- Push the branch and open a PR into `main`
- Pull `main` often to stay in sync
