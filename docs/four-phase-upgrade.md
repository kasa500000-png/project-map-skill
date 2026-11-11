# Four-phase upgrade

## Phase 1 — Feature-first understanding (v0.3.0)

The default local dashboard now shows feature groups, shared implementation and
navigation separately. One feature may include multiple files, and one file may
belong to multiple features. Selecting a feature resolves only its entry points;
it does not silently authorize changing every dependency.

Rename a feature in the UI. Names persist under `featureLabels` while other config
is preserved. Define a business function in `project-map.config.json`:

```json
{"features":[{"id":"report-save","label":"리포트 저장","entries":["src/app/reports/page.tsx"],"files":["src/lib/reports.ts"],"description":"리포트를 저장하고 결과를 확인하는 기능"}]}
```

Custom groups remain inferred declarations, not runtime proof. The original
file-centric bilingual dashboard remains at `/legacy`. The new feature workspace
is Korean-first. No app source is uploaded by the dashboard.

Test the shipped baseline and new feature/API tests with `npm test`. Browser
rendering is checked separately; a passing Node suite is not a screenshot test.

## Phase 2 — Actual write impact and evidence (v0.4.0)

The reviewed plan's write files, not just the clicked entry, now drive a second
reverse-dependency analysis. The dashboard explains affected features and keeps
unknown runtime connections explicit. A separate file inventory compares images,
JSON content, YAML, lock files and other safe regular files outside source-map
coverage. It honors Git ignores, excludes dependencies/build/state, never follows
symlinks, and reports size/count limits. Sensitive-file bodies are never saved in
the inventory; changed sensitive files are marked for private review.

Plan review/start also checks this broader fingerprint. Existing requests without
a broad baseline retain their old source guard and are not falsely described as
fully audited. Out-of-map write planning is not yet a source graph node; such
changes are reported as outside the plan and require explicit review.

Record actual command or screenshot evidence with an explicit CLI action:

```bash
node skills/project-map/scripts/project-map.mjs evidence --project /path/to/app --id TASK_ID --file /path/to/evidence-spec.json
```

A check specification is `{ "kind":"check", "name":"unit tests", "argv":["npm","test"] }`.
It runs only for a running task, without a shell, with a bounded timeout; it can
still execute arbitrary project code, so inspect and authorize the command first.
A screenshot specification is `{ "kind":"image", "name":"detail screen", "file":".project-map/before.png", "stage":"before" }` (or `after`). Optional
`nodeId` links an item to a planned effect. PNG/JPEG only, 8 MB maximum. Store
screenshots under ignored local state. Screenshots may contain private content;
review them before sharing. Only registered artifacts can be served by the UI.

Receipts include real exit codes, limited/redacted output and source fingerprints.
Changed code or a new plan makes evidence stale. A screenshot attachment does not
make a function pass; bare check statuses remain agent reports, not tool proof.
This release does not automatically launch the target app or take screenshots.

## Phase 3 — Checkpoints, restoration and resumption (v0.5.0)

Starting a reviewed plan stores the actual current bytes of its planned source
files, including pre-existing uncommitted changes. A revised plan preserves the
first backup and adds newly planned files. Backups are local private state, may
contain sensitive source, and must never be committed. They are not Git commits.
Files outside the write plan and external systems are not backed up.

Completion or explicit pause seals expected final file hashes. Restore first
shows affected paths, then requires confirmation of a five-minute preview token.
It refuses changed files, symbolic links, damaged backups and an overlapping
running task. Unrelated changes are not reset. Before mutation it preserves
recovery copies and a journal. Multi-file restoration is not an atomic filesystem
transaction: interruption can leave a partial restore. Inspect ignored
`.project-map/recovery/` before further edits; never automatically force restoration.

The ordinary dashboard cannot stop an external Codex process. Stop it in Codex
first, then acknowledge that fact to record pause. Resume prepares a fresh plan
for user review, not silent approval. Source changes do not reuse stale approval.
The UI distinguishes request saved, plan review, approved but not executing,
running and completed-with-verification-pending states.

Restoring code does not undo database changes, payments, sent messages or a
production deployment. Such work needs its own explicit backup/recovery plan.
