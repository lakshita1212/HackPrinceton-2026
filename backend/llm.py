"""One place to pick language models. Switch them in .env, not in code.

Groq's free tier allows 8,000 tokens per minute and 1,000 requests per day
*per model*. So each job starts on its own model, switches to the next model
the moment one is rate-limited, and only the last model waits out a limit:

  job      tries, in order                                    .env override
  answer   gpt-oss-120b -> gpt-oss-20b -> qwen3.8-27b (waits)   LLM_MODEL
  check    gpt-oss-20b -> qwen3.8-27b -> gpt-oss-120b (waits)   LLM_CHECK_MODEL
  agent    qwen3.8-27b -> gpt-oss-20b (waits)                   LLM_AGENT_MODEL (deepagents host)

With GROQ_API_KEY_2 set (a teammate's free key), the same models are tried
again on that account before anything waits.

LLM_PROVIDER=gemini sends every job to Gemini instead (separate free quota).
Gemini also annotates texted photos (gemini_vision.py).
"""
import os

from dotenv import load_dotenv
from langchain.chat_models import init_chat_model

load_dotenv()

GROQ_JOBS = {
    "answer": ("LLM_MODEL", "openai/gpt-oss-120b", "openai/gpt-oss-20b"),
    "check": ("LLM_CHECK_MODEL", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"),
    "agent": ("LLM_AGENT_MODEL", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"),
}
# If both models for a job are rate-limited, try the third Groq model, and let
# that last one wait out the limit (Groq says when to retry) instead of failing.
LAST_RESORT = {"answer": "qwen/qwen3.8-27b", "check": "openai/gpt-oss-120b", "agent": None}
GEMINI_MODEL = "gemini-3-flash-preview"


def _provider() -> str:
    name = os.getenv("LLM_PROVIDER", "groq").lower()
    if name not in ("groq", "gemini"):
        raise ValueError(f"LLM_PROVIDER must be groq or gemini, got {name!r}")
    key = "GROQ_API_KEY" if name == "groq" else "GOOGLE_API_KEY"
    if not os.getenv(key):
        raise RuntimeError(f"{key} is not set in backend/.env")
    return name


def model_id(job: str = "answer") -> str:
    """Return a 'provider:model' string, the form deepagents accepts."""
    if _provider() == "gemini":
        return f"google_genai:{os.getenv('LLM_MODEL') or GEMINI_MODEL}"
    env, default, _ = GROQ_JOBS[job]
    return f"groq:{os.getenv(env) or default}"


def fallback_id(job: str = "answer") -> str | None:
    if _provider() == "gemini":
        return None
    env, default, fallback = GROQ_JOBS[job]
    return f"groq:{fallback}" if (os.getenv(env) or default) != fallback else None


def _groq_keys() -> list[str]:
    """Your key first, then a teammate's (GROQ_API_KEY_2): a separate account has separate limits."""
    return [k for k in (os.getenv("GROQ_API_KEY"), os.getenv("GROQ_API_KEY_2")) if k]


def _chain(job: str) -> list[tuple[str, int, dict]]:
    """(model id, retries, extra kwargs) in the order to try. Every step fails fast except the last, which waits."""
    ids = [model_id(job)]
    if fb := fallback_id(job):
        ids.append(fb)
    if _provider() == "groq" and LAST_RESORT.get(job):
        last = f"groq:{LAST_RESORT[job]}"
        if last not in ids:
            ids.append(last)
    if _provider() == "groq":
        # gpt-oss models "think" before answering, and those hidden tokens count
        # against the daily limit. Our tasks are short, so keep the thinking short.
        steps = [
            (m, {"api_key": k, **({"reasoning_effort": "low"} if "gpt-oss" in m else {})})
            for k in _groq_keys()
            for m in ids
        ]
    else:
        steps = [(m, {}) for m in ids]
    # The last step waits out per-minute limits (Groq says when to retry) rather than failing:
    # a slow answer beats "Host unavailable" in front of a judge.
    return [(m, 0 if i < len(steps) - 1 else 7, extra) for i, (m, extra) in enumerate(steps)]


def get_model(job: str = "answer", **kwargs):
    """A chat model for `job` that switches models (and keys) the moment one is rate-limited."""
    models = [init_chat_model(m, max_retries=r, **extra, **kwargs) for m, r, extra in _chain(job)]
    return models[0].with_fallbacks(models[1:]) if len(models) > 1 else models[0]


def get_structured(schema, job: str = "answer", **kwargs):
    """Like get_model(...).with_structured_output(schema), with the same fallback chain."""
    models = [
        init_chat_model(m, max_retries=r, **extra, **kwargs).with_structured_output(schema)
        for m, r, extra in _chain(job)
    ]
    return models[0].with_fallbacks(models[1:]) if len(models) > 1 else models[0]
