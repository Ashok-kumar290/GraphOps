"""PlanRepository owns one domain of graph persistence."""
from graphops.graph.repository import Repository
from graphops.core.identity import now, uid
import json


class PlanRepository(Repository):
    def get_or_create(self, task_id, data=None, plan_id=None):
        if data is not None:
            plan_id = uid()
            self.write("""MATCH (t:Incident {id:$task}) CREATE (p:Plan {id:$id,payload:$payload})
                MERGE (t)-[:HAS_PLAN]->(p)""", task=task_id, id=plan_id, payload=json.dumps({**data, "id": plan_id, "created_at": now()}))
        rows = self.read("MATCH (:Incident {id:$task})-[:HAS_PLAN]->(p:Plan {id:$id}) RETURN p.payload", task=task_id, id=plan_id)
        if not rows: raise ValueError("Plan does not belong to this incident")
        return json.loads(rows[0][0])
