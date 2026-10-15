"""Exercise the running app's default automatic workflow with real model inference."""
from datetime import datetime, timezone
import json
import os
import time
import httpx
from graphops import settings


def main():
    report={'checked_at':datetime.now(timezone.utc).isoformat(),'mode':'llm','automatic_run':True,'success':False,'cases':[]}
    with httpx.Client(base_url='http://127.0.0.1:8080',timeout=30,headers={'X-GraphOps':'1'}) as client:
        try:
            response=client.get('/api/workspace')
            if response.status_code==401:
                login=client.post('/api/access',json={'token':os.getenv('GRAPHOPS_ACCESS_TOKEN','')});login.raise_for_status()
                response=client.get('/api/workspace')
            response.raise_for_status();report['model']=response.json()['model']
            report['page_http']=client.get('/').status_code
            for scenario,target in [('config','payments'),('worker','orders')]:
                started=time.perf_counter()
                # Omit pause_after_handoff: this verifies the default used by Run agent.
                response=client.post('/api/incidents',json={'scenario':scenario,'mode':'llm'})
                response.raise_for_status();task=response.json()['task']
                for _ in range(150):
                    response=client.get('/api/workspace',params={'task':task});response.raise_for_status();workspace=response.json()
                    if workspace['selected']['job']!='running':break
                    time.sleep(1)
                else:raise RuntimeError('Automatic agent exceeded the live check time budget')
                current=workspace['selected'];events=workspace['events']
                sessions=[event for event in events if event['kind']=='session_started']
                health={item['service']:item['http_status'] for item in workspace['health']}
                separate_sessions=len(sessions)==2 and [s['role'] for s in sessions]==['investigator','resolver'] and sessions[0]['session']!=sessions[1]['session']
                item={'scenario':scenario,'task':task,'status':current['status'],'target':current.get('target'),
                      'ticket_closed':bool(current.get('ticket_closed')),'fresh_resolver_session':separate_sessions,
                      'gateway_http':health['gateway'],'target_http':health[target],'unrelated_analytics_http':health['analytics'],
                      'model_requests':sum(e['kind'] in {'model_timing','model_response_retry'} for e in events),
                      'seconds':round(time.perf_counter()-started,3),'error':current.get('last_error')}
                item['passed']=all((current['status']=='resolved',current.get('target')==target,item['ticket_closed'],
                    separate_sessions,health['gateway']==200,health[target]==200,health['analytics']==503,item['model_requests']>0,not item['error']))
                report['cases'].append(item);print(json.dumps(item),flush=True)
                if not item['passed']:break
            report['success']=report['page_http']==200 and len(report['cases'])==2 and all(c['passed'] for c in report['cases'])
        except Exception as exc:
            report['error']=str(exc)[:500] if isinstance(exc,RuntimeError) else type(exc).__name__
        finally:
            folder=settings.DATA/'reports';folder.mkdir(exist_ok=True)
            (folder/'live-app.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
            print(json.dumps({'live_app_success':report['success'],'error':report.get('error')}),flush=True)
    raise SystemExit(0 if report['success'] else 1)


if __name__=='__main__':main()
