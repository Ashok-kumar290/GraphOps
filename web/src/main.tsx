import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Box,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  Database,
  FileText,
  GitBranch,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Network,
  Play,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  SquareTerminal,
  Users,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import type { Workspace, Event as RunEvent, Memory, Doc } from "./types";
import "./style.css";

type View = "workspace" | "memory" | "company" | "history";
type Evidence = { title: string; value: unknown };
const time = (s: string) =>
  new Date(s).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
const nice = (s: string) => s.replaceAll("_", " ");
const short = (s: string) =>
  s.length > 25 ? s.slice(0, 12) + "…" + s.slice(-8) : s;
async function api(path: string, body?: unknown) {
  const response = await fetch(
    path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-GraphOps": "1" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.error || "Request failed"), {
      status: response.status,
    });
  return data;
}

function App() {
  const [data, setData] = useState<Workspace | null>(null),
    [view, setView] = useState<View>("workspace");
  const [taskId, setTaskId] = useState(
      localStorage.getItem("graphops-task") || "",
    ),
    [service, setService] = useState("payments");
  const [scenario, setScenario] = useState("config"),
    [mode, setMode] = useState("llm"),
    [pauseAfterHandoff, setPauseAfterHandoff] = useState(false),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const [inspector, setInspector] = useState<Evidence | null>(null),
    [question, setQuestion] = useState(""),
    [owner, setOwner] = useState("");
  const [locked, setLocked] = useState(false),
    [token, setToken] = useState(""),
    [stage, setStage] = useState("Connecting to workspace");
  const ref = useRef(taskId),
    mounted = useRef(true),
    refreshing = useRef(false),
    debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const next = await api(
        "/api/workspace" +
          (ref.current ? "?task=" + encodeURIComponent(ref.current) : ""),
      );
      if (mounted.current) {
        setData(next);
        setLocked(false);
      }
    } catch (e: any) {
      if (mounted.current) {
        if (e.status === 401) setLocked(true);
        else setError(e.message);
      }
    } finally {
      refreshing.current = false;
    }
  }, []);
  useEffect(() => {
    ref.current = taskId;
    if (taskId) localStorage.setItem("graphops-task", taskId);
    void refresh();
  }, [taskId, refresh]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const interval = setInterval(() => void refresh(), 3000);
    const events = new EventSource("/api/events");
    events.onmessage = (message) => {
      const item = JSON.parse(message.data);
      if (item.stage === "model")
        setStage(`${item.role} is selecting its next step`);
      else if (item.stage === "handoff_saved")
        setStage("Resolver is loading the saved handoff");
      else if (item.tool) setStage(nice(item.tool));
      else if (item.stage === "finished") setStage("Checkpoint saved");
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => void refresh(), 180);
    };
    return () => {
      mounted.current = false;
      clearInterval(interval);
      if (debounce.current) clearTimeout(debounce.current);
      events.close();
    };
  }, [refresh, locked]);
  const command = async (path: string, body: unknown) => {
    setPending(true);
    setError("");
    try {
      const result = await api(path, body);
      if (result.task) setTaskId(result.task);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPending(false);
    }
  };
  const busy = pending || !!data?.busy,
    selected = data?.selected;
  const selectedHealth = data?.health.find((h) => h.service === service),
    company = data?.company[service],
    packet = data?.memory[service];
  const allMemory = data
    ? Object.values(data.memory).flatMap((p) => [
        ...p.active,
        ...p.historical,
        ...p.unverified,
      ])
    : [];
  const inspect = (title: string, value: unknown) =>
    setInspector({ title, value });
  useEffect(() => {
    if (!inspector) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>(".inspector");
    dialog?.querySelector<HTMLElement>("button")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setInspector(null);
      if (event.key === "Tab" && dialog) {
        const elements = Array.from(
          dialog.querySelectorAll<HTMLElement>('button,[tabindex="0"]'),
        );
        const first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      previous?.focus();
    };
  }, [inspector]);
  const choose = (id: string) => {
    setTaskId(id);
    setView("workspace");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="GraphOps home">
          <span className="brand-mark">
            <Network size={24} />
          </span>
          graphops<span className="brand-dot">.</span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-avatar">G</span>
          <div>
            <strong>Graph Hacks</strong>
            <small>Team workspace</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">OPERATIONS</div>
        <nav>
          {(
            [
              { id: "workspace", label: "Incident workspace", icon: Workflow },
              { id: "memory", label: "Memory navigator", icon: Layers3 },
              { id: "company", label: "Company knowledge", icon: Users },
              { id: "history", label: "Run history", icon: Clock3 },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={"nav-item " + (view === item.id ? "active" : "")}
              onClick={() => setView(item.id)}
            >
              <item.icon size={17} />
              {item.label}
              {item.id === "memory" && (
                <span className="nav-count">{allMemory.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="side-rule" />
        <div className="nav-label">RECENT INCIDENTS</div>
        <div className="recent-list">
          {data?.tasks
            .filter((t) => !t.question)
            .slice(0, 5)
            .map((t) => (
              <button
                key={t.id}
                className={
                  "recent-item " + (selected?.id === t.id ? "selected" : "")
                }
                onClick={() => choose(t.id)}
              >
                <span className={"status-dot " + t.status} />
                <div>
                  <strong>{t.id}</strong>
                  <small>{nice(t.status)}</small>
                </div>
                <ArrowUpRight size={13} />
              </button>
            ))}
          {!data?.tasks.filter((t) => !t.question).length && (
            <p className="quiet-note">Your investigations will appear here.</p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="live-connection">
            <span className={"status-dot " + (data ? "resolved" : "blocked")} />
            {data ? "FalkorDB connected" : "Connecting to FalkorDB"}
          </div>
          <div className="local-note">
            <Box size={13} />
            Controlled lab environment
          </div>
          <span className="sidebar-version">EVENT BUILD / OCT 2026</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>
            <strong>
              {view === "workspace" ? "Checkout operations" : nice(view)}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="provider-tag">
              <Zap size={12} />
              {data ? data.model.provider : "Model"}
              <span className="tag-separator" />
              {data?.model.model || "Checking configuration"}
            </span>
            <span className="team-avatar">G</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> EVIDENCE BEFORE ACTION
              </div>
              <h1>
                {view === "workspace"
                  ? "Incident workspace"
                  : view === "memory"
                    ? "Memory navigator"
                    : view === "company"
                      ? "Company knowledge"
                      : "Run history"}
              </h1>
              <p>
                {view === "workspace"
                  ? "Follow the failure. Carry the context. Verify the recovery."
                  : view === "memory"
                    ? "Shared knowledge, with a source and a reason to trust it."
                    : view === "company"
                      ? "The owners, procedures, and decisions behind the work."
                      : "Persisted investigations and the sessions that moved them forward."}
              </p>
            </div>
            <button
              className="button secondary icon-button"
              onClick={() => void refresh()}
              aria-label="Refresh workspace"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          {error && (
            <div className="alert" role="alert">
              <Activity size={16} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={15} />
              </button>
            </div>
          )}
          {selected?.last_error && (
            <div className="alert" role="alert">
              <Activity size={16} />
              <span>{selected.last_error}</span>
            </div>
          )}
          {selected?.blocker && !selected.last_error && (
            <div className="alert" role="status">
              <ShieldCheck size={16} />
              <span>{selected.blocker}</span>
            </div>
          )}
          {locked && (
            <form
              className="access-form panel"
              onSubmit={(e) => {
                e.preventDefault();
                void command("/api/access", { token });
              }}
            >
              <LockKeyhole size={20} />
              <div>
                <h3>Demo access</h3>
                <p>Enter the access token supplied with this deployment.</p>
              </div>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Access token"
              />
              <button className="button primary">Unlock workspace</button>
            </form>
          )}
          {mode === "scripted" && (
            <div className="baseline-notice">
              <SquareTerminal size={14} />
              Scripted baseline selected. Tools and measurements are real;
              decisions are deterministic.
            </div>
          )}
          <div className="workspace-layout">
            <section className="workspace-main">
              {view === "workspace" && (
                <>
                  <section className="run-control panel">
                    <div className="run-control-copy">
                      <span className="small-icon">
                        <Play size={16} />
                      </span>
                      <div>
                        <strong>Run a controlled incident</strong>
                        <small>Real services. Synthetic company context.</small>
                      </div>
                    </div>
                    <div className="run-inputs">
                      <label className="sr-only" htmlFor="scenario">
                        Scenario
                      </label>
                      <select
                        id="scenario"
                        value={scenario}
                        onChange={(e) => setScenario(e.target.value)}
                        disabled={busy}
                      >
                        {(
                          data?.scenarios || [
                            { id: "config", label: "Payments configuration" },
                            { id: "worker", label: "Orders worker" },
                          ]
                        ).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <label className="sr-only" htmlFor="mode">
                        Execution mode
                      </label>
                      <select
                        id="mode"
                        value={mode}
                        onChange={(e) => setMode(e.target.value)}
                        disabled={busy}
                      >
                        <option value="llm">Agent · LLM</option>
                        <option value="scripted">Scripted baseline</option>
                      </select>
                      <button
                        className="button primary"
                        disabled={busy || !data || locked}
                        onClick={() =>
                          void command("/api/incidents", {
                            scenario,
                            mode,
                            pause_after_handoff: pauseAfterHandoff,
                          })
                        }
                      >
                        {busy ? (
                          <LoaderCircle className="spin" size={15} />
                        ) : (
                          <Play size={14} />
                        )}
                        {pauseAfterHandoff ? "Investigate only" : "Run agent"}
                      </button>
                    </div>
                    <label
                      className="run-option"
                      title="Save the investigation, then resume recovery manually in another session."
                    >
                      <input
                        type="checkbox"
                        checked={pauseAfterHandoff}
                        onChange={(e) => setPauseAfterHandoff(e.target.checked)}
                        disabled={busy}
                      />
                      Pause at handoff
                      <span>
                        {pauseAfterHandoff
                          ? "You will resume recovery manually."
                          : "Investigation and recovery run automatically in separate sessions."}
                      </span>
                    </label>
                  </section>
                  <div className="metrics">
                    <Metric
                      label="CHECKOUT HEALTH"
                      value={
                        data?.health.find((h) => h.service === "gateway")
                          ?.http_status === 200
                          ? "Operational"
                          : data
                            ? "Degraded"
                            : "Connecting"
                      }
                      icon={<Activity size={15} />}
                      accent={
                        data?.health.find((h) => h.service === "gateway")
                          ?.http_status === 200
                      }
                    />
                    <Metric
                      label="CONNECTED SERVICES"
                      value={String(
                        data?.graph.nodes.filter((n) => n.kind === "Service")
                          .length ?? "—",
                      )}
                      icon={<Network size={15} />}
                    />
                    <Metric
                      label="SHARED MEMORY"
                      value={String(allMemory.length)}
                      icon={<Layers3 size={15} />}
                    />
                    <Metric
                      label="INCIDENT STATUS"
                      value={
                        selected ? nice(selected.status) : "Ready to begin"
                      }
                      icon={<GitBranch size={15} />}
                    />
                  </div>
                  <section className="panel graph-panel">
                    <div className="panel-header">
                      <div>
                        <Network size={16} />
                        <h2>Service dependency graph</h2>
                      </div>
                      <span className="pill subdued">LIVE GRAPH</span>
                    </div>
                    <div className="graph-toolbar">
                      <span>
                        <span className="legend-dot mint" />
                        Healthy
                      </span>
                      <span>
                        <span className="legend-dot coral" />
                        Degraded
                      </span>
                      <span>
                        <span className="legend-line" />
                        Depends on
                      </span>
                      <button
                        onClick={() =>
                          inspect("Actual FalkorDB graph records", data?.graph)
                        }
                      >
                        <Braces size={13} />
                        Inspect records
                      </button>
                    </div>
                    <ServiceGraph
                      data={data}
                      active={service}
                      onSelect={setService}
                    />
                    <div className="graph-foot">
                      <span>
                        <Database size={12} />
                        FalkorDB · sourced relationships
                      </span>
                      <span>
                        Click a service to inspect its context{" "}
                        <ArrowUpRight size={12} />
                      </span>
                    </div>
                  </section>
                  {selected && (
                    <section
                      className={
                        "handoff-bar " +
                        (selected.status === "resolved" ? "complete" : "")
                      }
                    >
                      <span className="small-icon">
                        {selected.status === "resolved" ? (
                          <CheckCircle2 size={19} />
                        ) : (
                          <GitBranch size={19} />
                        )}
                      </span>
                      <div>
                        <strong>
                          {selected.status === "resolved"
                            ? "Recovery verified"
                            : selected.status === "handoff"
                              ? busy
                                ? "Investigation saved. Resolver is continuing."
                                : "Investigation saved. Resume to recover checkout."
                              : selected.job === "interrupted"
                                ? "Run interrupted. Your checkpoint is saved."
                                : selected.status === "blocked"
                                  ? "Evidence needs attention"
                                  : "Investigation in progress"}
                        </strong>
                        <small>
                          {selected.target
                            ? `Target: ${selected.target} · `
                            : ""}
                          {selected.id} ·{" "}
                          {selected.mode === "llm"
                            ? "LLM agent"
                            : "Scripted baseline"}
                          {selected.ticket_closed ? " · ticket closed" : ""}
                        </small>
                      </div>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          selected.status === "resolved"
                            ? inspect(
                                "Measured recovery result",
                                selected.outcome,
                              )
                            : void command("/api/resume", { task: selected.id })
                        }
                      >
                        {busy ? (
                          <LoaderCircle className="spin" size={15} />
                        ) : (
                          <ArrowRight size={15} />
                        )}{" "}
                        {selected.status === "resolved"
                          ? "Inspect recovery"
                          : "Resume in new session"}
                      </button>
                    </section>
                  )}
                  <section className="panel timeline-panel">
                    <div className="panel-header">
                      <div>
                        <Activity size={16} />
                        <h2>Agent activity</h2>
                        <span className="count-tag">
                          {data?.events.length || 0}
                        </span>
                      </div>
                      <span className={"live-label " + (busy ? "working" : "")}>
                        {busy ? (
                          <LoaderCircle size={12} className="spin" />
                        ) : (
                          <span className="status-dot resolved" />
                        )}
                        {busy ? stage : "Checkpoint synced"}
                      </span>
                    </div>
                    <Timeline events={data?.events || []} inspect={inspect} />
                  </section>
                </>
              )}
              {view === "memory" && (
                <>
                  <div className="section-intro panel">
                    <Layers3 size={24} />
                    <div>
                      <h2>A new session starts with evidence.</h2>
                      <p>
                        Episodes record what happened. Procedures carry
                        preconditions. Facts expire. Unverified claims keep
                        their label.
                      </p>
                    </div>
                  </div>
                  <div className="service-tabs">
                    {data?.health.map((h) => (
                      <button
                        key={h.service}
                        className={service === h.service ? "active" : ""}
                        onClick={() => setService(h.service)}
                      >
                        {h.service}
                        <span>
                          {
                            Object.values(data.memory[h.service] || {})
                              .filter(Array.isArray)
                              .flat().length
                          }
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="memory-grid">
                    {(["active", "historical", "unverified"] as const).map(
                      (group) => (
                        <section className="panel memory-group" key={group}>
                          <div className="panel-header">
                            <div>
                              <span
                                className={
                                  "legend-dot " +
                                  (group === "active"
                                    ? "mint"
                                    : group === "unverified"
                                      ? "coral"
                                      : "violet")
                                }
                              />
                              <h2>{nice(group)}</h2>
                            </div>
                            <span className="count-tag">
                              {packet?.[group].length || 0}
                            </span>
                          </div>
                          {packet?.[group].map((m) => (
                            <MemoryCard
                              key={m.id}
                              memory={m}
                              inspect={inspect}
                            />
                          ))}
                          {!packet?.[group].length && (
                            <p className="quiet-note">
                              No {group} records for this service.
                            </p>
                          )}
                        </section>
                      ),
                    )}
                  </div>
                  <p className="footnote">
                    {packet?.cache_hit
                      ? "Packet reused from a valid revision-aware cache."
                      : "Packet retrieved from graph records."}{" "}
                    Current configuration: {packet?.revision || "unavailable"}.
                    Cache reuse does not establish truth.
                  </p>
                </>
              )}
              {view === "company" && (
                <>
                  <div className="service-tabs">
                    {data?.health.map((h) => (
                      <button
                        key={h.service}
                        className={service === h.service ? "active" : ""}
                        onClick={() => setService(h.service)}
                      >
                        {h.service}
                      </button>
                    ))}
                  </div>
                  <div className="company-overview panel">
                    <div>
                      <div className="eyebrow">CURRENT OWNER</div>
                      <h2>
                        {company?.owners.map((o) => o.name).join(", ") ||
                          "No owner recorded"}
                      </h2>
                      <p>
                        {company?.experts.map((e) => e.name).join(" · ") ||
                          "No expertise links recorded"}
                      </p>
                    </div>
                    <Users size={30} />
                  </div>
                  <section className="panel">
                    <div className="panel-header">
                      <div>
                        <FileText size={16} />
                        <h2>Source documents</h2>
                      </div>
                      <span className="count-tag">
                        {company?.documents.length || 0}
                      </span>
                    </div>
                    <div className="document-grid">
                      {company?.documents.map((doc) => (
                        <DocumentCard
                          key={doc.id}
                          doc={doc}
                          inspect={inspect}
                        />
                      ))}
                    </div>
                    {!company?.documents.length && (
                      <p className="quiet-note">
                        No documents attached to this service.
                      </p>
                    )}
                  </section>
                  {!!company?.historical_documents?.length && (
                    <section className="panel">
                      <div className="panel-header">
                        <div>
                          <Clock3 size={16} />
                          <h2>Previous source revisions</h2>
                        </div>
                        <span className="pill subdued">HISTORICAL</span>
                      </div>
                      <div className="document-grid">
                        {company.historical_documents.map((doc) => (
                          <DocumentCard
                            key={doc.id + ":" + doc.revision}
                            doc={doc}
                            inspect={inspect}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                  {["payments", "orders"].includes(service) && (
                    <section className="panel company-edit">
                      <h3>Demonstrate changing knowledge</h3>
                      <p>
                        These controls update our synthetic company graph. The
                        next agent run reads the new source revision.
                      </p>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void command("/api/company", {
                            service,
                            operation: "owner",
                            owner,
                          });
                        }}
                      >
                        <input
                          aria-label="New service owner"
                          value={owner}
                          onChange={(e) => setOwner(e.target.value)}
                          placeholder="New owner team"
                          maxLength={80}
                        />
                        <button
                          className="button secondary"
                          disabled={busy || !owner.trim()}
                        >
                          Update owner
                        </button>
                      </form>
                      <div className="row">
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={() =>
                            void command("/api/company", {
                              service,
                              operation: "retire_runbook",
                            })
                          }
                        >
                          Retire current procedure
                        </button>
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={() =>
                            void command("/api/company", {
                              service,
                              operation: "restore_runbook",
                            })
                          }
                        >
                          Publish supported procedure
                        </button>
                      </div>
                    </section>
                  )}
                  <section className="panel question-box">
                    <h3>Ask the company agent</h3>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void command("/api/questions", { question, mode });
                      }}
                    >
                      <input
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        aria-label="Company question"
                        placeholder="Who owns payments, and which decision supports recovery?"
                        maxLength={1000}
                      />
                      <button
                        className="button primary"
                        disabled={busy || !question.trim()}
                      >
                        <Send size={15} />
                        Ask
                      </button>
                    </form>
                    <Timeline
                      events={(data?.events || []).filter(
                        (e) => e.kind === "session_finished",
                      )}
                      inspect={inspect}
                    />
                  </section>
                </>
              )}
              {view === "history" && (
                <section className="panel history-panel">
                  <div className="panel-header">
                    <div>
                      <Clock3 size={16} />
                      <h2>Persisted runs</h2>
                    </div>
                    <span className="count-tag">{data?.tasks.length || 0}</span>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>INCIDENT</th>
                        <th>MODE</th>
                        <th>TARGET</th>
                        <th>STATUS</th>
                        <th>STARTED</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data?.tasks.map((t) => (
                        <tr
                          key={t.id}
                          onClick={() => choose(t.id)}
                          tabIndex={0}
                          onKeyDown={(e) => e.key === "Enter" && choose(t.id)}
                        >
                          <td>
                            <strong>{t.id}</strong>
                            <small>{t.title}</small>
                          </td>
                          <td>{t.mode === "llm" ? "LLM agent" : "Scripted"}</td>
                          <td>{t.target || "—"}</td>
                          <td>
                            <span className={"state-badge " + t.status}>
                              {nice(t.status)}
                            </span>
                          </td>
                          <td>{time(t.created_at)}</td>
                          <td>
                            <ArrowUpRight size={15} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!data?.tasks.length && (
                    <Empty
                      title="No saved incidents yet"
                      text="Run your first investigation to start the history."
                    />
                  )}
                </section>
              )}
            </section>
            <aside className="context-column">
              <section className="panel context-panel">
                <div className="panel-header">
                  <div>
                    <Box size={15} />
                    <h2>Service context</h2>
                  </div>
                  <span className="mono subtle">{service}</span>
                </div>
                <div className="service-detail">
                  <span
                    className={
                      "service-state " +
                      (selectedHealth?.healthy ? "good" : "bad")
                    }
                  >
                    <Activity size={18} />
                  </span>
                  <div>
                    <h3>{service}</h3>
                    <span
                      className={
                        selectedHealth?.healthy ? "text-mint" : "text-coral"
                      }
                    >
                      {selectedHealth
                        ? `HTTP ${selectedHealth.http_status} · ${selectedHealth.healthy ? "healthy" : "degraded"}`
                        : "Awaiting measurement"}
                    </span>
                  </div>
                </div>
                <div className="detail-row">
                  <span>Owner</span>
                  <strong>
                    {company?.owners.map((o) => o.name).join(", ") ||
                      "Not recorded"}
                  </strong>
                </div>
                <div className="detail-row">
                  <span>Configuration</span>
                  <strong className="mono">
                    {selectedHealth?.revision || "—"}
                  </strong>
                </div>
                <div className="detail-row">
                  <span>Environment</span>
                  <strong>Controlled Go lab</strong>
                </div>
                <div className="source-list-title">
                  KNOWLEDGE SOURCES{" "}
                  <span>{company?.documents.length || 0}</span>
                </div>
                {company?.documents.map((doc) => (
                  <button
                    className="source-link"
                    key={doc.id}
                    onClick={() => inspect(doc.title, doc)}
                  >
                    <FileText size={14} />
                    <div>
                      <strong>{doc.title}</strong>
                      <small>
                        {doc.kind} · rev {doc.revision}
                      </small>
                    </div>
                    <ArrowUpRight size={13} />
                  </button>
                ))}
                {!company?.documents.length && (
                  <p className="quiet-note">No documents attached.</p>
                )}
              </section>
              <section className="panel memory-preview">
                <div className="panel-header">
                  <div>
                    <Layers3 size={15} />
                    <h2>Memory packet</h2>
                  </div>
                  <button
                    className="plain-icon"
                    aria-label="Open memory navigator"
                    onClick={() => setView("memory")}
                  >
                    <ArrowUpRight size={15} />
                  </button>
                </div>
                <div className="memory-counts">
                  <div>
                    <strong>{packet?.active.length || 0}</strong>
                    <span>
                      <i className="legend-dot mint" />
                      Active
                    </span>
                  </div>
                  <div>
                    <strong>{packet?.historical.length || 0}</strong>
                    <span>
                      <i className="legend-dot violet" />
                      Historical
                    </span>
                  </div>
                  <div>
                    <strong>{packet?.unverified.length || 0}</strong>
                    <span>
                      <i className="legend-dot coral" />
                      Unverified
                    </span>
                  </div>
                </div>
                {[...(packet?.active || []), ...(packet?.historical || [])]
                  .slice(0, 2)
                  .map((m) => (
                    <MemoryCard key={m.id} memory={m} inspect={inspect} />
                  ))}
                {!packet?.active.length && !packet?.historical.length && (
                  <p className="quiet-note">
                    Verified outcomes will appear here after recovery.
                  </p>
                )}
                <div className="packet-note">
                  <ShieldCheck size={13} />
                  Source & revision checked on retrieval
                </div>
              </section>
              {selected?.outcome && (
                <section className="panel outcome-card">
                  <div className="outcome-title">
                    {selected.outcome.success ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <Activity size={18} />
                    )}
                    <h3>
                      {selected.outcome.success
                        ? "Recovery verified"
                        : "Recovery not verified"}
                    </h3>
                  </div>
                  <div className="health-change">
                    <span>{selected.outcome.before.http_status}</span>
                    <ArrowRight size={20} />
                    <strong>{selected.outcome.after.http_status}</strong>
                  </div>
                  <p>
                    {nice(selected.outcome.action)} · {selected.outcome.target}
                  </p>
                  <button
                    className="text-button"
                    onClick={() =>
                      inspect("Measured recovery result", selected.outcome)
                    }
                  >
                    Inspect operation result <ArrowUpRight size={13} />
                  </button>
                </section>
              )}
              <div className="context-disclosure">
                <ShieldCheck size={16} />
                <p>
                  Actions are limited to the owned lab. Company records are
                  synthetic. Results show measured effects.
                </p>
              </div>
            </aside>
          </div>
          <footer>
            <span>
              <Network size={12} />
              Context that survives the handoff.
            </span>
            <span>
              FalkorDB + MCP <span className="footer-dot">·</span>{" "}
              {data ? time(data.observed_at) : "Connecting"}
            </span>
          </footer>
        </main>
      </div>
      {inspector && (
        <div className="drawer-shade" onClick={() => setInspector(null)}>
          <aside
            className="inspector"
            role="dialog"
            aria-modal="true"
            aria-label={inspector.title}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-header">
              <div>
                <Braces size={17} />
                <h2>{inspector.title}</h2>
              </div>
              <button
                className="plain-icon"
                aria-label="Close inspector"
                onClick={() => setInspector(null)}
              >
                <X size={19} />
              </button>
            </div>
            <p className="quiet-note">
              Actual source or event record returned by the workspace.
            </p>
            <pre>{JSON.stringify(inspector.value, null, 2)}</pre>
          </aside>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="metric panel">
      <div>
        {label}
        {icon}
      </div>
      <strong className={accent ? "text-mint" : ""}>{value}</strong>
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <span>
        <Network size={26} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function Timeline({
  events,
  inspect,
}: {
  events: RunEvent[];
  inspect: (title: string, value: unknown) => void;
}) {
  const items = events.filter((e) =>
    [
      "session_started",
      "session_finished",
      "tool",
      "tool_error",
      "run_error",
    ].includes(e.kind),
  );
  if (!items.length)
    return (
      <Empty
        title="Your agent's work, step by step"
        text="Start an incident to see graph queries, observations, handoffs, and action results here."
      />
    );
  return (
    <div className="timeline">
      {items.map((e) => {
        const tool = e.data.tool || "",
          result = e.data.result || {},
          isSession = e.kind === "session_started",
          isSummary = e.kind === "session_finished";
        const title = isSession
          ? `${e.role} session started`
          : isSummary
            ? `${e.role} checkpoint saved`
            : e.kind === "run_error"
              ? "Run interrupted"
              : nice(tool || e.kind);
        let description = isSession
          ? `${e.data.mode === "llm" ? "LLM agent" : "Scripted baseline"} · ${short(e.session)}`
          : isSummary
            ? e.data.summary
            : result.reason ||
              result.service ||
              (result.success === true
                ? "Recovery verified with live measurements"
                : result.ready === true
                  ? "Current evidence validated"
                  : result.state === "closed"
                    ? "Synthetic ticket completed"
                    : "Sourced evidence recorded");
        return (
          <button
            className={"timeline-event " + (isSession ? "session-event" : "")}
            key={e.id}
            onClick={() => inspect(title, e)}
          >
            <span
              className={
                "timeline-symbol " +
                (result.success || result.state === "closed" ? "success" : "")
              }
            >
              {isSession ? (
                <GitBranch size={14} />
              ) : isSummary ? (
                <Check size={14} />
              ) : e.role === "resolver" ? (
                <Zap size={13} />
              ) : (
                <Search size={13} />
              )}
            </span>
            <div className="timeline-body">
              <div>
                <strong>{title}</strong>
                <span className={"role-label " + e.role}>{e.role}</span>
              </div>
              <p>{description}</p>
            </div>
            <time>{time(e.time)}</time>
            <ArrowUpRight size={13} className="event-arrow" />
          </button>
        );
      })}
    </div>
  );
}
function MemoryCard({
  memory: m,
  inspect,
}: {
  memory: Memory;
  inspect: (title: string, value: unknown) => void;
}) {
  return (
    <button
      className="memory-card"
      onClick={() => inspect(`${m.kind} memory · ${m.task}`, m)}
    >
      <div>
        <span className={"memory-type " + m.kind}>{m.kind}</span>
        <ArrowUpRight size={12} />
      </div>
      <strong>
        {m.data.action
          ? nice(String(m.data.action))
          : m.data.claim
            ? `${m.data.claim}: ${m.data.value}`
            : "Incident evidence"}
      </strong>
      <p>{nice(m.validity)}</p>
      <small className="mono">
        {m.task} · {m.revision}
      </small>
    </button>
  );
}
function DocumentCard({
  doc,
  inspect,
}: {
  doc: Doc;
  inspect: (title: string, value: unknown) => void;
}) {
  return (
    <button className="document-card" onClick={() => inspect(doc.title, doc)}>
      <div>
        <FileText size={18} />
        <span className="pill subdued">{doc.kind}</span>
        <ArrowUpRight size={13} />
      </div>
      <h3>{doc.title}</h3>
      <p>{doc.text}</p>
      <small>
        Revision {doc.revision} <span>·</span> {doc.source}
      </small>
    </button>
  );
}

function ServiceGraph({
  data,
  active,
  onSelect,
}: {
  data: Workspace | null;
  active: string;
  onSelect: (s: string) => void;
}) {
  const positions: Record<string, [number, number]> = {
    gateway: [125, 125],
    orders: [390, 125],
    payments: [655, 125],
    analytics: [655, 300],
  };
  const nodes = data?.graph.nodes.filter((n) => n.kind === "Service") || [];
  const edges = data?.graph.edges.filter((e) => e.kind === "DEPENDS_ON") || [];
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  return (
    <div className="graph-canvas">
      <svg
        viewBox="0 0 810 380"
        role="img"
        aria-label="Actual service dependency graph"
      >
        <defs>
          <pattern
            id="grid"
            width="22"
            height="22"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r=".7" fill="#29343d" />
          </pattern>
          <marker
            id="arrow"
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3.5"
            orient="auto"
          >
            <path d="M0,0 L7,3.5 L0,7" fill="none" stroke="#5c7d78" />
          </marker>
        </defs>
        <rect width="810" height="380" fill="url(#grid)" />
        <text x="32" y="38" className="svg-caption">
          CHECKOUT DEPENDENCY PATH
        </text>
        {edges.map((e) => {
          const from = byKey.get(e.from),
            to = byKey.get(e.to);
          if (!from || !to) return null;
          const a = positions[from.id],
            b = positions[to.id];
          if (!a || !b) return null;
          return (
            <g key={e.from + "-" + e.to}>
              <path
                d={`M${a[0] + 91},${a[1]} L${b[0] - 96},${b[1]}`}
                className="dependency-edge"
                markerEnd="url(#arrow)"
              />
              <text
                x={(a[0] + b[0]) / 2}
                y={a[1] - 13}
                textAnchor="middle"
                className="edge-label"
              >
                DEPENDS ON
              </text>
            </g>
          );
        })}
        {nodes.map((n) => {
          const p = positions[n.id];
          if (!p) return null;
          const h = data?.health.find((h) => h.service === n.id),
            good = h?.healthy,
            selected = n.id === active;
          return (
            <g
              key={n.key}
              className={"service-node " + (selected ? "selected" : "")}
              tabIndex={0}
              role="button"
              aria-label={`Inspect ${n.id}`}
              onClick={() => onSelect(n.id)}
              onKeyDown={(e) =>
                (e.key === "Enter" || e.key === " ") && onSelect(n.id)
              }
              transform={`translate(${p[0]},${p[1]})`}
            >
              <rect
                x="-93"
                y="-44"
                width="186"
                height="94"
                rx="9"
                className="node-box"
              />
              <rect
                x="-78"
                y="-27"
                width="25"
                height="25"
                rx="6"
                fill={good ? "#19372f" : "#3b2527"}
              />
              <path
                d="M-70,-19h9v9h-9z M-67,-22v3 M-67,-10v3"
                stroke={good ? "#67d5ae" : "#e78e83"}
                fill="none"
              />
              <text x="-43" y="-10" className="node-title">
                {n.title}
              </text>
              <circle
                cx="-72"
                cy="25"
                r="3"
                fill={good ? "#5ce1ac" : "#f19689"}
              />
              <text
                x="-61"
                y="29"
                className={"node-status " + (good ? "healthy" : "degraded")}
              >
                {h ? `HTTP ${h.http_status}` : "Measuring"}
              </text>
              <text x="77" y="29" textAnchor="end" className="node-port">
                :{h?.source.match(/:(\d+)\//)?.[1] || "—"}
              </text>
            </g>
          );
        })}
        <path d="M50 233 H755" stroke="#273139" strokeDasharray="4 6" />
        <text x="32" y="264" className="svg-caption">
          OUTSIDE THE INCIDENT PATH
        </text>
        <text x="32" y="294" className="svg-note">
          An unrelated failure must not change
        </text>
        <text x="32" y="312" className="svg-note">
          the selected recovery target.
        </text>
        {!data && (
          <text x="405" y="150" textAnchor="middle" className="svg-note">
            Connecting to graph records…
          </text>
        )}
      </svg>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
