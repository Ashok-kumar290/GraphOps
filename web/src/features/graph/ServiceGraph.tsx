import React from "react";
import type { Workspace, Inspect } from "../../shared/contracts";

export function ServiceGraph({
  data,
  active,
  onSelect,
}: {
  data: Workspace | null;
  active: string;
  onSelect: (s: string) => void;
}) {
  const positions: Record<string, [number, number]> = {
    gateway: [125, 125],
    orders: [390, 125],
    payments: [655, 125],
    analytics: [655, 300],
  };
  const nodes = data?.graph.nodes.filter((n) => n.kind === "Service") || [];
  const edges = data?.graph.edges.filter((e) => e.kind === "DEPENDS_ON") || [];
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  return (
    <div className="graph-canvas">
      <svg
        viewBox="0 0 810 380"
        role="img"
        aria-label="Actual service dependency graph"
      >
        <defs>
          <pattern
            id="grid"
            width="22"
            height="22"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r=".7" style={{fill: "var(--rule)"}} />
          </pattern>
          <marker
            id="arrow"
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3.5"
            orient="auto"
          >
            <path d="M0,0 L7,3.5 L0,7" fill="none" style={{stroke: "var(--ink-3)"}} />
          </marker>
        </defs>
        <rect width="810" height="380" fill="url(#grid)" />
        <text x="32" y="38" className="svg-caption">
          CHECKOUT DEPENDENCY PATH
        </text>
        {edges.map((e) => {
          const from = byKey.get(e.from),
            to = byKey.get(e.to);
          if (!from || !to) return null;
          const a = positions[from.id],
            b = positions[to.id];
          if (!a || !b) return null;
          return (
            <g key={e.from + "-" + e.to}>
              <path
                d={`M${a[0] + 91},${a[1]} L${b[0] - 96},${b[1]}`}
                className="dependency-edge"
                markerEnd="url(#arrow)"
              />
              <text
                x={(a[0] + b[0]) / 2}
                y={a[1] - 13}
                textAnchor="middle"
                className="edge-label"
              >
                DEPENDS ON
              </text>
            </g>
          );
        })}
        {nodes.map((n) => {
          const p = positions[n.id];
          if (!p) return null;
          const h = data?.health.find((h) => h.service === n.id),
            good = h?.healthy,
            selected = n.id === active;
          return (
            <g
              key={n.key}
              className={"service-node " + (selected ? "selected" : "")}
              tabIndex={0}
              role="button"
              aria-label={`Inspect ${n.id}`}
              onClick={() => onSelect(n.id)}
              onKeyDown={(e) => {if (e.key === "Enter" || e.key === " ") {e.preventDefault(); onSelect(n.id);}}}
              transform={`translate(${p[0]},${p[1]})`}
            >
              <rect
                x="-93"
                y="-44"
                width="186"
                height="94"
                rx="9"
                className="node-box"
              />
              <rect
                x="-78"
                y="-27"
                width="25"
                height="25"
                rx="6"
                style={{fill: good ? "var(--good-bg)" : "var(--bad-bg)", stroke: good ? "var(--good)" : "var(--bad)"}}
              />
              <path
                d="M-70,-19h9v9h-9z M-67,-22v3 M-67,-10v3"
                style={{stroke: good ? "var(--good)" : "var(--bad)"}}
                fill="none"
              />
              <text x="-43" y="-10" className="node-title">
                {n.title}
              </text>
              <circle
                cx="-72"
                cy="25"
                r="3"
                style={{fill: good ? "var(--good)" : "var(--bad)"}}
              />
              <text
                x="-61"
                y="29"
                className={"node-status " + (good ? "healthy" : "degraded")}
              >
                {h ? `HTTP ${h.http_status}` : "Measuring"}
              </text>
              <text x="77" y="29" textAnchor="end" className="node-port">
                :{h?.source.match(/:(\d+)\//)?.[1] || "—"}
              </text>
            </g>
          );
        })}
        <path d="M50 233 H755" style={{stroke: "var(--rule-strong)"}} strokeDasharray="4 6" />
        <text x="32" y="264" className="svg-caption">
          OUTSIDE THE INCIDENT PATH
        </text>
        <text x="32" y="294" className="svg-note">
          An unrelated failure must not change
        </text>
        <text x="32" y="312" className="svg-note">
          the selected recovery target.
        </text>
        {!data && (
          <text x="405" y="150" textAnchor="middle" className="svg-note">
            Connecting to graph records…
          </text>
        )}
      </svg>
    </div>
  );
}
