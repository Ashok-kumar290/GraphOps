"""Compose domain capabilities; MCP exposes only the current role's methods."""
from graphops.agents.context import ToolContext
from graphops.agents.investigation import InvestigationTools
from graphops.company.tools import CompanyTools
from graphops.memory.tools import MemoryTools
from graphops.actions.tools import RecoveryTools

ROLES = {
    "investigator": ["checkpoint", "inspect_incident", "inspect_dependencies", "observe_service", "company_context", "search_company", "read_source", "recall_memory", "handoff_target", "conclude_investigation"],
    "resolver": ["checkpoint", "inspect_dependencies", "observe_service", "company_context", "recall_memory", "prepare_recovery", "execute_recovery", "complete_ticket"],
    "company": ["checkpoint", "inspect_dependencies", "company_context", "search_company", "read_source"],
}


class Tools:
    def __init__(self, store, task_id, session, role, port):
        if role not in ROLES:
            raise ValueError("Unknown agent role")
        context = ToolContext(store, task_id, session, role, port)
        context.tools = self
        self._methods = {}
        for capability in (InvestigationTools(context), CompanyTools(context), MemoryTools(context), RecoveryTools(context)):
            for name in {name for names in ROLES.values() for name in names}:
                method = getattr(capability, name, None)
                if method is not None:
                    self._methods[name] = method

    def __getattr__(self, name):
        try:
            return self._methods[name]
        except KeyError:
            raise AttributeError(name) from None
