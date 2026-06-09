# Conductor Studio

English | [中文](./README.zh-CN.md)

Conductor Studio is a desktop-first analysis tool for semiconductor device test data.
It turns folders of raw CSV/Excel measurements into extracted curves,
diagnostic plots, calculated parameters, and Origin-ready datasets.

It is built for lab workflows where the same measurement format appears again
and again: import a batch once, teach Conductor Studio where the X/Y data and labels
live, save that rule as a template, then reuse it across future experiments.

## What It Helps With

- **Batch device data intake**: import CSV and Excel files, preview large tables,
  and keep multi-file experiments together instead of cleaning files one by one.
- **Reusable extraction templates**: define X ranges, curve segmentation, Y
  columns, legends, units, curve type hints, and filename matching rules for
  repeated measurement layouts.
- **Automatic extraction when possible**: infer columns, grouping, and
  transfer/output-like curve roles for supported files, while keeping manual
  templates available for messy real-world data.
- **Block-aware auto layouts**: detect merged tables that contain multiple
  independent `X + Y...` column blocks in one CSV/XLSX, then process each block
  with its own X column while preserving older single-block extraction behavior.
- **Curve review and parameter checks**: compare processed files in one analysis
  workspace with overview thumbnails, focused plots, calculated metrics, gm
  diagnostics, SS diagnostics, and Ion/Ioff summaries.
- **Origin handoff**: send selected curves directly to Origin as merged columns,
  new worksheets, new workbooks, or separate windows, with ZIP fallback when
  automatic opening is not available.
- **Large-file performance**: use a Rust sidecar on desktop for Excel conversion,
  preview, extraction, processing, and batch analysis, with TypeScript fallbacks
  for compatibility.

## Core Workflow

1. Import raw measurement files.
2. Preview one file and choose `Auto` or configure a saved extraction template.
3. Apply the extraction to one file, new files, or the whole batch.
4. Inspect curves and calculated parameters in the analysis workspace.
5. Export CSV/ZIP results or open selected curves directly in Origin.

## Desktop Capabilities

- Electron desktop runtime for offline Windows lab machines.
- Persistent local templates, app settings, Origin path settings, and custom
  storage location support.
- Bundled Rust Excel converter and Python Origin CSV worker in packaged builds.
- Electron Builder packaging, Windows release artifacts, and auto-update support for desktop distribution.

## Local Data And Temporary Files

- Persistent app data, including templates, settings, and the configured Origin
  executable path, is stored under the user data home used by Conductor Studio.
- Origin runtime job files are treated as sensitive temporary handoff data. CSV
  intermediates and Origin worker logs are written under the system Temp root at
  `conductor/origin` instead of the persistent user data directory.
- The desktop app clears the Origin runtime Temp root on startup and during
  normal shutdown. This limits how long exported CSV intermediates can remain on
  disk, while still allowing templates and settings to persist.
