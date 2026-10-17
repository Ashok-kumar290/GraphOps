"""GitHub: real public data from the REST API. Recent commits, issues and pull requests of one repository.

Records that name a service link to it; the rest attach to the repository node under the project.
A GITHUB_TOKEN in .env raises the API rate limit but is not required for public repositories.
"""
import os
import re
import httpx

REPOSITORY = re.compile(r"[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}")


def records_from_api(repository, limit=20):
    if not REPOSITORY.fullmatch(repository): raise ValueError("Use the form owner/name")
    headers = {"Accept": "application/vnd.github+json"}
    if os.getenv("GITHUB_TOKEN"): headers["Authorization"] = "Bearer " + os.environ["GITHUB_TOKEN"]
    with httpx.Client(base_url="https://api.github.com", headers=headers, timeout=20) as client:
        def get(path, **params):
            response = client.get(path, params=params)
            if response.status_code != 200: raise ValueError(f"GitHub {path} returned HTTP {response.status_code}")
            return response.json()
        commits = get(f"/repos/{repository}/commits", per_page=limit)
        issues = get(f"/repos/{repository}/issues", state="all", per_page=limit)
    records = []
    for c in commits:
        message = c["commit"]["message"]
        author = (c.get("author") or {}).get("login") or c["commit"]["author"]["name"]
        records.append({"tool": "github", "external_id": f"{repository}@{c['sha']}", "kind": "change",
                        "title": f"Commit {c['sha'][:7]}: {message.splitlines()[0][:90]}", "text": message,
                        "author": author, "people": {"committer": author}, "status": "merged",
                        "time": c["commit"]["author"]["date"], "url": c["html_url"], "hints": []})
    for i in issues:
        kind = "pull request" if "pull_request" in i else "issue"
        author = (i.get("user") or {}).get("login")
        assignee = (i.get("assignee") or {}).get("login")
        records.append({"tool": "github", "external_id": f"{repository}#{i['number']}", "kind": "change" if kind == "pull request" else "ticket",
                        "title": f"{kind.capitalize()} #{i['number']}: {i['title'][:90]}", "text": f"{kind} · {i['state']}\n{i.get('body') or ''}",
                        "author": author, "people": {"author": author, "assignee": assignee}, "status": i["state"],
                        "time": i.get("updated_at"), "url": i["html_url"], "hints": [l["name"] for l in i.get("labels", [])]})
    return records
