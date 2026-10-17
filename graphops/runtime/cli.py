"""Terminal entry point using the same graph, Go lab and role-bound MCP agents."""
import argparse
import asyncio
import json
import sys
import os
from pathlib import Path
import getpass
from dotenv import dotenv_values
from graphops import settings
from graphops.core.synthetic import SERVICES
from graphops.models.router import configuration, preflight
from graphops.runtime.terminal import build_parser, run_connected
from graphops.runtime.terminal_display import clean


def progress(message):
    event=message.get('event',{})
    if event.get('kind')=='session_finished':
        print(f"[{event['role']}] {event['data']['summary']}",flush=True)
    elif message.get('tool'):
        print(f"[{message['tool']}] evidence={message['evidence_id']}",flush=True)


async def main(argv=None):
    args=build_parser().parse_args(argv)
    if args.command=='configure':
        path=settings.ROOT/'.env';values={k:v for k,v in dotenv_values(path).items() if v is not None} if path.exists() else {}
        defaults={'ollama':'qwen3:8b','groq':'qwen/qwen3.8-27b','openrouter':'nvidia/nemotron-3-super-120b-a12b:free'}
        values.update(GRAPHOPS_EVENT_PROVIDER=args.provider,GRAPHOPS_EVENT_MODEL=args.model or defaults[args.provider])
        if args.provider!='ollama':
            key=getpass.getpass('Provider API key (hidden): ').strip()
            if not key:raise ValueError('A provider key is required')
            values['GROQ_API_KEY' if args.provider=='groq' else 'OPENROUTER_API_KEY']=key
        if args.network:
            token=getpass.getpass('Choose a demo access token, at least 24 characters (hidden): ')
            if len(token)<24:raise ValueError('Access token is too short')
            values['GRAPHOPS_ACCESS_TOKEN']=token
        temporary=path.with_name('.env.pending')
        with temporary.open('w',encoding='utf-8') as handle:
            os.chmod(temporary,0o600)
            handle.write('\n'.join(k+'='+json.dumps(v) for k,v in values.items())+'\n')
        temporary.replace(path)
        print('Configuration saved locally. Restart the app to apply it.');return
    if args.command=='connect':
        # Writes to this workspace's graph directly; the running app sees the records on its next refresh.
        from graphops.graph.workspace import WorkspaceGraph
        from graphops.connectors.run import run as connect
        store=WorkspaceGraph(args.workspace or settings.SCOPE)
        result=connect(store,args.tool,'live' if args.live else 'sample',args.path,args.repo)
        print(json.dumps(result,indent=2));return
    if args.command=='certify':
        # Runs locally against FalkorDB and its own service fixtures; the running app is not used or changed.
        if args.provider:os.environ['GRAPHOPS_EVENT_PROVIDER']=args.provider
        if args.model:os.environ['GRAPHOPS_EVENT_MODEL']=args.model
        if not 1<=args.repeats<=10:raise ValueError('Use --repeats from 1 to 10')
        from graphops.workspace.certify import certify,CASES,HARD_CASES,QUICK
        cases=args.cases or {'standard':list(CASES),'hard':list(HARD_CASES),'all':list(CASES)+list(HARD_CASES),'quick':QUICK}[args.suite]
        label=args.label or ''.join(c if c.isalnum() else '-' for c in configuration()['model'])+('' if args.suite=='standard' or args.cases else '-'+args.suite)
        if getattr(args,'json',False):
            # JSON Lines for the app's judge check: one event per case, then a summary.
            emit=lambda event:print(json.dumps(event),flush=True)
            report=await certify(cases,args.repeats,label,out=lambda line:None,progress=emit)
            emit({'type':'certify_complete','passed':report['passed'],'runs':report['runs'],'model':report['model'],'report':'certify-'+label+'.json'})
        else:report=await certify(cases,args.repeats,label,out=lambda line:print(line,flush=True))
        if report['passed']!=report['runs']:raise SystemExit(1)
        return
    if args.command=='restore':
        if not args.workspace:raise ValueError('Restore requires --workspace NEW_NAME')
        from graphops.workspace.backup import restore_workspace,load_backup
        print(json.dumps(restore_workspace(load_backup(args.path),args.workspace,args.port),indent=2));return
    if not args.standalone:
        code=run_connected(args)
        if code:raise SystemExit(code)
        return
    if args.command not in {'run','investigate','resume','ask','doctor','status','memory','backup'}:
        raise ValueError('Use connected mode for this command. Start the app with start.ps1.')
    args.workspace=args.workspace or settings.SCOPE
    # Import after parsing so --help works without a database or running services.
    from graphops.runtime.worker import Worker
    if args.command in {'run','investigate','ask'} and args.mode=='llm':preflight()
    emit=(lambda message: print(json.dumps({'type':'progress',**message},ensure_ascii=True),flush=True)) if args.json else progress
    worker=Worker(scope=args.workspace,port=args.port,emit=emit)
    try:
        if args.command=='status':
            snapshot=worker.snapshot()
            print(json.dumps({'workspace':snapshot['workspace'],'model':configuration(),'health':snapshot['health'],'tasks':snapshot['tasks']},indent=2));return
        if args.command=='memory':
            print(json.dumps(worker.snapshot()['memory'].get(args.service,{}),indent=2));return
        if args.command=='backup':
            report=await worker.dispatch('backup',{})
            with Path(args.path).open('x',encoding='utf-8') as handle:json.dump(report,handle,indent=2)
            print('Backup saved. It includes company source text and excludes provider keys.');return
        body=({'scenario':args.scenario,'mode':args.mode,'pause_after_handoff':args.command=='investigate'} if args.command in {'run','investigate'} else
              {'task':args.task} if args.command=='resume' else {} if args.command=='doctor' else {'question':args.question,'mode':args.mode,'service':args.service})
        reply=await worker.dispatch({'run':'start','investigate':'start','resume':'resume','ask':'question','doctor':'diagnose'}[args.command],body)
        await worker.active
        task=worker.store.runs.get(reply['task'])
        print(json.dumps(task,indent=None if args.json else 2))
        if task.get('last_error'):raise RuntimeError(task['last_error'])
        if args.command=='doctor':
            print(json.dumps(worker.last_diagnostics,indent=None if args.json else 2))
            if not worker.last_diagnostics or not worker.last_diagnostics['success']:raise RuntimeError('System checks did not pass')
        if task['status']=='handoff' and not args.json:print(f"Next: python -m graphops.cli --standalone resume {task['id']}")
    finally:await worker.close()


if __name__=='__main__':
    try:asyncio.run(main())
    except KeyboardInterrupt:
        print('Detached from terminal. Connected server jobs continue; use watch TASK_ID to reconnect.',file=sys.stderr)
        raise SystemExit(130)
    except Exception as exc:
        while isinstance(exc,BaseExceptionGroup) and exc.exceptions:exc=exc.exceptions[0]
        print(clean(str(exc)[:900]) if isinstance(exc,(RuntimeError,ValueError,OSError)) else type(exc).__name__,file=sys.stderr)
        raise SystemExit(1)
