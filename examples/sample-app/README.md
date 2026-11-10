# Source-only task board

This fictional project demonstrates five app pages and their shared components and data. It contains no user project code or credentials. It is a source-analysis fixture, not a runnable or type-checked Next.js application.

From the repository root:

```bash
node skills/project-map/scripts/project-map.mjs serve --project examples/sample-app --open
```

Try selecting the task detail screen, then compare a display change with a data-contract change. The home page and report both depend on the same task summary and task data, making the example useful for inspecting shared dependencies.

Generated maps and requests are stored in this fixture's `.project-map/` directory and are not intended to be committed.
