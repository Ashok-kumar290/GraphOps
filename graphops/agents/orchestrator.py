"""One incident workflow shared by the app, the CLI and certification.

Investigate -> persisted handoff -> fresh resolver session. If a recovery worked but checkout still
fails, another cause remains: open a linked follow-up incident and repeat, at most MAX_FOLLOW_UPS times.
"""
from graphops.agents.runner import Agent, StopRequested
from graphops.graph.workspace import WorkspaceGraph

INVESTIGATE = "Investigate the gateway failure. Compare reachable causes and unrelated failures, retrieve relevant context, then hand off supported evidence."
FOLLOW_UP = ("Checkout is still failing after an earlier verified recovery in this incident chain. Investigate the current graph "
             "evidence and hand off the remaining directly failing cause.")
RESOLVE = "Continue the persisted handoff. Check memory and current procedure, recover only with a validated plan, verify health and complete the synthetic ticket."
MAX_FOLLOW_UPS = 2


def remaining_failure(task):
    """The recovery took effect but the incident's entry service still fails."""
    outcome = task.get("outcome") or {}
    return bool((outcome.get("response") or {}).get("restored")) and (outcome.get("incident") or {}).get("http_status") != 200


async def run_incident(store, port, task_id, mode, emit=lambda value: None, should_stop=lambda: False, pause_after_handoff=False):
    """Run one incident and any follow-ups it needs. Returns every incident ID in the chain."""
    chain = [task_id]
    prompt = INVESTIGATE
    while True:
        current = chain[-1]
        await Agent(store, port, emit, should_stop=should_stop).run(current, "investigator", prompt, mode)
        if pause_after_handoff or store.runs.get(current)["status"] != "handoff": return chain
        emit({"type": "progress", "task": current, "stage": "handoff_saved", "role": "resolver"})
        if should_stop(): raise StopRequested("Stopped at a checkpoint. Resume this incident to continue.")
        # A fresh agent and MCP process load the saved handoff from FalkorDB.
        await Agent(WorkspaceGraph(store.scope), port, emit, should_stop=should_stop).run(current, "resolver", RESOLVE, mode)
        finished = store.runs.get(current)
        if not remaining_failure(finished) or len(chain) > MAX_FOLLOW_UPS: return chain
        follow = store.runs.create(finished.get("scenario", "follow_up"), "Follow-up: checkout still failing after recovering " + str(finished.get("target")), mode)["id"]
        store.runs.update(follow, {"follow_up_of": current, "chain_root": chain[0]})
        store.runs.append_event(current, "orchestrator", "system", "follow_up_started",
                                {"follow_up": follow, "recovered": finished.get("target"),
                                 "incident_http_status": (finished.get("outcome") or {}).get("incident", {}).get("http_status")})
        emit({"type": "progress", "task": follow, "stage": "follow_up", "role": "investigator"})
        chain.append(follow)
        prompt = FOLLOW_UP
