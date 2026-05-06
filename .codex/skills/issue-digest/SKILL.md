---
name: issue-digest
description: Summarize recent GitHub issues by theme
---

Produce a short, headline-first digest of recent issues for `conductor`.

Prefer `bug` and `enhancement` issues with a relevant area label.
Keep the default result brief, and expand only when details are requested.

Call out repeated themes before low-signal detail.
Include issue links inline and keep the source line compact.

## Script

- `scripts/collect_issue_digest.mjs`

## Test

- `node .codex/skills/issue-digest/scripts/test_collect_issue_digest.mjs`
