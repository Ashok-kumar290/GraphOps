export type Health = {
  service: string;
  healthy: boolean;
  http_status: number;
  revision?: string;
  error?: string;
  source: string;
};
export type Doc = {
  id: string;
  kind: string;
  title: string;
  text: string;
  revision: string;
  source: string;
  data: Record<string, unknown>;
  text_length?: number;
  text_truncated?: boolean;
};
export type Company = {
  service: string;
  owners: { name: string; source: string }[];
  experts: { name: string; team: string }[];
  documents: Doc[];
  historical_documents: Doc[];
};
export type Memory = {
  procedure_candidate?: boolean;
  id: string;
  task: string;
  service: string;
  kind: string;
  revision: string;
  source: string;
  verified: boolean;
  created_at: string;
  validity: string;
  data: Record<string, unknown>;
};
export type Packet = {
  authorizes_execution?: boolean;
  policy?: {max_records: number; record_data_excerpt_chars: number; health_fact_max_age_seconds: number; max_cache_seconds: number};
  active: Memory[];
  historical: Memory[];
  unverified: Memory[];
  conflicts: unknown[];
  cache_hit: boolean;
  revision: string;
};
export type Incident = {
  id: string;
  title: string;
  service: string;
  status: string;
  created_at: string;
  mode: string;
  target: string | null;
  job: string;
  last_error?: string;
  blocker?: string;
  ticket_closed?: boolean;
  question?: boolean;
  diagnostic?: boolean;
  outcome?: {
    success: boolean;
    action: string;
    target: string;
    before: Health;
    after: Health;
    incident: Health;
    operation_id: string;
  };
};
export type Event = {
  id: string;
  session: string;
  role: string;
  kind: string;
  time: string;
  data: Record<string, any>;
};
export type GraphNode = {
  key: number;
  kind: string;
  id: string;
  title: string;
  source: string | null;
};
export type Workspace = {
  workspace: string;
  graph_name: string;
  graph: {
    nodes: GraphNode[];
    edges: { from: number; to: number; kind: string; source: string | null }[];
  };
  tasks: Incident[];
  selected: Incident | null;
  events: Event[];
  health: Health[];
  memory: Record<string, Packet>;
  company: Record<string, Company>;
  model: { provider: string; model: string; configured: boolean };
  busy: boolean;
  stopping: boolean;
  active_task?: string;
  diagnostics?: any;
  access_required?: boolean;
  scenarios: { id: string; label: string }[];
  observed_at: string;
};

export type Api = (path: string, body?: unknown) => Promise<any>;
export type Inspect = (title: string, value: unknown) => void;
export type View = "home" | "workspace" | "graph" | "memory" | "company" | "history" | "system" | "results";
