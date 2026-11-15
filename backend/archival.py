"""Real recordings to play inside a call, after the AI voice.

When an answer relies on a fact that has a real public-domain recording (the
media in frontend/media, logged in MEDIA.md), the response names a few seconds
of it, so the caller hears the AI-voiced person and then the actual voice from
that day, labeled "archival". A clip is never offered before the day it aired.

Timestamps were found by transcribing each recording with Whisper; `quote` is
what is said in that span.
"""
from datetime import date

from packs import load_pack

CLIPS = [
    # Most specific first: the first clip whose keywords match wins.
    {
        "id": "jfk-quarantine",
        "packs": ["cmc-1962"], "from": date(1962, 10, 22),
        "keywords": ["quarantine", "turned back"],
        "src": "media/kennedy-address-1962-10-22.mp3", "start": 544.4, "end": 564.4,
        "quote": "First, to halt this offensive buildup, a strict quarantine on all offensive military "
                 "equipment under shipment to Cuba is being initiated. All ships of any kind bound to Cuba, "
                 "from whatever nation or port, if found to contain cargoes of offensive weapons, be turned back.",
        "title": "President Kennedy, radio and television address, October 22, 1962",
        "source": "archive.org jfks19621022 (public domain)",
    },
    {
        "id": "jfk-retaliation",
        "packs": ["cmc-1962"], "from": date(1962, 10, 22),
        "keywords": ["retaliat", "launched from cuba", "attack by the soviet union"],
        "src": "media/kennedy-address-1962-10-22.mp3", "start": 622.1, "end": 641.8,
        "quote": "It shall be the policy of this nation to regard any nuclear missile launched from Cuba "
                 "against any nation in the Western Hemisphere as an attack by the Soviet Union on the "
                 "United States, requiring a full retaliatory response upon the Soviet Union.",
        "title": "President Kennedy, radio and television address, October 22, 1962",
        "source": "archive.org jfks19621022 (public domain)",
    },
    {
        "id": "jfk-khrushchev",
        "packs": ["cmc-1962"], "from": date(1962, 10, 22),
        "keywords": ["call upon", "halt and eliminate", "reckless", "provocative"],
        "src": "media/kennedy-address-1962-10-22.mp3", "start": 721.8, "end": 735.2,
        "quote": "I call upon Chairman Khrushchev to halt and eliminate this clandestine, reckless, and "
                 "provocative threat to world peace and to stable relations between our two nations.",
        "title": "President Kennedy, radio and television address, October 22, 1962",
        "source": "archive.org jfks19621022 (public domain)",
    },
    {
        "id": "jfk-evidence",
        "packs": ["cmc-1962"], "from": date(1962, 10, 22),
        "keywords": ["missile site", "offensive missile", "address", "president said", "president announced",
                     "unmistakable", "nuclear strike"],
        "src": "media/kennedy-address-1962-10-22.mp3", "start": 13.1, "end": 34.4,
        "quote": "Within the past week, unmistakable evidence has established the fact that a series of "
                 "offensive missile sites is now in preparation on that imprisoned island. The purpose of "
                 "these bases can be none other than to provide a nuclear strike capability against the "
                 "Western Hemisphere.",
        "title": "President Kennedy, radio and television address, October 22, 1962",
        "source": "archive.org jfks19621022 (public domain)",
    },
    {
        "id": "apollo-first-step",
        "packs": ["apollo-1969", "wiki-1969-07"], "from": date(1969, 7, 20),
        "keywords": ["small step", "first step", "stepped", "walked on", "ladder", "surface"],
        "src": "media/apollo11-first-step.m4a", "start": 100.0, "end": 122.0,
        "quote": "That's one small step for man, one giant leap for mankind. The surface is fine and powdery.",
        "title": "Apollo 11 mission audio, July 20, 1969",
        "source": "NASA Apollo 11 audio highlights, Day 5 (public domain)",
    },
    {
        "id": "apollo-landed",
        "packs": ["apollo-1969", "wiki-1969-07"], "from": date(1969, 7, 20),
        "keywords": ["landed", "landing", "eagle", "tranquility", "touched down"],
        "src": "media/apollo11-landing.m4a", "start": 230.0, "end": 245.6,
        "quote": "We copy you down, Eagle. Houston, Tranquility Base here. The Eagle has landed. "
                 "Roger, Tranquility. We copy you on the ground. You got a bunch of guys about to turn blue. "
                 "We're breathing again. Thanks a lot.",
        "title": "Apollo 11 mission audio, July 20, 1969",
        "source": "NASA Apollo 11 audio highlights, Day 5 (public domain)",
    },
]

_PUBLIC = ("id", "src", "start", "end", "quote", "title", "source")


def clip_for(result: dict, day: date, pack: str) -> dict | None:
    """The recording to play after this answer, or None."""
    if result.get("blocked") or not result.get("sources"):
        return None
    try:
        facts = {f.id: f for f in load_pack(pack)}
    except Exception:
        return None
    used = " ".join(facts[s["id"]].text for s in result["sources"] if s["id"] in facts).lower()
    for clip in CLIPS:
        if pack in clip["packs"] and day >= clip["from"] and any(k in used for k in clip["keywords"]):
            return {**{k: clip[k] for k in _PUBLIC}, "label": "archival"}
    return None
