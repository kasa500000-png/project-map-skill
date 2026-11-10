# Contributing

Use Node.js 20 or newer. No runtime packages need to be installed.

Run `npm run check` and `npm test` before proposing a change. Add focused tests
for a changed analyzer, scope rule, task lifecycle, or installer behavior.
Exercise the browser UI separately when layout or interactions change; the mock
DOM integration test does not establish visual correctness.

Keep the feature-first workflow accessible to people who do not write code.
Show evidence and missing coverage, and never describe inferred impact or
parallel candidates as guaranteed independence.

Share minimal synthetic reproductions. Do not commit real project maps,
private application source, API keys, or generated `.project-map/` state.
Preserve existing source changes and installed skills when handling failures.
