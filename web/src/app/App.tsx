import React, { useEffect } from "react";
import { Activity, ArrowUpRight, BarChart3, Box, Braces, Clock3, Layers3, LockKeyhole, Network, RefreshCw, ShieldCheck, SquareTerminal, Users, Workflow, X, Zap, Settings2, Download, LogOut } from "lucide-react";
import { time, nice } from "../shared/format";
import { WorkspaceProvider, useWorkspace } from "./WorkspaceContext";
import { PAGE_META } from "./navigation";
import { ContextSidebar } from "./ContextSidebar";
import { HomePage } from "../features/home/HomePage";
import { GraphPage } from "../features/graph/GraphPage";
import { AgentPage } from "../features/agent/AgentPage";
import { MemoryPage } from "../features/memory/MemoryPage";
import { CompanyPage } from "../features/company/CompanyPage";
import { HistoryPage } from "../features/runs/HistoryPage";
import { SystemPage } from "../features/system/SystemPage";
import { ResultsPage } from "../features/results/ResultsPage";
import { VerifyPage } from "../features/verify/VerifyPage";
import { WalkthroughGuide } from "../features/walkthrough/WalkthroughGuide";
function WorkspaceShell() {
const {
  data,
  view,
  setView,
  mode,
  error,
  setError,
  connectionError,
  pending,
  notice,
  setNotice,
  downloading,
  unavailable,
  inspector,
  setInspector,
  locked,
  viewOnly,
  token,
  setToken,
  refresh,
  command,
  busy,
  selected,
  service,
  allMemory,
  choose,
  download
} = useWorkspace();
const showRunAlerts = (view === "workspace" && !selected?.question) ||
  (view === "company" && selected?.question && !selected.diagnostic && !selected.verification && selected.target === service) ||
  (view === "system" && selected?.diagnostic);
useEffect(() => { document.getElementById("page-title")?.focus(); }, [view]);
return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
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
            <strong>{data?.workspace || "Company workspace"}</strong>
            <small>Shared company context</small>
          </div>
        </div>
        <div className="nav-label">OPERATIONS</div>
        <nav aria-label="Main navigation">
          {(
            [
              { id: "home", label: "Start here", icon: Box },
{ id: "workspace", label: "Agent tasks", icon: Workflow },
              { id: "memory", label: "Memory navigator", icon: Layers3 },
              { id: "company", label: "Company knowledge", icon: Users },
{ id: "graph", label: "Connected graph", icon: Network },
              { id: "history", label: "Run history", icon: Clock3 },
              { id: "system", label: "System & backups", icon: Settings2 },
              { id: "verify", label: "Judge check", icon: ShieldCheck },
              { id: "results", label: "Results", icon: BarChart3 },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={"nav-item " + (view === item.id ? "active" : "")}
              aria-label={item.label}
              aria-current={view === item.id ? "page" : undefined}
              title={item.label}
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
            <span className={"status-dot " + (data && !connectionError ? "resolved" : "blocked")} />
            {locked ? "Workspace locked" : connectionError ? "Connection interrupted" : data ? "FalkorDB connected" : "Connecting to FalkorDB"}
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
              {PAGE_META[view].title}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="provider-tag">
              <Zap size={12} />
              {data ? data.model.provider : "Model"}
              <span className="tag-separator" />
              {data?.model.model || "Checking configuration"}
            </span>
            {busy && data?.active_task && (
              <button
                className="button secondary"
                disabled={pending || data.stopping || unavailable}
                onClick={() =>
                  void command("/api/cancel", { task: data.active_task })
                }
              >
                {data.stopping ? "Stopping..." : "Stop at checkpoint"}
              </button>
            )}
            {data?.access_required && data.authenticated !== false && (
              <button
                className="plain-icon"
                title="Lock workspace"
                aria-label="Lock workspace"
                disabled={pending}
                onClick={() => void command("/api/logout", {})}
              >
                <LogOut size={16} />
              </button>
            )}
            <span className="team-avatar">G</span>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className={"view-" + view}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> EVIDENCE BEFORE ACTION
              </div>
              <h1 id="page-title" tabIndex={-1}>{PAGE_META[view].title}</h1><p>{PAGE_META[view].description}</p>
            </div>
            <button
              className="button secondary icon-button"
              onClick={() => void refresh()}
              aria-label="Refresh workspace"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          {connectionError && <div className="alert" role="alert"><Activity size={16}/><span>{connectionError} Displayed records may be stale. Reconnect before making changes.</span><button className="button secondary" onClick={() => void refresh()}>Reconnect workspace</button></div>}
          {error && (
            <div className="alert" role="alert">
              <Activity size={16} />
              <span>{error}</span>
              <button
                aria-label="Dismiss error"
                onClick={() => {
                  setError("");
                }}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {notice && <div className="product-notice workspace-notice" role="status"><span>{notice}</span><button className="plain-icon" aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={15}/></button></div>}
          {showRunAlerts && selected?.last_error && (
            <div className="alert" role="alert">
              <Activity size={16} />
              <span>{selected.last_error}</span>
            </div>
          )}
          {showRunAlerts && selected?.blocker && !selected.last_error && (
            <div className="alert" role="status">
              <ShieldCheck size={16} />
              <span>{selected.blocker}</span>
            </div>
          )}
          {(locked || viewOnly) && (
            <form
              className={"access-form panel" + (viewOnly ? " access-form-public" : "")}
              onSubmit={(e) => {
                e.preventDefault();
                void command("/api/access", { token });
              }}
            >
              <LockKeyhole size={20} />
              <div>
                <h3>{viewOnly ? "Public view" : "Demo access"}</h3>
                <p>{viewOnly
                  ? "Browse the graph, runs, sources and results freely. Running agents, injecting faults or changing the company needs the judge access token."
                  : "Enter the access token supplied with this deployment."}</p>
              </div>
              <input
                type="password"
                aria-label="Workspace access token"
                autoComplete="off"
                required
                disabled={pending}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Access token"
              />
              <button className="button primary" disabled={pending || !token.trim()}>{pending ? "Unlocking..." : viewOnly ? "Unlock to run agents" : "Unlock workspace"}</button>
            </form>
          )}
          {!locked && mode === "scripted" && (
            <div className="baseline-notice">
              <SquareTerminal size={14} />
              Scripted baseline selected. Tools and measurements are real;
              decisions are deterministic.
            </div>
          )}
          {!locked && <WalkthroughGuide />}
          {!locked && view === "workspace" && selected && !selected.question && (
            <div className="report-action">
              <button
                className="button secondary"
                disabled={unavailable || !!downloading}
                onClick={() =>
                  void download(
                    "/api/reports?task=" + encodeURIComponent(selected.id),
                    selected.id + ".json",
                  )
                }
              >
                <Download size={14} />
                Download incident report
              </button>
            </div>
          )}
          {!locked && <div className={"workspace-layout " + (view === "home" || view === "results" || view === "verify" ? "overview-layout" : "")}>
            <section className="workspace-main">
{!data && view !== "home" && view !== "results" ? <section className="panel product-panel" role="status"><h2>Waiting for the workspace</h2><p>Connect to load this module's records and controls.</p></section> : <>
{view === "home" && <HomePage />}
{view === "graph" && <GraphPage />}
              {view === "workspace" && <AgentPage />}
              {view === "memory" && <MemoryPage />}
              {view === "company" && <CompanyPage />}
              {view === "history" && <HistoryPage />}
              {view === "system" && <SystemPage />}
              {view === "results" && <ResultsPage />}
              {view === "verify" && <VerifyPage />}
              </>}
            </section>
            {view !== "home" && view !== "results" && view !== "verify" && data && <ContextSidebar />}
          </div>}
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
export function App() {
return <WorkspaceProvider><WorkspaceShell /></WorkspaceProvider>;
}
