"""Make a call sound like the phone line of its era.

The voices you call are AI (and labeled so). This only changes how the line
sounds: a 1960s call gets the narrow band of an old telephone, line hiss and a
few crackles; 1989 is a clearer line; the historian, in the present, is clean.
"""
import io
import struct
import wave
from datetime import date

import numpy as np

# (low Hz, high Hz, hiss level, crackles per second, drive) per era
ERAS = {
    "1960s": (330, 3100, 0.012, 1.4, 1.6),
    "1980s": (250, 4200, 0.005, 0.3, 1.2),
}


def era_for(day: date, role: str) -> str | None:
    if role == "historian":
        return None  # speaking from the present day
    if day.year < 1980:
        return "1960s"
    if day.year < 2000:
        return "1980s"
    return None


def _pcm(wav_bytes: bytes) -> tuple[np.ndarray, int]:
    """16-bit mono samples and rate. Reads the data chunk directly because
    streamed WAVs carry a placeholder length in their header."""
    with wave.open(io.BytesIO(wav_bytes)) as w:
        rate, width, channels = w.getframerate(), w.getsampwidth(), w.getnchannels()
    if width != 2 or channels != 1:
        raise ValueError("expected 16-bit mono")
    i = wav_bytes.find(b"data")
    data = wav_bytes[i + 8:]
    data = data[: len(data) - len(data) % 2]
    return np.frombuffer(data, dtype="<i2").astype(np.float32) / 32768.0, rate


def _wav(samples: np.ndarray, rate: int) -> bytes:
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes()
    header = b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt " + struct.pack(
        "<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16
    ) + b"data" + struct.pack("<I", len(pcm))
    return header + pcm


def apply(wav_bytes: bytes, era: str | None, seed: int = 7) -> bytes:
    if not era:
        return wav_bytes
    low, high, hiss, crackles, drive = ERAS[era]
    x, rate = _pcm(wav_bytes)
    rng = np.random.default_rng(seed)

    # A carbon microphone's grit: gentle saturation (before the band filter,
    # so the harmonics it adds are cut too).
    x = np.tanh(x * drive) / np.tanh(drive)

    # Telephone band: cut the lows and highs a period line couldn't carry.
    freqs = np.fft.rfftfreq(len(x), 1 / rate)
    gain = np.clip((freqs - low * 0.7) / (low * 0.3), 0, 1) * np.clip((high * 1.15 - freqs) / (high * 0.15), 0, 1)
    x = np.fft.irfft(np.fft.rfft(x) * gain, n=len(x))

    # Line hiss, band-limited like the voice, and a few clicks and crackles.
    noise = np.fft.irfft(np.fft.rfft(rng.normal(0, 1, len(x))) * gain, n=len(x))
    x = x + noise / (np.abs(noise).max() + 1e-9) * hiss
    for _ in range(int(crackles * len(x) / rate)):
        at = rng.integers(0, max(1, len(x) - 60))
        x[at: at + 60] += rng.normal(0, 0.12, 60) * np.hanning(60)

    # A quarter second of open line before the voice, like a call connecting.
    lead = rng.normal(0, 1, rate // 4)
    x = np.concatenate([lead / np.abs(lead).max() * hiss, x])

    # Everything, clicks and hiss included, came down the same narrow line.
    f2 = np.fft.rfftfreq(len(x), 1 / rate)
    line = np.clip((f2 - low * 0.7) / (low * 0.3), 0, 1) * np.clip((high * 1.3 - f2) / (high * 0.3), 0, 1)
    x = np.fft.irfft(np.fft.rfft(x) * line, n=len(x))
    return _wav(x * 0.9 / (np.abs(x).max() + 1e-9), rate)
