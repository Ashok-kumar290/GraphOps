"""Composition root for domain repositories sharing one workspace graph."""
from graphops import settings
from graphops.graph.connection import GraphConnection
from graphops.graph.topology import TopologyRepository
from graphops.graph.seed import seed_workspace
from graphops.company.repository import CompanyRepository
from graphops.runs.repository import RunRepository
from graphops.runs.plans import PlanRepository
from graphops.memory.repository import MemoryRepository
from graphops.workspace.audit import AuditRepository


class WorkspaceGraph(GraphConnection):
    def __init__(self, scope=settings.SCOPE):
        super().__init__(scope)
        self.company = CompanyRepository(self)
        self.runs = RunRepository(self)
        self.plans = PlanRepository(self)
        self.memory = MemoryRepository(self)
        self.topology = TopologyRepository(self)
        self.audit = AuditRepository(self)

    def seed(self, port):
        seed_workspace(self, port)
