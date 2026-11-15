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
import memories
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
    "Roles: citizen, journalist, official, historian.\n\n"
    "Send a photo with a caption to put your own memory on the air, on the 2026 station. "
    "Google Gemini pins captions on what's in it (it never identifies people). Text DELETE anytime to take it down."
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

    def download(self, attachment_id: str) -> bytes:
        """An attachment's bytes. Photon may need a few seconds to make it available."""
        for _ in range(4):
            r = self.http.get(f"/attachments/{attachment_id}/content", timeout=60)
            if r.status_code == 409:  # not ready yet
                time.sleep(int(r.headers.get("Retry-After", "5")))
                continue
            r.raise_for_status()
            return r.content
        raise RuntimeError("attachment never became ready")

    def handle(self, msg: dict) -> None:
        content = msg.get("content") or {}
        sender = msg.get("sentBy") or {}
        if sender.get("kind") == "agent":
            return
        handle = sender.get("handle", "?")
        caller = _mask(handle)

        # A photo, alone or grouped with its caption, becomes a memory on the 2026 station.
        parts = content.get("parts", []) if content.get("type") == "group" else [content]
        photos = [p for p in parts if p.get("type") == "attachment"]
        caption = " ".join(p.get("text", "") for p in parts if p.get("type") == "text").strip()
        if photos:
            self.save_memories(msg, handle, caller, photos, caption)
            return
        if content.get("type") != "text":
            return
        text = content.get("text", "").strip()
        log.info("text from %s: %s", caller, text)

        if text.upper() == "DELETE":
            gone = memories.delete_latest(handle)
            self.reply(msg, "Done. Your latest memory is off the air." if gone else "You don't have any memories on the air.")
            return
        if memories.waiting_for_caption(handle):
            m = memories.set_caption(handle, text)
            note = f'Captioned: "{m["caption"]}"' if m and m["caption"] else "Saved without a caption."
            self.reply(msg, f"{note}\n\nYour memory is on the air: turn the dial to 2026 to see it. Text DELETE to take it down.")
            return
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

    def save_memories(self, msg: dict, handle: str, caller: str, photos: list[dict], caption: str) -> None:
        saved = []
        for p in photos[:4]:
            try:
                saved.append(memories.add_photo(self.download(p["attachmentId"]), handle, caption or None))
            except Exception:
                log.exception("couldn't save a photo from %s", caller)
        log.info("memory from %s: %d photo(s), caption %r", caller, len(saved), caption)
        if not saved:
            self.reply(msg, "The line crackled and that photo didn't come through. Try sending it again?")
            return
        pins = [p["label"] for m in saved for p in m.get("pins", [])][:5]
        if pins:
            era = saved[0].get("era_guess")
            self.reply(msg, "📍 Pinned on your photo: " + ", ".join(pins) + "."
                       + (f"\nLooks like the {era} to us (a guess)." if era else ""))
        if caption:
            self.reply(msg, f'Your memory is on the air: "{caption}". Turn the dial to 2026 to see it. Text DELETE to take it down.')
        else:
            self.reply(msg, "Got your photo! Text a caption for this memory, like \"Grandma's kitchen, 1969\", or SKIP.")

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
