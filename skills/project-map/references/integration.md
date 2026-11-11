# Current integration (v0.6)

Default: loopback browser plus explicit copied request prompts in Codex. Optional:
`serve --codex` uses the local CLI App Server; read [bridge.md](bridge.md) first.
The public launcher also exposes `evidence --id ID --file SPEC_JSON` for explicit
command receipts or registered PNG/JPEG images. No HTTP endpoint accepts arbitrary
shell text. Optional Codex execution itself is requested by task ID/phase and
retains user review and sandbox/permission handling.

Additional same-origin/session-protected POST routes:
`/api/features/rename`, `/api/tasks/ID/pause`, `/api/tasks/ID/resume-plan`,
`/api/tasks/ID/restore-preview`, `/api/tasks/ID/restore-apply`, and optional
`/api/codex/run`, `/api/codex/interrupt`, `/api/codex/decision`.
GET `/api/connection` reports mode and progress. GET `/api/evidence/ID/EVIDENCE_ID`
serves only registered hash-checked raster images. Generated project state,
backups and evidence must remain private and ignored.

The server's direct adapter is opt-in. Code execution, approval, backup and
verification are separate states. Restore does not undo external systems.
Official App Server contract: https://developers.openai.com/codex/app-server

CLI lifecycle remains: `doctor`, `scan`, `serve`, `impact`, `tasks`, `task`,
`plan --file PLAN_JSON`, `review --decision approve|revise --revision N --snapshot ID`,
`start`, `complete --checks-file CHECKS_JSON`, `wait --timeout 50`.
Use the exact help from the installed public launcher; node IDs are relative source
paths. Quote paths safely. Do not interpolate untrusted task text into shell code.
