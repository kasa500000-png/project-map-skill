# Architecture and release boundaries

Project Map connects a person's feature selection to source evidence, a visual
change plan, and a comparison after implementation. Release 0.2 runs locally
without runtime npm dependencies. The host Codex session supplies code reasoning
and editing; the dashboard does not call a model or execute arbitrary commands.

| Component | Responsibility |
| --- | --- |
| Codex skill | Inspect selected source, publish a plan, respect the user's review, implement and record checks |
| Source scanner | Collect source metadata and hashes, identify screens, resolve supported static imports |
| Flow analyzer | Infer supported literal navigation separately from implementation references, with evidence and omission warnings |
| Map UI | Explore connections, save requests, compare current/expected maps, review plans and continue from actual results |
| Local server | Serve assets and constrained map/task/review operations on loopback |
| Task store | Preserve each request's baseline, plan revisions, review decision and actual result |

## Lifecycle

1. Scan the project's supported source files and show screen navigation or
   implementation connections. Inference and declared configuration remain
   distinguishable from runtime evidence.
2. Save the selected nodes, user request, intent, source baseline and original
   relationships in a new `queued` task.
3. Codex reads the relevant current source and writes a structured plan. A plan
   lists write paths, effects in user terms, expected results and verification
   steps. New nodes, removed nodes and intended flow changes are optional.
4. `plan` stores a revision and focused before/expected graphs and moves the
   task to `awaiting_review`. The browser does not guess a semantic plan from
   free-form text. A request already satisfied by current code can have an empty
   write scope and an explicit verification-only effect.
5. The user approves the displayed revision or asks for a revision. Review
   identifies the plan revision and source snapshot. A replacement plan clears
   approval. The agent may record a specific approval already given in the
   conversation; it must not generate that approval itself.
6. `start` requires the reviewed plan, matching plan hash and current source
   snapshot before moving an `approved` task to `running`. Replanning after
   source changes uses current source while preserving the original request's
   baseline for the final comparison.
7. `complete` compares source hashes against that baseline, records actual
   before/after graphs and reports edits beyond the reviewed write scope. Checks
   tied to a feature's `nodeId` determine that feature's verification status.
   A generic build or a changed file does not mark every expected result passed.
8. A follow-up creates a new task and baseline with a `parentTaskId` referring
   to the completed result. Completed records remain immutable.

Saving, reviewing or completing a task does not launch an ended Codex session.
The UI provides copyable prompts and, when supported by the host, an optional
browser annotation handoff. An active agent can poll the queue for a bounded
period. A browser action accepted by an annotation API is not proof of sending
the request to an agent.

## What the graphs establish

`navigates` edges describe recognized screen transitions. Import and
`uses`/`reads`/`writes` relationships describe implementation connections. The
impact analysis keeps these meanings separate: a reachable screen may need a
behavior check without becoming a code dependency or an automatic edit target.

Literal routes, shared navigation components and a bounded set of
framework-evidenced layouts are supported. Dynamic destinations, ambiguous
routes, named native routes, external services and runtime-only behavior may be
missing. Evidence and warnings describe these limits.

Expected graphs show a proposed outcome; actual graphs show scanned source
relationships after work. Neither is an app screenshot or proof that the app
behaves as intended. Focused graphs and source scanning are bounded. Source
changes during a task may also come from concurrent work, and excluded files
require separate Git review.

A node is not a permission boundary. Local review records coordinate the
workflow, not a security boundary against a process with filesystem access.
Generated `.project-map/` state can contain project-specific information and
stays in the target project. The server has no model, shell or source-edit
endpoint.

## Release boundaries and extensions

Release 0.2 includes static scanning, navigation and implementation views, scoped
requests, visual plan review, conditional parallel candidates, CLI consumption,
source-baseline comparison, per-feature verification, linked follow-ups, a safe
installer and a source-only example.

Full language-server analysis, external database tracing, automatic multi-agent
or worktree scheduling, App Server execution, hosted collaboration and phone
remote control are outside this release.

Add language-specific analyzers behind the node/edge schema. Keep runtime
evidence separate from static evidence. An App Server adapter needs explicit
session identity, authentication, cancellation, permissions and lifecycle
ownership. Parallel execution also needs shared-file ownership and shared-data
contract checks.

Measure feature discovery, scope comprehension, missed verification, time and
rework on real tasks before making productivity claims. Re-scanning local files
is different from sending an entire project to a language model.
