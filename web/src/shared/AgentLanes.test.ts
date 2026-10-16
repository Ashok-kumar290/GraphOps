import { expect, test } from "vitest";
import { rowsFromEvents } from "./AgentLanes";

test("Each agent session becomes its own lane, timed from the first agent event", () => {
  const event = (session: string, role: string, kind: string, time: string, data: Record<string, unknown> = {}) =>
    ({ id: session + time, session, role, kind, time, data });
  const rows = rowsFromEvents([
    event("sys", "system", "scenario_started", "2026-10-16T10:00:00Z"),
    event("a", "investigator", "session_started", "2026-10-16T10:00:01Z"),
    event("a", "investigator", "tool", "2026-10-16T10:00:03Z", { tool: "handoff_target" }),
    event("b", "resolver", "model_timing", "2026-10-16T10:00:09Z", { duration_ms: 1500 }),
  ]);
  expect(rows).toHaveLength(3);
  expect(rows.map(r => r.session)).toEqual([0, 0, 1]);
  expect(rows[1]).toMatchObject({ t: 2, tool: "handoff_target" });
  expect(rows[2]).toMatchObject({ t: 8, ms: 1500, role: "resolver" });
});
