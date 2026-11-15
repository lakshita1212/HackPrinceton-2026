"""The 2026 TV news bulletin: this week's headlines, read by an AI anchor.

The script is written by code from the station's facts (no language model), so
it can't invent anything, and each headline keeps its source. It's voiced once
with Groq's Orpheus and saved, so replays are free and work offline. The TV
labels it "AI narration", because it isn't a real broadcast.
"""
import json
import logging
import re
from datetime import date
from pathlib import Path

import numpy as np

import era_sound
import voice
from packs import load_pack

log = logging.getLogger("bulletin")
DIR = Path(__file__).parent / "cache" / "bulletins"
ANCHOR = "austin"
GAP = 0.45  # seconds of quiet between headlines
MAX_ITEMS = 6


# Leftovers from Wikipedia year pages: a date-range tail ("14 – ") and a topic label
# ("2026 FAA ground stop: "), neither of which an anchor would read out.
_LEADING = re.compile(r"^(\d{1,2}\s*[–-]\s*)?([A-Z0-9][^:.]{2,60}:\s+)?(?=[A-Z])")


def _first_sentences(text: str, limit: int = 220) -> str:
    """Enough of a fact to read aloud: whole sentences, up to about `limit` characters."""
    text = _LEADING.sub("", text.strip(), count=1)
    out = ""
    for s in re.split(r"(?<=[.!?])\s+", text.strip()):
        if out and len(out) + len(s) > limit:
            break
        out = f"{out} {s}".strip()
    return out


def script(pack: str, day: date) -> tuple[list[dict], list[str]]:
    """Headlines (newest first, like a newscast) and the lines the anchor reads."""
    facts = sorted((f for f in load_pack(pack) if f.date <= day and not f.text.startswith("Died:")),
                   key=lambda f: (f.date, f.id), reverse=True)[:MAX_ITEMS]
    items = [{"id": f.id, "date": f.date.isoformat(), "text": _first_sentences(f.text), "source": f.as_source()}
             for f in facts]
    lines = [f"Good evening. This is Stay Tuned, with the news through {day:%A}, {day:%B} {day.day}."]
    lines += [f"{date.fromisoformat(it['date']):%A}: {it['text']}" for it in items]
    lines.append("That's the news. Stay tuned.")
    return items, lines


def build(pack: str, day: date) -> dict:
    """The bulletin for a station: {items, lines, segments, audio, label}. Cached on disk.

    `segments[k]` is when line k is spoken (seconds), with `item` = the headline it reads
    (None for the opening and closing). `audio` is None if the voice wasn't available;
    the browser then reads `lines` itself.
    """
    DIR.mkdir(parents=True, exist_ok=True)
    name = f"{pack}_{day.isoformat()}"
    meta_path, wav_path = DIR / f"{name}.json", DIR / f"{name}.wav"
    if meta_path.exists():
        return json.loads(meta_path.read_text(encoding="utf-8"))

    items, lines = script(pack, day)
    segments, chunks, rate, t = [], [], 24000, 0.0
    for k, line in enumerate(lines):
        spoken = voice.speak_raw(line, ANCHOR)
        if not spoken:  # no voice (quota or outage): the browser will read it instead
            segments, chunks = [], []
            break
        audio, rate = era_sound._pcm(spoken)
        chunks += [audio, np.zeros(int(GAP * rate), dtype=np.float32)]
        segments.append({"start": round(t, 2), "end": round(t + len(audio) / rate, 2),
                         "item": k - 1 if 0 < k <= len(items) else None})
        t += len(audio) / rate + GAP

    result = {"pack": pack, "date": day.isoformat(), "items": items, "lines": lines,
              "segments": segments, "audio": None, "label": "AI narration · from Wikipedia"}
    if chunks:
        wav_path.write_bytes(era_sound._wav(np.concatenate(chunks), rate))
        result["audio"] = f"bulletin-audio/{wav_path.name}"
        meta_path.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    return result
