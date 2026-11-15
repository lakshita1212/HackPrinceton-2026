"""Fetch Wikipedia's day-by-day month pages ("October 1962", "March 1975").

Each month page lists events under headings like "== October 22, 1962 (Monday) ==".
This module only fetches and splits them, plus a plain-code hindsight cleaner
used when the AI research agent isn't available. Pages are cached on disk so a
month is fetched once.

Wikipedia text is CC BY-SA 4.0; every fact we make from it cites and links the page.
"""
import calendar
import os
import re
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import httpx

CACHE = Path(__file__).parent / "cache" / "wiki"
API = "https://en.wikipedia.org/w/api.php"
# Wikimedia's bot policy asks automated clients to identify themselves with a
# way to reach the project: we give the public repo (override with WIKI_CONTACT).
HEADERS = {
    "User-Agent": "StayTuned/0.1 ({}) python-httpx".format(
        os.getenv("WIKI_CONTACT", "https://github.com/lakshita1212/HackPrinceton-2026")
    )
}

_HEADING = re.compile(r"^==\s*([A-Z][a-z]+ \d{1,2}, \d{4})\s*(\([A-Za-z]+\))?\s*==\s*$", re.M)


@dataclass
class RawEvent:
    id: str
    day: date
    text: str
    page: str  # e.g. "October 1962"

    @property
    def url(self) -> str:
        anchor = f"{self.day:%B}_{self.day.day},_{self.day.year}_({self.day:%A})"
        return f"https://en.wikipedia.org/wiki/{self.page.replace(' ', '_')}#{anchor}"


class NoMonthPage(Exception):
    pass


def page_title(year: int, month: int) -> str:
    return f"{calendar.month_name[month]} {year}"


def fetch_month(year: int, month: int) -> str:
    title = page_title(year, month)
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{title.replace(' ', '_')}.txt"
    if path.exists():
        return path.read_text(encoding="utf-8")
    r = httpx.get(
        API,
        params={"action": "query", "prop": "extracts", "explaintext": 1, "titles": title,
                "format": "json", "redirects": 1},
        headers=HEADERS,
        timeout=30,
    )
    r.raise_for_status()
    page = next(iter(r.json()["query"]["pages"].values()))
    text = page.get("extract") or ""
    if "missing" in page or page.get("title") != title or not _HEADING.search(text):
        raise NoMonthPage(f"Wikipedia has no day-by-day page for {title}")
    path.write_text(text, encoding="utf-8")
    return text


def _to_iso(s: str) -> str:
    month_name, rest = s.split(" ", 1)
    day_s, year_s = rest.replace(",", "").split()
    return f"{int(year_s):04d}-{list(calendar.month_name).index(month_name):02d}-{int(day_s):02d}"


def split_days(text: str, title: str) -> dict[date, list[RawEvent]]:
    """Events per day, in page order."""
    days: dict[date, list[RawEvent]] = {}
    matches = list(_HEADING.finditer(text))
    for i, m in enumerate(matches):
        try:
            d = date.fromisoformat(_to_iso(m.group(1)))
        except ValueError:
            continue
        body = text[m.end(): matches[i + 1].start() if i + 1 < len(matches) else len(text)]
        lines = [ln.strip() for ln in body.split("\n") if ln.strip() and not ln.startswith("=")]
        days[d] = [RawEvent(f"{d:%m%d}-{n + 1:02d}", d, ln, title) for n, ln in enumerate(lines)]
    return days


def events_window(station_day: date, days_back: int = 3) -> list[RawEvent]:
    """Events from station_day - days_back through station_day (may span two month pages)."""
    start = station_day - timedelta(days=days_back)
    out: list[RawEvent] = []
    for y, m in sorted({(start.year, start.month), (station_day.year, station_day.month)}):
        try:
            days = split_days(fetch_month(y, m), page_title(y, m))
        except NoMonthPage:
            if (y, m) == (station_day.year, station_day.month):
                raise
            continue
        out += [e for d, evs in days.items() if start <= d <= station_day for e in evs]
    return sorted(out, key=lambda e: (e.day, e.id))


# --- Plain-code hindsight cleaner: the fallback when the AI agent isn't available ---

_HINDSIGHT = re.compile(
    r"\b(went on to|later (became|served|won|died|founded)|eventually|in retrospect|best known (for|as)|"
    r"(a|one|two|three|several|many|\d+) (days?|weeks?|months?|years?|decades?) later|"
    r"(years|decades) later|the following year|until (his|her) death)\b",
    re.I,
)
# "would" in Wikipedia's past-tense narrative usually means hindsight ("he would declare
# himself emperor"), except in reported speech ("Kennedy warned that any launch would...").
_WOULD = re.compile(r"\bwould\b", re.I)
_REPORTED = re.compile(
    r"\b(said|says|warned|announced|promised|declared|stated|claimed|threatened|that)\b[^.]{0,80}$", re.I
)
_YEAR = re.compile(r"\b(1[5-9]\d\d|20\d\d)\b")
_YEAR_PAREN = re.compile(r"\([^)]*\b(1[5-9]\d\d|20\d\d)\b[^)]*\)")
_SENTENCE = re.compile(r"(?<=[.!?;])\s+(?=[A-Z\"])")


def _hindsight(sentence: str, station_year: int) -> bool:
    if _HINDSIGHT.search(sentence):
        return True
    if any(int(y) > station_year for y in _YEAR.findall(sentence)):
        return True
    return any(not _REPORTED.search(sentence[: m.start()]) for m in _WOULD.finditer(sentence))


def clean_hindsight(text: str, station_year: int) -> str | None:
    """Drop sentences that reveal the future. Returns None if nothing usable is left."""
    if text.startswith("Born:"):
        return None  # a newborn is only notable because of later fame
    text = _YEAR_PAREN.sub(lambda m: m.group(0) if int(m.group(1)) <= station_year else "", text)
    kept = [s for s in _SENTENCE.split(text) if not _hindsight(s, station_year)]
    out = re.sub(r"\s{2,}", " ", " ".join(kept)).strip()
    return out if len(out) > 30 else None


if __name__ == "__main__":
    import sys

    d = date.fromisoformat(sys.argv[1] if len(sys.argv) > 1 else "1962-10-22")
    for e in events_window(d):
        c = clean_hindsight(e.text, d.year)
        print(f"{e.day} {e.id} {'KEEP' if c else 'DROP'}: {(c or e.text)[:140]}")
