---
name: babysit-pr
description: Monitor a pull request and surface CI or review state
---

Watch an open pull request until it is merged, closed, or needs user help.

Use the PR number when one is provided, otherwise infer it from the current branch.
Prefer a single snapshot when diagnosing, and keep watching when the PR is still active.

When the current SHA changes, re-check CI and review feedback before doing anything else.
If the failure looks branch-related, patch locally and push a fix.
If the failure looks unrelated or flaky, report that clearly instead of guessing.

## Script

- `scripts/gh_pr_watch.mjs`

## Test

- `node .codex/skills/babysit-pr/scripts/test_gh_pr_watch.mjs`
