"""Read models for the workspace; no job scheduling or company mutations."""
from concurrent.futures import ThreadPoolExecutor
import time
from graphops.core.synthetic import SERVICES, SCENARIOS
from graphops.actions.lab import request
from graphops.core.identity import now
from graphops.models.router import configuration, preflight

class WorkspaceQueries:
    def __init__(self, graph, lab, navigator, state):
        self.graph, self.lab, self.navigator, self.state = graph, lab, navigator, state
        self._readiness_cache = None

    def invalidate(self):
        self._readiness_cache = None

    def snapshot(self, task_id=None):
        tasks = sorted(self.graph.runs.list(), key=lambda t: t["created_at"], reverse=True)
        selected = self.graph.runs.get(task_id) if task_id else next((t for t in tasks if not t.get("question")), None)
        def measure(service): return {**request(self.lab.url(service)+"/health"), "source": self.lab.url(service)+"/health"}
        with ThreadPoolExecutor(max_workers=4) as pool: health = list(pool.map(measure, SERVICES))
        memories = {}
        for item in health:
            if "revision" in item: memories[item["service"]] = self.navigator.packet(item["service"], item["revision"])
        return {"workspace": self.graph.scope, "graph_name": self.graph.name, "graph": self.graph.topology.diagram(),
            "tasks": tasks, "selected": selected, "events": self.graph.runs.events(selected["id"]) if selected else [],
            "health": health, "memory": memories, "company": {s: self.graph.company.context(s,preview=True) for s in SERVICES},
            "model": configuration(), "busy": self.state()['busy'],
            'stopping':self.state()['stopping'] and self.state()['busy'],
            'active_task':self.state()['active_task'] if self.state()['busy'] else None,
            'diagnostics':self.state()['diagnostics'],
            "scenarios": [{"id": k, "label": v["label"]} for k, v in SCENARIOS.items()], "observed_at": now()}


    def readiness(self):
        if self._readiness_cache and time.monotonic()-self._readiness_cache[0]<10:return self._readiness_cache[1]
        components={}
        try:self.graph.revision();components['graph']={'status':'online','message':'FalkorDB queries succeed'}
        except Exception:components['graph']={'status':'unavailable','message':'FalkorDB is unavailable. Start the graph service.'}
        try:self.lab.state();components['lab']={'status':'online','message':'Controlled service controller responds'}
        except Exception:components['lab']={'status':'unavailable','message':'Controlled services are unavailable. Restart the app.'}
        try:
            preflight();config=configuration()
            verified=bool(self.state()['diagnostics'] and self.state()['diagnostics'].get('model',{}).get('success'))
            components['model']={'status':'verified' if verified else 'available' if config['provider']=='ollama' else 'configured',
                'message':'Live inference checked' if verified else 'Model installed; run system checks to verify inference' if config['provider']=='ollama' else 'Credentials configured; run system checks to verify access'}
        except Exception as exc:components['model']={'status':'unavailable','message':str(exc)[:400] if isinstance(exc,(RuntimeError,ValueError)) else 'Model connection failed'}
        mcp=bool(self.state()['diagnostics'] and self.state()['diagnostics'].get('mcp',{}).get('success'))
        components['mcp']={'status':'verified' if mcp else 'unchecked','message':'MCP roundtrip checked' if mcp else 'Run system checks to verify a fresh MCP session'}
        result={'checked_at':now(),'model':configuration(),'components':components,'last_diagnostics':self.state()['diagnostics'],
            'ready_to_run':components['graph']['status']=='online' and components['lab']['status']=='online' and components['model']['status'] in {'available','verified'}}
        self._readiness_cache=(time.monotonic(),result);return result


    def incident_report(self,task_id):
        task=self.graph.runs.get(task_id)
        if not task:raise ValueError('Incident not found')
        events=self.graph.runs.events(task_id,limit=10000)
        total=self.graph.read('MATCH (:Incident {id:$id})-[:HAS_EVENT]->(e:Event) RETURN count(e)',id=task_id)[0][0]
        return {'schema':'graphops.incident.v1','exported_at':now(),'workspace':self.graph.scope,'incident':task,
            'events':events,'event_count':total,'truncated':total>len(events),
            'company':self.graph.company.context(task.get('target') or task['service'])}
