# Desktop Auto Update (GitHub Releases)

This project uses `electron-updater` in `electron/main.ts`.

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

## 3. Client behavior

Installed clients will detect the new GitHub Release automatically and update.

## Optional override

If needed, you can override provider URL at runtime:

```text
DEVICE_ANALYSIS_UPDATE_URL=https://your-custom-update-host/path
```

When this variable is set, app uses a generic provider URL instead of packaged GitHub config.
