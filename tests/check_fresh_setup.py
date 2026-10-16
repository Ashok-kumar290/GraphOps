"""Rehearse the committed source in a fresh directory and isolated Docker project.

The host needs the development Python dependencies for the acceptance driver.
The app installs its own dependencies inside Docker. No .env, .venv, node_modules,
lab binary, built frontend, credentials or existing workspace is copied.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
import secrets
from pathlib import Path, PurePosixPath
import socket
import subprocess
import sys
import time
import uuid
import zipfile


ROOT = Path(__file__).resolve().parents[1]
PRIVATE_ENV = {'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'GOOGLE_API_KEY',
               'GEMINI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY',
               'PYTHONPATH', 'COMPOSE_FILE', 'COMPOSE_PROJECT_NAME',
               'COMPOSE_ENV_FILES', 'COMPOSE_PROFILES'}


def clean_environment(environ, model, batch):
    env = {key: value for key, value in environ.items()
           if not key.upper().startswith(('GRAPHOPS_', 'FALKORDB_'))
           and key.upper() not in PRIVATE_ENV}
    env.update(GRAPHOPS_EVENT_PROVIDER='ollama', GRAPHOPS_EVENT_MODEL=model,
               GRAPHOPS_OLLAMA_BATCH_SIZE=str(batch), PYTHONIOENCODING='utf-8',
               COMPOSE_DISABLE_ENV_FILE='1')
    return env


def inspect_archive(archive):
    """Reject an unexpected private/build artifact before extracting our archive."""
    required = {'README.md', 'QUERIES.md', 'Dockerfile', 'compose.yaml',
                'requirements.lock', 'web/package-lock.json', 'tests/check_product.py'}
    with zipfile.ZipFile(archive) as source:
        names = set(source.namelist())
        for name in names:
            path = PurePosixPath(name)
            if path.is_absolute() or '..' in path.parts or '\\' in name or ':' in name:
                raise RuntimeError('Archive contains an unsafe path')
            if any(part in {'.git', '.runtime', '.venv', 'node_modules', '__pycache__'} for part in path.parts):
                raise RuntimeError('Archive contains a private or generated directory')
            if any((part == '.env' or part.startswith('.env.') or part.endswith('.env'))
                   and not part.endswith('.example') for part in path.parts):
                raise RuntimeError('Archive contains a local environment file')
            if name.startswith('web/dist/'):
                raise RuntimeError('Archive contains built frontend assets')
        if not required <= names:
            raise RuntimeError('Archive is missing required setup files')
        return sum(not item.is_dir() for item in source.infolist())


def main():
    # Docker/Vite emit Unicode even when Windows pipes default to a legacy code page.
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ref', default='HEAD', help='Committed Git revision to rehearse')
    parser.add_argument('--port', type=int, default=8083)
    parser.add_argument('--model', default='qwen3:8b')
    parser.add_argument('--batch', type=int, default=64)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535: parser.error('port must be from 1024 to 65535')
    if not 32 <= args.batch <= 1024: parser.error('batch must be from 32 to 1024')
    # Fail before creating a project if this would collide with an existing app.
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', args.port))
    revision = subprocess.check_output(['git', 'rev-parse', '--verify', args.ref+'^{commit}'], cwd=ROOT, text=True).strip()
    identifier = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+uuid.uuid4().hex[:6]
    folder = ROOT/'.runtime'/'fresh-setup'/identifier
    folder.mkdir(parents=True)
    checkout = folder/'source'
    checkout.mkdir()
    archive = folder/'source.zip'
    report = {'success': False, 'source_commit': revision, 'project': 'graphops-fresh-'+identifier.lower(),
              'port': args.port, 'provider': 'ollama', 'model': args.model, 'batch_size': args.batch,
              'copied_local_configuration': False, 'app_dependencies_installed_in_docker': True,
              'host_python_is_acceptance_driver': True, 'browser_visual_review': False,
              'started_at': datetime.now(timezone.utc).isoformat()}
    started = time.perf_counter()
    try:
        subprocess.run(['git', 'archive', '--format=zip', '--output='+str(archive), revision], cwd=ROOT, check=True)
        report['archive_sha256'] = hashlib.sha256(archive.read_bytes()).hexdigest()
        report['source_files'] = inspect_archive(archive)
        with zipfile.ZipFile(archive) as source: source.extractall(checkout)
        env = clean_environment(os.environ, args.model, args.batch)
        print('Fresh committed source: '+revision, flush=True)
        print('Isolated Compose project: '+report['project'], flush=True)
        with (folder/'acceptance.log').open('w', encoding='utf-8') as log:
            with subprocess.Popen([sys.executable, '-m', 'tests.check_product', '--port', str(args.port),
                                        '--project', report['project']], cwd=checkout, env=env,
                                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                       text=True, encoding='utf-8', errors='replace') as process:
                for line in process.stdout:
                    log.write(line); log.flush()
                    print(line, end='', flush=True)
                report['acceptance_exit_code'] = process.wait()
        product = checkout/'.runtime'/'reports'/'product.json'
        if product.exists(): report['acceptance'] = json.loads(product.read_text(encoding='utf-8'))
        report['success'] = report['acceptance_exit_code']==0 and report.get('acceptance',{}).get('success',False)
    except Exception as exc:
        report['error'] = type(exc).__name__
    finally:
        # Also stop this exact project if the host driver fails before its own cleanup.
        if (checkout/'compose.yaml').exists():
            cleanup_env=clean_environment(os.environ,args.model,args.batch)
            cleanup_env['GRAPHOPS_ACCESS_TOKEN']=secrets.token_urlsafe(32)
            try:
                stopped=subprocess.run(['docker','compose','-p',report['project'],'-f',str(checkout/'compose.yaml'),'stop'],
                                       cwd=checkout,env=cleanup_env,capture_output=True,timeout=60)
                report['containers_stopped']=stopped.returncode==0
            except (OSError,subprocess.TimeoutExpired):report['containers_stopped']=False
        report['duration_seconds'] = round(time.perf_counter()-started,3)
        (folder/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'fresh_setup_success':report['success'],'report':str(folder/'report.json')}),flush=True)
    raise SystemExit(0 if report['success'] else 1)


if __name__=='__main__': main()
