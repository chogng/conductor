# Device Analysis Rust Follow-up Optimization Plan

This document captures the next optimization pass after the completed Rust acceleration work in `docs/device-analysis-rust-acceleration-plan.md`. The current Rust sidecar already covers preview metadata, cell reads, auto extraction, processing, and batch analysis. The remaining work should focus on reducing duplicate data movement, avoiding repeated array construction, and improving multi-file throughput.

## Current Baseline

Rust is now on the main path for:

- Excel conversion through `excel/bin/rust-xls-converter.exe`.
- Preview open, preview rows, preview metadata, and cell reads.
- Auto extraction and curve classification.
- Manual and auto file processing.
- Batch analysis for gm, SS diagnostics, Ion/Ioff auto metrics, and SS auto fit.

The TypeScript path is still important as a compatibility fallback for browser mode, Rust startup failures, and unsupported edge cases.

## Implementation Status

Checklist:

- [x] Priority 1 partial: Rust Excel conversion writes a manifest with import assessment.
- [x] Priority 1 partial: renderer reuses Rust import assessment instead of reparsing generated CSV with PapaParse.
- [x] Priority 1 full: remove full CSV IPC payload from the Excel import happy path.
- [x] Priority 1 full: keep TypeScript fallback by lazily loading the converted CSV from disk only when Rust preview or processing fails.
- [x] Priority 2: analysis prefetch builds Rust payloads directly from `xGroups` and `series.y`.
- [x] Priority 2: point objects are built lazily only when TypeScript fallback work needs them.
- [x] Priority 3: add main-process Rust engine pool for real concurrent processing.
- [x] Priority 3: route Rust-capable processing jobs through the pool.
- [x] Priority 3: dispose processed datasets from pool engines after each processing job.
- [x] Priority 3: add renderer processing scheduler with bounded concurrency for normal and auto extraction.
- [x] Priority 3: extend bounded concurrency to rule-based template batches.
- [x] Priority 4: dense preview row ranges no longer expand into large `readCells` requests.
- [x] Priority 4: sparse cell reads remain on the Rust cell path.
- [x] Priority 5: `EngineDataset` has a lazy numeric column cache.
- [x] Priority 5: shared numeric cell helpers use the dataset numeric cache.
- [x] Verification: run `npm run bench:phase3` after the processing pool is integrated.

Notes:

- Priority 1 full now keeps the converted CSV on disk and stores `normalizedCsvPath`; the renderer loads CSV text only for TypeScript fallback.
- Priority 3 now has main-process engine parallelism for normal, auto, and rule-based extraction batches.
- Latest `npm run bench:phase3` on the 293K dataset reported `rustProcessMs=1687`, `rustAnalysisMs=884`, `analysis=9455ms`, `projectedAnalysis=890ms`, and `saved=8565ms`.

## Optimization Goals

- Lower peak memory during Excel import and large file preview.
- Reduce IPC payload size between Electron, the renderer, and the Rust sidecar.
- Avoid rebuilding equivalent `points`, `x`, and `y` arrays during analysis prefetch.
- Increase throughput for multi-file processing without making memory spikes worse.
- Keep all TypeScript fallback paths working until Rust behavior is proven on real datasets.

## Non-goals

- Do not replace the existing Electron IPC architecture in this pass.
- Do not remove TypeScript fallbacks yet.
- Do not rewrite React state management.
- Do not introduce GPU acceleration as the primary path.
- Do not change user-visible import, preview, processing, or analysis workflows unless needed for performance transparency.

## Priority 1: Avoid Returning Full CSV Text From Rust Excel Import

### Problem

`src/features/device-analysis/data/deviceAnalysisImportWorkerClient.ts` currently asks Rust to convert an Excel file and return the full `csvText`. The renderer then builds a new `File` from that string and immediately calls `assessImportedDeviceAnalysisFile`, which reparses a preview slice with PapaParse.

For large files, this creates avoidable memory pressure:

- Rust loads and converts the workbook.
- The full CSV string crosses IPC.
- The renderer creates another `File` / Blob around the CSV string.
- The classification preview is parsed again in TypeScript.

### Target Files

- `tools/rust-xls-bench/src/main.rs`
- `tools/rust-xls-bench/src/engine_dataset.rs`
- `desktop/main.ts`
- `desktop/preload.ts`
- `src/features/device-analysis/data/deviceAnalysisImportWorkerClient.ts`
- `src/features/device-analysis/shared/lib/deviceAnalysisImportFileUtils.ts`

