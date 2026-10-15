# Understand and own the project

The supplied Graph Hacks rules require participants to understand their code,
graph model, queries, architecture and decisions. AI assistance must be disclosed.
This walkthrough is a learning and verification exercise. Completion must reflect
what you actually did and can explain.

## The explanation in one minute

We are building a company copilot with shared memory. Ordinary chat sessions lose
context, and remembered information can become stale. GraphOps stores company
relationships, sources, checkpoints and evidence in FalkorDB. An agent retrieves
the relevant context, performs supported work through validated tools, measures
the result, and saves memory for a fresh session.

Our action demonstration uses a synthetic checkout company with real HTTP
services. Checkout fails because a downstream service fails. The graph helps
choose the reachable cause and the current company procedure. A new resolver
session continues from the saved graph state. Another session can retrieve the
result with a source, revision and applicability label.

## 1. Company knowledge

**Open:** Start here -> Company knowledge. Read `graphops/company/service.py`
and `graphops/company/repository.py`.

Import a synthetic policy, ask about it, edit its text, and ask again. Inspect
both source revisions. Record whether the answer used the current policy.

Be able to explain: a Document points at its current revision; Revision nodes
preserve older payloads. Imported reference text cannot authorize a recovery.

## 2. Graph

**Open:** Connected graph. Read `graphops/graph/topology.py` and `QUERIES.md`.

Follow `gateway -> orders -> payments`. Find the service owner and attached
documents. Inspect the source of a relationship.

Essential query:

```cypher
MATCH p=(:Service {id:$service})-[:DEPENDS_ON*1..8]->(:Service)
RETURN [n IN nodes(p) | n.id], [r IN relationships(p) | r.source]
```

Be able to explain: this finds reachable dependencies and their provenance. A
failed service outside those paths is not a supported cause for this incident.
The traversal is bounded. Live HTTP measurements are also required.

## 3. Agent

**Open:** Agent tasks. Read `graphops/agents/runner.py` and `catalog.py`.

Enable Pause at handoff and run an LLM investigation. Read the visible tool
calls and checkpoint. Resume and compare investigator/resolver session IDs.

Be able to explain: the model selects tools; MCP exposes a role's capabilities;
the backend validates requests. A textual claim cannot create a successful
recovery. Sessions have bounded model and tool-call budgets.

## 4. Actions

**Read:** `graphops/actions/policy.py`, `tools.py` and `lab/main.go`.

Observe the failed target, the prepared plan and the HTTP measurements after
recovery. Retire a procedure and run another incident. Confirm that execution is
blocked. Publish a supported procedure and resume.

Be able to explain: the backend checks path, procedure version, precondition and
plan ownership. The Go simulator saves operation IDs so replay can reuse the
same effect. Graph and lab state are separate stores; this is not a distributed
transaction. There are no connected production action adapters.

## 5. Memory

**Open:** Memory navigator. Read `graphops/memory/navigator.py`.

Inspect an episode, procedure and health fact. Wait for a health observation to
expire. Change a source revision and inspect the retrieval labels again.

Be able to explain: episodes describe past events; procedures require matching
preconditions and current runbooks; health facts expire. Cache entries speed up
retrieval briefly. Current checks still validate actions. We do not claim that
these checks eliminate all hallucinations.

## 6. Workspace

**Read:** `web/server.ts`, `web/api/routes/`, `graphops/runtime/worker.py`
and `web/src/app/WorkspaceContext.tsx`.

Run System verification, download a report, stop/resume an incident, and inspect
history. Export a backup. Use a new workspace when checking restoration.

Be able to explain: TypeScript serves the app and HTTP API; a persistent Python
worker owns agent jobs; progress streams and polling update React. FalkorDB holds
durable graph state, and a file holds simulator operation state. A complete
backup includes both. The current shared token is not per-user authorization.

## Why these languages?

| Technology | Our reason |
|---|---|
| TypeScript | UI contracts, interactive pages, HTTP routes and streamed progress |
| Python | Agent loop, model transports, MCP capabilities and graph policies |
| Go | Concurrent service listeners and persisted controlled recovery effects |
| Cypher / FalkorDB | Relationship traversal, source retrieval and durable connected state |

## Participant record

Complete these with actual observations and contributions before submission:

- [ ] I can draw the graph schema and explain the essential path query.
- [ ] I verified a source edit and checked the updated answer against its source.
- [ ] I inspected a handoff and resumed it in a fresh session.
- [ ] I demonstrated a blocked action and explained the guard that rejected it.
- [ ] I explained memory expiry, source changes and the limits of citation checks.
- [ ] I reviewed the code for one module and made a deliberate contribution.
- [ ] I recorded my actual work and verification in PROVENANCE.md.
- [ ] Each teammate can explain the part they contributed and its interfaces.

Keep failed checks and limitations in the evidence. Do not claim exercises or
understanding on behalf of another participant. A document alone is not evidence
that the team understands the implementation.
