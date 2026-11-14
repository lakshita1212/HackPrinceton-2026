"""Stay Tuned host API. Matches CONTRACT.md.

Run: uvicorn app:app --reload --port 8000   (from backend/)
"""
import logging
from datetime import date as Date
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import host
import retrieval
from packs import PackNotFound

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("app")

Role = Literal["citizen", "journalist", "official", "historian"]
Pack = Literal["cmc-1962", "apollo-1969", "berlin-1989"]


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
def _warm_up():
    # Load the embedding model now so the first caller doesn't wait for it.
    retrieval.warm_up()


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest) -> AskResponse:
    try:
        return AskResponse(**host.ask(req.question, req.role, req.date, req.pack))
    except PackNotFound:
        raise HTTPException(503, f"Story pack {req.pack!r} has no source files yet")
    except Exception:
        log.exception("host failed")
        raise HTTPException(503, "Host unavailable")
