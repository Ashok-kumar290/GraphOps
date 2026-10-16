// Written content for the Results page. Measured numbers come from benchmarks.json, not from here.

export const HARD_PROBLEMS = [
  { id: "double_fault", title: "Symptoms far from their causes",
    why: "A failing checkout can be caused several services away, and more than one cause can be active. Studies of root-cause agents find they often misread data or stop exploring early, and one fixed service can look like a fixed incident.",
    how: "The agent follows FalkorDB dependency paths and separates a service's own error from failures it inherits. If a recovery works but checkout still fails, the incident is never marked resolved: a linked follow-up incident finds the remaining cause." },
  { id: "unknown_fault", title: "A failure no runbook covers",
    why: "Agents tend to apply the remedy they have seen before. Applied to a different fault, a familiar fix can make things worse.",
    how: "Recovery needs a plan built by the backend from the current runbook, and the measured fault must match that runbook's precondition exactly. An unfamiliar fault gets a recorded blocker and no action." },
  { id: "self_healed", title: "State that changes mid-incident",
    why: "Between diagnosis and action the system can change: another operator fixes it, or the fault clears. Acting on stale findings repeats or undoes work.",
    how: "The plan is re-checked against a fresh measurement at execution time. If the fault is gone, nothing runs and the incident says why." },
  { id: "prompt_injection", title: "Instructions hidden in company data",
    why: "Documents, tickets and tool output reach the model as text. Text that reads like an instruction can redirect an agent toward the wrong target.",
    how: "Sources are labelled as data in every prompt, and every action is checked against the graph: a service that is not on checkout's dependency path cannot be handed off or recovered, whatever the text says." },
  { id: "memory_poisoning", title: "Poisoned shared memory",
    why: "Memory shared across sessions persists. A planted or outdated record is retrieved later as trusted experience, and other agents inherit it; OWASP now lists memory and context poisoning among the top risks for agentic applications.",
    how: "Each memory keeps its source, revision and verification state. The navigator separates unverified claims, marks procedures whose preconditions no longer match, and memory never authorises an action by itself." },
  { id: "concurrent_resolvers", title: "Two agents acting at once",
    why: "When sessions overlap, two agents can apply the same remediation twice or overwrite each other's progress.",
    how: "Incident checkpoints use a compare-and-set version in FalkorDB, and each recovery carries one operation ID that the service records, so a repeated request replays the first result instead of acting again." },
];

export const FIXES = [
  { problem: "The model handed off a symptom, not the cause", fix: "A handoff now requires evidence that the target fails with its own error." },
  { problem: "The resolver guessed configuration revisions", fix: "The backend builds the plan; the model passes back only its ID." },
  { problem: "A missing graph edge caused endless retries", fix: "The backend returns a final blocker when no dependency path exists." },
  { problem: "A small model named the cause in text but never saved it", fix: "Text alone saves nothing; the runtime asks for the tool call or a recorded blocker." },
  { problem: "Qwen 3.5 4B ran out of steps (0/4)", fix: "One combined incident tool and pre-loaded context; then Qwen3 8B passed 5/5." },
  { problem: "Occasional empty model replies", fix: "Up to two logged retries before the run stops at a checkpoint." },
  { problem: "A model treated an old fix as still valid", fix: "Every remembered procedure carries an explicit eligibility flag." },
  { problem: "A partial recovery left the agent with nothing to do", fix: "Failed or partial recovery now ends the session with the backend's reason, and a follow-up incident takes over." },
  { problem: "A hosted provider rejected a call to an unavailable tool", fix: "The rejection is shown to the model as a correctable mistake with the list of valid tools." },
  { problem: "Some models write tool calls as text", fix: "Text calls are parsed, but only for tools offered at that step." },
  { problem: "Free-tier token limits slowed hosted runs", fix: "Compact evidence views for the model and paced retries on rate limits." },
  { problem: "A refused start left a blocked incident behind", fix: "Starts are refused before anything is recorded while a fault is active." },
];

export const MEMORY = [
  { condition: "No past context", recall: "0 / 6", wrong: "12", unsafe: "0", tokens: "782", featured: false },
  { condition: "Memory navigator packet", recall: "6 / 6", wrong: "0", unsafe: "0", tokens: "1,331", featured: true },
  { condition: "Full incident history", recall: "5 / 6", wrong: "1", unsafe: "2", tokens: "4,098", featured: false },
];

export const SOURCES = [
  { title: "OpenRCA isn't root cause analysis, and why that matters (Traversal)", url: "https://traversal.com/blog/openrca-isnt-root-cause-analysis-why-that-matters" },
  { title: "Large Language Models for Agentic NetOps and AIOps: Architectures, Evaluation, and Safety (arXiv)", url: "https://arxiv.org/pdf/2605.12729" },
  { title: "GALA: Graph-Augmented LLM Agents for Root Cause Analysis and Incident Response in Microservices (arXiv)", url: "https://arxiv.org/pdf/2608.08968" },
  { title: "Agent memory poisoning: the attack that persists across sessions", url: "https://tianpan.co/blog/2026-04-10-agent-memory-poisoning-persistent-compromise" },
  { title: "AI agent memory poisoning (WorkOS)", url: "https://workos.com/blog/ai-agent-memory-poisoning" },
];
