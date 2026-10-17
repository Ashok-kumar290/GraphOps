"""Jira Cloud: issues from the REST search API (/rest/api/3/search) or a saved response of it.

One record per issue. Components and labels hint at the service; assignee and reporter become people.
Descriptions in Atlassian Document Format are flattened to plain text.
"""
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
import httpx

FIELDS = "summary,status,assignee,reporter,components,labels,description,updated,issuetype,priority"


def flatten(node):
    """Atlassian Document Format to plain text; plain strings pass through."""
    if node is None: return ""
    if isinstance(node, str): return node
    if node.get("type") == "text": return node.get("text", "")
    parts = [flatten(child) for child in node.get("content", [])]
    return ("\n" if node.get("type") in {"doc", "paragraph", "listItem"} else "").join(parts)


def records_from_search(body, base_url=""):
    records = []
    for issue in body.get("issues", []):
        f = issue["fields"]
        person = lambda key: (f.get(key) or {}).get("displayName")
        records.append({"tool": "jira", "external_id": issue["key"], "kind": "ticket",
                        "title": f"{issue['key']}: {f.get('summary', '')}",
                        "text": f"{(f.get('issuetype') or {}).get('name', 'Issue')} · {(f.get('status') or {}).get('name')} · "
                                f"priority {(f.get('priority') or {}).get('name', 'none')}\n{flatten(f.get('description')).strip()}",
                        "author": person("reporter"), "people": {"assignee": person("assignee"), "reporter": person("reporter")},
                        "status": (f.get("status") or {}).get("name"), "time": f.get("updated"),
                        "url": f"{base_url.rstrip('/')}/browse/{issue['key']}" if base_url else None,
                        "hints": [c.get("name", "") for c in f.get("components", [])] + list(f.get("labels", []))})
    return records


def records_from_file(path):
    return records_from_search(json.loads(Path(path).read_text(encoding="utf-8")))


def records_from_api(jql="updated >= -30d ORDER BY updated DESC", limit=50):
    """Requires JIRA_BASE_URL (https://YOUR-SITE.atlassian.net), JIRA_EMAIL and JIRA_API_TOKEN in .env."""
    base = os.environ["JIRA_BASE_URL"].rstrip("/")
    if urlsplit(base).scheme != "https": raise ValueError("JIRA_BASE_URL must use HTTPS")
    with httpx.Client(timeout=20, auth=(os.environ["JIRA_EMAIL"], os.environ["JIRA_API_TOKEN"])) as client:
        response = client.get(base + "/rest/api/3/search", params={"jql": jql, "maxResults": limit, "fields": FIELDS})
    if response.status_code != 200: raise ValueError(f"Jira search failed with HTTP {response.status_code}")
    return records_from_search(response.json(), base)
