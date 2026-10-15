import React, { useState } from "react";
import { Pencil, Upload } from "lucide-react";
import { FileText, Search } from "lucide-react";
import type { Doc, Api, Inspect } from "../../shared/contracts";

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