### Proposed Design

Add a Rust import preparation API that returns normalized metadata and classification without sending the whole CSV text to the renderer:

```json
{
  "command": "prepareImportFile",
  "path": "C:/path/to/file.xls",
  "fileId": "..."
}
```

Return:

```json
{
  "ok": true,
  "result": {
    "fileName": "sample.xls",
    "sourceSizeBytes": 123456,
    "normalizedSizeBytes": 234567,
    "rowCount": 100000,
    "columnCount": 12,
    "maxCellLengths": [4, 8, 12],
    "assessment": {
      "curveType": "transfer",
      "curveTypeConfidence": "high",
      "curveTypeNeedsTemplate": false,
      "curveTypeReasons": [],
      "xAxisRole": "vg",
      "xAxisRoleSource": "metadata"
    }
  }
}
```

The renderer should prefer this metadata path when `sourcePath` is available. Keep the existing `csvText` path as a fallback until the new path is verified.

### Acceptance Criteria

- Excel import no longer requires full CSV text to cross IPC on the happy path.
- Import assessment is produced by Rust for Excel files.
- CSV files and browser fallback still use the existing TypeScript worker path.
- Existing import tests continue to pass.
- A benchmark shows lower peak memory or lower import roundtrip time on a large `.xls` / `.xlsx` sample.

## Priority 2: Remove Analysis Prefetch Array Duplication

### Problem

`src/features/device-analysis/analysis/useAnalysisFileCache.ts` builds point arrays through `buildPoints`, then `buildRustAnalysisSeriesPayload` walks those points and creates separate `x[]` and `y[]` arrays for Rust. On large processed files, the analysis prefetch path duplicates numeric arrays before Rust even starts computing.

### Target Files

- `src/features/device-analysis/analysis/useAnalysisFileCache.ts`
- `src/features/device-analysis/analysis/lib/analysisChartsUtils.ts`
- `tools/rust-xls-bench/src/engine_analysis.rs`
- `tools/rust-xls-bench/src/main.rs`
- `desktop/main.ts`
- `desktop/preload.ts`

### Proposed Design

Prefer one of these two designs, in order:

1. Add a Rust analysis payload that accepts `xGroups[groupIndex]` and `series.y` directly, so the renderer does not need to rebuild `x[]` from point objects.
2. Move optional analysis precompute into `processFile` / `processFileAuto`, so gm, SS diagnostics, Ion/Ioff auto metrics, and SS auto fit can be attached to the processed result.

The first design is smaller and lower risk. The second design is more powerful, because analysis page entry can become mostly cache reads.

### Acceptance Criteria

- `useAnalysisFileCache.ts` stops creating point arrays solely for the Rust request.
- TypeScript fallback can still build points when Rust analysis is unavailable.
- `npm run verify:rust-ss-auto` still passes.
- `npm run bench:phase3` reports reduced analysis preparation or payload time.

## Priority 3: Add Controlled Multi-file Processing Concurrency

### Problem

`src/features/device-analysis/data/useDeviceAnalysisProcessing.ts` processes files one at a time. This keeps memory predictable, but it leaves throughput on the table after Rust became the dominant processing path.

### Target Files

- `src/features/device-analysis/data/useDeviceAnalysisProcessing.ts`
- `src/features/device-analysis/shared/lib/deviceAnalysisPerf.ts`
- `tools/rust-xls-bench/src/main.rs`

### Proposed Design

Add a small processing scheduler with a configurable concurrency limit:

- Default concurrency: `2`.
- Maximum initial concurrency: `4`.
- Keep `stopOnError` behavior deterministic.
- Preserve processed result ordering if the UI depends on it; otherwise record completion order explicitly.
- Fall back to single-worker TypeScript processing when Rust is unavailable.

The scheduler should only run concurrent jobs for Rust-capable entries with a valid `sourcePath`. TypeScript worker fallback can remain serial during the first implementation.

### Acceptance Criteria

- Multi-file Rust processing can run at least two files concurrently.
- Removing queued files during processing still works.
- `stopOnError` stops launching new work and marks in-flight results consistently.
- Progress reporting remains accurate.
- Peak memory is measured on a large batch before increasing the default above `2`.

## Priority 4: Separate Row-range Reads From Cell-probe Reads

### Problem

