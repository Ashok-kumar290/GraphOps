# GraphOps

**A company copilot with shared memory.**

Give it company knowledge and a task. It retrieves connected context from
FalkorDB, chooses supported steps, verifies the result and saves sourced memory
for another session. The included action demonstration investigates a checkout
failure, hands off to a fresh resolver, validates a current procedure, recovers
a simulated service and measures HTTP health.

## For judges: check it yourself in five minutes

1. Start the app (see [Windows development](#windows-development) or [Docker](#start-with-docker)).
2. Open **Judge check** (`http://localhost:8080/#verify`) and click **Run quick check**.
   It verifies FalkorDB, the services, a fresh MCP agent session and real model
   inference, then runs four live cases in isolated graphs: a payments fault, a
   retired runbook, injected instructions in company documents, and two root causes
   at once. Each case shows what should happen and what was measured. About three
   minutes with a local Qwen3 8B; your workspace is not changed.
3. Open **Results** (`#results`) for every case across four models, the comparison
   with LangGraph ReAct agents, and timelines of each tracked agent session.
4. Open **Agent tasks**, click **Run agent**, and watch the investigator hand off to a
   fresh resolver in the **Agents in this run** lanes.

The same checks run from a terminal: `.\graphops.ps1 certify --suite quick`.

| Qwen3 8B on a laptop GPU, every case run three times | GraphOps | LangGraph ReAct + graph tool | LangGraph ReAct |
|---|---|---|---|
| Core case runs (18) | **17/18** | 9/18 | 12/18 |
| Hard case runs (18) | **18/18** | 12/18 | 9/18 |
| Unsafe fix requests sent to services | **0** | 15 | 13 |
| Median seconds per case | 27 | 11 | 8 |

Scored only on measured effects. The same workflow passed 12/12 with hosted Qwen3.8 27B
and gpt-oss-20b on Groq. Raw reports are in
[evidence/benchmarks](evidence/benchmarks); see [Benchmarks](#model-independence-and-benchmarks).

## Understand the project first

Start with [the one-page explanation](EXPLAIN.md), [the six modules](MODULES.md) and [the developer walkthrough](LEARN.md).
The app opens on **Start here**. Select **Start guided walkthrough** for one flow
through a cited company answer, graph evidence, an investigator handoff, a fresh
resolver and the resulting shared memory. See [the five-step walkthrough](WALKTHROUGH.md).
The current company is synthetic and actions operate on the included Go lab.
The homepage explains the checkout example before exposing the module details.
Agent tasks includes a plain-language incident summary: find the cause, continue
in a fresh session, validate the procedure, recover checkout and save memory.
Each recorded step comes from the selected incident's state or evidence. The
activity log retains inspectable tool results and displays actual error messages.
Read [the requirements map](HACKATHON_REQUIREMENTS.md) before submission.
See [the memory comparison](MEMORY_COMPARISON.md) for a reproducible fresh-context
fact-recall experiment and its scoring limits.
Recording and submission drafts are in [DEMO.md](DEMO.md) and
[the submission package](submission/README.md).
See [the frontend control checklist](FRONTEND_CHECKLIST.md) for page-by-page
behavior, interaction coverage and remaining real-browser review.

Built for Graph Hacks, October 15–18, 2026. Intended tracks: **Agents That Act on
Connected Data**, **Agent Memory and Coordination**, **Company Brain**.
See [provenance and AI assistance](PROVENANCE.md).

## Start with Docker

Requirements: Docker with Compose, a current browser, and either local Ollama
with a tool-capable model or explicitly configured hosted model credentials.

Clone the public repository, then enter its directory:

```sh
git clone https://github.com/Ashok-kumar290/GraphOps.git
cd GraphOps
```

Copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell,
or `cp .env.example .env` in a Unix shell). Set a random
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
The local adapter requests a prefill batch of 64 to reduce temporary GPU-memory
demand. Set `GRAPHOPS_OLLAMA_BATCH_SIZE` to an integer from 32 to 1024 to tune it;
the requested context window remains 8,192 tokens. Inference timing depends on
available GPU memory, model loading and the provider's effective context limits.
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
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
.\build.ps1
.\launch.ps1
```

Open **http://localhost:8080**. Default binding is loopback. Build before
launching, and stop the app before rebuilding its running Go executable.
`launch.ps1` can use the parent workspace's existing Python environment locally.
For an independent checkout, create this repository's own `.venv` as above.

### Terminal workflow

Keep the app running and open a second terminal. The CLI connects to the same
server, active job, graph, MCP sessions and services used by the web interface:

```powershell
.\graphops.ps1 monitor
.\graphops.ps1 demo
.\graphops.ps1 investigate --scenario config
.\graphops.ps1 resume INC-RETURNED_ID
.\graphops.ps1 memory payments
.\graphops.ps1 ask "Who owns payments and which decision supports recovery?"
.\graphops.ps1 doctor
```

The monitor shows all six modules, service health, actual owned process metrics,
the current task and latest persisted event. Task commands stream saved session,
model, tool, action and memory events and finish at a checkpoint. Ctrl+C detaches;
use `stop TASK_ID` to request a checkpoint stop. `watch TASK_ID` replays saved
progress. Use `--mode scripted` explicitly for the deterministic baseline.

For a CLI-owned local worker, stop the web app and use `--standalone` before the
command. There is no automatic fallback that creates another service stack.
See [CLI.md](CLI.md) for module commands, monitoring, JSON output and remote access.

## Product workflows

- **Guided walkthrough:** five explicit steps with progress tied to the question
  and incident created during that walkthrough. Existing history cannot complete
  its steps. Leaving the guide does not stop a running server job.
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

## Model independence and benchmarks

The model chooses tools and causes; FalkorDB and the backend decide what is allowed.
The agent loop does not depend on one model:

- each step offers only the tools valid for the task's state, and providers that
  support it must call a tool;
- tool calls a model writes as text are parsed, for offered tools only;
- a provider's refusal of an unavailable tool is returned to the model as a
  correctable mistake, and empty replies are retried;
- a model that stalls twice is shown the valid next calls computed from current
  graph evidence;
- the model receives a compact view of evidence; full results stay in FalkorDB.

Any provider can be selected: local Ollama, Groq, OpenRouter, Gemini, or any
OpenAI-compatible endpoint (`GRAPHOPS_EVENT_PROVIDER=compatible`,
`GRAPHOPS_EVENT_BASE_URL`, `GRAPHOPS_EVENT_MODEL`). Check a model before relying on it:

```powershell
.\graphops.ps1 certify --suite all
.\graphops.ps1 certify --provider groq --model openai/gpt-oss-20b --suite hard
```

`certify` runs twelve cases, each in its own FalkorDB graph and Go service fixture:
six core cases and six hard ones built from failure modes reported for operations
agents (injected instructions, poisoned memory, a fault no runbook covers, two root
causes, a fault that clears mid-incident, and two resolvers racing). When a recovery
works but checkout still fails, the incident is never marked resolved; a linked
follow-up incident finds the remaining cause.

To compare architectures on the same model and cases, the LangGraph baselines live
in `bench/` (optional dependencies in `requirements-bench.txt`):

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-bench.txt
.\.venv\Scripts\python.exe -m bench.baselines --arch react --suite all
.\.venv\Scripts\python.exe -m bench.baselines --arch react_graph --suite all
.\.venv\Scripts\python.exe -m scripts.export_benchmarks   # rebuild the Results page data
```

Hosted results on Groq's free tier: Qwen3.8 27B and gpt-oss-20b each passed all twelve
cases. gpt-oss-120b passed 3 of the 4 cases it completed before the daily token limit;
its orders case ran out of steps.

## Company tools: Slack, Jira and GitHub

Records from Slack, Jira and GitHub become cited context in the company graph, linked
to the services and people they concern. Import from **Company knowledge → Connected
tools** or `.\graphops.ps1 connect slack|jira|github`. GitHub uses real public data;
Slack and Jira ship synthetic samples in each tool's real export format, and connect
live with your own credentials. Imported records never authorise an action. See
[CONNECTORS.md](CONNECTORS.md).

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
.\.venv\Scripts\python.exe -m tests.check_frontend
cd web
npm test
npm run build
```

The model evaluation uses real inference. The integration suite uses real
FalkorDB/HTTP/MCP plus explicitly simulated model protocol checks. `check_package`
defaults to the labeled scripted baseline; `--mode llm`, `check_product` and the
fresh-source rehearsal use actual model inference. Reports go into ignored `.runtime/reports`;
reviewed measurement summaries are in [RESULTS.md](RESULTS.md).

### Rehearse a fresh source checkout

With Docker running, Ollama serving `qwen3:8b`, and the Python development
dependencies installed, run:

```powershell
.\.venv\Scripts\python.exe -m tests.check_fresh_setup
```

This extracts **committed HEAD**, checks that local configuration and generated
files are absent, and builds the app from that source. It creates a unique Docker
project with separate graph/lab volumes on **localhost:8083**, then runs the live
product and connected CLI acceptance checks, including restart/resume and backup
restoration. Provider settings and credentials from the calling shell are removed;
the rehearsal explicitly uses local Ollama. The host Python environment only drives
the checks; app dependencies are installed inside the image. Existing Docker build
caches and the installed Ollama model may be reused. This is not a native Windows
first-install check or a browser visual review.

Use `--ref COMMIT`, `--port PORT`, `--model MODEL`, or `--batch 32` to select those
inputs. Reports, build logs and the exact source archive remain under ignored
`.runtime/fresh-setup/`. Containers stop at the end; isolated named volumes remain
for inspection. The report records their Compose project name. To remove a finished
rehearsal's containers/network, run `docker compose -p PROJECT -f compose.yaml down`;
only add `--volumes` when you intend to discard that rehearsal's data.

## Present limits

This is a working controlled incident demonstration, with synthetic company
records and two supported recovery operations. It does not control production
systems, prove general incident resolution, or eliminate hallucinations. Tool
validation prevents many unsupported actions; it does not establish that every
model-generated sentence is correct. The company evaluation checks cited source
fields, not full claim entailment.

One shared team workspace and one agent job are supported per server. Network
deployment uses a shared access token, not per-user authorization. Benchmarks are
three runs per case locally; the LangGraph baselines are faster and use fewer tokens per case,
which is the measured price of GraphOps's checks. Public hosting, demo recording
and the actual submission form are still pending. See [submission checklist](SUBMISSION.md).
