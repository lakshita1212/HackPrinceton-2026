"""Text the station: answer iMessages through Photon 2.0 (Beta).

Polls Photon's HTTP API for new messages to the project's iMessage line,
runs each through the time-locked host, and replies in the same conversation.
Started by app.py when PHOTON_API_KEY and PHOTON_PROJECT_ID are set.

Run on its own for testing: python photon_imessage.py
"""
import logging
import os
import threading
import time
from datetime import datetime, timedelta, timezone

import httpx
from dotenv import load_dotenv

import host
import station
from packs import PackNotFound

load_dotenv()
log = logging.getLogger("imessage")

API = "https://api.photon.codes/v1/projects"
POLL_SECONDS = 2

HELP = (
    "You've reached Stay Tuned, the radio that tunes through time.\n\n"
    "Ask anything, and whoever the radio is tuned to will answer, knowing only what was known that day.\n\n"
    "To pick someone yourself, start with a role and a day:\n"
    "  official oct 16: what's happening?\n"
    "  citizen oct 22: are we going to war?\n\n"
    "Roles: citizen, journalist, official, historian."
)

ROLE_LABEL = {
    "citizen": "A citizen",
    "journalist": "A Washington reporter",
    "official": "A State Department official (composite)",
    "historian": "A historian, today",
}


def _mask(handle: str) -> str:
    return "•••" + handle[-4:] if len(handle) > 4 else handle


def format_reply(result: dict, st: dict) -> str:
    when = "today" if st["role"] == "historian" else f"{st['date']:%b} {st['date'].day}, {st['date'].year}"
    lines = [result["answer"], "", f"— {ROLE_LABEL[st['role']]}, {when}"]
    if result["sources"]:
        lines.append("")
        lines.append("Sources:")
        for s in result["sources"]:
            d = datetime.fromisoformat(s["date"])
            lines.append(f"• {s['title']} ({d:%b} {d.day}, {d.year}, {s['kind']})")
    return "\n".join(lines)


class ImessageAgent:
    def __init__(self, api_key: str, project_id: str):
        self.project_id = project_id
        self.http = httpx.Client(
            base_url=f"{API}/{project_id}",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=20,
        )
        self.seen: set[str] = set()
        self.since = datetime.now(timezone.utc) - timedelta(seconds=5)

    def poll(self) -> list[dict]:
        params = {
            "createdSince": self.since.isoformat().replace("+00:00", "Z"),
            "direction": "received",
            "platform": "imessage",
            "order": "asc",
            "pageSize": 100,
        }
        items: list[dict] = []
        while True:
            r = self.http.get("/messages", params=params)
            r.raise_for_status()
            page = r.json()
            items += page.get("items", [])
            token = page.get("nextPageToken")
            if not token or not page.get("items"):
                return items
            params["pageToken"] = token

    def reply(self, msg: dict, text: str) -> None:
        r = self.http.post(
            "/messages",
            headers={"idempotency-key": f"stay-tuned-reply:{msg['id']}"},
            json={
                "spaceId": msg["space"]["id"],
                "senderId": msg["receivedBy"]["id"],
                "parentMessageId": msg["id"],
                "content": {"type": "text", "format": "plain", "text": text},
            },
        )
        if r.status_code >= 400:
            log.error("reply failed %s: %s", r.status_code, r.text[:500])
        r.raise_for_status()

    def handle(self, msg: dict) -> None:
        content = msg.get("content") or {}
        sender = msg.get("sentBy") or {}
        if content.get("type") != "text" or sender.get("kind") == "agent":
            return
        text = content.get("text", "").strip()
        caller = _mask(sender.get("handle", "?"))
        log.info("text from %s: %s", caller, text)

        if not text or text.lower() in ("help", "hi", "hello", "start", "?", "ping"):
            self.reply(msg, HELP)
            return

        question, st = station.parse_overrides(text, station.get())
        if not question:
            self.reply(msg, HELP)
            return
        try:
            result = host.ask(question, st["role"], st["date"], st["pack"])
        except PackNotFound:
            result = {"answer": "That station isn't on the air yet.", "sources": [], "blocked": True, "blocked_reason": "unsupported"}
        station.log_exchange("imessage", caller, question, st, result)
        self.reply(msg, format_reply(result, st))

    def run_once(self) -> None:
        for msg in self.poll():
            mid = msg.get("id")
            if not mid or mid in self.seen:
                continue
            self.seen.add(mid)
            created = msg.get("createdAt")
            if created:
                self.since = max(self.since, datetime.fromisoformat(created.replace("Z", "+00:00")) - timedelta(seconds=1))
            try:
                self.handle(msg)
            except Exception:
                log.exception("failed to handle message %s", mid)

    def run_forever(self, stop: threading.Event | None = None) -> None:
        log.info("iMessage agent polling project %s", self.project_id)
        while not (stop and stop.is_set()):
            try:
                self.run_once()
            except Exception:
                log.exception("poll failed")
            time.sleep(POLL_SECONDS)


def start_in_background() -> threading.Event | None:
    key, pid = os.getenv("PHOTON_API_KEY"), os.getenv("PHOTON_PROJECT_ID")
    if not (key and pid) or os.getenv("PHOTON_IMESSAGE", "on").lower() == "off":
        log.info("iMessage agent off (set PHOTON_API_KEY and PHOTON_PROJECT_ID to enable)")
        return None
    stop = threading.Event()
    threading.Thread(target=ImessageAgent(key, pid).run_forever, args=(stop,), daemon=True).start()
    return stop


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    ImessageAgent(os.environ["PHOTON_API_KEY"], os.environ["PHOTON_PROJECT_ID"]).run_forever()
