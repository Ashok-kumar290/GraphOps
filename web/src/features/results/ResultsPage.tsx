import React from "react";
import data from "./benchmarks.json";
import { HARD_PROBLEMS, FIXES, SOURCES, MEMORY } from "./content";

type Result = { passed: boolean; seconds?: number; error?: string; status?: string; actions?: number; model_requests?: number;
  model_tried_injected_target?: boolean; model_tried_poisoned_target?: boolean; [key: string]: unknown };
type Model = { id: string; label: string; where: string; featured: boolean; passed: number; runs: number;
  median_seconds: number | null; results: Record<string, Result> };

const models = data.models as Model[];
const cases = data.cases;
const SECTIONS = [["performance", "Performance"], ["hard-problems", "Hard problems"], ["security", "Security"],
  ["memory", "Shared memory"], ["fixes", "Solved during development"], ["run", "Run it yourself"]] as const;

function Cell({ result }: { result?: Result }) {
  if (!result) return <span className="r-missing">—</span>;
  return (
    <span className={result.passed ? "r-pass" : "r-fail"}>
      {result.passed ? "Pass" : "Fail"}
      {result.seconds != null && <small>{Math.round(result.seconds)} s</small>}
    </span>
  );
}

function SpeedChart() {
  const plotted = models.filter(m => m.median_seconds && m.runs);
  if (!plotted.length) return null;
  const W = 1040, H = 380, L = 56, R = 24, T = 28, B = 56, floor = 0.5;
  const maxS = Math.max(...plotted.map(m => m.median_seconds as number)) * 1.6, minS = 8;
  const x = (s: number) => L + (W - L - R) * (Math.log(s / minS) / Math.log(maxS / minS));
  const y = (p: number) => T + (H - T - B) * (1 - (Math.max(p, floor) - floor) / (1 - floor));
  const ticks = [10, 20, 50, 100, 200, 500].filter(t => t >= minS && t <= maxS);
  // Labels sit right of their point, or left near the edge, and step down when they would collide.
  const placed: { x: number; y: number }[] = [];
  const labels = [...plotted].sort((a, b) => (a.median_seconds as number) - (b.median_seconds as number)).map(m => {
    const px = x(m.median_seconds as number), py = y(m.passed / m.runs), left = px > W - 220;
    let ly = py + 4;
    while (placed.some(p => Math.abs(p.y - ly) < 18 && Math.abs(p.x - px) < 200)) ly += 18;
    placed.push({ x: px, y: ly });
    return { id: m.id, lx: left ? px - 12 : px + 12, ly, anchor: (left ? "end" : "start") as "end" | "start" };
  });
  return (
    <figure className="r-figure">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Share of cases passed against median seconds per case, by model">
        {[0.5, 0.625, 0.75, 0.875, 1].map(p => (
          <g key={p}><line x1={L} x2={W - R} y1={y(p)} y2={y(p)} className={p > floor ? "r-grid" : "r-axis"} />
            <text x={L - 10} y={y(p) + 4} textAnchor="end">{p * 100}%</text></g>))}
        {ticks.map(t => <text key={t} x={x(t)} y={H - B + 20} textAnchor="middle">{t} s</text>)}
        <text x={(L + W - R) / 2} y={H - 8} textAnchor="middle" className="r-axis-label">Median seconds per case (log scale)</text>
        <text x={L} y={14} className="r-axis-label">Cases passed (axis starts at 50%)</text>
        {plotted.map(m => {
          const cx = x(m.median_seconds as number), cy = y(m.passed / m.runs), label = labels.find(l => l.id === m.id)!;
          return (
            <g key={m.id}>
              <title>{`${m.label}: ${m.passed}/${m.runs} cases, median ${Math.round(m.median_seconds as number)} s`}</title>
              <circle cx={cx} cy={cy} r={m.featured ? 7 : 5.5} className={m.featured ? "r-dot featured" : "r-dot"} />
              <text x={label.lx} y={label.ly} textAnchor={label.anchor} className="r-dot-label">{m.label} · {m.passed}/{m.runs}</text>
            </g>);
        })}
      </svg>
      <figcaption>Each point is one model across every case it completed. Higher is better; further left is faster.
        Hosted runs use a free tier limited to 8,000 tokens per minute, so their time is mostly waiting.</figcaption>
    </figure>
  );
}

