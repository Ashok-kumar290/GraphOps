# Frontend functionality checklist

Seven pages expose six product modules. Their controls use the same workspace as
the connected CLI. Recovery actions operate on the synthetic Go lab.

**Functional verification:** 79 DOM/component/rule checks, plus a separate ten-flow
React rehearsal using real HTTP, cookies, SSE, FalkorDB, Go, MCP and Qwen3:8b.
See [measurements and evidence](RESULTS.md). A finite rehearsal does not guarantee
every future model answer.

The rehearsals include a retained 9/10 run: an answer cited the correct document
ID/revision, but the URI-only parser omitted its source button. Exact retrieved
ID/revision resolution and version-specific inspector links now cover that case.
The subsequent live run passed 10/10. See [the failure](evidence/frontend-controls-citation-failure.json)
and [the final rehearsal](evidence/frontend-controls-live.json).

**Pending:** real-browser desktop/mobile layout and pointer/keyboard review, OS
file-picker interaction and browser download/save delivery. Browser inventory was
empty, the in-app browser was unavailable and the native computer-use pipe was
unavailable. DOM checks do not replace that review.

## Controls and verification

| Area | Controls and effects | Verification |
|---|---|---|
| Navigation | Seven page buttons, six home module cards and home shortcuts open their pages; the title receives focus | DOM checks; live home/navigation flows |
| Links | Brand points to `/`; skip link points to main content | Source/link checks; actual browser navigation review pending |
| Access | Unlock rejects a bad token and loads the workspace with the correct token; Lock hides workspace controls | Live login/logout; DOM blank-input, late-response and selection cleanup checks |
| Refresh | Refresh workspace and Reconnect load current state; failures keep writes disabled and mark displayed records potentially stale | Live updates; DOM disconnect/recovery and response-order checks |
| Feedback | Dismiss command error or success notice; neither can clear the connection failure | DOM checks |
| Home | Start/continue guide, open incident workspace, open unfinished incident and expand module links | DOM checks; live guide and shortcuts |
| Guide | Five step selectors, Continue, Open current step/run, Leave, Finish and incident export | Complete live guide; DOM rejection of unrelated history and incomplete/blocked/interrupted evidence |
| Agent configuration | Scenario, execution mode and Pause at handoff change submitted arguments | DOM request checks; live payments handoff and automatic orders recovery |
| Agent work | Run agent, Investigate only, Resume in new session and Stop at checkpoint | Actual live model workflows, including same-incident continuation and a retired-procedure blocker |
| Agent evidence | Inspect recovery, graph records, activity entries, operation result and this incident's memory | Live inspectors; DOM descriptions and run-scoped evidence checks |
| Reports | Download incident report or this guide's incident | Real JSON response and named Blob/anchor capture; OS save delivery pending |
| Company questions | Service tabs choose context/target; execution mode and Ask submit that service | DOM service/mode checks; actual answer using changed source text and owner |
| Answers | Citation buttons open the answer's captured source revision; answer/session evidence opens its record | Live source/evidence inspection; DOM captured-revision and delayed-read checks |
| Company sources | Current/previous document cards and sidebar links expose sourced records | Live previous revision inspection; common inspector DOM checks |
| Administration | Update owner, Retire procedure and Publish supported procedure persist graph changes | Live owner update and blocked/repaired recovery; DOM feedback and draft-reset checks |
| Source import | Load synthetic sample and Import source save a reference without granting recovery authority | Live import; backend reference-policy checks |
| Local file | Read a local file fills title/filename/content and requires explicit import | DOM asynchronous file-read checks; actual OS picker pending |
| Source revisions | Edit loads current source; Save new revision includes its base revision; Cancel clears the draft | Live immutable revision round trip; DOM cancellation and preserved conflict draft |
| Source search | Search, result inspection and Clear search operate on current sources and captured revisions | Live search/inspection/clear; DOM stale-result and empty-result checks |
| Source validation | Empty input disables import; oversized/binary content errors remain visible; reads/saves prevent duplicate submission | DOM checks; backend size/type/conflict limits |
| Memory filters | Service tabs, text/type filters and Clear filters change the displayed packet and matching/retrieved counts | Live guide memory/type filtering; DOM service/empty-filter checks |
| Memory evidence | Cards, Inspect navigator packet and conflicting-claim evidence open selected records | Live packet/record inspection; DOM conflicts and eligibility metadata |
| Graph | Service selectors/dependency nodes choose context; entity and relationship controls inspect real records | Live graph controls; DOM actual-edge and Enter/Space checks |
| History | Search, Clear search, run buttons and audit rows load saved runs or inspect changes | Live searches, empty state, older-question routing and audit inspection |
| History pagination | Load older runs appends deduplicated results using the submitted query and cursor | Controlled API DOM checks, including changed input and out-of-order responses |
| System | Refresh status, Run system checks and Inspect latest verification check availability and real model/MCP behavior | Live diagnostics; DOM failure/retry and availability-versus-verification checks |
| Backup | Download workspace backup exports graph/lab state without provider keys | Live payload/Blob capture; restoration separately verified through CLI/package checks |
| Inspector | Close, Escape, backdrop and focus handling return to the page; a late read cannot reopen a closed drawer | DOM checks; live close controls throughout inspector flows |
| Updates | Authenticated SSE and bounded polling refresh health, checkpoints and memory | Real SSE in the React rehearsal; restart persistence in package checks |

## Fixes made during this audit

- Queue a refresh requested during another read; discard responses for an older
  selection/access session and hide the old run's controls while selection loads.
- Separate connection state from dismissible feedback. Hide workspace controls
  when locked and disable mutations while disconnected.
- Guard commands, file reads and source saves before React's next render.
- Preserve conflicting edits, reject stale source/history results and keep
  pagination attached to its submitted search query.
- Give requests a 35-second timeout and readable transport/JSON errors. Mutations
  are not automatically retried: acceptance may precede a lost response.
- Prepare named downloads once, show feedback and release their object URLs.
- Resolve explicit document ID/revision citations to their retrieved source and
  preserve that version in the inspector. Unmatched versions are not resolved;
  claim entailment is still unverified.
- Support keyboard graph controls, a scrollable history table, and wrapping
  narrow-screen forms/header controls. Visual review remains pending.

## Repeat

Install the documented development dependencies and start Docker/Ollama. From
the repository root:

```powershell
.\.venv\Scripts\python.exe -m tests.check_frontend
cd web
npm test
npm run build
```

The live driver refuses an occupied port **8084**, creates a unique `frontend-*`
workspace/Compose project, and stops its containers afterward. Named volumes stay
available for inspection. The normal localhost:8080 workspace is not its target.
The live suite is excluded from ordinary `npm test`; do not target an existing
team workspace. Reports remain under ignored `.runtime/reports/`.
