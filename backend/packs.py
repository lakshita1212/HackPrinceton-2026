"""Load story pack facts from backend/packs/<pack>/*.json.

Each file holds {"facts": [...]} in the format from the research prompt.
Files are re-read automatically when they change, so new days show up
without restarting the server.
"""
import json
import logging
import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path

log = logging.getLogger("packs")

ROLES = {"citizen", "journalist", "official", "historian"}


def packs_dir() -> Path:
    return Path(os.getenv("PACKS_DIR") or Path(__file__).parent / "packs")


@dataclass(frozen=True)
class Fact:
    id: str
    date: date
    roles: frozenset
    text: str
    quote: str | None
    title: str
    citation: str
    url: str | None
    kind: str

    def as_source(self) -> dict:
        """The Source shape from CONTRACT.md."""
        return {
            "id": self.id,
            "title": self.title,
            "date": self.date.isoformat(),
            "citation": self.citation,
            "url": self.url,
            "kind": self.kind,
        }


class PackNotFound(Exception):
    pass


_cache: dict[str, tuple[tuple, list[Fact]]] = {}


def _parse(raw: dict) -> Fact:
    src = raw["source"]
    roles = frozenset(raw["roles"]) & ROLES
    if not roles:
        raise ValueError("no valid roles")
    kind = src.get("kind", "narration")
    return Fact(
        id=raw["id"],
        date=date.fromisoformat(raw["date"]),
        roles=roles,
        text=raw["text"].strip(),
        quote=raw.get("quote") or None,
        title=src["title"],
        citation=src["citation"],
        url=src.get("url") or None,
        kind=kind if kind in ("archival", "narration") else "narration",
    )


def load_pack(pack: str) -> list[Fact]:
    folder = packs_dir() / pack
    files = sorted(folder.glob("*.json"))
    if not files:
        raise PackNotFound(pack)

    signature = tuple((f.name, f.stat().st_mtime_ns) for f in files)
    cached = _cache.get(pack)
    if cached and cached[0] == signature:
        return cached[1]

    facts: dict[str, Fact] = {}
    for f in files:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            log.warning("skipping %s: bad JSON (%s)", f.name, e)
            continue
        for raw in data.get("facts", []):
            try:
                fact = _parse(raw)
            except (KeyError, ValueError, TypeError) as e:
                log.warning("skipping fact %s in %s: %s", raw.get("id"), f.name, e)
                continue
            if fact.id in facts:
                log.warning("duplicate fact id %s in %s, keeping the first", fact.id, f.name)
                continue
            facts[fact.id] = fact

    result = list(facts.values())
    _cache[pack] = (signature, result)
    log.info("loaded %d facts for %s from %d files", len(result), pack, len(files))
    return result
