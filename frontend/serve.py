"""Serve the front end for development, with byte ranges for media.

    python3 serve.py          (from frontend/, port 8080)
    python3 serve.py 9000     (another port)

`python3 -m http.server` sends every file whole and ignores Range requests,
so video and audio can't seek, and each clip holds a connection open until
it has downloaded completely. With a few clips loading, Chrome runs out of
connections to the server and new clips sit at 0:00. This server answers
Range requests (206 Partial Content), keeps connections alive, and labels
.m4a as audio/mp4.
"""
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

TYPES = {".m4a": "audio/mp4", ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".js": "text/javascript"}
RANGE = re.compile(r"bytes=(\d*)-(\d*)$")


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"  # keep-alive, so clips don't each need a new connection

    def guess_type(self, path):
        return TYPES.get(os.path.splitext(path)[1].lower()) or super().guess_type(path)

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_head(self):
        match = RANGE.match(self.headers.get("Range", "").strip())
        path = self.translate_path(self.path)
        if not match or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        start_s, end_s = match.groups()
        if start_s:
            start, end = int(start_s), int(end_s) if end_s else size - 1
        else:  # "bytes=-N": the last N bytes
            start, end = max(0, size - int(end_s or 0)), size - 1
        end = min(end, size - 1)
        if start > end:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self._remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        remaining = getattr(self, "_remaining", None)
        if remaining is None:
            return super().copyfile(source, outputfile)
        self._remaining = None
        try:
            while remaining > 0:
                chunk = source.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                outputfile.write(chunk)
                remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass  # the player moved on (seek or channel change); that's normal

    def log_message(self, fmt, *args):
        pass  # quiet: media players make many range requests


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f"Serving the front end at http://localhost:{port}")
    ThreadingHTTPServer(("", port), Handler).serve_forever()
