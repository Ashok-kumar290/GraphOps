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


def progress(message):
    event=message.get('event',{})
    if event.get('kind')=='session_finished':
        print(f"[{event['role']}] {event['data']['summary']}",flush=True)
    elif message.get('tool'):
        print(f"[{message['tool']}] evidence={message['evidence_id']}",flush=True)


async def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace',default=settings.SCOPE)
    parser.add_argument('--port',type=int,default=settings.LAB_PORT)
    commands=parser.add_subparsers(dest='command',required=True)
    for name in ('run','investigate'):
        investigate=commands.add_parser(name);investigate.add_argument('--scenario',choices=['config','worker'],default='config');investigate.add_argument('--mode',choices=['llm','scripted'],default='llm')
    resume=commands.add_parser('resume');resume.add_argument('task')
    commands.add_parser('status')
    commands.add_parser('doctor')
    backup=commands.add_parser('backup');backup.add_argument('path')
    restore=commands.add_parser('restore');restore.add_argument('path')
    configure=commands.add_parser('configure');configure.add_argument('--provider',choices=['ollama','groq','openrouter'],default='ollama');configure.add_argument('--model');configure.add_argument('--network',action='store_true')
    memory=commands.add_parser('memory');memory.add_argument('service',choices=SERVICES)
    company=commands.add_parser('ask');company.add_argument('question');company.add_argument('--mode',choices=['llm','scripted'],default='llm')
    company.add_argument('--service',choices=SERVICES,default='payments')
    args=parser.parse_args()
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
    if args.command=='restore':
        from graphops.workspace.backup import restore_workspace,load_backup
        print(json.dumps(restore_workspace(load_backup(args.path),args.workspace,args.port),indent=2));return
    # Import after parsing so --help works without a database or running services.
    from graphops.runtime.worker import Worker
    if args.command in {'run','investigate','ask'} and args.mode=='llm':preflight()
    worker=Worker(scope=args.workspace,port=args.port,emit=progress)
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
        print(json.dumps(task,indent=2))
        if task.get('last_error'):raise RuntimeError(task['last_error'])
        if args.command=='doctor':
            print(json.dumps(worker.last_diagnostics,indent=2))
            if not worker.last_diagnostics or not worker.last_diagnostics['success']:raise RuntimeError('System checks did not pass')
        if task['status']=='handoff':print(f"Next: python -m graphops.cli resume {task['id']}")
    finally:await worker.close()


if __name__=='__main__':
    try:asyncio.run(main())
    except Exception as exc:
        while isinstance(exc,BaseExceptionGroup) and exc.exceptions:exc=exc.exceptions[0]
        print(str(exc)[:900] if isinstance(exc,(RuntimeError,ValueError)) else type(exc).__name__,file=sys.stderr)
        raise SystemExit(1)
