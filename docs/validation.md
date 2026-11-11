# Validation record — four-phase upgrade

## Executed in the development environment

| Milestone | Node tests | Result |
| --- | ---: | --- |
| Existing v0.2 baseline | 66 | Passed |
| Phase 1: feature workspace | 74 | Passed |
| Phase 2: impact/audit/evidence | 83 | Passed |
| Phase 3: checkpoint/restore/resume | 91 | Passed |
| Phase 4: cache/conflicts/optional bridge | 108 | Passed, no skipped tests |

`npm run check` validates required files and JavaScript syntax. `npm test` uses
Node's test runner, temporary synthetic projects and real local HTTP API calls.
The original 66 regressions are retained. New cases include shared membership,
name persistence, stale asset detection, wider file audits, actual command exit
receipts, image registration, unsafe paths/symlinks, checkpoint tampering,
concurrent edits, partial workflow resumption, cache invalidation, task conflicts,
and fail-closed bridge permission/protocol behavior.

## Browser coverage

`tests/browser_component.py` ran the shipped UI in real headless Chromium at
1440×1000 and 390×844. It exercised selection, impact preview, request save,
plan approval, completion/evidence/safety panels, and checked document overflow.
The DOM/CSS/JavaScript were real; fetch responses were controlled offline fixtures
produced by the real Node workflow. This is an **offline browser component test**,
not integrated browser-to-localhost E2E. Direct browser localhost navigation was
blocked by the environment; HTTP APIs were tested independently in Node. No
restriction was bypassed. The old mock-DOM tests remain as additional regressions.

## Codex adapter coverage

Bridge tests spawn a deterministic stdio child process and inspect real protocol
messages. They cover initialize/notification sequencing, read-only planning,
approval gating, workspace-write/network policy, explicit one-shot permissions,
refusal of privilege expansion, unsupported requests, interruption, disconnect,
stale model output and path traversal in grant roots.

No installed authenticated Codex executable or live model was available. The
adapter's live account/version compatibility and model behavior are **not verified**.
No actual target application or production data was modified by these tests.

## Continuous integration

The repository workflow runs package and Node tests on Linux and macOS with
Node 22. Inspect the actual workflow result for a given commit; configuring the
matrix is not itself a passing result. Hosted macOS tests are not GUI validation
on the user's Mac. The offline browser script is optional and is not part of the
Node suite; it requires Playwright and an installed Chromium.

## Remaining acceptance work

Try a real app on the user's Mac: feature naming/grouping; small display change;
shared-component change; data-related change; actual before/after app captures;
interrupted task and safe restore; opt-in direct Codex plan/execute/permission flow.
Confirm expected UI behavior, not just file hashes. Collect usability observations
from nondevelopers before claiming productivity gains or readiness for unattended
use. No token/time savings percentage is asserted.