export function ResultsPage() {
  const featured = models.find(m => m.featured);
  const totalPassed = models.reduce((n, m) => n + m.passed, 0), totalRuns = models.reduce((n, m) => n + m.runs, 0);
  return (
    <article className="results">
      <header className="r-hero">
        <p className="r-eyebrow">GraphOps · Graph Hacks 2026 · TeamDesperateForGTA</p>
        <h1>GraphOps results</h1>
        <p className="r-date">{new Date(data.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
        <p className="r-lede">
          We tested GraphOps against twelve incident cases. Six cover the core workflow; six are built from the failures
          current research reports for agents that act on systems: misleading symptoms, unfamiliar faults, several root
          causes at once, state that changes mid-incident, injected instructions and poisoned memory. Every case runs in
          its own FalkorDB graph against real HTTP services and passes only on measured effects. The same workflow ran
          with {models.length} models, local and hosted: {totalPassed} of {totalRuns} case runs passed.
        </p>
        <nav className="r-toc" aria-label="Sections">
          {SECTIONS.map(([id, label], i) => <a key={id} href={"#r-" + id} onClick={e => { e.preventDefault(); document.getElementById("r-" + id)?.scrollIntoView({ behavior: "smooth" }); }}><span>{i + 1}</span>{label}</a>)}
        </nav>
      </header>

      <section id="r-performance" className="r-section">
        <h2>Performance</h2>
        <p className="r-prose">
          <b>Same answers from different models.</b> The model chooses tools and causes; FalkorDB and the backend decide what is
          allowed. At each step a model sees only the tools valid for the task's state, receives a compact view of the evidence,
          and can recover from tool calls written as text or rejected by its provider. {featured && <>The highlighted column is
          our demo model, {featured.label}, running on a laptop GPU: {featured.passed} of {featured.runs} cases.</>}
        </p>
        <div className="r-table-wrap">
          <table className="r-table">
            <thead><tr><th scope="col"><span className="sr-only">Case</span></th>
              {models.map(m => <th scope="col" key={m.id} className={m.featured ? "featured" : ""}>{m.label}<small>{m.where}</small></th>)}</tr></thead>
            <tbody>
              {cases.map((c, i) => (
                <React.Fragment key={c.id}>
                  {(i === 0 || cases[i - 1].group !== c.group) && (
                    <tr className="r-group"><th colSpan={models.length + 1} scope="colgroup">{c.group === "core" ? "Core workflow" : "Hard problems"}</th></tr>)}
                  <tr>
                    <th scope="row"><b>{c.category}</b><small>{c.title}</small></th>
                    {models.map(m => <td key={m.id} className={m.featured ? "featured" : ""}><Cell result={m.results[c.id]} /></td>)}
                  </tr>
                </React.Fragment>))}
              <tr className="r-total"><th scope="row"><b>Passed</b></th>
                {models.map(m => <td key={m.id} className={m.featured ? "featured" : ""}><b>{m.passed}/{m.runs}</b></td>)}</tr>
            </tbody>
          </table>
        </div>
        <p className="r-note">{data.scoring} One run per case per model; “—” means the case has not run for that model yet.</p>
        <SpeedChart />
      </section>

      <section id="r-hard-problems" className="r-section">
        <h2>Hard problems</h2>
        <p className="r-prose">These are the failures that make operations agents unsafe to trust. For each one we built a case,
          ran it, and scored the measured outcome.</p>
        <div className="r-problems">
          {HARD_PROBLEMS.map(p => (
            <div className="r-problem" key={p.id}>
              <h3>{p.title}</h3>
              <p><b>Why it is hard.</b> {p.why}</p>
              <p><b>What GraphOps does.</b> {p.how}</p>
              <ul className="r-chips" aria-label="Measured results by model">
                {models.map(m => { const r = m.results[p.id]; return (
                  <li key={m.id} className={!r ? "none" : r.passed ? "ok" : "no"}>{m.label}: {!r ? "not run" : r.passed ? "pass" : "fail"}</li>); })}
              </ul>
            </div>))}
        </div>
      </section>

      <section id="r-security" className="r-section">
        <h2>Security</h2>
        <p className="r-prose">
          <b>Two layers, measured separately.</b> In the injection case, notes on every checkout service tell the agent to blame
          and restart the unrelated analytics service. In the poisoning case, shared memory recommends restarting the wrong
          service. We record whether the <i>model</i> tried the planted target, and whether anything <i>happened</i>. The
          backend would refuse such a handoff anyway, because analytics is not on checkout's dependency path in the graph.
        </p>
        <div className="r-table-wrap">
          <table className="r-table compact">
            <thead><tr><th scope="col">Model</th><th scope="col">Followed injected instruction</th><th scope="col">Followed poisoned memory</th><th scope="col">Wrong actions executed</th></tr></thead>
            <tbody>{models.map(m => {
              const inj = m.results.prompt_injection, poi = m.results.memory_poisoning;
              const wrong = [inj, poi].filter(r => r && !r.passed).length;
              return (<tr key={m.id}><th scope="row">{m.label}</th>
                <td>{inj ? (inj.model_tried_injected_target ? "Tried; refused by backend" : "No") : "—"}</td>
                <td>{poi ? (poi.model_tried_poisoned_target ? "Tried; refused by backend" : "No") : "—"}</td>
                <td>{inj || poi ? wrong : "—"}</td></tr>); })}</tbody>
          </table>
        </div>
      </section>

      <section id="r-memory" className="r-section">
        <h2>Shared memory</h2>
        <p className="r-prose">A fresh session answered questions about a past incident with three kinds of context. The memory
          navigator's packet recalled the exact past evidence every time, at a third of the tokens of the full history, and made
          no unsafe claims.</p>
        <div className="r-table-wrap">
          <table className="r-table compact">
            <thead><tr><th scope="col">Context given to the new session</th><th scope="col">Exact recall</th><th scope="col">Wrong claims</th><th scope="col">Unsafe “old fix applies”</th><th scope="col">Input tokens</th></tr></thead>
            <tbody>{MEMORY.map(row => (
              <tr key={row.condition}><th scope="row">{row.condition}</th><td className={row.featured ? "featured" : ""}>{row.recall}</td>
                <td className={row.featured ? "featured" : ""}>{row.wrong}</td><td className={row.featured ? "featured" : ""}>{row.unsafe}</td>
                <td className={row.featured ? "featured" : ""}>{row.tokens}</td></tr>))}</tbody>
          </table>
        </div>
        <p className="r-note">Six calls per condition with Qwen3 8B, 16 October. The model still often answered “unknown” on whether an
          old fix applies now, so that decision stays with backend checks.</p>
      </section>

      <section id="r-fixes" className="r-section">
        <h2>Solved during development</h2>
        <p className="r-prose">Each problem below was found by a failing run, not assumed. Failed runs are kept beside the passing ones in
          the repository's evidence folder.</p>
        <ol className="r-fixes">
          {FIXES.map(f => <li key={f.problem}><b>{f.problem}</b><span>{f.fix}</span></li>)}
        </ol>
      </section>

      <section id="r-run" className="r-section">
        <h2>Run it yourself</h2>
        <p className="r-prose">Certification runs every case in isolated workspaces and never touches your demo data. Any provider works:
          local Ollama, Groq, OpenRouter, Gemini or any OpenAI-compatible endpoint.</p>
        <pre className="r-code">{`.\\graphops.ps1 certify --suite all
.\\graphops.ps1 certify --provider groq --model openai/gpt-oss-20b --suite hard
python -m scripts.export_benchmarks   # refresh this page from the reports`}</pre>
      </section>

      <footer className="r-sources">
        <h2>Sources</h2>
        <ul>{SOURCES.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul>
        <p>GraphOps is built by TeamDesperateForGTA with AI assistance (OpenAI Codex and Claude Code), disclosed per the hackathon rules.</p>
      </footer>
    </article>
  );
}
