import json
import os
import sqlite3
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT_DIR = Path(__file__).resolve().parents[1]
STATIC_DIR = ROOT_DIR / "gantt-tool"
DB_PATH = Path(__file__).resolve().parent / "data.db"


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS app_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                state_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        row = conn.execute("SELECT id FROM app_state WHERE id = 1").fetchone()
        if not row:
            conn.execute(
                "INSERT INTO app_state (id, state_json, updated_at) VALUES (1, ?, ?)",
                (json.dumps({"projects": [], "activeProjectId": None}, ensure_ascii=False), utc_now_iso()),
            )


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self._write_json({"ok": True, "storage": "sqlite", "db": str(DB_PATH)})
            return

        if parsed.path == "/api/state":
            with get_conn() as conn:
                row = conn.execute("SELECT state_json, updated_at FROM app_state WHERE id = 1").fetchone()
            payload = json.loads(row["state_json"]) if row else {"projects": [], "activeProjectId": None}
            payload["updatedAt"] = row["updated_at"] if row else None
            self._write_json(payload)
            return

        if parsed.path == "/" or parsed.path == "":
            self.path = "/index.html"
        return super().do_GET()

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/state":
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(content_length)

        try:
            payload = json.loads(raw.decode("utf-8"))
            if not isinstance(payload, dict) or not isinstance(payload.get("projects"), list):
                raise ValueError("Invalid payload")
        except Exception:
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid JSON payload")
            return

        now = utc_now_iso()
        with get_conn() as conn:
            conn.execute(
                "UPDATE app_state SET state_json = ?, updated_at = ? WHERE id = 1",
                (json.dumps(payload, ensure_ascii=False), now),
            )

        self._write_json({"ok": True, "updatedAt": now})

    def _write_json(self, payload, status=HTTPStatus.OK):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    init_db()
    host = os.environ.get("GANTT_HOST", "127.0.0.1")
    requested_port = int(os.environ.get("GANTT_PORT", "8081"))
    candidate_ports = [requested_port, 18080, 18081, 19090]
    # Keep order and remove duplicates.
    candidate_ports = list(dict.fromkeys(candidate_ports))

    server = None
    bound_port = None
    for port in candidate_ports:
        try:
            server = ThreadingHTTPServer((host, port), Handler)
            bound_port = port
            break
        except OSError as exc:
            # WinError 10048 / errno 98 are common "address already in use" signals.
            if getattr(exc, "errno", None) in (98, 10048):
                print(f"Port {port} is already in use, trying next...")
                continue
            raise

    if server is None or bound_port is None:
        raise RuntimeError(f"Cannot bind server. Tried ports: {candidate_ports}")

    print(f"Server running at http://{host}:{bound_port}")
    if bound_port != requested_port:
        print(f"Requested port {requested_port} was unavailable, auto-switched to {bound_port}")
    print(f"Static dir: {STATIC_DIR}")
    print(f"DB: {DB_PATH}")
    server.serve_forever()
