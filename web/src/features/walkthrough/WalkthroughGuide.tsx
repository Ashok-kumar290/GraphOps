import React from "react";
import { ArrowRight, Check, GitBranch, X } from "lucide-react";
import { useWorkspace } from "../../app/WorkspaceContext";
import { WALKTHROUGH_STEPS, walkthroughEvidence } from "./model";

export function WalkthroughGuide() {
  const {data, walkthrough: guide, openWalkthroughStep, leaveWalkthrough, busy, locked, connectionError, view, choose, download} = useWorkspace();
  if (!guide) return null;
  const evidence = walkthroughEvidence(data, guide);
  const index = WALKTHROUGH_STEPS.findIndex(s => s.id === guide.step);
  const current = WALKTHROUGH_STEPS[index], next = WALKTHROUGH_STEPS[index + 1];
  const connected = !!data && !locked && !connectionError;
  const task = guide.step === "company" ? evidence.question : evidence.incident;
  const instructions = {
    company: "Ask the prepared question below. Read the answer and open its cited sources before continuing.",
    graph: "Follow gateway → orders → payments. Analytics has no dependency path to checkout; its separate failure is not a cause on this path.",
    investigate: "Run the payments configuration scenario with Pause at handoff enabled. The investigator will save its measured cause without executing recovery.",
    recover: "Use Resume in new session below. The resolver must read the saved handoff and current procedure, then measure recovery before closing the ticket.",
    memory: "Inspect the records saved by this incident. An episode records the outcome, a procedure carries preconditions, and a health fact can expire.",
  };
  return <section className="panel walkthrough" aria-labelledby="walkthrough-heading">
    <div className="walkthrough-header">
      <div><span className="eyebrow">GUIDED WORKFLOW</span><h2 id="walkthrough-heading">One task, from company context to shared memory</h2></div>
      <button className="plain-icon" aria-label="Leave walkthrough" title="Leave guide; running jobs continue" onClick={leaveWalkthrough}><X size={18}/></button>
    </div>
    <nav className="walkthrough-steps" aria-label="Workflow steps">
      {WALKTHROUGH_STEPS.map((step, i) => <button key={step.id} aria-current={step.id === guide.step ? "step" : undefined}
        className={step.id === guide.step ? "current" : ""} onClick={() => openWalkthroughStep(step.id)}>
        <span className={evidence.done[step.id] ? "step-number done" : "step-number"}>{evidence.done[step.id] ? <Check size={13} aria-label="Evidence available"/> : i + 1}</span>{step.title}
      </button>)}
    </nav>
    <div className="walkthrough-body">
      <div className="walkthrough-instruction"><span className="subtle">Step {index + 1} of 5</span><h3>{current.title}</h3><p>{instructions[guide.step]}</p>
        {guide.step === "graph" && <div className="walkthrough-proof">{evidence.path ? evidence.path.join(" → ") : "No gateway-to-payments dependency path is available in the current graph."}</div>}
        {task && <p className="walkthrough-task"><GitBranch size={14}/> {task.id} <span>{task.job === "interrupted" ? "Interrupted — resume from its checkpoint" : task.status}</span><span>{task.mode === "llm" ? "LLM agent" : "Scripted baseline"}</span>
          {data?.selected?.id !== task.id && <button onClick={() => choose(task.id, task)}>Open this run</button>}</p>}
        {guide.step === "company" && evidence.citations.length > 0 && <p className="walkthrough-proof">Answer cites {evidence.citations.length} retrieved source location{evidence.citations.length === 1 ? "" : "s"}. Read the source to check the claim.</p>}
        {guide.step === "company" && evidence.question?.status === "answered" && !evidence.done.company && <p className="walkthrough-blocker">This step needs an LLM answer with retrieved source citations. The scripted baseline returns company context; it does not complete the model-answer step.</p>}
        {guide.step === "recover" && evidence.separateSessions && <p className="walkthrough-proof">Investigator and resolver have different saved session IDs.</p>}
        {guide.step === "recover" && evidence.investigators.length > 0 && <div className="walkthrough-session-proof"><span>Investigator <code>{evidence.investigators.at(-1)}</code></span><span>Resolver <code>{evidence.resolvers.at(-1) || "Starts when you resume"}</code></span></div>}
        {guide.step === "recover" && evidence.incident?.outcome && <p className="walkthrough-proof">{evidence.incident.outcome.target}: HTTP {evidence.incident.outcome.before.http_status} → {evidence.incident.outcome.after.http_status}. Gateway: HTTP {evidence.incident.outcome.incident.http_status}.</p>}
        {guide.step === "memory" && <p className="walkthrough-proof">{evidence.memories.length} records from this incident in the current memory packet.</p>}
        {!connected && <p role="status">Connection unavailable. Reconnect before continuing the walkthrough.</p>}
        {task?.status === "blocked" && <p className="walkthrough-blocker">Recovery is blocked. Read the validation reason and check the current company procedure before resuming.</p>}
      </div>
      <div className="walkthrough-actions">
        {view !== current.view ? <button className="button primary" onClick={() => openWalkthroughStep(guide.step)}>Open current step <ArrowRight size={14}/></button>
          : next ? <button className="button primary" disabled={!connected || busy || !evidence.done[guide.step]} onClick={() => openWalkthroughStep(next.id)}>Continue: {next.title.toLowerCase()} <ArrowRight size={14}/></button>
          : <button className="button primary" disabled={!connected || busy || !evidence.complete} onClick={leaveWalkthrough}>Finish walkthrough <Check size={14}/></button>}
        {guide.step === "memory" && evidence.incident && <button className="button secondary" disabled={!connected} onClick={() => void download("/api/reports?task=" + encodeURIComponent(evidence.incident!.id), evidence.incident!.id + ".json")}>Download this incident</button>}
        <small>{evidence.complete ? "All five steps have saved evidence from this walkthrough." : "Progress uses this walkthrough’s runs. Existing history is kept separately."}</small>
      </div>
    </div>
  </section>;
}
