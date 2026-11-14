"""The time-locked host: question in, cited in-character answer out.

  1. Rule check     block "how does it end" questions before the pack's last day
  2. Retrieval      only facts dated on or before the station's day, allowed for the role
  3. Draft          answer built only from those facts, citing their ids
  4. Checker        a second model call rejects unsupported or future claims
  5. Retry once     with the checker's notes, then refuse honestly
"""
import logging
import re
from datetime import date

from pydantic import BaseModel, Field

from llm import get_model
from packs import Fact
from retrieval import search

log = logging.getLogger("host")

# The day each pack's story resolves. Before it, nobody but the historian knows the ending.
PACK_END = {"cmc-1962": date(1962, 10, 28)}

PERSONAS = {
    "citizen": (
        "an ordinary American living in the suburbs with your family. You know only what "
        "was on TV and radio, in the newspapers, and what neighbors are saying. You are "
        "worried and speak plainly, like a parent at the kitchen table."
    ),
    "journalist": (
        "a Washington newspaper reporter. You know official statements, press briefings "
        "and what other outlets are reporting. You are sharp, a little tired, and careful "
        "to separate what is confirmed from what is rumor."
    ),
    "official": (
        "a composite State Department official (not any real person) who sits in on some "
        "of the government's crisis meetings. You know the intelligence and the options "
        "being debated. You are tense, measured and speak in short sentences."
    ),
    "historian": (
        "a present-day historian of the Cold War. You know the full record with hindsight, "
        "including what was revealed decades later. You are calm and explain why things "
        "happened, and how what people knew at the time differed from what we know now."
    ),
}

REFUSAL = {
    "future": "Nobody here knows how this ends yet. If you want to find out, turn the dial forward.",
    "unsupported": "I don't have a verified source on that, so I won't guess.",
}

_ENDING = re.compile(
    r"how (does|will|did) (it|this|the crisis|all this) end"
    r"|how .* (ends?|turns? out)\b"
    r"|what happens (next|after|later|in the end)"
    r"|\b(outcome|resolution)\b"
    r"|\bwho (wins|won|backs? down)\b"
    r"|\bis (it|the crisis) (over|resolved)\b",
    re.IGNORECASE,
)
_DAY_MENTION = re.compile(r"\b(?:oct(?:ober)?\.?\s+)?(\d{1,2})(?:st|nd|rd|th)\b|\boct(?:ober)?\.?\s+(\d{1,2})\b", re.IGNORECASE)


def asks_about_future(question: str, role: str, day: date, pack: str) -> bool:
    end = PACK_END.get(pack)
    if role == "historian" or end is None or day >= end:
        return False
    if _ENDING.search(question):
        return True
    # "what happens on the 28th?" asked on the 22nd
    for m in _DAY_MENTION.finditer(question):
        n = int(m.group(1) or m.group(2))
        if day.day < n <= 31:
            return True
    return False


class Draft(BaseModel):
    answer: str = Field(description="What you say, 2 to 4 short spoken sentences.")
    source_ids: list[str] = Field(description="Ids of every fact the answer relies on.")


class Verdict(BaseModel):
    ok: bool = Field(description="True only if every claim is supported and nothing is from after the date.")
    problems: list[str] = Field(description="Each unsupported, future or invented claim. Empty if ok.")


def _facts_block(facts: list[Fact]) -> str:
    lines = []
    for f in facts:
        line = f"[{f.id}] ({f.date.isoformat()}) {f.text}"
        if f.quote:
            line += f' Verbatim quote you may use: "{f.quote}"'
        lines.append(line)
    return "\n".join(lines)


def _draft(question: str, role: str, day: date, facts: list[Fact], notes: list[str]) -> Draft:
    today = f"{day:%B} {day.day}, {day.year}"
    time_rule = (
        "You may use hindsight, but only what the facts below say."
        if role == "historian"
        else f"It is {today}. You do not know anything that happens after today. "
        "Never hint at how events turn out."
    )
    system = (
        f"You are {PERSONAS[role]}\n"
        f"{time_rule}\n"
        "Answer the caller using ONLY the facts below. If they don't answer the question, "
        "say honestly that you haven't heard anything about that. Never invent names, "
        "numbers, events or quotes. Only quote words that appear as a verbatim quote below. "
        "Speak naturally in first person, 2 to 4 short sentences, no lists, no fact ids in the text. "
        "List the ids of every fact you used in source_ids.\n\n"
        f"FACTS:\n{_facts_block(facts)}"
    )
    if notes:
        system += "\n\nYour last answer was rejected for these problems. Fix them:\n- " + "\n- ".join(notes)
    model = get_model(temperature=0.3).with_structured_output(Draft)
    return model.invoke([("system", system), ("user", question)])


def _check(answer: str, role: str, day: date, facts: list[Fact]) -> Verdict:
    time_rule = (
        "The speaker is a present-day historian, so hindsight is allowed."
        if role == "historian"
        else f"The speaker lives on {day.isoformat()} and must not reveal anything after that date."
    )
    system = (
        "You are a strict fact checker for a history education app. "
        f"{time_rule} Check the ANSWER against the FACTS. Mark ok=false if the answer "
        "states anything not supported by the facts, reveals or hints at events after the "
        "date, or quotes words that aren't a verbatim quote in the facts. Feelings, "
        "uncertainty and 'I don't know' are fine.\n\n"
        f"FACTS:\n{_facts_block(facts)}"
    )
    model = get_model(temperature=0).with_structured_output(Verdict)
    return model.invoke([("system", system), ("user", f"ANSWER:\n{answer}")])


def _blocked(reason: str) -> dict:
    return {"answer": REFUSAL[reason], "sources": [], "blocked": True, "blocked_reason": reason}


def ask(question: str, role: str, day: date, pack: str) -> dict:
    """Returns the AskResponse fields from CONTRACT.md."""
    if asks_about_future(question, role, day, pack):
        return _blocked("future")

    facts = search(pack, role, day, question)
    if not facts:
        return _blocked("unsupported")
    by_id = {f.id: f for f in facts}

    notes: list[str] = []
    for attempt in range(2):
        draft = _draft(question, role, day, facts, notes)
        used = [by_id[i] for i in dict.fromkeys(draft.source_ids) if i in by_id]
        if not used:
            return _blocked("unsupported")
        verdict = _check(draft.answer, role, day, used)
        if verdict.ok:
            return {
                "answer": draft.answer,
                "sources": [f.as_source() for f in used],
                "blocked": False,
                "blocked_reason": None,
            }
        log.info("checker rejected attempt %d: %s", attempt + 1, verdict.problems)
        notes = verdict.problems or ["The answer contained unsupported claims."]

    return _blocked("unsupported")
