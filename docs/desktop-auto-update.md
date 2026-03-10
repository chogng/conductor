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

## 2.1 One-command local release (without Actions)

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

## 3. Client behavior

Installed clients will detect the new GitHub Release automatically and update.

## Optional override

If needed, you can override provider URL at runtime:

```text
DEVICE_ANALYSIS_UPDATE_URL=https://your-custom-update-host/path
```

When this variable is set, app uses a generic provider URL instead of packaged GitHub config.
