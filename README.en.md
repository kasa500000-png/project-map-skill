# Project Map v0.6

**Choose a feature, review the impact, and develop with Codex using a visual map.**

[한국어](README.md) · [Four phases](docs/four-phase-upgrade.md) · [Validation](docs/validation.md)

## Install and update

Requires Git and Node.js 20+ (Node 22 is used in CI).

```bash
git clone https://github.com/kasa500000-png/project-map-skill.git
cd project-map-skill
node scripts/install.mjs
```

Open your application project in Codex, then ask `$project-map` to show its map.
The default installation links `~/.agents/skills/project-map` to this clone.
Use `--project /path/to/app` for project-only installation, or `--copy` when links
are unavailable. Updates: `git pull --ff-only`; copied installations must rerun
the same installer. Uninstall with `node scripts/install.mjs --uninstall`.
Existing unrelated skills or locally edited copies are preserved.

## Workflow

Feature map → selected request → Codex plan → user review → execution → evidence
and actual-change review → follow-up. The Korean-first workspace groups multiple
files into features, retains shared code membership, and distinguishes navigation
from dependencies. Editable names persist. The bilingual file-level UI remains
at `/legacy`. Group configuration is in the feature config reference.

Impact is recalculated from planned write files. Broader file audits show assets,
content and configuration outside source-map coverage. Check/screenshot evidence
has revision and source fingerprints; bare reported check statuses are not tool
proof. Screenshots are explicitly registered, not automatically captured.

Starting an approved plan checkpoints planned local files, including pre-existing
dirty content. Restoration requires preview/confirmation and refuses later edits
to the same files. Recovery journals remain local. This does not restore external
databases, payments or deployments, and multi-file restore is not atomic.

## Manual or optional direct handoff

Manual is the default: copy the saved request prompt into Codex. Saving or
approving a request does not wake an ended session. For an installed and already
authenticated Codex CLI, opt into the direct adapter:

```bash
node skills/project-map/scripts/project-map.mjs serve --project /path/to/app --open --codex
```

The adapter provides explicit plan/execute buttons, progress, one-shot permission
review and interruption. No automatic queue execution or parallel agent spawning.
Codex usage limits/costs apply. Planning is read-only; execution uses workspace
write with network disabled by default. Unsupported requests fail closed.
See [bridge instructions](skills/project-map/references/bridge.md).

## Efficiency and limitations

Unchanged complete snapshots are reused after content hashing. Changed input
triggers a full graph rebuild; this is not per-file incremental parsing. Concrete
plans are compared for write/write, write/read and shared data conflicts; results
are conditional, not proof of independence.

JS/TS and React/Next.js/Expo conventions are the primary analysis targets. Dynamic
routes and external rules may be missed. Keep `.project-map/` ignored: it holds
private requests, source backups and evidence. The server listens only on
loopback and has no telemetry or automatic upload of the target app. Codex data
handling follows the Codex environment used.

```bash
npm run check
npm test
npm run demo
```

The example is source-only, not a runnable application. The optional direct
adapter was protocol-tested with a fake child process, not a live account/model.
See validation notes for precise coverage. [MIT](LICENSE).
