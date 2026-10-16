import type { Event } from "../../shared/contracts";
import { nice, short } from "../../shared/format";

export function presentEvent(event: Event) {
  const {kind, data, role} = event;
  const result = data.result || {}, tool = data.tool || "";
  const roles: Record<string, string> = {investigator: "Investigator", resolver: "Resolver", company: "Company agent", system: "System"};
  const name = roles[role] || nice(role);
  const text = (value: unknown, fallback: string) => typeof value === "string" && value ? value : fallback;
  if (kind === "session_started") return {title: `${name} session started`, description: `${data.mode === "llm" ? "Model chooses tools" : "Deterministic scripted baseline"} · session ${short(event.session)}`, success: false};
  if (kind === "session_finished") return {title: `${name} checkpoint saved`, description: text(data.summary, "This session saved its progress."), success: false};
  if (kind === "tool_error") return {title: `${nice(tool)} could not complete`, description: text(data.error, "The tool reported an error. Open this event for details."), success: false};
  if (kind === "run_error" || kind === "run_stopped") return {title: kind === "run_stopped" ? "Stopped at a checkpoint" : "Run interrupted", description: text(data.message, "Read the saved checkpoint before resuming."), success: false};
  if (kind === "memory_saved") return {title: "Shared memory saved", description: `Saved ${Array.isArray(data.kinds) ? data.kinds.join(", ") : "sourced"} memory for ${text(data.service, "this service")}.`, success: true};
  if (kind === "component_check") return {title: data.success ? "System checks passed" : "System check needs attention", description: data.success ? "Live model and MCP checks completed." : "Open the recorded check to see which component failed.", success: data.success === true};
  const titles: Record<string, string> = {
    checkpoint: "Read the saved checkpoint", inspect_incident: "Compare service failures with the graph",
    inspect_dependencies: "Follow service dependencies", observe_service: "Measure service health",
    company_context: "Read company ownership and procedures", recall_memory: "Retrieve shared memory",
    handoff_target: result.ready ? "Save the cause for the next session" : "Check the proposed cause",
    prepare_recovery: result.ready ? "Recovery plan approved" : "Recovery plan needs attention",
    execute_recovery: result.success ? "Recovery measured successfully" : "Recovery verification needs attention",
    complete_ticket: "Update the synthetic incident ticket", conclude_investigation: "Investigation needs more evidence",
  };
  const descriptions: Record<string, string> = {
    checkpoint: "Loaded the incident and recent steps from FalkorDB.",
    inspect_incident: "Measured authorized services and retrieved connected dependency paths.",
    inspect_dependencies: `Retrieved ${Array.isArray(result.paths) ? result.paths.length : "the available"} dependency paths from FalkorDB.`,
    observe_service: `${text(result.service, "Service")}: ${typeof result.http_status === "number" ? `HTTP ${result.http_status}` : "no HTTP status returned"}${result.revision ? ` · revision ${result.revision}` : ""}.`,
    company_context: "Retrieved the connected owner, documents and current procedures.",
    recall_memory: "Retrieved past outcomes, procedures and facts with applicability labels.",
    handoff_target: result.ready ? `Saved ${text(result.target, "the supported service")} and its evidence for the resolver.` : "The proposed target must match the graph and current measurements.",
    prepare_recovery: result.ready ? "Current graph, procedure and service configuration passed validation." : "The current evidence did not authorize recovery.",
    execute_recovery: result.success ? `${text(result.target, "Target")} HTTP ${result.after?.http_status ?? "not recorded"}; checkout HTTP ${result.incident?.http_status ?? "not recorded"}.` : "No successful measured recovery was recorded by this tool call.",
    complete_ticket: result.state === "closed" ? "Closed the synthetic ticket after measured recovery." : "Read the recorded ticket result.",
  };
  return {title: titles[tool] || nice(tool || kind), description: text(result.reason, descriptions[tool] || "Open this event to inspect the recorded evidence."), success: result.success === true || result.state === "closed"};
}
