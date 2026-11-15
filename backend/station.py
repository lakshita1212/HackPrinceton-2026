"""What the radio is tuned to, and a log of call-ins for the laptop screen.

The laptop app POSTs /station whenever the dial moves. Texts (and later voice)
are answered by whichever role and day the radio is on, unless the message
names its own, e.g. "official oct 16: what's happening?".
"""
import re
import threading
import time
from collections import deque
from datetime import date

ROLES = ("citizen", "journalist", "official", "historian")
PACK_YEARS = {"cmc-1962": 1962, "apollo-1969": 1969, "berlin-1989": 1989}

_lock = threading.Lock()
_current = {"pack": "cmc-1962", "role": "citizen", "date": date(1962, 10, 22)}
_log: deque = deque(maxlen=50)
_seq = 0


def get() -> dict:
    with _lock:
        return dict(_current)


def tune(pack: str, role: str, day: date) -> dict:
    with _lock:
        _current.update(pack=pack, role=role, date=day)
        return dict(_current)


_MONTHS = {"jul": 7, "july": 7, "oct": 10, "october": 10, "nov": 11, "november": 11}
_ROLE_RE = re.compile(r"^\s*(citizen|journalist|official|historian)\b[\s:,\-]*", re.I)
_DATE_RE = re.compile(
    r"^\s*(?:(jul|july|oct|october|nov|november)\.?\s+(\d{1,2})|(\d{1,2})/(\d{1,2}))\b[\s:,\-]*", re.I
)


def parse_overrides(text: str, station: dict) -> tuple[str, dict]:
    """Strip a leading role and/or date from a message.

    "official oct 16: what's happening?" -> ("what's happening?", station with
    role=official, date=1962-10-16). Anything not given comes from `station`.
    """
    st = dict(station)
    year = PACK_YEARS.get(st["pack"], st["date"].year)
    for _ in range(2):  # role and date in either order
        if m := _ROLE_RE.match(text):
            st["role"] = m.group(1).lower()
            text = text[m.end():]
        elif m := _DATE_RE.match(text):
            month = _MONTHS[m.group(1).lower()] if m.group(1) else int(m.group(3))
            day = int(m.group(2) or m.group(4))
            try:
                st["date"] = date(year, month, day)
            except ValueError:
                pass
            text = text[m.end():]
    return text.strip(), st


def log_exchange(channel: str, caller: str, question: str, st: dict, result: dict) -> None:
    global _seq
    with _lock:
        _seq += 1
        _log.append({
            "seq": _seq,
            "at": time.time(),
            "channel": channel,
            "caller": caller,
            "question": question,
            "pack": st["pack"],
            "role": st["role"],
            "date": st["date"].isoformat(),
            **result,
        })


def transcript(since: int = 0) -> list[dict]:
    with _lock:
        return [e for e in _log if e["seq"] > since]
