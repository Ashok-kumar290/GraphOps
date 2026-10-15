import React from "react";
import { Network } from "lucide-react";

export function Metric({
  label,
  value,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="metric panel">
      <div>
        {label}
        {icon}
      </div>
      <strong className={accent ? "text-mint" : ""}>{value}</strong>
    </div>
  );
}

export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <span>
        <Network size={26} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
