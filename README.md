# conductor

`conductor` is a device-analysis app with both Web and Electron desktop runtimes.

## Highlights

- CSV batch import and preview
- template-based data extraction
- chart analysis and export
- Origin integration for `Open in Origin`
- Windows desktop packaging and auto update

## Requirements

- Node.js 22+
- npm 10+
- Windows is required for building and testing the Origin CSV worker

## Quick Start

Install dependencies:

```bash
npm install
```

Start the Web app:

```bash
npm run dev
```

Default Vite URL:

```text
http://localhost:5173
```

## Desktop Development

Start Electron dev mode:

```bash
npm run dev:desktop
```

This flow:

1. builds the Electron main/preload code with `npm run build:desktop:core`
2. starts the Vite dev server
3. launches the Electron app

Useful scripts:

- `npm run build:desktop:core`: build Electron main/preload only
- `npm run build:web:desktop`: build the desktop-targeted web bundle
- `npm run build:desktop`: build desktop assets

## Common Scripts

Quality checks:

```bash
npm run lint
npm run typecheck
npm run test:unit
```

Build and package:

- `npm run build`: build the Web app
- `npm run pack:desktop`: build and package desktop output without an installer
- `npm run dist:desktop`: build desktop installers/artifacts
- `npm run pack:desktop:oneclick`: one-click desktop dir packaging
- `npm run dist:desktop:oneclick`: one-click desktop installer build

Release and verification:

- `npm run verify:auto-update-config`: verify updater configuration
- `npm run build:origin-csv-worker`: build the Origin worker EXE
- `npm run verify:origin-worker`: verify the Origin worker EXE and embedded version metadata
- `npm run dist:desktop:publish`: local desktop release publishing flow
- `npm run release:desktop:local`: explicit local release entrypoint

## Environment Variables

Copy `.env.example` to `.env.local` when needed.

```env
VITE_WS_URL=
VITE_ORIGINBRIDGE_API_BASE_URL=
VITE_DA_PREVIEW_CANVAS=0
CONDUCTOR_UPDATE_URL=
```

Notes:

- `VITE_ORIGINBRIDGE_API_BASE_URL` is mainly for local OriginBridge integration.
- `CONDUCTOR_UPDATE_URL` overrides the packaged auto-update source at runtime.

## Desktop Artifacts

Desktop output directory:

```text
release/
```

Windows naming:

- installer: `conductor-${version}-windows-${arch}-setup.exe`
- portable zip: `conductor-${version}-windows-${arch}-portable.zip`
- portable 7z: `conductor-${version}-windows-${arch}-portable.7z`

Other platforms use:

```text
${productName}-${version}-${os}-${arch}.${ext}
```

## Origin Worker

The desktop app ships one offline-native worker:

- `origin/bin/origin-csv-worker.exe`

Default local worker virtual environment:

```text
.venv-origin-workers/
```

Build the worker:

```powershell
npm run build:origin-csv-worker
```

Verify the worker:

```powershell
npm run verify:origin-worker
```

Inspect embedded worker metadata:

```powershell
origin/bin/origin-csv-worker.exe --worker-version
```

Runner behavior:

- dev mode defaults to `origin/run_origin_csv.py`
- `ORIGIN_CSV_WORKER_PATH` can be set explicitly for EXE smoke testing
- packaged desktop builds use the bundled worker EXE

More details: [origin/ORIGIN_WORKERS.md](./origin/ORIGIN_WORKERS.md)

## Device Analysis Origin Export Modes

`Open in Origin` currently uses four distinct modes:

- `merged` (`New columns`): append exported curves into the same worksheet
- `workbookSheets` (`New worksheet`): create new sheets inside the same workbook
- `workbookBooks` (`New workbook`): create multiple books inside the same Origin window/session
- `separate` (`New window`): open each export item through an independent Origin window/session path

## Desktop Persistence

Desktop stores templates and settings separately:

- `template.json`
- `config.json`
- `store-path.json`

Default location:

```text
~/.device/template.json
~/.device/config.json
~/.device/store-path.json
```

If a custom config path is used, for example `D:\DeviceAnalysis\config.json`, the sibling files are stored alongside it.

## Auto Update

Windows desktop releases support `electron-updater`.

Recommended release flow:

1. bump `package.json.version`
2. push the matching code and tag, usually `v<version>`
3. ensure `gh` or `GH_TOKEN` has release upload permission
4. run `npm run dist:desktop:publish`
5. verify the release contains `latest.yml`, installer, and matching blockmap files

Reference: [docs/desktop-auto-update.md](./docs/desktop-auto-update.md)

## Icons

Project icons:

- `build/icons/icon.png`
- `build/icons/icon.icns`
- `build/icons/icon.ico`

Regenerate from `public/logo.svg`:

```bash
npm run make:icons
```

## Code Signing

The project supports the standard `electron-builder` signing environment variables.

Common variables:

- macOS: `CSC_LINK`, `CSC_KEY_PASSWORD`, optional `CSC_NAME`
- Windows: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`
