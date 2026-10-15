# What to show for each track

This maps the implemented product to the official track themes. It does not
predict judging results. Enter all three names explicitly in the submission.
[Official tracks](https://www.wemakedevs.org/hackathons/falkordb)

| Track | Working demonstration | Evidence to open | Boundary to explain |
|---|---|---|---|
| Agents That Act on Connected Data | Directed graph paths plus live HTTP observations select a supported cause. A current runbook and prepared plan govern recovery. | [Queries](../QUERIES.md), [action tools](../graphops/actions/tools.py), [edge-removal proof](../evidence/graph-dependency-proof.json), [runbook retirement rehearsal](../evidence/native-cli-runbook-gate.json) | Two operations in the synthetic adapter; no production cloud/service connectors. |
| Agent Memory and Coordination | Investigator persists a handoff; a fresh resolver loads it. Episodes, procedures and health facts remain retrievable with validity labels. | [Navigator](../graphops/memory/navigator.py), [stop/resume](../evidence/native-cli-interruption.json), [backup restoration](../evidence/native-cli-backup-restore.json), [graph workload](../evidence/stress.json) | Graph concurrency measurements are not concurrent-agent capacity. One job runs per app; per-user authorization is not implemented. |
| Company Brain | Sources, teams, expertise, project/service links and decisions share one graph. Revision changes update answers and can block recovery. | [Company repositories](../graphops/company/repository.py), [source-revision rehearsal](../evidence/native-cli-company-revisions.json), [guided live workflow](../evidence/frontend-guided-workflow.json) | Data is synthetic; known citation locations do not establish every claim's correctness. |

## Explain the important query and guard

1. `TopologyRepository.paths` traverses bounded `DEPENDS_ON` paths from the
   incident service and returns edge provenance.
2. Investigator handoff requires a directly measured cause on a supported path.
3. `prepare_recovery` reads current company data and matches its action and
   configuration precondition against the supported adapter policy.
4. `execute_recovery` rechecks the plan's incident, current runbook revision,
   dependency path and live state before making an effect.
5. Outcome measurements and memory writes are persisted before the ticket is
   completed. A later session retrieves evidence from graph state.

The model selects tools and arguments. Backend guards decide whether a request
is currently valid. Teams should be able to trace this in their own code review.

## Technical questions to rehearse

- Why is payments an eligible cause while the unrelated analytics fault is not?
- What happens if an edge disappears after a recovery plan was prepared?
- Which checkpoint and source records does a new resolver receive?
- Why can a health fact become historical while its episode remains useful?
- How does a source revision change affect the navigator's cache and procedure?
- What prevents a user-imported reference from authorizing a recovery action?
- How does an operation ID handle replay across graph and simulator state?
- Which guarantees depend on the backend, and which are checks on model output?
- What does the graph workload measurement prove, and what does it not measure?
- Which parts did each teammate implement, review and verify personally?

Use [LEARN.md](../LEARN.md) to record real observations and contributions.
