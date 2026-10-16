"""Model-independent steering. Narrow what any model is offered; never widen what the backend allows.

Every function here only shapes the model's view or the tools offered at a step.
Backend validation in the MCP tools stays the authority for every effect.
"""
import json
import re

READ_ONLY = {"checkpoint", "inspect_incident", "inspect_dependencies", "observe_service",
             "company_context", "search_company", "read_source", "recall_memory"}


def allowed_tools(role, task, plan_ready):
    """Tool names valid for the current task state, or None for no restriction."""
    if role != "resolver": return None
    if task.get("status") == "resolved":
        return set() if task.get("ticket_closed") else {"complete_ticket"}
    if plan_ready: return READ_ONLY | {"prepare_recovery", "execute_recovery"}
    return READ_ONLY | {"prepare_recovery"}


TOOL_TAG = re.compile(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", re.S)
FENCE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.S)


def parse_text_tool_calls(text, names):
    """Recover tool calls a model wrote as text. Only offered tool names are accepted."""
    candidates = TOOL_TAG.findall(text) or FENCE.findall(text)
    stripped = text.strip()
    if not candidates and stripped.startswith("{") and stripped.endswith("}"): candidates = [stripped]
    calls = []
    for raw in candidates:
        try: value = json.loads(raw)
        except ValueError: continue
        if not isinstance(value, dict): continue
        name = value.get("name") or value.get("tool")
        args = value.get("arguments", value.get("args", value.get("parameters", {})))
        if isinstance(args, str):
            try: args = json.loads(args)
            except ValueError: continue
        if name in names and isinstance(args, dict):
            calls.append({"name": name, "args": args, "id": f"text-{len(calls)}"})
    return calls


HISTORY_FOR_MODEL = 3
DOCUMENT_CHARS = 400


def model_view(tool, result):
    """A compact copy of a tool result for the model's context. The full result stays persisted."""
    if not isinstance(result, dict): return result
    view = dict(result)
    if tool == "recall_memory" and isinstance(view.get("historical"), list) and len(view["historical"]) > HISTORY_FOR_MODEL:
        records = sorted(view["historical"], key=lambda r: r.get("created_at", ""), reverse=True)
        view["historical"] = records[:HISTORY_FOR_MODEL]
        view["historical_omitted"] = len(records) - HISTORY_FOR_MODEL
    if tool == "company_context" and isinstance(view.get("documents"), list):
        documents = []
        for doc in view["documents"]:
            doc = dict(doc)
            text = doc.get("text")
            if isinstance(text, str) and len(text) > DOCUMENT_CHARS:
                doc["text"] = text[:DOCUMENT_CHARS]
                doc["text_truncated"] = True
            documents.append(doc)
        view["documents"] = documents
    return view


def investigation_candidates(incident):
    """Services on the incident's graph paths that fail with their own error, per current measurements."""
    if not isinstance(incident, dict): return []
    connected = {incident.get("incident_service")}
    for path in (incident.get("topology") or {}).get("paths", []):
        connected.update(path.get("services", []))
    return [o["service"] for o in incident.get("observations", [])
            if o.get("service") in connected and o.get("http_status") == 503 and o.get("error")]


def guidance(role, task, incident):
    """A stall message listing the valid next calls, computed from current evidence."""
    if role == "investigator":
        causes = investigation_candidates(incident)
        options = [f'handoff_target(cause_service="{s}")' for s in causes]
        options.append('conclude_investigation(reason="...") if the evidence does not support a cause')
        return ("You have not called a tool that completes this step. Valid next calls given the current graph and "
                "measurements: " + "; ".join(options) + ". Choose one and call it.")
    if role == "resolver":
        if task.get("status") == "resolved": return "Recovery is measured. Call complete_ticket() now."
        return ("Call prepare_recovery(). If it returns ready=true, call execute_recovery with its exact plan_id. "
                "If it returns terminal=true, stop.")
    return None
