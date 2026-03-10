# Origin Workers (Offline Runtime)

This project now supports three offline-native workers (all built with `uv + pyinstaller`):

1. `origin-zip-worker.exe` for single ZIP import/plot (`Open in Origin`)
2. `origin-batch-worker.exe` for folder batch processing
3. `origin-csv-worker.exe` for single CSV import/plot

Python scripts remain available as debug fallback (dev mode only):

- `run_origin_job.ps1` (health-check and legacy fallback)
- `run_origin_batch.py` (batch fallback)
- `run_origin_zip.py` (ZIP fallback)
- `run_origin_csv.py` (CSV fallback)

Worker dependencies are installed into a project-local virtual environment by default:

- `.venv-origin-workers/` (gitignored)

## Build Worker EXEs (Dev Machine)

From repository root (build both workers):

```powershell
npm run build:origin-worker
```

Build only one worker:

```powershell
npm run build:origin-zip-worker
npm run build:origin-batch-worker
npm run build:origin-csv-worker
```

Direct scripts:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-origin-workers.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-origin-zip-worker.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-origin-batch-worker.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-origin-csv-worker.ps1
```

Optional parameters:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-origin-workers.ps1 -PythonVersion 3.11 -VenvDir .venv-origin-workers
```

Output path:

```text
origin/bin/origin-zip-worker.exe
origin/bin/origin-batch-worker.exe
origin/bin/origin-csv-worker.exe
```

## Runner Selection

ZIP job (`device-analysis-origin:run-zip`) order:

1. `ORIGIN_ZIP_WORKER_PATH` (if set and exists)
2. `origin/bin/origin-zip-worker.exe` (dev)
3. `origin/dist/origin-zip-worker.exe` (dev)
4. Python fallback (dev only): `origin/run_origin_zip.py`

Batch job (`device-analysis-origin:run-batch`) order:

1. `ORIGIN_BATCH_WORKER_PATH` (if set and exists)
2. `origin/bin/origin-batch-worker.exe` (dev)
3. `origin/dist/origin-batch-worker.exe` (dev)
4. Python fallback (dev only): `origin/run_origin_batch.py`

CSV job (`device-analysis-origin:run-csv`) order:

1. `ORIGIN_CSV_WORKER_PATH` (if set and exists)
2. `origin/bin/origin-csv-worker.exe` (dev)
3. `origin/dist/origin-csv-worker.exe` (dev)
4. Python fallback (dev only): `origin/run_origin_csv.py`

Packaged app behavior:

1. Worker EXE is preferred for ZIP/BATCH/CSV.
2. Packaged builds do not rely on local `python`/`originpro` for normal ZIP/BATCH/CSV execution.

## Worker CLI Contract

ZIP worker CLI (`origin-zip-worker.exe` / `run_origin_zip.py`):

```text
--work-dir <dir>
--extract-dir <dir>
--origin-exe <path>
--log-path <file>
--error-path <file>
--plot-type <int>                 # default 202
--xy-pairs <string>               # default ((1,2))
--plot-command <string>           # overrides plot-type/xy-pairs
--post-plot-command <string>      # repeatable
```

Batch worker CLI (`origin-batch-worker.exe` / `run_origin_batch.py`):

```text
--work-dir <dir>
--input-dir <dir>
--origin-exe <path>
--summary-path <file>
--log-path <file>
--error-path <file>
--plot-type <int>                 # default 202
--xy-pairs <string>               # default ((1,2))
--plot-command <string>           # overrides plot-type/xy-pairs
--post-plot-command <string>      # repeatable
```

CSV worker CLI (`origin-csv-worker.exe` / `run_origin_csv.py`):

```text
--work-dir <dir>
--csv-path <file>
--origin-exe <path>
--log-path <file>
--error-path <file>
--series-name <string>
--plot-type <int>                 # default 202
--xy-pairs <string>               # default ((1,2))
--plot-command <string>           # full LabTalk command; overrides plot-type/xy-pairs
--post-plot-command <string>      # repeatable; executed after main plot
```

Expected outputs:

1. Structured error JSON to `--error-path` on failure.
2. Exit code `0` on success, non-zero on failure.
3. Batch runner writes summary JSON to `--summary-path`.
