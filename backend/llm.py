"""One place to pick the language model. Switch providers in .env, not in code.

LLM_PROVIDER=groq    -> Groq (fast, free tier)
LLM_PROVIDER=gemini  -> Google Gemini (free tier, backup)
LLM_MODEL overrides the default model for that provider.
"""
import os

from dotenv import load_dotenv
from langchain.chat_models import init_chat_model

load_dotenv()

DEFAULTS = {
    "groq": ("groq", "openai/gpt-oss-120b", "GROQ_API_KEY"),
    "gemini": ("google_genai", "gemini-3.8-flash", "GOOGLE_API_KEY"),
}


def model_id() -> str:
    """Return a 'provider:model' string, the form deepagents accepts."""
    name = os.getenv("LLM_PROVIDER", "groq").lower()
    if name not in DEFAULTS:
        raise ValueError(f"LLM_PROVIDER must be one of {list(DEFAULTS)}, got {name!r}")
    provider, default_model, key_var = DEFAULTS[name]
    if not os.getenv(key_var):
        raise RuntimeError(f"{key_var} is not set in backend/.env")
    return f"{provider}:{os.getenv('LLM_MODEL') or default_model}"


def get_model(**kwargs):
    """Return a chat model object, for code that calls the model directly."""
    return init_chat_model(model_id(), **kwargs)
