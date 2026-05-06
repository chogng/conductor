# Engineering Release Notes

This project should treat release notes as an output of normal engineering work,
not as a manual publishing task at the end of a release.

The goal is simple:

- clear commits
- clear PR titles
- predictable release categories
- low-friction changelog generation

## Why This Matters

Good release notes start earlier than the release workflow.

If commit messages and PR titles are vague, release notes become vague.
If change intent is explicit, GitHub can group and present releases clearly.

That is why this repository now standardizes:

- semantic commit / squash title prefixes
- PR release-note summaries
- GitHub release note categories in `.github/release.yml`

## Commit Style

Prefer these prefixes for squash commits and PR titles:

- `feat:` new user-facing capabilities
- `fix:` bug fixes and regressions
- `docs:` documentation-only changes
- `chore:` maintenance, tooling, cleanup, dependency bumps
- `refactor:` internal code reshaping without intended behavior change
- `perf:` measurable performance improvements
- `test:` test-only changes

Examples:

- `feat: add auto-detected device analysis template fallback`
- `fix: restore Windows updater blockmap upload`
- `docs: document Microsoft Store package flow`
- `chore: simplify release asset verification script`

## PR Expectations

Each PR should answer three things clearly:

1. What changed?
2. Why did it change?
3. How was it verified?

If the change is user-facing, include a short release-note sentence that can be
reused in a changelog or GitHub Release.

Good example:

`Users can now reopen recent device-analysis sessions without re-importing source files.`

Avoid release-note text like:

- `misc updates`
- `refinements`
- `fix stuff`
- `cleanup`

## Release Categories

GitHub Release Notes are grouped with the categories in
`.github/release.yml`:

- `New Features`
- `Bug Fixes`
- `Documentation`
- `Performance`
- `Refactors`
- `Testing`
- `Chores`

These categories are driven primarily by labels, so when we start using labels
more consistently, release pages become much easier to scan.

The canonical label list now lives in `.github/labels.yml`. Even when labels are
created manually in GitHub today, the repository should treat that file as the
source of truth for naming and intent.

This repository now includes lightweight GitHub automation for that:

- `.github/workflows/pr-title-check.yml` validates semantic PR titles
- `.github/workflows/labeler.yml` applies labels from changed paths
- `.github/labeler.yml` defines the path-to-label mapping
- `.github/labels.yml` defines the repository label catalog
- `.github/ISSUE_TEMPLATE/*` structures bug reports, feature requests, and docs issues
- `.github/workflows/ci.yml` runs the fast JS/TS quality gate
- `.github/workflows/desktop-ci.yml` validates Electron and packaging paths
- `.github/workflows/rust-ci.yml` validates Rust-sidecar related changes
- `.github/workflows/python-worker-ci.yml` validates the Python Origin worker
- `.github/workflows/pages.yml` deploys the static GitHub Pages privacy-policy site from `public/`
- `.github/actions/setup-windows-node-python` centralizes the repeated Windows runner setup
- That shared action also defines the common Windows CI cache environment so workflow files stay focused on job intent
- `.github/actions/prepare-windows-release-assets` owns Windows release signature inspection, checksums, and download guidance files
- `.github/actions/publish-windows-updater-assets` owns the public updater repository upload contract
- `.github/scripts/*` contains CI-only script bodies used by local GitHub actions

## Suggested Team Workflow

1. Open a PR with a semantic title.
2. Fill in the PR template, especially testing and release note summary.
3. Use labels that match the change type when possible.
4. Squash merge with a clean final commit title.
5. Tag releases from a commit history that already reads like a changelog.

Issue intake should follow the same idea:

- bug reports should describe reproduction and expected behavior clearly
- feature requests should explain the problem before the proposed solution
- docs issues should point to the exact place that needs improvement

## Minimal Rule Of Thumb

If a person cannot understand the change from the PR title alone, the release
notes will likely be unclear too.
