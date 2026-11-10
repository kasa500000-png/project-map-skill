# Scope and evidence

## Scopes

The selected node is a request entry point, not a guarantee that one file is enough.

| Scope | Meaning |
| --- | --- |
| Modify | Initial files proposed for editing |
| Reference | Dependencies or contracts to inspect |
| Verify | Consumers and connected features to check |

Display changes can reach shared components. Behavior changes can affect consumers without changing imports. Contract changes require API payloads, storage formats, public types and consumers to agree. The user's natural-language request is authoritative; the intent selector supplies only an initial heuristic.

Do not treat every reference as a required edit. Do not expand into the entire app without explaining why. Read nearby code and widen scope when evidence justifies it.

## Evidence and coverage

The scanner discovers supported source files and lightweight import/route relationships. `confirmed` denotes a detected source relationship, not proof of complete runtime coverage. Labels/routes may be inferred. Dynamic imports, runtime navigation, events, remote functions and external database policies may be missing.

Screen transitions (`navigates`) are separate from implementation references (`imports`, `uses`, `reads`, `writes`). Recognized literal links and router calls provide inferred transitions; importing a page never proves that a user can navigate to it. Shared components can expose inferred navigation to importing screens, which still requires runtime review. Computed links and ambiguous route matches are omitted with warnings.

Use coverage warnings. File-size, file-count, and displayed-graph caps can omit evidence; an omitted feature is not proven unaffected. The map is an index into current source. Refresh before work and after changes; avoid dumping the full map into model context.

## Parallel work

Treat parallel candidates as conditional suggestions. Recheck actual task descriptions before splitting work. Tasks can conflict when they edit the same file, depend on code the other changes, change shared API/schema/state rules, or share generated output and external resources.

Read-only sharing is usually compatible. Define shared contracts first or serialize common changes. Git worktrees isolate source edits, not shared remote data. Assign ownership of common files and verify the combined result. Update read/write scope as requirements expand.

This release does not spawn agents or allocate worktrees. Use the host's agent facilities only for authorized work that can be decomposed appropriately.

## Actual changes

A task stores source hashes when created. Completion compares them with a fresh scan, so existing uncommitted edits are not falsely presented as new task changes. Hash comparisons do not establish authorship. Preserve concurrent work and report ambiguity; never automatically revert an out-of-scope file.

`completed` means the result was recorded. Verification evidence is separate: `passed`, `failed`, or `not_run`. Feature outcomes use only checks explicitly linked to that feature and expected behavior. A generic build check or changed file cannot mark all expected outcomes passed. Incomplete source coverage limits the comparison.
