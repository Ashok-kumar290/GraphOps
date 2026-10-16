import React, { useEffect, useRef, useState } from "react";
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
  const alive = useRef(true), inFlight = useRef(false), queryRef = useRef(query);
  useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
  const begin = () => {if (inFlight.current) return false; inFlight.current = true; setWorking(true); setError(""); return true;};
  const end = () => {inFlight.current = false; if (alive.current) setWorking(false);};
  const clear = () => {
    setEditing(null);
    setTitle("");
    setText("");
    setFilename("company-note.md");
    setKind("note");
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !title.trim() || !text.trim() || !begin()) return;
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
      if (!alive.current) return;
      setMessage(
        `${result.unchanged ? "Source unchanged" : "Source saved"} · revision ${result.document.revision}`,
      );
      clear();
      setHits(null);
      await onChanged();
    } catch (e: any) {
      if (alive.current) setError(e.message);
    } finally {
      end();
    }
  }
  async function open(doc: Doc, edit = false) {
    if (edit && busy || !begin()) return;
    try {
      const full = await api("/api/sources?id=" + encodeURIComponent(doc.id) + (!edit && doc.revision ? "&revision=" + encodeURIComponent(doc.revision) : ""));
      if (!alive.current) return;
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
      if (alive.current) setError(e.message);
    } finally {end();}
  }
  return (
    <section className="panel product-panel source-manager" aria-label="Company source library" aria-busy={working}>
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
          if (!query.trim() || !begin()) return;
          const searched = query;
          try {
            const result = await api(
                  "/api/search?q=" +
                    encodeURIComponent(searched) +
                    "&service=" +
                    encodeURIComponent(service),
                );
            if (alive.current && searched === queryRef.current) setHits(result.documents);
          } catch (e: any) {
            if (alive.current && searched === queryRef.current) setError(e.message);
          } finally {end();}
        }}
        className="product-search"
      >
        <input
          value={query}
          onChange={(e) => {setQuery(e.target.value); queryRef.current = e.target.value; setHits(null);}}
          placeholder="Search current source content"
          aria-label="Search company sources"
          maxLength={120}
        />
        <button className="button secondary" disabled={working || !query.trim()}>
          <Search size={14} />
          Search
        </button>
        <button type="button" className="button secondary" disabled={!query && !hits} onClick={() => {setQuery(""); queryRef.current = ""; setHits(null); setError("");}}>Clear search</button>
      </form>
      {hits && (
        <div className="source-results">
          {hits.length ? (
            hits.map((doc) => (
              <button
                key={doc.id}
                className="source-result"
                disabled={working}
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
      {working && <p role="status">Loading or saving source data...</p>}
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
              const input = e.target;
              if (busy || !begin()) return;
              try {
                if (file.size > 65536)
                  throw new Error("Choose a text file under 64 KB.");
                const value = await file.text();
                if (!alive.current) return;
                if (value.length > 16000 || value.includes("\0"))
                  throw new Error(
                    "Source must be plain text with at most 16000 characters.",
                  );
                setText(value);
                if (!editing) setFilename(file.name);
                if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
              } catch (e: any) {
                if (alive.current) setError(e.message);
              } finally {input.value = ""; end();}
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
              onClick={() => {clear(); setMessage(""); setError("");}}
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
              ? "Please wait..."
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
            <button disabled={working} onClick={() => void open(doc)}>
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
