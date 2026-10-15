"""Synthetic company/service fixture; executable actions live in actions/."""
SERVICES = ("gateway", "orders", "payments", "analytics")
DEPENDENCIES = {"gateway": "orders", "orders": "payments"}
SCENARIOS = {"config": {"label": "Payments configuration", "target": "payments", "action": "restore_config"},
             "worker": {"label": "Orders worker", "target": "orders", "action": "restart_worker"}}
