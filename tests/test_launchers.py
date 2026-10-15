"""Exercise Windows launchers from a caller folder against a local HTTP stub."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import unittest


ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(os.name == 'nt' and shutil.which('powershell'), 'Windows PowerShell launcher checks')
class LauncherPaths(unittest.TestCase):
    def setUp(self):
        self.imports = []
        imports = self.imports

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def reply(self, value):
                body = json.dumps(value).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self):
                if self.path.startswith('/api/reports?'):
                    self.reply({'schema': 'launcher-test', 'task': 'TEST'})
                else:
                    self.send_error(404)

            def do_POST(self):
                if self.path == '/api/sources':
                    imports.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
                    self.reply({'id': 'test-source'})
                else:
                    self.send_error(404)

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.close_server)
        self.url = f'http://127.0.0.1:{self.server.server_port}'
        self.launchers = [ROOT / 'graphops.ps1']
        parent_launcher = ROOT.parent / 'graphops.ps1'
        if parent_launcher.exists() and (ROOT.parent / 'event') == ROOT:
            self.launchers.append(parent_launcher)

    def close_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)

    def invoke(self, launcher, directory, *arguments):
        result = subprocess.run(
            ['powershell', '-NoProfile', '-File', str(launcher), '--url', self.url, *arguments],
            cwd=directory, capture_output=True, text=True, timeout=30,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_relative_export_uses_caller_directory(self):
        for launcher in self.launchers:
            with self.subTest(launcher=launcher), tempfile.TemporaryDirectory(prefix='GraphOps caller ') as directory:
                self.invoke(launcher, directory, 'report', 'TEST', '--out', 'report.json')
                report = json.loads((Path(directory) / 'report.json').read_text(encoding='utf-8'))
                self.assertEqual(report, {'schema': 'launcher-test', 'task': 'TEST'})

    def test_relative_import_uses_caller_directory(self):
        for launcher in self.launchers:
            with self.subTest(launcher=launcher), tempfile.TemporaryDirectory(prefix='GraphOps caller ') as directory:
                (Path(directory) / 'policy.md').write_text('Synthetic caller policy.', encoding='utf-8')
                self.invoke(launcher, directory, 'import', 'policy.md', '--title', 'Caller policy')
                self.assertEqual(self.imports[-1]['text'], 'Synthetic caller policy.')
                self.assertEqual(self.imports[-1]['filename'], 'policy.md')
