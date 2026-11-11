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
