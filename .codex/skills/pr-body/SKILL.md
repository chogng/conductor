---
name: pr-body
description: Update a pull request title and body to match repository conventions.
---

# PR Body

Use this skill when a PR title or body needs to be rewritten for `conductor`.

## Title Rules

- Use a semantic prefix that matches `.github/workflows/pr-title-check.yml`.
- Keep the title short and specific.
- Make the final squash commit title match the PR title style.
- Examples:
  - `feat: add preview export shortcut`
  - `fix: preserve manual axis range`
  - `docs: clarify release workflow`

## Body Rules

- Keep the template sections from `.github/pull_request_template.md` when possible.
- Explain `What changed?`, `Why did it change?`, and `Testing`.
- Put user-facing impact in `## Release Notes`.
- Set the release-note type to the same family as the final change:
  - `feat` for new user-facing capability
  - `fix` for bug fixes and regressions
  - `docs` for documentation-only changes
  - `chore` for maintenance and tooling
  - `refactor` for internal reshaping without behavior change
  - `perf` for measurable performance work
  - `test` for test-only changes
- Keep the body focused on the net change.
- Avoid vague wording like `misc updates` or `cleanup`.

## Style

- Prefer repo-relative paths.
- Use Markdown for clarity.
- Preserve any important existing body content.
