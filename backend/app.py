"""Stay Tuned host API. Matches CONTRACT.md.

Run: uvicorn app:app --reload --port 8000   (from backend/)
"""
import logging
from datetime import date as Date
from pathlib import Path
from typing import Annotated, Literal, Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, StringConstraints

import answer_cache
import archival
import cloud
import host
import memories
import photon_imessage
import retrieval
import station
import voice
import wiki_station
import wiki_source
from packs import PackNotFound, load_pack

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("app")

Role = Literal["citizen", "journalist", "official", "historian"]
# Curated packs, plus any-day stations built from Wikipedia: "wiki-YYYY-MM".
Pack = Annotated[str, StringConstraints(pattern=r"^(cmc-1962|apollo-1969|berlin-1989|wiki-\d{4}-\d{2})$")]


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    role: Role
    date: Date
    pack: Pack


class Source(BaseModel):
    id: str
    title: str
    date: Date
    citation: str
    url: Optional[str] = None
    kind: Literal["archival", "narration"]


class Archival(BaseModel):
    """A few seconds of a real recording to play after the answer (see archival.py)."""
    id: str
    src: str  # path under the front end, e.g. media/kennedy-address-1962-10-22.mp3
    start: float  # seconds
    end: float
    quote: str
    title: str
    source: str
    label: Literal["archival"]


class AskResponse(BaseModel):
    answer: str
    sources: list[Source]
    blocked: bool
    blocked_reason: Optional[Literal["future", "role", "unsupported", "off_topic"]] = None
    archival: Optional[Archival] = None


app = FastAPI(title="Stay Tuned host")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)
# The front end's public-domain media, so /call can play archival clips too.
MEDIA = Path(__file__).parent.parent / "frontend" / "media"
if MEDIA.is_dir():
    app.mount("/media", StaticFiles(directory=MEDIA), name="media")

# Photos people texted to the station (memories.py), for the 2026 personal station.
memories.DIR.mkdir(exist_ok=True)
app.mount("/memories", StaticFiles(directory=memories.DIR), name="memories")


@app.get("/config")
def config():
    """What this copy can do: the public copy (cloud) has no texting."""
    return {"cloud": cloud.CLOUD, "texting": not cloud.CLOUD}


@app.get("/health")
def health():
    return {"ok": True}


@app.on_event("startup")
def _start():
    # Load the embedding model now so the first caller doesn't wait for it.
    retrieval.warm_up()
    photon_imessage.start_in_background()


class Station(BaseModel):
    pack: Pack
    role: Role
    date: Date


@app.get("/station", response_model=Station)
def get_station():
    return station.get()


@app.post("/station", response_model=Station)
def set_station(st: Station):
    """The laptop app calls this whenever the dial moves, so texts reach the right room."""
    return station.tune(st.pack, st.role, st.date)


@app.get("/transcript")
def get_transcript(since: int = 0):
    """Call-ins (texts, later voice) newer than `since`, for the on-screen switchboard."""
    return {"items": station.transcript(since)}


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest, request: Request) -> AskResponse:
    # On the public copy, new (unsaved) answers are rate-limited; saved ones are free.
    if not answer_cache.get(req.question, req.role, req.date, req.pack) and not cloud.allow(request):
        return AskResponse(answer=cloud.BUSY, sources=[], blocked=True, blocked_reason="unsupported")
    try:
        result = host.ask(req.question, req.role, req.date, req.pack)
        return AskResponse(**result, archival=archival.clip_for(result, req.date, req.pack))
    except PackNotFound:
        raise HTTPException(503, f"Story pack {req.pack!r} has no source files yet")
    except Exception:
        log.exception("host failed")
        raise HTTPException(503, "Host unavailable")


@app.post("/voice")
async def call_in(
    request: Request,
    audio: UploadFile = File(...),
    role: Optional[Role] = Form(None),
    date: Optional[Date] = Form(None),
    pack: Optional[Pack] = Form(None),
):
    """Browser-microphone call-in: audio in, spoken cited answer out.

    Role, date and pack default to whatever the radio is tuned to.
    Returns the AskResponse fields plus `question` (what we heard) and
    `audio` (base64 WAV, or null when the browser should speak it).
    """
    if not cloud.allow(request, "voice"):
        raise HTTPException(429, "The switchboard is busy. Try typing one of the demo questions.")
    st = station.get()
    st.update({k: v for k, v in {"role": role, "date": date, "pack": pack}.items() if v})
    data = await audio.read()
    if len(data) < 1000:
        raise HTTPException(400, "Recording too short")
    try:
        question = await run_in_threadpool(voice.transcribe, data, audio.filename or "call.webm")
    except Exception:
        log.exception("speech to text failed")
        raise HTTPException(503, "Couldn't hear that, try again")
    if not question or len(question) < 3:
        return {"question": question, "answer": "Sorry, the line crackled. Could you say that again?",
                "sources": [], "blocked": True, "blocked_reason": "unsupported", "audio": None, **_station_json(st)}
    try:
        result = await run_in_threadpool(host.ask, question, st["role"], st["date"], st["pack"])
    except PackNotFound:
        result = {"answer": "That station isn't on the air yet.", "sources": [], "blocked": True, "blocked_reason": "unsupported"}
    except Exception:
        log.exception("host failed")
        raise HTTPException(503, "Host unavailable")
    station.log_exchange("voice", "laptop mic", question, st, result)
    return {
        "question": question,
        **result,
        "audio": await run_in_threadpool(voice.speak, result["answer"], st["role"], st["date"]),
        "archival": archival.clip_for(result, st["date"], st["pack"]),
        **_station_json(st),
    }


