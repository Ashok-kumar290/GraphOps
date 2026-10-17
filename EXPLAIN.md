# Explaining GraphOps: a one-page guide for judge questions

Read this aloud once, then try answering each question below without looking.

## In one sentence

GraphOps is a company copilot whose agents fix incidents only when the FalkorDB
graph, the current company procedure and a fresh measurement all agree, and whose
separate sessions share sourced memory through the graph.

## The graph model

```
(Project)-[:USES]->(Service)
(Service)-[:DEPENDS_ON]->(Service)          gateway -> orders -> payments; analytics is unconnected
(Team)-[:OWNS]->(Service)
(Team)-[:HAS_EXPERTISE]->(Expertise)-[:KNOWS]->(Service)
(Service)-[:HAS_DOCUMENT]->(Document)-[:HAS_REVISION]->(Revision)   runbooks, decisions, tickets, notes
(Service)-[:HAS_MEMORY]->(Memory)           episodic, procedural, semantic
(Incident)-[:HAS_SESSION]->(Session)-[:EMITTED]->(Event)<-[:HAS_EVENT]-(Incident)
(Incident)-[:HAS_PLAN]->(Plan)
```

Company structure is small; most nodes are the agents' own record (events,
sessions, memories, plans). See [QUERIES.md](QUERIES.md) for the full list.

## The four queries to know

1. **What can be the cause?** `MATCH p=(:Service {id:$service})-[:DEPENDS_ON*1..8]->(:Service) RETURN ...`
   Only services on these paths are eligible. Analytics never appears.
2. **What does the company allow?** `MATCH (:Service {id:$id})-[:HAS_DOCUMENT]->(d:Document) RETURN d.payload`
   The current runbook's action and precondition must match the measured fault.
3. **What did the last session do?** `MATCH (t:Incident {id:$id})-[:HAS_EVENT]->(e:Event)<-[:EMITTED]-(s:Session) ...`
   A resolver starts from saved events, not from a chat summary.
4. **Only one writer wins.** `MATCH (t:Incident {id:$id}) WHERE t.version=$version SET ..., t.version=t.version+1`
   Compare-and-set; 50 forced races had exactly one winner every time.

## How one incident runs

1. **Investigator** (one model session, its own MCP tool process) measures services,
   reads graph paths, and separates a service's own error from inherited failures.
2. It calls `handoff_target`. The **backend** accepts it only if the target is on the
   graph path and fails with its own error. The handoff is saved in FalkorDB.
3. **Resolver** (a new session) reads the handoff, memory and current runbook, then
   calls `prepare_recovery`. The **backend** builds the plan; the model only passes
   back its `plan_id`.
4. `execute_recovery` re-checks the graph path, runbook revision and a fresh
   measurement, then acts once, using an operation ID the service records.
5. If checkout is fixed: ticket closed, three memories saved. If the fix worked but
   checkout still fails: never "resolved"; a linked follow-up incident starts.

## Likely questions

**What would break without FalkorDB?** Everything that decides: eligible causes,
handoffs, procedure checks, memory and the resolver's starting point. Removing one
`DEPENDS_ON` edge blocks recovery with zero actions; that is a measured test.

**Why two agents instead of one?** The handoff forces evidence into the graph, so a
fresh session (or a different model, or a person) can continue without trusting a
previous conversation. It also makes every step inspectable.

**How do you stop hallucinated actions?** The model chooses; the backend decides.
Each step offers only valid tools, plans are built by the backend, and every action
is re-checked against the graph and live measurements. Text alone saves nothing.

**What about prompt injection and poisoned memory?** Sources are labelled as data;
memory keeps source, revision and verification status and never authorises an
action. Both cases pass, and the model did not even try the planted target.

**Does it depend on Qwen?** No. Any provider works, including any OpenAI-compatible
endpoint. `certify` checks a model on all twelve cases; four models were tested.

**How does it compare with existing agents?** LangGraph's ReAct agent on the same
model and cases passed 7/12 (6/12 with a graph query tool), each sending 6 unsafe
fix requests; GraphOps passed 12/12 with none. GraphOps is slower and uses more
tokens; that is the price of the checks.

**What is the memory navigator?** Your idea: instead of loading everything a past
session saw, a new session gets a small packet with sources, revisions and labels
(active, historical, unverified). It recalled exact past evidence 6/6 with about a
third of the tokens of full history.

**What is real and what is simulated?** The company and its services are synthetic.
The model calls, FalkorDB queries, MCP sessions, HTTP health checks and recovery
operations are real.

**Why Python, TypeScript and Go?** Python for agents and MCP tools; TypeScript and
React for the API, streaming and interface; Go for small concurrent services with
persisted, idempotent recovery operations.

**What are the limits?** Synthetic company, two recovery operations, one agent job
per server, a shared access token instead of per-user accounts, and benchmarks of
one run per case.

**Who built what?** Answer truthfully: your decisions (tracks, the memory navigator,
local open-source models, the language split, the product direction, model
independence, hard cases, benchmarks, the judge check) and the AI assistance
disclosed in [PROVENANCE.md](PROVENANCE.md).
