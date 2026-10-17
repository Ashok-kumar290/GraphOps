"""Write records from company tools (Slack, Jira, GitHub) into the FalkorDB company graph.

Each connector yields normalised records:
    {"tool", "external_id", "kind": chat|ticket|change, "title", "text", "author", "people",
     "status", "url", "time", "hints": [channel, component or path names]}

A record becomes a versioned Document attached to the service it concerns, plus Person nodes
for who posted, was assigned or authored it. A changed record (for example a ticket moving to
Done) gets a new immutable revision, so history is kept. Imported records are reference data:
they never authorise a recovery action; only an approved runbook does.
"""
import hashlib
import re
from graphops.core.synthetic import SERVICES

# "checkout" is the business name for the gateway entry point in the sample company.
ALIASES = {"payments": "payments", "payment": "payments", "orders": "orders", "order": "orders",
           "gateway": "gateway", "checkout": "gateway", "analytics": "analytics"}
PERSON_EDGE = {"author": "POSTED", "assignee": "ASSIGNED", "reporter": "REPORTED", "committer": "AUTHORED"}


def service_for(record):
    """The service a record concerns: first from its channel, component or path, then from its text."""
    for hint in record.get("hints", []):
        for word in re.findall(r"[a-z]+", str(hint).lower()):
            if word in ALIASES: return ALIASES[word]
    text = (record.get("title", "") + " " + record.get("text", "")).lower()
    found = [(m.start(), ALIASES[m.group(0)]) for m in re.finditer(r"\b(" + "|".join(ALIASES) + r")\b", text)]
    return min(found)[1] if found else None


def ingest(store, records, repository=None):
    """Store records; returns counts by service. Records about no service attach to `repository` if given."""
    summary = {"imported": 0, "unchanged": 0, "services": {}, "repository": 0, "unlinked": 0, "people": set()}
    if repository:
        store.write("""MERGE (r:Repository {id:$id}) SET r.title=$id, r.url=$url
            WITH r MATCH (p:Project) MERGE (p)-[l:HAS_REPOSITORY]->(r) SET l.source=$url""",
            id=repository, url="https://github.com/" + repository, context=True)
    for record in records:
        service = service_for(record)
        anchor = "Service" if service in SERVICES else "Repository" if repository else None
        if anchor is None: summary["unlinked"] += 1; continue
        owner = service if anchor == "Service" else repository
        doc_id = record["tool"] + "-" + hashlib.sha256(record["external_id"].encode()).hexdigest()[:16]
        text = record["text"].strip()[:4000] or record["title"]
        revision = hashlib.sha256("\n".join([record["title"], text, str(record.get("status")), str(record.get("time"))]).encode()).hexdigest()[:16]
        previous = store.company.document(doc_id)
        data = {"tool": record["tool"], "external_id": record["external_id"], "url": record.get("url"),
                "author": record.get("author"), "status": record.get("status"), "time": record.get("time"),
                "people": record.get("people", {}), "action_policy": "reference_only"}
        source = record.get("url") or f"{record['tool']}:{record['external_id']}"
        store.company.put(doc_id, owner, record["kind"], record["title"][:120], text, revision, data, source=source, anchor=anchor)
        for role, person in (record.get("people") or {}).items():
            if not person or role not in PERSON_EDGE: continue
            person_id = record["tool"] + ":" + person
            store.write(f"""MERGE (p:Person {{id:$person}}) SET p.title=$name, p.tool=$tool
                WITH p MATCH (d:Document {{id:$doc}}) MERGE (p)-[r:{PERSON_EDGE[role]}]->(d) SET r.source=$source""",
                person=person_id, name=person, tool=record["tool"], doc=doc_id, source=source, context=True)
            summary["people"].add(person_id)
        if previous and previous["revision"] == revision: summary["unchanged"] += 1; continue
        summary["imported"] += 1
        if anchor == "Service": summary["services"][service] = summary["services"].get(service, 0) + 1
        else: summary["repository"] += 1
    summary["people"] = len(summary["people"])
    return summary
