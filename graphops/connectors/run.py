"""Run a connector import against a workspace graph. Shared by the worker (app buttons) and the CLI."""
import os
from graphops import settings
from graphops.connectors import github, jira, slack
from graphops.connectors.ingest import ingest

SAMPLES = settings.ROOT / "samples" / "connectors"
DEFAULT_REPOSITORY = "Ashok-kumar290/GraphOps"


def available():
    """Which live connectors have credentials configured. Values are never returned."""
    return {"slack": bool(os.getenv("SLACK_BOT_TOKEN")),
            "jira": all(os.getenv(k) for k in ("JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN")),
            "github": True}


def run(store, tool, source="sample", path=None, repository=None):
    if tool == "slack":
        records = (slack.records_from_api() if source == "live" else
                   slack.records_from_export(path or SAMPLES / "slack-export"))
    elif tool == "jira":
        records = jira.records_from_api() if source == "live" else jira.records_from_file(path or SAMPLES / "jira-search.json")
    elif tool == "github":
        repository = repository or DEFAULT_REPOSITORY
        records = github.records_from_api(repository)
        return {"tool": tool, "source": "live", "records": len(records), "repository": repository, **ingest(store, records, repository=repository)}
    else:
        raise ValueError("Choose slack, jira or github")
    if source == "live" and not available()[tool]: raise ValueError(f"Configure {tool} credentials in .env first")
    return {"tool": tool, "source": source, "records": len(records), **ingest(store, records)}


def status(store):
    counts = {row[0]: row[1] for row in store.read(
        "MATCH (d:Document) WHERE d.source STARTS WITH 'slack' OR d.source STARTS WITH 'jira' OR d.source CONTAINS 'github.com' "
        "OR d.id STARTS WITH 'slack-' OR d.id STARTS WITH 'jira-' OR d.id STARTS WITH 'github-' "
        "RETURN split(d.id, '-')[0], count(d)")}
    people = store.read("MATCH (p:Person) RETURN count(p)")[0][0]
    return {"configured": available(), "documents": {t: counts.get(t, 0) for t in ("slack", "jira", "github")}, "people": people}
