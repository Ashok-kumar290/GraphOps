import React, { useEffect, useState } from "react";
import { FileText, Search, ShieldCheck } from "lucide-react";
import type { Workspace, Incident, Api, Inspect } from "../../shared/contracts";
import { time } from "../../shared/format";
type Props = { api: Api; busy: boolean; inspect: Inspect };
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
