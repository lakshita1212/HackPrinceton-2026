# API contract

The one agreement between the brain (host, Lakshita) and the experience (app, partner).
Both sides build against this all night. Change it only together.

## `POST /ask`

The app sends a question to the host for one role on one day.

### Request

```json
{
  "question": "Are we going to war?",
  "role": "citizen",
  "date": "1962-10-22",
  "pack": "cmc-1962"
}
```

| Field      | Type   | Values |
|------------|--------|--------|
| `question` | string | What the student typed or said. 1 to 500 characters. |
| `role`     | string | `citizen`, `journalist`, `official` or `historian` |
| `date`     | string | ISO date `YYYY-MM-DD`: the station's day. The host knows nothing after it. |
| `pack`     | string | Story pack id: `cmc-1962`, `apollo-1969`, `berlin-1989` |

### Response (always HTTP 200 when the request is valid)

```json
{
  "answer": "Nobody on our street knows. The President spoke tonight ...",
  "sources": [
    {
      "id": "cmc-1022-address",
      "title": "Radio and television address on the Soviet arms buildup in Cuba",
      "date": "1962-10-22",
      "citation": "John F. Kennedy Presidential Library, JFKWHA-142-001",
      "url": "https://www.jfklibrary.org/...",
      "kind": "archival"
    }
  ],
  "blocked": false,
  "blocked_reason": null
}
```

| Field            | Type            | Meaning |
|------------------|-----------------|---------|
| `answer`         | string          | What the role says. Short enough to speak in about 20 seconds. |
| `sources`        | array of Source | Every source the answer relies on. Empty only when `blocked` is true or the host has no verified source. |
| `blocked`        | boolean         | `true` when the checker refused to answer. `answer` then holds an in-character refusal the app can still show or speak. |
| `blocked_reason` | string or null  | Optional, for the operator panel only: `future`, `role`, `unsupported`, `off_topic`. |

**Source**

| Field      | Type   | Meaning |
|------------|--------|---------|
| `id`       | string | Stable id inside the pack |
| `title`    | string | Short label for the source chip |
| `date`     | string | ISO date the source was known. Always on or before the request `date`. |
| `citation` | string | Human-readable citation |
| `url`      | string or null | Link to the original, if there is one |
| `kind`     | string | `archival` (real recording or document) or `narration` (written from curated facts) |

### Errors

- `422` if a field is missing or has a bad value (FastAPI's default validation body).
- `503` if the host is down. The app falls back to the prototype's scripted answers.

## `GET /health`

Returns `{ "ok": true }`. The app can ping this before the demo.

## `POST /station` and `GET /station`

What the radio is tuned to. The app POSTs this whenever the dial moves, so
texts to the station are answered by the room on screen.

```json
{ "pack": "cmc-1962", "role": "citizen", "date": "1962-10-22" }
```

Same fields and values as `/ask`. Returns the stored station. Default before
the first POST: citizen, `1962-10-22`, `cmc-1962`.

A text can still pick its own room by starting with a role and/or day,
for example `official oct 16: what's happening?`.

## `GET /transcript?since=<seq>`

Call-ins (iMessage now, voice later) for the on-screen switchboard. Poll every
couple of seconds, passing the highest `seq` you've seen (start with `0`).

```json
{
  "items": [
    {
      "seq": 3,
      "at": 1794702300.5,
      "channel": "imessage",
      "caller": "•••3847",
      "question": "Are we going to war?",
      "pack": "cmc-1962",
      "role": "citizen",
      "date": "1962-10-22",
      "answer": "...",
      "sources": [ /* Source, as in /ask */ ],
      "blocked": false,
      "blocked_reason": null
    }
  ]
}
```

`at` is Unix seconds. `caller` only ever shows the last 4 digits. The log
keeps the latest 50 and resets when the host restarts.

## `POST /voice`

Call the station from the laptop microphone. Send `multipart/form-data`:

| Field   | Required | Meaning |
|---------|----------|---------|
| `audio` | yes      | The recording (`MediaRecorder` webm or mp4, or wav) |
| `role`, `date`, `pack` | no | Same values as `/ask`. Default: the current `/station`. |

Returns the `/ask` response fields plus:

| Field      | Meaning |
|------------|---------|
| `question` | What we heard (speech to text) |
| `audio`    | Base64 WAV of the answer in that role's voice, or `null`: then speak `answer` with the browser's `speechSynthesis` |
| `role`, `date`, `pack` | The station that answered |

Each call also appears in `/transcript` with `channel: "voice"`.
A working example page is served at `http://localhost:8000/call` (`backend/static/call.html`).

## Notes for the app side

- Base URL in dev: `http://localhost:8000`. CORS is open in dev.
- Until the real host is ready, `/ask` returns scripted answers in exactly this shape, so the app never has to change when the real host lands.
- Texts to the station (Photon iMessage, +1 628 998 8199) go through the same host; the app shows them by polling `GET /transcript`.
