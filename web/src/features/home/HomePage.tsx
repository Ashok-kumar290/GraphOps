import React from "react";
import { ArrowRight, BookOpen, Network, Workflow, ShieldCheck, Layers3, LayoutDashboard } from "lucide-react";
import { useWorkspace } from "../../app/WorkspaceContext";
import type { View } from "../../shared/contracts";
import { dependencyPath } from "../walkthrough/model";

const MODULES: {name:string; purpose:string; view:View; icon:typeof Network}[] = [
  {name:"1. Company knowledge", purpose:"Documents, ownership and procedures become sourced context the agent can read.", view:"company", icon:BookOpen},
  {name:"2. Connected graph", purpose:"FalkorDB connects services, teams, sources, tasks and memory so relationships can guide decisions.", view:"graph", icon:Network},
  {name:"3. Agent", purpose:"The selected model chooses steps and tools. Each investigation and resolution has its own session.", view:"workspace", icon:Workflow},
  {name:"4. Actions", purpose:"Backend checks validate a current procedure, execute a supported operation and measure its result.", view:"workspace", icon:ShieldCheck},
  {name:"5. Shared memory", purpose:"The next session retrieves sourced facts, past outcomes and procedures with freshness labels.", view:"memory", icon:Layers3},
  {name:"6. Workspace", purpose:"Use the UI or CLI to start work, inspect evidence, resume a task and export a backup.", view:"system", icon:LayoutDashboard},
];

export function HomePage() {
  const {setView, setQuestion, setService, data, startWalkthrough, busy, locked, connectionError, walkthrough, openWalkthroughStep, choose} = useWorkspace();
  const documents = Object.values(data?.company || {}).reduce((n, c) => n + c.documents.length, 0);
  const checkoutReady = data?.health.find(h => h.service === "gateway")?.http_status === 200;
  const unfinished = data?.tasks.find(t => !t.question && t.status !== "resolved");
  const path = dependencyPath(data);
  const labels: Record<string, string> = {gateway: "Checkout gateway", orders: "Orders", payments: "Payments"};
  return <div className="product-overview">
    <section className="panel overview-intro story-intro">
      <div className="story-intro-copy">
      <span className="eyebrow">MEET GRAPHOPS</span>
      <h2>Fix a checkout failure. Keep the evidence for the next session.</h2>
      <p>GraphOps is a company operations assistant. One agent finds the cause, a fresh agent uses its saved findings to recover the service, and the result becomes shared memory.</p>
      <div className="product-actions">
        <button className="button primary" disabled={!data || busy || locked || !!connectionError || !walkthrough && !checkoutReady} onClick={() => walkthrough ? openWalkthroughStep(walkthrough.step) : startWalkthrough()}>{walkthrough ? "Continue guided walkthrough" : "Start guided walkthrough"} <ArrowRight size={15}/></button>
        <button className="button secondary" onClick={() => setView("workspace")}>Open incident workspace <ArrowRight size={15} /></button>
      </div>
      <p className="overview-guide-note">Starting the guide prepares a question. You choose when to run each step. The incident demo deliberately creates a fault in our controlled sample company.</p>
      {busy && <p className="overview-guide-note" role="status">An agent is working. Open the incident workspace to follow its progress before starting another walkthrough.</p>}
      {data && !checkoutReady && !walkthrough && <div className="overview-resume" role="status"><p>Checkout is already unhealthy. Resolve the existing fault before starting a new walkthrough.</p><button className="button secondary" disabled={busy} onClick={() => unfinished ? choose(unfinished.id, unfinished) : setView("workspace")}>{unfinished ? "Open unfinished incident" : "Inspect agent tasks"}</button></div>}
      </div>
      <div className="company-example" aria-labelledby="sample-company-heading">
        <span className="eyebrow">THE SAMPLE COMPANY</span>
        <h3 id="sample-company-heading">What does checkout depend on?</h3>
        <div className="sample-service-path" aria-label="Checkout dependencies from FalkorDB">
          {path ? path.map((name, i) => {
            const health = data?.health.find(h => h.service === name);
            return <React.Fragment key={name}>{i > 0 && <div className="sample-dependency"><ArrowRight size={16} aria-hidden="true"/><span>depends on</span></div>}
              <div className="sample-service"><span>{labels[name] || name}</span><small className={health?.http_status === 200 ? "text-mint" : health ? "text-coral" : ""}>{health ? `HTTP ${health.http_status}` : "Awaiting measurement"}</small></div>
            </React.Fragment>;
          }) : <p>{data ? "The graph has no checkout-to-payments path. Inspect connected graph before running the demonstration." : "Waiting for the company graph…"}</p>}
        </div>
        <p className="sample-explanation">A payments failure can also break orders and checkout. The agent follows these relationships and checks the services to locate the cause.</p>
        <button className="sample-source-link" onClick={() => setView("graph")}><Network size={14}/> Inspect the graph in FalkorDB <ArrowRight size={14}/></button>
        <div className="sample-scope">Synthetic company · real HTTP services · two supported recovery operations</div>
      </div>
    </section>
    <section className="panel overview-example">
      <span className="eyebrow">WHAT YOU WILL SEE</span><h3>One problem. Two agent sessions. A result you can inspect.</h3>
      <div className="story-preview">
        <article><span>01 / INVESTIGATE</span><h4>Find the cause</h4><p>The investigator reads company knowledge, follows dependencies and measures failures. It saves its findings before recovery.</p></article>
        <article><span>02 / CONTINUE</span><h4>A fresh agent picks up the work</h4><p>The resolver reads the saved handoff and checks the approved procedure. It performs the supported recovery and measures checkout again.</p></article>
        <article><span>03 / REMEMBER</span><h4>Keep what was learned</h4><p>Another session can retrieve the outcome, the procedure and sourced health observations. Revisions and expiry labels show what still applies.</p></article>
      </div>
      <button className="sample-source-link" onClick={() => {setService("payments"); setQuestion("Who owns payments, and which current procedure supports recovery? Cite your sources."); setView("company");}}><BookOpen size={14}/> Start with a company question <ArrowRight size={14}/></button>
    </section>
    <details className="module-explorer"><summary>Explore the six modules behind the demonstration</summary><div className="module-grid">
      {MODULES.map(module => <button className="panel module-card" key={module.name} onClick={() => setView(module.view)}><module.icon size={23}/><h3>{module.name}</h3><p>{module.purpose}</p><span>Open module <ArrowRight size={14}/></span></button>)}
    </div></details>
    <div className="overview-summary"><span>{documents} current source documents</span><span>{data?.graph.nodes.length || 0} connected entities</span><span>{data?.workspace || "Connecting to workspace"}</span></div>
  </div>;
}
