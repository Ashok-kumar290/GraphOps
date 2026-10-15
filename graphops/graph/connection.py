"""FalkorDB transport and context revision; no company or agent policy."""
import hashlib
import os
import re
from falkordb import FalkorDB
from graphops import settings


class GraphConnection:
    def __init__(self, scope=settings.SCOPE):
        if not isinstance(scope,str) or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}", scope): raise ValueError("Workspace must start with a letter or number and contain at most 80 letters, numbers, dots, underscores or hyphens")
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
