"""Remember checked answers so repeat questions are instant and free.

Groq's free tier caps tokens per minute and per day. During judging, many
judges ask the same few questions, so a checked answer is saved and reused for
the same question, role, day and pack. Saved to cache/answers.json so it
survives restarts; warm it before judging with: python warm_cache.py

Only real answers are cached. Refusals for lack of a source are not, so a
later try can still succeed. Delete cache/answers.json after changing packs.
"""
import json
import logging
import re
import threading
from pathlib import Path

log = logging.getLogger("cache")
PATH = Path(__file__).parent / "cache" / "answers.json"
_lock = threading.Lock()
_data: dict[str, dict] | None = None


def _key(question: str, role: str, day, pack: str) -> str:
    q = re.sub(r"[^a-z0-9 ]", "", question.lower())
    q = re.sub(r"\s+", " ", q).strip()
    return f"{pack}|{role}|{day}|{q}"


# Saved demo answers committed to the repo, for a fresh server with no cache yet
# (the public copy on Render). Refresh after warm_cache.py: copy cache/answers.json here.
SEED = Path(__file__).parent / "demo_answers.json"


def _load() -> dict:
    global _data
    if _data is None:
        for source in (PATH, SEED):
            try:
                _data = json.loads(source.read_text(encoding="utf-8"))
                break
            except (FileNotFoundError, json.JSONDecodeError):
                continue
        else:
            _data = {}
    return _data


def get(question: str, role: str, day, pack: str) -> dict | None:
    with _lock:
        hit = _load().get(_key(question, role, day, pack))
    if hit:
        log.info("cache hit: %s / %s / %s", role, day, question[:60])
    return dict(hit) if hit else None


def put(question: str, role: str, day, pack: str, result: dict) -> None:
    if result.get("blocked") and result.get("blocked_reason") != "future":
        return
    with _lock:
        data = _load()
        data[_key(question, role, day, pack)] = result
        PATH.parent.mkdir(exist_ok=True)
        tmp = PATH.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(PATH)
