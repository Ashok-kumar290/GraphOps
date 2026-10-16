# Event development record

Event implementation started October 15, 2026, in `event/`.
The participant supplied the registered team name **TeamDesperateForGTA**.
Member names and individual contribution records remain to be supplied.

## Git attribution correction

On October 16, inherited local Git settings were found to attribute event
commits to an account the participant confirmed was not involved. The affected
author and committer identities were corrected to the repository owner, Ashok
Kumar, using the owner's GitHub noreply address. The original source trees,
messages and dates were preserved, including the initial GitHub license commit.
Earlier evidence may name the previous commit IDs; the
[commit ID mapping](evidence/history-attribution-map.json) links them to the
corrected history. This metadata correction does not verify individual team
contributions or replace the AI assistance disclosure below.

The parent workspace contains a CLI preparation prototype built before the
event. That prototype is not new event work. The team must disclose that history
and confirm eligibility with organizers if its reuse creates ambiguity.

## Reused infrastructure

`graphops/models/providers.py` (originally `graphops/provider.py`) is the generic Gemini/OpenAI-compatible HTTP adapter
copied from `../backend/runtime/model.py` on October 15. Its initial contents
were written before the event. It is infrastructure, not an original event
contribution. Any later changes are visible in this repository's history.

During the event, its retry handling was extended to honor bounded numeric
`Retry-After` headers from compatible providers; protocol tests cover that change.

The existing Python environment and Docker image are development infrastructure.
The parent `.env` can be loaded locally without copying or tracking credentials.

## New work

The event graph schema/store, controlled lab, role-bound MCP tools, agent
orchestration, web API and interface are implemented here during the event.
The preparation notes informed the incident concept. Git history records when
the new implementation was added; it does not establish organizer acceptance.

## AI assistance

OpenAI Codex assists with implementation and review. The participant team owns
requirements, technical decisions, verification and explaining the submission.
Record each teammate's actual contributions here before submission.

## Modular rebuild during the event

On October 15, the participant explicitly chose **a company copilot with shared
memory** as the product direction and requested a rebuild into understandable
modules. Codex implemented the module separation, domain repository interfaces,
MCP capability composition, API route modules, UI feature pages and walkthrough.
The existing event algorithms and service simulator were reused within that
rebuild; this is not a claim that every line was written again from scratch.

The participant had earlier proposed a memory navigator/cache approach and a
division of language responsibilities. Those ideas belong in the design history;
their timing must remain accurate. Participant code review, hands-on verification
and teammate contributions are still to be recorded by the people doing them.

The participant then requested a CLI connected to all modules with progress and
process monitoring. Codex implemented the connected HTTP client, operational
monitor, durable event pagination/replay, module commands and six-module CLI
demonstration. Recorded checks include real inference and actual CLI commands
against the running app; automated verification does not attest participant
understanding or replace their own recorded contribution/review.

After the CLI checks, the participant asked to continue with the frontend.
Codex implemented the guided five-step workflow, run-specific progress rules,
company answer/source presentation, navigation/focus improvements and the
associated DOM and live API/evidence-function checks. Native browser review
could not run because the computer-use helper and browser connection were
unavailable. Participant review and ownership of the code remain separate work.

Codex also prepared the recording plan, submission text draft, evidence map and
local source-archive helper. During package review, direct graph-edge-removal
checks were added for handoff and prepared-plan execution; the current 63-check
backend suite passed. The source package is a local review artifact, not a
claim of public publication, video completion or participant verification.

On October 16, following the participant's feedback that the product was hard
to understand, Codex simplified the homepage around the checkout example, moved
module details into an expandable section, added an incident-scoped progress
summary and made activity descriptions readable. Tool errors now display their
recorded message. DOM/pure-rule checks and live API/agent checks cover those
changes; browser layout review and participant understanding remain unverified.

Codex then added a reproducible fresh-context memory comparison and a packet
inspection panel showing the backend's actual limits and candidate flags. The
comparison retains two complete sets of raw model answers and failed overall
gates. It prompted explicit procedural eligibility metadata and exposed a
continuing gap between retrieved facts and model interpretation. The local
Ollama adapter now uses a configurable prefill batch of 64 for GPU-memory
headroom and accepts an explicit JSON schema for read-only comparisons. Current
action checks remain enforced independently of model replies.

Codex added a fresh-source Docker rehearsal that archives a selected committed
revision, excludes local configuration and generated artifacts, removes inherited
provider/workspace settings and runs the existing live product/CLI acceptance
driver in a unique Docker project. Docker now forwards the local model batch
setting; native first-time dependency installation uses the transitive lockfile.
This automated rehearsal does not attest participant understanding, browser
layout, native first-install behavior or a publicly hosted deployment.

At the participant's request to verify the entire frontend, Codex audited page
controls, fixed selection/access response races, connection-state handling,
duplicate submissions, source/history requests, downloads and graph keyboard
controls, and added an explicit control checklist. New DOM checks exercise those
states. A separate React integration driver operates the UI with real HTTP,
cookies, SSE, FalkorDB, Go, MCP and local Qwen inference in an isolated Docker
workspace. It captures JSON download delivery at the Blob/anchor boundary.
Actual browser layout, OS file picking and save-dialog behavior remain unverified.

A live frontend repeat exposed a document-reference gap: the model named a
retrieved document ID/revision, while only raw source URIs became citation buttons.
Codex added exact ID/revision resolution against retrieved records, captured
revision metadata and matching inspector links, with negative and actual MCP
regression checks. The 9/10 failure is retained alongside successful rehearsals.
Source reference resolution does not verify claim entailment.
