---
name: code-review
description: Run a final code review on a pull request
---

Use subagents to review code using the repository's review skills, if any.

Return every issue you find.
Use raw Markdown for findings.
Number findings for ease of reference.
Each finding must include a specific file path and line number.

Prefer findings over summaries.
Keep the review focused on bugs, regressions, missing tests, and contract mismatches.
If the PR title or body conflicts with `.github/workflows/pr-title-check.yml`, call that out too.
Do not leave GitHub comments unless explicitly asked.
