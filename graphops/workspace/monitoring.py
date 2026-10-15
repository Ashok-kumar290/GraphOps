"""Operational overview assembled from the same graph state used by UI and agents."""
import os
import copy
from graphops.core.identity import now
from graphops.workspace.processes import sample_process


def monitor_workspace(worker, task_id=None):
    lab = worker.lab.process
    processes = [sample_process(os.getpid(), 'Python agent worker'),
                 sample_process(lab.pid if lab else None, 'Go service simulator', lab is not None and lab.poll() is None)]
    result = {'schema': 'graphops.monitor.v1', 'observed_at': now(), 'processes': processes,
              'readiness': copy.deepcopy(worker.readiness()), 'degraded': False}
    try:
        state = worker.snapshot(task_id or worker.runtime_status()['active_task'])
        selected = state['selected']
        events = state['events']
        sessions = [event for event in events if event['kind'] == 'session_started']
        checkpoints = [event for event in events if event['kind'] == 'tool' and event['data'].get('tool') == 'checkpoint']
        last_event = events[-1] if events else None
        documents = sum(len(company['documents']) for company in state['company'].values())
        memories = {group: sum(len(packet[group]) for packet in state['memory'].values())
                    for group in ('active', 'historical', 'unverified', 'conflicts')}
        result.update(workspace=state['workspace'], model=state['model'], busy=state['busy'],
                      stopping=state['stopping'], active_task=state['active_task'], selected=selected,
                      health=state['health'], last_event=last_event, sessions=sessions,
                      memory=memories, graph={'nodes':len(state['graph']['nodes']), 'edges':len(state['graph']['edges'])})
        if checkpoints:
            runtime = checkpoints[-1]['data'].get('result', {}).get('runtime', {})
            result['mcp'] = {'last_reported_pid': runtime.get('mcp_pid'),
                             'observed_at': checkpoints[-1]['time'], 'session': checkpoints[-1]['session'],
                             'role': checkpoints[-1]['role'], 'status': 'last observed; not a process heartbeat'}
        running = state['busy'] and selected and state['active_task'] == selected['id']
        tools = [event['data'].get('tool') for event in events if event['kind'] == 'tool']
        result['modules'] = [
            {'name':'Company knowledge', 'status':'ready', 'detail':f'{documents} current source documents'},
            {'name':'Graph', 'status':'ready', 'detail':f"{result['graph']['nodes']} entities / {result['graph']['edges']} relationships"},
            {'name':'Agent', 'status':'running' if running else 'idle',
             'detail':f"{len(sessions)} sessions in selected run; {len(tools)} tool results in recent window"},
            {'name':'Actions', 'status':selected['status'] if selected and not selected.get('question') else 'idle',
             'detail':selected.get('outcome',{}).get('action','No measured action in selected run') if selected else 'No selected run'},
            {'name':'Memory', 'status':'ready', 'detail':f"{memories['active']} active / {memories['historical']} historical / {memories['unverified']} unverified"},
            {'name':'Workspace', 'status':'running' if state['busy'] else 'idle', 'detail':'One shared workspace; one active job'},
        ]
    except Exception:
        # A monitor remains useful when the graph cannot supply the workspace.
        result.update(degraded=True, error='Workspace state is unavailable. Check graph readiness.',
                      modules=[{'name': name, 'status':'unavailable', 'detail':'Workspace state unavailable'}
                               for name in ('Company knowledge','Graph','Agent','Actions','Memory','Workspace')])
        result['readiness']['components']['graph'] = {'status':'unavailable', 'message':'Workspace graph query failed'}
    return result
