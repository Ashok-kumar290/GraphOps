"""UTC timestamps, stable identifiers and source age."""
from datetime import datetime, timezone
import uuid

def now(): return datetime.now(timezone.utc).isoformat()


def uid(): return str(uuid.uuid4())


def age(timestamp):
    try: return (datetime.now(timezone.utc) - datetime.fromisoformat(timestamp)).total_seconds()
    except (ValueError, TypeError): return float("inf")
