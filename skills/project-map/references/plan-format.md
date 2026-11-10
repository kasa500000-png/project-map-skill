# Visual plan and review

Codex writes this plan after reading the selected feature and relevant source.
The browser displays it for the user to review; the static analyzer does not
pretend to understand arbitrary natural-language changes.

## Input

```json
{
  "summary": "작업 목록에서 핵심 정보를 먼저 읽을 수 있게 정리합니다.",
  "writeFiles": ["src/app/tasks/page.tsx"],
  "effects": [
    {
      "nodeId": "src/app/tasks/page.tsx",
      "change": "화면 제목과 작업 개수를 목록 위에 배치합니다.",
      "expected": "목록을 스크롤하기 전에 현재 작업 개수를 확인할 수 있습니다.",
      "verify": "화면 상단 표시와 기존 상세 화면 이동을 확인합니다."
    }
  ],
  "newNodes": [],
  "removeNodeIds": [],
  "flowChanges": []
}
```

Write the JSON with file-editing tools, for example to the project's ignored
`.project-map/draft-plan.json`. Then call:

```bash
node "$PM_CLI" plan --project "$PROJECT_ROOT" --id TASK_ID --file PLAN_JSON
```

`writeFiles` contains safe relative source paths, including planned new files.
Every write file needs an effect so that the user can see what is changing.
An effect's `nodeId` identifies an existing map node or a declared new node.
Describe expected results in user terms, and include a meaningful verification
step. An empty write scope can represent a request already satisfied by current
code; explain that outcome rather than inventing an edit.

New nodes use `{ "id": "src/app/help/page.tsx", "label": "도움말", "kind": "screen" }`.
Their IDs are planned source paths. Optional flow changes use
`{ "source": "src/app/page.tsx", "target": "src/app/help/page.tsx", "kind": "navigates", "action": "add", "reason": "홈에서 도움말로 이동" }`.
Supported relation kinds are `navigates`, `uses`, `reads`, and `writes`; actions
are `add` and `remove`. An existing relationship can be removed in the preview
without implying that code has already changed. Do not add fictional edges to
make a wording-only change look more dramatic.

To preview removal of an existing screen or module, include its ID in
`removeNodeIds`, `writeFiles`, and `effects`. Its effect should describe the
user-visible consequence and what will be checked. The before graph marks the
node for removal; the expected graph removes it and its incident connections.
A removed node cannot also be a new node. Removing a connection alone uses a
`flowChanges` entry and does not imply removal of either endpoint.

When revising a plan after starting work, keep previously approved deletions in
the write scope, effects and `removeNodeIds`. Already removed files stay absent
from the current and expected preview; the original request baseline still
records their final deletion. This continuity is checked by the tool and does
not permit arbitrary missing paths to be treated as previously approved work.

The stored plan adds a revision, source snapshot, timestamps, and bounded
`beforeGraph`/`afterGraph` previews. The expected map is a proposed outcome,
not a screenshot of a running app or evidence that the change works.

## Review and execution

Requests move through `queued → awaiting_review → approved → running → completed`.
Revision feedback returns the request to `queued`. Publishing a new plan clears
earlier approval. Each review identifies the exact `revision` and `snapshotId`.
Source changes invalidate review before execution.

Prefer the dashboard's approval/revision buttons. If the user explicitly
approves the displayed plan in the current conversation, the agent can record
that decision without asking again:

```bash
node "$PM_CLI" review --project "$PROJECT_ROOT" --id TASK_ID \
  --decision approve --revision REVISION --snapshot SNAPSHOT_ID
node "$PM_CLI" start --project "$PROJECT_ROOT" --id TASK_ID
```

The agent must not self-approve. Local review records coordinate this workflow;
they are not a security boundary against a process with filesystem access.
Request saving and approval do not start an ended Codex session.

## Expected results versus recorded results

Checks can link to an effect through `nodeId`:

```json
[
  {
    "name": "목록 상단 및 상세 화면 이동",
    "nodeId": "src/app/tasks/page.tsx",
    "status": "not_run",
    "detail": "실행 중인 앱에서 아직 확인하지 않았습니다."
  }
]
```

Only change `not_run` after performing the relevant check. A generic build
check has no `nodeId` unless it actually establishes that specific expected
result. Unlinked checks do not mark every feature as passed. Completion records
actual source differences separately from the per-feature outcome checks.
