# Local integration — v0.7

Default: loopback browser and explicit copied request prompts. Optional
`serve --codex` starts an experimental, non-escalating stdio adapter; read bridge.md.
No HTTP endpoint accepts arbitrary shell commands. Evidence commands are explicit
local CLI actions that execute project code under normal user authorization.

## Commands

`doctor`, `scan [--summary]`, `serve [--open] [--codex]`, `impact --node PATH`,
`tasks`, `task --id ID`, `plan --id ID --file JSON`,
`review --id ID --decision approve|revise --revision N --snapshot ID`,
`start --id ID`, `complete --id ID [--summary TEXT] [--checks-file JSON]`,
`evidence --id ID --file JSON`, `wait --timeout 50`, `migrate-state --project PATH`.

An empty completion retry reuses the saved request. Use the installed launcher's
help. Quote paths safely; never interpolate untrusted task text as shell code.
Node IDs are relative paths; source code and ordinary artifact IDs may appear in
plans. New artifacts need a planned node. Use plan-format.md for exact schemas.

## HTTP

All mutation routes retain same-origin/Host/token checks and JSON limits.
- Feature rename; plan review; retry-finalization.
- Pause (actual stop acknowledgment); resume-plan; restore-preview; restore-apply.
- `/api/tasks/ID/manage`: cancel, archive, unarchive. No purge operation.
- Optional `/api/codex/run`, interrupt, reset-thread. Extra privilege approval is
  refused, not silently granted.

`/api/tasks?brief=1&offset=0&limit=30&archived=1` provides bounded history summaries.
`/api/activity` returns a metadata version for polling, not source content.
`/api/storage` returns on-demand byte counts without deleting backups.
`/api/connection` reports opt-in mode, compatibility/auth diagnostics and progress.
Only registered hash-checked PNG/JPEG artifacts are served at `/api/evidence/...`.

Controller state is `.agents/project-map-state`; project-wide coordination is
`.agents/project-map-control`. Both must remain ignored/private. Migration from
old `.project-map` is explicit and retains the original. Custom state locations
remain available for trusted manual workflows; direct execution refuses an
unprotected location. Lifecycle calls must come from the trusted controller/host,
not a coding worker that has write access to its own approvals.

Saving, approving, running, finalizing, verified, reported and unverified are
distinct states. Restore affects planned local files, not external systems.
