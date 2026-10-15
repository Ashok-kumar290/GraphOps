# A guided task through GraphOps

Open the running app: **http://localhost:8080** for Windows development, or
**http://localhost:8081** with the default Docker setup. Unlock it if required.
Start here → **Start guided walkthrough**. Opening the guide does not start an
agent or inject a service fault.

If checkout is already unhealthy, open its unfinished incident and resume it
first. A new walkthrough starts with healthy checkout and an idle worker. The
company and services in this demonstration are synthetic.

## 1. Ask the company

The guide prepares a payments ownership/procedure question. Select **Ask**.
Read the saved answer and open its cited source locations. These buttons use
the source revision captured by that question, even if a document changes later.

Continue after a cited LLM answer is saved. Source-location checks do not prove
every claim: compare the actual text and revision. Scripted baseline is an
explicit alternative that returns context; it does not complete this model-answer
step. Company questions stay separate from incident/resolver summaries.

## 2. Follow the graph

Inspect `gateway → orders → payments` and the company relationships. The path
shown by the guide comes from directed service edges returned by FalkorDB.
The separate analytics fault is a distractor in this controlled company.

Continue to the investigation. Opening a graph or navigating steps does not
execute a recovery operation.

## 3. Find the cause

The guide prepares **Payments configuration**, **Agent LLM** and **Pause at
handoff**. Select **Investigate only**. Watch actual observations, graph tools
and the supported cause. Wait for the saved handoff, then continue.

If validation blocks work, inspect the reason and current company procedure.
Do not treat a blocker or an interrupted run as completed recovery.

## 4. Resume and recover

Select **Resume in new session**. The resolver reads saved context and validates
the procedure before acting. Inspect the separate investigator/resolver session
IDs and the measured HTTP change. This step requires successful recovery of the
target and gateway, a completed synthetic ticket, and an idle job.

## 5. Inspect shared memory

The memory view filters to this incident. Inspect its episode, procedure and
health fact, including source, revision and applicability. An expired fact moves
to historical memory; it remains evidence of a past observation. Filter counts
show matching / retrieved records, and **Clear filters** restores the full packet.

Download this incident's report. Finish the walkthrough after all five steps
have evidence. Older incidents cannot complete a newly started guide.

## Leaving, reconnecting and reloading

Leaving the guide only closes its navigation. A running server job continues;
**Stop at checkpoint** is a separate action. Reconnect or use Run history to
open saved work. Reloading resets the guide's browser state while the graph's
tasks, events, company sources and memory remain saved.

## Recorded verification and remaining review

- 27 frontend DOM/unit checks cover navigation, the complete guided interaction,
  task-scoped evidence, old source revisions, keyboard dismissal, delayed source
  reads, unfinished incidents, resuming after recovery before ticket closure,
  and memory filtering. HTTP/EventSource are mocked.
- Seven live API checks with Qwen3:8b exercise a fresh question, persisted handoff,
  fresh resolver, measured recovery and memory, then apply the frontend's actual
  progress function to those responses. These are not browser interactions.
- TypeScript compilation and the production Vite build pass; the local server
  serves the generated JavaScript and CSS.
- **Visual desktop/mobile and real-browser keyboard review remain pending.**
  The native computer-use pipe was unavailable and the browser inventory was
  empty. DOM checks do not establish visual layout quality.

Reproduce the live API/progress check against an idle, healthy app with:

```powershell
python -m tests.check_guided_workflow --url http://127.0.0.1:8080
```

Use the repository's virtual-environment Python if it is not activated. The
check creates a synthetic question and incident in that app and saves reports
under `.runtime/reports/guided-frontend-*`.
