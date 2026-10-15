# Event development record

Event implementation started October 15, 2026, in `event/`.

The parent workspace contains a CLI preparation prototype built before the
event. That prototype is not new event work. The team must disclose that history
and confirm eligibility with organizers if its reuse creates ambiguity.

## Reused infrastructure

`graphops/provider.py` is the generic Gemini/OpenAI-compatible HTTP adapter
copied from `../backend/runtime/model.py` on October 15. Its initial contents
were written before the event. It is infrastructure, not an original event
contribution. Any later changes are visible in this repository's history.

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
