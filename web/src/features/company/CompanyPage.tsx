import React, { useEffect } from "react";
import { Clock3, FileText, Users } from "lucide-react";

import { useWorkspace } from "../../app/WorkspaceContext";
import { api } from "../../shared/api";
import { DocumentCard } from "./DocumentCard";
import { SourceManager } from "./SourceManager";
import { ConnectorsPanel } from "./ConnectorsPanel";
import { KnowledgeGraph } from "../graph/KnowledgeGraph";
import { CompanyQuestion } from "./CompanyQuestion";
import type { Doc } from "../../shared/contracts";

// One card per document; repeated revisions (one per closed ticket) collapse behind it.
function groupRevisions(docs: Doc[]): Doc[][] {
  const groups = new Map<string, Doc[]>();
  for (const doc of docs) groups.set(doc.id, [...(groups.get(doc.id) || []), doc]);
  return [...groups.values()];
}

export function CompanyPage() {
const {
  data,
  service,
  setService,
  owner,
  setOwner,
  refresh,
  command,
  controlsDisabled: busy,
  company,
  inspect
} = useWorkspace();
useEffect(() => {setOwner("");}, [service]);
return (
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
                  <CompanyQuestion />
                  <KnowledgeGraph
                    data={data}
                    service={service}
                    inspect={inspect}
                  />
                  <ConnectorsPanel />
                  <SourceManager
                    key={service}
                    api={api}
                    busy={busy}
                    inspect={inspect}
                    service={service}
                    documents={company?.documents || []}
                    onChanged={refresh}
                  />
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
                        {groupRevisions(company.historical_documents).map(([first, ...earlier]) => (
                          <div className="revision-group" key={first.id}>
                            <DocumentCard doc={first} inspect={inspect} />
                            {earlier.length > 0 && (
                              <details className="revision-more">
                                <summary>
                                  {earlier.length} more revision{earlier.length > 1 ? "s" : ""} of {first.title}
                                </summary>
                                <div className="document-grid">
                                  {earlier.map((doc) => (
                                    <DocumentCard key={doc.id + ":" + doc.revision} doc={doc} inspect={inspect} />
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                  {["payments", "orders"].includes(service) && (
                    <section className="panel company-edit">
                      <h3>Ownership and recovery procedures</h3>
                      <p>
                        These controls update our synthetic company graph. The
                        next agent run reads the new source revision.
                      </p>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (busy || !owner.trim()) return;
                          const result = await command("/api/company", {
                            service,
                            operation: "owner",
                            owner,
                          });
                          if (result) setOwner("");
                        }}
                      >
                        <input
                          aria-label="New service owner"
                          value={owner}
                          onChange={(e) => setOwner(e.target.value)}
                          placeholder="New owner team"
                          maxLength={80}
                          disabled={busy}
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
                </>
              );
}
