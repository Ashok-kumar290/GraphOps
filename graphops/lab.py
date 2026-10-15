"""Client and lifecycle for the Go lab. Health comes from actual HTTP requests."""
from pathlib import Path
import json
import os
import secrets
import subprocess
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from graphops import settings

SERVICES = ("gateway", "orders", "payments", "analytics")
DEPENDENCIES = {"gateway": "orders", "orders": "payments"}
SCENARIOS = {"config": {"label": "Payments configuration", "target": "payments", "action": "restore_config"},
             "worker": {"label": "Orders worker", "target": "orders", "action": "restart_worker"}}


def request(url, data=None, admin=False):
    headers = {"Content-Type": "application/json"}
    if admin: headers["X-Lab-Token"] = os.getenv("GRAPHOPS_LAB_TOKEN", "")
    req = Request(url, data=json.dumps(data).encode() if data is not None else None, headers=headers)
    try:
        with urlopen(req, timeout=4) as response: return {**json.loads(response.read()), "http_status": response.status}
    except HTTPError as exc:
        with exc: return {**json.loads(exc.read()), "http_status": exc.code}
    except (OSError, URLError, TimeoutError) as exc:
        return {"http_status": 0, "healthy": False, "error": "source_unavailable", "transport_error": type(exc).__name__}


class Lab:
    def __init__(self, directory: Path, port: int):
        self.directory, self.port, self.process, self.log = directory, port, None, None
        directory.mkdir(parents=True, exist_ok=True)

    def url(self, service):
        if service not in SERVICES: raise ValueError("Unknown lab service")
        return f"http://127.0.0.1:{self.port+SERVICES.index(service)}"

    def state(self):
        result = request(f"http://127.0.0.1:{self.port+4}/state", admin=True)
        if result["http_status"] != 200: raise RuntimeError("Go lab is unavailable")
        return result

    def inject(self, scenario, distractor=True):
        result = request(f"http://127.0.0.1:{self.port+4}/inject", {"scenario": scenario, "distractor": distractor}, admin=True)
        if result["http_status"] != 200: raise ValueError(result.get("error", "Injection failed"))
        return result

    def start(self):
        binary = Path(os.getenv("GRAPHOPS_LAB_BINARY", str(settings.DATA / ("lab.exe" if os.name == "nt" else "lab"))))
        if not binary.is_file(): raise RuntimeError("Build the Go lab first with event/build.ps1 or Docker Compose")
        os.environ["GRAPHOPS_LAB_TOKEN"] = secrets.token_urlsafe(32)
        self.log = (self.directory / "lab.log").open("ab")
        self.process = subprocess.Popen([str(binary.resolve()), "--watch-parent", "--port", str(self.port), "--state", str(self.directory / "lab.json")],
            stdin=subprocess.PIPE, stdout=self.log, stderr=self.log, env=os.environ.copy(), creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        for _ in range(100):
            if self.process.poll() is not None:
                self.close(); raise RuntimeError("Go lab failed to start; inspect .runtime/lab.log for port conflicts")
            if request(f"http://127.0.0.1:{self.port+4}/state", admin=True)["http_status"] == 200: return self
            time.sleep(.05)
        self.close(); raise RuntimeError("Go lab startup timed out")

    def close(self):
        if self.process and self.process.poll() is None:
            if self.process.stdin: self.process.stdin.close()
            try: self.process.wait(timeout=5)
            except subprocess.TimeoutExpired: self.process.kill(); self.process.wait(timeout=5)
        if self.log: self.log.close()
        self.process = None
