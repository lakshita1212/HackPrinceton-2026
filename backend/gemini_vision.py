"""Google Gemini looks at the photos people text to the station.

For each memory photo it returns, as structured JSON:
  pins      objects worth a pinned caption, each with a short label and its
            position in the photo (the "pinned captions" an archivist would add)
  alt_text  a description for people using screen readers
  era_guess what decade the scene looks like, and why (always labeled a guess)

Gemini is told to describe objects and setting only, never to identify people.
If it fails or is slow, the memory still goes on the air without these.
"""
import base64
import json
import logging
import os

import httpx
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger("gemini_vision")

MODEL = os.getenv("GEMINI_VISION_MODEL", "gemini-3-flash-preview")
API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

PROMPT = """You are an archivist annotating a personal photo for a family history radio station.
The sender's caption, if any: "{caption}"

Return JSON with:
- "pins": 3 to 6 distinct objects or places in the photo worth a pinned caption
  (furniture, a TV, a sign, a whiteboard, food, a window, the view). For each:
  "label" (2 to 5 words, lowercase, like "the rotary phone") and
  "box_2d" [ymin, xmin, ymax, xmax] on a 0-1000 scale.
- "alt_text": one or two plain sentences describing the scene for a screen reader.
- "era_guess": the decade the scene looks like, e.g. "1970s" or "2020s".
- "era_reason": the visible clues for that guess, in one short sentence.

Never identify, name or guess anything about specific people (identity, age,
ethnicity, health). People may be described only as "a person" or "a group of
people". Describe objects and setting only. Use only what is visible."""

SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "pins": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "label": {"type": "STRING"},
                    "box_2d": {"type": "ARRAY", "items": {"type": "INTEGER"}},
                },
                "required": ["label", "box_2d"],
            },
        },
        "alt_text": {"type": "STRING"},
        "era_guess": {"type": "STRING"},
        "era_reason": {"type": "STRING"},
    },
    "required": ["pins", "alt_text", "era_guess", "era_reason"],
}


def analyze(jpeg: bytes, caption: str = "", timeout: float = 25) -> dict | None:
    """Pins (x, y as 0-1 fractions of width and height), alt text and an era guess, or None."""
    key = os.getenv("GOOGLE_API_KEY")
    if not key:
        return None
    body = {
        "contents": [{"parts": [
            {"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(jpeg).decode()}},
            {"text": PROMPT.format(caption=(caption or "").replace('"', "'")[:200])},
        ]}],
        "generationConfig": {"responseMimeType": "application/json", "responseSchema": SCHEMA, "temperature": 0.2},
    }
    try:
        r = httpx.post(API.format(model=MODEL), params={"key": key}, json=body, timeout=timeout)
        r.raise_for_status()
        parts = r.json()["candidates"][0]["content"]["parts"]
        data = json.loads("".join(p.get("text", "") for p in parts))
    except Exception as e:
        log.warning("Gemini couldn't analyze the photo: %s", str(e)[:200])
        return None

    pins = []
    for p in data.get("pins", [])[:6]:
        box = p.get("box_2d") or []
        if len(box) != 4 or not p.get("label"):
            continue
        ymin, xmin, ymax, xmax = (max(0, min(1000, int(v))) for v in box)
        pins.append({
            "label": p["label"].strip()[:40],
            "x": round((xmin + xmax) / 2000, 3),  # center, as a fraction of the width
            "y": round((ymin + ymax) / 2000, 3),
            "box": [round(v / 1000, 3) for v in (xmin, ymin, xmax, ymax)],  # left, top, right, bottom
        })
    return {
        "pins": pins,
        "alt_text": (data.get("alt_text") or "").strip(),
        "era_guess": (data.get("era_guess") or "").strip(),
        "era_reason": (data.get("era_reason") or "").strip(),
        "model": MODEL,
    }
