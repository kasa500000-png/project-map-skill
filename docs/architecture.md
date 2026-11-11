# Current architecture: v0.6

The original source scanner and review lifecycle remain in `analyzer.mjs`.
`core.mjs` exports the `workspace.mjs` facade used by CLI and HTTP. The facade
adds feature projection (`feature-map.mjs`), actual-write effects and evidence
(`assurance.mjs`), broader change inventory (`inventory.mjs`), local checkpoint
safety (`safety.mjs`), refresh reuse/task comparisons (`efficiency.mjs`) and the
optional stdio client (`codex-bridge.mjs`).

Default browser assets are `workbench.*` with assurance/safety/bridge UI modules.
Original bilingual `index.html` and `app.js` remain available at `/legacy`.
Commands are split into the public launcher and preserved `commands.mjs`.
Version metadata is explicit. The local server only binds loopback and exposes
bounded APIs; command evidence is an explicit CLI operation, not a free-form HTTP
shell API. Optional Codex routes send selected task IDs and structured phases.

Safety-critical workflows still scan source freshly; unchanged snapshot reuse is
for map refresh, not a bypass of plan approval. Plans and results are metadata,
not access-control boundaries. Source backups and registered images add private
local state; keep `.project-map/` out of version control. Four-phase details and
known limitations are in `four-phase-upgrade.md` and `validation.md`.
