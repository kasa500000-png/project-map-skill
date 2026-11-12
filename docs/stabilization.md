# Reliability upgrade

## 1. Execution and completion integrity

Actual current command receipts take precedence over AI summaries. A reported
pass without a matching receipt stays unverified; unrelated failures cannot be
hidden. Reruns supersede earlier executions only for the same named/linked check.
All planned feature outcomes must be checked before overall verification passes.

Completion is now prepared before it is published. Audit and checkpoint sealing
must succeed first. Interrupted/failed finalization remains visible and retains
the project execution lease. Retrying uses the saved completion request. Completed
records do not absorb unrelated later edits.

A persistent, project-wide execution lease and cross-process mutation mutex
prevent simultaneous starts across CLI/server instances, including different
state directories. Re-entering an already running task is refused. No automatic
lock expiry or PID guessing is used: a crash requires explicit inspection before
manual recovery. The coordination boundary is a Git worktree or selected non-Git
project; external edits by programs not using this skill remain possible.

The direct adapter requires a structured disposition. Needs-review, needs-input,
failed, cancelled and missing dispositions cannot enter completion. Task conflict
analysis includes transitive implementation dependencies.

Validation: 120 Node tests passed in the development environment, including the
new failure/provenance/finalization/cross-process/disposition regressions. No live
Codex account or production application was used.

## 2. Visual comparison and planned artifacts

The feature projection now preserves planned/added/modified/deleted flags,
unexpected changes and verification state. The workbench retains all three
snapshots: before, reviewed expectation and actual result. A separate table
shows planned files with no observed change. This is structural/file comparison,
not proof of runtime behavior or a pixel-perfect screen preview.

Ordinary content JSON, images and configuration files may now be planned,
approved, backed up, audited and restored. Optional `assetBindings` links a
planned artifact path to an existing feature entry. Such membership is declared,
not claimed as a detected runtime dependency. Source-map coverage is unchanged:
assets are shown in the plan without turning every project file into a node.
Ignored, secret-like, generated, state and symlink paths remain excluded.

Validation: 126 Node tests pass, including content/image creation, modification,
deletion, state/secret exclusions, restore and all-three-snapshot regressions.

## 3. Protected controller, compatible bridge and manageable history

State defaults to `.agents/project-map-state`, with a worktree coordinator under
`.agents/project-map-control`. The direct adapter requires protected state and
uses normal Codex sandbox exclusions without granting escalation. Migration from
`.project-map` is explicit, copies rather than deletes, refuses active work/links/
existing destinations, and resets previously approved work for another review.
Previously reported-only passes are displayed as unverified historical records.

The bridge checks installed schema capabilities and auth readiness before a turn,
persists thread identity, resumes with explicit read-only defaults, and reapplies
sandbox policy on every turn. It returns clear installation/login/compatibility
errors. Unexpected termination retains an execution lease until the user confirms
the external process stopped. No blanket privileges, auto login or secret copying.

Task polling now uses metadata versions and bounded summary pages rather than
redecorating all task history/source every five seconds. Tasks may be cancelled,
archived and unarchived. Cancellation does not undo files; archive does not delete
records. Storage usage is visible on demand. Automatic backup purging is absent.
Oversized records cannot trap pagination on a nonadvancing cursor.

Security scope: `.agents` is protected by normal native Codex sandbox semantics,
not by hiding files or Git ignore patterns. A process running with unrestricted
local access can still change files. The bridge stays experimental pending live
Codex/Mac acceptance. Manual lifecycle operations need the authorized trusted host
or user terminal; do not disable the entire sandbox to work around write errors.

## Recovery checklist

- `finalization_failed`: inspect the reported error, fix its cause, then retry
  completion without replacing the saved request. Do not edit task JSON to green.
- Unknown/disconnected execution: stop the actual process, then acknowledge pause.
  Do not release its lease merely because a browser or connection closed.
- `PROJECT_BUSY` after a host crash: stop all related processes, back up protected
  state and inspect the lock owner plus task/lease journals. No automatic lock
  expiry/PID-based deletion is performed. This release has no one-click stale-lock
  recovery; do not delete an active lock or discard another task's work.
- Restore conflict: preserve current files. Do not force a rollback over newer
  work. Interrupted multi-file restores have local recovery journals.
