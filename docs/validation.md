# Validation of v0.2

Recorded on 2026-11-10 with Node.js 24.22.1 in the development environment.
The supported runtime minimum remains Node.js 20; this record does not claim a
separate run on every supported Node version or on macOS.

## Automated checks

`npm test`: **66 passed, 0 failed, 0 skipped**.

| Area | Coverage |
| --- | --- |
| Source map | Supported imports, route identification, configured names, ignored files, symlinks and incomplete scans |
| Screen flow | Literal links/calls, dynamic route matching, reused components, bounded layout projection, ambiguity and omission warnings |
| Plan lifecycle | First review, revisions, stale snapshots, exact approval, new/removed nodes, no-op plans and replanning during work |
| Results | Original baseline comparison, reviewed write scope, per-feature checks, unverified outcomes and linked follow-up tasks |
| Local HTTP API | Loopback host/origin restrictions, session token, request validation, plan review and task/result responses |
| UI events | Source arrows, selection, request saving, plan/revision/review, results, deletion preview, stale review, follow-up and language switching against the real HTTP API with a mock DOM |
| Installation and CLI | Owned links/copies, preserving local edits, paths with spaces, plan files, review, start and completion |

`npm run check`: required package files and **15 JavaScript files** passed syntax
validation. The installed skill also passed its frontmatter/name validator.

A separate code review found a deletion/replanning issue: an already deleted
screen could be rejected by a revised plan or reappear in its expected graph.
The fix was checked using the original reproduction and covered by regression
tests. Current/expected graphs retain the deletion while the final result keeps
the original comparison baseline.

## Browser and target-app limits

The UI test uses a mock DOM; it is not a browser layout test. A real Chromium
check was attempted, but the development environment blocked a local socket
needed to launch the browser. An elevated run was refused by the environment's
approval policy. The available shared browser also could not reach the local
test server. Desktop/mobile rendering and screenshots are therefore **not
verified in this record**.

The bundled sample is source-only. Its real application behavior is not tested
by scanning it or by testing the Project Map dashboard. Expected feature results
remain unverified until a suitable app-specific check is actually performed.

## Reproduce the automated checks

From the repository root, with Node.js available:

```bash
npm test
npm run check
```

No npm dependency installation is required. To inspect the local UI on a Mac:

```bash
node skills/project-map/scripts/project-map.mjs serve --project examples/sample-app --open
```

Check the visible flow arrows, feature selection, scrolling, plan comparisons
and controls in the browser. Use Codex with the saved request ID to prepare a
plan; review the plan before continuing with source edits.
