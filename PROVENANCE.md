# Event development record

Event implementation started October 15, 2026, in `event/`.

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
