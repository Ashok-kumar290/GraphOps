# Submission preparation

The intended entry is **GraphOps**, targeting all three agent tracks. The public
rules require FalkorDB to be central, a public repository, reproducible setup,
documented graph/query details, and a demo. A deployment or complete local setup
is accepted by the published rules. Review the actual form once submissions open.
[Official rules](https://www.wemakedevs.org/hackathons/falkordb/rules).

## Implemented

- [x] New event workspace and separate Git history; preparation reuse disclosed.
- [x] Real FalkorDB graph, connected decision checks and controlled actions.
- [x] Durable sessions, evidence packets, shared memory and revision checks.
- [x] Sourced company context with ownership and procedure changes.
- [x] TypeScript interface/API, Python agents/MCP, concurrent Go lab.
- [x] Docker package checked across an app restart.
- [x] Local setup, architecture and essential Cypher documentation.

## Before submitting

- [ ] Confirm organizer acceptance of the disclosed preparation concept/adapter.
- [ ] Record each teammate's actual contributions in PROVENANCE.md.
- [ ] Publish this event repository to the team's chosen public GitHub repository.
- [ ] Inspect UI in a real browser, including mobile and keyboard interaction.
- [x] Run repeated model evaluations; preserve failures and report aggregate results.
- [ ] Compare memory versus no memory to measure the benefit of retrieval.
- [ ] Validate a hosted open-weight model with the team's private account key.
- [ ] Provision free hosting if account/capacity permits; verify HTTPS, SSE,
      access, restart persistence and live LLM recovery from the public URL.
- [ ] Record a short narrated demo covering graph cause selection, fresh-session
      recovery, memory reuse, changed company knowledge and a blocked action.
- [ ] Add the public repository, demo URL and video to the submission form.
- [ ] Review all form requirements and deadline shown in the signed-in portal.

## Suggested demonstration order

1. Explain the real problem: a new session lacks reliable operational context;
   stale memory and propagated errors can lead it to change the wrong service.
2. Show the graph path and the unrelated failing service. Enable Pause at handoff and investigate with an LLM.
3. End the investigator session, restart the app, and resume with the resolver.
   Show the persisted target, sources, measured HTTP change and ticket update.
4. Show memory labels after configuration changes, then another incident with
   a different recovery operation. Show actual evidence, not just model prose.
5. Change owner/procedure, ask the company agent and show the cited current
   revision. Retire a procedure and demonstrate zero recovery actions.
6. State measured results and current limits. Explain why removing FalkorDB
   blocks the product's decisions and actions.

Do not describe the synthetic lab as a production integration, a successful
small evaluation as general reliability, or the scripted comparator as an LLM.
