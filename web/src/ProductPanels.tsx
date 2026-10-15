import React, { useEffect, useState } from "react";
import {
  Activity,
  Download,
  FileText,
  Network,
  Pencil,
  Play,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import type { Doc, Workspace, GraphNode, Incident } from "./types";

type Api = (path: string, body?: unknown) => Promise<any>;
type Inspect = (title: string, value: unknown) => void;
type Props = { api: Api; busy: boolean; inspect: Inspect };

export function SourceManager({
  api,
  busy,
  inspect,
  service,
  documents,
  onChanged,
}: {
  service: string;
  documents: Doc[];
  onChanged: () => Promise<void>;
} & Props) {
  const [title, setTitle] = useState(""),
    [text, setText] = useState(""),
    [filename, setFilename] = useState("company-note.md"),
    [kind, setKind] = useState("note");
  const [editing, setEditing] = useState<Doc | null>(null),
    [query, setQuery] = useState(""),
    [hits, setHits] = useState<Doc[] | null>(null),
    [working, setWorking] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const clear = () => {
    setEditing(null);
    setTitle("");
    setText("");
    setFilename("company-note.md");
    setKind("note");
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const result = await api("/api/sources", {
        service,
        title,
        text,
        filename,
        document_type: kind,
        ...(editing ? { id: editing.id, base_revision: editing.revision } : {}),
      });
      setMessage(
        `${result.unchanged ? "Source unchanged" : "Source saved"} · revision ${result.document.revision}`,
      );
      clear();
      setHits(null);
      await onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }
  async function open(doc: Doc, edit = false) {
    setError("");
    try {
      const full = await api("/api/sources?id=" + encodeURIComponent(doc.id));
      if (edit) {
        setEditing(full);
        setTitle(full.title);
        setText(full.text);
        setFilename(full.data.filename);
        setKind(full.data.document_type);
        setMessage(
          "Editing the current source. Saving creates an immutable revision.",
        );
      } else inspect(full.title, full);
    } catch (e: any) {
      setError(e.message);
    }
  }
  return (
    <section className="panel product-panel source-manager">
      <div className="panel-header">
        <div>
          <Upload size={16} />
          <h2>Company source library</h2>
        </div>
        <span className="pill subdued">VERSIONED</span>
      </div>
      <p>
        Import a text or Markdown source for {service}. Sources inform the
        agent; approved recovery procedures control actions.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            setHits(
              (
                await api(
                  "/api/search?q=" +
                    encodeURIComponent(query) +
                    "&service=" +
                    encodeURIComponent(service),
                )
              ).documents,
            );
          } catch (e: any) {
            setError(e.message);
          }
        }}
        className="product-search"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search current source content"
          aria-label="Search company sources"
          maxLength={120}
        />
        <button className="button secondary" disabled={!query.trim()}>
          <Search size={14} />
          Search
        </button>
      </form>
      {hits && (
        <div className="source-results">
          {hits.length ? (
            hits.map((doc) => (
              <button
                key={doc.id}
                className="source-result"
                onClick={() => void open(doc)}
              >
                <FileText size={15} />
                <div>
                  <strong>{doc.title}</strong>
                  <p>{doc.text}</p>
                  <small>
                    {doc.source} · {doc.revision}
                  </small>
                </div>
              </button>
            ))
          ) : (
            <p>No matching current sources. Try a shorter phrase.</p>
          )}
        </div>
      )}
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {message && (
        <p className="product-notice" role="status">
          {message}
        </p>
      )}
      <form onSubmit={submit} className="source-editor">
        <div className="product-fields">
          <label>
            Source title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={120}
              disabled={busy || working}
            />
          </label>
          <label>
            Source filename
            <input
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              required
              maxLength={120}
              disabled={busy || working || !!editing}
            />
          </label>
          <label>
            Document type
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              disabled={busy || working}
            >
              {[
                "note",
                "runbook",
                "decision",
                "policy",
                "incident",
                "chat",
              ].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="file-picker">
          Read a local file
          <input
            type="file"
            accept=".md,.txt,.json,.markdown"
            disabled={busy || working}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setError("");
              try {
                if (file.size > 65536)
                  throw new Error("Choose a text file under 64 KB.");
                const value = await file.text();
                if (value.length > 16000 || value.includes("\0"))
                  throw new Error(
                    "Source must be plain text with at most 16000 characters.",
                  );
                setText(value);
                if (!editing) setFilename(file.name);
                if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
              } catch (e: any) {
                setError(e.message);
              }
              e.target.value = "";
            }}
          />
        </label>
        <label>
          Source content
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
            rows={8}
            maxLength={16000}
            disabled={busy || working}
          />
        </label>
        <div className="product-actions">
          <small>{text.length.toLocaleString()} / 16,000 characters</small>
          <button
            type="button"
            className="button secondary"
            disabled={busy || working}
            onClick={() => {
              clear();
              setTitle("Synthetic support policy");
              setFilename(`${service}-support-policy.md`);
              setKind("policy");
              setText(
                `# Synthetic support policy for ${service}\n\nThe customer refund review window is 72 hours. Escalate configuration recovery to the service owner. This reference does not authorize changes to production systems.`,
              );
            }}
          >
            Load synthetic sample
          </button>
          {editing && (
            <button
              type="button"
              className="button secondary"
              onClick={clear}
              disabled={working}
            >
              Cancel edit
            </button>
          )}
          <button
            className="button primary"
            disabled={busy || working || !title.trim() || !text.trim()}
          >
            <Upload size={14} />
            {working
              ? "Saving…"
              : editing
                ? "Save new revision"
                : "Import source"}
          </button>
        </div>
      </form>
      {documents
        .filter((d) => d.kind === "reference")
        .map((doc) => (
          <div className="source-version-row" key={doc.id}>
            <button onClick={() => void open(doc)}>
              <FileText size={14} />
              {doc.title}
              <small>rev {doc.revision}</small>
            </button>
            <button
              className="button secondary"
              disabled={busy || working}
              onClick={() => void open(doc, true)}
            >
              <Pencil size={13} />
              Edit source
            </button>
          </div>
        ))}
    </section>
  );
}

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

