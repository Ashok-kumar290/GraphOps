# Connected CLI and live monitoring

The CLI connects to the running GraphOps server. It shares the web app's job,
company graph, services, evidence and memory. Start the app in one terminal:

```powershell
.\start.ps1
```

Open another terminal in this repository:

```powershell
.\graphops.ps1 monitor
```

Both the parent workspace and this repository have a `graphops.ps1` launcher.
On Linux/macOS or in a virtual environment, use `python -m graphops.cli` followed
by the same arguments. Docker package commands can also use that Python entry.
Relative import and export paths resolve from the terminal's current directory,
including when the launcher is invoked from another folder.

On Windows, `start.ps1` can start an installed Docker Desktop when the daemon is
stopped. It checks both system and per-user installation locations, then reuses
the existing FalkorDB container so saved company data and runs remain available.

## One complete demonstration

```powershell
.\graphops.ps1 demo
```

This uses the selected live model and walks through all six modules:

1. **Company knowledge:** import/retrieve a synthetic CLI policy, ask the company
   agent and require a citation to that policy.
2. **Graph:** retrieve the actual gateway dependency paths from FalkorDB.
3. **Agent:** start an investigator, then a resolver with a fresh session.
4. **Actions:** prepare a validated plan, execute recovery and measure HTTP health.
5. **Memory:** save and retrieve sourced episodes, procedures and health facts.
6. **Workspace:** retrieve the completed report and operational status.

The CLI prints persisted events as they happen: session starts, model request
starts and timings, tool names, evidence IDs, plan readiness, measured recovery,
memory writes and the final checkpoint. It displays the execution mode.

`demo --mode scripted` exercises infrastructure with a deterministic policy.
It does not validate model inference or policy-answer citation accuracy. A live
demo checks known source locations, not full claim entailment.

The simulator must not have an unresolved prior failure. Use `status` and
`history`, then resume the existing incident before starting another drill.
The unrelated analytics failure intentionally remains HTTP 503 during a drill;
gateway and the selected target must recover without changing that service.

## Monitor jobs and processes

```powershell
.\graphops.ps1 monitor
.\graphops.ps1 monitor --task INC-EXAMPLE
.\graphops.ps1 monitor --duration 30 --interval 2
.\graphops.ps1 monitor --once
.\graphops.ps1 status
.\graphops.ps1 modules
```

The dashboard displays:

- State and relevant counts for all six product modules.
- FalkorDB queries, lab controller, selected model and MCP verification status.
- Selected job status, target, error/blocker and latest saved event.
- Actual PID, current resident memory, accumulated CPU seconds and uptime for
  the Node API, Python worker and Go simulator on Windows and Linux.
- The MCP process PID last reported by a checkpoint. This is explicitly labeled
  as a past observation, not a heartbeat or proof that the process is still alive.
- HTTP status, health and configuration revision for each controlled service.

CPU seconds are process CPU time, not utilization percentage. Memory is resident
memory, not total system/GPU usage. Process IDs are local to the server/container;
the CLI never reads process command lines or environment variables. FalkorDB and
model availability are connection checks; their OS processes are not enumerated.
An installed model is distinguished from verified inference.

TTY output refreshes in place where supported. Use `--plain` for append-only
frames. Noninteractive output has no screen-clearing escapes. `--json` emits a
typed JSON record per snapshot for scripts. A degraded connection is visible;
continuous monitors retry. Ctrl+C detaches without stopping the server job.

## Start, follow, stop and resume

```powershell
.\graphops.ps1 run --scenario config
.\graphops.ps1 investigate --scenario worker
.\graphops.ps1 resume INC-EXAMPLE
.\graphops.ps1 run --scenario config --detach
.\graphops.ps1 watch INC-EXAMPLE
.\graphops.ps1 stop INC-EXAMPLE
.\graphops.ps1 events INC-EXAMPLE --limit 100
.\graphops.ps1 watch INC-EXAMPLE --after EVENT_ID
```

Task commands wait and show progress by default. `--detach` returns the task ID
immediately. `watch` replays durable graph events, then follows until a checkpoint.
It pages beyond the UI's latest-500-event window. Cursor IDs belong to one run;
IDs from a different run are rejected. Restart/reconnect uses saved state.

A stop takes effect between requests/operations and does not undo an already
executed action. A watch timeout leaves the server job running. There is no
automatic retry of an ambiguous failed mutation; inspect status/history before
resubmitting. Exit code 0 means a supported completion/handoff or requested stop,
2 means a blocked/interrupted task, 1 means a command/connection error, and 130
means the terminal was interrupted.

## Work with every module

```powershell
.\graphops.ps1 company --service payments
.\graphops.ps1 import .\policy.md --title "Synthetic policy" --service payments --type policy
.\graphops.ps1 search "refund" --service payments
.\graphops.ps1 source DOCUMENT_ID
.\graphops.ps1 source DOCUMENT_ID --revision REVISION_ID
.\graphops.ps1 ask "Who owns payments? Cite sources." --service payments
.\graphops.ps1 company --service payments --owner "Synthetic Payments Team"
.\graphops.ps1 company --service payments --retire-runbook
.\graphops.ps1 company --service payments --restore-runbook
.\graphops.ps1 graph --service gateway
.\graphops.ps1 memory payments
.\graphops.ps1 history --search "payments"
.\graphops.ps1 report INC-EXAMPLE --out .\incident.json
.\graphops.ps1 backup .\workspace-backup.json
.\graphops.ps1 doctor
```

Update an imported source with `import FILE --title TITLE --id DOCUMENT_ID
--base-revision CURRENT_REVISION`. Text/Markdown limits and source revision checks
are enforced by the same backend used by the UI. Imports remain reference data
and cannot authorize an action. Output files refuse overwrites.

## Authentication, remote access and JSON

Default origin: `http://127.0.0.1:8080`. Use a different origin explicitly:

```powershell
.\graphops.ps1 --url https://YOUR_HOSTNAME monitor
.\graphops.ps1 monitor --once --json
.\graphops.ps1 demo --json
```

When access is required, the client reads `GRAPHOPS_ACCESS_TOKEN` from local
configuration or asks in a hidden interactive prompt. Tokens are not accepted as
command-line arguments or printed. The client uses the server's HttpOnly cookie,
does not follow redirects, and requires HTTPS for non-loopback origins.
`--workspace NAME` can guard against submitting to the wrong connected workspace.

Single-read commands output JSON objects in JSON mode; progress emits typed
`accepted`, `event`, `checkpoint`, `complete` and `demo_complete` JSON Lines.
Model output is visible text only; hidden reasoning is not logged.

## Standalone and restore

The default CLI never launches another lab. To own a separate local runtime,
stop the web app first or choose a separate workspace and free lab port:

```powershell
.\graphops.ps1 --standalone investigate --mode scripted
.\graphops.ps1 --standalone resume INC-EXAMPLE
.\graphops.ps1 --standalone --workspace separate-demo --port 9065 run
.\graphops.ps1 --workspace restored-demo --port 9165 restore .\workspace-backup.json
```

Standalone supports run, investigate, resume, ask, doctor, status, memory and
backup. Connected monitoring and company management require the running server.
Restore is an offline operation and always requires a new workspace name.
Provider configuration also remains local and uses hidden prompts.
