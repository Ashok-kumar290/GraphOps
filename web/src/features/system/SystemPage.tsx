import React from "react";

import { useWorkspace } from "../../app/WorkspaceContext";
import { api } from "../../shared/api";
import { SystemPanel } from "./SystemPanel";
export function SystemPage() {
const {
  data,
  command,
  controlsDisabled,
  downloading,
  inspect,
  download
} = useWorkspace();
return (
                <SystemPanel
                  api={api}
                  busy={controlsDisabled || !!downloading}
                  inspect={inspect}
                  data={data}
                  onDiagnose={() => void command("/api/diagnostics", {})}
                  onBackup={() =>
                    void download(
                      "/api/backup",
                      "graphops-workspace-backup.json",
                    )
                  }
                />
              );
}
