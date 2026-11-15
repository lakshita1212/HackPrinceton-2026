"""Text your memory to the station: photos sent over iMessage become the 2026 personal station.

Someone texts a photo (with or without a caption) to the station's Photon line.
It is saved as a JPEG with its caption and shows up on the laptop's 2026 dial
position (GET /memories). Texting DELETE takes down your latest memory.

Photos live in backend/memories/ (not committed: they are people's own photos).
A caption that mentions a year ("Grandma's kitchen, 1969") sets the memory's year.
"""
import io
import json
import re
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path

import pillow_heif
from PIL import Image, ImageOps

import gemini_vision

pillow_heif.register_heif_opener()  # iPhone photos arrive as HEIC

DIR = Path(__file__).parent / "memories"
INDEX = DIR / "index.json"
_lock = threading.Lock()

# Photos waiting for a caption, by sender handle: (memory id, time received)
_awaiting_caption: dict[str, tuple[str, float]] = {}
CAPTION_WINDOW = 10 * 60  # seconds


def _load() -> list[dict]:
    try:
        return json.loads(INDEX.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _save(items: list[dict]) -> None:
    DIR.mkdir(exist_ok=True)
    tmp = INDEX.with_suffix(".tmp")
    tmp.write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(INDEX)


def _year(caption: str) -> int | None:
    years = [int(y) for y in re.findall(r"\b(19\d\d|20[0-2]\d)\b", caption or "")]
    return years[0] if years else None


def add_photo(image_bytes: bytes, sender: str, caption: str | None) -> dict:
    """Save a photo as a memory. Without a caption, it waits for the sender's next text."""
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes))).convert("RGB")
    img.thumbnail((1600, 1600))
    mid = uuid.uuid4().hex[:12]
    DIR.mkdir(exist_ok=True)
    jpeg = io.BytesIO()
    img.save(jpeg, "JPEG", quality=85)
    (DIR / f"{mid}.jpg").write_bytes(jpeg.getvalue())
    # Gemini pins captions on the objects in the photo, writes alt text and guesses the era.
    vision = gemini_vision.analyze(jpeg.getvalue(), caption or "") or {}
    memory = {
        "id": mid,
        "image": f"memories/{mid}.jpg",
        "caption": (caption or "").strip(),
        "year": _year(caption or ""),
        "from": "•••" + sender[-4:] if len(sender) > 4 else "•••",
        "sender": sender,  # kept server-side so only the sender can delete it; never returned
        "received_at": datetime.now().isoformat(timespec="seconds"),
        "width": img.width,
        "height": img.height,
        "pins": vision.get("pins", []),  # [{label, x, y, box}], x/y as fractions of width/height
        "alt_text": vision.get("alt_text", ""),
        "era_guess": vision.get("era_guess", ""),
        "era_reason": vision.get("era_reason", ""),
        "annotated_by": vision.get("model"),  # None if Gemini wasn't available
    }
    with _lock:
        items = _load()
        items.append(memory)
        _save(items)
        if not memory["caption"]:
            _awaiting_caption[sender] = (mid, time.time())
    return public(memory)


def waiting_for_caption(sender: str) -> bool:
    entry = _awaiting_caption.get(sender)
    return bool(entry and time.time() - entry[1] < CAPTION_WINDOW)


def set_caption(sender: str, caption: str) -> dict | None:
    """Attach `caption` to the sender's photo that is waiting for one ("skip" leaves it blank)."""
    with _lock:
        entry = _awaiting_caption.pop(sender, None)
        if not entry:
            return None
        items = _load()
        for m in items:
            if m["id"] == entry[0]:
                if caption.strip().lower() not in ("skip", "no", "none"):
                    m["caption"] = caption.strip()[:280]
                    m["year"] = _year(caption)
                _save(items)
                return public(m)
    return None


def delete_latest(sender: str) -> bool:
    with _lock:
        items = _load()
        mine = [m for m in items if m.get("sender") == sender]
        if not mine:
            return False
        gone = mine[-1]
        items = [m for m in items if m["id"] != gone["id"]]
        _save(items)
        (DIR / f"{gone['id']}.jpg").unlink(missing_ok=True)
        _awaiting_caption.pop(sender, None)
        return True


def public(m: dict) -> dict:
    return {k: v for k, v in m.items() if k != "sender"}


def all_memories(since: str | None = None) -> list[dict]:
    """Newest first. `since` (an ISO time) returns only memories received after it."""
    items = [public(m) for m in _load()]
    if since:
        items = [m for m in items if m["received_at"] > since]
    return sorted(items, key=lambda m: m["received_at"], reverse=True)
