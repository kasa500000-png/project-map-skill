# Architecture — v0.7

`analyzer.mjs` retains source scanning, validated plans and task records.
`workspace.mjs` is the public workflow facade for CLI/HTTP. `task-lock.mjs` owns
cross-process state transactions and worktree-wide modification leases.
`finalize.mjs` prepares reconciled checks, audit and checkpoint seals before
publishing completion; its persisted request enables retries.

`verification.mjs` separates actual current receipts from agent reports.
`graph-review.mjs` preserves before/expected/actual functional views and artifact
memberships. `assurance.mjs` records actual command/image evidence and broader
inventory changes. `safety.mjs` preserves planned local files and journals restore.
`storage.mjs` defines protected controller locations and explicit legacy migration.
`activity.mjs` serves metadata-first polling, bounded summaries and storage usage.

The optional `codex-bridge.mjs` uses `bridge-preflight.mjs` to inspect the installed
protocol before launching a restricted, non-escalating stdio session. It treats
model disposition, successful RPC delivery and actual verification separately.
State changes belong to the trusted controller, not the sandboxed coding worker.
Snapshots are reused only after content verification; changed inputs still rebuild
the graph. No full incremental parser or automatic parallel worker scheduler.

`workbench.*` is Korean-first. `/legacy` retains the older bilingual file view.
Loopback APIs enforce Host/origin/token rules. Generated controller records,
backups and evidence are private state, not public repository deliverables.
