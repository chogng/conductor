---
name: commit-message
description: Write structured semantic commit messages that explain changes by feature area.
---

# Commit Message

Use this skill when writing or reviewing a commit message for `conductor`.

The commit message must be useful after the context of the thread is gone. Keep the message as short as possible while preserving the important context.

## Rules

- Prefer a semantic prefix: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `perf:`, or `test:`.
- Keep the subject line short and specific.
- Use only a subject when a trivial single-surface change is fully explained by that subject.
- Add a body when the diff changes workflow, ownership, behavior, runtime boundaries, tests, or more than one meaningful area.
- Use grouped bullets only when there are multiple distinct surfaces to explain; avoid bullets that merely repeat the subject.
- Structure body bullets by the changed area or capability, not by edit chronology.
- Each bullet should describe the net behavior or architectural outcome, not the step-by-step edit history.
- Cover every meaningful changed surface: user-facing behavior, service/model ownership, runtime or IPC boundary, CSS/UI state, tests, build scripts, and cleanup.
- If several areas changed, use one bullet per area. Do not collapse unrelated work into one vague sentence.
- Name the domain in plain terms, such as `data import`, `table service`, `tabs UI`, `Origin runtime`, `workspace lifecycle`, or `tests`.
- Mention tests or verification in the body when relevant.
- Match the final squash commit title to the PR title style.

## Examples

```text
refactor: split table ownership from tabs UI

- Table service: moves data table state and side effects behind a dedicated service boundary.
- Tabs UI: renames the tab view pieces to match their workbench role and keeps DOM state in CSS-backed classes.
- Lifecycle: wires disposal through the existing workbench stores so listeners are released with the owning view.
- Tests: updates coverage around table selection and tab switching behavior.
```

```text
fix: preserve manual axis range

- Chart state: keeps manual axis limits when incoming data refreshes.
- Preview UI: reflects the locked axis state without rebuilding the chart controls.
- Tests: adds regression coverage for refreshes with user-defined ranges.
```

```text
docs: clarify release workflow

- Release notes: explains when to update user-facing changelog entries.
- PR process: documents how squash commit titles should line up with release categories.
```

## Good Defaults

- User-facing capability: `feat:`
- Bug fix or regression: `fix:`
- Documentation: `docs:`
- Maintenance or tooling: `chore:`
- Behavior-preserving restructure: `refactor:`

## Review Checklist

- Does the subject say the net change in one short semantic line?
- Does the body split the change by domain or feature surface?
- Are unrelated areas separated into distinct bullets?
- Would a reviewer understand the important ownership, UI, runtime, and test changes without opening the diff?
- Did the message avoid vague bullets like `misc cleanup`, `update files`, or `fix issues`?
