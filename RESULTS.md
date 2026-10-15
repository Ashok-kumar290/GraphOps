# Measured development results

Measurements are from October 15, 2026, on the developer's Windows laptop with
31.7 GB RAM and an RTX 4060 Laptop GPU with 8 GB VRAM. FalkorDB runs in local
Docker. These results apply to this controlled synthetic lab. They are not
production capacity, general agent reliability, or a promise of hosted speed.

## Infrastructure and state

| Check | Measured result | What it exercises |
|---|---|---|
| Event integration suite | 24/24 passed | Actual FalkorDB, Go HTTP, MCP sessions, role limits, path/runbook guards, idempotence, memory, revisions, checkpoint concurrency; simulated model protocol cases |
| Graph workload | 5,000 events + 2,500 memory writes + 5,000 task reads; zero lost records | 32 concurrent workers; 4.876 seconds workload time; median request 15.915 ms, p95 30.345 ms |
| Checkpoint races | 50/50 races had one winner | 32 writes compete for each checkpoint version |
| CLI continuation | Passed in two separate processes | Persisted handoff, fresh resolver, measured recovery, closed ticket, three memories |
| Docker package | Passed with scripted baseline | Access rejection/login, static page, SSE, app restart, persisted handoff, new resolver, recovery, ticket and memory |
| Docker package with actual Qwen3:8b inference | Passed | Authenticated API, streamed events, investigator handoff, app restart, fresh resolver, verified recovery and ticket; nine cumulative memory records remained |
| Rejected lab requests | 50/50 returned HTTP 403 after fix | Rejection transport under repeated process startup |
| UI build | TypeScript check and Vite build passed | Compile/build only; browser visual inspection is pending |

The integration suite previously failed an unauthorized-request assertion
because the HTTP client received a connection reset rather than the 403 response.
A 20-run isolated reproduction produced two resets. The handler now drains the
bounded request body before rejecting; 50 checks and the full suite passed
afterward. Earlier failure reports remain locally available.

## Actual model evaluation

Each evaluation uses real inference, fresh graph scopes, actual stdio MCP,
actual Go HTTP, and measured action counts. A repeated-incident case performs
two incidents and requires retrieval of previous memory. The changed-runbook
case requires a persisted blocker and zero recovery operations. Company checks
require expected source locations and owner fields; full claim entailment is
not evaluated.

| Model / revision | Result | Observations |
|---|---|---|
| Qwen3.5:4b, initial tools | 0/4 | Wrong target selection, premature finish or step-budget failure; backend prevented unsupported action |
| Qwen3.5:4b, clearer handoff argument/completion check | 2/2 recovery cases | Payments 25.912 s; orders 33.987 s |
| Qwen3.5:4b, extended cases | 2/3 | Retired runbook blocked; company source fields passed; repeated incident retrieved memory but resolver stopped before acting |
| Qwen3:8b, first full evaluation | 5/5 | Both recoveries, retired runbook, repeated memory and company source fields passed |
| Qwen3:8b, second full evaluation | 4/5 | Repeated case failed on an empty model response; other four cases passed |
| Qwen3:8b, bounded retry and resolver completion checks | 5/5 | One empty response was retried within the eight-request session limit; both recoveries, blocker, memory and company checks passed |

The 8B model is the current local default. In its first evaluation, 33 model
requests had a median duration of 1.135 seconds. The slowest request was 21.959
seconds, including model loading. Complete case durations were 40.223 seconds
for payments, 19.898 seconds for orders, 16.330 seconds for a retired runbook,
41.404 seconds for the two-incident memory case, and 12.963 seconds for company
questions. These include MCP/process/tool overhead and are not pure token speed.

The agent now requires a resolver to reach measured recovery/ticket completion
or a validated blocker before it can finish. Empty local responses receive up
to two retries inside the existing eight-request session budget. No tool effect
is requested by an empty response; recovery operation IDs remain idempotent.
The full evaluation after this change passed all five cases. It observed one
empty response and recovered on retry. The 30 nonempty model responses had a
median request duration of 1.191 seconds and a maximum of 6.332 seconds. This
small repeat does not erase the earlier failure or establish a success rate for
unseen incidents. A memory/no-memory comparison remains pending.

## Deployment status and limits

Local Docker-to-host Ollama model-list connectivity returned HTTP 200 and
confirmed Qwen3:8b is installed. The complete packaged LLM restart run passed:
gateway returned HTTP 200, unrelated analytics remained HTTP 503, and the ticket
closed after measured recovery.
The VM Compose and Caddy configuration validate locally. No Oracle VM, public
hostname, TLS endpoint or hosted Groq evaluation has been provisioned/verified.

The available computer-use environment has no browser surface, so the interface
has not been visually reviewed. HTTP 200, API operation, SSE and a passing build
do not replace that review.

Reviewed aggregate JSON reports are kept in [evidence](evidence/README.md),
including failed model candidates. Model/provider selection is explicit.
No fallback to a scripted run is counted as model success.
