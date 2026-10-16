import React from "react";
import { CheckCircle2, CircleDashed, LoaderCircle, Play, ShieldCheck, Square, XCircle } from "lucide-react";
import { useWorkspace } from "../../app/WorkspaceContext";
import benchmarks from "../results/benchmarks.json";
import type { Event as RunEvent, Incident } from "../../shared/contracts";

const SUITES: Record<string, string[]> = {
  quick: ["config", "changed_runbook", "prompt_injection", "double_fault"],
  all: benchmarks.cases.map(c => c.id),
};
const CASE_INFO = Object.fromEntries(benchmarks.cases.map(c => [c.id, c]));

type CaseEvent = { type: string; case: string; description?: string; expected?: string; passed?: boolean; seconds?: number;
  status?: string; actions?: number; refused_fix_requests?: number; error?: string; model_requests?: number };

function caseStates(events: RunEvent[]) {
  const states: Record<string, { started?: CaseEvent; finished?: CaseEvent }> = {};
  for (const e of events) {
    if (e.kind !== "verification_case") continue;
    const data = e.data as CaseEvent;
    const state = states[data.case] ||= {};
    if (data.type === "case_started") state.started = data; else state.finished = data;
  }
  return states;
}

function Measured({ result }: { result: CaseEvent }) {
  if (result.error) return <span className="v-measured">{result.error}</span>;
  const parts = [`status ${result.status}`, `${result.actions} fix${result.actions === 1 ? "" : "es"} applied`];
  if (result.refused_fix_requests) parts.push(`${result.refused_fix_requests} unsafe request${result.refused_fix_requests > 1 ? "s" : ""} refused`);
  parts.push(`${result.model_requests} model requests`, `${Math.round(result.seconds || 0)} s`);
  return <span className="v-measured">{parts.join(" · ")}</span>;
}

