import React from "react";
import type { Event as RunEvent } from "./contracts";

// One row per session event, seconds from the start. Built from saved incident events or certification traces.
export type LaneRow = { t: number; session: number; role: string; kind: string; incident?: number; tool?: string; ms?: number };

const ROLE_NAME: Record<string, string> = { investigator: "Investigator", resolver: "Resolver", company: "Company assistant" };

export function rowsFromEvents(events: RunEvent[]): LaneRow[] {
  const agentEvents = events.filter(e => ROLE_NAME[e.role]);
  if (!agentEvents.length) return [];
  const start = Math.min(...agentEvents.map(e => Date.parse(e.time)));
  const lanes = new Map<string, number>();
  return agentEvents.map(e => {
    if (!lanes.has(e.session)) lanes.set(e.session, lanes.size);
    const data = (e.data || {}) as Record<string, unknown>;
    return { t: (Date.parse(e.time) - start) / 1000, session: lanes.get(e.session)!, role: e.role, kind: e.kind,
             tool: typeof data.tool === "string" ? data.tool : undefined,
             ms: typeof data.duration_ms === "number" ? data.duration_ms : undefined };
  });
}

export function AgentLanes({ rows, label }: { rows: LaneRow[]; label: string }) {
  const agentRows = rows.filter(r => ROLE_NAME[r.role]);
  if (!agentRows.length) return <p className="lanes-empty">No agent sessions recorded for this run yet.</p>;
  const sessions = [...new Set(agentRows.map(r => r.session))].sort((a, b) => a - b);
  const end = Math.max(...agentRows.map(r => r.t), 1);
  const W = 1000, laneH = 46, L = 168, R = 20, T = 10, B = 34, H = T + sessions.length * laneH + B;
  const x = (t: number) => L + (W - L - R) * (t / end);
  const laneY = (s: number) => T + sessions.indexOf(s) * laneH;
  const step = end > 60 ? 15 : end > 25 ? 5 : 2;
  const ticks = Array.from({ length: Math.floor(end / step) + 1 }, (_, i) => i * step);
  const spans = sessions.map(s => {
    const own = agentRows.filter(r => r.session === s);
    const first = own[0];
    const followUp = (first.incident || 0) > 0;
    return { s, role: first.role, start: Math.min(...own.map(r => r.t)), stop: Math.max(...own.map(r => r.t)),
             name: ROLE_NAME[first.role] + (followUp ? " · follow-up" : ""), own,
             tools: own.filter(r => r.kind === "tool" || r.kind === "tool_error").length,
             models: own.filter(r => r.kind === "model_timing").length };
  });
  return (
    <figure className="lanes">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map(t => (
          <g key={t}><line x1={x(t)} x2={x(t)} y1={T} y2={H - B} className="lanes-grid" />
            <text x={x(t)} y={H - B + 18} textAnchor="middle" className="lanes-axis">{t} s</text></g>))}
        {spans.map((span, i) => {
          const y = laneY(span.s);
          const next = spans[i + 1];
          return (
            <g key={span.s} className={"lane role-" + span.role}>
              <text x={0} y={y + 20} className="lanes-name">{span.name}</text>
              <text x={0} y={y + 35} className="lanes-meta">{span.models} model · {span.tools} tool calls</text>
              <rect x={x(span.start)} y={y + 10} width={Math.max(x(span.stop) - x(span.start), 3)} height={24} rx={4} className="lanes-span" />
              {span.own.filter(r => r.kind === "model_timing" && r.ms).map((r, k) => (
                <rect key={"m" + k} x={x(Math.max(r.t - (r.ms as number) / 1000, span.start))} y={y + 14}
                      width={Math.max(x(r.t) - x(Math.max(r.t - (r.ms as number) / 1000, span.start)), 2)} height={16} rx={2} className="lanes-model">
                  <title>{`Model request · ${Math.round(r.ms as number)} ms`}</title></rect>))}
              {span.own.filter(r => r.kind === "tool" || r.kind === "tool_error").map((r, k) => (
                <line key={"t" + k} x1={x(r.t)} x2={x(r.t)} y1={y + 8} y2={y + 36} className={r.kind === "tool_error" ? "lanes-tool error" : "lanes-tool"}>
                  <title>{`${r.tool}${r.kind === "tool_error" ? " (refused)" : ""} · ${r.t.toFixed(1)} s`}</title></line>))}
              {next && next.start >= span.stop - 0.5 && (
                <path d={`M${x(span.stop)},${y + 34} C${x(span.stop) + 20},${y + laneH} ${x(next.start) - 20},${laneY(next.s)} ${x(next.start)},${laneY(next.s) + 12}`}
                      className="lanes-handoff"><title>Saved handoff read by the next session</title></path>)}
            </g>);
        })}
      </svg>
      <figcaption className="lanes-legend">
        <span><i className="lanes-key span" />Session</span><span><i className="lanes-key model" />Model request</span>
        <span><i className="lanes-key tool" />Tool call</span><span><i className="lanes-key error" />Refused tool call</span>
        <span><i className="lanes-key handoff" />Handoff through FalkorDB</span>
      </figcaption>
    </figure>
  );
}
