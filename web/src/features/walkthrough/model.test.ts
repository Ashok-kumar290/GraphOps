import { expect, test } from "vitest";
import { dependencyPath, walkthroughEvidence } from "./model";
import { guideFixture, incidentFixture, memoryFixture, questionFixture, workspaceFixture } from "./fixtures";

function completeFixture() {
  const data = workspaceFixture();
  data.tasks = [{...questionFixture}, incidentFixture()];
  data.memory.payments.historical = ["episodic", "procedural", "semantic"].map(kind => memoryFixture(kind));
  return data;
}

test("Historical runs cannot complete a newly started walkthrough", () => {
  const data = completeFixture();
  data.selected = data.tasks[1];
  const evidence = walkthroughEvidence(data, {...guideFixture(), questionId: null, incidentId: null, questionEvents: [], incidentEvents: []});
  expect(evidence.complete).toBe(false);
  expect(evidence.done).toEqual({company: false, graph: true, investigate: false, recover: false, memory: false});
});

test("A dependency path requires actual directed service relationships", () => {
  const data = workspaceFixture();
  expect(dependencyPath(data)).toEqual(["gateway", "orders", "payments"]);
  data.graph.edges = [{from: 0, to: 1, kind: "DEPENDS_ON", source: "fixture:test"}, {from: 1, to: 0, kind: "DEPENDS_ON", source: "fixture:test"}];
  expect(dependencyPath(data)).toBeNull();
  data.graph.edges[0].kind = "HAS_DOCUMENT";
  expect(dependencyPath(data, "gateway", "orders")).toBeNull();
});

test("Company completion requires this question's cited LLM answer", () => {
  const data = completeFixture(), guide = guideFixture();
  expect(walkthroughEvidence(data, guide).done.company).toBe(true);
  guide.questionEvents[0].data.citations = [];
  expect(walkthroughEvidence(data, guide).done.company).toBe(false);
  guide.questionEvents[0].data.citations = ["fixture:test"];
  guide.questionEvents[0].data.mode = "scripted";
  expect(walkthroughEvidence(data, guide).done.company).toBe(false);
});

test("Recovery requires separate sessions, measured health, ticket completion and an idle job", () => {
  const data = completeFixture(), guide = guideFixture(), incident = data.tasks[1];
  expect(walkthroughEvidence(data, guide).done.recover).toBe(true);
  incident.ticket_closed = false;
  expect(walkthroughEvidence(data, guide).done.recover).toBe(false);
  incident.ticket_closed = true;
  incident.job = "interrupted";
  expect(walkthroughEvidence(data, guide).done.recover).toBe(false);
  incident.job = "idle";
  incident.outcome!.incident.http_status = 503;
  expect(walkthroughEvidence(data, guide).done.recover).toBe(false);
  incident.outcome!.incident.http_status = 200;
  guide.incidentEvents[1].session = guide.incidentEvents[0].session;
  expect(walkthroughEvidence(data, guide).done.recover).toBe(false);
});

test("Only this incident's three memory kinds complete the memory step", () => {
  const data = completeFixture(), guide = guideFixture();
  expect(walkthroughEvidence(data, guide).complete).toBe(true);
  // Expired observations can be historical and still document the measured outcome.
  expect(walkthroughEvidence(data, guide).memories).toHaveLength(3);
  data.memory.payments.historical[2].task = "INC-UNRELATED";
  expect(walkthroughEvidence(data, guide).done.memory).toBe(false);
});

test("Evidence from a different workspace cannot complete the guide", () => {
  const data = completeFixture();
  data.workspace = "another-workspace";
  const evidence = walkthroughEvidence(data, guideFixture());
  expect(evidence.complete).toBe(false);
  expect(Object.values(evidence.done).every(value => !value)).toBe(true);
});
