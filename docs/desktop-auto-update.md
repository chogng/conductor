# Desktop Auto Update (GitHub Releases)

This project uses `electron-updater` in `desktop/main.ts`.

Default behavior:

- checks updates shortly after app startup
- checks updates every 4 hours
- downloads updates in background
- prompts user to restart and install after download

## 1. Configure GitHub provider

Update `package.json` build publish config:

```json
{
  "build": {
    "publish": [
      {
        "provider": "github",
        "owner": "YOUR_GITHUB_OWNER",
        "repo": "YOUR_GITHUB_REPO",
        "releaseType": "release"
      }
    ]
  }
}
```

## 2. Publish a new version

1. Bump `package.json` version.
2. Ensure `GH_TOKEN` is set (token with repo release upload permission).
3. Ensure `build.publish[0].owner` and `build.publish[0].repo` are real values (not placeholders).
4. Run:

```powershell
npm run dist:desktop:publish
```

This command now runs a pre-check (`verify:auto-update-config`) before publishing.
It then builds desktop artifacts and uploads release assets for updater metadata (`latest.yml`, installer, blockmap).

## 2.1 Publish via GitHub Actions (recommended)

This repo includes a Windows-only workflow: `.github/workflows/release-windows.yml`.

Recommended flow:

1. Bump `package.json` version and push commits.
2. Create and push a tag that matches the version: `v<package.json version>`.
3. The workflow runs on that tag and publishes assets to GitHub Releases using `GITHUB_TOKEN`.

## 2.2 One-command local release (without Actions)

If you prefer publishing from your local machine with `gh` CLI (instead of `electron-builder --publish`), run:

```powershell
npm run release:desktop:local
```

What it does:

- validates updater publish config in `package.json`
- builds desktop artifacts into `release/`
- creates or updates GitHub Release `v<package.json version>`
- uploads all files under `release/` (with overwrite on existing assets)

Requirements:

- `gh` installed and authenticated (`gh auth login`)
- repository access permission for creating/editing Releases
- `package.json` version bumped before running

## 2.3 Closed-source Windows release notes

If you are shipping a closed-source Windows build without a paid code-signing certificate:

- Windows may show a Microsoft Defender SmartScreen warning that the publisher is unknown.
- This repo's GitHub Actions workflow uploads two extra assets to each Windows release:
  - `SHA256SUMS.txt` for `.exe`, `.zip`, and `.7z` artifacts
  - `WINDOWS-DOWNLOADS.txt` with verification and SmartScreen guidance
- Recommend end users install from `*-setup.exe` first; keep `*-portable.zip` and `*-portable.7z` as portable options.

Users can verify a download in PowerShell:

```powershell
Get-FileHash '.\conductor-<version>-windows-x64-setup.exe' -Algorithm SHA256
```

Compare the printed SHA256 value with the matching line in `SHA256SUMS.txt` from the same GitHub Release.

## 3. Client behavior

Installed clients will detect the new GitHub Release automatically and update.

## Optional override

If needed, you can override provider URL at runtime:

```text
CONDUCTOR_UPDATE_URL=https://your-custom-update-host/path
```

When this variable is set, app uses a generic provider URL instead of packaged GitHub config.
