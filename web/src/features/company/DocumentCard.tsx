import React from "react";
import { ArrowUpRight, FileText } from "lucide-react";
import type { Doc } from "../../shared/contracts";

export function DocumentCard({
  doc,
  inspect,
}: {
  doc: Doc;
  inspect: (title: string, value: unknown) => void;
}) {
  return (
    <button className="document-card" onClick={() => inspect(doc.title, doc)}>
      <div>
        <FileText size={18} />
        <span className="pill subdued">{doc.kind}</span>
        <ArrowUpRight size={13} />
      </div>
      <h3>{doc.title}</h3>
      <p>{doc.text}</p>
      <small>
        Revision {doc.revision} <span>·</span> {doc.source}
      </small>
    </button>
  );
}
