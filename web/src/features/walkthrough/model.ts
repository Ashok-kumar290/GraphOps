import type { Event, Workspace, View } from "../../shared/contracts";

export const WALKTHROUGH_STEPS = [
  {id: "company", title: "Ask the company", view: "company"},
  {id: "graph", title: "Follow the graph", view: "graph"},
  {id: "investigate", title: "Find the cause", view: "workspace"},
  {id: "recover", title: "Resume and recover", view: "workspace"},
  {id: "memory", title: "Inspect shared memory", view: "memory"},
] as const satisfies readonly {id: string; title: string; view: View}[];
export type WalkthroughStep = typeof WALKTHROUGH_STEPS[number]["id"];
export type Walkthrough = {
  workspace: string;
  step: WalkthroughStep;
  questionId: string | null;
  incidentId: string | null;
  questionEvents: Event[];
  incidentEvents: Event[];
};

// Traverse only actual service dependency records returned by FalkorDB.
export function dependencyPath(data: Workspace | null, from = "gateway", to = "payments"): string[] | null {
  if (!data) return null;
  const services = new Map(data.graph.nodes.filter(n => n.kind === "Service").map(n => [n.key, n.id]));
  const links = data.graph.edges.filter(e => e.kind === "DEPENDS_ON");
  const pending = [[from]];
  while (pending.length) {
    const path = pending.shift()!;
    if (path.at(-1) === to) return path;
    if (path.length > 8) continue;
    for (const edge of links) {
      const next = services.get(edge.to);
      if (services.get(edge.from) === path.at(-1) && next && !path.includes(next)) pending.push([...path, next]);
    }
  }
  return null;
}

export function walkthroughEvidence(data: Workspace | null, guide: Walkthrough) {
  const tasks = data?.workspace === guide.workspace ? data.tasks : [];
  const find = (id: string | null) => tasks.find(t => t.id === id) || (data?.workspace === guide.workspace && data.selected?.id === id ? data.selected : undefined);
  const question = find(guide.questionId);
  const incident = find(guide.incidentId);
  const questionEvents = data?.workspace === guide.workspace && data.selected?.id === guide.questionId ? data.events : guide.questionEvents;
  const incidentEvents = data?.workspace === guide.workspace && data.selected?.id === guide.incidentId ? data.events : guide.incidentEvents;
  const answer = [...questionEvents].reverse().find(e => e.kind === "session_finished" && e.role === "company");
  const citations = Array.isArray(answer?.data.citations) ? answer.data.citations.filter((s: unknown): s is string => typeof s === "string") : [];
  const sessions = (role: string) => [...new Set(incidentEvents.filter(e => e.kind === "session_started" && e.role === role).map(e => e.session))];
  const investigators = sessions("investigator"), resolvers = sessions("resolver");
  const separateSessions = investigators.some(i => resolvers.some(r => i !== r));
  const packet = incident?.target ? data?.memory[incident.target] : null;
  const memories = packet ? [...packet.active, ...packet.historical, ...packet.unverified].filter(m => m.task === guide.incidentId) : [];
  const path = data?.workspace === guide.workspace ? dependencyPath(data) : null;
  const recovered = !!incident && !incident.question && incident.job === "idle" && incident.status === "resolved" && !incident.last_error &&
    incident.outcome?.success === true && incident.outcome.after.http_status === 200 && incident.outcome.incident.http_status === 200 && incident.ticket_closed === true && separateSessions;
  const done: Record<WalkthroughStep, boolean> = {
    company: !!question?.question && !question.diagnostic && question.status === "answered" && question.job === "idle" && !question.last_error && answer?.data.mode === "llm" && citations.length > 0,
    graph: !!path,
    investigate: !!incident && !incident.question && incident.job === "idle" && !incident.last_error && ["handoff", "resolved"].includes(incident.status) && investigators.length > 0,
    recover: recovered,
    memory: recovered && ["episodic", "procedural", "semantic"].every(kind => memories.some(m => m.kind === kind)),
  };
  return {question, incident, answer, citations, investigators, resolvers, separateSessions, memories, path, done,
    complete: Object.values(done).every(Boolean)};
}
