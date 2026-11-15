"""Check every story pack file for format problems and time leaks.

Run: python validate_packs.py   (from backend/)
Exit code 1 if anything is wrong.
"""
import json
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path

ROLES = {"citizen", "journalist", "official", "historian"}
ROOT = Path(__file__).parent / "packs"

problems: list[str] = []
medium: list[str] = []
ids: Counter = Counter()

for pack_dir in sorted(p for p in ROOT.iterdir() if p.is_dir()):
    pack = pack_dir.name
    print(f"\n{pack}")
    for f in sorted(pack_dir.glob("*.json")):
        name = f"{pack}/{f.name}"
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            problems.append(f"{name}: bad JSON ({e})")
            continue
        facts = data.get("facts", [])
        day = data.get("day")
        on_day = sum(1 for x in facts if x.get("date") == day)
        print(f"  {f.name:<20} day={day} facts={len(facts)} ({on_day} dated that day)")

        if data.get("pack") != pack:
            problems.append(f"{name}: pack is {data.get('pack')!r}, folder is {pack!r}")
        if day and f.stem != day:
            problems.append(f"{name}: file name doesn't match its day {day} (rename to {day}.json)")

        for x in facts:
            fid = x.get("id", "?")
            ids[fid] += 1
            missing = [k for k in ("id", "date", "roles", "text", "source") if not x.get(k)]
            if missing:
                problems.append(f"{name} {fid}: missing {missing}")
                continue
            try:
                d = date.fromisoformat(x["date"])
            except ValueError:
                problems.append(f"{name} {fid}: bad date {x['date']!r}")
                continue
            roles = set(x["roles"])
            if roles - ROLES:
                problems.append(f"{name} {fid}: unknown roles {sorted(roles - ROLES)}")
            if "historian" not in roles:
                problems.append(f"{name} {fid}: historian missing from roles")
            if day and d > date.fromisoformat(day) and roles != {"historian"}:
                problems.append(f"{name} {fid}: dated {d}, after the file's day, but visible to {sorted(roles - {'historian'})}")
            src = x["source"]
            for k in ("title", "citation"):
                if not src.get(k):
                    problems.append(f"{name} {fid}: source.{k} missing")
            if src.get("kind") not in ("archival", "narration"):
                problems.append(f"{name} {fid}: source.kind is {src.get('kind')!r}")
            if src.get("url") and not str(src["url"]).startswith("http"):
                problems.append(f"{name} {fid}: url {src['url']!r}")
            if x.get("confidence") == "medium" and roles != {"historian"}:
                medium.append(f"{fid} ({sorted(roles - {'historian'})}): {x.get('note')}")

problems += [f"duplicate id {i} ({n} times)" for i, n in ids.items() if n > 1]

print(f"\n{sum(ids.values())} facts total")
print("\nProblems:\n  " + ("\n  ".join(problems) if problems else "none"))
print("\nMedium confidence, visible to 1962 roles (worth a check):\n  " + ("\n  ".join(medium) if medium else "none"))
sys.exit(1 if problems else 0)
