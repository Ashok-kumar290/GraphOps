"""Hosted/local inference through actual MCP and HTTP. Reports all errors and measured effects."""
import argparse
import asyncio
import json
from pathlib import Path
import tempfile
import time
import uuid
from graphops import settings
from graphops.agents.runner import Agent
from graphops.actions.lab import Lab, request
from graphops.models.router import configuration
from graphops.graph.workspace import WorkspaceGraph
from tests.test_event import free_port


async def main():
    parser=argparse.ArgumentParser();parser.add_argument('--mode',choices=['llm','scripted'],default='llm');parser.add_argument('--cases',nargs='+',default=['config','worker','changed_runbook','repeated']);parser.add_argument('--label',default='local')
    args=parser.parse_args()
    if not args.label.replace('-','').isalnum():raise ValueError('Use an alphanumeric report label')
    directory=settings.DATA/'reports';directory.mkdir(exist_ok=True)
    results=[];trace=(directory/('evaluation-'+args.label+'.jsonl')).open('w',encoding='utf-8')
    for case in args.cases:
        if case not in {'config','worker','changed_runbook','repeated','company'}:raise ValueError('Unknown case')
        store=WorkspaceGraph('eval-'+uuid.uuid4().hex[:12]);port=free_port();start=time.perf_counter()
        with tempfile.TemporaryDirectory(prefix='graphops-eval-') as folder:
            lab=Lab(Path(folder),port).start();store.seed(port)
            events=[]
            def emit(value):
                events.append(value);trace.write(json.dumps({'case':case,**value})+'\n');trace.flush()
            try:
                task=store.runs.create(case,'Handle checkout incident',args.mode)['id']
                scenario='worker' if case=='worker' else 'config'
                if case=='company':
                    await Agent(store,port,emit).run(task,'company','Who owns payments, which procedure applies, and which decision supports recovery? Cite source locations and revisions.',args.mode)
                else:
                    lab.inject(scenario)
                    if case=='changed_runbook':
                        d=store.company.document('payments-runbook');store.company.put(d['id'],d['service'],d['kind'],d['title'],'Old procedure retired. Review required.','v2',{'action':'requires_review'})
                    agent=Agent(store,port,emit)
                    await agent.run(task,'investigator','Investigate checkout using graph paths and current evidence. Hand off a supported cause.',args.mode)
                    if store.runs.get(task)['status']=='handoff':await Agent(WorkspaceGraph(store.scope),port,emit).run(task,'resolver','Resume the handoff using memory and current procedures. Complete a verified recovery and the ticket, or record a blocker.',args.mode)
                    if case=='repeated' and store.runs.get(task)['status']=='resolved':
                        lab.inject('config');task=store.runs.create(case,'Handle checkout incident again',args.mode)['id']
                        await Agent(WorkspaceGraph(store.scope),port,emit).run(task,'investigator','Investigate the new incident using current graph evidence and relevant past memory.',args.mode)
                        if store.runs.get(task)['status']=='handoff':await Agent(WorkspaceGraph(store.scope),port,emit).run(task,'resolver','Resolve this repeated incident using applicable memory and fresh evidence.',args.mode)
                current=store.runs.get(task);state=lab.state();expected=0 if case in {'changed_runbook','company'} else 2 if case=='repeated' else 1
                retrieved=[e for e in store.runs.events(task) if e['kind']=='tool' and e['data']['tool']=='recall_memory']
                reused=any(r['data']['result'].get('active') or r['data']['result'].get('historical') for r in retrieved)
                passes=state['action_count']==expected and (current['status']=='resolved' and current.get('ticket_closed') if expected else True)
                if case=='changed_runbook':
                    passes=passes and current['status']=='blocked' and current.get('target')=='payments' and any(e['kind']=='tool' and e['data']['tool']=='prepare_recovery' and e['data']['result'].get('terminal') for e in store.runs.events(task))
                if case=='company':
                    company_events=store.runs.events(task)
                    summaries=[e['data'].get('summary','') for e in company_events if e['kind']=='session_finished']
                    passes=passes and any(e['kind']=='tool' and e['data']['tool']=='company_context' for e in company_events)
                    if args.mode=='llm':passes=passes and all(s in '\n'.join(summaries) for s in ('Payments Platform','fixture:event/payments-runbook','fixture:event/payments-decision'))
                if case=='repeated':passes=passes and reused
                result={'case':case,'passed':bool(passes),'status':current['status'],'action_count':state['action_count'],
                        'ticket_closed':bool(current.get('ticket_closed')),'prior_memory_retrieved':reused,
                        'gateway_http':request(lab.url('gateway')+'/health')['http_status'],'analytics_http':request(lab.url('analytics')+'/health')['http_status'],
                        'seconds':round(time.perf_counter()-start,3)}
                if expected:result['passed']=result['passed'] and result['gateway_http']==200 and result['analytics_http']==503
                results.append(result)
            except Exception as exc:
                while isinstance(exc,BaseExceptionGroup) and exc.exceptions:exc=exc.exceptions[0]
                results.append({'case':case,'passed':False,'error':str(exc)[:700] if isinstance(exc,(RuntimeError,ValueError)) else type(exc).__name__,'seconds':round(time.perf_counter()-start,3)})
            finally:
                print(json.dumps(results[-1]),flush=True)
                report={'mode':args.mode,'model':configuration(),'actual_falkordb_go_http_mcp':True,'inference':args.mode=='llm','cases':results,'passed':sum(r['passed'] for r in results),'planned':len(args.cases),'claim_entailment_evaluated':False}
                (directory/('evaluation-'+args.label+'.json')).write_text(json.dumps(report,indent=2),encoding='utf-8')
                lab.close();store.graph.delete()
    trace.close();raise SystemExit(0 if all(r['passed'] for r in results) else 1)


if __name__=='__main__':asyncio.run(main())
