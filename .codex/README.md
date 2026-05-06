# Codex Skills

This directory collects lightweight workflow skills adapted for `conductor`.

## Environment Actions

- `Run Desktop`: starts the desktop development app with `npm run dev:desktop`.

## Skills

- `code-review`: final PR review focused on bugs, regressions, and missing tests.
- `code-review-breaking-changes`: external surface breakage review.
- `code-review-change-size`: guidance when a diff is too large.
- `code-review-context`: bounded-context review for long prompts or payloads.
- `code-review-testing`: test coverage guidance for behavior changes.
- `commit-message`: semantic commit subjects that match release note rules.
- `issue-digest`: brief summary of recent GitHub issues by theme.
- `pr-body`: PR title and body updates aligned with repository conventions.
- `pr-watch`: PR monitoring for CI, review feedback, and branch-related fixes.

## Shared Repository Rules

- Follow `.github/workflows/pr-title-check.yml` for semantic PR titles.
- Keep `.github/pull_request_template.md` sections when writing PR bodies.
- Use `docs/engineering-release-notes.md` as the source of truth for commit and release-note style.

## Practical Order

1. Use `commit-message` when naming a commit or squash merge.
2. Use `pr-body` when opening or refreshing a PR.
3. Use `code-review` before merge.
4. Use `pr-watch` when a PR needs ongoing monitoring.
