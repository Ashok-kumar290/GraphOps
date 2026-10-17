# GraphOps demo video script

Target: about four minutes. One take per scene is fine; cut between scenes.
Use the real running app with local Qwen3 8B. Where you skip waiting time, say so
on screen ("sped up" or a cut). Do not edit numbers into the video that the app
did not show.

## Before recording

1. Run `.\start.ps1` and open http://localhost:8080. Set the browser zoom to 110%
   and use a 1440×900 or larger window.
2. Click **Run agent** once and let it finish, so the model is warm (the first
   request after loading takes far longer than later ones).
3. Confirm the sidebar shows **FalkorDB connected** and checkout is healthy.
   Analytics failing is intentional; it is the distractor.
4. Have these tabs ready: **Start here**, **Agent tasks**, **Judge check**,
   **Results**, **Connected graph**.
5. Practise the narration once out loud. Every speaker should only explain parts
   they understand and can answer questions about (rules 12–13).

## Script

| Time | Screen | Say |
|---|---|---|
| 0:00–0:20 | **Start here** | "Agents that fix production systems fail in a predictable way: they blame the symptom instead of the cause, apply a familiar fix to an unfamiliar problem, or follow instructions planted in a document. GraphOps is a company copilot that uses a FalkorDB graph to decide what it is allowed to do." |
| 0:20–0:45 | **Connected graph** | "Here is the sample company. Checkout depends on orders, which depends on payments. Teams own services; runbooks and decisions hang off them. Analytics is failing too, but nothing connects it to checkout, so the agent must leave it alone." |
| 0:45–1:35 | **Agent tasks** → Run agent; then the **Agents in this run** lanes | "I break the payments configuration and run the agent. The investigator checks gateway, orders and payments one by one. Gateway and orders fail only because payments does; payments has its own error. It saves a handoff in FalkorDB. Now a separate resolver, with its own model conversation, reads that handoff, checks the current runbook, and fixes payments by a plan the backend built and re-checked against the graph. Checkout goes from HTTP 503 to 200. Each lane is one tracked agent session." (cut while it runs) |
| 1:35–2:05 | **Company knowledge** → Retire current procedure; then Agent tasks → Run agent | "Company knowledge governs action. I retire the payments runbook and run the same incident. The agent finds the same cause, but recovery is refused and nothing is executed. The graph and the current procedure decide, not the model." Then restore the procedure. |
| 2:05–2:50 | **Judge check** → Run quick check (sped up) | "Judges can check this themselves. This runs four live cases in throwaway graphs: the payments fault, a retired runbook, notes telling the agent to blame analytics, and two services failing at once. Each case says what should happen and what was measured. In the two-fault case, fixing payments isn't enough, so GraphOps never marks it resolved; a follow-up incident finds the orders fault." |
| 2:50–3:35 | **Results** → the comparison charts and table | "We compared GraphOps with LangGraph's prebuilt ReAct agent, the most common way to build a tool-using agent, on the same model and the same twelve cases. GraphOps passed twelve of twelve and sent no unsafe fix requests. ReAct passed seven, and six with a graph query tool, each sending six unsafe requests. Giving an agent the graph as a tool wasn't enough; checking every action against it was. The cost is shown too: GraphOps is slower and uses more tokens." |
| 3:35–3:50 | **Results** → the model table | "The same workflow ran with four models, local and hosted. Only measured effects are scored, never the model's prose." |
| 3:50–4:05 | **Start here** | "GraphOps: the graph decides what an agent may do, separate sessions share sourced memory, and you can verify all of it yourself. Thanks for watching." |

## Track mapping for the description

- **Agents That Act on Connected Data:** dependency paths decide eligible causes;
  every recovery is re-checked against the graph; removing an edge blocks action.
- **Agent Memory and Coordination:** investigator and resolver sessions hand off
  through FalkorDB; follow-up incidents; racing resolvers apply exactly one fix;
  the memory navigator labels stale, historical and unverified records.
- **Company Brain:** ownership, runbooks and decisions with versioned sources;
  cited answers; a retired runbook blocks recovery.

## After recording

Upload as an unlisted video, add the link to the submission form and to
`submission/FORM_DRAFT.md`, and note the recording date in SUBMISSION.md.
