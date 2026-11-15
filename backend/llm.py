"""One place to pick language models. Switch them in .env, not in code.

Groq's free tier allows 8,000 tokens per minute and 1,000 requests per day
*per model*. So each job gets its own model, and each job falls back to
another model the moment it hits a rate limit instead of waiting:

  job      default (Groq)        .env override      falls back to
  answer   openai/gpt-oss-120b   LLM_MODEL          openai/gpt-oss-20b
  check    openai/gpt-oss-20b    LLM_CHECK_MODEL    qwen/qwen3.8-27b
  agent    qwen/qwen3.8-27b      LLM_AGENT_MODEL    (none: it fails over to the simple host)

LLM_PROVIDER=gemini sends every job to Gemini instead (separate free quota; it was
timing out when tested on Nov 14, so treat it as untested).
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
GEMINI_MODEL = "gemini-3.8-flash"


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


def get_model(job: str = "answer", **kwargs):
    """A chat model for `job`. Fails fast on rate limits and switches to the fallback model."""
    primary = init_chat_model(model_id(job), max_retries=0, **kwargs)
    fb = fallback_id(job)
    if not fb:
        return primary
    return primary.with_fallbacks([init_chat_model(fb, max_retries=2, **kwargs)])


def get_structured(schema, job: str = "answer", **kwargs):
    """Like get_model(...).with_structured_output(schema), with the same fallback."""
    primary = init_chat_model(model_id(job), max_retries=0, **kwargs).with_structured_output(schema)
    fb = fallback_id(job)
    if not fb:
        return primary
    return primary.with_fallbacks([init_chat_model(fb, max_retries=2, **kwargs).with_structured_output(schema)])
