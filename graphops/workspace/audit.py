"""AuditRepository owns one domain of graph persistence."""
from graphops.graph.repository import Repository
from graphops.core.identity import now, uid
import json


class AuditRepository(Repository):
    def append(self, action, details):
        item={'id':uid(),'action':action,'details':details,'actor':'workspace_member','time':now()}
        self.write('CREATE (:Audit {id:$id,time:$time,payload:$payload})',id=item['id'],time=item['time'],payload=json.dumps(item))
        return item


    def list(self):
        return [json.loads(row[0]) for row in self.read('MATCH (a:Audit) RETURN a.payload ORDER BY a.time DESC LIMIT 50')]
