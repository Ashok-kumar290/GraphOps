import React, { useEffect, useState } from "react";
import { GitBranch, MessageSquare, Ticket } from "lucide-react";
import { useWorkspace } from "../../app/WorkspaceContext";
import { api } from "../../shared/api";

type Status = { configured: Record<string, boolean>; documents: Record<string, number>; people: number };
type Result = { tool: string; source: string; records: number; imported: number; unchanged: number;
  services: Record<string, number>; repository?: number; unlinked?: number; people: number };

const TOOLS = [
  { id: "slack", name: "Slack", icon: MessageSquare, sample: "sample Slack export",
    about: "Threads from on-call channels become chat sources linked to the service each channel covers." },
  { id: "jira", name: "Jira", icon: Ticket, sample: "sample Jira issues",
    about: "Issues become tickets linked by component, with their assignee and reporter as people." },
  { id: "github", name: "GitHub", icon: GitBranch, sample: "",
    about: "Real public commits, issues and pull requests. Records that name a service link to it; the rest link to the repository." },
];

export function ConnectorsPanel() {
  const { command, controlsDisabled, data } = useWorkspace();
  const [status, setStatus] = useState<Status | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [repository, setRepository] = useState("Ashok-kumar290/GraphOps");
  // Accept only a well-formed status; anything else shows the panel without counts.
  const load = () => api("/api/connectors").then(s => setStatus(s?.documents && s?.configured ? s : null)).catch(() => setStatus(null));
  useEffect(() => { void load(); }, [data?.workspace]);

  const connect = async (tool: string, source: string) => {
    const reply = await command("/api/connectors", { tool, source, ...(tool === "github" ? { repository } : {}) });
    if (reply) { setResult(reply as Result); void load(); }
  };

  return (
    <section className="panel connectors" aria-labelledby="connectors-heading">
      <div className="panel-header"><div><h2 id="connectors-heading">Connected tools</h2></div>
        <span className="pill subdued">{status ? `${status.people} people in the graph` : "FALKORDB"}</span></div>
      <p className="connectors-intro">Bring records from the tools a company already uses into the graph. Agents read them as
        cited context; they never authorise an action on their own, only an approved runbook does.</p>
      <div className="connector-grid">
        {TOOLS.map(tool => {
          const Icon = tool.icon, count = status?.documents[tool.id] ?? 0, live = status?.configured[tool.id];
          return (
            <div className="connector-card" key={tool.id}>
              <div className="connector-head"><Icon size={18} /><b>{tool.name}</b>
                <span className={"connector-count" + (count ? " on" : "")}>{count} record{count === 1 ? "" : "s"}</span></div>
              <p>{tool.about}</p>
              {tool.id === "github" ? (
                <div className="connector-repo">
                  <label htmlFor="github-repository">Public repository</label>
                  <input id="github-repository" value={repository} onChange={e => setRepository(e.target.value)} placeholder="owner/name" />
                  <button className="button primary" disabled={controlsDisabled || !/^[\w.-]+\/[\w.-]+$/.test(repository)}
                          onClick={() => void connect("github", "live")}>Import from GitHub</button>
                </div>
              ) : (
                <div className="connector-actions">
                  <button className="button secondary" disabled={controlsDisabled} onClick={() => void connect(tool.id, "sample")}>Import {tool.sample}</button>
                  <button className="button secondary" disabled={controlsDisabled || !live} onClick={() => void connect(tool.id, "live")}
                          title={live ? `Sync from your ${tool.name}` : `Add ${tool.name} credentials to .env to enable`}>
                    {live ? `Sync live ${tool.name}` : "Live: not configured"}</button>
                </div>
              )}
            </div>);
        })}
      </div>
      {result && (
        <p className="connector-result" role="status">
          {result.tool === "github" ? "GitHub" : result.tool === "jira" ? "Jira" : "Slack"} ({result.source}): {result.records} records read,
          {" "}{result.imported} new or changed, {result.unchanged} unchanged.
          {Object.keys(result.services).length > 0 && <> Linked to {Object.entries(result.services).map(([s, n]) => `${s} (${n})`).join(", ")}.</>}
          {result.repository ? ` ${result.repository} linked to the repository.` : ""}
          {result.unlinked ? ` ${result.unlinked} did not concern a service and were skipped.` : ""}
        </p>)}
    </section>
  );
}
