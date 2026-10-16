import React from "react";
import { Network } from "lucide-react";
import type { Workspace, GraphNode, Api, Inspect } from "../../shared/contracts";

type Props = { api: Api; busy: boolean; inspect: Inspect };
export function KnowledgeGraph({
  data,
  service,
  inspect,
}: {
  data: Workspace | null;
  service: string;
  inspect: Inspect;
}) {
  const all = data?.graph.nodes || [],
    edges = data?.graph.edges || [],
    root = all.find((n) => n.kind === "Service" && n.id === service);
  if (!root) return null;
  const keys = new Set<number>([root.key]);
  for (const edge of edges)
    if (edge.from === root.key || edge.to === root.key) {
      keys.add(edge.from);
      keys.add(edge.to);
    }
  const nearby = all.filter((n) => keys.has(n.key)),
    left = nearby.filter((n) => n.key !== root.key && n.kind !== "Document"),
    right = nearby.filter((n) => n.kind === "Document").slice(0, 12);
  const height = Math.max(330, Math.max(left.length, right.length) * 56 + 80),
    positions = new Map<number, [number, number]>([
      [root.key, [430, height / 2]],
    ]);
  left.forEach((n, i) => positions.set(n.key, [125, 65 + i * 56]));
  right.forEach((n, i) => positions.set(n.key, [735, 65 + i * 56]));
  const node = (n: GraphNode) => {
    const [x, y] = positions.get(n.key)!;
    return (
      <g
        role="button"
        tabIndex={0}
        aria-label={`Inspect ${n.kind} ${n.title || n.id}`}
        key={n.key}
        onClick={() => inspect("Connected " + n.kind, n)}
        onKeyDown={(e) => {if (e.key === "Enter" || e.key === " ") {e.preventDefault(); inspect("Connected " + n.kind, n);}}}
        className={"knowledge-node " + (n.key === root.key ? "root" : "")}
        transform={`translate(${x},${y})`}
      >
        <rect x={-100} y={-22} width={200} height={44} rx={7} />
        <text x={-86} y={-3}>
          {n.title?.length > 25 ? n.title.slice(0, 24) + "…" : n.title || n.id}
        </text>
        <text x={-86} y={13} className="kind">
          {n.kind}
        </text>
      </g>
    );
  };
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <Network size={16} />
          <h2>Connected company context</h2>
        </div>
        <span className="pill subdued">FALKORDB</span>
      </div>
      <div className="knowledge-canvas">
        <svg
          viewBox={`0 0 860 ${height}`}
          role="img"
          aria-label={`Actual graph relationships around ${service}`}
        >
          <defs>
            <marker
              id="knowledge-arrow"
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <path d="M0 0 L7 3.5 L0 7" fill="none" stroke="#6d9990" />
            </marker>
          </defs>
          {edges
            .filter((e) => positions.has(e.from) && positions.has(e.to))
            .map((e, i) => {
              const a = positions.get(e.from)!,
                b = positions.get(e.to)!;
              return (
                <g
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-label={`Inspect ${e.kind.replaceAll("_", " ")} relationship ${i + 1}`}
                  onClick={() => inspect("Sourced graph relationship", e)}
                  onKeyDown={event => {if (event.key === "Enter" || event.key === " ") {event.preventDefault(); inspect("Sourced graph relationship", e);}}}
                >
                  <path
                    d={`M${a[0] + 100},${a[1]} C${(a[0] + b[0]) / 2},${a[1]} ${(a[0] + b[0]) / 2},${b[1]} ${b[0] - 105},${b[1]}`}
                    markerEnd="url(#knowledge-arrow)"
                  />
                  <text
                    x={(a[0] + b[0]) / 2}
                    y={(a[1] + b[1]) / 2 - 6}
                    textAnchor="middle"
                    className="relationship"
                  >
                    {e.kind.replaceAll("_", " ")}
                  </text>
                </g>
              );
            })}
          {[...left, root, ...right].map(node)}
        </svg>
      </div>
      <p className="graph-foot">
        Relationships come from the graph. Up to 12 attached sources are shown;
        search the library for more.
      </p>
    </section>
  );
}
