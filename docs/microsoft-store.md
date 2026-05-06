# Microsoft Store Release

The preferred Windows distribution path is Microsoft Store AppX/MSIX.

## Build

```powershell
npm run dist:desktop:store
```

This command builds the desktop app, verifies the bundled Origin worker, and
asks Electron Builder to produce an AppX package without local executable
signing.

Expected output:

```text
release/Conductor-Studio-<version>-windows-x64-store.appx
```

## Package Layout

The Store package includes the sidecar executables as app resources:

```text
resources/excel/bin/conductor-engine.exe
resources/origin/bin/origin-csv-worker/origin-csv-worker.exe
```

The app resolves these paths before falling back to older
`app.asar.unpacked` locations, so both Store and legacy desktop packages use
the same runtime code.

## First Submission

1. Reserve the app name in Microsoft Partner Center.
2. Copy the assigned package identity values into `build.appx` in
   `package.json`.
3. Run `npm run dist:desktop:store`.
4. Upload the generated `.appx` package in Partner Center.

Microsoft Store submission signs the final package through Microsoft. A
separate paid Windows code-signing certificate is not required for this path.

Store builds rely on Microsoft Store for updates. The app disables its
GitHub-based Electron updater when it is running as a Windows Store package.
The Origin worker is launched directly from the installed app resources; the
app does not generate or run a PowerShell launcher fallback for this worker.

## Legacy EXE Fallback

Keep the existing installer route available for non-Store distribution:

```powershell
npm run dist:desktop:exe
```

Without a paid Authenticode certificate, legacy EXE distribution may still
trigger SmartScreen or antivirus reputation warnings.
