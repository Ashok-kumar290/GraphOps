"""Slack: the official workspace export (folders of daily JSON files) or the Web API with a bot token.

One record per thread: a parent message and its replies become one chat document, posted by the
thread's author. Channel names hint at the service (for example #payments-oncall).
"""
import json
import os
from pathlib import Path
import httpx


def records_from_export(folder):
    folder = Path(folder)
    users = {u["id"]: (u.get("real_name") or u.get("name") or u["id"]) for u in json.loads((folder / "users.json").read_text(encoding="utf-8"))}
    channels = json.loads((folder / "channels.json").read_text(encoding="utf-8"))
    messages = {}
    for channel in channels:
        for day in sorted((folder / channel["name"]).glob("*.json")):
            messages.setdefault(channel["name"], []).extend(json.loads(day.read_text(encoding="utf-8")))
    return records_from_messages(messages, users)


def records_from_messages(messages, users):
    records = []
    for channel, items in messages.items():
        threads = {}
        for m in sorted(items, key=lambda m: float(m["ts"])):
            if m.get("subtype") in {"channel_join", "channel_leave", "bot_add"}: continue
            threads.setdefault(m.get("thread_ts", m["ts"]), []).append(m)
        for ts, thread in threads.items():
            parent = thread[0]
            author = users.get(parent.get("user"), parent.get("user", "unknown"))
            lines = [f"{users.get(m.get('user'), m.get('user', 'unknown'))}: {m.get('text', '')}" for m in thread]
            records.append({"tool": "slack", "external_id": f"{channel}/{ts}", "kind": "chat",
                            "title": f"#{channel}: {parent.get('text', '')[:80]}", "text": "\n".join(lines),
                            "author": author, "people": {"author": author}, "status": None,
                            "time": ts, "url": None, "hints": [channel]})
    return records


def records_from_api(token=None, limit=100):
    """Public channels the bot is a member of. Requires SLACK_BOT_TOKEN with channels:history and users:read."""
    token = token or os.environ["SLACK_BOT_TOKEN"]
    headers = {"Authorization": "Bearer " + token}
    with httpx.Client(base_url="https://slack.com/api", headers=headers, timeout=20) as client:
        def call(method, **params):
            body = client.get(method, params=params).json()
            if not body.get("ok"): raise ValueError(f"Slack {method} failed: {body.get('error', 'unknown error')}")
            return body
        users = {u["id"]: (u.get("real_name") or u.get("name")) for u in call("users.list", limit=200)["members"]}
        messages = {}
        for channel in call("conversations.list", types="public_channel", limit=200)["channels"]:
            if not channel.get("is_member"): continue
            messages[channel["name"]] = call("conversations.history", channel=channel["id"], limit=limit)["messages"]
    return records_from_messages(messages, users)
