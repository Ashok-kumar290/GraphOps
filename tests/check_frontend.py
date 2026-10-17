"""Render and operate the real React app against an isolated live Docker backend.

This is a DOM integration check, not browser layout/visual review. Network calls,
SSE, FalkorDB, Go services, MCP and model inference are real. Only browser file
download delivery is captured by the driver instead of invoking an OS save dialog.
"""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import time
import uuid
import httpx
from graphops import settings
from tests.check_fresh_setup import clean_environment


def main():
    scope='frontend-'+uuid.uuid4().hex[:10]
    port=8084
    with socket.socket() as probe:probe.bind(('127.0.0.1',port))
    env=clean_environment(os.environ,'qwen3:8b',64)
    env.update(GRAPHOPS_ACCESS_TOKEN=secrets.token_urlsafe(32),GRAPHOPS_HTTP_PORT=str(port),GRAPHOPS_WORKSPACE=scope,FALKORDB_BROWSER_PORT=str(port+1000),
               GRAPHOPS_FRONTEND_URL=f'http://127.0.0.1:{port}',GRAPHOPS_FRONTEND_WORKSPACE=scope)
    command=['docker','compose','-p','graphops-'+scope,'-f',str(settings.ROOT/'compose.yaml')]
    folder=settings.DATA/'reports'/('frontend-live-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S'))
    folder.mkdir(parents=True)
    report={'success':False,'workspace':scope,'port':port,'model':'qwen3:8b','provider':'ollama',
            'real_http_sse_graph_go_mcp_model':True,'browser_visual_review':False,
            'download_delivery':'DOM anchor and JSON Blob captured; OS save dialog not tested',
            'started_at':datetime.now(timezone.utc).isoformat()}
    started=time.perf_counter()
    try:
        subprocess.run(command+['up','-d','--build'],cwd=settings.ROOT,env=env,check=True)
        for _ in range(100):
            try:
                if httpx.get(env['GRAPHOPS_FRONTEND_URL']+'/api/health',timeout=2).status_code==200:break
            except httpx.HTTPError:pass
            time.sleep(1)
        else:raise RuntimeError('Isolated frontend backend did not become ready')
        npm=shutil.which('npm.cmd' if os.name=='nt' else 'npm')
        if not npm:raise RuntimeError('Install the web development dependencies with npm ci first')
        result=subprocess.run([npm,'run','test:live','--','--reporter=json','--outputFile='+str(folder/'vitest.json')],cwd=settings.ROOT/'web',env=env,check=False)
        report['exit_code']=result.returncode
        raw=folder/'vitest.json'
        if raw.exists():
            suite=json.loads(raw.read_text(encoding='utf-8'))
            report.update(tests=suite['numTotalTests'],passed=suite['numPassedTests'],failed=suite['numFailedTests'])
            report['checks']=[{'name':test['fullName'],'passed':test['status']=='passed','duration_ms':test.get('duration')}
                              for group in suite['testResults'] for test in group['assertionResults']]
            report['success']=result.returncode==0 and suite['success']
    except Exception as exc:report['error']=str(exc) if isinstance(exc,RuntimeError) else type(exc).__name__
    finally:
        stopped=subprocess.run(command+['stop'],cwd=settings.ROOT,env=env,capture_output=True,check=False)
        report['containers_stopped']=stopped.returncode==0
        report['duration_seconds']=round(time.perf_counter()-started,3)
        (folder/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'frontend_live_success':report['success'],'report':str(folder/'report.json'),'tests':report.get('tests')}),flush=True)
    raise SystemExit(0 if report['success'] else 1)


if __name__=='__main__':main()
