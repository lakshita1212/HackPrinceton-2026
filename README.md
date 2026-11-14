# Stay Tuned

**The only history class with no spoilers.** A radio you tune through time: rotate your phone like a dial to land on a day in history, step into the rooms of the people living through it, and call the station to talk to them. They only know what was known on that day.

Built at HackPrinceton 2026.

## Stack

| Part | Tech | Folder |
|------|------|--------|
| Host (the brain) | Python, FastAPI, LangChain deepagents | [backend/](backend/) |
| Radio app + phone dial (the experience) | JS front end, WebSockets | [frontend/](frontend/) |
| Call-in | Photon 2.0 voice | backend |

The app and the host talk through one endpoint, described in [CONTRACT.md](CONTRACT.md).

## Run the host

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # then add your free GROQ_API_KEY
uvicorn app:app --reload --port 8000
```

Try it:

```bash
curl -X POST localhost:8000/ask -H "Content-Type: application/json" \
  -d '{"question":"Are we going to war?","role":"citizen","date":"1962-10-22","pack":"cmc-1962"}'
```

Check that deepagents works: `python hello_agent.py`

## Workflow

- Branch off `main` for each change: `git checkout -b <short-name>`
- Push the branch and open a PR into `main`
- Pull `main` often to stay in sync
