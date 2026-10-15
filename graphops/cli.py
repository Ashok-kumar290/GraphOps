"""Terminal entry point using the same graph, Go lab and role-bound MCP agents."""
import argparse
import asyncio
import json
import sys
from graphops import settings
from graphops.lab import SERVICES
from graphops.models import configuration, preflight


def progress(message):
    event=message.get('event',{})
    if event.get('kind')=='session_finished':
        print(f"[{event['role']}] {event['data']['summary']}",flush=True)
    elif message.get('tool'):
        print(f"[{message['tool']}] evidence={message['evidence_id']}",flush=True)


async def main():
    parser=argparse.ArgumentParser(description=__doc__)
    commands=parser.add_subparsers(dest='command',required=True)
    investigate=commands.add_parser('investigate');investigate.add_argument('--scenario',choices=['config','worker'],default='config');investigate.add_argument('--mode',choices=['llm','scripted'],default='llm')
    resume=commands.add_parser('resume');resume.add_argument('task')
    commands.add_parser('status')
    memory=commands.add_parser('memory');memory.add_argument('service',choices=SERVICES)
    company=commands.add_parser('ask');company.add_argument('question');company.add_argument('--mode',choices=['llm','scripted'],default='llm')
    args=parser.parse_args()
    # Import after parsing so --help works without a database or running services.
    from graphops.worker import Worker
    if args.command in {'investigate','ask'} and args.mode=='llm':preflight()
    worker=Worker(emit=progress)
    try:
        if args.command=='status':
            snapshot=worker.snapshot()
            print(json.dumps({'workspace':snapshot['workspace'],'model':configuration(),'health':snapshot['health'],'tasks':snapshot['tasks']},indent=2));return
        if args.command=='memory':
            print(json.dumps(worker.snapshot()['memory'].get(args.service,{}),indent=2));return
        body=({'scenario':args.scenario,'mode':args.mode,'pause_after_handoff':True} if args.command=='investigate' else
              {'task':args.task} if args.command=='resume' else {'question':args.question,'mode':args.mode})
        reply=await worker.dispatch({'investigate':'start','resume':'resume','ask':'question'}[args.command],body)
        await worker.active
        task=worker.store.task(reply['task'])
        print(json.dumps(task,indent=2))
        if task.get('last_error'):raise RuntimeError(task['last_error'])
        if task['status']=='handoff':print(f"Next: python -m graphops.cli resume {task['id']}")
    finally:await worker.close()


if __name__=='__main__':
    try:asyncio.run(main())
    except Exception as exc:
        while isinstance(exc,BaseExceptionGroup) and exc.exceptions:exc=exc.exceptions[0]
        print(str(exc)[:900] if isinstance(exc,(RuntimeError,ValueError)) else type(exc).__name__,file=sys.stderr)
        raise SystemExit(1)
