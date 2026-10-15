"""TopologyRepository owns one domain of graph persistence."""
from graphops.graph.repository import Repository
from graphops.core.identity import now, uid
import json


class TopologyRepository(Repository):
    def paths(self, service):
        rows = self.read("""MATCH p=(:Service {id:$service})-[:DEPENDS_ON*1..8]->(:Service)
            RETURN [n IN nodes(p)|n.id],[r IN relationships(p)|r.source] ORDER BY length(p) LIMIT 50""", service=service)
        return {"service": service, "paths": [{"services": r[0], "sources": r[1]} for r in rows],
                "query": "MATCH p=(:Service {id:$service})-[:DEPENDS_ON*1..8]->(:Service) RETURN p"}


    def diagram(self):
        rows = self.read("""MATCH (n) WHERE n:Service OR n:Team OR n:Project OR n:Expertise OR n:Document
            RETURN id(n),labels(n)[0],n.id,n.title,n.source LIMIT 150""")
        nodes = [{"key": r[0], "kind": r[1], "id": r[2], "title": r[3], "source": r[4]} for r in rows]
        keys = [n["key"] for n in nodes]
        edges = self.read("""MATCH (a)-[r]->(b) WHERE id(a) IN $keys AND id(b) IN $keys
            RETURN id(a),id(b),type(r),r.source LIMIT 300""", keys=keys)
        return {"nodes": nodes, "edges": [{"from": r[0], "to": r[1], "kind": r[2], "source": r[3]} for r in edges]}
