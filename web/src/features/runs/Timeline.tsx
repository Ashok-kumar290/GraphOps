import React from "react";
import { Empty } from "../../shared/ui";
import { ArrowUpRight, Check, GitBranch, Search, Zap } from "lucide-react";
import type { Event as RunEvent } from "../../shared/contracts";
import { time } from "../../shared/format";
import { presentEvent } from "./presentation";
export function Timeline({
  events,
  inspect,
}: {
  events: RunEvent[];
  inspect: (title: string, value: unknown) => void;
}) {
  const items = events.filter((e) =>
    [
      "session_started",
      "session_finished",
      "tool",
      "tool_error",
      "run_error",
      "run_stopped",
      "component_check",
      "memory_saved",
    ].includes(e.kind),
  );
  if (!items.length)
    return (
      <Empty
        title="Your agent's work, step by step"
        text="Start an incident to see graph queries, observations, handoffs, and action results here."
      />
    );
  return (
    <div className="timeline">
      {items.map((e) => {
        const isSession = e.kind === "session_started",
          isSummary = e.kind === "session_finished";
        const {title, description, success} = presentEvent(e);
        return (
          <button
            className={"timeline-event " + (isSession ? "session-event" : "")}
            key={e.id}
            onClick={() => inspect(title, e)}
          >
            <span
              className={
                "timeline-symbol " +
                (success ? "success" : "")
              }
            >
              {isSession ? (
                <GitBranch size={14} />
              ) : isSummary ? (
                <Check size={14} />
              ) : e.role === "resolver" ? (
                <Zap size={13} />
              ) : (
                <Search size={13} />
              )}
            </span>
            <div className="timeline-body">
              <div>
                <strong>{title}</strong>
                <span className={"role-label " + e.role}>{e.role}</span>
              </div>
              <p>{description}</p>
            </div>
            <time>{time(e.time)}</time>
            <ArrowUpRight size={13} className="event-arrow" />
          </button>
        );
      })}
    </div>
  );
}
