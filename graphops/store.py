"""Event graph: sourced company context, durable sessions and versioned incidents."""
from datetime import datetime, timezone
import hashlib
import json
import os
import re
import uuid
from falkordb import FalkorDB
from graphops import settings
from graphops.lab import SERVICES, DEPENDENCIES


def now(): return datetime.now(timezone.utc).isoformat()
def uid(): return str(uuid.uuid4())
def age(timestamp):
    try: return (datetime.now(timezone.utc) - datetime.fromisoformat(timestamp)).total_seconds()
    except (ValueError, TypeError): return float("inf")


class Store:
    def __init__(self, scope=settings.SCOPE):
        if not re.fullmatch(r"[a-zA-Z0-9_.-]{1,80}", scope): raise ValueError("Invalid workspace")
        self.scope = scope
        self.name = "graphops_event_" + hashlib.sha256(scope.encode()).hexdigest()[:20]
        self.db = FalkorDB(host=os.getenv("FALKORDB_HOST", "localhost"), port=int(os.getenv("FALKORDB_PORT", "6379")),
                          socket_connect_timeout=3, socket_timeout=10)
        self.graph = self.db.select_graph(self.name)
        self.graph.query("MERGE (m:Meta {id:'context'}) ON CREATE SET m.revision=0")

    def read(self, query, **params): return self.graph.ro_query(query, params=params).result_set

    def write(self, query, context=False, **params):
        rows = self.graph.query(query + """ WITH count(*) AS affected
            MATCH (m:Meta {id:'context'}) SET m.revision=m.revision+$increment RETURN affected""",
            params={**params, "increment": int(context)}).result_set
        return rows[0][0]

    def revision(self): return self.read("MATCH (m:Meta {id:'context'}) RETURN m.revision")[0][0]

    def seed(self, port):
        initialized = self.read("MATCH (m:Meta {id:'context'}) RETURN m.lab_port")
        if initialized and initialized[0][0] is not None:
            if initialized[0][0] != port: raise ValueError("Workspace lab port changed; choose a fresh workspace")
            return
        for offset, service in enumerate(SERVICES):
            team = "Payments Platform" if service == "payments" else "Commerce" if service != "analytics" else "Insights"
            self.write("""MERGE (s:Service {id:$service}) ON CREATE SET s.title=$service,s.url=$url,s.source=$source
                MERGE (p:Project {id:'checkout'}) ON CREATE SET p.title='Checkout experience'
                MERGE (p)-[:USES]->(s)
                MERGE (t:Team {id:$team}) ON CREATE SET t.title=$team
                WITH s,t
                MERGE (t)-[r:OWNS]->(s) SET r.source=$source
                MERGE (e:Expertise {id:$expert}) ON CREATE SET e.title=$expert
                MERGE (t)-[:HAS_EXPERTISE]->(e) MERGE (e)-[:KNOWS]->(s)""",
                service=service, team=team, expert=team + " on-call", url=f"http://127.0.0.1:{port+offset}",
                source="fixture:event/topology-v1", context=True)
        for origin, target in DEPENDENCIES.items():
            # Topology initialized once. Startup must not undo deliberate source updates.
            self.write("""MATCH (a:Service {id:$origin}),(b:Service {id:$target})
                MERGE (a)-[r:DEPENDS_ON]->(b) ON CREATE SET r.source='fixture:event/topology-v1'""",
                origin=origin, target=target, context=True)
        for service, action, revision in (("payments", "restore_config", "config-broken-v1"), ("orders", "restart_worker", "worker-stopped-v1")):
            docs = [
                (service + "-runbook", "runbook", "Runbook · " + service,
                 f"For a directly measured {action} failure at {revision}, use {action}. Verify the incident service and target after execution.",
                 {"action": action, "precondition": revision}),
                (service + "-decision", "decision", "Decision · " + service,
                 f"DEC-{service.upper()}: Recovery of {service} requires a current matching runbook and live health measurements.", {}),
                (service + "-chat", "chat", "Handoff notes · " + service,
                 f"Synthetic operations discussion: check ownership and current procedure before changing {service}. Historical outcomes are evidence of past events.", {}),
                (service + "-ticket", "ticket", "Recover " + service,
                 f"Controlled lab ticket: restore {service} and verify checkout health. No production actions are authorized.", {"state": "open"}),
            ]
            for doc_id, kind, title, text, data in docs:
                if not self.document(doc_id): self.put_document(doc_id, service, kind, title, text, "v1", data)
        self.write("MATCH (m:Meta {id:'context'}) SET m.lab_port=$port", port=port)

    def put_document(self, doc_id, service, kind, title, text, revision, data):
        source = "fixture:event/" + doc_id
        previous = self.read("MATCH (v:Revision {id:$id}) RETURN v.payload", id=doc_id+":"+revision)
        payload = {"id": doc_id, "service": service, "kind": kind, "title": title, "text": text,
                   "revision": revision, "source": source, "data": data}
        encoded = json.dumps(payload, sort_keys=True)
        if previous and previous[0][0] != encoded: raise ValueError("A source revision is immutable; provide a new revision")
        self.write("""MATCH (s:Service {id:$service}) MERGE (d:Document {id:$id})
            SET d.title=$title,d.kind=$kind,d.source=$source,d.payload=$payload,d.revision=$revision
            MERGE (s)-[:HAS_DOCUMENT]->(d)
            MERGE (v:Revision {id:$version}) ON CREATE SET v.payload=$payload,v.title=$revision,v.source=$source
            MERGE (d)-[:HAS_REVISION]->(v)""", id=doc_id, service=service, title=title, source=source,
            kind=kind, payload=encoded, revision=revision, version=doc_id+":"+revision, context=True)
        return payload

    def document(self, doc_id):
        rows = self.read("MATCH (d:Document {id:$id}) RETURN d.payload", id=doc_id)
        return json.loads(rows[0][0]) if rows else None

    def company(self, service):
        owners = self.read("MATCH (t:Team)-[r:OWNS]->(:Service {id:$id}) RETURN t.title,r.source", id=service)
        docs = self.read("MATCH (:Service {id:$id})-[:HAS_DOCUMENT]->(d:Document) RETURN d.payload ORDER BY d.id", id=service)
        experts = self.read("MATCH (t:Team)-[:HAS_EXPERTISE]->(e:Expertise)-[:KNOWS]->(:Service {id:$id}) RETURN e.title,t.title", id=service)
        history = self.read("""MATCH (:Service {id:$id})-[:HAS_DOCUMENT]->(d:Document)-[:HAS_REVISION]->(v:Revision)
            WHERE v.id <> d.id+':'+d.revision RETURN v.payload LIMIT 12""", id=service)
        return {"service": service, "owners": [{"name": r[0], "source": r[1]} for r in owners],
                "experts": [{"name": r[0], "team": r[1]} for r in experts], "documents": [json.loads(r[0]) for r in docs],
                "historical_documents": [json.loads(r[0]) for r in history]}

    def topology(self, service):
        rows = self.read("""MATCH p=(:Service {id:$service})-[:DEPENDS_ON*1..8]->(:Service)
            RETURN [n IN nodes(p)|n.id],[r IN relationships(p)|r.source] ORDER BY length(p) LIMIT 50""", service=service)
        return {"service": service, "paths": [{"services": r[0], "sources": r[1]} for r in rows],
                "query": "MATCH p=(:Service {id:$service})-[:DEPENDS_ON*1..8]->(:Service) RETURN p"}

    def create_task(self, scenario, goal, mode):
        task = {"id": "INC-"+uid()[:8].upper(), "title": goal, "service": "gateway", "status": "new",
                "created_at": now(), "scenario": scenario, "mode": mode, "target": None, "job": "idle"}
        self.write("CREATE (t:Incident {id:$id,payload:$payload,created_at:$created,version:0})", id=task["id"], created=task["created_at"], payload=json.dumps(task))
        return self.task(task["id"])

    def task(self, task_id):
        rows = self.read("MATCH (t:Incident {id:$id}) RETURN t.payload,t.version", id=task_id)
        return {**json.loads(rows[0][0]), "version": rows[0][1]} if rows else None

    def tasks(self):
        return [self.task(r[0]) for r in self.read("MATCH (t:Incident) RETURN t.id,t.created_at ORDER BY t.created_at DESC LIMIT 100")]

    def update_task(self, task_id, update, version=None):
        task = self.task(task_id)
        if not task: raise ValueError("Incident not found")
        if set(update) & {"id", "created_at", "mode", "service", "version"}: raise ValueError("Incident identity is immutable")
        encoded = json.dumps({**task, **update, "updated_at": now()})
        n = self.write("""MATCH (t:Incident {id:$id}) WHERE t.version=$version
            SET t.payload=$payload,t.version=t.version+1""", id=task_id,
            version=task["version"] if version is None else version, payload=encoded)
        if n != 1: raise ValueError("Incident changed concurrently; reload its checkpoint")
        return self.task(task_id)

    def event(self, task_id, session, role, kind, data):
        eid, timestamp = uid(), now()
        n = self.write("""MATCH (t:Incident {id:$task})
            MERGE (s:Session {id:$session}) ON CREATE SET s.role=$role,s.started_at=$time
            MERGE (t)-[:HAS_SESSION]->(s)
            CREATE (e:Event {id:$id,role:$role,kind:$kind,payload:$payload,time:$time})
            MERGE (s)-[:EMITTED]->(e) MERGE (t)-[:HAS_EVENT]->(e)""", task=task_id,
            session=session, role=role, time=timestamp, id=eid, kind=kind, payload=json.dumps(data))
        if n != 1: raise ValueError("Cannot append to absent incident")
        return {"id": eid, "task": task_id, "session": session, "role": role, "kind": kind, "time": timestamp, "data": data}

    def events(self, task_id):
        rows = self.read("""MATCH (t:Incident {id:$id})-[:HAS_EVENT]->(e:Event)<-[:EMITTED]-(s:Session)
            RETURN e.id,s.id,e.role,e.kind,e.time,e.payload ORDER BY e.time LIMIT 500""", id=task_id)
        return [{"id": r[0], "session": r[1], "role": r[2], "kind": r[3], "time": r[4], "data": json.loads(r[5])} for r in rows]

    def remember(self, task_id, service, kind, revision, source, data, verified=True):
        mid = task_id+":"+kind
        payload = {"id": mid, "task": task_id, "service": service, "kind": kind, "revision": revision,
                   "source": source, "data": data, "verified": verified, "created_at": now()}
        self.write("""MATCH (s:Service {id:$service}) MERGE (m:Memory {id:$id})
            SET m.payload=$payload,m.kind=$kind,m.time=$time,m.title=$title
            MERGE (s)-[:HAS_MEMORY]->(m)""", service=service, id=mid, kind=kind, time=payload["created_at"],
            title=kind + " · " + task_id, payload=json.dumps(payload), context=True)
        return payload

    def memories(self, service):
        return [json.loads(r[0]) for r in self.read("""MATCH (:Service {id:$id})-[:HAS_MEMORY]->(m:Memory)
            RETURN m.payload ORDER BY m.time DESC LIMIT 20""", id=service)]

    def plan(self, task_id, data=None, plan_id=None):
        if data is not None:
            plan_id = uid()
            self.write("""MATCH (t:Incident {id:$task}) CREATE (p:Plan {id:$id,payload:$payload})
                MERGE (t)-[:HAS_PLAN]->(p)""", task=task_id, id=plan_id, payload=json.dumps({**data, "id": plan_id, "created_at": now()}))
        rows = self.read("MATCH (:Incident {id:$task})-[:HAS_PLAN]->(p:Plan {id:$id}) RETURN p.payload", task=task_id, id=plan_id)
        if not rows: raise ValueError("Plan does not belong to this incident")
        return json.loads(rows[0][0])

    def diagram(self):
        rows = self.read("""MATCH (n) WHERE n:Service OR n:Team OR n:Project OR n:Expertise OR n:Document
            RETURN id(n),labels(n)[0],n.id,n.title,n.source LIMIT 150""")
        nodes = [{"key": r[0], "kind": r[1], "id": r[2], "title": r[3], "source": r[4]} for r in rows]
        keys = [n["key"] for n in nodes]
        edges = self.read("""MATCH (a)-[r]->(b) WHERE id(a) IN $keys AND id(b) IN $keys
            RETURN id(a),id(b),type(r),r.source LIMIT 300""", keys=keys)
        return {"nodes": nodes, "edges": [{"from": r[0], "to": r[1], "kind": r[2], "source": r[3]} for r in edges]}
