"""Stay Tuned host API. Matches CONTRACT.md.

Run: uvicorn app:app --reload --port 8000   (from backend/)
"""
import logging
from datetime import date as Date
from pathlib import Path
from typing import Annotated, Literal, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, StringConstraints

import host
import photon_imessage
import retrieval
import station
import voice
import wiki_station
import wiki_source
from packs import PackNotFound

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


class AskResponse(BaseModel):
    answer: str
    sources: list[Source]
    blocked: bool
    blocked_reason: Optional[Literal["future", "role", "unsupported", "off_topic"]] = None


app = FastAPI(title="Stay Tuned host")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


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
def ask(req: AskRequest) -> AskResponse:
    try:
        return AskResponse(**host.ask(req.question, req.role, req.date, req.pack))
    except PackNotFound:
        raise HTTPException(503, f"Story pack {req.pack!r} has no source files yet")
    except Exception:
        log.exception("host failed")
        raise HTTPException(503, "Host unavailable")


@app.post("/voice")
async def call_in(
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
    return {"question": question, **result, "audio": await run_in_threadpool(voice.speak, result["answer"], st["role"]), **_station_json(st)}


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


@app.get("/voice/status")
def voice_status():
    return voice.tts_status()


@app.get("/call")
def call_page():
    """Test page for the microphone call-in. Open http://localhost:8000/call"""
    return FileResponse(Path(__file__).parent / "static" / "call.html")
