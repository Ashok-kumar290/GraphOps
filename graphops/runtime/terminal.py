"""Connected product commands, durable progress following and live monitoring."""
import argparse
import json
import os
from pathlib import Path
import time
from graphops import settings
from graphops.core.synthetic import SERVICES
from graphops.runtime.terminal_client import ProductClient, TerminalError
from graphops.runtime.terminal_display import Display, table


def positive(value):
    number=float(value)
    if not 0.1<=number<=3600:raise argparse.ArgumentTypeError('Use a value between 0.1 and 3600 seconds')
    return number


def build_parser():
    parser=argparse.ArgumentParser(description='GraphOps company copilot: connected CLI, progress and process monitoring.')
    parser.add_argument('--url',default=os.getenv('GRAPHOPS_URL','http://127.0.0.1:8080'),help='Running app origin; remote servers require HTTPS')
    parser.add_argument('--standalone',action='store_true',help='Own the local worker/lab instead of connecting to the web app')
    parser.add_argument('--workspace',default=None,help='Expected connected workspace, or standalone/restore workspace')
    parser.add_argument('--port',type=int,default=settings.LAB_PORT,help='Standalone or restore lab port')
    parser.add_argument('--json',action='store_true',help='JSON responses; progress and monitoring use JSON Lines')
    parser.add_argument('--plain',action='store_true',help='Disable terminal screen refresh')
    commands=parser.add_subparsers(dest='command',required=True)
    def command(name,help):
        sub=commands.add_parser(name,help=help)
        sub.add_argument('--json',action='store_true',default=argparse.SUPPRESS)
        sub.add_argument('--plain',action='store_true',default=argparse.SUPPRESS)
        return sub
    def follow(sub):
        sub.add_argument('--detach',action='store_true',help='Return the task ID immediately')
        sub.add_argument('--timeout',type=positive,default=600)
        sub.add_argument('--interval',type=positive,default=1)
    for name in ('run','investigate'):
        sub=command(name,'Run automatic recovery' if name=='run' else 'Investigate and pause at the saved handoff')
        sub.add_argument('--scenario',choices=['config','worker'],default='config')
        sub.add_argument('--mode',choices=['llm','scripted'],default='llm');follow(sub)
    sub=command('resume','Resume a persisted incident');sub.add_argument('task');follow(sub)
    sub=command('stop','Request a stop at the next checkpoint');sub.add_argument('task');follow(sub)
    sub=command('ask','Ask the company agent using current sources');sub.add_argument('question')
    sub.add_argument('--service',choices=SERVICES,default='payments');sub.add_argument('--mode',choices=['llm','scripted'],default='llm');follow(sub)
    sub=command('doctor','Verify actual model inference and a fresh MCP session');follow(sub)
    command('status','Show one operational dashboard')
    command('modules','Show all six product module states')
    sub=command('monitor','Continuously monitor modules, jobs, services and owned processes')
    sub.add_argument('--task');sub.add_argument('--once',action='store_true');sub.add_argument('--interval',type=positive,default=2)
    sub.add_argument('--duration',type=positive,help='Stop after this many seconds; otherwise Ctrl+C to detach')
    sub=command('watch','Replay durable progress and follow a task until its checkpoint')
    sub.add_argument('task');sub.add_argument('--after',default='');sub.add_argument('--timeout',type=positive,default=600);sub.add_argument('--interval',type=positive,default=1)
    sub=command('events','Read a page of durable tool/session events')
    sub.add_argument('task');sub.add_argument('--after',default='');sub.add_argument('--limit',type=int,default=200)
    sub=command('company','Read company context or explicitly update its owner/procedure')
    sub.add_argument('--service',choices=SERVICES,default='payments')
    edits=sub.add_mutually_exclusive_group();edits.add_argument('--owner');edits.add_argument('--retire-runbook',action='store_true');edits.add_argument('--restore-runbook',action='store_true')
    sub=command('graph','Inspect actual graph relationships and dependency paths');sub.add_argument('--service',choices=SERVICES,default='gateway')
    sub=command('memory','Retrieve current memory applicability labels');sub.add_argument('service',choices=SERVICES,nargs='?',default='payments')
    sub=command('search','Search current company source text');sub.add_argument('query');sub.add_argument('--service',choices=SERVICES)
    sub=command('source','Read a current or historical source revision');sub.add_argument('id');sub.add_argument('--revision')
    sub=command('import','Import a text/Markdown reference source');sub.add_argument('file',type=Path)
    sub.add_argument('--service',choices=SERVICES,default='payments');sub.add_argument('--title',required=True)
    sub.add_argument('--type',choices=['note','runbook','decision','policy','incident','chat'],default='note')
    sub.add_argument('--id');sub.add_argument('--base-revision')
    sub=command('history','Search persisted runs and workspace changes');sub.add_argument('--search',default='');sub.add_argument('--before',default='')
    sub=command('report','Read or save a complete incident report');sub.add_argument('task');sub.add_argument('--out',type=Path)
    sub=command('backup','Save a complete logical workspace backup');sub.add_argument('path',type=Path)
    sub=command('restore','Restore a backup into a new local workspace');sub.add_argument('path')
    sub=command('configure','Configure a provider/access token locally using hidden prompts')
    sub.add_argument('--provider',choices=['ollama','groq','openrouter'],default='ollama');sub.add_argument('--model');sub.add_argument('--network',action='store_true')
    sub=command('certify','Run every graph-governed case against a model in isolated workspaces and score measured effects')
    sub.add_argument('--provider',choices=['ollama','groq','openrouter','gemini','compatible'],help='Override the configured provider for this run')
    sub.add_argument('--model',help='Override the configured model ID for this run')
    sub.add_argument('--suite',choices=['standard','hard','all'],default='standard',help='standard: core cases; hard: adversarial cases')
    sub.add_argument('--cases',nargs='+',choices=['config','worker','changed_runbook','removed_edge','repeated','company',
                     'prompt_injection','memory_poisoning','unknown_fault','double_fault','self_healed','concurrent_resolvers'],
                     help='Run only these cases instead of a suite')
    sub.add_argument('--repeats',type=int,default=1);sub.add_argument('--label',help='Report name; defaults to the model ID')
    sub=command('demo','Exercise company, graph, agent, action, memory and workspace modules together')
    sub.add_argument('--scenario',choices=['config','worker'],default='config');sub.add_argument('--mode',choices=['llm','scripted'],default='llm')
    sub.add_argument('--timeout',type=positive,default=600);sub.add_argument('--interval',type=positive,default=1)
    return parser


