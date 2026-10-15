"""Explicit supported recovery policy for the synthetic service adapter."""
PROCEDURES = {("payments", "restore_config", "config-broken-v1"),
              ("orders", "restart_worker", "worker-stopped-v1")}
