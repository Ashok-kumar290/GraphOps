"""Long-lived Python worker, JSON lines over stdio to the TypeScript API."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
import json
import os
import sys
from graphops import settings
from graphops.agent import Agent
from graphops.lab import Lab, SERVICES, SCENARIOS, request
from graphops.memory import Navigator
from graphops.models import configuration, preflight
from graphops.provider import ModelError
from graphops.store import Store, uid, now


def output(value):
    print(json.dumps(value, ensure_ascii=True), flush=True)


class Worker:
    def __init__(self, scope=settings.SCOPE, port=settings.LAB_PORT, emit=output):
        self.store, self.port, self.emit = Store(scope), port, emit
        self.lab = Lab(settings.DATA / scope, port).start()
        try: self.store.seed(port)
        except BaseException:
            self.lab.close()
            raise
        self.navigator = Navigator(self.store)
        self.active = None
        for task in self.store.tasks():
            if task.get("job") == "running": self.store.update_task(task["id"], {"job": "interrupted", "last_error": "Worker restarted. Resume this incident from its checkpoint."})

    def snapshot(self, task_id=None):
        tasks = sorted(self.store.tasks(), key=lambda t: t["created_at"], reverse=True)
        selected = next((t for t in tasks if t["id"] == task_id), None) if task_id else next((t for t in tasks if not t.get("question")), None)
        def measure(service): return {**request(self.lab.url(service)+"/health"), "source": self.lab.url(service)+"/health"}
        with ThreadPoolExecutor(max_workers=4) as pool: health = list(pool.map(measure, SERVICES))
        memories = {}
        for item in health:
            if "revision" in item: memories[item["service"]] = self.navigator.packet(item["service"], item["revision"])
        return {"workspace": self.store.scope, "graph_name": self.store.name, "graph": self.store.diagram(),
            "tasks": tasks, "selected": selected, "events": self.store.events(selected["id"]) if selected else [],
            "health": health, "memory": memories, "company": {s: self.store.company(s) for s in SERVICES},
            "model": configuration(), "busy": self.active is not None and not self.active.done(),
            "scenarios": [{"id": k, "label": v["label"]} for k, v in SCENARIOS.items()], "observed_at": now()}

    async def execute(self, task_id, command, question=""):
        task = self.store.task(task_id); mode = task["mode"]
        try:
            agent = Agent(self.store, self.port, self.emit)
            if command == "question": await agent.run(task_id, "company", question, mode)
            elif command == "start":
                await agent.run(task_id, "investigator", "Investigate the gateway failure. Compare reachable causes and unrelated failures, retrieve relevant context, then hand off supported evidence.", mode)
                if not task.get("pause_after_handoff", False) and self.store.task(task_id)["status"] == "handoff":
                    self.emit({"type": "progress", "task": task_id, "stage": "handoff_saved", "role": "resolver"})
                    # A fresh agent and MCP process load the saved handoff from FalkorDB.
                    await Agent(Store(self.store.scope), self.port, self.emit).run(task_id, "resolver",
                        "Continue the persisted handoff. Check memory and current procedure, recover only with a validated plan, verify health and complete the synthetic ticket.", mode)
            else:
                if task["status"] in {"new", "blocked"}:
                    await agent.run(task_id, "investigator", "Resume this incident from its checkpoint using current evidence. Recheck the blocker before handing off.", mode)
                current = self.store.task(task_id)
                if current["status"] in {"handoff", "executing", "resolved"}:
                    await agent.run(task_id, "resolver", "Continue the persisted handoff. Check memory and current procedure, recover only with a validated plan, verify health and complete the synthetic ticket.", mode)
            self.store.update_task(task_id, {"job": "idle", "last_error": None})
        except asyncio.CancelledError:
            self.store.update_task(task_id, {"job": "interrupted", "last_error": "Worker stopped. Checkpoint preserved."}); raise
        except Exception as exc:
            while isinstance(exc, BaseExceptionGroup) and exc.exceptions: exc = exc.exceptions[0]
            message = str(exc)[:900] if isinstance(exc, (RuntimeError, ValueError)) else type(exc).__name__
            self.store.event(task_id, uid(), "system", "run_error", {"message": message})
            self.store.update_task(task_id, {"job": "interrupted", "last_error": message})
        finally: self.emit({"type": "progress", "task": task_id, "stage": "finished"})

    async def dispatch(self, command, body):
        if command == "snapshot": return self.snapshot(body.get("task"))
        if command == "model_status": return configuration()
        if self.active is not None and not self.active.done(): raise ValueError("An agent is running. Wait for its checkpoint before starting another operation.")
        if command == "start":
            scenario, mode = body.get("scenario", "config"), body.get("mode", "llm")
            if scenario not in SCENARIOS or mode not in {"llm", "scripted"}: raise ValueError("Invalid scenario or mode")
            pause = body.get("pause_after_handoff", False)
            if not isinstance(pause, bool): raise ValueError("Pause after handoff must be a boolean")
            if mode == "llm": preflight()  # No fault injection until the local model is installed.
            task = self.store.create_task(scenario, "Investigate checkout service failure", mode)
            self.store.update_task(task["id"], {"pause_after_handoff": pause})
            try: injection = self.lab.inject(scenario)
            except Exception:
                self.store.update_task(task["id"], {"status": "blocked", "last_error": "Scenario not started; existing fault must be resolved"}); raise
            self.store.event(task["id"], uid(), "system", "scenario_started", {"generation": injection["generation"], "environment": "controlled Go HTTP lab; synthetic company records"})
        elif command == "resume":
            task = self.store.task(body.get("task", ""))
            if not task or task.get("question"): raise ValueError("Incident not found")
            if task["mode"] == "llm": preflight()
        elif command == "question":
            question = body.get("question", "").strip()
            if not 1 <= len(question) <= 1000: raise ValueError("Enter a question of 1–1000 characters")
            mode = body.get("mode", "llm")
            if mode not in {"llm", "scripted"}: raise ValueError("Invalid mode")
            if mode == "llm": preflight()
            task = self.store.create_task("company", question, mode)
            self.store.update_task(task["id"], {"question": True})
        elif command == "update_company":
            service = body.get("service")
            if service not in {"payments", "orders"}: raise ValueError("Select payments or orders")
            operation = body.get("operation")
            if operation == "owner":
                owner = body.get("owner", "").strip()
                if not 1 <= len(owner) <= 80: raise ValueError("Owner must contain 1–80 characters")
                self.store.write("""MATCH (s:Service {id:$service}) OPTIONAL MATCH (:Team)-[r:OWNS]->(s)
                    DELETE r WITH s MERGE (t:Team {id:$owner}) SET t.title=$owner
                    MERGE (t)-[r:OWNS]->(s) SET r.source='owned:event/ownership-update'""", service=service, owner=owner, context=True)
                self.store.put_document(service+"-ownership", service, "ownership", "Ownership update", "Current owner: "+owner, uid()[:8], {"owner": owner})
            elif operation in {"retire_runbook", "restore_runbook"}:
                doc = self.store.document(service+"-runbook")
                action = SCENARIOS["config" if service == "payments" else "worker"]["action"]
                precondition = "config-broken-v1" if service == "payments" else "worker-stopped-v1"
                enabled = operation == "restore_runbook"
                data = {"action": action if enabled else "requires_review", "precondition": precondition}
                self.store.put_document(doc["id"], service, "runbook", doc["title"],
                    "Validated recovery: "+action if enabled else "Prior recovery procedure retired. Investigation and a new validated procedure are required.", uid()[:8], data)
            else: raise ValueError("Unknown company operation")
            self.emit({"type": "progress", "stage": "company_updated"})
            return {"updated": True}
        else: raise ValueError("Unknown worker command")
        self.store.update_task(task["id"], {"job": "running", "last_error": None})
        self.active = asyncio.create_task(self.execute(task["id"], command, body.get("question", "")))
        return {"task": task["id"], "accepted": True}

    async def close(self):
        if self.active is not None and not self.active.done():
            self.active.cancel()
            try: await self.active
            except asyncio.CancelledError: pass
        self.lab.close()


async def main():
    if hasattr(sys.stdout, "reconfigure"): sys.stdout.reconfigure(encoding="utf-8")
    worker = Worker()
    output({"type": "ready", "workspace": worker.store.scope})
    try:
        while True:
            line = await asyncio.to_thread(sys.stdin.readline)
            if not line: break
            message = {}
            try:
                message = json.loads(line)
                result = await worker.dispatch(message["command"], message.get("body", {}))
                output({"type": "reply", "id": message["id"], "result": result})
            except Exception as exc:
                output({"type": "reply", "id": message.get("id"), "error": str(exc)[:900] if isinstance(exc, (ValueError, RuntimeError)) else "Worker request failed: "+type(exc).__name__})
    finally: await worker.close()


if __name__ == "__main__": asyncio.run(main())
