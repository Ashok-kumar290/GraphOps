import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../../app/App";
import { eventFixture, incidentEventsFixture, incidentFixture, memoryFixture, questionEventsFixture, questionFixture, workspaceFixture } from "./fixtures";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("EventSource", class {onmessage: unknown; close() {}});
});
afterEach(() => {cleanup(); vi.unstubAllGlobals();});
const response = (value: unknown) => new Response(JSON.stringify(value), {status: 200, headers: {"Content-Type": "application/json"}});

test("The homepage uses actual graph edges and does not invent a missing checkout path", async () => {
  const data = workspaceFixture(); data.graph.edges = [];
  vi.stubGlobal("fetch", vi.fn(async () => response(data)));
  render(<App/>);
  await screen.findByText("FalkorDB connected");
  const path = screen.getByLabelText("Checkout dependencies from FalkorDB");
  expect(path.textContent).toContain("no checkout-to-payments path");
  expect(within(path).queryByText("Checkout gateway")).toBeNull();
});

test("The incident story explains recorded recovery and opens only that run's memory", async () => {
  const data = workspaceFixture(), task = incidentFixture();
  data.selected = task; data.tasks = [task]; data.events = incidentEventsFixture();
  data.memory.payments.historical = ["episodic", "procedural", "semantic"].map(kind => memoryFixture(kind));
  const fetch = vi.fn(async () => response(data)); vi.stubGlobal("fetch", fetch);
  render(<App/>);
  await screen.findByText("FalkorDB connected");
  fireEvent.click(screen.getByRole("button", {name: "Agent tasks"}));
  const story = screen.getByRole("region", {name: "What happened in this run?"});
  expect(within(story).getByText("Recovery and memory recorded")).toBeTruthy();
  expect(within(story).getByText(/Recorded result: payments HTTP 503 → 200; checkout HTTP 200/)).toBeTruthy();
  fireEvent.click(within(story).getByRole("button", {name: "Inspect this incident's memory"}));
  expect((screen.getByRole("textbox", {name: "Filter memory"}) as HTMLInputElement).value).toBe(task.id);
  expect(fetch.mock.calls.every(call => (call as any[])[1]?.method !== "POST")).toBe(true);
});

test("The incident story explains an interrupted ticket without declaring completion", async () => {
  const data = workspaceFixture(), task = incidentFixture(); task.job = "interrupted"; task.ticket_closed = false;
  data.selected = task; data.tasks = [task]; data.events = incidentEventsFixture();
  vi.stubGlobal("fetch", vi.fn(async () => response(data)));
  render(<App/>);
  await screen.findByText("FalkorDB connected");
  fireEvent.click(screen.getByRole("button", {name: "Agent tasks"}));
  const story = screen.getByRole("region", {name: "What happened in this run?"});
  expect(within(story).getByText("Paused at a checkpoint")).toBeTruthy();
  expect(within(story).getByText(/Ticket completion pending/)).toBeTruthy();
  expect(within(story).queryByText("Recovery and memory recorded")).toBeNull();
});

test("Starting a walkthrough prepares a question without submitting an action", async () => {
  const data = workspaceFixture(), fetch = vi.fn(async () => response(data));
  vi.stubGlobal("fetch", fetch);
  render(<App/>);
  const start = await screen.findByRole("button", {name: "Start guided walkthrough"});
  await waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(start);
  expect(screen.getByRole("navigation", {name: "Workflow steps"})).toBeTruthy();
  expect((screen.getByRole("textbox", {name: "Company question"}) as HTMLInputElement).value).toContain("Who owns payments");
  expect((screen.getByRole("button", {name: "Continue: follow the graph"}) as HTMLButtonElement).disabled).toBe(true);
  expect(fetch.mock.calls.every(call => (call as any[])[1]?.method !== "POST")).toBe(true);
  fireEvent.click(screen.getByRole("button", {name: /Find the cause/}));
  expect((screen.getByRole("checkbox", {name: /Pause at handoff/}) as HTMLInputElement).checked).toBe(true);
  expect(screen.queryByRole("button", {name: "Resume in new session"})).toBeNull();
});

