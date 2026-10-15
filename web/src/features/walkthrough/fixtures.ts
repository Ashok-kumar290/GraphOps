import type { Event, Incident, Memory, Workspace } from "../../shared/contracts";
import type { Walkthrough } from "./model";

// Synthetic records for DOM/unit checks, never shipped as fallback workspace data.
export function workspaceFixture(): Workspace {
  const services = ["gateway", "orders", "payments", "analytics"];
  return {
    workspace: "guided-test", graph_name: "guided-test", tasks: [], selected: null, events: [],
    graph: {nodes: services.map((id, key) => ({key, id, title: id, kind: "Service", source: "fixture:test"})),
      edges: [{from: 0, to: 1, kind: "DEPENDS_ON", source: "fixture:test"}, {from: 1, to: 2, kind: "DEPENDS_ON", source: "fixture:test"}]},
    health: services.map(service => ({service, healthy: true, http_status: 200, revision: "healthy-v1", source: "fixture:test"})),
    memory: Object.fromEntries(services.map(service => [service, {active: [], historical: [], unverified: [], conflicts: [], cache_hit: false, revision: "healthy-v1"}])),
    company: Object.fromEntries(services.map(service => [service, {service, owners: [{name: "Synthetic team", source: "fixture:test"}], experts: [], documents: [], historical_documents: []}])),
    model: {provider: "test", model: "test-model", configured: true}, busy: false, stopping: false,
    scenarios: [{id: "config", label: "Payments configuration"}, {id: "worker", label: "Orders worker"}], observed_at: "2026-10-15T00:00:00Z",
  };
}

export const questionFixture: Incident = {id: "QUESTION-GUIDE", title: "Who owns payments?", service: "gateway", target: "payments", question: true, status: "answered", mode: "llm", job: "idle", created_at: "2026-10-15T00:00:00Z"};
export function eventFixture(kind: string, role: string, session: string, data: Record<string, unknown>): Event {
  return {id: `${kind}-${role}-${session}`, kind, role, session, time: "2026-10-15T00:00:00Z", data};
}
export function questionEventsFixture(): Event[] {
  return [eventFixture("session_finished", "company", "company-session", {mode: "llm", summary: "Payments belongs to the Synthetic team.", citations: ["fixture:test"]})];
}
export function incidentFixture(): Incident {
  const health = (service: string, status: number) => ({service, http_status: status, healthy: status === 200, source: "fixture:test"});
  return {id: "INC-GUIDE", title: "Checkout failure", service: "gateway", target: "payments", status: "resolved", mode: "llm", job: "idle", ticket_closed: true, created_at: "2026-10-15T00:00:00Z",
    outcome: {success: true, action: "restore_config", target: "payments", operation_id: "guide-op", before: health("payments", 503), after: health("payments", 200), incident: health("gateway", 200)}};
}
export function incidentEventsFixture(): Event[] {
  return [eventFixture("session_started", "investigator", "investigator-session", {mode: "llm"}), eventFixture("session_started", "resolver", "resolver-session", {mode: "llm"})];
}
export function memoryFixture(kind: string, task = "INC-GUIDE"): Memory {
  return {id: `${task}:${kind}`, task, service: "payments", kind, revision: "healthy-v1", source: "fixture:test", verified: true, created_at: "2026-10-15T00:00:00Z", validity: "past_event", data: {action: "restore_config"}};
}
export function guideFixture(): Walkthrough {
  return {workspace: "guided-test", step: "company", questionId: "QUESTION-GUIDE", incidentId: "INC-GUIDE", questionEvents: questionEventsFixture(), incidentEvents: incidentEventsFixture()};
}
