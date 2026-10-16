import { expect, test } from "vitest";
import { incidentJourney } from "./journey";
import { presentEvent } from "../runs/presentation";
import { eventFixture, incidentEventsFixture, incidentFixture, memoryFixture, workspaceFixture } from "../walkthrough/fixtures";

function completedRun() {
  const data = workspaceFixture(), task = incidentFixture();
  data.selected = task; data.tasks = [task]; data.events = incidentEventsFixture();
  data.memory.payments.historical = ["episodic", "procedural", "semantic"].map(kind => memoryFixture(kind));
  return {data, task};
}

test("An empty incident story claims no completed work", () => {
  const story = incidentJourney(workspaceFixture(), undefined);
  expect(story.complete).toBe(false);
  expect(story.steps.every(step => !step.done)).toBe(true);
});

test("A measured run with distinct sessions and matching memory completes the story", () => {
  const {data, task} = completedRun(), story = incidentJourney(data, task);
  expect(story.complete).toBe(true);
  expect(story.memories).toHaveLength(3);
  expect(story.steps[3].proof).toContain("payments HTTP 503 → 200; checkout HTTP 200");
});

test("Other runs and reused sessions cannot supply fresh-session evidence", () => {
  const {data, task} = completedRun();
  data.selected = {...task, id: "INC-OTHER"};
  expect(incidentJourney(data, task).steps[1].done).toBe(false);
  data.selected = task;
  data.events[1].session = data.events[0].session;
  expect(incidentJourney(data, task).complete).toBe(false);
});

test("Older, unverified and unsourced memory cannot complete the memory step", () => {
  for (const invalid of ["other-task", "unverified", "missing-source"]) {
    const {data, task} = completedRun(), fact = data.memory.payments.historical[2];
    if (invalid === "other-task") fact.task = "INC-OTHER";
    else if (invalid === "unverified") fact.verified = false;
    else fact.source = "";
    expect(incidentJourney(data, task).steps[4].done).toBe(false);
  }
});

test("A saved memory event documents writes even after records leave the bounded packet", () => {
  const {data, task} = completedRun();
  data.memory.payments.historical = [];
  data.events.push(eventFixture("memory_saved", "resolver", "resolver-session", {service: "payments", kinds: ["episodic", "procedural", "semantic"]}));
  const story = incidentJourney(data, task);
  expect(story.steps[4].done).toBe(true);
  expect(story.steps[4].proof).toContain("0 matching records");
  data.events.at(-1)!.data.service = "orders";
  expect(incidentJourney(data, task).steps[4].done).toBe(false);
});

test("Unclosed tickets, interrupted jobs and failed measurements remain incomplete", () => {
  for (const invalid of ["ticket", "interruption", "health", "wrong-service"]) {
    const {data, task} = completedRun();
    if (invalid === "ticket") task.ticket_closed = false;
    else if (invalid === "interruption") task.job = "interrupted";
    else if (invalid === "health") task.outcome!.incident.http_status = 503;
    else task.outcome!.after.service = "analytics";
    expect(incidentJourney(data, task).steps[3].done).toBe(false);
    expect(incidentJourney(data, task).complete).toBe(false);
  }
});

test("A rejected procedure explains its blocker without claiming recovery", () => {
  const {data, task} = completedRun();
  task.status = "blocked"; task.ticket_closed = false; delete task.outcome;
  data.events.push(eventFixture("tool", "resolver", "resolver-session", {tool: "prepare_recovery", result: {ready: false, reason: "Runbook retired."}}));
  const story = incidentJourney(data, task);
  expect(story.active).toBe(2);
  expect(story.steps[2].proof).toBe("Runbook retired.");
  expect(story.steps[2].done).toBe(false);
  expect(story.complete).toBe(false);
});

test("Tool errors and stopped runs display their actual message", () => {
  const tool = presentEvent(eventFixture("tool_error", "resolver", "s", {tool: "prepare_recovery", error: "The runbook changed."}));
  expect(tool.description).toBe("The runbook changed.");
  expect(tool.success).toBe(false);
  const stopped = presentEvent(eventFixture("run_stopped", "system", "s", {message: "Stopped at checkpoint."}));
  expect(stopped.description).toBe("Stopped at checkpoint.");
  expect(stopped.title).toBe("Stopped at a checkpoint");
});

test("Readable activity preserves measurements and memory-save events", () => {
  const recovered = presentEvent(eventFixture("tool", "resolver", "s", {tool: "execute_recovery", result: {success: true, target: "payments", after: {http_status: 200}, incident: {http_status: 200}}}));
  expect(recovered.description).toBe("payments HTTP 200; checkout HTTP 200.");
  const saved = presentEvent(eventFixture("memory_saved", "resolver", "s", {service: "payments", kinds: ["episodic", "procedural", "semantic"]}));
  expect(saved.title).toBe("Shared memory saved");
  expect(saved.description).toContain("episodic, procedural, semantic");
});
