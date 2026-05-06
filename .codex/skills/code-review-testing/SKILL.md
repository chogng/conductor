---
name: code-review-testing
description: Test guidance
---

For behavior changes, prefer tests that cover the user-facing path.

Check:
- whether the change needs a new test
- whether the test matches the actual behavior change
- whether there is an existing helper or fixture that keeps the test readable
- whether the relevant npm script is updated or already covers the change

If the change touches a shared flow, call out any missing coverage explicitly.

Useful local checks include:
- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:preview`
- `npm run test:origin-runner`
- targeted `verify:*` scripts for Rust, Origin, release, or updater paths
