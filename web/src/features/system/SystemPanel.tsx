import React, { useEffect, useState } from "react";
import { Activity, Play, Download } from "lucide-react";
import type { Workspace, Api, Inspect } from "../../shared/contracts";

type Props = { api: Api; busy: boolean; inspect: Inspect };
export function SystemPanel({
  api,
  busy,
  inspect,
  data,
  onDiagnose,
  onBackup,
}: {
  data: Workspace | null;
  onDiagnose: () => void;
  onBackup: () => void;
} & Props) {
  const [status, setStatus] = useState<any>(null),
    [error, setError] = useState("");
  async function refresh() {
    try {
      setStatus(await api("/api/readiness"));
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => clearInterval(timer);
  }, [data?.diagnostics?.checked_at]);
  return (
    <div className="product-sections">
      <section className="panel product-panel">
        <div className="panel-header">
          <div>
            <Activity size={16} />
            <h2>System readiness</h2>
          </div>
          <button className="button secondary" onClick={() => void refresh()}>
            Refresh status
          </button>
        </div>
        <p>
          Connection checks and live verification are shown separately. System
          checks open a fresh MCP session and make one inference request to the
          selected model.
        </p>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <div className="component-grid">
          {["graph", "lab", "model", "mcp"].map((name) => {
            const item = status?.components?.[name];
            return (
              <article key={name} className="component-status">
                <strong>
                  {name === "mcp"
                    ? "MCP"
                    : name === "lab"
                      ? "Controlled services"
                      : name === "graph"
                        ? "FalkorDB"
                        : "Model inference"}
                </strong>
                <span
                  className={
                    "state-badge " +
                    (["online", "verified", "available"].includes(item?.status)
                      ? "resolved"
                      : "blocked")
                  }
                >
                  {item?.status || "checking"}
                </span>
                <p>{item?.message || "Waiting for a response"}</p>
              </article>
            );
          })}
        </div>
        <div className="product-actions">
          <small>
            {status?.checked_at
              ? "Checked " + new Date(status.checked_at).toLocaleString()
              : "Checking dependencies"}
          </small>
          <button
            className="button primary"
            disabled={busy}
            onClick={onDiagnose}
          >
            <Play size={14} />
            Run system checks
          </button>
        </div>
        {(data?.diagnostics || status?.last_diagnostics) && (
          <button
            className="text-button"
            onClick={() =>
              inspect(
                "Actual component verification",
                data?.diagnostics || status.last_diagnostics,
              )
            }
          >
            Inspect latest verification
          </button>
        )}
      </section>
      <section className="panel product-panel">
        <div className="panel-header">
          <div>
            <Download size={16} />
            <h2>Workspace backup</h2>
          </div>
        </div>
        <p>
          Download graph sources, revisions, sessions, memory, plans and
          controlled-service state. Backups exclude provider configuration keys.
          Imported source text is included.
        </p>
        <button className="button secondary" onClick={onBackup} disabled={busy}>
          <Download size={14} />
          Download workspace backup
        </button>
        <p className="quiet-note">
          Restore is available through the CLI into a new workspace. Existing
          workspaces are never overwritten. Stop or finish the running job
          before exporting.
        </p>
      </section>
      <section className="panel product-panel">
        <h3>Workspace boundaries</h3>
        <dl className="system-details">
          <dt>Workspace</dt>
          <dd>{data?.workspace}</dd>
          <dt>Selected provider</dt>
          <dd>
            {data?.model.provider} / {data?.model.model}
          </dd>
          <dt>Actions</dt>
          <dd>Two controlled-service recovery operations</dd>
          <dt>Sources</dt>
          <dd>Synthetic fixtures and uploaded reference text</dd>
          <dt>Access</dt>
          <dd>
            {data?.access_required
              ? "Shared team access token"
              : "Local loopback workspace"}
          </dd>
        </dl>
        <p>
          Production-service integrations and individual user accounts are not
          enabled in this release.
        </p>
      </section>
    </div>
  );
}
