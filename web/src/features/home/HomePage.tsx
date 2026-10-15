import React from "react";
import { ArrowRight, BookOpen, Network, Workflow, ShieldCheck, Layers3, LayoutDashboard } from "lucide-react";
import { useWorkspace } from "../../app/WorkspaceContext";
import type { View } from "../../shared/contracts";

const MODULES: {name:string; purpose:string; view:View; icon:typeof Network}[] = [
  {name:"1. Company knowledge", purpose:"Documents, ownership and procedures become sourced context the agent can read.", view:"company", icon:BookOpen},
  {name:"2. Connected graph", purpose:"FalkorDB connects services, teams, sources, tasks and memory so relationships can guide decisions.", view:"graph", icon:Network},
  {name:"3. Agent", purpose:"The selected model chooses steps and tools. Each investigation and resolution has its own session.", view:"workspace", icon:Workflow},
  {name:"4. Actions", purpose:"Backend checks validate a current procedure, execute a supported operation and measure its result.", view:"workspace", icon:ShieldCheck},
  {name:"5. Shared memory", purpose:"The next session retrieves sourced facts, past outcomes and procedures with freshness labels.", view:"memory", icon:Layers3},
  {name:"6. Workspace", purpose:"Use the UI or CLI to start work, inspect evidence, resume a task and export a backup.", view:"system", icon:LayoutDashboard},
];

export function HomePage() {
  const {setView, setQuestion, setService, data} = useWorkspace();
  const documents = Object.values(data?.company || {}).reduce((n, c) => n + c.documents.length, 0);
  return <div className="product-overview">
    <section className="panel overview-intro">
      <span className="eyebrow">WHAT WE ARE BUILDING</span>
      <h2>A company copilot that carries useful context into the next session.</h2>
      <p>Give it company knowledge and a task. It uses a graph to find relevant context, chooses supported steps, verifies the outcome and saves evidence for the next agent session.</p>
      <div className="overview-flow" aria-label="Product workflow">
        {["Task", "Connected context", "Agent steps", "Verified result", "Shared memory"].map((step, i) => <React.Fragment key={step}>{i > 0 && <ArrowRight size={16} aria-hidden="true" />}<span>{step}</span></React.Fragment>)}
      </div>
      <div className="product-actions">
        <button className="button primary" onClick={() => setView("workspace")}>Try the action demo <ArrowRight size={15} /></button>
        <button className="button secondary" onClick={() => {setService("payments"); setQuestion("Who owns payments, and which current procedure supports recovery? Cite your sources."); setView("company");}}>Ask about the company</button>
      </div>
    </section>
    <section className="panel overview-example">
      <div><span className="eyebrow">A CONCRETE EXAMPLE</span><h3>Checkout is failing. Which service should we change?</h3></div>
      <ol>
        <li><strong>Connect the evidence.</strong> Checkout depends on orders, which depends on payments. A separate analytics failure is unrelated.</li>
        <li><strong>Investigate.</strong> The agent compares real HTTP measurements with those graph relationships and saves the supported cause.</li>
        <li><strong>Continue in a fresh session.</strong> A resolver reads the saved handoff, current owner and approved procedure.</li>
        <li><strong>Act and remember.</strong> It validates the operation, measures recovery and saves sourced memory for a later session.</li>
      </ol>
      <p className="quiet-note">Current scope: synthetic company data and two supported operations in the included Go service simulator. Company questions use current sources. Arbitrary production actions and external company integrations are not connected.</p>
    </section>
    <section aria-labelledby="module-heading"><h2 id="module-heading">Six modules, one product</h2><div className="module-grid">
      {MODULES.map(module => <button className="panel module-card" key={module.name} onClick={() => setView(module.view)}><module.icon size={23}/><h3>{module.name}</h3><p>{module.purpose}</p><span>Open module <ArrowRight size={14}/></span></button>)}
    </div></section>
    <div className="overview-summary"><span>{documents} current source documents</span><span>{data?.graph.nodes.length || 0} connected entities</span><span>{data?.workspace || "Connecting to workspace"}</span></div>
  </div>;
}