def write_export(path,data):
    # Refuse overwrites before any remote export/mutation is requested by callers.
    with path.open('x',encoding='utf-8') as handle:json.dump(data,handle,indent=2)


def follow_task(client,display,task_id,timeout=600,interval=1,after='',stopped=False):
    started=time.monotonic();cursor=after;last_status=None
    while True:
        if time.monotonic()-started>=timeout:
            raise TerminalError(f'Watch timed out. Task {task_id} continues on the server. Use watch {task_id} to reconnect.')
        try:
            report=client.get('/api/monitor',task=task_id)
            if report.get('degraded'):raise TerminalError(report.get('error','Worker unavailable'))
            # Drain every page. A late observer can replay more than 500 events.
            for _ in range(100):
                page=client.get('/api/run-events',task=task_id,after=cursor,limit=200)
                for event in page['events']:display.event(event)
                cursor=page['cursor']
                if not page['has_more']:break
            else:raise TerminalError('Event backlog exceeds this watch budget. Continue with watch --after '+cursor)
        except TerminalError as exc:
            if str(exc).startswith(('HTTP 400','HTTP 401','HTTP 403','HTTP 404')):raise
            display.emit('reconnecting',{'task':task_id,'message':str(exc)},'Connection interrupted; retrying saved progress. '+str(exc))
            time.sleep(interval);continue
        task=report.get('selected')
        if not task:raise TerminalError('Run not found: '+task_id)
        status=(task['status'],task['job'])
        if status!=last_status:
            display.emit('checkpoint',{'task':task_id,'status':task['status'],'job':task['job'],'cursor':cursor},
                f"[{task_id}] status={task['status']} job={task['job']}")
            last_status=status
        if task['job']!='running':
            interrupted=task['job']=='interrupted'
            success=not interrupted and not task.get('last_error') and task['status'] in {'resolved','answered','checked','handoff'}
            if stopped and interrupted:success=True
            result={'task':task,'success':success,'cursor':cursor,'elapsed_seconds':round(time.monotonic()-started,3)}
            label=('STOPPED' if stopped else 'INTERRUPTED') if interrupted else task['status'].upper()
            if interrupted:result['resume_command']=('.\\graphops.ps1' if os.name=='nt' else 'python -m graphops.cli')+' resume '+task_id
            display.emit('complete',result,f"[{task_id}] {label} | {result['elapsed_seconds']}s"+
                (f" | {task['last_error']}" if task.get('last_error') else ''))
            if interrupted and not display.json_mode:display.emit('next_step',{'command':result['resume_command']},'Resume with: '+result['resume_command'])
            if not success and task.get('blocker'):display.emit('blocker',{'message':task['blocker']},task['blocker'])
            return result
        time.sleep(interval)


