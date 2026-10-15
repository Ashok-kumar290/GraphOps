"""RunRepository owns one domain of graph persistence."""
from graphops.graph.repository import Repository
from graphops.core.identity import now, uid
import json
from datetime import datetime


class RunRepository(Repository):
    def create(self, scenario, goal, mode):
        task = {"id": "INC-"+uid()[:8].upper(), "title": goal, "service": "gateway", "status": "new",
                "created_at": now(), "scenario": scenario, "mode": mode, "target": None, "job": "idle"}
        self.write("CREATE (t:Incident {id:$id,payload:$payload,created_at:$created,version:0})", id=task["id"], created=task["created_at"], payload=json.dumps(task))
        return self.get(task["id"])


    def get(self, task_id):
        rows = self.read("MATCH (t:Incident {id:$id}) RETURN t.payload,t.version", id=task_id)
        return {**json.loads(rows[0][0]), "version": rows[0][1]} if rows else None


    def list(self, query='', before=''):
        if not isinstance(query,str) or len(query)>120:raise ValueError('History search is too long')
        if before:
            try:datetime.fromisoformat(before)
            except (ValueError,TypeError):raise ValueError('Invalid history cursor') from None
        return [{**json.loads(r[0]),'version':r[1]} for r in self.read("""MATCH (t:Incident)
            WHERE ($before='' OR coalesce(t.created_at,'')<$before) AND
              ($term='' OR toLower(t.payload) CONTAINS $term)
            RETURN t.payload,t.version ORDER BY t.created_at DESC LIMIT 100""",term=query.strip().lower(),before=before)]


    def migrate(self):
        for row in self.read('MATCH (t:Incident) WHERE t.created_at IS NULL RETURN t.id,t.payload LIMIT 1000'):
            self.write('MATCH (t:Incident {id:$id}) SET t.created_at=$time',id=row[0],time=json.loads(row[1])['created_at'])


    def update(self, task_id, update, version=None):
        task = self.get(task_id)
        if not task: raise ValueError("Incident not found")
        if set(update) & {"id", "created_at", "mode", "service", "version"}: raise ValueError("Incident identity is immutable")
        encoded = json.dumps({**task, **update, "updated_at": now()})
        n = self.write("""MATCH (t:Incident {id:$id}) WHERE t.version=$version
            SET t.payload=$payload,t.version=t.version+1""", id=task_id,
            version=task["version"] if version is None else version, payload=encoded)
        if n != 1: raise ValueError("Incident changed concurrently; reload its checkpoint")
        return self.get(task_id)


    def append_event(self, task_id, session, role, kind, data):
        eid, timestamp = uid(), now()
        n = self.write("""MATCH (t:Incident {id:$task})
            MERGE (s:Session {id:$session}) ON CREATE SET s.role=$role,s.started_at=$time
            MERGE (t)-[:HAS_SESSION]->(s)
            CREATE (e:Event {id:$id,role:$role,kind:$kind,payload:$payload,time:$time})
            MERGE (s)-[:EMITTED]->(e) MERGE (t)-[:HAS_EVENT]->(e)""", task=task_id,
            session=session, role=role, time=timestamp, id=eid, kind=kind, payload=json.dumps(data))
        if n != 1: raise ValueError("Cannot append to absent incident")
        return {"id": eid, "task": task_id, "session": session, "role": role, "kind": kind, "time": timestamp, "data": data}


    def events(self, task_id, limit=500):
        if not isinstance(limit,int) or not 1<=limit<=10000:raise ValueError('Invalid event limit')
        rows = self.read("""MATCH (t:Incident {id:$id})-[:HAS_EVENT]->(e:Event)<-[:EMITTED]-(s:Session)
            RETURN e.id,s.id,e.role,e.kind,e.time,e.payload ORDER BY e.time DESC LIMIT $limit""", id=task_id,limit=limit)
        return [{"id": r[0], "session": r[1], "role": r[2], "kind": r[3], "time": r[4], "data": json.loads(r[5])} for r in reversed(rows)]
