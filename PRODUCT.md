# Operating GraphOps

## Working scope

GraphOps is a shared team application for a controlled incident environment.
The included company is synthetic. Four Go HTTP services form a dependency
graph; payments configuration and orders worker failures have supported recovery
operations. Analytics is an unrelated failure that must not be changed.

The complete local stack uses React/TypeScript, Node, Python, actual stdio MCP,
FalkorDB and Go. Qwen3:8b runs through local Ollama without a hosted API key.
The public VM package uses the same application, with an explicitly configured
model provider. There is no silent fallback to the scripted baseline.

## Daily workflow

1. Run `start.ps1`, then open http://localhost:8080. If a shared access token is
   configured, enter it. All authenticated viewers share this workspace.
2. Open **System & backups**. Readiness checks connections and model availability.
   **Verify model + MCP** also performs an actual inference request and a fresh
   MCP round trip. An available model is not shown as verified inference.
3. In Workspace, select a scenario and **Agent - LLM**, then Run agent. Default
   operation investigates, saves a graph handoff, starts a fresh resolver and
   measures recovery. **Pause at handoff** lets you resume manually.
4. Inspect tool evidence, HTTP measurements and the graph. Download the report
   to retain the incident checkpoint, sources and event records.
5. A stop request takes effect at the next checkpoint after an in-flight model
   request or tool operation. It cannot undo an already executed operation.
   Resume reloads the saved checkpoint and retains the operation's idempotency ID.

## Company sources

Company knowledge supports plain text and Markdown, including a synthetic sample
policy. Select a service, title, type and filename, then import. Each source is
limited to 16,000 characters; each service accepts 16 imported reference sources.
PDF, office documents and external connector synchronization are not implemented.

Search matches current document titles and text. Edit an imported source using
its current revision; a stale edit receives HTTP 409. Previous revisions remain
inspectable. Ownership and approved procedure controls update their own versioned
records. Imported documents always remain reference material and cannot authorize
an action or replace a recovery procedure.

Company questions use the selected service. The model can search and read
source pages through MCP. Citation validation rejects unknown source locations;
it does not check that every sentence follows from a cited source.

## Persistence and failure recovery

- Node supervises the Python worker and reconnects after a worker exit. It does
  not automatically repeat interrupted effects; resume the saved incident.
- A handoff survives app recreation. Graph records and the lab's saved operation
  state live in persistent volumes in Docker, or FalkorDB plus `.runtime` locally.
- A failed model request becomes a visible interrupted run. Check System status,
  restore the provider connection, then resume. One agent job runs at a time.
- The page polls every three seconds as well as receiving streamed updates.
  Graph failures remain visible and do not count as successful agent runs.
- Database snapshots use the configured Redis save interval. An abrupt host
  failure can lose changes since the last snapshot.

## Backup and restore

Download a backup from System & backups while no job is running. It contains
graph nodes, relationships, company source text, incidents, events, memory,
plans and the controlled services' state. Provider keys are excluded. Store the
file as company data. Backups are limited to 25,000 nodes and 50,000 relationships.

Restore only into a new workspace. Stop the web app before using CLI commands
that own the same lab ports. In an independent checkout with its own environment:

```powershell
.\.venv\Scripts\python.exe -m graphops.cli backup .\workspace-backup.json
.\.venv\Scripts\python.exe -m graphops.cli --workspace restored-demo --port 9065 restore .\workspace-backup.json
.\.venv\Scripts\python.exe -m graphops.cli --workspace restored-demo --port 9065 status
```

Restore refuses an existing workspace or data directory. Endpoint ports are
remapped to the new local lab. Restored semantic health claims are marked
unverified until measured again. For the web app, set `GRAPHOPS_WORKSPACE` and
`GRAPHOPS_LAB_PORT` to the restored values and restart. Keep graph and lab state
together; copying one store alone is not a complete recovery.

## HTTP interface

JSON endpoints are under `/api`. Send authenticated writes from the same origin
with `Content-Type: application/json` and `X-GraphOps: 1`.

| Method and route | Purpose |
|---|---|
| GET `/health` | Worker readiness and supervisor restart count |
| POST `/access`, `/logout` | Shared token login and cookie logout |
| GET `/workspace?task=ID` | Selected checkpoint, current company, graph and memory |
| GET `/events` | Server-sent progress events |
| GET `/readiness` | Graph, lab, model availability and last actual diagnostic |
| POST `/diagnostics` | Actual model and MCP verification job |
| POST `/incidents` | Start scenario; `pause_after_handoff` defaults false |
| POST `/resume`, `/cancel` | Resume or cooperatively stop a task |
| POST `/questions` | Answer a company question for a selected service |
| POST `/company` | Update owner or approved procedure status |
| GET, POST `/sources` | Read a document revision or import/update reference text |
| GET `/search?q=TEXT&service=NAME` | Search current company sources |
| GET `/history?q=TEXT&before=CURSOR` | Search/paginate persisted runs |
| GET `/reports?task=ID` | Download an incident report |
| GET `/backup` | Download the complete logical workspace backup |

Validation errors return 400; access failures 401/403; revision conflicts or
busy mutations 409; oversized request bodies 413; unavailable infrastructure
503. A background job's success is determined from its persisted result, not
the initial HTTP acceptance alone.

## Release boundaries

This version supports one shared team workspace and one agent job per server.
The shared token is not per-user authorization. Recovery controls only the
included Go lab; real Slack, Jira, cloud and production service adapters are not
implemented. Public hosting, browser visual review and submission artifacts
remain tracked in [SUBMISSION.md](SUBMISSION.md).

See [RESULTS.md](RESULTS.md) for measured checks, retained failures and limits.
The GitHub Actions workflow checks infrastructure and UI; live model acceptance
runs separately on a machine with the selected model. No remote CI run is claimed.
