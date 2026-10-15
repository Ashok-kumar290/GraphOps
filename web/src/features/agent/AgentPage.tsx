import React from "react";
import { Activity, ArrowRight, ArrowUpRight, Braces, CheckCircle2, Database, GitBranch, Layers3, LoaderCircle, Network, Play } from "lucide-react";
import type { Inspect } from "../../shared/contracts";
import { nice } from "../../shared/format";
import { useWorkspace } from "../../app/WorkspaceContext";
import { api } from "../../shared/api";
import { Metric } from "../../shared/ui";
import { Timeline } from "../runs/Timeline";
import { ServiceGraph } from "../graph/ServiceGraph";
export function AgentPage() {
const {
  data,
  service,
  setService,
  scenario,
  setScenario,
  mode,
  setMode,
  pauseAfterHandoff,
  setPauseAfterHandoff,
  locked,
  stage,
  command,
  busy,
  selected,
  company,
  allMemory,
  inspect
} = useWorkspace();
return (
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
              );
}