`src/features/device-analysis/data/useDeviceAnalysisPreview.ts` uses `readDeviceAnalysisCellsWithRust` as a fallback for row-range reads by expanding every `(row, col)` pair into individual cell requests. This is fine for sparse probes, but expensive for dense preview ranges.

### Target Files

- `src/features/device-analysis/data/useDeviceAnalysisPreview.ts`
- `src/features/device-analysis/data/preview/rustPreviewCells.ts`
- `tools/rust-xls-bench/src/main.rs`
- `tools/rust-xls-bench/src/engine_dataset.rs`

### Proposed Design

Keep two distinct access patterns:

- Use `previewRows` for dense row ranges.
- Use `readCell` / `readCells` only for sparse random probes such as group-size cells and legend metadata cells.

If `previewRows` fails for a Rust-backed file, fall back directly to the TypeScript worker. Avoid expanding dense row ranges into thousands of cell request objects.

### Acceptance Criteria

- Dense preview scrolling does not call `readDeviceAnalysisCellsWithRust`.
- Sparse metadata reads continue to prefer Rust.
- `rustPreviewCells.test.mjs` remains focused on sparse cell reconstruction.
- Preview fallback behavior is unchanged when Rust fails.

## Priority 5: Add Lazy Numeric Column Caches in Rust

### Problem

`tools/rust-xls-bench/src/engine_dataset.rs` stores rows as `Vec<Vec<String>>`. Numeric values are parsed repeatedly in helpers such as cell reads, inference, legend resolution, and processing.

### Target Files

- `tools/rust-xls-bench/src/engine_dataset.rs`
- `tools/rust-xls-bench/src/engine_cells.rs`
- `tools/rust-xls-bench/src/engine_infer.rs`
- `tools/rust-xls-bench/src/engine_legend.rs`
- `tools/rust-xls-bench/src/main.rs`

### Proposed Design

Extend `EngineDataset` with lazy numeric caches:

```rust
pub struct EngineDataset {
    pub column_count: usize,
    pub file_name: String,
    pub max_cell_lengths: Vec<usize>,
    pub rows: Vec<Vec<String>>,
    numeric_column_cache: HashMap<usize, Vec<Option<f64>>>,
}
```

Expose helper methods instead of parsing directly from call sites:

- `cell_text(row_index, col_index)`
- `cell_number(row_index, col_index)`
- `column_numbers(col_index)`
- `column_numbers_from(col_index, start_row)`

If mutable access becomes awkward inside existing helpers, use `RefCell<HashMap<...>>` or split numeric cache ownership into a small dataset service. Keep the first implementation simple and benchmark before adding more structure.

### Acceptance Criteria

- Repeated numeric reads of the same column reuse cached parse results.
- Existing Rust compatibility checks still pass.
- `npm run verify:rust-auto-extraction` still passes.
- `npm run verify:rust-ss-auto` still passes.
- Benchmarks show no regression on small files.

## Suggested Execution Order

1. Implement Priority 4 first if preview code feels unstable; it is small and reduces an inefficient fallback path.
2. Implement Priority 2 next; it has a strong payoff and does not require changing import semantics.
3. Implement Priority 1 after the Rust import metadata contract is clear.
4. Implement Priority 5 once the call sites are ready to use dataset helper methods.
5. Implement Priority 3 after memory behavior from Priority 1 and Priority 2 is measured.

If the goal is fastest user-visible improvement, start with Priority 2. If the goal is memory stability for very large Excel files, start with Priority 1.

## Verification Commands

Run the focused checks for the area being changed, then finish with the broader suite before shipping:

```powershell
npm run test:unit
npm run typecheck
npm run verify:rust-auto-extraction
npm run verify:rust-ss-auto
npm run bench:phase3
```

For Rust changes:

```powershell
npm run build:rust-xls-converter
```

For preview changes:

```powershell
node scripts/bench-rust-engine-preview.mjs
```

For import changes, use any existing import benchmark script. If the benchmark is missing or stale, add a small script that records:

- file name
- source size
- normalized size
- import roundtrip time
- Rust duration
- renderer duration
- peak process memory when available

## Rollout Notes

- Keep each priority behind the existing capability checks on `window.desktopImport`.
- Log source labels such as `rust-import-meta`, `rust-analysis-direct`, or `rust-engine-concurrent` so perf output remains easy to compare.
- Prefer additive IPC methods first. Remove older methods only after real datasets have passed.
- Update this document after each priority with benchmark notes and any changed assumptions.

