# Origin Workers (Offline Runtime)

This project uses one offline-native worker (built with `uv + pyinstaller`):

1. `origin-csv-worker.exe` for CSV import/plot (`Open in Origin`)

Python script remains available as debug fallback (dev mode only):

- `run_origin_job.ps1` (health-check script)
- `run_origin_csv.py` (CSV fallback)

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

Output path:

```text
origin/bin/origin-csv-worker.exe
```

## Runner Selection

CSV job (`device-analysis-origin:run-csv`) order:

1. `ORIGIN_CSV_WORKER_PATH` (if set and exists)
2. `origin/bin/origin-csv-worker.exe` (dev)
3. `origin/dist/origin-csv-worker.exe` (dev)
4. Python fallback (dev only): `origin/run_origin_csv.py`

Packaged app behavior:

1. Worker EXE is preferred for CSV.
2. Packaged builds do not rely on local `python`/`originpro` for normal CSV execution.

## Worker CLI Contract

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
