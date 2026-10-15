"""MemoryTools: domain capabilities exposed through role-bound MCP."""
from graphops.actions.lab import request

from graphops.core.identity import age, now
from concurrent.futures import ThreadPoolExecutor

class MemoryTools:
    def __init__(self, context):
        self.context = context

    def recall_memory(self, service: str) -> dict:
        """Retrieve previous incident episodes, facts and procedures, with freshness and applicability labels."""
        current = self.context.tools.observe_service(service)
        if "revision" not in current:
            return self.context.record("recall_memory", {"service": service}, {"error": "Current source unavailable; memory cannot be validated", "active": []})
        packet = self.context.navigator.packet(service, current["revision"])
        return self.context.record("recall_memory", {"service": service}, {**packet, "measurement_id": current["evidence_id"]})
