"""Let someone text the station from their own iPhone.

Our Photon line is shared: each texter's number must be registered first
(one of 25 seats), and Photon picks which pooled number they should text.

  python texters.py add +15551234567      register a judge, prints the number they text
  python texters.py list                  who is registered, and whether they've texted yet
  python texters.py remove +15551234567   free the seat afterwards

Only iPhones (iMessage) work. Keep your own phone ready for Android judges.
"""
import os
import sys

import httpx
from dotenv import load_dotenv

load_dotenv()

API = f"https://api.photon.codes/v1/projects/{os.environ['PHOTON_PROJECT_ID']}/platforms/imessage/assignments"
HEADERS = {"Authorization": f"Bearer {os.environ['PHOTON_API_KEY']}"}


def pretty(n: str) -> str:
    d = n.removeprefix("+1")
    return f"+1 ({d[:3]}) {d[3:6]}-{d[6:]}" if len(d) == 10 else n


def normalize(handle: str) -> str:
    if "@" in handle:
        return handle
    digits = "".join(c for c in handle if c.isdigit())
    if len(digits) == 10:
        digits = "1" + digits
    return "+" + digits


def assignments() -> list[dict]:
    r = httpx.get(API, headers=HEADERS, timeout=20)
    r.raise_for_status()
    return r.json().get("assignments", [])


class Refused(Exception):
    pass


def register(handle: str) -> dict:
    """Register a phone with the shared line. Returns {text_to, pretty, new}. Used by the app too."""
    handle = normalize(handle)
    if not ("@" in handle or 11 <= len(handle) <= 16):
        raise Refused("That doesn't look like a phone number.")
    existing = next((a for a in assignments() if a["handle"] == handle), None)
    if existing:
        a = existing
    else:
        r = httpx.post(API, headers=HEADERS, json={"handle": handle}, timeout=20)
        if r.status_code >= 400:
            raise Refused(f"Photon refused ({r.status_code}): {r.text[:300]}")
        a = r.json()
    return {"text_to": a["assignedPhoneNumber"], "pretty": pretty(a["assignedPhoneNumber"]), "new": not existing}


def add(handle: str) -> None:
    try:
        info = register(handle)
    except Refused as e:
        sys.exit(str(e))
    if not info["new"]:
        print("Already registered.")
    print(f"\n  {normalize(handle)} should text:  {info['pretty']}\n")
    print('  Suggested first text:  "citizen oct 22: are we going to war?"')


def show() -> None:
    rows = assignments()
    print(f"{len(rows)} of 25 seats used")
    for a in rows:
        print(f"  {a['handle']:<16} texts {pretty(a['assignedPhoneNumber'])}   opt-in: {a['optIn']['state']}")


def remove(handle: str) -> None:
    handle = normalize(handle)
    a = next((a for a in assignments() if a["handle"] == handle), None)
    if not a:
        sys.exit(f"{handle} isn't registered.")
    r = httpx.delete(f"{API}/{a['assignmentId']}", headers=HEADERS, timeout=20)
    r.raise_for_status()
    print(f"Released {handle}.")


if __name__ == "__main__":
    cmd, *args = sys.argv[1:] or ["list"]
    if cmd == "add" and args:
        add(args[0])
    elif cmd == "remove" and args:
        remove(args[0])
    elif cmd == "list":
        show()
    else:
        print(__doc__)
