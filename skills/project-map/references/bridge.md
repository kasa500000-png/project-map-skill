# Optional local Codex bridge

```bash
node "$PM_CLI" serve --project "$PROJECT_ROOT" --open --codex
```

Requires a locally installed and authenticated `codex` executable in PATH. The
bridge runs `codex app-server` over stdio. It is disabled unless `--codex` is
explicitly supplied. No API key is added or copied. Codex usage limits/costs apply.

## User-controlled lifecycle

Select a feature and save a request. Press the direct-plan button, then review
the published current/expected maps. Approve the current revision and separately
press execute. Saving/approval alone does not auto-run code. One active turn is
allowed per bridge. During execution, supported command/file approval requests
are shown to the user, who accepts once or declines. No session-wide permission
amendments are issued. Planning declines escalation. Other permission requests
receive no grants; unsupported requests return an error.

The bridge owns starting/checkpointing and completing the task. The agent returns
schema-constrained plan or result JSON; it must not mutate Project Map state,
self-approve, or bypass stale snapshots. Thread identity is retained while the
server process lives. The visible progress is event-derived, not a fabricated
percentage. Raw reasoning and account/debug stderr are not shown.

Use interrupt for the bridge's turn. A normal/manual Codex session is separate
and must be stopped in Codex itself. Connection failure marks execution blocked;
it does not discard changes or claim success. Resume through a current reviewed
plan or manual handoff. Closing the server closes its child process only.

## Security and limits

The HTTP server remains loopback-only with origin/host/token checks. Planning
requests use read-only sandbox policy; execution uses workspace-write and network
access disabled by default. Filesystem sandbox enforcement belongs to Codex and
the OS, not to graph edges. Approving a command can still execute project code:
review it and applicable permissions. Never use this as an untrusted hosted
multi-tenant service. Never expose the server on a public interface.

The adapter uses documented `initialize`, `thread/start`, `turn/start`,
`turn/interrupt`, item/turn notifications and command/file approval responses.
Its protocol tests use a deterministic child process. Live Codex authentication,
model behavior and installed-version compatibility have not been verified in
the development environment. Fail closed and fall back to copied prompts when
the installed version does not support the requested sandbox or schema.

Official contract: https://developers.openai.com/codex/app-server