export function RunHistory({
  api,
  inspect,
  onChoose,
}: {
  api: Api;
  inspect: Inspect;
  onChoose: (id: string, task?: Incident) => void;
}) {
  const [query, setQuery] = useState(""),
    [result, setResult] = useState<any>(null),
    [error, setError] = useState("");
  async function load(before = "", append = false) {
    try {
      const next = await api(
        "/api/history?q=" +
          encodeURIComponent(query) +
          (before ? "&before=" + encodeURIComponent(before) : ""),
      );
      setResult((old: any) => ({
        ...next,
        tasks: append ? [...old.tasks, ...next.tasks] : next.tasks,
      }));
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="product-sections">
      <section className="panel product-panel history-panel">
        <div className="panel-header">
          <div>
            <FileText size={16} />
            <h2>Run history</h2>
          </div>
        </div>
        <form
          className="product-search"
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search run history"
            placeholder="Search incident ID, title or target"
            maxLength={120}
          />
          <button className="button secondary">
            <Search size={14} />
            Search
          </button>
        </form>
        {error && <div className="alert">{error}</div>}
        <table>
          <thead>
            <tr>
              <th>RUN</th>
              <th>MODE</th>
              <th>TARGET</th>
              <th>STATUS</th>
              <th>CREATED</th>
            </tr>
          </thead>
          <tbody>
            {result?.tasks.map((task: Incident) => (
              <tr
                key={task.id}
                tabIndex={0}
                onClick={() => onChoose(task.id, task)}
                onKeyDown={(e) => e.key === "Enter" && onChoose(task.id, task)}
              >
                <td>
                  <strong>{task.id}</strong>
                  <small>{task.title}</small>
                </td>
                <td>
                  {task.diagnostic
                    ? "System check"
                    : task.mode === "llm"
                      ? "LLM agent"
                      : "Scripted"}
                </td>
                <td>{task.target || "—"}</td>
                <td>
                  <span className={"state-badge " + task.status}>
                    {task.status}
                  </span>
                </td>
                <td>{new Date(task.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!result?.tasks.length && <p>No matching runs.</p>}
        {result?.next_cursor && (
          <button
            className="button secondary"
            onClick={() => void load(result.next_cursor, true)}
          >
            Load older runs
          </button>
        )}
      </section>
      <section className="panel product-panel">
        <h3>Workspace change log</h3>
        {result?.audits.map((event: any) => (
          <button
            className="audit-row"
            key={event.id}
            onClick={() => inspect(event.action, event)}
          >
            <ShieldCheck size={14} />
            <strong>{event.action.replaceAll("_", " ")}</strong>
            <span>{new Date(event.time).toLocaleString()}</span>
          </button>
        ))}
        {!result?.audits.length && (
          <p>No source or ownership changes have been recorded.</p>
        )}
      </section>
    </div>
  );
}

export function KnowledgeGraph({
  data,
  service,
  inspect,
}: {
  data: Workspace | null;
  service: string;
  inspect: Inspect;
}) {
  const all = data?.graph.nodes || [],
    edges = data?.graph.edges || [],
    root = all.find((n) => n.kind === "Service" && n.id === service);
  if (!root) return null;
  const keys = new Set<number>([root.key]);
  for (const edge of edges)
    if (edge.from === root.key || edge.to === root.key) {
      keys.add(edge.from);
      keys.add(edge.to);
    }
  const nearby = all.filter((n) => keys.has(n.key)),
    left = nearby.filter((n) => n.key !== root.key && n.kind !== "Document"),
    right = nearby.filter((n) => n.kind === "Document").slice(0, 12);
  const height = Math.max(330, Math.max(left.length, right.length) * 56 + 80),
    positions = new Map<number, [number, number]>([
      [root.key, [430, height / 2]],
    ]);
  left.forEach((n, i) => positions.set(n.key, [125, 65 + i * 56]));
  right.forEach((n, i) => positions.set(n.key, [735, 65 + i * 56]));
  const node = (n: GraphNode) => {
    const [x, y] = positions.get(n.key)!;
    return (
      <g
        role="button"
        tabIndex={0}
        key={n.key}
        onClick={() => inspect("Connected " + n.kind, n)}
        onKeyDown={(e) =>
          e.key === "Enter" && inspect("Connected " + n.kind, n)
        }
        className={"knowledge-node " + (n.key === root.key ? "root" : "")}
        transform={`translate(${x},${y})`}
      >
        <rect x={-100} y={-22} width={200} height={44} rx={7} />
        <text x={-86} y={-3}>
          {n.title?.length > 25 ? n.title.slice(0, 24) + "…" : n.title || n.id}
        </text>
        <text x={-86} y={13} className="kind">
          {n.kind}
        </text>
      </g>
    );
  };
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <Network size={16} />
          <h2>Connected company context</h2>
        </div>
        <span className="pill subdued">FALKORDB</span>
      </div>
      <div className="knowledge-canvas">
        <svg
          viewBox={`0 0 860 ${height}`}
          role="img"
          aria-label={`Actual graph relationships around ${service}`}
        >
          <defs>
            <marker
              id="knowledge-arrow"
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <path d="M0 0 L7 3.5 L0 7" fill="none" stroke="#6d9990" />
            </marker>
          </defs>
          {edges
            .filter((e) => positions.has(e.from) && positions.has(e.to))
            .map((e, i) => {
              const a = positions.get(e.from)!,
                b = positions.get(e.to)!;
              return (
                <g
                  key={i}
                  onClick={() => inspect("Sourced graph relationship", e)}
                >
                  <path
                    d={`M${a[0] + 100},${a[1]} C${(a[0] + b[0]) / 2},${a[1]} ${(a[0] + b[0]) / 2},${b[1]} ${b[0] - 105},${b[1]}`}
                    markerEnd="url(#knowledge-arrow)"
                  />
                  <text
                    x={(a[0] + b[0]) / 2}
                    y={(a[1] + b[1]) / 2 - 6}
                    textAnchor="middle"
                    className="relationship"
                  >
                    {e.kind.replaceAll("_", " ")}
                  </text>
                </g>
              );
            })}
          {[...left, root, ...right].map(node)}
        </svg>
      </div>
      <p className="graph-foot">
        Relationships come from the graph. Up to 12 attached sources are shown;
        search the library for more.
      </p>
    </section>
  );
}
