import type { Event, Incident, Memory, Workspace } from "../../shared/contracts";

export const JOURNEY_STEPS = [
  {title: "Find the cause", description: "Agent 1 follows service dependencies and compares HTTP measurements."},
  {title: "Continue in a fresh session", description: "Agent 2 reads the saved findings from FalkorDB."},
  {title: "Validate the procedure", description: "The backend checks the graph, current runbook and configuration before authorizing recovery."},
  {title: "Recover and check checkout", description: "Run the supported operation, measure the result and close the synthetic ticket."},
  {title: "Save shared memory", description: "Keep the outcome, reusable procedure and sourced health observation for another session."},
] as const;

export function incidentJourney(data: Workspace | null, incident: Incident | undefined) {
  const events: Event[] = incident && data?.selected?.id === incident.id ? data.events : [];
  const sessions = (role: string) => [...new Set(events.filter(e => e.kind === "session_started" && e.role === role && e.session).map(e => e.session))];
  const investigators = sessions("investigator"), resolvers = sessions("resolver");
  const tools = events.filter(e => e.kind === "tool");
  const validation = tools.filter(e => e.data.tool === "prepare_recovery").at(-1);
  const outcome = incident?.outcome;
  const measured = outcome?.success === true && outcome.target === incident?.target &&
    outcome.after.service === incident?.target && outcome.after.http_status === 200 &&
    outcome.incident.service === incident?.service && outcome.incident.http_status === 200;
  const packet = incident?.target ? data?.memory[incident.target] : null;
  const memories: Memory[] = packet ? [...packet.active, ...packet.historical].filter(m =>
    m.task === incident?.id && m.service === incident.target && m.verified && !!m.source) : [];
  const kinds = ["episodic", "procedural", "semantic"];
  const saved = events.some(e => e.kind === "memory_saved" && e.data.service === incident?.target &&
    Array.isArray(e.data.kinds) && kinds.every(kind => e.data.kinds.includes(kind)));
  const done = [
    !!incident?.target && ["handoff", "executing", "resolved", "blocked"].includes(incident.status),
    investigators.some(i => resolvers.some(r => i !== r)),
    validation?.data.result?.ready === true || measured,
    measured && incident?.status === "resolved" && incident.ticket_closed === true && incident.job === "idle" && !incident.last_error,
    saved || kinds.every(kind => memories.some(m => m.kind === kind)),
  ];
  const firstPending = done.findIndex(value => !value);
  const active = firstPending < 0 ? done.length - 1 : firstPending;
  const complete = !!incident && done.every(Boolean) && incident.job === "idle" && !incident.last_error;
  const proofs = [
    done[0] ? `Saved cause: ${incident?.target}` : "No supported cause saved yet.",
    done[1] ? "Investigator and resolver have different session IDs." : "The resolver starts after the investigator saves its handoff.",
    validation?.data.result?.ready === false ? String(validation.data.result.reason || "The current procedure did not authorize recovery.") :
      done[2] ? "The recovery plan passed backend validation before execution." : "No approved recovery plan recorded yet.",
    measured ? `Recorded result: ${outcome!.target} HTTP ${outcome!.before.http_status} → ${outcome!.after.http_status}; checkout HTTP ${outcome!.incident.http_status}. ${incident?.ticket_closed ? "Ticket closed." : "Ticket completion pending."}` : "No successful recovery measurement recorded yet.",
    done[4] ? `Three memory types were saved for this incident. ${memories.length} matching records are in the current bounded packet.` : "No complete set of sourced memory is available for this incident yet.",
  ];
  return {investigators, resolvers, memories, complete, measured, active, steps: JOURNEY_STEPS.map((step, index) => ({...step, done: done[index], proof: proofs[index]}))};
}
