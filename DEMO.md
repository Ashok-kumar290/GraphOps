# GraphOps recording plan

Target roughly four minutes for the main story, with a short optional appendix.
This is our editing plan, not a verified organizer video-length limit. The
signed-in submission form and its upload constraints still need review.

Use the actual running app and recorded measurements. Label cuts or accelerated
waiting time. Keep the task ID, execution mode and relevant source revisions
visible. The recording itself has not been made yet.

## Prepare

1. Start the app with `start.ps1` and open http://localhost:8080. With default
   Docker setup, use http://localhost:8081 instead.
2. Check **System & backups** and run **Run system checks**. Use Agent LLM with
   the configured local Qwen3:8b model. Availability and verified inference are
   separate states.
3. Confirm gateway, orders and payments are healthy and the worker is idle.
   Analytics may intentionally remain unhealthy. Resume unfinished work before
   starting another incident.
4. Open a second terminal with `.\graphops.ps1 monitor`. Record the product UI
   for the main story; the CLI is useful for showing the same saved job and
   real process progress.
5. Read [WALKTHROUGH.md](WALKTHROUGH.md). Each presenter should perform the
   parts they will explain. Record actual team contributions in PROVENANCE.md.

The latest [connected CLI rehearsal](evidence/judge-cli-rehearsal.json) passed
both supported scenarios with real Qwen3:8b inference. To repeat it before
recording, run `graphops.ps1 demo --scenario config` and then
`graphops.ps1 demo --scenario worker`. Each drill creates a company question and
a new incident, injects a synthetic fault, recovers it and checks its own saved
evidence. A successful CLI rehearsal does not complete the browser review.

## Main story

| Time target | Show | Narration draft |
|---|---|---|
| 0:00–0:20 | Start here; project name | “GraphOps is a company copilot with shared memory. A new session needs the current company context, the previous session’s evidence, and a way to check whether remembered information still applies.” |
| 0:20–0:55 | Start guided walkthrough → Ask; open a cited source | “We start with ownership and the current procedure. Company documents and their revisions live in FalkorDB. This answer cites retrieved source locations; we can inspect the actual source.” |
| 0:55–1:15 | Connected graph; gateway → orders → payments; separate analytics | “Checkout depends on orders, which depends on payments. The agent queries these directed relationships to determine eligible causes, then uses live HTTP observations to distinguish a direct failure from a propagated symptom.” |
| 1:15–1:50 | Find the cause → Investigate only; real tool progress and saved handoff | “The investigator uses role-bound MCP tools and saves its supported cause and evidence. We pause here, before recovery. The handoff is stored in the graph.” |
| 1:50–2:25 | Resume in new session; different session IDs; HTTP 503 → 200; ticket closure | “A fresh resolver session reads that checkpoint, memory and the current runbook. The backend checks graph reachability, procedure revision and configuration before executing the supported operation. The result is measured from the services.” |
| 2:25–2:55 | Memory navigator filtered to this incident; episode, procedure and health fact | “The result becomes sourced memory for another session. Episodes describe past events. Procedures have preconditions and runbook versions. Health facts expire, so a remembered healthy state does not replace a current observation.” |
| 2:55–3:40 | Company knowledge: retire the payments procedure, run another config incident, show the blocker | “Changing company knowledge changes what the agent may do. With the procedure retired, plan validation rejects recovery. The incident remains blocked and no recovery effect is authorized. Publishing a supported procedure allows this same incident to resume.” |
| 3:40–4:00 | Report, actual evidence IDs, architecture/track summary | “The same product connects company knowledge, agent decisions and cross-session state. TypeScript provides the UI and API, Python runs the agents and MCP tools, Go provides the controlled services, and FalkorDB stores the connected context and durable evidence.” |

Runtime varies; adjust the edit after the rehearsal. Complete the blocked
incident after recording: publish the supported procedure and resume it. The
app should end with healthy checkout, a closed ticket and an idle worker.

### What the presenter should say about the graph

“The graph is part of the action policy. Handoff and execution require a current
dependency path. If that path disappears after a plan is prepared, execution is
rejected. Company retrieval, checkpoints and shared memory also require
FalkorDB.” The isolated checks below demonstrate the edge-removal case.

### State the current scope

“This demonstration uses synthetic company data and two supported recovery
operations in our Go simulator. The HTTP requests, model inference, graph
queries and MCP sessions are real. Source-location checks do not verify every
claim in model prose. Our measured results are local checks, not general
reliability guarantees.”

## Optional clips

### Company knowledge changes across sessions

Use Company knowledge → **Load synthetic sample** → **Import source**, or edit
the existing sample rather than importing a duplicate filename. Ask:

> According to Synthetic support policy, what is the refund review window?
> Cite the exact source and revision.

Open **Edit source**, change the sample from 72 to 96 hours and **Save new
revision**. Ask again in a new session. Show both actual answers, their source
revisions, and the historical revision. Restore the source text afterward.
If the model answer does not match the source, retain and explain that result.

### Fresh application process

Pause an investigation at handoff. Stop and restart the app using its normal
launcher, reopen the incident from history and resume. Show the persisted task
ID, different resolver session and measured outcome. This tests application
restart persistence; it does not demonstrate recovery from every host failure.

### Explicit graph dependency proof

From this repository with its Python environment activated:

```powershell
python -m unittest tests.test_event.EventIntegration.test_seed_does_not_restore_deleted_dependency tests.test_event.EventIntegration.test_removed_dependency_blocks_prepared_recovery -v
```

These checks create their own graph and service fixture. They remove a required
edge and assert zero recovery operations, including when a valid plan existed
before the removal. The active team workspace is not used for the deletion.

## Recording deliverables still needed

- Record the actual UI, including the outcome and the blocked-action result.
- Complete a real-browser desktop/mobile and keyboard review first; automated
  DOM checks do not establish visual layout quality.
- Upload the video to the team's selected destination and verify judge access.
- Add the public video/repository links to `submission/entry.json` and review
  any format or length constraints in the actual submission form.

The narration above is a draft. Presenters should explain the code and design
in their own words after completing [LEARN.md](LEARN.md).
