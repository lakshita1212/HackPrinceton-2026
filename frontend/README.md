# Front end

The radio app. Everything runs on the laptop: turn the dial to pick a day, pick a role to step into their room, click the TV or radio, and call the station.

## Run

```bash
cd frontend
python3 serve.py
```

Use `serve.py`, not `python3 -m http.server`. The plain server can't send part of a file, so video and audio can't seek, and after a few channel changes the TV and radio stick at 0:00 with no sound.

Open http://localhost:8080. It calls the host at `http://localhost:8000` (see [Run the host](../README.md#run-the-host)); open `http://localhost:8080/?host=http://…` to point it somewhere else. Without the host, the call-in panel shows scripted placeholder answers.

## Online (GitHub Pages)

`.github/workflows/pages.yml` publishes this folder to https://lakshita1212.github.io/HackPrinceton-2026/ on every push to main, once a repo admin sets Settings → Pages → Source to **GitHub Actions**. Pages only serves the app: without a host, calls get scripted answers. To use a live host, add `?host=https://<host address>` to the URL, for example a `cloudflared tunnel --url http://localhost:8000` link.

Controls: drag or scroll over the dial, click a date, or use the arrow keys. The tabs change the role.

## Files

| File | What it is |
| --- | --- |
| `stations.js` | Dial positions: date, era and pack per station (pack ids from [CONTRACT.md](../CONTRACT.md)) |
| `rooms.js` | A room per role, drawn for each era (1962, 1969, 1989, 2026) |
| `media.js` | Clips for the TVs and radios; log each one's rights in MEDIA.md |
| `dial.js` | The tuning dial |
| `host.js` | Calls `POST /ask` |
| `audio.js` | Tick and static sounds |
| `app.js` | Wires it together |
