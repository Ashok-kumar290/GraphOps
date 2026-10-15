"""Verify two separate CLI processes resume the same graph and lab state."""
import json
import os
import subprocess
import sys
import uuid
from graphops import settings
from graphops.graph.workspace import WorkspaceGraph
from tests.test_event import free_port


def main():
    scope='cli-check-'+uuid.uuid4().hex[:12]
    env={**os.environ,'GRAPHOPS_WORKSPACE':scope,'GRAPHOPS_LAB_PORT':str(free_port())}
    store=WorkspaceGraph(scope)
    report={'mode':'scripted','separate_processes':True,'success':False}
    try:
        def run(*args):
            result=subprocess.run([sys.executable,'-m','graphops.cli','--standalone',*args],cwd=settings.ROOT,env=env,capture_output=True,text=True,timeout=90)
            if result.returncode:raise RuntimeError(result.stderr[-1000:])
            return result
        run('investigate','--scenario','config','--mode','scripted')
        task=store.runs.list()[0];report['persisted_handoff']=task['status']=='handoff'
        run('resume',task['id'])
        task=store.runs.get(task['id']);report['resolved']=task['status']=='resolved';report['ticket_closed']=bool(task.get('ticket_closed'))
        report['memories']=len(store.memory.list('payments'))
        report['sessions']=len({e['session'] for e in store.runs.events(task['id']) if e['kind']=='session_started'})
        report['success']=all((report['persisted_handoff'],report['resolved'],report['ticket_closed'],report['memories']==3,report['sessions']==2))
    finally:
        store.graph.delete()
        folder=settings.DATA/'reports';folder.mkdir(exist_ok=True)
        (folder/'cli.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps(report),flush=True)
    raise SystemExit(0 if report['success'] else 1)


if __name__=='__main__':main()