test("The guided flow follows its own question, handoff, fresh resolver and memory", async () => {
  const data = workspaceFixture();
  const fetch = vi.fn(async (path: string, options?: RequestInit) => {
    if (options?.method !== "POST") return response(data);
    if (path === "/api/questions") {
      data.tasks.push({...questionFixture}); data.selected = data.tasks[0]; data.events = questionEventsFixture();
      return response({task: questionFixture.id});
    }
    if (path === "/api/incidents") {
      const task = incidentFixture(); task.status = "handoff"; task.ticket_closed = false; delete task.outcome;
      data.tasks.push(task); data.selected = task; data.events = incidentEventsFixture().slice(0, 1);
      return response({task: task.id});
    }
    if (path === "/api/resume") {
      data.tasks[1] = incidentFixture(); data.selected = data.tasks[1]; data.events = incidentEventsFixture();
      data.memory.payments.historical = ["episodic", "procedural", "semantic"].map(kind => memoryFixture(kind));
      return response({task: data.selected.id});
    }
    return response({});
  });
  vi.stubGlobal("fetch", fetch);
  render(<App/>);
  const start = screen.getByRole("button", {name: "Start guided walkthrough"});
  await waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(start);
  fireEvent.click(screen.getByRole("button", {name: "Ask"}));
  const graph = screen.getByRole("button", {name: "Continue: follow the graph"});
  await waitFor(() => expect((graph as HTMLButtonElement).disabled).toBe(false));
  expect(await screen.findByText("Payments belongs to the Synthetic team.")).toBeTruthy();
  fireEvent.click(graph);
  fireEvent.click(screen.getByRole("button", {name: "Continue: find the cause"}));
  expect(screen.queryByRole("button", {name: "Resume in new session"})).toBeNull();
  fireEvent.click(screen.getByRole("button", {name: "Investigate only"}));
  const recover = screen.getByRole("button", {name: "Continue: resume and recover"});
  await waitFor(() => expect((recover as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(recover);
  fireEvent.click(screen.getByRole("button", {name: "Resume in new session"}));
  const memory = screen.getByRole("button", {name: "Continue: inspect shared memory"});
  await waitFor(() => expect((memory as HTMLButtonElement).disabled).toBe(false));
  expect(screen.getByText("investigator-session")).toBeTruthy();
  expect(screen.getByText("resolver-session")).toBeTruthy();
  fireEvent.click(memory);
  expect((screen.getByRole("textbox", {name: "Filter memory"}) as HTMLInputElement).value).toBe("INC-GUIDE");
  const finish = screen.getByRole("button", {name: "Finish walkthrough"});
  expect((finish as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(finish);
  expect(screen.queryByRole("navigation", {name: "Workflow steps"})).toBeNull();
  expect((screen.getByRole("textbox", {name: "Filter memory"}) as HTMLInputElement).value).toBe("");
  const mutations = fetch.mock.calls.filter(([, options]) => options?.method === "POST");
  expect(mutations.map(([path]) => path)).toEqual(["/api/questions", "/api/incidents", "/api/resume"]);
  expect(JSON.parse(mutations[1][1]!.body as string)).toEqual({scenario: "config", mode: "llm", pause_after_handoff: true});
  expect(JSON.parse(mutations[2][1]!.body as string)).toEqual({task: "INC-GUIDE"});
});

test("Company answers do not display a selected incident's resolver summary", async () => {
  const data = workspaceFixture();
  data.selected = incidentFixture(); data.tasks = [data.selected];
  data.events = [eventFixture("session_finished", "resolver", "old-session", {summary: "OLD INCIDENT SUMMARY"})];
  vi.stubGlobal("fetch", vi.fn(async () => response(data)));
  render(<App/>);
  await screen.findByText("FalkorDB connected");
  fireEvent.click(screen.getByRole("button", {name: "Company knowledge"}));
  expect(screen.queryByText("OLD INCIDENT SUMMARY")).toBeNull();
  expect(screen.getByText(/Ask a question to get a saved answer/)).toBeTruthy();
});

test("A cited source opens the captured revision instead of a newer document", async () => {
  const data = workspaceFixture();
  data.selected = {...questionFixture}; data.tasks = [data.selected];
  const document = {id: "policy", source: "owned:document/policy", kind: "reference", title: "Policy", revision: "old-v1", text: "Review window: 48 hours.", data: {}};
  data.company.payments.documents = [{...document, revision: "new-v2", text: "Review window: 96 hours."}];
  data.events = [eventFixture("tool", "company", "question-session", {tool: "company_context", result: {documents: [document]}}),
    eventFixture("session_finished", "company", "question-session", {mode: "llm", summary: "The saved answer used 48 hours.", citations: [document.source]})];
  vi.stubGlobal("fetch", vi.fn(async () => response(data)));
  render(<App/>);
  await screen.findByText("FalkorDB connected");
  fireEvent.click(screen.getByRole("button", {name: "Company knowledge"}));
  const source = screen.getByRole("button", {name: document.source}); source.focus(); fireEvent.click(source);
  const dialog = screen.getByRole("dialog", {name: "Source retrieved for saved answer"});
  expect(within(dialog).getByText(/Review window: 48 hours/)).toBeTruthy();
  expect(within(dialog).queryByText(/Review window: 96 hours/)).toBeNull();
  fireEvent.keyDown(globalThis.document, {key: "Escape"});
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(globalThis.document.activeElement).toBe(source);
});

test("Leaving the guide does not cancel a running server job", async () => {
  const data = workspaceFixture();
  const fetch = vi.fn(async () => response(data));
  vi.stubGlobal("fetch", fetch);
  render(<App/>);
  const start = screen.getByRole("button", {name: "Start guided walkthrough"});
  await waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(start);
  data.busy = true; data.active_task = "INC-ACTIVE";
  fireEvent.click(screen.getByRole("button", {name: "Refresh workspace"}));
  await screen.findByRole("button", {name: "Stop at checkpoint"});
  fireEvent.click(screen.getByRole("button", {name: "Leave walkthrough"}));
  expect(screen.queryByRole("navigation", {name: "Workflow steps"})).toBeNull();
  expect(fetch.mock.calls.every(call => (call as any[])[1]?.method !== "POST")).toBe(true);
  expect(screen.getByRole("button", {name: "Stop at checkpoint"})).toBeTruthy();
});

test("An unfinished checkout fault links to its incident instead of starting another walkthrough", async () => {
  const data = workspaceFixture(), incident = incidentFixture();
  incident.status = "handoff"; incident.ticket_closed = false; delete incident.outcome;
  data.tasks = [incident]; data.selected = incident; data.health[0].http_status = 503;
  vi.stubGlobal("fetch", vi.fn(async () => response(data)));
  render(<App/>);
  const open = await screen.findByRole("button", {name: "Open unfinished incident"});
  expect((screen.getByRole("button", {name: "Start guided walkthrough"}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(open);
  expect(screen.getByRole("button", {name: "Resume in new session"})).toBeTruthy();
  expect(screen.queryByRole("navigation", {name: "Workflow steps"})).toBeNull();
});

test("Closing an inspector prevents a delayed source read from reopening it", async () => {
  const data = workspaceFixture();
  data.selected = {...questionFixture}; data.tasks = [data.selected];
  const doc = {id: "policy", source: "owned:document/policy", kind: "reference", title: "Policy", revision: "old-v1", text: "Excerpt", text_truncated: true, data: {}};
  data.events = [eventFixture("tool", "company", "q", {tool: "company_context", result: {documents: [doc]}}),
    eventFixture("session_finished", "company", "q", {mode: "llm", summary: "Saved answer.", citations: [doc.source]})];
  let finishRead: (value: Response) => void = () => {};
  const fetch = vi.fn((path: string) => path.startsWith("/api/sources") ? new Promise<Response>(resolve => {finishRead = resolve;}) : Promise.resolve(response(data)));
  vi.stubGlobal("fetch", fetch);
  render(<App/>);
  await screen.findByText("FalkorDB connected");
  fireEvent.click(screen.getByRole("button", {name: "Company knowledge"}));
  fireEvent.click(screen.getByRole("button", {name: doc.source}));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(fetch.mock.calls.some(([path]) => path.includes("revision=old-v1"))).toBe(true);
  fireEvent.click(screen.getByRole("button", {name: "Close inspector"}));
  finishRead(response({...doc, text: "Full historical source", text_truncated: false}));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

test("A memory filter with no matches shows an explanation and can be cleared", async () => {
  const data = workspaceFixture();
  data.memory.payments.active = [memoryFixture("semantic")];
  vi.stubGlobal("fetch", vi.fn(async () => response(data)));
  render(<App/>);
  await screen.findByText("FalkorDB connected");
  fireEvent.click(screen.getByRole("button", {name: "Memory navigator"}));
  fireEvent.change(screen.getByRole("textbox", {name: "Filter memory"}), {target: {value: "no-matches"}});
  expect(screen.getByText("No records match the current filters.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: "Clear filters"}));
  expect(screen.queryByText("No records match the current filters.")).toBeNull();
});

test("An interruption after measured recovery still offers resume to finish the ticket", async () => {
  const data = workspaceFixture(), incident = incidentFixture();
  incident.job = "interrupted"; incident.ticket_closed = false;
  data.tasks = [incident]; data.selected = incident;
  const fetch = vi.fn(async (_path: string, options?: RequestInit) => response(options?.method === "POST" ? {task: incident.id} : data));
  vi.stubGlobal("fetch", fetch);
  render(<App/>);
  await screen.findByText("FalkorDB connected");
  fireEvent.click(screen.getByRole("button", {name: "Agent tasks"}));
  expect(screen.queryByRole("button", {name: "Inspect recovery"})).toBeNull();
  const resume = screen.getByRole("button", {name: "Resume in new session"});
  fireEvent.click(resume);
  await waitFor(() => expect(fetch.mock.calls.some(([path, options]) => path === "/api/resume" && JSON.parse(options!.body as string).task === incident.id)).toBe(true));
});

test("A new guide hides a previously selected company answer until its own question runs", async () => {
  const data = workspaceFixture();
  data.selected = {...questionFixture}; data.tasks = [data.selected]; data.events = questionEventsFixture();
  vi.stubGlobal("fetch", vi.fn(async () => response(data)));
  render(<App/>);
  const start = screen.getByRole("button", {name: "Start guided walkthrough"});
  await waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(start);
  expect(screen.queryByText("Payments belongs to the Synthetic team.")).toBeNull();
  expect((screen.getByRole("button", {name: "Continue: follow the graph"}) as HTMLButtonElement).disabled).toBe(true);
});
