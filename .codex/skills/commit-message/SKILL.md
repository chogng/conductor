---
name: commit-message
description: Write semantic commit messages that match repository release rules.
---

# Commit Message

Use this skill when writing or reviewing a commit message for `conductor`.

## Rules

- Prefer a semantic prefix: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `perf:`, or `test:`.
- Keep the subject line short and specific.
- Describe the net change, not the edit history.
- Match the final squash commit title to the PR title style.

## Examples

- `feat: add preview export shortcut`
- `fix: preserve manual axis range`
- `docs: clarify release workflow`
- `chore: update release note guidance`

## Good Defaults

- User-facing capability: `feat:`
- Bug fix or regression: `fix:`
- Documentation: `docs:`
- Maintenance or tooling: `chore:`
- Behavior-preserving restructure: `refactor:`
