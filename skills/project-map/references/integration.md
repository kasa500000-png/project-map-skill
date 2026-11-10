# Local integration

## Commands

Run `node scripts/project-map.mjs --help` from the skill directory for the exact contract. Commands accept `--project`; normal data output is JSON. `serve` prints its URL and remains running; `wait` lasts at most 50 seconds.

| Command | Purpose |
| --- | --- |
| doctor | Check runtime and project |
| scan --summary | Refresh map with compact coverage counts |
| serve --open | Open map and request composer |
| impact --node PATH --intent behavior --request TEXT | Preview scope |
| tasks --status queued | Find saved requests |
| task --id ID | Read scoped task context |
| start --id ID | Check freshness and mark running |
| complete --id ID --summary TEXT --checks JSON | Record changes and checks |
| wait --timeout 50 | Wait during an active agent session |

Node IDs are relative source paths. Quote paths containing spaces. Construct arguments safely rather than concatenating untrusted shell text.

## Handoff

The local UI saves requests and cannot edit source or run shell commands. An active agent reads the selected task. Saving cannot launch an idle Codex process.

Supported desktop hosts expose `document.oai.annotation.request`. The UI can open an annotation carrying the task ID; the user submits it. `accepted` is only an acknowledgment. Other browsers use a copy-and-paste handoff.

A cloud-container URL is not automatically reachable on the user's Mac. Run locally or use the host's preview. A file:// page cannot provide the local JSON API.

## HTTP API

GET `/api/session` returns a process-local token. POST requests require JSON and `X-Project-Map-Token`. Browser origins and Host headers are restricted to the loopback server; no public exposure or CORS is provided.

- GET `/api/map`: current map
- POST `/api/refresh`: refresh source index
- POST `/api/impact`: `{nodeIds,intent,request}`
- GET `/api/tasks`: requests without large baselines
- POST `/api/tasks`: `{nodeIds,intent,request,snapshotId}`
- GET `/api/tasks/ID`: request and recorded result
- GET `/api/changes?task=ID`: actual change result

No shell-execution, arbitrary-file-read, push or deployment endpoint exists. Normal agent tools perform code edits under existing permissions.

## Official references

Checked 2026-11-09; feature-detect the actual host.

- [Codex skills](https://learn.chatgpt.com/docs/build-skills)
- [Browser annotations](https://learn.chatgpt.com/docs/annotations-extensibility)
- [Codex App Server](https://learn.chatgpt.com/docs/app-server): possible future adapter, not implemented
- [MCP UI](https://developers.openai.com/plugins/build/chatgpt-ui): optional supported-host alternative
