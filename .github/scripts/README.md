# GitHub Scripts

This directory holds CI and supporting release helper scripts.

## Naming

- `install-*`: environment and toolchain setup.
- `build-*`: build or artifact preparation.
- `verify-*`: configuration and release checks.
- `publish-*`: release publishing helpers when needed.
- `test-*`: lightweight script checks.

## Current Use

- `install-windows-env.ps1`
- `build-windows-release-assets.ps1`
- `verify-release-tag.ps1`
- `verify-source-repository.ps1`
- `publish-windows-updater-assets.ps1`