- Because an OS crash or force-kill can skip shutdown cleanup, startup cleanup is
  part of the privacy model and should be kept if the runtime location changes.

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
./scripts/code.sh
```

On Windows:

```bat
scripts\code.bat
```

This flow:

1. sets desktop development environment variables
2. builds and watches Electron main/preload code
3. starts the Vite dev server
4. launches and restarts the Electron app as desktop output changes

The shared orchestration lives in `scripts/dev-desktop.ts`; `scripts/code.sh`
and `scripts/code.bat` are the upstream-style user-facing entry scripts. See
[`docs/desktop-dev.md`](./docs/desktop-dev.md) for the responsibility split and
long-term direction.

Legacy direct entry:

```bash
npm run dev:desktop
```

Useful scripts:

- `npm run build:desktop:core`: build Electron main/preload only
- `npm run build:web:desktop`: build the desktop-targeted web bundle
- `npm run build:desktop`: build the Origin CSV worker, Rust Excel converter,
  Electron main/preload code, desktop web bundle, and generated desktop icon assets

## Common Scripts

Quality checks:

```bash
npm run lint
npm run typecheck
npm run test:unit
```

Import test and benchmark data:

- Unit and smoke-style import coverage should use small repository fixtures under
  `src/cs/workbench/services/analysisFile/test/fixtures`.
- Stress and performance runs should use generated data or an explicit external
  data root, not committed large files.
- Generate deterministic large CSV inputs with `npm run bench:import:data`.
- Run the import parser benchmark against generated inputs with
  `npm run bench:import:generated`.
- Run the same benchmark against external CSV/XLS/XLSX data with
  `node scripts/bench-device-analysis-import.mjs <data-root...>` or
  `CONDUCTOR_BENCH_ROOTS`.

Build and package:

- `npm run build`: build the Web app
- `npm run pack:desktop`: build and package desktop output without an installer
- `npm run dist:desktop:store`: build the Microsoft Store AppX package
- `npm run dist:desktop`: build the Windows installer/zip artifacts
- `npm run pack:desktop:oneclick`: one-click desktop dir packaging
- `npm run dist:desktop:oneclick`: one-click desktop installer build

Supporting release and verification:

- `npm run verify:auto-update-config`: verify updater configuration
- `npm run build:py-worker`: build the Python Origin worker EXE
- `npm run verify:py-worker`: verify the Python worker EXE and embedded version metadata
- `npm run dist:desktop:publish`: local desktop release publishing flow when preparing a build
- `npm run release:desktop:local`: explicit local release entrypoint for distribution work

Packaging note:

- On Windows, `npm run build:desktop`, `npm run pack:desktop`, and
  `npm run dist:desktop` automatically build the Python Origin CSV worker and
  Rust Excel converter before packaging the app.
- After a clean workspace, run `npm install` first because `node_modules/` is
  required for the build scripts.

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

- Store package: `Conductor-Studio-${version}-windows-${arch}-store.appx`
- installer: `Conductor-Studio-${version}-windows-${arch}-setup.exe`
- portable zip: `Conductor-Studio-${version}-windows-${arch}-portable.zip`
- portable 7z: `Conductor-Studio-${version}-windows-${arch}-portable.7z`

Other platforms use:

```text
${productName}-${version}-${os}-${arch}.${ext}
```

## Origin Worker

The desktop app ships one offline-native worker:

- `workers/py/origin-csv-worker/origin-csv-worker.exe`

Default local worker virtual environment:

```text
.venv-py-workers/
```

Rebuildable npm/Python/Rust build caches live under `.build/cache/`; packaged
worker artifacts live under `workers/`.

Build the worker:

```powershell
npm run build:py-worker
```

Verify the worker:

```powershell
npm run verify:py-worker
```

Inspect embedded worker metadata:

```powershell
workers/py/origin-csv-worker/origin-csv-worker.exe --worker-version
```

Runner behavior:

- dev mode defaults to `conductor-py/run_origin_csv.py`
- `ORIGIN_CSV_WORKER_PATH` can be set explicitly for EXE smoke testing
- packaged desktop builds use the bundled worker EXE

More details: [conductor-py/ORIGIN_WORKERS.md](./conductor-py/ORIGIN_WORKERS.md)

## Device Analysis Origin Export Modes

`Open in Origin` currently uses four distinct modes:

- `merged` (`New columns`): append exported curves into the same worksheet
- `workbookSheets` (`New worksheet`): create new sheets inside the same workbook
- `workbookBooks` (`New workbook`): create multiple books inside the same Origin window/session
- `separate` (`New window`): open each export item through an independent Origin window/session path

## Device Analysis Chart Auto Range

In-app chart auto ranges should follow an Origin-like strategy:

- Auto range and major ticks are selected together.
- Axis endpoints snap to readable major tick boundaries instead of only padding raw data min/max.
- Linear axes use nice steps and snapped endpoints.
- Log axes use decade-based major ticks; if data is close to a decade boundary, the auto range expands to the next outside decade so curves do not touch the plot border.
- Manual min/max inputs remain strict. They should not be expanded unless needed to recover from invalid log-axis values.

Relevant code:

- `src/cs/workbench/contrib/chartPreview/lib/analysisChartsUtils.ts`
  - `buildOriginAutoTicks`
  - `buildOriginLogAutoTicks`
  - `padLinearDomain`
  - `padLogDomain`
- `src/cs/workbench/contrib/chartPreview/browser/analysisCharts.ts`
  - `xDomain`
  - `yDomain`
  - `xTicks`
  - `yTicks`

## Desktop Persistence

Desktop stores templates and settings separately:

- `template.json`
- `config.json`
- `store-path.json`

Default location:

```text
<userData>/User/template.json
<userData>/User/config.json
<userData>/User/store-path.json
```

If a custom config path is used, for example `D:\DeviceAnalysis\config.json`, the sibling files are stored alongside it.

## Auto Update

Windows desktop releases support `electron-updater`.

Update checks run shortly after startup and then every 4 hours. Downloads happen in
the background, and the app prompts for restart once the update is ready.

Recommended distribution flow:

1. bump `package.json.version`
2. push the matching code and tag, usually `v<version>`
3. ensure `gh` or `GH_TOKEN` has release upload permission
4. run `npm run dist:desktop:publish`
5. verify the release contains `latest.yml`, installer, and matching blockmap files

The local publish flow builds desktop artifacts into `release/`, creates or updates
the GitHub Release, and uploads only updater assets: `latest.yml`, the installer,
and matching `.blockmap` files.

GitHub Actions releases use the same tag flow and also mirror the full `release/`
folder to the source repository release for traceability.

Issue reporting:

- Use the GitHub issue templates for bugs, feature requests, and documentation issues so labels and release-note intent stay structured.

Workflow structure:

- Fast checks run in `ci.yml`.
- Desktop packaging checks run in `desktop-ci.yml`.
- Rust-sidecar checks run in `rust-ci.yml`.
- Python Origin worker checks run in `python-worker-ci.yml`.

## Microsoft Store

The preferred Windows distribution path is Microsoft Store AppX/MSIX:

```powershell
npm run dist:desktop:store
```

This builds one package that includes the Electron app, the Rust Excel
converter, and the Origin CSV worker as installed app resources. Store
submission signs the final package through Microsoft, so this route does not
require a separate paid code-signing certificate.

Store packages resolve the sidecar executables from installed app resources and
do not use the GitHub updater path while running as a Store app.

Use the guided installer for non-Store distribution:

```powershell
npm run dist:desktop
```

Before the first Store submission, reserve the app in Partner Center and copy
the assigned package identity values into `build.appx` in `package.json`.

## Icons

Project icons:

- `resources/win32/icon-2160.png` (source for generated desktop assets)
- `resources/win32/icon-*.png` (generated Windows PNG variants, including `icon-150.png` for the desktop window icon)
- `resources/win32/icon.ico`
- `resources/win32/header.bmp` and `resources/win32/sidebar.bmp`
- `resources/win32/appx/*.png` (Microsoft Store/AppX manifest tile and logo assets)
- `resources/darwin/icon.icns`
- `resources/linux/icon.png`

These files are treated as checked-in build assets. Verify them with:

```bash
npm run generate:icons
npm run verify:icons
```

## Code Signing

The project supports the standard `electron-builder` signing environment variables.

Common variables:

- macOS: `CSC_LINK`, `CSC_KEY_PASSWORD`, optional `CSC_NAME`
- Windows: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`

If Windows downloads are being flagged as unsafe by SmartScreen or Defender, the root fix is to ship signed binaries from a stable certificate. This repository's Windows release workflow reads `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`, and optional `WIN_CSC_SUBJECT_NAME` from GitHub Actions secrets.
