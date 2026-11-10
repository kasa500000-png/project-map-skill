# Project Map

**Select the feature you want to change, inspect its likely impact, and work with Codex using a visual project map.**

[한국어](README.md) · [Skill instructions](skills/project-map/SKILL.md) · [Fictional example](examples/sample-app)

Project Map scans local source files and shows screens, shared modules, and their connections. Select nodes, describe a change, and inspect three scopes: **write candidates, reading context, and verification targets**. After the work, inspect added, modified, deleted, and out-of-scope source files.

The runtime uses only Node.js built-ins. It does not require a database, API key, or npm package installation.

## Install

Requirements: Git, Node.js 20 or newer, and Codex with access to your local project.

```bash
git clone https://github.com/kasa500000-png/project-map-skill.git
cd project-map-skill
node scripts/install.mjs
```

The installer creates `~/.agents/skills/project-map` as a link to the skill in this clone. It refuses to overwrite an unrelated skill. Open your own app project in Codex and ask:

```text
$project-map Open the map for this project.
```

If the skill selector is cached, reopen it or start a new conversation. You do not need to move your app code into this repository.

For a project-specific install:

```bash
node scripts/install.mjs --project "/path/to/my-app"
```

This uses that project's `.agents/skills/project-map`. Choose either user-wide or project-specific installation. The local link contains an absolute path; do not commit it as a portable team installation. Other contributors can install their own clone.

If symbolic links are unavailable, use `--copy`. Copied installations must be updated by running the installer again after pulling the repository. User-modified installed files are preserved and the update is refused.

## Workflow

1. Open the map through the skill.
2. Select a screen or shared module.
3. Describe your change and choose display, behavior, or data-contract intent.
4. Inspect the suggested scope and save the request.
5. Ask Codex to process its request ID:

```text
$project-map Read and carry out saved request <request ID>.
```

The dashboard saves a real local request. A save action in an ordinary browser does **not** start a Codex session. A compatible desktop built-in browser can also attach the selected element and request metadata to the Codex conversation; feature detection keeps the copyable prompt available on other browsers.

An active agent may wait for the selected request. Saving cannot wake an ended session, so submit the copyable prompt to resume the workflow.

The agent checks current source, uses the saved scope as a starting point, performs the requested work, and records the comparison and actual verification results. Completion does not imply tests passed.

## Try a small example

```bash
node skills/project-map/scripts/project-map.mjs serve --project examples/sample-app --open
```

The source-only example has home, list, detail, report, and settings pages with shared components. It is an analysis fixture, not a runnable or type-checked application, and requires no dependency installation.

## CLI

```bash
node skills/project-map/scripts/project-map.mjs scan --project "/path/to/app"
node skills/project-map/scripts/project-map.mjs serve --project "/path/to/app" --open
node skills/project-map/scripts/project-map.mjs tasks --project "/path/to/app"
node skills/project-map/scripts/project-map.mjs doctor --project "/path/to/app"
node skills/project-map/scripts/project-map.mjs --help
```

## Updates and removal

In your original clone:

```bash
git pull --ff-only
```

Linked installations follow the clone automatically. For a copied install, rerun `node scripts/install.mjs --copy`. Preserve any `--project` option used at installation.

```bash
node scripts/install.mjs --uninstall
```

Removal only removes a link owned by this clone or an unchanged managed copy. It refuses to discard local edits. Project maps and task records remain untouched.

## What v0.1 does and does not establish

- Static JavaScript/TypeScript imports, simple path aliases, and React/Next.js/Expo-style source conventions are the primary analysis targets. This is heuristic source analysis, not a complete compiler or runtime dependency graph.
- Dynamic imports, event names, runtime routing, database rules, and external services can introduce connections the map does not discover.
- Parallel work suggestions are conditional. A missing edge does not prove two tasks are independent.
- There is no automatic multi-session launch, worktree orchestration, merge, or deployment in this version.
- File-content snapshots distinguish differences after a task was saved from edits that already existed. Actual changes outside the planned write scope are reported separately. Concurrent changes may belong to another task and need review.
- The comparison covers scanned source files. Review Git changes separately for excluded files and unsupported formats.
- Re-scan when code changes. The saved map helps locate relevant code; agents still need to read current source and validate behavior.
- No time-saving or token-saving percentage is promised.

Use the documented [`project-map.config.json` overrides](skills/project-map/references/config.md) to correct feature names or declare additional relationships.

## Local data

By default, maps and requests are saved under the target project's `.project-map/`. They contain metadata such as paths, hashes, inferred relationships, and user requests, not source-file bodies. Add this generated directory to the target project's `.gitignore`:

```gitignore
.project-map/
```

The scanner excludes `.env`-style sensitive files, symlinks, dependencies, and generated directories. The dashboard listens on loopback. The tool has no upload endpoint or analytics telemetry. Requests and code shared with Codex are handled under the policies of the Codex environment you use.

## Contributing

Run the dependency-free test suite:

```bash
npm test
```

Report bugs with a small reproducible fixture rather than private code or credentials. Add tests for route detection, dependency resolution, impact scope, and warnings when extending framework support.

## License

[MIT](LICENSE).
