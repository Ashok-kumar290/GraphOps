import React from "react";
import { Clock3, FileText, Send, Users } from "lucide-react";

import { useWorkspace } from "../../app/WorkspaceContext";
import { api } from "../../shared/api";
import { Timeline } from "../runs/Timeline";
import { DocumentCard } from "./DocumentCard";
import { SourceManager } from "./SourceManager";
import { KnowledgeGraph } from "../graph/KnowledgeGraph";
export function CompanyPage() {
const {
  data,
  service,
  setService,
  mode,
  setMode,
  question,
  setQuestion,
  owner,
  setOwner,
  refresh,
  command,
  busy,
  company,
  inspect
} = useWorkspace();
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
                  <KnowledgeGraph
                    data={data}
                    service={service}
                    inspect={inspect}
                  />
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
                      <h3>Ownership and recovery procedures</h3>
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
                    <h3>Ask the company agent about {service}</h3>
                    <label className="question-mode">
                      Execution mode
                      <select
                        value={mode}
                        onChange={(e) => setMode(e.target.value)}
                        disabled={busy}
                      >
                        <option value="llm">Agent LLM</option>
                        <option value="scripted">Scripted baseline</option>
                      </select>
                    </label>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void command("/api/questions", {
                          question,
                          mode,
                          service,
                        });
                      }}
                    >
                      <input
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        aria-label="Company question"
                        placeholder="Who owns this service, and what procedure applies?"
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
              );
}
