"""Exercise the real connected terminal against an authenticated product server."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from graphops import settings


def exercise_connected_cli(url, env, check):
    commands=0
    def run(*args, expected=0):
        nonlocal commands
        result=subprocess.run([sys.executable,'-m','graphops.cli','--url',url,'--json',*args],
            cwd=settings.ROOT,env=env,capture_output=True,text=True,encoding='utf-8',timeout=240)
        commands+=1
        if result.returncode!=expected:
            raise RuntimeError('Connected CLI '+args[0]+' failed: '+result.stderr[-500:]+' '+result.stdout[-700:])
        return [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
    with tempfile.TemporaryDirectory(prefix='graphops-terminal-') as folder:
        directory=Path(folder)
        report=run('monitor','--once')[0]['monitor']
        check('cli_live_monitor_process_metrics',not report['degraded'] and len(report['modules'])==6 and len(report['processes'])==3 and all(p['pid'] and p['rss_bytes']>0 and p['cpu_seconds']>=0 for p in report['processes']))
        check('cli_all_module_statuses',len(run('modules')[0]['modules'])==6)
        company=run('company','--service','orders')[0]
        original=company['owners'][0]['name']
        updated=run('company','--service','orders','--owner','Terminal Operations')[0]
        check('cli_company_ownership',updated['owners'][0]['name']=='Terminal Operations')
        run('company','--service','orders','--owner',original)
        source=directory/'terminal-policy.md';source.write_text('Synthetic terminal support policy: the review window is 61 hours.',encoding='utf-8')
        doc=run('import',str(source),'--service','orders','--title','Terminal support policy','--type','policy')[0]['document']
        source.write_text('Synthetic terminal support policy: the review window is 73 hours.',encoding='utf-8')
        revised=run('import',str(source),'--service','orders','--title','Terminal support policy','--type','policy','--id',doc['id'],'--base-revision',doc['revision'])[0]['document']
        old=run('source',doc['id'],'--revision',doc['revision'])[0]
        found=run('search','73 hours','--service','orders')[0]
        check('cli_source_import_revision_and_search',old['text'].find('61 hours')>=0 and revised['revision']!=doc['revision'] and any(d['id']==doc['id'] for d in found['documents']))
        graph=run('graph','--service','gateway')[0]
        check('cli_actual_graph_paths',any(p['services']==['gateway','orders','payments'] for p in graph['topology']['paths']))
        answers=run('ask','According to Terminal support policy, how many hours is the review window? Cite its exact source.','--service','orders')
        answer=next(r['event']['data'] for r in reversed(answers) if r['type']=='event' and r['event']['kind']=='session_finished')
        check('cli_company_answer_current_source',answers[-1]['success'] and '73' in answer['summary'] and revised['source'] in answer.get('citations',[]))
        demo=run('demo','--scenario','worker')
        final=demo[-1];task=final['task']
        check('cli_six_module_live_demo',final['type']=='demo_complete' and final['success'] and final['model_inference'] and final['company_policy_citation_checked'] and len(final['modules'])==6,
              task=task,seconds=final['elapsed_seconds'])
        events=[r['event'] for r in demo if r.get('type')=='event']
        roles={event['role'] for event in events if event['kind']=='session_started'}
        check('cli_live_steps_sessions_and_memory',{'company','investigator','resolver'}<=roles and any(e['kind']=='memory_saved' for e in events) and any(e['kind']=='model_request_started' for e in events))
        first=run('events',task,'--limit','3')[0]
        second=run('events',task,'--limit','3','--after',first['cursor'])[0]
        replay=run('watch',task,'--after',first['cursor'])
        check('cli_event_cursor_and_reconnect',first['has_more'] and not {e['id'] for e in first['events']} & {e['id'] for e in second['events']} and replay[-1]['success'])
        packet=run('memory','orders')[0]
        check('cli_memory_navigation',len(packet['active'])+len(packet['historical'])>=3)
        history=run('history','--search',task)[0]
        path=directory/'incident.json';run('report',task,'--out',str(path))
        incident=json.loads(path.read_text(encoding='utf-8'))
        check('cli_history_and_report',len(history['tasks'])==1 and incident['incident']['ticket_closed'])
        path=directory/'workspace.json';run('backup',str(path));backup=json.loads(path.read_text(encoding='utf-8'))
        check('cli_complete_backup',backup['schema']=='graphops.workspace.v1' and not backup['includes_provider_keys'])
        # A detached CLI job keeps running on the server; stopping is explicit.
        detached=run('run','--scenario','config','--detach')[-1]
        stopping=run('stop',detached['task'])
        resumed=run('resume',detached['task'])
        check('cli_detach_stop_and_resume',stopping[-1]['success'] and stopping[-1]['task']['job']=='interrupted' and resumed[-1]['task']['status']=='resolved')
        diagnostic=run('doctor')
        component=next(r['event']['data'] for r in diagnostic if r['type']=='event' and r['event']['kind']=='component_check')
        check('cli_live_model_and_mcp_diagnostics',diagnostic[-1]['success'] and component['success'])
        frames=run('monitor','--duration','.2','--interval','.1','--plain')
        check('cli_monitor_duration_and_json_lines',len(frames)>=2 and all(r['type']=='monitor' for r in frames),commands=commands)
    return commands
