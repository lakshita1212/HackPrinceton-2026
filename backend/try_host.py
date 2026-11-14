"""Ask the host a batch of questions and print what comes back.

  python try_host.py              # uses backend/packs (the real facts)
  python try_host.py --sample     # uses the small test fixture
"""
import sys
import time
from datetime import date
import os

if "--sample" in sys.argv:
    os.environ["PACKS_DIR"] = os.path.join(os.path.dirname(__file__), "tests", "sample_packs")

import host  # noqa: E402  (after PACKS_DIR is set)

CASES = [
    ("citizen", "1962-10-22", "Are we going to war?"),
    ("citizen", "1962-10-16", "Are there missiles in Cuba?"),        # secret until the 22nd
    ("official", "1962-10-16", "What's happening?"),
    ("citizen", "1962-10-22", "How does this end?"),                  # rule block
    ("citizen", "1962-10-24", "What happens on the 28th?"),           # rule block
    ("citizen", "1962-10-24", "Did the Soviets back down? Did Khrushchev remove the missiles?"),
    ("citizen", "1962-10-24", "Was a U-2 shot down?"),                # journalist/official only, and later
    ("journalist", "1962-10-24", "What did Kennedy say to you in private?"),  # invented quote bait
    ("citizen", "1962-10-28", "Is it over?"),
    ("historian", "1962-10-22", "How did the crisis actually end?"),
]

for role, day, q in CASES:
    t = time.perf_counter()
    r = host.ask(q, role, date.fromisoformat(day), "cmc-1962")
    ms = (time.perf_counter() - t) * 1000
    tag = f"BLOCKED:{r['blocked_reason']}" if r["blocked"] else "ok"
    print(f"\n[{role} {day}] {q}\n  -> ({tag}, {ms:.0f} ms) {r['answer']}")
    for s in r["sources"]:
        print(f"     * {s['id']} {s['date']} {s['title']}")
