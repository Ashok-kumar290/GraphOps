# What does the memory navigator add?

The product saves a recovery's outcome, procedure and sourced health observation.
A fresh session can retrieve those records with applicability labels. This
comparison measures how well a fresh model call can recover exact historical
facts and judge the remembered procedure against a current snapshot.

## Repeat the measurement

Start the local app with `start.ps1` so FalkorDB, Ollama and the compiled Go lab
are available. In another terminal, activate the project's Python environment:

```powershell
python -m tests.compare_memory --repeats 2
```

Use `..\.venv\Scripts\python.exe` in this development workspace, or
`.\.venv\Scripts\python.exe` in an independent checkout with its own environment.
The selected provider/model comes from local configuration. Model API usage, if
a hosted provider is selected, uses that provider's normal account quota.

Each run creates an isolated FalkorDB graph and a Go service fixture on its own
ports. A real LLM investigator and fresh resolver first complete a measured
recovery. The harness opens a new graph connection to retrieve its memory.

It then compares three inputs:

| Condition | Current context | Past context |
|---|---|---|
| No past context | Same current HTTP measurement and company sources | Explicitly unavailable |
| Navigator packet | Same current HTTP measurement and company sources | The bounded, sourced packet returned by the navigator |
| Full incident history | Same current HTTP measurement and company sources | The completed incident and its persisted event history |

Current company context includes the closed ticket. It can reveal the past
incident ID and support partial historical answers even in the no-past-context
condition. Complete recall additionally requires the two exact historical health
observation IDs. This experiment specifically tests evidence carryover and
context packaging; an agent's ability to rediscover or repair a failure has a
separate evaluation.

Each model call starts with a fresh conversation and receives the same question
and system instructions. The current protocol also requests the same JSON schema
for every local Ollama comparison call and places the current snapshot after the
past context. Hosted adapters use text output with the same parser/scorer.
The comparison calls have no tools. Condition order
rotates across repetitions. With two repetitions, the three conditions run in
each of three states, producing **18 calls**:

1. **Recovered:** the current healthy configuration differs from the past
   procedure's failure precondition.
2. **Same fault again:** the failure configuration matches the past procedure
   and the runbook revision is unchanged.
3. **Runbook retired:** the old procedure's source revision has changed, so
   that remembered procedure requires revalidation. The harness also checks
   that the revision change invalidates a primed cache entry.

The comparison records a fixed current snapshot for each state. The applicability
answer concerns that snapshot's time. A historical health fact stays historical
when configuration changes, and all comparison calls leave the recovery-operation
count unchanged.

## What is scored

The evaluator checks the exact past incident ID, service, action and two health
observation IDs that verified target and checkout recovery. It also checks the
remembered procedure's applicability when past context was supplied.

Unavailable facts can be `null` or an empty evidence array. Abstention is an
appropriate result for missing evidence. A correct partial answer remains a
partial answer. Incorrect historical fields and unmatched observation IDs are
counted explicitly. A `true` applicability claim for an ineligible procedure is
reported separately from a cautious `null` answer; `null` still fails exact
applicability scoring when the procedure is available. Applicability from the no-context condition is reported
separately because the past procedure may be unavailable.

All raw answers, malformed outputs, provider errors, per-call timings and
scores are retained in `.runtime/reports/memory-comparison-*/result.json`.
The snapshots and seed trace are stored beside it. The summary includes median
UTF-8 context bytes and provider-reported input tokens when available. Bytes
are measured separately from tokens.

`comparison_completed` means all planned samples were recorded. `success` is
the stricter all-conditions evaluation gate: correct recall/applicability with supplied past
context, no incorrect historical claims, verified stale-data checks and zero
comparison recovery effects. An exit code of 1 retains the failed result.
The gate can fail when a baseline gives incorrect answers even if the navigator
retrieves the exact records. Read the per-condition scores and failures.

## How to interpret the result

This is a small read-only fact-recall experiment on one synthetic recovered
incident. Live recovery and separate-session coordination have their own checks
in [RESULTS.md](RESULTS.md). Explanation entailment is outside this evaluator's
scope.

The configured model's context window also applies to full-history inputs;
large histories can be truncated by the provider. GPU pressure, cold loading,
prefix caching and condition order can affect timing. Report exact observed
results and failures; the experiment does not establish general reliability,
production throughput or a universal speed advantage.

## Inspect the product's actual packet

Open **Memory navigator** and select a service. The **What a new session can
use** panel shows current candidates, historical context and unverified claims.
**Inspect navigator packet** opens the actual retrieved object.

The backend includes its policy in that object: up to 12 records, 1,500-character
data excerpts, a 30-second maximum age for current health facts, and cache reuse
for up to 10 seconds. These are bounds and freshness rules; source locations,
revisions, preconditions and live checks still govern recovery. Cache entries
are keyed by workspace context revision, service and current configuration.

Procedural records also expose a `procedure_candidate` boolean computed by the
navigator's classification rules. The packet explicitly sets
`authorizes_execution: false`. The UI displays the backend's candidate flag;
the action backend checks current evidence independently of model prose.

Developmental runs before and after adding these flags, prompt placement and
structured output are retained together. Those changes affect several variables,
so comparing the developmental runs does not isolate the effect of one change.

## Recorded results

The [comparison evidence](evidence/memory-comparison.json) links both complete
18-call runs and their raw answers. The current structured-output run measured:

| Condition | Exact historical recall | Median reported input tokens | Median supplied context bytes |
|---|---|---|---|
| No past context | 0/6 | 782 | 2,121 |
| Navigator packet | 6/6 | 1,331 | 3,483 |
| Full incident history | 5/6 | 4,098 | 27,496 |

The navigator supplied 87.33% fewer UTF-8 context bytes and used 67.52% fewer
provider-reported input tokens than full history in this small run. Provider
context limits and caching qualify the token/time observations.

**The overall evaluation gate failed in both runs.** In the current run, the
navigator's model applicability answer was exactly correct in 1/6 samples and
abstained with `null` in five. Its backend candidate flags matched all three
state snapshots. No navigator output incorrectly asserted applicability for an
ineligible procedure. Full-history outputs made two such assertions. The action
backend's current graph/runbook/configuration checks remain essential.

The first run also retained six full-history JSON parsing failures and four
incorrect positive navigator applicability claims. Subsequent changes added
explicit candidate flags, structured JSON and revised prompt placement together.
Both runs are retained; the changes do not establish that memory eliminates
hallucinations. The comparison itself executed zero recovery operations after
its seed recovery.
