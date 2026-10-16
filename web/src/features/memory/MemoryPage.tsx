import React from "react";
import { ArrowRight, Braces, Layers3, ShieldCheck } from "lucide-react";
import { nice } from "../../shared/format";
import { useWorkspace } from "../../app/WorkspaceContext";

import { MemoryCard } from "./MemoryCard";
export function MemoryPage() {
const {
  data,
  service,
  setService,
  memoryQuery,
  setMemoryQuery,
  memoryKind,
  setMemoryKind,
  packet,
  inspect
} = useWorkspace();
const visible = (group: "active" | "historical" | "unverified") => (packet?.[group] || []).filter(m =>
  (memoryKind === "all" || m.kind === memoryKind) && JSON.stringify(m).toLowerCase().includes(memoryQuery.toLowerCase()));
return (
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
                  <section className="panel memory-context" aria-labelledby="memory-context-heading">
                    <div className="memory-context-heading"><div><span className="eyebrow">WHAT A NEW SESSION CAN USE</span><h2 id="memory-context-heading">A small packet with sources and limits</h2></div><button className="button secondary" disabled={!packet} onClick={() => inspect("Navigator packet for " + service, packet)}><Braces size={14}/> Inspect navigator packet</button></div>
                    <p>The resolver reads this service's navigator packet alongside the saved checkpoint and current company sources. Each record keeps its source, revision and applicability label.</p>
                    <dl className="memory-context-counts">
                      <div><dt>Current candidates</dt><dd>{packet?.active.length || 0}</dd><small>Check against fresh evidence before acting.</small></div>
                      <div><dt>Historical context</dt><dd>{packet?.historical.length || 0}</dd><small>Past events and records that need revalidation.</small></div>
                      <div><dt>Unverified claims</dt><dd>{packet?.unverified.length || 0}</dd><small>Kept separate from verified records.</small></div>
                    </dl>
                    {packet?.policy && <div className="memory-policy"><span>Up to {packet.policy.max_records} records</span><ArrowRight size={13} aria-hidden="true"/><span>Health facts expire after {packet.policy.health_fact_max_age_seconds}s</span><ArrowRight size={13} aria-hidden="true"/><span>Cache reused for up to {packet.policy.max_cache_seconds}s</span></div>}
                    <p className="memory-context-note"><ShieldCheck size={14}/> Memory supplies candidates for the next decision. Recovery still requires current graph, procedure and service checks.</p>
                  </section>
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
                            (["active", "historical", "unverified"] as const)
                              .reduce((total, group) => total + (data.memory[h.service]?.[group].length || 0), 0)
                          }
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="memory-filters">
                    <input
                      value={memoryQuery}
                      onChange={(e) => setMemoryQuery(e.target.value)}
                      placeholder="Filter memory by claim, action or incident"
                      aria-label="Filter memory"
                    />
                    <select
                      value={memoryKind}
                      onChange={(e) => setMemoryKind(e.target.value)}
                      aria-label="Memory type"
                    >
                      <option value="all">All types</option>
                      <option value="episodic">Episodic</option>
                      <option value="procedural">Procedural</option>
                      <option value="semantic">Semantic</option>
                    </select>
                    <button className="button secondary" disabled={!memoryQuery && memoryKind === "all"} onClick={() => {setMemoryQuery(""); setMemoryKind("all");}}>Clear filters</button>
                  </div>
                  {!!packet?.conflicts.length && (
                    <button
                      className="alert"
                      onClick={() =>
                        inspect("Conflicting memory claims", packet.conflicts)
                      }
                    >
                      Conflicting claims need fresh verification. Inspect
                      evidence.
                    </button>
                  )}
                  <div className="memory-grid" role="group" aria-label="Retrieved memory records">
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
                              {visible(group).length} / {packet?.[group].length || 0}
                            </span>
                          </div>
                          {visible(group)
                            .map((m) => (
                              <MemoryCard
                                key={m.id}
                                memory={m}
                                inspect={inspect}
                              />
                            ))}
                          {!visible(group).length && (
                            <p className="quiet-note">
                              {packet?.[group].length ? "No records match the current filters." : `No ${group} records for this service.`}
                            </p>
                          )}
                        </section>
                      ),
                    )}
                  </div>
                  <p className="footnote">
                    Counts show matching / retrieved records.{" "}
                    {packet?.cache_hit
                      ? "Packet reused from a valid revision-aware cache."
                      : "Packet retrieved from graph records."}{" "}
                    Current configuration: {packet?.revision || "unavailable"}.
                    Cache reuse does not establish truth.
                  </p>
                </>
              );
}
