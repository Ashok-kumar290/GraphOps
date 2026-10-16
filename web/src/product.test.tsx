import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "./main";
import { SourceManager } from "./features/company/SourceManager";
import { SystemPanel } from "./features/system/SystemPanel";
import { KnowledgeGraph } from "./features/graph/KnowledgeGraph";
import { RunHistory } from "./features/runs/RunHistory";
import type { Workspace } from "./shared/contracts";

const makeWorkspace = (): Workspace => ({
  workspace: "ui-test",
  graph_name: "test",
  graph: {
    nodes: ["gateway", "orders", "payments", "analytics"].map((id, key) => ({
      key,
      id,
      title: id,
      kind: "Service",
      source: "fixture:test",
    })),
    edges: [],
  },
  tasks: [],
  selected: null,
  events: [],
  health: ["gateway", "orders", "payments", "analytics"].map((service) => ({
    service,
    healthy: true,
    http_status: 200,
    revision: "healthy-v1",
    source: "http://127.0.0.1:8865/health",
  })),
  memory: Object.fromEntries(
    ["gateway", "orders", "payments", "analytics"].map((service) => [
      service,
      {
        active: [],
        historical: [],
        unverified: [],
        conflicts: [],
        cache_hit: false,
        revision: "healthy-v1",
      },
    ]),
  ),
  company: Object.fromEntries(
    ["gateway", "orders", "payments", "analytics"].map((service) => [
      service,
      {
        service,
        owners: [{ name: "Synthetic Team", source: "fixture:test" }],
        experts: [],
        documents: [],
        historical_documents: [],
      },
    ]),
  ),
  model: { provider: "ollama", model: "qwen3:8b", configured: true },
  busy: false,
  stopping: false,
  scenarios: [
    { id: "config", label: "Payments configuration" },
    { id: "worker", label: "Orders worker" },
  ],
  observed_at: new Date().toISOString(),
});
const ready = {
  checked_at: new Date().toISOString(),
  components: {
    graph: { status: "online", message: "Graph available" },
    lab: { status: "online", message: "Lab available" },
    model: { status: "available", message: "Run inference checks" },
    mcp: { status: "unchecked", message: "Run MCP checks" },
  },
};
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "EventSource",
    class {
      onmessage: any;
      close() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
test("History selection retains older question metadata outside the current snapshot", async () => {
  const task = { id: "INC-OLDER", title: "Who owns orders?", service: "gateway", target: "orders", status: "answered", mode: "llm", job: "idle", question: true, created_at: new Date().toISOString() };
  const choose = vi.fn();
  render(<RunHistory api={vi.fn(async () => ({ tasks: [task], audits: [], next_cursor: null }))} inspect={vi.fn()} onChoose={choose} />);
  fireEvent.click(await screen.findByText("INC-OLDER"));
  expect(choose).toHaveBeenCalledWith(task.id, task);
});
function network(workspace = makeWorkspace()) {
  const fetch = vi.fn(
    async (path: any, options?: any) =>
      new Response(
        JSON.stringify(
          String(path).startsWith("/api/workspace")
            ? workspace
            : String(path).startsWith("/api/readiness")
              ? ready
              : String(path).startsWith("/api/history")
                ? { tasks: [], audits: [] }
                : options
                  ? { task: "INC-TEST", accepted: true }
                  : {},
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

test("The starting screen explains the product and its six modules", async () => {
  network();
  render(<App />);
  expect(screen.getByRole("heading", {name: "Fix a checkout failure. Keep the evidence for the next session."})).toBeTruthy();
  const modules = screen.getByText("Explore the six modules behind the demonstration");
  expect((modules.parentElement as HTMLDetailsElement).open).toBe(false);
  fireEvent.click(modules);
  expect((modules.parentElement as HTMLDetailsElement).open).toBe(true);
  for (const name of ["1. Company knowledge", "2. Connected graph", "3. Agent", "4. Actions", "5. Shared memory", "6. Workspace"])
    expect(screen.getByRole("heading", {name})).toBeTruthy();
  expect(await screen.findByText("FalkorDB connected")).toBeTruthy();
});

test("The graph module is available directly from navigation", async () => {
  network();
  render(<App />);
  fireEvent.click(screen.getByRole("button", {name: "Connected graph"}));
  expect(await screen.findByRole("heading", {name: "Relationships guide the agent"})).toBeTruthy();
  expect(await screen.findByRole("img", {name: "Actual service dependency graph"})).toBeTruthy();
});

test("Run agent sends an automatic LLM workflow by default", async () => {
  const fetch = network();
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Agent tasks" }));
  const run = await screen.findByRole("button", { name: "Run agent" });
  await waitFor(() => expect((run as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(run);
  await waitFor(() =>
    expect(fetch.mock.calls.some(([path]) => path === "/api/incidents")).toBe(
      true,
    ),
  );
  const options = fetch.mock.calls.find(
    ([path]) => path === "/api/incidents",
  )![1];
  expect(JSON.parse(options.body)).toEqual({
    scenario: "config",
    mode: "llm",
    pause_after_handoff: false,
  });
});

test("Pause at handoff explicitly selects investigation only", async () => {
  const fetch = network();
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Agent tasks" }));
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Run agent" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("checkbox", { name: /Pause at handoff/ }));
  fireEvent.click(screen.getByRole("button", { name: "Investigate only" }));
  await waitFor(() =>
    expect(fetch.mock.calls.some(([path]) => path === "/api/incidents")).toBe(
      true,
    ),
  );
  expect(
    JSON.parse(
      fetch.mock.calls.find(([path]) => path === "/api/incidents")![1].body,
    ).pause_after_handoff,
  ).toBe(true);
});

test("Stop control targets the active job even while another incident is selected", async () => {
  const w = makeWorkspace();
  w.busy = true;
  w.active_task = "INC-ACTIVE";
  const fetch = network(w);
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Agent tasks" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Stop at checkpoint" }),
  );
  await waitFor(() =>
    expect(fetch.mock.calls.some(([path]) => path === "/api/cancel")).toBe(
      true,
    ),
  );
  expect(
    JSON.parse(
      fetch.mock.calls.find(([path]) => path === "/api/cancel")![1].body,
    ),
  ).toEqual({ task: "INC-ACTIVE" });
});

test("Company question carries the selected service", async () => {
  const fetch = network();
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Agent tasks" }));
  await screen.findByText("FalkorDB connected");
  fireEvent.click(screen.getByRole("button", { name: "Company knowledge" }));
  fireEvent.click(screen.getByRole("button", { name: "orders" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Company question" }), {
    target: { value: "Who owns this service?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  await waitFor(() =>
    expect(fetch.mock.calls.some(([path]) => path === "/api/questions")).toBe(
      true,
    ),
  );
  expect(
    JSON.parse(
      fetch.mock.calls.find(([path]) => path === "/api/questions")![1].body,
    ).service,
  ).toBe("orders");
});

test("A restored connection clears its stale error", async () => {
  let calls = 0;
  const w = makeWorkspace();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify(++calls === 1 ? { error: "Worker reconnecting" } : w),
          { status: calls === 1 ? 503 : 200 },
        ),
    ),
  );
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Agent tasks" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("Worker reconnecting"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Refresh workspace" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(await screen.findByText("FalkorDB connected")).toBeTruthy();
});

test("The source editor imports a synthetic policy and refreshes its parent", async () => {
  const api = vi.fn(async (_path:string,_body?:unknown) => ({ document: { revision: "v2" } })),
    changed = vi.fn(async () => {});
  render(
    <SourceManager
      api={api}
      busy={false}
      inspect={vi.fn()}
      service="payments"
      documents={[]}
      onChanged={changed}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Load synthetic sample" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Import source" }));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  expect(api.mock.calls[0][0]).toBe("/api/sources");
  expect((api.mock.calls[0] as any)[1]).toMatchObject({
    service: "payments",
    document_type: "policy",
  });
  await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
});

test("System status distinguishes availability from a verified MCP roundtrip", async () => {
  const api = vi.fn(async () => ready),
    diagnose = vi.fn();
  render(
    <SystemPanel
      api={api}
      busy={false}
      inspect={vi.fn()}
      data={makeWorkspace()}
      onDiagnose={diagnose}
      onBackup={vi.fn()}
    />,
  );
  expect(await screen.findByText("unchecked")).toBeTruthy();
  expect(screen.getByText("available")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Run system checks" }));
  expect(diagnose).toHaveBeenCalledOnce();
});

test("Knowledge graph renders only connected source nodes and actual relationships", () => {
  const w = makeWorkspace();
  w.graph.nodes.push(
    {
      key: 7,
      id: "policy",
      title: "Refund policy",
      kind: "Document",
      source: "owned:document/policy",
    },
    {
      key: 8,
      id: "unrelated",
      title: "Unrelated source",
      kind: "Document",
      source: "owned:document/other",
    },
  );
  w.graph.edges.push({
    from: 2,
    to: 7,
    kind: "HAS_DOCUMENT",
    source: "owned:document/policy",
  });
  render(<KnowledgeGraph data={w} service="payments" inspect={vi.fn()} />);
  expect(screen.getByText("Refund policy")).toBeTruthy();
  expect(screen.getByText("HAS DOCUMENT")).toBeTruthy();
  expect(screen.queryByText("Unrelated source")).toBeNull();
});