def accepted(client,display,path,body,args,stopped=False):
    result=client.post(path,body)
    display.emit('accepted',result,f"Task {result['task']} accepted. Connected to {client.url}.")
    if args.detach:return {'success':True,'task':{'id':result['task']},'detached':True}
    return follow_task(client,display,result['task'],args.timeout,args.interval,stopped=stopped)


def monitor(client,display,args):
    start=time.monotonic()
    while True:
        try:report=client.get('/api/monitor',task=getattr(args,'task',None))
        except TerminalError as exc:
            report={'degraded':True,'error':str(exc),'processes':[],'modules':[]}
            display.dashboard(report)
            if getattr(args,'once',False) or args.command=='status':return 1
            if str(exc).startswith(('HTTP 400','HTTP 401','HTTP 403')):raise
        else:
            display.dashboard(report)
            if getattr(args,'once',False) or args.command=='status':return int(bool(report.get('degraded')))
        duration=getattr(args,'duration',None)
        if duration and time.monotonic()-start>=duration:return int(bool(report.get('degraded')))
        time.sleep(min(args.interval,max(.01,duration-(time.monotonic()-start))) if duration else args.interval)


def demo_evidence(task_id, report, memory, live, paths, mode):
    """Require evidence belonging to this drill, rather than workspace totals."""
    task=report.get('incident',{})
    target=task.get('target')
    outcome=task.get('outcome') or {}
    sessions={role:sorted({event['session'] for event in report.get('events',[])
        if event.get('kind')=='session_started' and event.get('role')==role
        and event.get('session') and event.get('data',{}).get('mode')==mode})
        for role in ('investigator','resolver')}
    records=[record for group in ('active','historical') for record in memory.get(group,[])
        if record.get('task')==task_id and record.get('service')==target
        and record.get('verified') is True and record.get('source')]
    selected=live.get('selected') or {}
    checks={
        'matching_incident':task.get('id')==task_id and task.get('mode')==mode and not task.get('question'),
        'graph_path':bool(target) and (target==task.get('service') or any(
            path.get('services',[])[:1]==[task.get('service')]
            and path.get('services',[])[-1:]==[target] for path in paths)),
        'distinct_sessions':any(i!=r for i in sessions['investigator'] for r in sessions['resolver']),
        'measured_recovery':task.get('status')=='resolved' and not task.get('last_error')
            and outcome.get('success') is True and outcome.get('target')==target
            and (outcome.get('after') or {}).get('http_status')==200
            and (outcome.get('incident') or {}).get('http_status')==200,
        'ticket_closed':task.get('ticket_closed') is True,
        'matching_memory':all(any(record.get('kind')==kind for record in records)
            for kind in ('episodic','procedural','semantic')),
        'workspace_idle':not live.get('degraded') and live.get('busy') is False
            and selected.get('id')==task_id and selected.get('job')=='idle',
    }
    return {'checks':checks,'sessions':sessions,'memory_ids':sorted({record['id'] for record in records}),
        'success':all(checks.values())}


