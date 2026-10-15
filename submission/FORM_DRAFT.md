# Submission text draft

These are prepared answers, not a transcription of the signed-in submission
form. Field names, length limits and video constraints remain unverified. Adapt
the text to the form once it is accessible. Links and team details are tracked
in [entry.json](entry.json); the draft is not ready to submit while required
links and participant review remain pending.

## Name

GraphOps

## One-line description

A company copilot that carries sourced context into the next session.

## Short overview

GraphOps helps an agent continue company operations work with connected context
and sourced memory. In a synthetic checkout company, an investigator queries
FalkorDB relationships, measures service health and saves a supported cause.
A fresh resolver session reads the saved checkpoint, current company procedure
and memory, then performs a validated recovery and measures its result. Outcomes
become episodic, procedural and semantic memory with applicability labels.
Company questions use versioned sources; changing a procedure can block action.
The product includes a guided frontend, connected CLI, live monitoring, reports
and isolated backup restoration. Actions currently operate on the included
Go service simulator.

## Problem and approach

A new agent session can lose the context behind previous work. Even when
information survives, an old health observation or retired procedure may no
longer apply. Operational symptoms also propagate through dependencies, so the
visible failure can differ from the service that needs recovery.

GraphOps stores relationships, source revisions, checkpoints and evidence in
FalkorDB. The agent follows dependency and company links, while backend tools
validate current connectivity, runbook revision, preconditions and measured
health. Another session can read the saved state and retrieve bounded memory
packets with source and freshness information.

## Tracks entered

- Agents That Act on Connected Data
- Agent Memory and Coordination
- Company Brain

## Why FalkorDB is central

The application queries directed dependency paths to determine eligible causes
and validate recovery. The same graph connects services with owners, expertise,
documents and revisions, and holds incidents, session events, plans and memory.
Required-edge removal blocks both handoff and execution. Without graph access,
the core company retrieval, coordination and recovery-validation flows cannot
complete. See [QUERIES.md](../QUERIES.md) for the schema and essential Cypher.

## Technologies

- TypeScript, React and Node: guided UI, HTTP API, streamed progress and worker supervision.
- Python: model orchestration, role-bound MCP tools, graph policies and memory navigation.
- Go: concurrent controlled HTTP services and persisted recovery-operation results.
- FalkorDB and Cypher: connected context, traversal, versioned checkpoints and durable evidence.
- Ollama with Qwen3:8b: the measured local model configuration.
- Docker Compose: reproducible app, graph and simulator-state deployment.

## Demonstrated work

See [RESULTS.md](../RESULTS.md) and its linked reports for exact scopes and
retained failures. Separate checks cover live inference, graph-constrained
recovery, fresh sessions, changed runbooks, source revisions, state persistence,
CLI progress, frontend interaction logic and concurrent graph operations.
The current local setup and demonstration use synthetic company data.

## Limitations

The current product operates one shared workspace and one active job per server,
with two recovery operations in the controlled service adapter. Workspace graph
scopes are separated by configuration; per-user authentication and an end-user
tenant-management product are not implemented. Citation checks validate known
source locations, not claim entailment. The local results are finite checks.
Public hosting and real-browser visual review remain pending.

## AI assistance and event provenance

OpenAI Codex assisted with implementation, automated checks, review and
documentation. The pre-event preparation prototype and reused generic provider
adapter are disclosed in [PROVENANCE.md](../PROVENANCE.md). Event development
history records the graph implementation, policies, MCP workflow, simulator,
product interface and subsequent changes.

The team must add each member's actual contributions and complete its own code
review and technical walkthrough. Automated checks and this draft do not attest
participant understanding.

## Links to supply

- Public source repository: not supplied.
- Working demo video: not recorded/uploaded.
- Live app: not provisioned; complete local setup is in README.md.
- Registered team name and members: not supplied.

The official rules allow local setup when deployment is unavailable. Review
the final form before submitting. [Official rules](https://www.wemakedevs.org/hackathons/falkordb/rules)
