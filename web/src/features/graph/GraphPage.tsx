import React from "react";
import { useWorkspace } from "../../app/WorkspaceContext";
import { KnowledgeGraph } from "./KnowledgeGraph";
import { ServiceGraph } from "./ServiceGraph";

export function GraphPage() {
  const {data, service, setService, selected, inspect} = useWorkspace();
  return <div className="product-sections">
    <section className="panel product-panel"><h2>Relationships guide the agent</h2><p>The dependency graph helps distinguish the service causing a failure from services affected by it. Company relationships identify owners and relevant source documents. These relationships come from FalkorDB.</p>
      <div className="product-actions">{(data?.health || []).map(item => <button key={item.service} className={"button " + (service === item.service ? "primary" : "secondary")} onClick={() => setService(item.service)}>{item.service}</button>)}</div>
    </section>
    <section className="panel product-panel"><h2>Service dependencies</h2>{data && <ServiceGraph data={data} active={service} onSelect={setService}/>}</section>
    {data && <KnowledgeGraph data={data} service={service} inspect={inspect}/>}
    <section className="panel product-panel"><h2>How to read this</h2><p>A service node is a system the agent can observe. A dependency edge means one service relies on another. Owner and document edges give the agent company context. Click a source to inspect its evidence.</p><small>Selected run: {selected?.id || "None"}. The graph alone does not prove current health; the agent also makes live observations.</small></section>
  </div>;
}
