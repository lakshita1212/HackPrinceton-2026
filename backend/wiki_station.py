"""Build a time-locked station for any day, with a deepagents research team.

  planner      -> runs the steps below, never writes facts itself
  researcher   -> fetch_events: pulls the day and the 3 days before it from Wikipedia
  extractor    -> read_events / add_fact: rewrites each event as a plain, dated fact
  timekeeper   -> list_facts / remove_fact / revise_fact: strips hindsight

Then a code gate drops any fact that still mentions a later year or reads like
hindsight. If the agent fails (rate limits, a bad tool call), the plain-code
cleaner in wiki_source builds the station instead, so a station always comes back.

The result is saved as a normal story pack (packs/wiki-YYYY-MM/<day>.json), so
the fast host answers from it like any other station. Building costs tokens once.

  python wiki_station.py 1975-03-02          build one station from the command line
  python wiki_station.py 1975-03-02 --rules  skip the agent, use the plain-code cleaner
"""
import json
import logging
import os
import threading
from datetime import date, datetime
from pathlib import Path


import wiki_source
from wiki_source import RawEvent, clean_hindsight

log = logging.getLogger("wiki_station")
PACKS = Path(__file__).parent / "packs"
ROLES = ["citizen", "journalist", "historian"]  # public news; no one's secret files

_status: dict[str, dict] = {}
_lock = threading.Lock()


def pack_id(day: date) -> str:
    return f"wiki-{day:%Y-%m}"


def pack_file(day: date) -> Path:
    return PACKS / pack_id(day) / f"{day.isoformat()}.json"


# --- the research team -----------------------------------------------------------

def _research_model():
    from langchain.chat_models import init_chat_model

    """gpt-oss-20b, preferring the teammate key (GROQ_API_KEY_2) to save the demo key's quota."""
    key = os.getenv("GROQ_API_KEY_2") or os.getenv("GROQ_API_KEY")
    return init_chat_model(
        os.getenv("LLM_RESEARCH_MODEL", "groq:openai/gpt-oss-20b"),
        api_key=key, temperature=0, max_retries=3, max_tokens=1500, reasoning_effort="low",
    )


def build_with_agent(day: date) -> list[dict]:
    # Loaded only when the agent runs (WIKI_AGENT on), to keep memory low on small servers.
    from deepagents import create_deep_agent

    import deep_host  # noqa: F401  (registers the slim deepagents profile for Groq)

    raw: dict[str, RawEvent] = {}
    facts: dict[str, dict] = {}

    def fetch_events() -> str:
        """Fetch Wikipedia's events for the station day and the 3 days before it."""
        for e in wiki_source.events_window(day, days_back=3):
            raw[e.id] = e
        days = sorted({e.day.isoformat() for e in raw.values()})
        return f"Fetched {len(raw)} events for days: {', '.join(days)}."

    def read_events(day_iso: str) -> str:
        """Read the raw events for one day (YYYY-MM-DD), with their ids."""
        evs = [e for e in raw.values() if e.day.isoformat() == day_iso]
        return "\n".join(f"[{e.id}] {e.text}" for e in evs) or "No events that day."

    def add_fact(raw_id: str, text: str) -> str:
        """Save one rewritten fact for a raw event id. Skip births and trivia."""
        e = raw.get(raw_id)
        if not e:
            return f"Unknown id {raw_id}."
        facts[raw_id] = {"raw": e, "text": text.strip()}
        return f"Saved {raw_id}."

    def list_facts() -> str:
        """List every saved fact with its id and date."""
        return "\n".join(f"[{i}] ({f['raw'].day}) {f['text']}" for i, f in facts.items()) or "No facts yet."

    def remove_fact(fact_id: str, reason: str) -> str:
        """Remove a fact that can't be fixed."""
        facts.pop(fact_id, None)
        return f"Removed {fact_id}: {reason}"

    def revise_fact(fact_id: str, text: str) -> str:
        """Replace a fact's text with a version that has the hindsight removed."""
        if fact_id not in facts:
            return f"Unknown id {fact_id}."
        facts[fact_id]["text"] = text.strip()
        return f"Revised {fact_id}."

    when = f"{day:%B} {day.day}, {day.year}"
    subagents = [
        {
            "name": "researcher",
            "description": "Fetches the raw Wikipedia events for the station's days.",
            "system_prompt": "Call fetch_events once and report its result.",
            "tools": [fetch_events],
        },
        {
            "name": "extractor",
            "description": "Turns raw events for ONE given day into plain facts. Give it the day as YYYY-MM-DD.",
            "system_prompt": (
                "Call read_events for the day you are given. For each event worth hearing on the "
                "radio that day, call add_fact with its id and one or two plain sentences saying "
                "what happened, as a news report would on that day. Skip births and minor trivia. "
                "Keep names, numbers and places exactly as given. Never add anything not in the "
                "event. Leave out anything that happened later. Then reply 'done'."
            ),
            "tools": [read_events, add_fact],
        },
        {
            "name": "timekeeper",
            "description": f"Checks every saved fact for hindsight about anything after {when}.",
            "system_prompt": (
                f"The station is set to {when}, and listeners only know what was public by then. "
                "Call list_facts. Fix with revise_fact, or remove with remove_fact if nothing is left:\n"
                f"- anything that mentions or hints at something after {when} (a later year, "
                "'would later', 'eventually', what someone became famous for);\n"
                "- anything that was secret or private at the time (internal memos, classified "
                "documents, private meetings) and only came out later.\n"
                "Leave correct facts alone. Then reply 'done'."
            ),
            "tools": [list_facts, remove_fact, revise_fact],
        },
    ]
    planner = (
        f"You build a radio station for {when}. Use the task tool for each step, one at a time:\n"
        "1. Ask the researcher to fetch the events.\n"
        "2. For each day it reports, ask the extractor to process that day (one task per day).\n"
        "3. Ask the timekeeper to check all facts.\n"
        "Then reply 'station ready'. Never write facts yourself."
    )
    agent = create_deep_agent(model=_research_model(), tools=[], system_prompt=planner, subagents=subagents)
    agent.invoke({"messages": [{"role": "user", "content": f"Build the station for {day.isoformat()}."}]},
                 config={"recursion_limit": 60})
    if not facts:
        raise RuntimeError("agent produced no facts")
    return [_fact(f["raw"], f["text"], "agent") for f in facts.values()]


