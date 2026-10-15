"""Long-lived Python worker, JSON lines over stdio to the TypeScript API."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
import json
import os
import sys
import threading
import time
from graphops import settings
from graphops.agent import Agent, StopRequested
from graphops.lab import Lab, SERVICES, SCENARIOS, request
from graphops.memory import Navigator
from graphops.models import configuration, preflight, get_model
from graphops.provider import ModelError
from graphops.store import Store, uid, now
from graphops.knowledge import import_source, ConflictError
from graphops.backup import export_workspace


def output(value):
    print(json.dumps(value, ensure_ascii=True), flush=True)


class Worker:
    def __init__(self, scope=settings.SCOPE, port=settings.LAB_PORT, emit=output):
        self.store, self.port, self.emit = Store(scope), port, emit
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
        self.store.migrate()
        for task in self.store.tasks():
            if task.get("job") == "running": self.store.update_task(task["id"], {"job": "interrupted", "last_error": "Worker restarted. Resume this incident from its checkpoint."})

    def snapshot(self, task_id=None):
        tasks = sorted(self.store.tasks(), key=lambda t: t["created_at"], reverse=True)
        selected = self.store.task(task_id) if task_id else next((t for t in tasks if not t.get("question")), None)
        def measure(service): return {**request(self.lab.url(service)+"/health"), "source": self.lab.url(service)+"/health"}
        with ThreadPoolExecutor(max_workers=4) as pool: health = list(pool.map(measure, SERVICES))
        memories = {}
        for item in health:
            if "revision" in item: memories[item["service"]] = self.navigator.packet(item["service"], item["revision"])
        return {"workspace": self.store.scope, "graph_name": self.store.name, "graph": self.store.diagram(),
            "tasks": tasks, "selected": selected, "events": self.store.events(selected["id"]) if selected else [],
            "health": health, "memory": memories, "company": {s: self.store.company(s,preview=True) for s in SERVICES},
            "model": configuration(), "busy": self.active is not None and not self.active.done(),
            'stopping':self.stop_requested.is_set() and self.active is not None and not self.active.done(),
            'active_task':self.active_task_id if self.active is not None and not self.active.done() else None,
            'diagnostics':self.last_diagnostics,
            "scenarios": [{"id": k, "label": v["label"]} for k, v in SCENARIOS.items()], "observed_at": now()}

    def readiness(self):
        if self._readiness_cache and time.monotonic()-self._readiness_cache[0]<10:return self._readiness_cache[1]
        components={}
        try:self.store.revision();components['graph']={'status':'online','message':'FalkorDB queries succeed'}
        except Exception:components['graph']={'status':'unavailable','message':'FalkorDB is unavailable. Start the graph service.'}
        try:self.lab.state();components['lab']={'status':'online','message':'Controlled service controller responds'}
        except Exception:components['lab']={'status':'unavailable','message':'Controlled services are unavailable. Restart the app.'}
        try:
            preflight();config=configuration()
            verified=bool(self.last_diagnostics and self.last_diagnostics.get('model',{}).get('success'))
            components['model']={'status':'verified' if verified else 'available' if config['provider']=='ollama' else 'configured',
                'message':'Live inference checked' if verified else 'Model installed; run system checks to verify inference' if config['provider']=='ollama' else 'Credentials configured; run system checks to verify access'}
        except Exception as exc:components['model']={'status':'unavailable','message':str(exc)[:400] if isinstance(exc,(RuntimeError,ValueError)) else 'Model connection failed'}
        mcp=bool(self.last_diagnostics and self.last_diagnostics.get('mcp',{}).get('success'))
        components['mcp']={'status':'verified' if mcp else 'unchecked','message':'MCP roundtrip checked' if mcp else 'Run system checks to verify a fresh MCP session'}
        result={'checked_at':now(),'model':configuration(),'components':components,'last_diagnostics':self.last_diagnostics,
            'ready_to_run':components['graph']['status']=='online' and components['lab']['status']=='online' and components['model']['status'] in {'available','verified'}}
        self._readiness_cache=(time.monotonic(),result);return result

    def incident_report(self,task_id):
        task=self.store.task(task_id)
        if not task:raise ValueError('Incident not found')
        events=self.store.events(task_id,limit=10000)
        total=self.store.read('MATCH (:Incident {id:$id})-[:HAS_EVENT]->(e:Event) RETURN count(e)',id=task_id)[0][0]
        return {'schema':'graphops.incident.v1','exported_at':now(),'workspace':self.store.scope,'incident':task,
            'events':events,'event_count':total,'truncated':total>len(events),
            'company':self.store.company(task.get('target') or task['service'])}

    async def execute(self, task_id, command, question=""):
        task = self.store.task(task_id); mode = task["mode"]
        try:
            agent = Agent(self.store, self.port, self.emit,should_stop=self.stop_requested.is_set)
            if command=='diagnose':
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
                self.last_diagnostics=checks;self._readiness_cache=None
                self.store.event(task_id,uid(),'system','component_check',checks)
                self.store.update_task(task_id,{'status':'checked' if checks['success'] else 'blocked'})
            elif command == "question":
                await agent.run(task_id, "company", question, mode)
                self.store.update_task(task_id,{'status':'answered'})
            elif command == "start":
                await agent.run(task_id, "investigator", "Investigate the gateway failure. Compare reachable causes and unrelated failures, retrieve relevant context, then hand off supported evidence.", mode)
                if not task.get("pause_after_handoff", False) and self.store.task(task_id)["status"] == "handoff":
                    self.emit({"type": "progress", "task": task_id, "stage": "handoff_saved", "role": "resolver"})
                    # A fresh agent and MCP process load the saved handoff from FalkorDB.
                    if self.stop_requested.is_set():raise StopRequested('Stopped at a checkpoint. Resume this incident to continue.')
                    await Agent(Store(self.store.scope), self.port, self.emit,should_stop=self.stop_requested.is_set).run(task_id, "resolver",
                        "Continue the persisted handoff. Check memory and current procedure, recover only with a validated plan, verify health and complete the synthetic ticket.", mode)
            else:
                if task["status"] in {"new", "blocked"}:
                    await agent.run(task_id, "investigator", "Resume this incident from its checkpoint using current evidence. Recheck the blocker before handing off.", mode)
                current = self.store.task(task_id)
                if current["status"] in {"handoff", "executing", "resolved"}:
                    await agent.run(task_id, "resolver", "Continue the persisted handoff. Check memory and current procedure, recover only with a validated plan, verify health and complete the synthetic ticket.", mode)
            self.store.update_task(task_id, {"job": "idle", "last_error": None})
        except asyncio.CancelledError:
            self.store.update_task(task_id, {"job": "interrupted", "last_error": "Worker stopped. Checkpoint preserved."}); raise
        except Exception as exc:
            while isinstance(exc, BaseExceptionGroup) and exc.exceptions: exc = exc.exceptions[0]
            message = str(exc)[:900] if isinstance(exc, (RuntimeError, ValueError)) else type(exc).__name__
            self.store.event(task_id, uid(), "system", "run_stopped" if isinstance(exc,StopRequested) else "run_error", {"message": message})
            self.store.update_task(task_id, {"job": "interrupted", "last_error": message})
        finally: self.emit({"type": "progress", "task": task_id, "stage": "finished"})

    async def dispatch(self, command, body):
        if not isinstance(body,dict):raise ValueError('Request must contain a JSON object')
        if command == "snapshot": return self.snapshot(body.get("task"))
        if command=='readiness':return await asyncio.to_thread(self.readiness)
        if command=='search':return self.store.search_documents(body.get('query',''),body.get('service') or None)
        if command=='source':
            doc=self.store.document(body.get('id',''))
            if not doc:raise ValueError('Source not found')
            if body.get('revision') and body['revision']!=doc['revision']:
                rows=self.store.read('MATCH (d:Document {id:$id})-[:HAS_REVISION]->(v:Revision {id:$version}) RETURN v.payload',id=doc['id'],version=doc['id']+':'+str(body['revision']))
                if not rows:raise ValueError('Source revision not found')
                return json.loads(rows[0][0])
            return doc
        if command=='history':
            tasks=self.store.tasks(query=body.get('query',''),before=body.get('before',''))
            return {'tasks':tasks,'next_cursor':tasks[-1]['created_at'] if len(tasks)==100 else None,'audits':self.store.audits()}
        if command=='report':return self.incident_report(body.get('task',''))
        if command == "model_status": return configuration()
        if command=='cancel':
            if self.active is None or self.active.done() or body.get('task')!=self.active_task_id:raise ConflictError('This run is not active')
            self.stop_requested.set();self.emit({'type':'progress','task':self.active_task_id,'stage':'stopping'})
            return {'task':self.active_task_id,'stop_requested':True}
        if self.active is not None and not self.active.done(): raise ConflictError("An agent is running. Wait for its checkpoint before starting another operation.")
        if command=='backup':
            result=export_workspace(self.store,self.lab)
            self.store.audit('backup_exported',{'nodes':len(result['nodes']),'edges':len(result['edges'])})
            return result
        if command=='import_source':
            result=import_source(self.store,body);self.emit({'type':'progress','stage':'company_updated'});return result
        if command == "start":
            scenario, mode = body.get("scenario", "config"), body.get("mode", "llm")
            if not isinstance(scenario,str) or scenario not in SCENARIOS or not isinstance(mode,str) or mode not in {"llm", "scripted"}: raise ValueError("Invalid scenario or mode")
            pause = body.get("pause_after_handoff", False)
            if not isinstance(pause, bool): raise ValueError("Pause after handoff must be a boolean")
            if mode == "llm": preflight()  # No fault injection until the local model is installed.
            task = self.store.create_task(scenario, "Investigate checkout service failure", mode)
            self.store.update_task(task["id"], {"pause_after_handoff": pause})
            try: injection = self.lab.inject(scenario)
            except Exception:
                self.store.update_task(task["id"], {"status": "blocked", "last_error": "Scenario not started; existing fault must be resolved"}); raise
            self.store.event(task["id"], uid(), "system", "scenario_started", {"generation": injection["generation"], "environment": "controlled Go HTTP lab; synthetic company records"})
        elif command == "resume":
            task = self.store.task(body.get("task", ""))
            if not task or task.get("question"): raise ValueError("Incident not found")
            if task["mode"] == "llm": preflight()
        elif command=='diagnose':
            task=self.store.create_task('diagnostics','System component checks','llm')
            self.store.update_task(task['id'],{'question':True,'diagnostic':True,'target':'payments'})
        elif command == "question":
            question = body.get("question", "")
            if not isinstance(question,str) or not 1 <= len(question.strip()) <= 1000: raise ValueError("Enter a question of 1–1000 characters")
            question=question.strip()
            mode = body.get("mode", "llm")
            if not isinstance(mode,str) or mode not in {"llm", "scripted"}: raise ValueError("Invalid mode")
            if mode == "llm": preflight()
            service=body.get('service','payments')
            if service not in SERVICES:raise ValueError('Select a service for this question')
            task = self.store.create_task("company", question, mode)
            self.store.update_task(task["id"], {"question": True,'target':service})
        elif command == "update_company":
            service = body.get("service")
            if not isinstance(service,str) or service not in {"payments", "orders"}: raise ValueError("Select payments or orders")
            operation = body.get("operation")
            if operation == "owner":
                owner = body.get("owner", "")
                if not isinstance(owner,str) or not 1 <= len(owner.strip()) <= 80: raise ValueError("Owner must contain 1–80 characters")
                owner=owner.strip()
                self.store.write("""MATCH (s:Service {id:$service}) OPTIONAL MATCH (:Team)-[r:OWNS]->(s)
                    DELETE r WITH s MERGE (t:Team {id:$owner}) SET t.title=$owner
                    MERGE (t)-[r:OWNS]->(s) SET r.source='owned:event/ownership-update'""", service=service, owner=owner, context=True)
                self.store.put_document(service+"-ownership", service, "ownership", "Ownership update", "Current owner: "+owner, uid()[:8], {"owner": owner},source='owned:ownership/'+service)
            elif operation in {"retire_runbook", "restore_runbook"}:
                doc = self.store.document(service+"-runbook")
                action = SCENARIOS["config" if service == "payments" else "worker"]["action"]
                precondition = "config-broken-v1" if service == "payments" else "worker-stopped-v1"
                enabled = operation == "restore_runbook"
                data = {"action": action if enabled else "requires_review", "precondition": precondition}
                self.store.put_document(doc["id"], service, "runbook", doc["title"],
                    "Validated recovery: "+action if enabled else "Prior recovery procedure retired. Investigation and a new validated procedure are required.", uid()[:8], data)
            else: raise ValueError("Unknown company operation")
            self.store.audit('company_updated',{'service':service,'operation':operation})
            self.emit({"type": "progress", "stage": "company_updated"})
            return {"updated": True}
        else: raise ValueError("Unknown worker command")
        self.store.update_task(task["id"], {"job": "running", "last_error": None})
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
