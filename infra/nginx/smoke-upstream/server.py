import base64
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit


class SmokeHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        self._respond()

    def do_POST(self):
        self._respond()

    def do_PUT(self):
        self._respond()

    def do_PATCH(self):
        self._respond()

    def do_DELETE(self):
        self._respond()

    def log_message(self, format_string, *args):
        return

    def _respond(self):
        request = urlsplit(self.path)
        query = parse_qs(request.query)
        body_size = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(body_size)

        if request.path == "/smoke/timeout":
            time.sleep(65)

        payload = json.dumps({
            "method": self.command,
            "path": self.path,
            "body_base64": base64.b64encode(body).decode("ascii"),
            "authorization": self.headers.get("Authorization"),
            "idempotency_key": self.headers.get("Idempotency-Key"),
            "request_id": self.headers.get("X-Request-ID"),
            "real_ip": self.headers.get("X-Real-IP"),
            "forwarded_for": self.headers.get("X-Forwarded-For"),
            "forwarded_proto": self.headers.get("X-Forwarded-Proto"),
            "forwarded_port": self.headers.get("X-Forwarded-Port"),
            "forwarded_host": self.headers.get("X-Forwarded-Host"),
        }).encode("utf-8")
        status = int(query.get("status", ["201"])[0])

        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Connection", "close")
        self.end_headers()
        try:
            self.wfile.write(payload)
        except BrokenPipeError:
            pass


ThreadingHTTPServer(("0.0.0.0", 8080), SmokeHandler).serve_forever()
