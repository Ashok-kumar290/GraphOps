"""Create a local source ZIP from a clean Git commit. Does not publish anything."""
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import subprocess
import sys
import zipfile


ROOT = Path(__file__).resolve().parents[1]
REQUIRED = (
    'README.md', 'QUERIES.md', 'PROVENANCE.md', 'DEMO.md', 'WALKTHROUGH.md',
    'submission/entry.json', 'requirements.lock', 'web/package-lock.json',
    'lab/main.go', 'compose.yaml',
)


def git(*arguments):
    return subprocess.check_output(['git', *arguments], cwd=ROOT)


def main():
    if git('status', '--porcelain', '--untracked-files=normal').strip():
        raise ValueError('Commit the intended source changes first. The archive contains only the committed version.')
    revision = git('rev-parse', 'HEAD').decode().strip()
    payload = git('archive', '--format=zip', '--prefix=graphops/', 'HEAD')
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        files = {name for name in archive.namelist() if not name.endswith('/')}
        if any('graphops/' + name not in files for name in REQUIRED):
            raise ValueError('The committed archive is missing a required setup or submission document.')
        forbidden = {'.git', '.venv', '.runtime', 'node_modules', '__pycache__', '.pytest_cache'}
        for name in files:
            parts = PurePosixPath(name).parts
            local_env = any((p.lower().endswith('.env') or p.lower().startswith('.env.')) and p.lower() != '.env.example' for p in parts)
            generated_web = 'graphops/web/dist/' in name
            if not parts or parts[0] != 'graphops' or '..' in parts or any(p.lower() in forbidden for p in parts) or local_env or generated_web:
                raise ValueError('Archive contains a local-only or unexpected path; review tracked files.')
        entry = json.loads(archive.read('graphops/submission/entry.json'))
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')
    directory = ROOT / '.runtime' / 'releases'
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f'graphops-source-{revision[:8]}-{stamp}.zip'
    with path.open('xb') as handle:
        handle.write(payload)
    manifest = {
        'source_commit': revision,
        'archive': path.name,
        'sha256': hashlib.sha256(payload).hexdigest(),
        'bytes': len(payload),
        'source_files': len(files),
        'required_documents_present': True,
        'local_only_paths_excluded': True,
        'public_publication_performed': False,
        'submission_status': entry['status'],
        'pending': entry['pending'],
        'note': 'Local draft source package. This does not verify public links, video, participant review or final form requirements.',
    }
    with path.with_suffix('.json').open('x', encoding='utf-8') as handle:
        json.dump(manifest, handle, indent=2)
    print(json.dumps({**manifest, 'archive': str(path), 'manifest': str(path.with_suffix('.json'))}, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
