"""CompanyRepository owns one domain of graph persistence."""
from graphops.graph.repository import Repository
from graphops.core.identity import now, uid
import json
from graphops.core.synthetic import SERVICES


class CompanyRepository(Repository):
    def put(self, doc_id, service, kind, title, text, revision, data, source=None):
        source = source or "fixture:event/" + doc_id
        existing=self.document(doc_id)
        if existing and existing['service']!=service:raise ValueError("A document cannot move between services")
        previous = self.read("MATCH (v:Revision {id:$id}) RETURN v.payload", id=doc_id+":"+revision)
        payload = {"id": doc_id, "service": service, "kind": kind, "title": title, "text": text,
                   "revision": revision, "source": source, "data": data}
        encoded = json.dumps(payload, sort_keys=True)
        if previous and previous[0][0] != encoded: raise ValueError("A source revision is immutable; provide a new revision")
        self.write("""MATCH (s:Service {id:$service}) MERGE (d:Document {id:$id})
            SET d.title=$title,d.kind=$kind,d.text=$text,d.source=$source,d.payload=$payload,d.revision=$revision
            MERGE (s)-[link:HAS_DOCUMENT]->(d) SET link.source=$source
            MERGE (v:Revision {id:$version}) ON CREATE SET v.payload=$payload,v.title=$revision,v.source=$source
            MERGE (d)-[:HAS_REVISION]->(v)""", id=doc_id, service=service, title=title, source=source,
            kind=kind, text=text, payload=encoded, revision=revision, version=doc_id+":"+revision, context=True)
        return payload


    def document(self, doc_id):
        rows = self.read("MATCH (d:Document {id:$id}) RETURN d.payload", id=doc_id)
        return json.loads(rows[0][0]) if rows else None


    def context(self, service, preview=False):
        owners = self.read("MATCH (t:Team)-[r:OWNS]->(:Service {id:$id}) RETURN t.title,r.source", id=service)
        docs = self.read("MATCH (:Service {id:$id})-[:HAS_DOCUMENT]->(d:Document) RETURN d.payload ORDER BY d.id", id=service)
        experts = self.read("MATCH (t:Team)-[:HAS_EXPERTISE]->(e:Expertise)-[:KNOWS]->(:Service {id:$id}) RETURN e.title,t.title", id=service)
        history = self.read("""MATCH (:Service {id:$id})-[:HAS_DOCUMENT]->(d:Document)-[:HAS_REVISION]->(v:Revision)
            WHERE v.id <> d.id+':'+d.revision RETURN v.payload LIMIT 12""", id=service)
        documents=[json.loads(r[0]) for r in docs];historical=[json.loads(r[0]) for r in history]
        if preview:
            for doc in documents+historical:
                doc['text_length']=len(doc['text']);doc['text_truncated']=len(doc['text'])>800;doc['text']=doc['text'][:800]
        return {"service": service, "owners": [{"name": r[0], "source": r[1]} for r in owners],
                "experts": [{"name": r[0], "team": r[1]} for r in experts], "documents": documents,
                "historical_documents": historical}


    def search(self, query, service=None):
        if not isinstance(query,str) or not 1<=len(query.strip())<=120:raise ValueError('Search must contain 1–120 characters')
        if service is not None and service not in SERVICES:raise ValueError('Unknown service')
        rows=self.read("""MATCH (s:Service)-[:HAS_DOCUMENT]->(d:Document)
            WHERE ($service='' OR s.id=$service) AND
              (toLower(d.title) CONTAINS $term OR toLower(coalesce(d.text,d.payload)) CONTAINS $term)
            RETURN d.payload ORDER BY d.id LIMIT 20""",service=service or '',term=query.strip().lower())
        result=[]
        for row in rows:
            doc=json.loads(row[0]);text=doc['text'];position=text.lower().find(query.strip().lower())
            start=max(0,position-120) if position>=0 else 0
            result.append({**doc,'text':text[start:start+700],'text_length':len(text),'text_truncated':len(text)>700})
        return {'query':query,'service':service,'documents':result,'limit':20}
