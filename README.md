# GraphOps

**A company copilot with shared memory.**

Give it company knowledge and a task. It retrieves connected context from
FalkorDB, chooses supported steps, verifies the result and saves sourced memory
for another session. The included action demonstration investigates a checkout
failure, hands off to a fresh resolver, validates a current procedure, recovers
a simulated service and measures HTTP health.

## Understand the project first

Start with [the six modules](MODULES.md) and [the developer walkthrough](LEARN.md).
The app opens on **Start here**, which explains the flow and links to each module.
The current company is synthetic and actions operate on the included Go lab.
Read [the requirements map](HACKATHON_REQUIREMENTS.md) before submission.

Built for Graph Hacks, October 15–18, 2026. Intended tracks: **Agents That Act on
Connected Data**, **Agent Memory and Coordination**, **Company Brain**.
See [provenance and AI assistance](PROVENANCE.md).

## Start with Docker

Requirements: Docker with Compose, a current browser, and either local Ollama
with a tool-capable model or explicitly configured hosted model credentials.

From this directory, copy `.env.example` to `.env`. Set a random
`GRAPHOPS_ACCESS_TOKEN` of at least 24 characters. Keep keys in `.env` locally.
For the current local candidate, install [Ollama](https://ollama.com) and run:

```sh
ollama pull qwen3:8b
docker compose up --build -d
```

Open **http://localhost:8081**, enter the token, and select **Agent · LLM**.
Open **Agent tasks**, then click **Run agent** to investigate and recover automatically. The resolver
starts in a fresh session after loading the saved handoff from FalkorDB.
Enable **Pause at handoff** only when you want to resume recovery manually.
The container expects Ollama at `host.docker.internal:11434`. Its model-list
endpoint was checked from Docker on this Windows machine; other OS configurations
may differ. If inference cannot connect, use the Windows development
route below or configure a hosted provider. Never expose Ollama publicly.

Select **Scripted baseline** for a deterministic infrastructure check with no
model credentials. This mode is explicitly labeled throughout the interface;
it is not evidence of model performance. No silent provider or mode fallback occurs.

Stop with `docker compose stop`. Named volumes preserve graph and lab state.
Do not delete them if you want to keep memory. Graph snapshots run every 60
seconds after changes; abrupt host failure may lose unsaved graph changes.

### Hosted open-weight model

In `.env`, explicitly select:

```dotenv
GRAPHOPS_EVENT_PROVIDER=groq
GRAPHOPS_EVENT_MODEL=qwen/qwen3.8-27b
GROQ_API_KEY=YOUR_PRIVATE_KEY
```

Restart the app after configuration changes. Groq is an optional deployment
candidate, not a measured speed or reliability claim. Its free API has limits.
The local candidate's measured results and failures are recorded in
[RESULTS.md](RESULTS.md).

## Windows development

Requirements: Python 3.13+, Node 24, Docker Desktop. Go can be built in Docker;
a local Go installation is optional. For the normal local start:

```powershell
.\start.ps1
```

This installs missing Python dependencies, starts an existing local FalkorDB
or creates a persistent one, starts Ollama, downloads the selected local model
if missing, builds changed assets, and launches **http://localhost:8080**.
The first model download needs an internet connection. Keep the terminal open;
Ctrl+C stops the app. Graph and controlled-service state remain on disk.
For a hosted provider, first use the hidden configuration prompt:

```powershell
.\.venv\Scripts\python.exe -m graphops.cli configure --provider groq
```

The launcher also recognizes the parent workspace's Python environment.
The manual development route follows. Start a FalkorDB instance on localhost:6379
(the parent preparation environment already provides one). A fresh standalone
development database can be started with:

```powershell
docker run -d --name graphops-dev-db -p 127.0.0.1:6379:6379 -v graphops-dev-db:/var/lib/falkordb/data -e "REDIS_ARGS=--save 60 1" falkordb/falkordb@sha256:107455e862a824e45e8e9f5a7fbfdf5e00a08b14e13eae2577c72fd9e3f59ba6
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\build.ps1
.\launch.ps1
```

Open **http://localhost:8080**. Default binding is loopback. Build before
launching, and stop the app before rebuilding its running Go executable.
`launch.ps1` can use the parent workspace's existing Python environment locally.
For an independent checkout, create this repository's own `.venv` as above.

### Terminal workflow

Stop the web app first; it owns the lab ports. These commands use the same
Python worker, actual MCP subprocesses, graph store and HTTP services:

```powershell
.\.venv\Scripts\python.exe -m graphops.cli investigate --scenario config --mode llm
.\.venv\Scripts\python.exe -m graphops.cli run --scenario worker --mode llm
.\.venv\Scripts\python.exe -m graphops.cli resume INC-RETURNED_ID
.\.venv\Scripts\python.exe -m graphops.cli memory payments
.\.venv\Scripts\python.exe -m graphops.cli ask "Who owns payments and which decision supports recovery?"
.\.venv\Scripts\python.exe -m graphops.cli doctor
```

Each CLI invocation creates a fresh process and reloads persisted context.
Use `--mode scripted` explicitly when checking the baseline.

## Product workflows

- **Workspace:** automatic incident recovery, optional saved handoff, stop at a
  checkpoint, resume, evidence inspection, and downloadable incident reports.
- **Company knowledge:** connected ownership and expertise, editable ownership
  and approved procedure status, source search, text/Markdown imports, source
  revisions, and questions grounded in the selected service's current sources.
- **Memory navigator:** inspect and filter past episodes, reusable procedures,
  current facts, unverified records, conflicts, and source validity checks.
- **Run history:** search persisted incidents, questions and system checks;
  load older runs and inspect the workspace change log.
- **System & backups:** graph/lab/model readiness, a real model and MCP check,
  and a full logical workspace backup. Restore into a new workspace with the CLI.

Synthetic company records are included. Imported reference documents can inform
answers but cannot authorize recovery or replace an approved procedure. A known
citation is checked against retrieved sources; claim entailment is not verified.
See [product operation and API](PRODUCT.md) for limits and recovery instructions.

## Judge walkthrough

1. Enable **Pause at handoff**, then investigate a payments configuration incident. The agent sees real failures in
   gateway → orders → payments, plus an unrelated analytics failure. Inspect
   the graph and recorded measurements. The cause must be `payments`.
2. Resume in a new session. The resolver reads the saved handoff, memory and
   current company procedure. It restores configuration, verifies target and
   gateway HTTP 200, and completes the ticket. Analytics must remain HTTP 503.
3. Disable **Pause at handoff** and click **Run agent** for an orders worker incident. It should investigate, recover and verify automatically. Recovery must use `restart_worker`, rather
   than repeat the previous payments action.
4. Open Memory navigator: inspect episodes, procedures, facts and source
   validity. Restart the app and confirm the records remain.
5. In Company knowledge, update ownership and ask about the new owner. Inspect
   the versioned source. Retire the payments procedure, run a new incident and
   resume it: recovery must be blocked. Publish a supported procedure and
   resume when appropriate. Previous source revisions remain inspectable.

## Architecture and language responsibilities

| Component | Technology | Responsibility |
|---|---|---|
| Interface and API | React, TypeScript, Node | Interactive evidence, HTTP endpoints, SSE progress |
| Agent runtime | Python | Model calls, bounded role loops, real MCP sessions, graph tools |
| Connected state | FalkorDB, Cypher | Paths, ownership, immutable source revisions, durable handoffs and memory |
| Controlled services | Go | Concurrent HTTP dependency checks, persisted idempotent recovery operations |
| Deployment | Docker Compose | App, private graph, durable volumes; Caddy for public HTTPS |

See [ARCHITECTURE.md](ARCHITECTURE.md), [QUERIES.md](QUERIES.md), and
[free hosting setup](deploy/README.md). Rust has no justified role in the
current implementation.

## Run checks

With FalkorDB and the compiled lab available, from this directory:

```powershell
.\.venv\Scripts\python.exe -m tests.run_checks
.\.venv\Scripts\python.exe -m tests.stress_graph
.\.venv\Scripts\python.exe -m tests.check_cli
.\.venv\Scripts\python.exe -m tests.evaluate_models --label my-model --cases config worker changed_runbook repeated company
.\.venv\Scripts\python.exe -m tests.check_package
.\.venv\Scripts\python.exe -m tests.check_package --mode llm
.\.venv\Scripts\python.exe -m tests.check_live_app
.\.venv\Scripts\python.exe -m tests.check_product
cd web
npm test
npm run build
```

The model evaluation uses real inference. The integration suite uses real
FalkorDB/HTTP/MCP plus explicitly simulated model protocol checks. Package checks
use the labeled scripted baseline. Reports go into ignored `.runtime/reports`;
reviewed measurement summaries are in [RESULTS.md](RESULTS.md).

## Present limits

This is a working controlled incident demonstration, with synthetic company
records and two supported recovery operations. It does not control production
systems, prove general incident resolution, or eliminate hallucinations. Tool
validation prevents many unsupported actions; it does not establish that every
model-generated sentence is correct. The company evaluation checks cited source
fields, not full claim entailment.

One shared team workspace and one agent job are supported per server. Network
deployment uses a shared access token, not per-user authorization. Public hosting,
hosted-model validation, browser visual review, demo recording and the actual
submission form are still pending. See [submission checklist](SUBMISSION.md).
