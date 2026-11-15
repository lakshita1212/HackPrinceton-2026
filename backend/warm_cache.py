"""Answer the demo questions once, so every judge gets them instantly.

Run this before judging, with the packs final (it costs Groq tokens once):
  python warm_cache.py

Add the questions from your demo script to DEMO below. Answers are saved in
cache/answers.json. Delete that file after changing a pack, then warm again.
"""
import time
from datetime import date

import host

# The pack for each station day. 2026 is built from Wikipedia for the latest
# past day (POST /stations); judging on Nov 15 uses Nov 14.
PACKS = {"1962": "cmc-1962", "1969": "apollo-1969", "1989": "berlin-1989", "2026": "wiki-2026-11"}

# The demo script (DEMO.md) first, then questions judges are likely to ask.
DEMO = [
    # Demo script
    ("citizen", "1962-10-22", "Are we going to war?"),
    ("official", "1962-10-22", "Are we going to war?"),
    ("citizen", "1962-10-22", "How does this all end?"),
    ("citizen", "1969-07-20", "Did they make it?"),
    ("official", "1969-07-20", "What would the President say if they got stuck up there?"),
    ("citizen", "1989-11-09", "What's happening at the border tonight?"),
    ("official", "1989-11-09", "Why did Schabowski say immediately?"),
    ("citizen", "2026-11-14", "What's in the news this week?"),
    # Likely judge questions
    ("citizen", "1962-10-16", "What's in the news today?"),
    ("official", "1962-10-16", "What did the photos show?"),
    ("journalist", "1962-10-22", "Are we going to war?"),
    ("citizen", "1962-10-22", "What did the President say tonight?"),
    ("citizen", "1962-10-24", "Should we be scared?"),
    ("citizen", "1962-10-27", "What's the latest news?"),
    ("citizen", "1962-10-28", "Is it over?"),
    ("historian", "1962-10-28", "How did the crisis end?"),
    ("historian", "1962-10-22", "What did people not know at the time?"),
    ("journalist", "1969-07-20", "What happened during the landing?"),
    ("citizen", "1969-07-20", "Did the astronauts get home safely?"),
    ("historian", "1969-07-20", "Why does the moon landing matter?"),
    ("journalist", "1989-11-09", "When will Germany be reunified?"),
    ("citizen", "1989-11-09", "Is the Wall really open?"),
    ("historian", "1989-11-09", "Why did the Wall open?"),
    ("journalist", "2026-11-14", "What happened with flights in the US?"),
]

if __name__ == "__main__":
    import answer_cache
    import wiki_station

    # Wikipedia stations (2026) must exist before their questions can be answered:
    # build them the same way the app does when you tune in.
    for day in sorted({d for _, d, _ in DEMO if PACKS[d[:4]].startswith("wiki-")}):
        try:
            print(f"{'station':<22}        {wiki_station.ensure(date.fromisoformat(day))}", flush=True)
        except Exception as e:
            print(f"{'station failed':<22}        {day} ({type(e).__name__}: {str(e)[:80]})", flush=True)

    for role, day, q in DEMO:
        pack = PACKS[day[:4]]
        if answer_cache.get(q, role, date.fromisoformat(day), pack):
            print(f"{'already saved':<22}        [{role} {day}] {q}", flush=True)
            continue
        t = time.perf_counter()
        try:
            r = host.ask(q, role, date.fromisoformat(day), pack)
        except Exception as e:  # e.g. Groq's daily limit: keep going, run again later
            print(f"{'failed':<22}        [{role} {day}] {q}  ({type(e).__name__})", flush=True)
            continue
        state = f"refused ({r['blocked_reason']})" if r["blocked"] else "ready"
        print(f"{state:<22} {time.perf_counter() - t:5.1f}s  [{role} {day}] {q}", flush=True)
        time.sleep(8)  # stay under Groq's per-minute token limit
    print("\nCached. Anything 'refused' won't be cached: rephrase it or run again.")
    print("Restart the host so it reads the new cache.")