def demo(client,display,args):
    started=time.monotonic()
    def step(module,detail):display.emit('module',{'module':module,'detail':detail},f'\n[{module.upper()}] {detail}')
    step('Company knowledge','Import/retrieve the synthetic CLI drill policy')
    title='CLI synthetic incident policy'
    docs=client.get('/api/search',q=title,service='payments')['documents']
    document=next((doc for doc in docs if doc['title']==title),None)
    if document is None:
        document=client.post('/api/sources',{'service':'payments','title':title,'filename':'graphops-cli-drill.md',
            'document_type':'policy','text':'For this synthetic CLI drill, the incident review window is 48 hours. Recovery still requires the approved service runbook.'})['document']
    display.emit('source',{'source':document['source'],'revision':document['revision']},f"Source: {document['source']} rev={document['revision']}")
    reply=client.post('/api/questions',{'service':'payments','mode':args.mode,'question':f'According to "{title}", what is the incident review window? Cite the exact source location.'})
    answer=follow_task(client,display,reply['task'],args.timeout,args.interval)
    if not answer['success']:return 2
    if args.mode=='llm':
        answer_report=client.get('/api/reports',task=reply['task'])
        final=next((event['data'] for event in reversed(answer_report['events']) if event['kind']=='session_finished'),{})
        if document['source'] not in final.get('citations',[]):
            raise TerminalError('Company answer did not cite the CLI drill policy; the six-module demo did not pass.')
    step('Graph','Read connected paths from FalkorDB')
    graph=client.get('/api/graph',service='gateway')
    paths=graph['topology']['paths']
    if not paths:raise TerminalError('The graph has no supported dependency path for this drill.')
    display.emit('graph',{'graph':graph},'\n'.join(' -> '.join(path['services']) for path in paths))
    step('Agent','Start investigator and fresh resolver sessions')
    step('Actions','Watch plan validation, recovery and measured HTTP verification')
    reply=client.post('/api/incidents',{'scenario':args.scenario,'mode':args.mode,'pause_after_handoff':False})
    result=follow_task(client,display,reply['task'],args.timeout,args.interval)
    if not result['success']:return 2
    target=result['task']['target']
    step('Memory','Retrieve applicability labels after the verified outcome')
    memory=client.get('/api/memory',service=target)
    counts={name:len(memory[name]) for name in ('active','historical','unverified','conflicts')}
    display.emit('memory',{'service':target,'counts':counts},', '.join(f'{name}={count}' for name,count in counts.items()))
    step('Workspace','Retrieve the saved report and operational monitor')
    report=client.get('/api/reports',task=reply['task'])
    live=client.get('/api/monitor',task=reply['task'])
    evidence=demo_evidence(reply['task'],report,memory,live,paths,args.mode)
    success=evidence['success']
    display.emit('demo_complete',{'success':success,'task':reply['task'],'question_task':answer['task']['id'],
        'modules':['Company knowledge','Graph','Agent','Actions','Memory','Workspace'],'mode':args.mode,
        'model_inference':args.mode=='llm','company_policy_citation_checked':args.mode=='llm',
        'elapsed_seconds':round(time.monotonic()-started,3),'evidence':evidence},
        f"\nSIX-MODULE DEMO {'PASSED' if success else 'FAILED'} | task={reply['task']} | mode={args.mode}"+
        ('' if success else '\nFailed checks: '+', '.join(name for name,passed in evidence['checks'].items() if not passed)))
    return 0 if success else 2


