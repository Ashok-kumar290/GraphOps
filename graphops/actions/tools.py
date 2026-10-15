"""RecoveryTools: domain capabilities exposed through role-bound MCP."""
from graphops.actions.lab import request

from graphops.core.identity import age, now
from concurrent.futures import ThreadPoolExecutor
from graphops.actions.policy import PROCEDURES

class RecoveryTools:
    def __init__(self, context):
        self.context = context

    def prepare_recovery(self) -> dict:
        """Validate the handoff against the graph, current health and runbook. Backend supplies exact revision values."""
        if self.context.role != "resolver": raise ValueError("Only the resolver can prepare an action")
        task = self.context.store.runs.get(self.context.task_id)
        if task["status"] == "resolved": return {"ready": False, "terminal": True, "reason": "Already resolved; no repeat operation"}
        if task["status"] not in {"handoff", "executing"} or not task.get("target"):
            raise ValueError("No persisted actionable handoff")
        target = task["target"]
        topology = self.context.tools.inspect_dependencies(task["service"])
        connected = target == task["service"] or any(p["services"][-1] == target for p in topology["paths"])
        company = self.context.tools.company_context(target)
        measured = self.context.tools.observe_service(target)
        runbook = next((d for d in company["documents"] if d["kind"] == "runbook"), None)
        data = runbook["data"] if runbook else {}
        supported = (target, data.get("action"), data.get("precondition")) in PROCEDURES
        state_matches = measured.get("revision") == data.get("precondition") and measured.get("error") == data.get("action")
        if not connected or not supported or not (state_matches or task["status"] == "executing"):
            reason = "Current graph, runbook or configuration does not support a validated recovery. No action taken."
            self.context.store.runs.update(self.context.task_id, {"status": "blocked", "blocker": reason})
            return self.context.record("prepare_recovery", {}, {"ready": False, "terminal": True, "reason": reason,
                "runbook": runbook, "measurement": measured, "evidence": [topology["evidence_id"], measured["evidence_id"]]})
        plan = self.context.store.plans.get_or_create(self.context.task_id, {"target": target, "action": data["action"], "expected_revision": data["precondition"],
            "runbook_id": runbook["id"], "runbook_revision": runbook["revision"], "source": runbook["source"],
            "evidence": [topology["evidence_id"], company["evidence_id"], measured["evidence_id"]]})
        return self.context.record("prepare_recovery", {}, {"ready": True, "plan_id": plan["id"], "plan": plan})


    def execute_recovery(self, plan_id: str) -> dict:
        """Execute an exact prepared plan ID. Recheck current graph and runbook; verify actual HTTP recovery."""
        if self.context.role != "resolver": raise ValueError("Only the resolver can execute")
        plan = self.context.store.plans.get_or_create(self.context.task_id, plan_id=plan_id)
        task = self.context.store.runs.get(self.context.task_id)
        if task["status"] == "resolved": return self.context.record("execute_recovery", {"plan_id": plan_id}, {**task["outcome"], "replayed": True})
        if task["status"] not in {"handoff", "executing"} or task["target"] != plan["target"]: raise ValueError("Plan no longer matches the handoff")
        if not 0 <= age(plan["created_at"]) <= 600: raise ValueError("Plan expired. Prepare a new plan.")
        book = self.context.store.company.document(plan["runbook_id"])
        if not book or book["revision"] != plan["runbook_revision"]: raise ValueError("Runbook changed; prepare again")
        paths = self.context.store.topology.paths(task["service"])["paths"]
        if task["service"] != plan["target"] and not any(p["services"][-1] == plan["target"] for p in paths): raise ValueError("Dependency path changed; no action taken")
        before = self.context.tools.observe_service(plan["target"])
        operation = task.get('operation') or self.context.store.name+":"+self.context.task_id
        if task["status"] == "handoff":
            if before.get("revision") != plan["expected_revision"] or before.get("error") != plan["action"]:
                raise ValueError("Current measurements do not match the prepared action")
            self.context.store.runs.update(self.context.task_id, {"status": "executing", "operation": operation, "before": before}, task["version"])
        response = request(self.context.endpoint(plan["target"])+"/recover", {"operation_id": operation,
            "action": plan["action"], "expected_revision": plan["expected_revision"]}, admin=True)
        after = self.context.tools.observe_service(plan["target"])
        incident = self.context.tools.observe_service(task["service"])
        success = response.get("restored") is True and after["http_status"] == 200 and incident["http_status"] == 200
        outcome = {"success": success, "action": plan["action"], "target": plan["target"], "operation_id": operation,
                   "before": self.context.store.runs.get(self.context.task_id).get("before", before), "after": after, "incident": incident, "response": response}
        if success:
            self.context.store.memory.save(self.context.task_id, plan["target"], "episodic", plan["expected_revision"], after["source"],
                {"action": plan["action"], "success": True, "evidence": [after["evidence_id"], incident["evidence_id"]]})
            self.context.store.memory.save(self.context.task_id, plan["target"], "procedural", plan["expected_revision"], book["source"],
                {"action": plan["action"], "runbook_revision": book["revision"], "precondition": plan["expected_revision"]})
            self.context.store.memory.save(self.context.task_id, plan["target"], "semantic", after["revision"], after["source"],
                {"claim": "health", "value": "healthy", "evidence": [after["evidence_id"]]})
            self.context.store.runs.append_event(self.context.task_id,self.context.session,self.context.role,'memory_saved',
                {'service':plan['target'],'kinds':['episodic','procedural','semantic'],'source':after['source'],
                 'evidence':[after['evidence_id'],incident['evidence_id']]})
        self.context.store.runs.update(self.context.task_id, {"status": "resolved" if success else "blocked", "outcome": outcome})
        return self.context.record("execute_recovery", {"plan_id": plan_id}, outcome)


    def complete_ticket(self) -> dict:
        """Close the handoff target's synthetic ticket after measured recovery. Backend selects its exact ID."""
        task = self.context.store.runs.get(self.context.task_id)
        if self.context.role != "resolver" or task["status"] != "resolved": raise ValueError("Measured recovery is required")
        ticket = self.context.store.company.document(task["target"]+"-ticket")
        if not ticket or ticket["service"] != task["target"]: raise ValueError("No matching company ticket")
        revision = "closed-" + self.context.task_id
        data = {**ticket["data"], "state": "closed", "resolution": self.context.task_id}
        updated = self.context.store.company.put(ticket["id"], ticket["service"], "ticket", ticket["title"], ticket["text"], revision, data)
        self.context.store.runs.update(self.context.task_id, {"ticket_closed": True})
        return self.context.record("complete_ticket", {}, {"ticket": updated["id"], "state": "closed", "source": updated["source"], "revision": revision})
