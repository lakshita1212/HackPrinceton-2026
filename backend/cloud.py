"""Protections for the public copy on Hugging Face Spaces (CLOUD=1).

The judging-table laptop runs everything. The public link is a bonus, so it must
never be able to hurt the demo:
  - texting the station stays on the laptop (no Photon keys here, and the
    "connect my phone" card is turned off), so texts never get two replies
  - new answers are rate-limited per visitor and per day; saved answers
    (the demo questions in warm_cache.py) are always free and unlimited
  - it runs on its own Groq key, so the laptop's quota is untouched
"""
import os
import threading
import time
from collections import defaultdict, deque

from fastapi import Request

CLOUD = os.getenv("CLOUD", "").lower() in ("1", "true", "yes", "on")

PER_VISITOR_HOUR = int(os.getenv("CLOUD_PER_VISITOR_HOUR", "20"))
PER_DAY = int(os.getenv("CLOUD_PER_DAY", "150"))
VOICE_PER_VISITOR_HOUR = int(os.getenv("CLOUD_VOICE_PER_VISITOR_HOUR", "8"))

BUSY = (
    "The switchboard is busy right now. This public copy limits new questions; "
    "try one of the questions from our demo, or catch us at the judging table."
)

_lock = threading.Lock()
_visitors: dict[tuple, deque] = defaultdict(deque)
_day: deque = deque()


def visitor(request: Request) -> str:
    """The caller's IP. Behind Hugging Face's proxy, it's the first X-Forwarded-For entry."""
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() or (request.client.host if request.client else "?")


def allow(request: Request, kind: str = "ask") -> bool:
    """Count one new (uncached) request. Always True when not in the cloud."""
    if not CLOUD:
        return True
    now = time.time()
    limit = VOICE_PER_VISITOR_HOUR if kind == "voice" else PER_VISITOR_HOUR
    with _lock:
        mine = _visitors[(visitor(request), kind)]
        while mine and now - mine[0] > 3600:
            mine.popleft()
        while _day and now - _day[0] > 86400:
            _day.popleft()
        if len(mine) >= limit or len(_day) >= PER_DAY:
            return False
        mine.append(now)
        _day.append(now)
        return True
