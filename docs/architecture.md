# Architecture and release boundaries

Project Map connects a person's feature selection to source evidence, a scoped
request, and a record of actual changes. Release 0.1 runs locally without
runtime npm dependencies.

| Component | Responsibility |
| --- | --- |
| Codex skill | Open the map, read a selected task, implement with normal tools, record checks |
| Source scanner | Collect source metadata, infer routes, resolve lightweight imports |
| Map UI | Select features, preview scope, save requests, inspect change nodes |
| Local server | Serve assets and constrained map/task operations on loopback |
| Task store | Preserve source baselines and results independently for each project |

## Lifecycle

Scan source hashes; display the map with evidence and coverage; save selected
nodes, a request, and a baseline; inspect current code in an active Codex session;
recheck freshness before editing; compare actual changes with the baseline;
record verification that was actually performed.

A node is not a permission boundary. An edge does not guarantee complete runtime
coverage. Generated `.project-map/` state can contain project-specific
information and remains local.

## Release 0.1

Implemented: local scanning, browser map, scope preview, request queue,
conditional parallel candidates, optional supported browser annotation handoff,
CLI consumption, baseline comparison, scope-expansion reporting, safe installer,
and a synthetic example.

Not implemented: full language-server analysis, external database tracing,
automatic multi-agent/worktree scheduling, App Server execution, guaranteed
semantic impact inference, hosted collaboration, or phone remote control.

## Extensions

Add language-specific analyzers behind the node/edge schema. Keep runtime
evidence separate from static evidence. An App Server adapter needs explicit
session identity, authentication, cancellation, permissions, and lifecycle
ownership. Parallel execution also needs shared-file ownership and shared-data
contract checks.

Measure feature discovery, scope comprehension, missing verification, time,
and rework on real tasks before making productivity claims.
