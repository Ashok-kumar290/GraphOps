"""Small, revision-aware evidence packets. The graph remains authoritative."""
from collections import OrderedDict
import copy
import json
import time
from graphops.core.identity import age

POLICY = {"max_records": 12, "record_data_excerpt_chars": 1500,
          "health_fact_max_age_seconds": 30, "max_cache_seconds": 10}


class Navigator:
    def __init__(self, store):
        self.store, self.cache = store, OrderedDict()

    def packet(self, service, revision):
        key = (self.store.name, self.store.revision(), service, revision)
        cached = self.cache.get(key)
        if cached and time.monotonic() < cached[0]:
            return {**copy.deepcopy(cached[1]), "cache_hit": True}
        company = self.store.company.context(service)
        docs = {d["source"]: d for d in company["documents"]}
        packet = {"service": service, "revision": revision, "active": [], "historical": [],
                  "unverified": [], "conflicts": [], "cache_hit": False, "policy": dict(POLICY)}
        packet['authorizes_execution'] = False
        lifetime = POLICY['max_cache_seconds']
        for record in self.store.memory.list(service)[:POLICY['max_records']]:
            group, reason = "active", "matching_configuration"
            if not record["verified"]: group, reason = "unverified", "unverified_claim"
            elif record["kind"] == "episodic": group, reason = "historical", "past_event"
            elif record["revision"] != revision: group, reason = "historical", "configuration_changed"
            elif record["kind"] == "semantic" and not 0 <= age(record["created_at"]) <= POLICY['health_fact_max_age_seconds']:
                group, reason = "historical", "observation_expired"
            if record["verified"] and record["kind"] == "procedural":
                source = docs.get(record["source"])
                if not source or source["revision"] != record["data"].get("runbook_revision"):
                    group, reason = "historical", "procedure_changed"
            if group == "active" and record["kind"] == "semantic":
                lifetime = min(lifetime, max(0, POLICY['health_fact_max_age_seconds'] - age(record["created_at"])))
            encoded = json.dumps(record["data"])
            if len(encoded) > POLICY['record_data_excerpt_chars']:
                record["data"] = {"excerpt": encoded[:POLICY['record_data_excerpt_chars']], "truncated": True}
            entry = {**record, "validity": reason}
            if record['kind'] == 'procedural':
                entry['procedure_candidate'] = group == 'active'
            packet[group].append(entry)
        claims = {}
        for record in packet["active"]:
            claim = record["data"].get("claim")
            if claim: claims.setdefault(claim, []).append(record)
        for claim, records in claims.items():
            if len({str(r["data"].get("value")) for r in records}) > 1:
                packet["conflicts"].append({"claim": claim, "ids": [r["id"] for r in records]})
        self.cache[key] = (time.monotonic()+lifetime, copy.deepcopy(packet))
        while len(self.cache) > 64: self.cache.popitem(last=False)
        return packet