def build_with_rules(day: date) -> list[dict]:
    out = []
    for e in wiki_source.events_window(day, days_back=3):
        if text := clean_hindsight(e.text, day.year):
            out.append(_fact(e, text, "rules"))
    return out


def _fact(e: RawEvent, text: str, built_by: str) -> dict:
    when = f"{e.day:%B} {e.day.day}, {e.day.year}"
    return {
        "id": f"wiki-{e.day:%Y%m%d}-{e.id[-2:]}",
        "date": e.day.isoformat(),
        "roles": ROLES,
        "text": text,
        "quote": None,
        "source": {
            "title": f"Wikipedia: {e.page}, {e.day:%b} {e.day.day}",
            "citation": f'Wikipedia contributors, "{e.page}", events of {when}. CC BY-SA 4.0. '
                        f"Retrieved {date.today():%B %d, %Y}.",
            "url": e.url,
            "kind": "narration",
        },
        "built_by": built_by,
    }


def _gate(facts: list[dict], day: date) -> list[dict]:
    """Code-level time lock: whatever the agent wrote, nothing from after the station's day survives."""
    kept = []
    for f in facts:
        cleaned = clean_hindsight(f["text"], day.year)
        if cleaned and date.fromisoformat(f["date"]) <= day:
            kept.append({**f, "text": cleaned})
        else:
            log.info("gate dropped %s: %s", f["id"], f["text"][:100])
    return kept


# --- building and status ----------------------------------------------------------

def build(day: date, use_agent: bool = True) -> dict:
    """Build (or rebuild) the station for `day`, save it as a pack, and return its summary."""
    facts, built_by = [], "rules"
    if use_agent:
        try:
            facts, built_by = build_with_agent(day), "agent"
        except Exception as e:
            log.warning("research agent failed (%s), using the plain-code cleaner", str(e)[:200])
    if not facts:
        facts = build_with_rules(day)
    facts = _gate(facts, day)
    if not facts:
        raise RuntimeError("no usable events for that day")
    path = pack_file(day)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({
        "pack": pack_id(day),
        "day": day.isoformat(),
        "built_by": built_by,
        "built_at": datetime.now().isoformat(timespec="seconds"),
        "note": "Auto-built from Wikipedia; not reviewed by a historian.",
        "facts": facts,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    return {"pack": pack_id(day), "date": day.isoformat(), "state": "ready", "facts": len(facts), "built_by": built_by}


def status(day: date) -> dict:
    with _lock:
        if s := _status.get(day.isoformat()):
            return dict(s)
    if pack_file(day).exists():
        data = json.loads(pack_file(day).read_text(encoding="utf-8"))
        return {"pack": pack_id(day), "date": day.isoformat(), "state": "ready",
                "facts": len(data["facts"]), "built_by": data.get("built_by")}
    return {"pack": pack_id(day), "date": day.isoformat(), "state": "missing"}


def ensure(day: date) -> dict:
    """Make sure a station exists for `day`.

    The first time, it is built right away with the plain-code cleaner (about 2 seconds),
    so a caller can ask questions immediately. Then, unless WIKI_AGENT=off, the
    deepagents research team rebuilds it in the background (about 2 minutes) and
    replaces the file. Raises NoMonthPage if Wikipedia has no day-by-day page.
    """
    s = status(day)
    if s["state"] != "missing":
        return s
    try:
        s = build(day, use_agent=False)
    except wiki_source.NoMonthPage:
        raise
    if os.getenv("WIKI_AGENT", "on").lower() != "off":
        with _lock:
            _status[day.isoformat()] = {**s, "upgrading": True}

        def upgrade():
            try:
                result = build(day, use_agent=True)
            except Exception as e:
                log.warning("agent upgrade failed for %s: %s", day, str(e)[:200])
                result = status_from_file(day)
            with _lock:
                _status.pop(day.isoformat(), None)
            log.info("station %s now built by %s", day, result.get("built_by"))

        threading.Thread(target=upgrade, daemon=True).start()
    return status(day)


def status_from_file(day: date) -> dict:
    with _lock:
        _status.pop(day.isoformat(), None)
    return status(day)


if __name__ == "__main__":
    import sys
    import time

    logging.basicConfig(level=logging.INFO, format="%(name)s: %(message)s")
    for name in ("httpx", "groq._base_client"):
        logging.getLogger(name).setLevel(logging.WARNING)
    d = date.fromisoformat(sys.argv[1])
    t = time.perf_counter()
    print(build(d, use_agent="--rules" not in sys.argv), f"{time.perf_counter() - t:.0f}s")
    for f in json.loads(pack_file(d).read_text(encoding="utf-8"))["facts"]:
        print(f"  {f['date']} {f['text'][:150]}")
