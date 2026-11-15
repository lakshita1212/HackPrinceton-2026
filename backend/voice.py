"""Call the station from the laptop microphone.

Speech to text with Groq Whisper, the time-locked host, then text to speech
with Groq's Orpheus voices (one per role). If Groq TTS isn't available, the
response has no audio and the browser reads the answer aloud itself.
"""
import base64
import logging
import os

from dotenv import load_dotenv
from groq import Groq

load_dotenv()
log = logging.getLogger("voice")

STT_MODEL = "whisper-large-v3-turbo"
TTS_MODEL = os.getenv("TTS_MODEL", "canopylabs/orpheus-v1-english")

# Override any of these in .env, e.g. VOICE_CITIZEN=hannah
VOICES = {
    "citizen": os.getenv("VOICE_CITIZEN", "autumn"),
    "journalist": os.getenv("VOICE_JOURNALIST", "troy"),
    "official": os.getenv("VOICE_OFFICIAL", "austin"),
    "historian": os.getenv("VOICE_HISTORIAN", "diana"),
}

_clients: list[Groq] | None = None
_tts_broken_reason: str | None = None


def _groqs() -> list[Groq]:
    """A client per Groq key: yours, then GROQ_API_KEY_2 if a teammate's key is set."""
    global _clients
    if _clients is None:
        keys = [k for k in (os.getenv("GROQ_API_KEY"), os.getenv("GROQ_API_KEY_2")) if k]
        _clients = [Groq(api_key=k, max_retries=1) for k in keys]
    return _clients


def _with_any_key(call):
    """Run call(client) on each key in turn until one isn't rate-limited."""
    last = None
    for client in _groqs():
        try:
            return call(client)
        except Exception as e:  # rate limit or outage on this account: try the next
            last = e
            log.warning("Groq audio call failed on one key: %s", str(e)[:200])
    raise last


def transcribe(audio: bytes, filename: str) -> str:
    r = _with_any_key(lambda c: c.audio.transcriptions.create(
        file=(filename, audio),
        model=STT_MODEL,
        language="en",
        prompt="A caller asks a question about history.",
    ))
    return r.text.strip()


def speak(text: str, role: str) -> str | None:
    """Return base64 WAV audio, or None so the browser speaks instead."""
    global _tts_broken_reason
    if _tts_broken_reason:
        return None
    try:
        r = _with_any_key(lambda c: c.audio.speech.create(
            model=TTS_MODEL, voice=VOICES[role], input=text, response_format="wav"
        ))
        return base64.b64encode(r.read()).decode()
    except Exception as e:
        msg = str(e)
        # Terms not accepted or unknown model/voice won't fix themselves mid-demo.
        if any(k in msg for k in ("model_terms_required", "model_not_found", "voice")):
            _tts_broken_reason = msg[:300]
        log.warning("TTS unavailable, browser will speak instead: %s", msg[:300])
        return None


def tts_status() -> dict:
    return {"model": TTS_MODEL, "voices": VOICES, "error": _tts_broken_reason}