export function VerifyPage() {
  const { data, selected, command, controlsDisabled, busy, choose } = useWorkspace();
  const checks = (data?.tasks || []).filter(t => t.verification) as Incident[];
  const current = selected?.verification ? selected : undefined;
  const events = current ? data?.events || [] : [];
  const running = Boolean(current && busy && data?.active_task === current.id);
  const states = caseStates(events);
  const suite = current?.suite || "quick";
  const ids = SUITES[suite] || SUITES.quick;
  const finished = ids.filter(id => states[id]?.finished);
  const passed = finished.filter(id => states[id]?.finished?.passed).length;
  const components = events.filter(e => e.kind === "component_check").at(-1)?.data as
    { mcp?: { success: boolean }; model?: { success: boolean; provider?: string; model?: string; error?: string } } | undefined;
  const healthy = (data?.health || []).filter(h => h.service !== "analytics").every(h => h.http_status === 200);
  const verdict = !current ? null : running ? "running" : current.status === "checked" ? "passed" : finished.length ? "failed" : current.last_error || current.blocker ? "failed" : "pending";

  return (
    <div className="verify">
      <section className="panel v-intro">
        <div className="v-intro-text">
          <span className="eyebrow">FOR JUDGES AND REVIEWERS</span>
          <h2>Check that GraphOps works, live</h2>
          <p>
            This runs real cases now, on this machine, with the configured model
            {data?.model ? <> (<b>{data.model.provider} · {data.model.model}</b>)</> : null}. Each case gets its own
            FalkorDB graph and its own copy of the sample company's services, so your workspace and history are not changed.
            A case passes only on measured effects: service health, how many fixes were applied, and the incident's state.
          </p>
        </div>
        <div className="v-actions">
          <button className="button primary" disabled={controlsDisabled} onClick={() => void command("/api/verify", { suite: "quick" })}>
            <Play size={14} /> Run quick check <small>4 cases · about 3 min</small>
          </button>
          <button className="button secondary" disabled={controlsDisabled} onClick={() => void command("/api/verify", { suite: "all" })}>
            <Play size={14} /> Run full check <small>12 cases · about 8 min</small>
          </button>
          {running && current && (
            <button className="button secondary" onClick={() => void command("/api/cancel", { task: current.id })}>
              <Square size={14} /> Stop
            </button>)}
        </div>
      </section>

      {current ? (
        <section className="panel v-run" aria-live="polite">
          <div className="v-run-head">
            <div>
              <h2>{current.title}</h2>
              <p className="subtle">{current.id} · started {new Date(current.created_at).toLocaleTimeString()}</p>
            </div>
            <span className={"v-verdict " + verdict}>
              {verdict === "running" && <><LoaderCircle size={14} className="spin" /> Running · {finished.length} of {ids.length} done</>}
              {verdict === "passed" && <><CheckCircle2 size={14} /> All {ids.length} cases passed</>}
              {verdict === "failed" && <><XCircle size={14} /> {passed} of {ids.length} passed</>}
              {verdict === "pending" && <>Starting</>}
            </span>
          </div>

          <h3 className="v-subhead">1. Components</h3>
          <ul className="v-components">
            <li className={data ? "ok" : "wait"}>{data ? <CheckCircle2 size={15} /> : <CircleDashed size={15} />} FalkorDB graph connected</li>
            <li className={healthy ? "ok" : "no"}>{healthy ? <CheckCircle2 size={15} /> : <XCircle size={15} />} Checkout services responding over HTTP</li>
            <li className={!components ? "wait" : components.mcp?.success ? "ok" : "no"}>
              {!components ? <CircleDashed size={15} /> : components.mcp?.success ? <CheckCircle2 size={15} /> : <XCircle size={15} />} Fresh MCP agent session with graph tools</li>
            <li className={!components ? "wait" : components.model?.success ? "ok" : "no"}>
              {!components ? <CircleDashed size={15} /> : components.model?.success ? <CheckCircle2 size={15} /> : <XCircle size={15} />} Real model inference
              {components?.model?.error && <small> · {components.model.error}</small>}</li>
          </ul>

          <h3 className="v-subhead">2. Live cases</h3>
          <ol className="v-cases">
            {ids.map((id, i) => {
              const state = states[id] || {}, info = CASE_INFO[id];
              const status = state.finished ? (state.finished.passed ? "ok" : "no") : state.started ? "run" : "wait";
              return (
                <li key={id} className={"v-case " + status}>
                  <span className="v-case-icon">
                    {status === "ok" && <CheckCircle2 size={18} />}{status === "no" && <XCircle size={18} />}
                    {status === "run" && <LoaderCircle size={18} className="spin" />}{status === "wait" && <CircleDashed size={18} />}
                  </span>
                  <div className="v-case-body">
                    <div className="v-case-title"><span className="v-num">{String(i + 1).padStart(2, "0")}</span>
                      <b>{info?.title || id}</b><span className="v-cat">{info?.category}</span>
                      <span className="v-state">{status === "ok" ? "Pass" : status === "no" ? "Fail" : status === "run" ? "Running" : "Waiting"}</span></div>
                    <p><span>Should happen:</span> {(state.started || state.finished)?.expected || "Starts when the previous case finishes."}</p>
                    {state.finished && <p><span>Measured:</span> <Measured result={state.finished} /></p>}
                  </div>
                </li>);
            })}
          </ol>
          {current.blocker && !running && <p className="v-blocker">{current.blocker}</p>}
          {current.last_error && !running && <p className="v-blocker">{current.last_error}</p>}
          <p className="v-foot">Every case also runs from a terminal: <code>.\graphops.ps1 certify --suite {suite === "all" ? "all" : "quick"}</code>.
            Full reports are saved in <code>.runtime/reports/judge-{current.id.toLowerCase()}.json</code>.</p>
        </section>
      ) : (
        <section className="panel v-empty"><ShieldCheck size={22} /><p>Choose a check above. Progress and results appear here as each case runs.</p></section>
      )}

      {checks.length > 0 && (
        <section className="panel v-history">
          <h2>Earlier checks</h2>
          <ul>{checks.slice(0, 8).map(t => (
            <li key={t.id}><button className="plain-link" onClick={() => choose(t.id, t)}>
              <span>{t.title}</span><span className="subtle">{t.id} · {new Date(t.created_at).toLocaleString()}</span>
              <span className={"v-pill " + (t.status === "checked" ? "ok" : t.job === "running" ? "run" : "no")}>
                {t.status === "checked" ? "Passed" : t.job === "running" ? "Running" : typeof t.verification === "object" ? `${t.verification.passed}/${t.verification.runs}` : "Did not pass"}</span>
            </button></li>))}</ul>
        </section>)}
    </div>
  );
}
