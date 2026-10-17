"""Build the Results page data from certification reports. Every number on that page comes from here.

Usage: python -m scripts.export_benchmarks
Reads .runtime/reports/certify-*.json, merges reports per model, and writes
web/src/features/results/benchmarks.json and evidence/benchmarks.json.
"""
import json
import re
import statistics
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / ".runtime" / "reports"

CASES = [
    ("config", "core", "Root cause across dependencies", "Payments configuration fault"),
    ("worker", "core", "A different recovery action", "Orders worker fault"),
    ("changed_runbook", "core", "Company policy governs action", "Runbook retired mid-incident"),
    ("removed_edge", "core", "The graph governs action", "Dependency edge removed"),
    ("repeated", "core", "Memory across sessions", "Same fault, new session"),
    ("company", "core", "Company knowledge", "Cited answer from sources"),
    ("prompt_injection", "hard", "Security", "Injected instructions in company documents"),
    ("memory_poisoning", "hard", "Security", "Poisoned shared memory"),
    ("unknown_fault", "hard", "Unfamiliar failure", "No runbook covers the fault"),
    ("double_fault", "hard", "Multiple root causes", "Two services fail at once"),
    ("self_healed", "hard", "State changes mid-incident", "Fault clears before recovery"),
    ("concurrent_resolvers", "hard", "Coordination", "Two resolvers race on one handoff"),
]
LABELS = {
    "qwen3:8b": ("Qwen3 8B", "Local · Ollama · RTX 4060"),
    "qwen/qwen3.8-27b": ("Qwen3.8 27B", "Hosted · Groq"),
    "openai/gpt-oss-20b": ("gpt-oss 20B", "Hosted · Groq"),
    "openai/gpt-oss-120b": ("gpt-oss 120B", "Hosted · Groq"),
}
FEATURED = "qwen3:8b"
QUOTA = re.compile(r"HTTP 429|rate limit|quota", re.I)


def summarize(runs):
    """One case across repeated runs: pass count, median time, totals, and the first useful trace."""
    first = runs[0]
    passing = [r for r in runs if r["passed"]]
    summary = {k: v for k, v in first.items() if k not in {"round", "trace"}}
    summary.update(passed=len(passing) == len(runs), pass_count=len(passing), run_count=len(runs),
                   seconds=statistics.median(r["seconds"] for r in runs if "seconds" in r),
                   refused_fix_requests=sum(r.get("refused_fix_requests") or 0 for r in runs),
                   input_tokens=sum(r.get("input_tokens") or 0 for r in runs))
    for flag in ("model_tried_injected_target", "model_tried_poisoned_target"):
        if any(flag in r for r in runs): summary[flag] = any(r.get(flag) for r in runs)
    failed = next((r for r in runs if not r["passed"]), None)
    summary["error"] = failed.get("error") if failed else None
    trace = next((r.get("trace") for r in passing if r.get("trace")), None)
    if trace: summary["trace"] = trace
    return summary


def grouped(results):
    cases = {}
    for r in results: cases.setdefault(r["case"], []).append(r)
    return cases


def totals(results):
    rows = list(results.values())
    core = [r for c, r in results.items() if c in {x[0] for x in CASES if x[1] == "core"}]
    hard = [r for c, r in results.items() if c in {x[0] for x in CASES if x[1] == "hard"}]
    return dict(passed=sum(r["pass_count"] for r in rows), runs=sum(r["run_count"] for r in rows),
                refused=sum(r["refused_fix_requests"] for r in rows), tokens=sum(r["input_tokens"] for r in rows),
                median_seconds=statistics.median(r["seconds"] for r in rows) if rows else None,
                core=sum(r["pass_count"] for r in core), core_runs=sum(r["run_count"] for r in core),
                hard=sum(r["pass_count"] for r in hard), hard_runs=sum(r["run_count"] for r in hard))


def main():
    merged = {}
    for path in sorted(REPORTS.glob("certify-*.json"), key=lambda p: p.stat().st_mtime):
        if path.name.startswith("certify-judge-"): continue  # judge checks are live demonstrations, not benchmarks
        report = json.loads(path.read_text(encoding="utf-8"))
        model = report["model"]["model"]
        entry = merged.setdefault(model, {"provider": report["model"]["provider"], "results": {}, "checked_at": report["checked_at"]})
        for case, runs in grouped(report["results"]).items():
            completed = [r for r in runs if not QUOTA.search(r.get("error") or "")]
            if not completed:
                # The latest attempt never ran (provider quota), so earlier results for this case no longer apply.
                entry.setdefault("quota", set()).add(case); entry["results"].pop(case, None); continue
            entry["results"][case] = completed  # the latest report wins per case
            entry.get("quota", set()).discard(case)
        entry["checked_at"] = max(entry["checked_at"], report["checked_at"])
    models = []
    for model, entry in merged.items():
        label, where = LABELS.get(model, (model, entry["provider"]))
        results = {case: summarize(runs) for case, runs in entry["results"].items()}
        models.append({"id": model, "label": label, "where": where, "featured": model == FEATURED,
                       "checked_at": entry["checked_at"], "quota_skipped": sorted(entry.get("quota", set())),
                       "results": results, **totals(results)})
    order = list(LABELS)
    models.sort(key=lambda m: order.index(m["id"]) if m["id"] in order else len(order))
    # Agent architectures on the same model: GraphOps against LangGraph ReAct baselines.
    architectures = []
    featured = next((m for m in models if m["featured"]), None)
    if featured:
        architectures.append({"id": "graphops", "label": "GraphOps", "detail": "Graph-governed investigator and resolver sessions",
                              "featured": True, "results": featured["results"], **totals(featured["results"])})
    for arch, label, detail in (("react_graph", "ReAct + graph tool", "LangGraph create_react_agent with a FalkorDB query tool"),
                                ("react", "ReAct", "LangGraph create_react_agent with operations tools")):
        candidates = [REPORTS / f"baseline-{arch}-qwen3-8b-x3.json", REPORTS / f"baseline-{arch}-qwen3-8b.json"]
        path = next((c for c in candidates if c.exists()), None)
        if path:
            report = json.loads(path.read_text(encoding="utf-8"))
            results = {case: summarize(runs) for case, runs in grouped(report["results"]).items()}
            architectures.append({"id": arch, "label": label, "detail": detail, "featured": False, "results": results, **totals(results)})
    # Multi-agent timelines from the featured model's runs; traces stay out of the per-model tables.
    traces = {}
    for m in models:
        for case, r in m["results"].items():
            if m["featured"] and r.get("trace"): traces[case] = r["trace"]
            r.pop("trace", None)
    for a in architectures:
        for r in a["results"].values(): r.pop("trace", None)
    data = {"generated_at": datetime.now(timezone.utc).isoformat(),
            "cases": [{"id": c, "group": g, "category": cat, "title": t} for c, g, cat, t in CASES],
            "models": models, "architectures": architectures, "traces": traces,
            "scoring": "Each case runs in its own FalkorDB graph and Go service fixture. A pass is decided by measured "
                       "HTTP status, recovery action count, task status and ticket state; model prose is not scored."}
    for out in (ROOT / "web" / "src" / "features" / "results" / "benchmarks.json", ROOT / "evidence" / "benchmarks.json"):
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(data, indent=1), encoding="utf-8")
    for m in models: print(f"{m['label']:<14} {m['passed']}/{m['runs']}")


if __name__ == "__main__":
    main()
