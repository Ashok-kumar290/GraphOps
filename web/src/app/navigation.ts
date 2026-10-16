import type { View } from "../shared/contracts";

export const PAGE_META: Record<View, {title: string; description: string}> = {
  home: {title: "Start with one real workflow", description: "Explore a checkout failure in our sample company, from the first question to shared memory."},
  company: {title: "Company knowledge", description: "Give the agent documents, owners, procedures and decisions it can cite."},
  graph: {title: "Connected graph", description: "See how services, teams and sources connect in FalkorDB."},
  workspace: {title: "Agent tasks", description: "Watch an agent investigate a problem, hand off context and verify supported work."},
  memory: {title: "Shared memory", description: "Inspect what survives a session, where it came from and whether it still applies."},
  history: {title: "Run history", description: "Review saved tasks, evidence and workspace changes."},
  system: {title: "System & backups", description: "Check the running components and preserve your workspace."},
  results: {title: "Results", description: "Measured results across models and hard problems."},
};
