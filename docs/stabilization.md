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
