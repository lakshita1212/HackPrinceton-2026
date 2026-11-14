"""Time-locked, role-locked retrieval.

Filter first, rank second: a fact the role couldn't have known on that day
never reaches the model, no matter how relevant it is.
"""
from datetime import date

import numpy as np
from fastembed import TextEmbedding

from packs import Fact, load_pack

_embedder: TextEmbedding | None = None
_vectors: dict[tuple, np.ndarray] = {}  # (fact id, text) -> unit vector


def _embed(texts: list[str]) -> np.ndarray:
    global _embedder
    if _embedder is None:
        _embedder = TextEmbedding("BAAI/bge-small-en-v1.5")  # ~70 MB, downloads once
    m = np.array(list(_embedder.embed(texts)), dtype=np.float32)
    return m / np.linalg.norm(m, axis=1, keepdims=True)


def visible_facts(facts: list[Fact], role: str, day: date) -> list[Fact]:
    """What this role could know on this day. The historian knows everything."""
    if role == "historian":
        return facts
    return [f for f in facts if role in f.roles and f.date <= day]


def search(pack: str, role: str, day: date, question: str, k: int = 6) -> list[Fact]:
    candidates = visible_facts(load_pack(pack), role, day)
    if not candidates:
        return []

    missing = [f for f in candidates if (f.id, f.text) not in _vectors]
    if missing:
        for f, v in zip(missing, _embed([f.text for f in missing])):
            _vectors[(f.id, f.text)] = v

    matrix = np.stack([_vectors[(f.id, f.text)] for f in candidates])
    scores = matrix @ _embed([question])[0]
    top = np.argsort(-scores)[:k]
    return [candidates[i] for i in top]


def warm_up() -> None:
    """Load the embedding model ahead of time so the first question isn't slow."""
    _embed(["warm up"])
