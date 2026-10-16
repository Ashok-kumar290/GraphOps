import React from "react";
import { ArrowUpRight } from "lucide-react";
import type { Memory, Incident } from "../../shared/contracts";
import { nice } from "../../shared/format";
export function MemoryCard({
  memory: m,
  inspect,
}: {
  memory: Memory;
  inspect: (title: string, value: unknown) => void;
}) {
  return (
    <button
      className="memory-card"
      onClick={() => inspect(`${m.kind} memory · ${m.task}`, m)}
    >
      <div>
        <span className={"memory-type " + m.kind}>{m.kind}</span>
        <ArrowUpRight size={12} />
      </div>
      <strong>
        {m.data.action
          ? nice(String(m.data.action))
          : m.data.claim
            ? `${m.data.claim}: ${m.data.value}`
            : "Incident evidence"}
      </strong>
      <p>{nice(m.validity)}</p>
      {m.kind === "procedural" && typeof m.procedure_candidate === "boolean" && <p className={m.procedure_candidate ? "text-mint" : "text-coral"}>{m.procedure_candidate ? "Candidate for current configuration" : "Revalidate before reuse"}</p>}
      <small className="mono">
        {m.task} · {m.revision}
      </small>
    </button>
  );
}
