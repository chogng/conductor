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

This command now runs a local release workflow that:

- validates updater publish config in `package.json`
- builds desktop artifacts into `release/`
- creates or updates GitHub Release `v<package.json version>`
- uploads only updater-required assets: `latest.yml`, `*-setup.exe`, and matching `*.blockmap`

## 2.1 Publish via GitHub Actions (recommended)

This repo includes a Windows-only workflow: `.github/workflows/release-windows.yml`.

Recommended flow:

1. Bump `package.json` version and push commits.
2. Create and push a tag that matches the version: `v<package.json version>`.
3. The workflow runs on that tag and:
   - uploads updater-only assets (`latest.yml`, installer, blockmap) to the public update repository
   - mirrors full `release/` artifacts to the private source repository release
   - lets GitHub generate release notes for the private source repository release using `.github/release.yml`

To keep generated release notes readable, prefer semantic PR titles / squash commits such as:

- `feat: add automatic origin export retry`
- `fix: preserve template curve ordering after reload`
- `docs: clarify Windows release verification steps`
- `chore: clean up desktop packaging scripts`

## 2.2 One-command local release (without Actions)

If you prefer publishing from your local machine with `gh` CLI (instead of `electron-builder --publish`), run:

```powershell
npm run release:desktop:local
```

What it does:

- validates updater publish config in `package.json`
- builds desktop artifacts into `release/`
- creates or updates GitHub Release `v<package.json version>`
- generates GitHub release notes by default, using `.github/release.yml`
- uploads only updater-required files: `latest.yml`, `*-setup.exe`, and matching `*.blockmap` (with overwrite on existing assets)

Requirements:

- `gh` installed and authenticated (`gh auth login`)
- repository access permission for creating/editing Releases
- `package.json` version bumped before running

If needed, you can still override generated notes by calling the PowerShell script
directly and passing `-GenerateNotes:$false -Notes "..."`.

## 2.3 Closed-source Windows release notes

If you are shipping a closed-source Windows build without a paid code-signing certificate:

- Windows may show a Microsoft Defender SmartScreen warning that the publisher is unknown.
- This repo's GitHub Actions workflow uploads two extra assets to each Windows release:
  - `SHA256SUMS.txt` for `.exe`, `.zip`, `.appx`, and `.msix` artifacts
  - `WINDOWS-DOWNLOADS.txt` with verification and SmartScreen guidance
- These extra files are mirrored to the private source-repo release for traceability.
- Public updater-repo releases remain minimal and contain only updater-required assets.

This warning is usually caused by missing Authenticode code signing, not by app logic. The practical fix is:

1. provision a Windows code-signing certificate
2. sign the installer and portable `.exe` files during `electron-builder`
3. keep publishing from the same certificate so SmartScreen reputation can build
4. if Defender still flags a fresh signed release, submit the file to Microsoft for false-positive review

This repository's Windows workflow supports the standard Electron Builder signing secrets:

- `WIN_CSC_LINK`
- `WIN_CSC_KEY_PASSWORD`
- optional `WIN_CSC_SUBJECT_NAME`

When those secrets are configured, CI signs Windows executables and writes signature results to `WINDOWS-SIGNATURES.txt`.

Users can verify a download in PowerShell:

```powershell
Get-FileHash '.\Conductor-Studio-<version>-windows-x64-setup.exe' -Algorithm SHA256
```

Compare the printed SHA256 value with the matching line in `SHA256SUMS.txt` from the same GitHub Release.

They can also verify Authenticode signing:

```powershell
Get-AuthenticodeSignature '.\Conductor-Studio-<version>-windows-x64-setup.exe'
```

Expected result for a correctly signed build: `Status` should be `Valid`.

## 3. Client behavior

Installed clients will detect the new GitHub Release automatically and update.

## 4. Closed-source safety note for public updater repos

GitHub always shows `Source code (zip)` and `Source code (tar.gz)` on public releases. These archives are generated from the **public updater repository itself**, not from your private source repository.

To avoid source exposure:

- keep the public updater repository artifact-focused (no private app source committed there)
- run build and packaging in the private source repository
- upload only updater assets (`latest.yml`, installer, blockmap) to the public updater release

## Optional override

If needed, you can override provider URL at runtime:

```text
CONDUCTOR_UPDATE_URL=https://your-custom-update-host/path
```

When this variable is set, app uses a generic provider URL instead of packaged GitHub config.
