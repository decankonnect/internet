#!/usr/bin/env python3
import json
import os
import socket
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from urllib.request import urlopen, Request

PORT = int(os.environ.get("PORT", "8000"))
ROOT = os.path.dirname(os.path.abspath(__file__))

class SpeedTestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Upload-Size, Accept")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/ip":
            self.handle_ip()
            return
        if path == "/api/ping":
            self.handle_ping()
            return
        if path == "/api/download":
            self.handle_download(parsed)
            return
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/upload":
            self.handle_upload()
            return
        self.send_error(404, "Not found")

    def handle_ip(self):
        try:
            req = Request("https://api.ipify.org?format=json", headers={"Accept": "application/json"})
            with urlopen(req, timeout=10) as response:
                payload = json.loads(response.read().decode("utf-8"))
                ip_value = payload.get("ip")
                if not ip_value:
                    raise ValueError("No IP in response")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
                self.send_header("Pragma", "no-cache")
                self.send_header("Expires", "0")
                self.end_headers()
                self.wfile.write(json.dumps({"ip": ip_value}).encode("utf-8"))
                return
        except Exception as exc:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Unable to determine public IP", "detail": str(exc)}).encode("utf-8"))

    def handle_ping(self):
        self.send_response(204)
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.end_headers()

    def handle_download(self, parsed):
        params = parse_qs(parsed.query)
        size_param = params.get("size", ["8388608"])[0]
        try:
            size = max(1048576, min(int(size_param), 25 * 1024 * 1024))
        except ValueError:
            size = 8 * 1024 * 1024

        payload = (b"A" * size)
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Content-Disposition", "attachment; filename=decan-download.bin")
        self.end_headers()
        self.wfile.write(payload)

    def handle_upload(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length)
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.end_headers()
        self.wfile.write(json.dumps({
            "ok": True,
            "receivedBytes": len(body),
            "message": "Upload received successfully."
        }).encode("utf-8"))


def main():
    try:
        server = ThreadingHTTPServer(("0.0.0.0", PORT), SpeedTestHandler)
        print(f"Decan backend running at http://localhost:{PORT}")
        print(f"IP: http://localhost:{PORT}/api/ip")
        print(f"Ping: http://localhost:{PORT}/api/ping")
        print(f"Download: http://localhost:{PORT}/api/download?size=10485760")
        print(f"Upload: http://localhost:{PORT}/api/upload")
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")

if __name__ == "__main__":
    main()
