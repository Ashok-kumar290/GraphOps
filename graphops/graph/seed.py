"""Synthetic company fixture, initialized once per workspace."""
from graphops.core.synthetic import SERVICES, DEPENDENCIES

def seed_workspace(store, port):
    initialized = store.read("MATCH (m:Meta {id:'context'}) RETURN m.lab_port")
    if initialized and initialized[0][0] is not None:
        if initialized[0][0] != port: raise ValueError("Workspace lab port changed; choose a fresh workspace")
        return
    for offset, service in enumerate(SERVICES):
        team = "Payments Platform" if service == "payments" else "Commerce" if service != "analytics" else "Insights"
        store.write("""MERGE (s:Service {id:$service}) ON CREATE SET s.title=$service,s.url=$url,s.source=$source
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
        store.write("""MATCH (a:Service {id:$origin}),(b:Service {id:$target})
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
            if not store.company.document(doc_id): store.company.put(doc_id, service, kind, title, text, "v1", data)
    store.write("MATCH (m:Meta {id:'context'}) SET m.lab_port=$port", port=port)
