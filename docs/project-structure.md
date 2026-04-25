# Project Structure

This document is a quick map for navigating the Conductor repository and for
keeping generated files separate from source files.

## Source Areas

- `src/`: React/Vite application code.
- `src/features/device-analysis/`: device data import, template management,
  analysis charts, Origin export, session state, and workers.
- `src/components/ui/`: shared UI primitives.
- `src/context/`, `src/config/`, `src/i18n/`, `src/hooks/`, `src/utils/`:
  cross-cutting app infrastructure.
- `desktop/`: Electron main process, preload, IPC channels, persistence, and
  Origin runner integration.
- `origin/`: Python Origin CSV worker source and runtime helpers.
- `tools/rust-xls-bench/`: Rust XLS/analysis sidecar benchmark and engine code.
- `scripts/`: build, release, benchmark, and verification scripts.
- `public/`: static assets and demo CSV files.
- `build/`: packaged app resources such as icons.
- `docs/`: project notes, release instructions, schemas, and implementation
  plans.

## Generated Or Local-Only Areas

These paths are intentionally ignored by Git and can be regenerated:

- `node_modules/`: npm dependencies.
- `dist/`: Vite web build output.
- `desktop-dist/`: compiled Electron main/preload output.
- `release/`: Electron Builder packages and release artifacts.
- `origin/bin/`: built Origin worker executable.
- `origin/.pyi_*`: PyInstaller build/spec scratch directories.
- `.venv-origin-workers/`: local Python worker virtual environment.
- `.tooling/`: local tool caches.
- `.device/`: local runtime cache and logs.

## Important Entrypoints

- `src/main.tsx`: browser app entry.
- `src/App.tsx`: top-level React app selection.
- `src/features/device-analysis/DeviceAnalysisApp.tsx`: Device Analysis app
  shell.
- `desktop/main.ts`: Electron main process.
- `desktop/preload.ts`: renderer preload bridge.
- `desktop/ipc-channels.ts`: shared IPC channel names.
- `origin/run_origin_csv.py`: development Origin worker entry.
- `tools/rust-xls-bench/src/main.rs`: Rust sidecar benchmark entry.

## Common Commands

- `npm run dev`: start the Vite web app.
- `npm run dev:desktop`: build Electron core, start Vite, and launch Electron.
- `npm run build`: build the web app.
- `npm run build:desktop`: build desktop prerequisites and desktop bundle.
- `npm run lint`: run ESLint.
- `npm run typecheck`: run TypeScript checks for app, desktop, and scripts.
- `npm run test:unit`: run focused Node test suites.
- `npm run verify:auto-update-config`: validate updater publish config.
- `npm run release:desktop:local`: build and upload local desktop release
  assets through the GitHub CLI.

## Maintenance Notes

- Keep reusable app code under `src/` and Electron-only code under `desktop/`.
- Keep worker source under `origin/`; do not commit local worker build output.
- Keep large generated packages in `release/` or ignored build directories.
- Add new long-form implementation notes under `docs/`.
- Update `README.md`, `README.zh-CN.md`, and this file when a new top-level
  directory or core command is added.

