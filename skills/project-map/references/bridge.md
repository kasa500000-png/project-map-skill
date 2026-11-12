# Experimental direct connection — v0.7

Start the local host with `serve --project PATH --open --codex`. Manual copied
prompts remain the default. The bridge never installs Codex, logs in, stores keys
or auto-executes old tasks. Existing Codex usage/limits apply.

Before launching it inspects `codex --version` and the installed
`codex app-server generate-json-schema --out TEMP` contract. Missing restricted
read/write, structured-output or resume controls fail closed. Initialization is
followed by `account/read` with `refreshToken:false`. Diagnostics expose only
ready/login-required state, not account identity or credentials.

Saved thread IDs live in protected controller state. Reconnection uses
`thread/resume`, not an unknown thread ID passed directly to `turn/start`. Every
turn sets its own explicit sandbox and approval policy. Resetting thread linkage
requires an idle connection and does not erase task history or source changes.

Planning is read-only. Execution uses workspace-write, network disabled,
restricted read roots, and excludes slash-tmp/TMPDIR write additions. Controller
state must be under the selected project's `.agents`, protected by normal Codex
sandbox semantics. **No sandbox escalation is accepted.** Command/file approval
requests are declined; permission expansion receives no grants; unknown requests
fail. An approved product plan is not permission to bypass filesystem protection.
Use native Codex to review exceptional broader access separately.

The host owns task state, approval, checkpoints and completion. The worker returns
structured plans or explicit outcomes: implemented, needs_review, needs_input,
failed, cancelled. Only implemented enters finalization. A normal RPC turn end is
not proof of task completion. A command/build report alone is not verified app
behavior. Registered receipts and feature checks remain separate.

One modifying task runs per worktree, including separate processes and custom
state directories. Unexpected disconnection holds an uncertain execution lease.
Confirm the actual process has stopped before recording pause or resuming. An
interrupt request alone is not confirmation; wait for the interrupted outcome.
Stale plans require review. No automatic queue dispatch or parallel agents.

State migration is explicit: stop old work, then `migrate-state --project PATH`.
Old `.project-map` is copied, not removed, to `.agents/project-map-state`; existing
destinations, symlinks and running work are refused. Ignore protected state and
`.agents/project-map-control` in the app repository. Full-access local software
can still change files; this is not a defense against an unrestricted local user.

The adapter is protocol-tested with synthetic child processes. Live Codex account,
installed-version/model behavior and the user's Mac GUI remain unverified.
When unsupported, retain work and use manual handoff, never permissive fallback.

Primary contracts checked for this implementation:
- https://learn.chatgpt.com/docs/app-server
- https://learn.chatgpt.com/docs/agent-approvals-security
