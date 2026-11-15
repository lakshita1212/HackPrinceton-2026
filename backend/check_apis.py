"""Check every outside service before a demo, with tiny calls that cost almost nothing.

  python check_apis.py

Groq: each key and model answers, with the requests left today and tokens left this
minute (from Groq's own headers). Groq doesn't report tokens left for the day; if a
model is over its daily limit, its call fails here and says so.
Also: speech to text, the role voices, Gemini, Photon, Wikipedia, and the public copy.
"""
import io
import os
import time
import wave

import httpx
from dotenv import load_dotenv

load_dotenv()
GROQ = "https://api.groq.com/openai/v1"
MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]
results: list[tuple[str, str, str]] = []


def row(name: str, ok: bool, detail: str) -> None:
    results.append(("OK " if ok else "BAD", name, detail))
    print(f"{'OK ' if ok else 'BAD'}  {name:<34} {detail}", flush=True)


def short(e) -> str:
    text = getattr(e, "text", None) or str(e)
    return " ".join(text.split())[:150]


def groq_keys() -> list[tuple[str, str]]:
    return [(n, os.environ[n]) for n in ("GROQ_API_KEY", "GROQ_API_KEY_2") if os.getenv(n)]


def check_chat(label: str, key: str, model: str) -> None:
    r = httpx.post(f"{GROQ}/chat/completions", headers={"Authorization": f"Bearer {key}"},
                   json={"model": model, "messages": [{"role": "user", "content": "Say ok."}], "max_tokens": 3},
                   timeout=60)
    h = r.headers
    if r.status_code == 200:
        row(f"{label} {model.split('/')[-1]}", True,
            f"{h.get('x-ratelimit-remaining-requests')}/{h.get('x-ratelimit-limit-requests')} requests left today, "
            f"{h.get('x-ratelimit-remaining-tokens')}/{h.get('x-ratelimit-limit-tokens')} tokens this minute")
    else:
        row(f"{label} {model.split('/')[-1]}", False, f"{r.status_code}: {short(r)}")


def tiny_wav() -> bytes:
    import numpy as np
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
        t = np.arange(16000) / 16000
        w.writeframes((np.sin(2 * np.pi * 440 * t) * 3000).astype("<i2").tobytes())
    return buf.getvalue()


def check_audio(label: str, key: str) -> None:
    from groq import Groq
    c = Groq(api_key=key, max_retries=0)
    try:
        c.audio.transcriptions.create(file=("t.wav", tiny_wav()), model="whisper-large-v3-turbo")
        row(f"{label} speech to text", True, "Whisper answers")
    except Exception as e:
        row(f"{label} speech to text", False, short(e))
    try:
        c.audio.speech.create(model="canopylabs/orpheus-v1-english", voice="austin", input="Ok.", response_format="wav")
        row(f"{label} role voices", True, "Orpheus answers (terms accepted)")
    except Exception as e:
        row(f"{label} role voices", False, short(e))


def check_gemini() -> None:
    key = os.getenv("GOOGLE_API_KEY")
    if not key:
        return row("Gemini", False, "no GOOGLE_API_KEY")
    import gemini_vision
    r = httpx.post(f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_vision.MODEL}:generateContent",
                   params={"key": key}, json={"contents": [{"parts": [{"text": "Say ok."}]}]}, timeout=60)
    row(f"Gemini {gemini_vision.MODEL}", r.status_code == 200, "answers (photo pins)" if r.status_code == 200 else f"{r.status_code}: {short(r)}")


def check_photon() -> None:
    key, pid = os.getenv("PHOTON_API_KEY"), os.getenv("PHOTON_PROJECT_ID")
    if not (key and pid):
        return row("Photon", False, "PHOTON_API_KEY or PHOTON_PROJECT_ID missing")
    r = httpx.get(f"https://api.photon.codes/v1/projects/{pid}/platforms/imessage/assignments",
                  headers={"Authorization": f"Bearer {key}"}, timeout=30)
    if r.status_code != 200:
        return row("Photon iMessage", False, f"{r.status_code}: {short(r)}")
    a = r.json().get("assignments", [])
    opted = sum(1 for x in a if x.get("optIn", {}).get("state") == "received")
    row("Photon iMessage", True, f"{len(a)}/25 phone seats used, {opted} opted in, texting {os.getenv('PHOTON_IMESSAGE', 'on')}")


def check_wikipedia() -> None:
    import wiki_source
    r = httpx.get(wiki_source.API, params={"action": "query", "titles": "October 1962", "format": "json"},
                  headers=wiki_source.HEADERS, timeout=30)
    row("Wikipedia", r.status_code == 200, "reachable" if r.status_code == 200 else f"{r.status_code}")


def check_public_copy() -> None:
    url = os.getenv("PUBLIC_URL", "https://stay-tuned-u02u.onrender.com")
    t = time.perf_counter()
    try:
        r = httpx.get(f"{url}/health", timeout=120)
        row("Public copy (Render)", r.status_code == 200, f"{url} answered in {time.perf_counter() - t:.0f}s")
    except Exception as e:
        row("Public copy (Render)", False, short(e))


if __name__ == "__main__":
    for label, key in groq_keys():
        name = "Groq key 1 (yours)" if label == "GROQ_API_KEY" else "Groq key 2 (Darsha)"
        for m in MODELS:
            check_chat(name, key, m)
        check_audio(name, key)
    check_gemini()
    check_photon()
    check_wikipedia()
    check_public_copy()
    bad = [r for r in results if r[0] == "BAD"]
    print(f"\n{len(results) - len(bad)} of {len(results)} OK" + ("" if not bad else ". Fix the BAD lines before the demo."))
