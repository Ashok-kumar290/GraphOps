"""MemoryRepository owns one domain of graph persistence."""
from graphops.graph.repository import Repository
from graphops.core.identity import now, uid
import json


class MemoryRepository(Repository):
    def save(self, task_id, service, kind, revision, source, data, verified=True):
        mid = task_id+":"+kind
        payload = {"id": mid, "task": task_id, "service": service, "kind": kind, "revision": revision,
                   "source": source, "data": data, "verified": verified, "created_at": now()}
        self.write("""MATCH (s:Service {id:$service}) MERGE (m:Memory {id:$id})
            SET m.payload=$payload,m.kind=$kind,m.time=$time,m.title=$title
            MERGE (s)-[:HAS_MEMORY]->(m)""", service=service, id=mid, kind=kind, time=payload["created_at"],
            title=kind + " · " + task_id, payload=json.dumps(payload), context=True)
        return payload


    def list(self, service):
        return [json.loads(r[0]) for r in self.read("""MATCH (:Service {id:$id})-[:HAS_MEMORY]->(m:Memory)
            RETURN m.payload ORDER BY m.time DESC LIMIT 20""", id=service)]