def _station_json(st: dict) -> dict:
    return {"role": st["role"], "date": st["date"].isoformat(), "pack": st["pack"]}


class StationRequest(BaseModel):
    date: Date


@app.post("/stations")
async def any_day_station(req: StationRequest):
    """Tune to any day: builds a time-locked station from Wikipedia (about 2 seconds the
    first time), then the deepagents research team improves it in the background.

    Returns {pack, date, state: "ready", facts, built_by, upgrading?}. Use the returned
    `pack` with /ask, /station and /voice. 404 if Wikipedia has no day-by-day page.
    """
    if not (Date(1900, 1, 1) <= req.date < Date.today()):
        raise HTTPException(422, "Pick a past date from 1900 on")
    try:
        return await run_in_threadpool(wiki_station.ensure, req.date)
    except wiki_source.NoMonthPage as e:
        raise HTTPException(404, str(e))
    except Exception:
        log.exception("station build failed")
        raise HTTPException(503, "Couldn't reach Wikipedia, try again")


@app.get("/stations/{day}")
def any_day_status(day: Date):
    """Whether the station for `day` exists, and whether the agent is still improving it."""
    return wiki_station.status(day)


@app.get("/memories.json")
def list_memories(since: Optional[str] = None):
    """Photos texted to the station, newest first, for the 2026 personal station.

    Each item: {id, image, caption, year, from, received_at, width, height}.
    `image` is a path on this host (e.g. memories/ab12.jpg). Poll with ?since=<received_at>.
    """
    return {"items": memories.all_memories(since)}


@app.get("/knowledge")
def knowledge(pack: Pack, date: Date):
    """What each role could know on this day: the time lock, as numbers for the screen.

    {pack, date, total, roles: {citizen: n, ...}, today: {citizen: n, ...}, later: n}
    `total` is every fact in the pack; `later` is how many are still in the future.
    """
    try:
        facts = load_pack(pack)
    except PackNotFound:
        raise HTTPException(404, f"No story pack {pack!r}")
    roles = {}
    today = {}
    for r in ("citizen", "journalist", "official", "historian"):
        seen = retrieval.visible_facts(facts, r, date)
        roles[r] = len(seen)
        today[r] = sum(1 for f in seen if f.date == date)
    return {
        "pack": pack, "date": date.isoformat(), "total": len(facts),
        "roles": roles, "today": today, "later": sum(1 for f in facts if f.date > date),
    }


class TexterRequest(BaseModel):
    phone: str = Field(min_length=7, max_length=40)


@app.post("/texters")
async def connect_phone(req: TexterRequest):
    """Let a judge text the station: registers their phone with our shared Photon line.

    Returns {text_to, pretty, qr}. `qr` is an SVG QR code that opens Messages to
    `text_to` with a first question filled in. Their full number is never echoed back.
    """
    if cloud.CLOUD:
        raise HTTPException(403, "Texting the station is set up at our judging table.")
    import texters  # needs the Photon keys, so only loaded when used

    try:
        info = await run_in_threadpool(texters.register, req.phone)
    except texters.Refused as e:
        raise HTTPException(422, str(e))
    except Exception:
        log.exception("couldn't register a texter")
        raise HTTPException(503, "Couldn't reach Photon, try again")
    from urllib.parse import quote

    return {"text_to": info["text_to"], "pretty": info["pretty"], "qr": f"/qr?to={quote(info['text_to'], safe='')}"}


@app.get("/qr")
def qr_code(to: str, body: str = "citizen oct 22: are we going to war?"):
    """An SVG QR code that opens Messages to `to` with `body` filled in."""
    import io
    import re as _re
    from urllib.parse import quote

    import qrcode
    import qrcode.image.svg
    from fastapi.responses import Response

    if not _re.fullmatch(r"\+\d{10,15}", to):
        raise HTTPException(422, "to must be a phone number like +16285551234")
    img = qrcode.make(f"sms:{to}&body={quote(body)}", image_factory=qrcode.image.svg.SvgPathImage, box_size=10, border=2)
    buf = io.BytesIO()
    img.save(buf)
    return Response(buf.getvalue(), media_type="image/svg+xml", headers={"Cache-Control": "max-age=3600"})


@app.get("/voice/status")
def voice_status():
    return voice.tts_status()


@app.get("/call")
def call_page():
    """Test page for the microphone call-in. Open http://localhost:8000/call"""
    return FileResponse(Path(__file__).parent / "static" / "call.html")


# The public copy serves the front end itself, from the same address as the API.
# Mounted last, so every API route above takes priority.
FRONTEND = Path(__file__).parent.parent / "frontend"
if cloud.CLOUD and FRONTEND.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")
