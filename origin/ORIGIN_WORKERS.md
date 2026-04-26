# Origin Workers (Offline Runtime)

This project uses one offline-native worker:

1. `origin-csv-worker.exe` for CSV import/plot (`Open in Origin`)

Python script remains available as the default dev worker:

- `run_origin_csv.py` (default in `npm run dev:desktop`)

Worker dependencies are installed into a project-local virtual environment by default:

- `.venv-origin-workers/` (gitignored)

## Build Worker EXEs (Dev Machine)

From repository root:

```powershell
npm run build:origin-csv-worker
```

Direct scripts:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-origin-csv-worker.ps1
```

Optional parameters:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-origin-csv-worker.ps1 -PythonVersion 3.11 -VenvDir .venv-origin-workers
```

The default build uses PyInstaller `--onedir` at
`origin/bin/origin-csv-worker/origin-csv-worker.exe`. This avoids the
self-extracting `--onefile` stub, which can fail under antivirus controls when
extracting bundled DLLs. Use `-OneFile` only when you specifically need a
single executable for debugging or distribution experiments.
The build also disables UPX compression, applies the project icon when available, and
writes Windows version metadata so the worker looks less like an anonymous packed binary.

Release-prep smoke test in dev:

```powershell
$env:ORIGIN_CSV_WORKER_PATH = (Resolve-Path .\origin\bin\origin-csv-worker\origin-csv-worker.exe).Path
npm run dev:desktop
```

Release-prep verification:

```powershell
npm run verify:origin-worker
```

Output path:

```text
origin/bin/origin-csv-worker/origin-csv-worker.exe
```

Worker metadata:

- The built EXE embeds `workerVersion`, `expectedTag`, `gitTag`, `gitCommit`, and `builtAt`.
- Query it with `origin-csv-worker.exe --worker-version` or `origin-csv-worker.exe --worker-version-json`.

## Runner Selection

The same runner-selection rule applies to both CSV jobs (`device-analysis-origin:run-csv`) and health checks (`device-analysis-origin:health-check`).

Dev (`npm run dev:desktop`):

1. `origin/run_origin_csv.py`
2. `ORIGIN_CSV_WORKER_PATH` only when explicitly set for EXE smoke testing

Packaged app:

1. `ORIGIN_CSV_WORKER_PATH` (if set and exists)
2. bundled `origin-csv-worker.exe`

Notes:

1. Packaged builds do not rely on local `python`/`originpro` for normal CSV execution.
2. Release prep should rebuild and verify the EXE before tagging/publishing.

## Worker CLI Contract

CSV worker CLI (`origin-csv-worker.exe` / `run_origin_csv.py`):

```text
--work-dir <dir>
--csv-path <file>                 # required unless --health-check-only
--batch-jobs-path <file>          # batch manifest JSON; alternative to --csv-path
--origin-exe <path>
--log-path <file>
--error-path <file>
--import-mode <string>            # default new-book
--workbook-key <string>
--workbook-name <string>
--sheet-name <string>
--plot-type <int>                 # default 202
--xy-pairs <string>               # default ((1,2))
--plot-command <string>           # full LabTalk command; overrides plot-type/xy-pairs
--post-plot-command <string>      # repeatable; executed after main plot
--line-width <float>              # default 2.0
--capabilities-json <json>
--max-com-attempts <int>          # default 8
--health-check-only               # run Origin attach + sec -p 0; without CSV import
--worker-version                  # print a human-readable worker version summary
--worker-version-json             # print machine-readable worker metadata JSON
```

Expected outputs:

1. Structured error JSON to `--error-path` on failure.
2. Exit code `0` on success, non-zero on failure.
3. Success prints a small JSON payload to stdout, including `logPath` and `jobCount` in batch mode.

## Device Analysis Export Modes

`Open in Origin` currently distinguishes four export modes in Device Analysis:

1. `New columns`:
   Import selected curves into the same worksheet as appended columns.
2. `New worksheet` (`workbookSheets`):
   Reuse one workbook in one Origin session and create one new sheet per thumbnail.
3. `New workbook` (`workbookBooks`):
   Reuse one Origin session/window and create one new workbook (`newbook`) per thumbnail.
4. `New window` (`separate`):
   Keep the legacy per-job behavior so each thumbnail can open through an independent Origin launch/session path.

Implementation note:

- `workbookSheets` and `workbookBooks` are both batch-in-one-session flows.
- `separate` is intentionally reserved for independent Origin windows, not just independent workbooks.
