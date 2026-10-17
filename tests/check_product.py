"""Full packaged product acceptance: real model, MCP, graph, UI assets and persistence."""
import argparse
import json
import os
import secrets
import re
import subprocess
import time
import uuid
import httpx
from graphops import settings


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=8082)
    parser.add_argument('--project',default='graphops-product-check')
    args=parser.parse_args()
    if not 1024 <= args.port <= 65535:parser.error('port must be from 1024 to 65535')
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,62}',args.project):parser.error('invalid Compose project name')
    scope='product-'+uuid.uuid4().hex[:10]
    # Isolated stacks also need their own FalkorDB Browser port.
    env={**os.environ,'GRAPHOPS_ACCESS_TOKEN':secrets.token_urlsafe(32),'GRAPHOPS_HTTP_PORT':str(args.port),'GRAPHOPS_WORKSPACE':scope,'FALKORDB_BROWSER_PORT':str(args.port+1000)}
    command=['docker','compose','-p',args.project,'-f',str(settings.ROOT/'compose.yaml')]
    report={'mode':'llm','model_inference':True,'public_deployment':False,'checks':[],'success':False}
    base=f'http://127.0.0.1:{args.port}'
    def docker(*args,input=None):return subprocess.run(command+list(args),cwd=settings.ROOT,env=env,input=input,capture_output=input is not None,text=True,check=True)
    def check(name,passed,**details):
        report['checks'].append({'name':name,'passed':bool(passed),**details});print(json.dumps(report['checks'][-1]),flush=True)
        if not passed:raise RuntimeError('Acceptance check failed: '+name)
    with httpx.Client(base_url=base,timeout=30,headers={'X-GraphOps':'1'}) as client:
        def ready():
            for _ in range(120):
                try:
                    response=client.get('/api/health',timeout=2)
                    if response.status_code==200:return response.json()
                except httpx.HTTPError:pass
                time.sleep(1)
            raise RuntimeError('Packaged app did not become ready')
        def workspace(task=None):
            response=client.get('/api/workspace',params={'task':task} if task else {});response.raise_for_status();return response.json()
        def post(path,body):
            response=client.post(path,json=body);response.raise_for_status();return response.json()
        def wait(task):
            for _ in range(160):
                result=workspace(task)
                if result['selected']['job']!='running':return result
                time.sleep(1)
            raise RuntimeError('Agent did not reach a checkpoint within the acceptance budget')
        try:
            docker('up','-d','--build');ready()
            check('access_required',client.get('/api/workspace').status_code==401)
            check('bad_access_token_rejected',client.post('/api/access',json={'token':'incorrect'}).status_code==403)
            post('/api/access',{'token':env['GRAPHOPS_ACCESS_TOKEN']})
            check('authenticated_workspace',client.get('/api/workspace').status_code==200)
            if env.get('GRAPHOPS_EVENT_PROVIDER','ollama')=='ollama':
                result=docker('exec','-T','app','python','-c',"from graphops.models.router import get_model;print(get_model().batch_size)",input='')
                expected=int(env.get('GRAPHOPS_OLLAMA_BATCH_SIZE','64'))
                check('ollama_batch_setting_forwarded',int(result.stdout.strip())==expected,batch_size=expected)
            check('malformed_json_400',client.post('/api/incidents',content='{').status_code==400)
            check('json_array_400',client.post('/api/incidents',json=[]).status_code==400)
            check('oversized_body_413',client.post('/api/incidents',content='x'*9000).status_code==413)
            page=client.get('/');check('ui_html',page.status_code==200)
            assets=re.findall(r'(?:src|href)="(/assets/[^\"]+)"',page.text)
            check('built_ui_assets',bool(assets) and all(client.get(path).status_code==200 for path in assets),assets=assets)
            check('missing_asset_404',client.get('/assets/missing.js').status_code==404)
            with client.stream('GET','/api/events') as stream:check('sse_connected',next(line for line in stream.iter_lines() if line.startswith('data:')).startswith('data:'))
            status=client.get('/api/readiness').json();check('graph_lab_model_available',all(status['components'][c]['status'] in {'online','available','verified'} for c in ('graph','lab','model')))
            task=post('/api/diagnostics',{})['task'];w=wait(task)
            check('live_model_and_mcp_verification',bool(w['diagnostics'] and w['diagnostics']['success']),diagnostics=w['diagnostics'])
            source={'service':'payments','title':'Synthetic refund policy','text':'The refund review window is 72 hours. This is a synthetic policy reference.','filename':'refund-policy.md','document_type':'policy'}
            doc=post('/api/sources',source)['document'];check('source_imported',doc['source'].startswith('owned:document/') and doc['kind']=='reference')
            found=client.get('/api/search',params={'q':'72 hours','service':'payments'}).json()['documents'];check('source_search',any(d['id']==doc['id'] for d in found))
            check('source_conflict_409',client.post('/api/sources',json={**source,'text':'Changed without current revision'}).status_code==409)
            revised=post('/api/sources',{**source,'id':doc['id'],'base_revision':doc['revision'],'text':'The refund review window is 96 hours. This is a synthetic policy reference.'})['document']
            old=client.get('/api/sources',params={'id':doc['id'],'revision':doc['revision']}).json();check('immutable_source_revision',old['text']==source['text'] and revised['revision']!=doc['revision'])
            post('/api/company',{'service':'payments','operation':'owner','owner':'Payments Response'})
            task=post('/api/questions',{'service':'payments','mode':'llm','question':'Who owns payments, and how many hours is the current refund review window? Cite exact source locations and revisions.'})['task'];w=wait(task)
            summary=next((e['data'] for e in reversed(w['events']) if e['kind']=='session_finished'),{})
            check('company_answer_from_current_owned_sources',w['selected']['status']=='answered' and '96' in summary.get('summary','') and 'Payments Response' in summary.get('summary','') and revised['source'] in summary.get('citations',[]),summary=summary.get('summary'),citation_check=summary.get('citation_check'))
            for scenario,target in [('config','payments'),('worker','orders')]:
                started=time.perf_counter();task=post('/api/incidents',{'scenario':scenario,'mode':'llm'})['task'];w=wait(task)
                health={h['service']:h['http_status'] for h in w['health']}
                sessions=[e for e in w['events'] if e['kind']=='session_started']
                check('automatic_'+scenario,w['selected']['status']=='resolved' and w['selected'].get('ticket_closed') and w['selected']['target']==target and health['gateway']==200 and health['analytics']==503 and len({e['session'] for e in sessions})==2,seconds=round(time.perf_counter()-started,3))
                incident=client.get('/api/reports',params={'task':task});payload=incident.json()
                check('report_'+scenario,incident.status_code==200 and payload['schema']=='graphops.incident.v1' and payload['incident']['ticket_closed'] and not payload['truncated'])
            packets=list(w['memory'].values())
            check('memory_packet_policy_and_candidates',bool(packets) and all(p.get('policy',{}).get('max_records')==12 and p.get('authorizes_execution') is False for p in packets)
                and any('procedure_candidate' in m for p in packets for group in ('active','historical','unverified') for m in p[group] if m['kind']=='procedural'))
            post('/api/company',{'service':'payments','operation':'retire_runbook'})
            task=post('/api/incidents',{'scenario':'config','mode':'llm'})['task'];w=wait(task)
            check('retired_procedure_blocks_action',w['selected']['status']=='blocked' and not any(e['kind']=='tool' and e['data'].get('tool')=='execute_recovery' for e in w['events']))
            post('/api/company',{'service':'payments','operation':'restore_runbook'})
            post('/api/resume',{'task':task});w=wait(task);check('resume_after_published_procedure',w['selected']['status']=='resolved' and w['selected'].get('ticket_closed'))
            task=post('/api/incidents',{'scenario':'worker','mode':'llm','pause_after_handoff':True})['task'];w=wait(task)
            check('optional_pause',w['selected']['status']=='handoff')
            # Kill only this container's exact agent-worker process. The Node supervisor stays alive.
            script="import os,signal;from pathlib import Path;pids=[int(p.name) for p in Path('/proc').iterdir() if p.name.isdigit() and (p/'cmdline').exists() and b'\\0-m\\0graphops.worker\\0' in (p/'cmdline').read_bytes()];assert len(pids)==1;os.kill(pids[0],signal.SIGTERM)"
            docker('exec','-T','app','python','-c',script)
            time.sleep(2);health=ready();w=workspace(task)
            check('worker_supervisor_reconnects',health['worker_restarts']>=1 and w['selected']['status']=='handoff')
            docker('restart','app');ready();w=workspace(task);check('handoff_survives_app_restart',w['selected']['status']=='handoff')
            post('/api/resume',{'task':task});w=wait(task);check('fresh_resolver_after_restart',w['selected']['status']=='resolved' and w['selected'].get('ticket_closed'))
            task=post('/api/incidents',{'scenario':'config','mode':'llm'})['task'];post('/api/cancel',{'task':task});w=wait(task)
            check('stop_at_checkpoint',w['selected']['job']=='interrupted' and w['selected']['status']!='resolved')
            post('/api/resume',{'task':task});w=wait(task);check('resume_stopped_run',w['selected']['status']=='resolved' and w['selected'].get('ticket_closed'))
            backup=client.get('/api/backup');backup.raise_for_status();backup=backup.json();check('complete_workspace_backup',backup['schema']=='graphops.workspace.v1' and len(backup['nodes'])>30 and not backup['includes_provider_keys'])
            # Persist the graph before restarting its container. App reconnection is automatic.
            docker('exec','-T','graph','redis-cli','SAVE');docker('restart','graph');time.sleep(2)
            reconnected=False
            for _ in range(50):
                try:w=workspace(task);reconnected=True;break
                except httpx.HTTPError:time.sleep(1)
            check('graph_restart_preserves_state',reconnected and w['selected']['status']=='resolved' and any(d['id']==doc['id'] for d in w['company']['payments']['documents']))
            restored='restored-'+uuid.uuid4().hex[:10]
            restore_script="import json,sys;from graphops.workspace.backup import restore_workspace;print(json.dumps(restore_workspace(json.load(sys.stdin),sys.argv[1],9000)))"
            result=docker('exec','-T','app','python','-c',restore_script,restored,input=json.dumps(backup));restored_result=json.loads(result.stdout.strip())
            result=docker('exec','-T','app','python','-m','graphops.cli','--standalone','--workspace',restored,'--port','9000','status',input='');restored_state=json.loads(result.stdout)
            check('backup_restores_into_new_workspace',restored_result['nodes']==len(backup['nodes']) and next(h['http_status'] for h in restored_state['health'] if h['service']=='gateway')==200)
            history=client.get('/api/history',params={'q':'refund'}).json();check('history_and_change_log',bool(history['tasks']) and len(history['audits'])>=4)
            from tests.check_connected_cli import exercise_connected_cli
            report['connected_cli_commands']=exercise_connected_cli(base,env,check)
            post('/api/logout',{});check('logout_locks_workspace',client.get('/api/workspace').status_code==401)
            report['success']=all(check['passed'] for check in report['checks'])
        except Exception as exc:report['error']=str(exc)[:700] if isinstance(exc,RuntimeError) else type(exc).__name__
        finally:
            subprocess.run(command+['stop'],cwd=settings.ROOT,env=env,check=False,capture_output=True)
            folder=settings.DATA/'reports';folder.mkdir(exist_ok=True)
            (folder/'product.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
            print(json.dumps({'product_acceptance':report['success'],'checks':len(report['checks']),'error':report.get('error')}),flush=True)
    raise SystemExit(0 if report['success'] else 1)


if __name__=='__main__':main()