def run_connected(args):
    display=Display(args.json,args.plain)
    with ProductClient(args.url) as client:
        if args.workspace:
            state=client.get('/api/monitor')
            if state.get('workspace')!=args.workspace:raise TerminalError('The connected server is not the expected workspace. No command was submitted.')
        command=args.command
        if command in {'status','monitor'}:return monitor(client,display,args)
        if command=='watch':return 0 if follow_task(client,display,args.task,args.timeout,args.interval,args.after)['success'] else 2
        if command=='demo':return demo(client,display,args)
        if command=='modules':
            report=client.get('/api/monitor');display.value(report,table(['MODULE','STATE','DETAIL'],[[m['name'],m['status'],m['detail']] for m in report.get('modules',[])]))
            return int(bool(report.get('degraded')))
        if command in {'run','investigate','resume','stop','ask','doctor'}:
            if command in {'run','investigate'}:path,body='/api/incidents',{'scenario':args.scenario,'mode':args.mode,'pause_after_handoff':command=='investigate'}
            elif command in {'resume','stop'}:path,body='/api/'+('cancel' if command=='stop' else 'resume'),{'task':args.task}
            elif command=='ask':path,body='/api/questions',{'question':args.question,'service':args.service,'mode':args.mode}
            else:path,body='/api/diagnostics',{}
            result=accepted(client,display,path,body,args,stopped=command=='stop')
            return 0 if result['success'] else 2
        if command=='events':
            page=client.get('/api/run-events',task=args.task,after=args.after,limit=args.limit)
            if args.json:display.value(page)
            else:
                for event in page['events']:display.event(event)
                display.emit('cursor',{'cursor':page['cursor'],'has_more':page['has_more']},f"Next cursor: {page['cursor']} | more={page['has_more']}")
            return 0
        if command=='company':
            operation='owner' if args.owner is not None else 'retire_runbook' if args.retire_runbook else 'restore_runbook' if args.restore_runbook else None
            if operation:client.post('/api/company',{'service':args.service,'operation':operation,**({'owner':args.owner} if operation=='owner' else {})})
            data=client.get('/api/company-context',service=args.service)
            display.value(data,'Owners: '+', '.join(owner['name'] for owner in data['owners'])+'\n'+table(['DOCUMENT','TYPE','REVISION'],[[d['id'],d['kind'],d['revision']] for d in data['documents']]))
        elif command=='graph':
            data=client.get('/api/graph',service=args.service)
            display.value(data,f"Graph: {len(data['diagram']['nodes'])} entities / {len(data['diagram']['edges'])} edges\n"+'\n'.join(' -> '.join(p['services']) for p in data['topology']['paths']))
        elif command=='memory':display.value(client.get('/api/memory',service=args.service))
        elif command=='search':
            data=client.get('/api/search',q=args.query,service=args.service)
            display.value(data,table(['SOURCE ID','TITLE','REVISION'],[[d['id'],d['title'],d['revision']] for d in data['documents']]))
        elif command=='source':display.value(client.get('/api/sources',id=args.id,revision=args.revision))
        elif command=='import':
            if args.file.stat().st_size>65536:raise TerminalError('Choose a text/Markdown file under 64 KB.')
            body={'service':args.service,'title':args.title,'text':args.file.read_text(encoding='utf-8'),
                  'filename':args.file.name,'document_type':args.type}
            if args.id:body['id']=args.id
            if args.base_revision:body['base_revision']=args.base_revision
            data=client.post('/api/sources',body);display.value(data)
        elif command=='history':
            data=client.get('/api/history',q=args.search,before=args.before)
            display.value(data,table(['RUN','STATE','MODE','TITLE'],[[t['id'],t['status'],t['mode'],t['title']] for t in data['tasks']])+f"\nNext cursor: {data.get('next_cursor') or '-'}")
        elif command in {'report','backup'}:
            path=args.path if command=='backup' else args.out
            if path and path.exists():raise TerminalError('Output file already exists; choose a new path.')
            data=client.get('/api/backup') if command=='backup' else client.get('/api/reports',task=args.task)
            if path:
                write_export(path,data);display.value({'saved':str(path),'schema':data['schema']},'Saved '+str(path))
            else:display.value(data)
        else:raise TerminalError('This command is not available in connected mode.')
        return 0
