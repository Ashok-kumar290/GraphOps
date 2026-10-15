import React from "react";
import { Activity, ArrowRight, ArrowUpRight, Box, CheckCircle2, FileText, Layers3, ShieldCheck } from "lucide-react";
import type { Memory, Inspect } from "../shared/contracts";
import { nice } from "../shared/format";
import { useWorkspace } from "./WorkspaceContext";
import { MemoryCard } from "../features/memory/MemoryCard";
export function ContextSidebar() {
const {
  setView,
  service,
  selected,
  selectedHealth,
  company,
  packet,
  inspect
} = useWorkspace();
return (<aside className="context-column">
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
            </aside>);
}
