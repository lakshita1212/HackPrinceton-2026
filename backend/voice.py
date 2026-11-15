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

_client: Groq | None = None
_tts_broken_reason: str | None = None


def _groq() -> Groq:
    global _client
    if _client is None:
        _client = Groq()
    return _client


def transcribe(audio: bytes, filename: str) -> str:
    r = _groq().audio.transcriptions.create(
        file=(filename, audio),
        model=STT_MODEL,
        language="en",
        prompt="A caller asks a question about October 1962 and the Cuban Missile Crisis.",
    )
    return r.text.strip()


def speak(text: str, role: str) -> str | None:
    """Return base64 WAV audio, or None so the browser speaks instead."""
    global _tts_broken_reason
    if _tts_broken_reason:
        return None
    try:
        r = _groq().audio.speech.create(
            model=TTS_MODEL, voice=VOICES[role], input=text, response_format="wav"
        )
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
