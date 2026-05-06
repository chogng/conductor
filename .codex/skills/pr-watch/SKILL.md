---
name: pr-watch
description: Monitor an open pull request until it is merged, closed, or blocked.
---

# PR Watch

Use this skill when the user asks to watch, monitor, or babysit a PR.

## Goals

- Track CI status.
- Surface new review comments.
- Diagnose branch-related failures.
- Keep following the PR until it is merged, closed, or needs user help.

## Workflow

1. Check the current PR state.
2. Inspect new review feedback before acting on CI failures.
3. If a failure is caused by the branch, patch locally and push a fix.
4. If the PR title or body needs a refresh, keep it aligned with the repository rules.
5. Continue monitoring after each push.
6. After a push, confirm the PR title still satisfies the semantic prefix workflow.

## Commit Messages

- Use `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `perf:`, or `test:` as appropriate.
- Keep commit messages specific and concise.
- Prefer a final commit message that describes the net change.
- Reuse the same semantic family in the PR title, commit subject, and release note summary when practical.
- For review fixes, keep the message anchored to the issue being addressed, for example `fix: preserve manual axis range`.

## Notes

- Do not stop after one green snapshot if the PR is still open.
- Surface unresolved review feedback instead of replying automatically when a human response is required.
