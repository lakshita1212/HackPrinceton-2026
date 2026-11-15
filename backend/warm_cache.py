"""Answer the demo questions once, so every judge gets them instantly.

Run this before judging, with the packs final (it costs Groq tokens once):
  python warm_cache.py

Add the questions from your demo script to DEMO below. Answers are saved in
cache/answers.json. Delete that file after changing a pack, then warm again.
"""
import time
from datetime import date

import host

DEMO = [
    ("citizen", "1962-10-16", "What's in the news today?"),
    ("citizen", "1962-10-16", "Are there missiles in Cuba?"),
    ("official", "1962-10-16", "What's happening?"),
    ("official", "1962-10-16", "What did the photos show?"),
    ("citizen", "1962-10-22", "Are we going to war?"),
    ("journalist", "1962-10-22", "Are we going to war?"),
    ("official", "1962-10-22", "Are we going to war?"),
    ("citizen", "1962-10-22", "What did the President say tonight?"),
    ("citizen", "1962-10-24", "Should we be scared?"),
    ("citizen", "1962-10-27", "What's the latest news?"),
    ("citizen", "1962-10-28", "Is it over?"),
    ("historian", "1962-10-28", "How did the crisis end?"),
    ("historian", "1962-10-22", "What did people not know at the time?"),
]

if __name__ == "__main__":
    for role, day, q in DEMO:
        t = time.perf_counter()
        r = host.ask(q, role, date.fromisoformat(day), "cmc-1962")
        state = f"refused ({r['blocked_reason']})" if r["blocked"] else "ready"
        print(f"{state:<22} {time.perf_counter() - t:5.1f}s  [{role} {day}] {q}", flush=True)
        time.sleep(2)  # stay under Groq's per-minute limit
    print("\nCached. Anything 'refused' won't be cached: rephrase it or run again.")
