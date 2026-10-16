"""Long-lived Python worker, JSON lines over stdio to the TypeScript API."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
import json
import os
import sys
import threading
import time
from graphops import settings
from graphops.agents.runner import Agent, StopRequested
from graphops.agents.orchestrator import run_incident
from graphops.actions.lab import Lab, request
from graphops.core.synthetic import SERVICES, SCENARIOS
from graphops.memory.navigator import Navigator
from graphops.models.router import configuration, preflight, get_model
from graphops.models.providers import ModelError
from graphops.graph.workspace import WorkspaceGraph
from graphops.core.identity import uid, now
from graphops.company.service import import_source, update_company, ConflictError
from graphops.workspace.backup import export_workspace
from graphops.workspace.queries import WorkspaceQueries
from graphops.workspace.monitoring import monitor_workspace


def output(value):
    print(json.dumps(value, ensure_ascii=True), flush=True)


class Worker:
    def __init__(self, scope=settings.SCOPE, port=settings.LAB_PORT, emit=output):
        self.store, self.port, self.emit = WorkspaceGraph(scope), port, emit
        self.lab = Lab(settings.DATA / scope, port).start()
        try: self.store.seed(port)
        except BaseException:
            self.lab.close()
            raise
        self.navigator = Navigator(self.store)
        self.active = None
        self.active_task_id=None
        self.stop_requested=threading.Event()
        self.last_diagnostics=None
        self._readiness_cache=None
        self.store.runs.migrate()
        for task in self.store.runs.list():
            if task.get("job") == "running": self.store.runs.update(task["id"], {"job": "interrupted", "last_error": "Worker restarted. Resume this incident from its checkpoint."})

    def runtime_status(self):
        busy = self.active is not None and not self.active.done()
        return {'busy':busy, 'stopping':busy and self.stop_requested.is_set(),
                'active_task':self.active_task_id if busy else None, 'diagnostics':self.last_diagnostics}

    @property
    def queries(self):
        if not hasattr(self, '_queries'):
            self._queries = WorkspaceQueries(self.store, self.lab, self.navigator, self.runtime_status)
        return self._queries

    def snapshot(self, task_id=None):
        return self.queries.snapshot(task_id)

    def readiness(self):
        return self.queries.readiness()

    def incident_report(self, task_id):
        return self.queries.incident_report(task_id)

    async def component_checks(self, task_id, agent):
        """Verify a fresh MCP session, the graph and actual model inference; record the result on the task."""
        checks={'checked_at':now(),'task':task_id}
        result=await agent.run(task_id,'company','Check read-only MCP tools',mode='scripted')
        checks['mcp']={'success':result['tool_calls']>=2,'session':result['session']}
        self.emit({'type':'progress','task':task_id,'stage':'model','role':'system check'})
        try:
            model=preflight()
            response=await asyncio.to_thread(model.generate,'Reply with READY only.',[{'role':'user','parts':[{'text':'Check that inference is working. Reply READY.'}]}],[])
            checks['model']={'success':any(p.get('text','').strip() for p in response['parts']),'provider':configuration()['provider'],'model':configuration()['model']}
        except Exception as exc:checks['model']={'success':False,'error':str(exc)[:500] if isinstance(exc,(RuntimeError,ValueError)) else type(exc).__name__}
        checks['success']=checks['mcp']['success'] and bool(checks['model']['success'])
        self.last_diagnostics=checks;self.queries.invalidate()
        self.store.runs.append_event(task_id,uid(),'system','component_check',checks)
        return checks

    async def verify(self, task_id, agent, suite):
        """Judge check: component checks, then live certification cases in a separate process.

        Certification starts its own isolated graphs and service fixtures; running it out of process keeps
        this worker's lab credentials and demo workspace untouched."""
        checks=await self.component_checks(task_id,agent)
        if not checks['success']:
            self.store.runs.update(task_id,{'status':'blocked','blocker':'Component checks failed; live cases were not started.'});return
        session=uid()
        (settings.DATA/'reports').mkdir(parents=True,exist_ok=True)
        log_path=settings.DATA/'reports'/('judge-'+task_id.lower()+'.log')
        log=log_path.open('wb')  # stderr goes to a file so an unread pipe can never stall the check
        process=await asyncio.create_subprocess_exec(sys.executable,'-m','graphops.cli','certify','--suite',suite,'--label','judge-'+task_id.lower(),'--json',
            cwd=str(settings.ROOT),env={**os.environ,'PYTHONPATH':str(settings.ROOT)},stdout=asyncio.subprocess.PIPE,stderr=log)
        summary=None
        try:
            while True:
                if self.stop_requested.is_set():raise StopRequested('Judge check stopped. Run it again to start over.')
                try:line=await asyncio.wait_for(process.stdout.readline(),timeout=1)
                except asyncio.TimeoutError:continue
                if not line:break
                try:event=json.loads(line)
                except ValueError:continue
                if event.get('type') in {'case_started','case_finished'}:
                    self.store.runs.append_event(task_id,session,'system','verification_case',event)
                    self.emit({'type':'progress','task':task_id,'stage':event['type'],'role':'judge check'})
                elif event.get('type')=='certify_complete':summary=event
            await process.wait()
        finally:
            if process.returncode is None:
                process.kill();await process.wait()
            log.close()
        if summary is None:
            error=log_path.read_text(encoding='utf-8',errors='replace').strip()[-400:]
            raise RuntimeError('Judge check did not finish: '+(error or 'no result'))
        passed=summary['passed']==summary['runs']
        self.store.runs.update(task_id,{'status':'checked' if passed else 'blocked','verification':summary,
            'blocker':None if passed else f"{summary['runs']-summary['passed']} of {summary['runs']} cases did not pass."})

    async def execute(self, task_id, command, question=""):
        task = self.store.runs.get(task_id); mode = task["mode"]
        try:
            agent = Agent(self.store, self.port, self.emit,should_stop=self.stop_requested.is_set)
            if command=='diagnose':
                checks=await self.component_checks(task_id,agent)
                self.store.runs.update(task_id,{'status':'checked' if checks['success'] else 'blocked'})
            elif command=='verify':
                await self.verify(task_id,agent,task.get('suite','quick'))
            elif command == "question":
                await agent.run(task_id, "company", question, mode)
                self.store.runs.update(task_id,{'status':'answered'})
            elif command == "start":
                await run_incident(self.store, self.port, task_id, mode, self.emit, self.stop_requested.is_set,
                                   task.get("pause_after_handoff", False))
            else:
                if task["status"] in {"new", "blocked"}:
                    await agent.run(task_id, "investigator", "Resume this incident from its checkpoint using current evidence. Recheck the blocker before handing off.", mode)
                current = self.store.runs.get(task_id)
                if current["status"] in {"handoff", "executing", "resolved"}:
                    await agent.run(task_id, "resolver", "Continue the persisted handoff. Check memory and current procedure, recover only with a validated plan, verify health and complete the synthetic ticket.", mode)
            self.store.runs.update(task_id, {"job": "idle", "last_error": None})
        except asyncio.CancelledError:
            self.store.runs.update(task_id, {"job": "interrupted", "last_error": "Worker stopped. Checkpoint preserved."}); raise
        except Exception as exc:
            while isinstance(exc, BaseExceptionGroup) and exc.exceptions: exc = exc.exceptions[0]
            message = str(exc)[:900] if isinstance(exc, (RuntimeError, ValueError)) else type(exc).__name__
            self.store.runs.append_event(task_id, uid(), "system", "run_stopped" if isinstance(exc,StopRequested) else "run_error", {"message": message})
            self.store.runs.update(task_id, {"job": "interrupted", "last_error": message})
        finally: self.emit({"type": "progress", "task": task_id, "stage": "finished"})

    async def dispatch(self, command, body):
        if not isinstance(body,dict):raise ValueError('Request must contain a JSON object')
        if command=='monitor':return monitor_workspace(self,body.get('task'))
        if command=='run_events':return self.store.runs.events_after(body.get('task'),body.get('after',''),body.get('limit',200))
        if command=='graph':return {'diagram':self.store.topology.diagram(),'topology':self.store.topology.paths(body.get('service','gateway'))}
        if command=='company_context':
            service=body.get('service','payments')
            if service not in SERVICES:raise ValueError('Select an authorized service')
            return self.store.company.context(service)
        if command=='memory':
            service=body.get('service','payments')
            if service not in SERVICES:raise ValueError('Select an authorized service')
            return self.snapshot()['memory'].get(service,{'active':[],'historical':[],'unverified':[],'conflicts':[]})
        if command == "snapshot": return self.snapshot(body.get("task"))
        if command=='readiness':return await asyncio.to_thread(self.readiness)
        if command=='search':return self.store.company.search(body.get('query',''),body.get('service') or None)
        if command=='source':
            doc=self.store.company.document(body.get('id',''))
            if not doc:raise ValueError('Source not found')
            if body.get('revision') and body['revision']!=doc['revision']:
                rows=self.store.read('MATCH (d:Document {id:$id})-[:HAS_REVISION]->(v:Revision {id:$version}) RETURN v.payload',id=doc['id'],version=doc['id']+':'+str(body['revision']))
                if not rows:raise ValueError('Source revision not found')
                return json.loads(rows[0][0])
            return doc
        if command=='history':
            tasks=self.store.runs.list(query=body.get('query',''),before=body.get('before',''))
            return {'tasks':tasks,'next_cursor':tasks[-1]['created_at'] if len(tasks)==100 else None,'audits':self.store.audit.list()}
        if command=='report':return self.incident_report(body.get('task',''))
        if command == "model_status": return configuration()
        if command=='cancel':
            if self.active is None or self.active.done() or body.get('task')!=self.active_task_id:raise ConflictError('This run is not active')
            self.stop_requested.set();self.emit({'type':'progress','task':self.active_task_id,'stage':'stopping'})
            return {'task':self.active_task_id,'stop_requested':True}
        if self.active is not None and not self.active.done(): raise ConflictError("An agent is running. Wait for its checkpoint before starting another operation.")
        if command=='backup':
            result=export_workspace(self.store,self.lab)
            self.store.audit.append('backup_exported',{'nodes':len(result['nodes']),'edges':len(result['edges'])})
            return result
        if command=='import_source':
            result=import_source(self.store,body);self.emit({'type':'progress','stage':'company_updated'});return result
        if command == "start":
            scenario, mode = body.get("scenario", "config"), body.get("mode", "llm")
            if not isinstance(scenario,str) or scenario not in SCENARIOS or not isinstance(mode,str) or mode not in {"llm", "scripted"}: raise ValueError("Invalid scenario or mode")
            pause = body.get("pause_after_handoff", False)
            if not isinstance(pause, bool): raise ValueError("Pause after handoff must be a boolean")
            if mode == "llm": preflight()  # No fault injection until the local model is installed.
            # Refuse before recording anything, so a rejected start leaves no blocked incident in history.
            active = [name for name, item in self.lab.state().get("services", {}).items() if name != "analytics" and item.get("fault")]
            if active: raise ConflictError(f"A fault is still active on {', '.join(sorted(active))}. Resume or finish that incident first.")
            task = self.store.runs.create(scenario, "Investigate checkout service failure", mode)
            self.store.runs.update(task["id"], {"pause_after_handoff": pause})
            try: injection = self.lab.inject(scenario)
            except Exception:
                self.store.runs.update(task["id"], {"status": "blocked", "last_error": "Scenario not started; existing fault must be resolved"}); raise
            self.store.runs.append_event(task["id"], uid(), "system", "scenario_started", {"generation": injection["generation"], "environment": "controlled Go HTTP lab; synthetic company records"})
        elif command == "resume":
            task = self.store.runs.get(body.get("task", ""))
            if not task or task.get("question"): raise ValueError("Incident not found")
            if task["mode"] == "llm": preflight()
        elif command=='diagnose':
            task=self.store.runs.create('diagnostics','System component checks','llm')
            self.store.runs.update(task['id'],{'question':True,'diagnostic':True,'target':'payments'})
        elif command=='verify':
            suite=body.get('suite','quick')
            if suite not in {'quick','all'}:raise ValueError('Choose the quick or full judge check')
            preflight()
            task=self.store.runs.create('verification','Judge check · '+('quick, 4 cases' if suite=='quick' else 'full, 12 cases'),'llm')
            self.store.runs.update(task['id'],{'question':True,'verification':True,'suite':suite,'target':'payments'})
        elif command == "question":
            question = body.get("question", "")
            if not isinstance(question,str) or not 1 <= len(question.strip()) <= 1000: raise ValueError("Enter a question of 1–1000 characters")
            question=question.strip()
            mode = body.get("mode", "llm")
            if not isinstance(mode,str) or mode not in {"llm", "scripted"}: raise ValueError("Invalid mode")
            if mode == "llm": preflight()
            service=body.get('service','payments')
            if service not in SERVICES:raise ValueError('Select a service for this question')
            task = self.store.runs.create("company", question, mode)
            self.store.runs.update(task["id"], {"question": True,'target':service})
        elif command == "update_company":
            result=update_company(self.store,body)
            self.emit({"type":"progress","stage":"company_updated"})
            return result
        else: raise ValueError("Unknown worker command")
        self.store.runs.update(task["id"], {"job": "running", "last_error": None})
        self.stop_requested.clear();self.active_task_id=task['id']
        self.active = asyncio.create_task(self.execute(task["id"], command, body.get("question", "")))
        return {"task": task["id"], "accepted": True}

    async def close(self):
        if self.active is not None and not self.active.done():
            self.active.cancel()
            try: await self.active
            except asyncio.CancelledError: pass
        self.lab.close()


async def main():
    if hasattr(sys.stdout, "reconfigure"): sys.stdout.reconfigure(encoding="utf-8")
    try:worker = Worker()
    except Exception as exc:
        message='FalkorDB is unavailable. Start the graph service; the app will retry.' if type(exc).__module__.startswith('redis') else str(exc)[:500] if isinstance(exc,(RuntimeError,ValueError)) else 'Worker startup failed: '+type(exc).__name__
        output({'type':'fatal','message':message});raise SystemExit(1)
    output({"type": "ready", "workspace": worker.store.scope})
    try:
        while True:
            line = await asyncio.to_thread(sys.stdin.readline)
            if not line: break
            message = {}
            try:
                message = json.loads(line)
                result = await worker.dispatch(message["command"], message.get("body", {}))
                output({"type": "reply", "id": message["id"], "result": result})
            except Exception as exc:
                output({"type": "reply", "id": message.get("id"), "error": str(exc)[:900] if isinstance(exc, (ValueError, RuntimeError)) else "Worker request failed: "+type(exc).__name__,
                    'error_type':'conflict' if isinstance(exc,ConflictError) else 'validation' if isinstance(exc,ValueError) else 'unavailable'})
    finally: await worker.close()


if __name__ == "__main__": asyncio.run(main())
