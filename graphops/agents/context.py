"""One graph, task, session and role bound to all capabilities of an agent."""
from graphops.core.synthetic import SERVICES
from graphops.memory.navigator import Navigator

class ToolContext:
    def __init__(self, store, task_id, session, role, port):
        self.store, self.task_id, self.session, self.role, self.port = store, task_id, session, role, port
        self.navigator = Navigator(store)
        self.tools = None

    def record(self, tool, arguments, result):
        event = self.store.runs.append_event(self.task_id, self.session, self.role, "tool", {"tool": tool, "arguments": arguments, "result": result})
        return {**result, "evidence_id": event["id"]}


    def endpoint(self, service):
        if service not in SERVICES: raise ValueError("Unknown authorized lab service")
        rows = self.store.read("MATCH (s:Service {id:$id}) RETURN s.url", id=service)
        expected = f"http://127.0.0.1:{self.port+SERVICES.index(service)}"
        if not rows or rows[0][0] != expected: raise ValueError("Graph endpoint is outside this authorized lab")
        return expected