## Next Pass: Analysis Payload and Chart Rendering

The completed Rust path made numeric analysis fast enough that the next bottlenecks are mostly data shape and rendering overhead. This pass should avoid rebuilding identical arrays in the renderer and only move drawing technology where the current SVG path is measurably expensive.

Checklist:

- [x] Audit current Rust, chart, parameter, and cold-start paths.
- [x] Pick the first implementation target: analysis payload de-duplication before chart rewrites.
- [x] Add shared-`xGroups` Rust analysis payload support while keeping the existing `{x, y}` payload compatible.
- [x] Update `useAnalysisFileCache.ts` so Rust prefetch sends each X group once and each series references `groupIndex`.
- [x] Verify TypeScript fallback still builds points lazily only when Rust misses or fails.
- [x] Run focused checks: `npm run typecheck`, `npm run verify:rust-ss-auto`, and `npm run bench:phase3` when practical.
- [x] After payload work, prototype main-chart Canvas/uPlot rendering behind a feature flag; keep thumbnail charts on current Canvas 2D.

Non-goals for this pass:

- Do not introduce WebGL/GPU as the default chart renderer.
- Do not remove Recharts until the replacement handles overlays, tooltip behavior, legend selection, and manual marker dragging.
- Do not prewarm Rust during app cold start unless boot logs prove it improves first useful interaction.

Implementation notes:

- `analyzeSeriesBatch` now accepts either legacy series entries with `{x, y}` or compact entries with `{groupIndex, y}` plus top-level `xGroups`.
- The renderer no longer filters and rebuilds per-series X arrays for Rust prefetch; Electron normalizes the shared X groups once before forwarding to Rust.
- Verification on 2026-04-25: `cargo check`, `npm.cmd run typecheck`, `npm.cmd run verify:rust-ss-auto`, `npm.cmd run bench:phase3`, and a direct stdio smoke test for the compact payload all passed.
- Latest benchmark: `rustAnalysisMs=709`, `projectedAnalysis=714ms`, `saved=8379ms` on the 293K phase3 benchmark set.
- Main plot Canvas 2D is now the default main-chart renderer, including manual current-bias and SS-window interaction through the shared overlay. It can still be disabled with `localStorage.CONDUCTOR_DA_CANVAS_MAIN_PLOT = "0"` or `window.__CONDUCTOR_DA_CANVAS_MAIN_PLOT__ = false`.
- Log and log-absolute Canvas rendering now follows source gap semantics: bidirectional transfer traces are split into forward/reverse branches, invalid log points break the path, single isolated valid points are not connected, and finite out-of-domain Y values are clipped by the plot area instead of breaking the path. Canvas also invokes the existing legend content callback so editable/toggleable chart legends remain visible.
- Main plot log/log-absolute series now keep the full source point sequence before rendering so invalid-gap rows are not lost by display downsampling. Linear plots still use the display point budget, and render-series caching is keyed by `yScaleMode` so linear/log mode switches cannot reuse the wrong point sequence.
- Canvas layer ordering now draws highlight fills, grid/axes, clipped series paths, and then marker/window lines, which keeps the data visible while preserving draggable overlays. Tooltip inspection ignores points outside the current visible domain so the crosshair cannot snap to hidden samples.
- Canvas numeric reads now reject `null`/empty values before coercion. This prevents log-null points from becoming `0` (`10^0 = 1A`) and drawing false top-edge vertical spikes in low-current regions.
- Canvas path construction is now covered by unit tests through `canvasPlotUtils`: strict numeric coercion, log gap breaking, and bidirectional sweep splitting are checked without requiring a browser harness.
- Canvas tooltip inspect now caches per-series lookup data, uses binary search for monotonic X traces, falls back to exact linear search for non-monotonic traces, and displays the real source point index with a crosshair/dot marker.
- Canvas prototype verification on 2026-04-25: `npm.cmd run typecheck`, `npm.cmd run test:unit`, and `npm.cmd run build` passed.
- Browser smoke verification on 2026-04-25: a temporary Vite harness rendered the default Canvas path as `canvas=1/svg=0`, confirmed the canvas backing/store size was non-zero, rendered current-bias and SS interaction modes as `canvas=1/svg=0` with the shared interaction overlay mounted, and rendered the explicit opt-out Recharts path as `svg=1/canvas=0`.
