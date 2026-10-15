import React from "react";

import { useWorkspace } from "../../app/WorkspaceContext";
import { api } from "../../shared/api";
import { RunHistory } from "./RunHistory";
export function HistoryPage() {
const {
  inspect,
  choose
} = useWorkspace();
return (
                <RunHistory api={api} inspect={inspect} onChoose={choose} />
              );
}
