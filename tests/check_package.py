"""Build/start the real Compose package, check access, restart and recovery, then stop it."""
import argparse
import json
import os
import secrets
import subprocess
import time
import httpx
from graphops import settings


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--mode',choices=['scripted','llm'],default='scripted');args=parser.parse_args()
    env={**os.environ,'GRAPHOPS_ACCESS_TOKEN':secrets.token_urlsafe(32)}
    command=['docker','compose','-p','graphops-package-check','-f',str(settings.ROOT/'compose.yaml')]
    base='http://127.0.0.1:8081';report={'success':False,'public_deployment':False,'mode':args.mode,'model_inference':args.mode=='llm'}
    def wait_ready():
        for _ in range(120):
            try:
                if httpx.get(base+'/api/health',timeout=2).status_code==200:return
            except httpx.HTTPError:pass
            time.sleep(1)
        raise RuntimeError('Container did not become ready')
    def wait_task(client,task):
        for _ in range(100):
            w=client.get(base+'/api/workspace',params={'task':task}).json()
            if w['selected']['job']!='running':return w
            time.sleep(1)
        raise RuntimeError('Packaged agent did not complete within the check budget')
    try:
        print('Building and starting isolated Compose package.',flush=True)
        subprocess.run(command+['up','-d','--build'],cwd=settings.ROOT,env=env,check=True)
        wait_ready()
        report['unauthenticated_api_status']=httpx.get(base+'/api/workspace').status_code
        with httpx.Client(timeout=30) as client:
            client.headers['X-GraphOps']='1'
            login=client.post(base+'/api/access',json={'token':env['GRAPHOPS_ACCESS_TOKEN']});login.raise_for_status()
            snapshot=client.get(base+'/api/workspace');report['authenticated_api_status']=snapshot.status_code;report['model']=snapshot.json()['model']
            report['page_http']=client.get(base).status_code
            with client.stream('GET',base+'/api/events') as stream:
                report['event_stream_connected']=next(line for line in stream.iter_lines() if line.startswith('data:')).startswith('data:')
            task=client.post(base+'/api/incidents',json={'scenario':'worker','mode':args.mode}).json()['task']
            w=wait_task(client,task);report['handoff_before_restart']=w['selected']['status']=='handoff'
            print('Handoff saved. Restarting packaged app before resolver.',flush=True)
            subprocess.run(command+['restart','app'],cwd=settings.ROOT,env=env,check=True)
            wait_ready();w=client.get(base+'/api/workspace',params={'task':task}).json()
            report['handoff_survived_restart']=w['selected']['status']=='handoff'
            client.post(base+'/api/resume',json={'task':task}).raise_for_status();w=wait_task(client,task)
            selected=w['selected'];report['resolved']=selected['status']=='resolved';report['ticket_closed']=selected.get('ticket_closed',False)
            report['gateway_http']=next(h['http_status'] for h in w['health'] if h['service']=='gateway')
            report['analytics_http']=next(h['http_status'] for h in w['health'] if h['service']=='analytics')
            report['memories_after_restart']=sum(len(p[g]) for p in w['memory'].values() for g in ('active','historical','unverified'))
            report['success']=all((report['unauthenticated_api_status']==401,report['authenticated_api_status']==200,report['page_http']==200,
                report['event_stream_connected'],report['handoff_before_restart'],report['handoff_survived_restart'],report['resolved'],report['ticket_closed'],report['gateway_http']==200,report['analytics_http']==503,report['memories_after_restart']>=3))
    except Exception as exc:
        report['error']=str(exc)[:500] if isinstance(exc,RuntimeError) else type(exc).__name__
    finally:
        subprocess.run(command+['stop'],cwd=settings.ROOT,env=env,check=False)
        folder=settings.DATA/'reports';folder.mkdir(exist_ok=True)
        (folder/'package.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        (folder/('package-'+args.mode+'.json')).write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps(report),flush=True)
    raise SystemExit(0 if report['success'] else 1)


if __name__=='__main__':main()
