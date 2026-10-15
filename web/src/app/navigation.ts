import type { View } from "../shared/contracts";

export const PAGE_META: Record<View, {title: string; description: string}> = {
  home: {title: "Your company, connected", description: "Ask a question, follow the evidence and carry verified work into the next session."},
  company: {title: "Company knowledge", description: "Give the agent documents, owners, procedures and decisions it can cite."},
  graph: {title: "Connected graph", description: "See how services, teams and sources connect in FalkorDB."},
  workspace: {title: "Agent tasks", description: "Watch an agent investigate a problem, hand off context and verify supported work."},
  memory: {title: "Shared memory", description: "Inspect what survives a session, where it came from and whether it still applies."},
  history: {title: "Run history", description: "Review saved tasks, evidence and workspace changes."},
  system: {title: "System & backups", description: "Check the running components and preserve your workspace."},
};
