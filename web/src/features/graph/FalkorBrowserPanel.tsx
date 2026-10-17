import React, { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";

// Ready-made queries return paths, so the FalkorDB Browser draws nodes and edges instead of a table.
function queries(incident?: string) {
  return [
    { title: "Company graph", text: "MATCH p=(a)-[:DEPENDS_ON|OWNS|USES|KNOWS|HAS_EXPERTISE|HAS_DOCUMENT]->(b) RETURN p" },
    { title: "What checkout depends on", text: "MATCH p=(:Service {id:'gateway'})-[:DEPENDS_ON*1..8]->(:Service) RETURN p" },
    { title: "Shared memory per service", text: "MATCH p=(:Service)-[:HAS_MEMORY]->(:Memory) RETURN p" },
    ...(incident ? [{ title: `Agents in ${incident}`, text: `MATCH p=(:Incident {id:'${incident}'})-[:HAS_SESSION]->(:Session)-[:EMITTED]->(:Event) RETURN p` }] : []),
  ];
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="button secondary fb-copy" aria-label={label} onClick={() => {
      navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => undefined);
    }}><Copy size={13} /> {done ? "Copied" : "Copy"}</button>
  );
}

export function FalkorBrowserPanel({ graphName, incident }: { graphName: string; incident?: string }) {
  return (
    <section className="panel product-panel fb-panel" aria-labelledby="fb-heading">
      <h2 id="fb-heading">See this graph in the FalkorDB Browser</h2>
      <p>FalkorDB includes a visual browser that draws the graph as connected nodes. It runs beside the database.</p>
      <ol className="fb-steps">
        <li>Open <a href="http://localhost:3000" target="_blank" rel="noreferrer">localhost:3000 <ExternalLink size={12} /></a> and log in with
          host <code>localhost</code>, port <code>6379</code>, no username or password. Skip the tutorial.</li>
        <li>Under <b>Select Graph</b>, choose this workspace's graph:
          <span className="fb-name"><code>{graphName}</code><CopyButton text={graphName} label="Copy graph name" /></span></li>
        <li>Paste a query below, press <kbd>Esc</kbd> to close suggestions, then click <b>RUN</b>.</li>
      </ol>
      <ul className="fb-queries">
        {queries(incident).map(q => (
          <li key={q.title}><b>{q.title}</b><code>{q.text}</code><CopyButton text={q.text} label={`Copy query: ${q.title}`} /></li>))}
      </ul>
      <small>Queries that return paths (<code>RETURN p</code>) are drawn as a graph; queries that return properties appear as a table.</small>
    </section>
  );
}
