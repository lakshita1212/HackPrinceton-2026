"""Stay Tuned host API. Matches CONTRACT.md.

Run: uvicorn app:app --reload --port 8000   (from backend/)
"""
from datetime import date as Date
from typing import Literal, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

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


# --- Scripted stub. Replaced by retrieval + checker in phase 2. ---

ADDRESS = Source(
    id="cmc-1022-address",
    title="President's address on the Soviet arms buildup in Cuba",
    date=Date(1962, 10, 22),
    citation="John F. Kennedy Presidential Library, televised address, Oct 22, 1962",
    url="https://www.jfklibrary.org/learn/about-jfk/historic-speeches/address-during-the-cuban-missile-crisis",
    kind="archival",
)
ENDING_DATE = Date(1962, 10, 28)
ENDING_WORDS = ("how does it end", "how does this end", "ends", "resolved", "28th", "outcome", "who wins")


def scripted_answer(req: AskRequest) -> AskResponse:
    q = req.question.lower()
    if req.role != "historian" and req.date < ENDING_DATE and any(w in q for w in ENDING_WORDS):
        return AskResponse(
            answer="I can't tell you how this ends. Nobody here knows yet. Turn the dial forward.",
            sources=[],
            blocked=True,
            blocked_reason="future",
        )
    if req.date >= ADDRESS.date:
        return AskResponse(
            answer=(
                "We just heard the President on television. He said there are "
                "offensive missile sites in Cuba and announced a quarantine of ships. "
                "Nobody on our street knows what comes next."
            ),
            sources=[ADDRESS],
            blocked=False,
        )
    return AskResponse(
        answer="I have no verified source for that on this day.",
        sources=[],
        blocked=True,
        blocked_reason="unsupported",
    )


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest) -> AskResponse:
    return scripted_answer(req)
