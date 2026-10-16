import React from "react";
import { ArrowRight, Check, CirclePause, LoaderCircle, ShieldAlert } from "lucide-react";
import { useWorkspace } from "../../app/WorkspaceContext";
import { incidentJourney } from "./journey";

export function IncidentStory() {
  const {data, selected: task, connectionError, locked, setView, setMemoryQuery, setMemoryKind} = useWorkspace();
  const incident = task && !task.question ? task : undefined;
  const story = incidentJourney(data, incident);
  const connected = !!data && !connectionError && !locked;
  const paused = incident?.job === "interrupted";
  const blocked = incident?.status === "blocked";
  const working = incident?.job === "running" && connected;
  const status = !incident ? "Ready to begin" : !connected ? "Connection interrupted" : paused ? "Paused at a checkpoint" : blocked ? "Needs attention" : story.complete ? "Recovery and memory recorded" : working ? "Agent working" : "Waiting for the next step";
  return <section className="panel incident-story" aria-labelledby="incident-story-heading">
    <div className="incident-story-header"><div><span className="eyebrow">THE INCIDENT, IN PLAIN LANGUAGE</span><h2 id="incident-story-heading">{incident ? "What happened in this run?" : "How the demonstration works"}</h2></div><span role="status" className={"story-state " + (paused || blocked || !connected ? "attention" : story.complete ? "complete" : "")}>{status}</span></div>
    <p className="incident-story-intro">{incident ? `${incident.id} · ${incident.mode === "llm" ? "Model chooses tools" : "Deterministic scripted baseline"}. Each completed step below is backed by this run's saved state or evidence.` : "Running an incident creates a deliberate checkout fault in the sample company. These are the steps you will follow."}</p>
    <ol className="incident-journey" aria-label="Incident progress">
      {story.steps.map((step, i) => {
        const current = !!incident && !story.complete && i === story.active && !step.done;
        const label = step.done ? "Recorded" : current ? !connected ? "Disconnected" : paused ? "Paused" : blocked ? "Blocked" : working ? "Working" : "Next" : "Waiting";
        return <li className={step.done ? "recorded" : current ? "current" : ""} key={step.title}>
          <span className="journey-number" aria-hidden="true">{step.done ? <Check size={16}/> : current && (paused || !connected) ? <CirclePause size={16}/> : current && blocked ? <ShieldAlert size={16}/> : current && working ? <LoaderCircle size={16} className="spin"/> : i + 1}</span>
          <div><div className="journey-title"><h3>{step.title}</h3><span>{label}</span></div><p>{step.description}</p>{incident && <p className="journey-proof">{step.proof}</p>}</div>
        </li>;
      })}
    </ol>
    {incident && <div className="incident-story-footer"><span>{paused ? "Your findings are saved. Use Resume in new session to continue." : blocked ? "Read the blocker below and update the required evidence or procedure before resuming." : "Open the activity log below for the exact tool calls and evidence."}</span>
      {story.steps[4].done && <button className="sample-source-link" onClick={() => {setMemoryQuery(incident.id); setMemoryKind("all"); setView("memory");}}>Inspect this incident's memory <ArrowRight size={14}/></button>}
    </div>}
  </section>;
}
