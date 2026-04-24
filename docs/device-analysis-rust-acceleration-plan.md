# Device Analysis Rust Acceleration Plan

This document describes the next Rust acceleration work for the `device-analysis` data pipeline. The project already uses the Rust sidecar in `tools/rust-xls-bench` / `excel/bin/rust-xls-converter.exe` for Excel conversion, preview, auto extraction, and processing in supported paths. The next step is to move more repeated parsing and numeric work into the same Rust engine, while keeping the existing Electron and worker fallbacks intact.

## Goals

- Reduce CPU and memory pressure when previewing, reading, and processing large CSV / Excel files.
- Reduce repeated PapaParse scans in TypeScript workers.
- Keep preview, auto inference, and final processing on one Rust data model where possible.
- Prepare a batch analysis API for gm, SS, Ion/Ioff, and related metrics.

## Non-goals

- Do not migrate React UI or regular UI state management to Rust.
- Do not make GPU acceleration the primary near-term path.
- Do not replace the Electron IPC architecture in the first phase.
- Do not change the user-visible import, preview, or analysis workflow.

## Current State

Existing Rust engine integration:

- `desktop/main.ts` manages the Rust sidecar through `device-analysis-rust-engine:*` IPC channels.
- `tools/rust-xls-bench/src/main.rs` supports `open`, `previewRows`, `processFile`, `processFileAuto`, `dispose`, and `clear`.
- `src/features/device-analysis/data/useDeviceAnalysisProcessing.ts` tries Rust processing first and falls back to the TypeScript worker.
- `src/features/device-analysis/data/useDeviceAnalysisPreview.ts` tries Rust preview first and falls back to the TypeScript worker.

Hotspots still on the TypeScript side:

- `src/features/device-analysis/workers/deviceAnalysis.worker.ts`
  - `buildPreviewMetadataAndIndex`
  - `parsePreviewRowsRange`
  - `readCsvCellNumber`
  - `processFile`
  - `inferAutoSegmentationFromXValues`
- `src/features/device-analysis/shared/lib/deviceAnalysisAutoExtraction.ts`
  - `inferDeviceAnalysisAutoExtraction`
  - `inferMetadataGroupShapeFromRows`
- `src/features/device-analysis/shared/lib/deviceAnalysisCurveClassification.ts`
  - `extractDeviceAnalysisCurveMetadata`
  - `classifyDeviceAnalysisCurve`
- `src/features/device-analysis/analysis/lib/analysisMath.ts`
  - `computeCentralDerivative`
  - `computeSubthresholdSwing`
  - `computeSubthresholdSwingFitAuto`
  - `computeLegendDerivativeSeries`
- `src/features/device-analysis/analysis/lib/deviceAnalysisMetrics.ts`
  - `computeBaseCurrentMetrics`

## Phase 1: Rust Preview and Cell Access

Phase 1 should move preview metadata and cell reads into Rust. This is the lowest-risk work with the most direct payoff, because the current TypeScript worker still reparses files for single-cell reads and range reads.

### Engine API

Add `previewMeta`:

```json
{ "id": 1, "command": "previewMeta", "fileId": "..." }
```

Return:

```json
{
  "fileId": "...",
  "fileName": "sample.csv",
  "rowCount": 100000,
  "columnCount": 12,
  "maxCellLengths": [4, 8, 12]
}
```

Add `readCell`:

```json
{
  "id": 2,
  "command": "readCell",
  "fileId": "...",
  "rowIndex": 12,
  "colIndex": 3
}
```

Return:

```json
{
  "fileId": "...",
  "rowIndex": 12,
  "colIndex": 3,
  "value": "1.23",
  "numberValue": 1.23
}
```

Add `readCells`:

```json
{
  "id": 3,
  "command": "readCells",
  "fileId": "...",
  "cells": [
    { "rowIndex": 1, "colIndex": 0 },
    { "rowIndex": 2, "colIndex": 0 }
  ]
}
```

Return:

```json
{
  "fileId": "...",
  "cells": [
    { "rowIndex": 1, "colIndex": 0, "value": "100", "numberValue": 100 },
    { "rowIndex": 2, "colIndex": 0, "value": "", "numberValue": null }
  ]
}
```

### Rust Dataset Model

The Rust engine currently loads files into `Vec<Vec<String>>`. Phase 1 can keep this as a compatibility layer, but should add metadata and lazy numeric caches:

- `row_count`
- `column_count`
- `max_cell_lengths`
- `rows`
- `numeric_column_cache: HashMap<usize, Vec<Option<f64>>>`
- direct cell lookup from loaded rows

For very large CSV files, a later iteration can add row offset indexing:

- Record byte offsets every N rows when opening CSV files.
- Parse `previewRows` from the closest known offset.
- Keep Excel files on the existing load path or convert them to an internal temporary CSV.

### TypeScript Changes

Target files:

- `src/features/device-analysis/workers/deviceAnalysis.worker.ts`
- `src/features/device-analysis/data/useDeviceAnalysisPreview.ts`
- `desktop/main.ts`
- `desktop/preload.ts`
- `desktop/ipc-channels.ts`

Required changes:

- Add `readCell` / `readCells` handlers in `desktop/main.ts`.
- Expose `readDeviceAnalysisCellWithRust` and `readDeviceAnalysisCellsWithRust` in `desktop/preload.ts`.
- Prefer Rust for group size, legend count, and legend step cell reads.
- Keep PapaParse fallback for browser mode and Rust engine failures.

### Acceptance Criteria

- Large CSV preview no longer triggers repeated full-file PapaParse scans.
- Group size, legend count, and legend step cell reads prefer Rust.
- Existing TypeScript fallback still works when the Rust engine is unavailable.
- `npm run test:unit` passes.
- `npm run typecheck` passes.

## Phase 2: Rust Auto Extraction and Classification

Phase 2 should move auto extraction and curve classification rules into Rust. The biggest value here is consistency: preview-time inference and processing-time inference should use one implementation.

### Engine API

Add `inferAutoExtraction`:

```json
{
  "id": 10,
  "command": "inferAutoExtraction",
  "fileId": "...",
  "fileName": "sample.csv"
}
```

Return:

```json
{
  "ok": true,
  "plan": {
    "dataStartRowIndex": 3,
    "xCol": 0,
    "yCols": [2],
    "xSegmentationMode": "points",
    "xPointsPerGroup": 101,
    "groups": 5,
    "curveType": "transfer",
    "xAxisRole": "vg",
    "confidence": "high"
  }
}
```

Optionally add a lower-level command first:

```json
{
  "id": 11,
  "command": "inferAutoWorkerConfig",
  "fileId": "..."
}
```

This can return the config payload already accepted by `processFile`.

### Porting Order

1. Port shared helpers such as `normalizeCellText`, `parseFiniteNumber`, and `computeSpan`.
2. Port `extractDeviceAnalysisCurveMetadata`.
3. Port `classifyDeviceAnalysisCurve`.
4. Port `inferMetadataGroupShapeFromRows`.
5. Port `inferDeviceAnalysisAutoExtraction`.
6. Port the Rust equivalent of `buildDeviceAnalysisAutoWorkerConfig`.

### Golden Tests

Use the existing TypeScript tests as the baseline:

- `src/features/device-analysis/shared/lib/deviceAnalysisCurveClassification.test.mjs`
- `src/features/device-analysis/shared/lib/deviceAnalysisAutoExtraction.test.mjs`

Suggested new script:

```text
scripts/verify-rust-auto-extraction-compat.mjs
```

Validation rules:

- Feed the same fixture rows into TypeScript and Rust.
- Compare `ok`, `curveType`, `xAxisRole`, `xCol`, `yCols`, `groups`, and `xPointsPerGroup`.
- Do not require `reasons` to match byte-for-byte; compare behavior-critical fields instead.

### Acceptance Criteria

- Rust `processFileAuto` can infer its own worker config.
- TypeScript auto extraction tests still pass.
- Rust compatibility tests pass.
- Auto inference failures still provide UI-friendly error messages.

## Phase 3: Rust Analysis Metrics

Phase 3 should move analysis-page precomputation into Rust. The most expensive target is automatic SS fit selection, followed by derivatives and Ion/Ioff windows.

Current Phase 3 status:

- `computeCentralDerivative`, `computeSubthresholdSwing`, `computeBaseCurrentMetrics` auto mode, and `computeSubthresholdSwingFitAuto` are ported to Rust and exposed through `analyzeSeriesBatch`.
- The analysis page prefetch path tries Rust for gm, SS diagnostics, Ion/Ioff auto metrics, and SS auto fit, then falls back to TypeScript for any missing results.
- `verify:rust-ss-auto` compares Rust against TypeScript on the 293K dataset and currently passes 579/579 series.
- `bench:phase3` now reports both the TypeScript baseline and projected Rust batch analysis time.
- The Rust SS auto search avoids repeated threshold-profile enumeration; on 293K, the projected analysis path is now under 1 second on the benchmark machine.

### Engine API

Add `analyzeSeriesBatch`:

```json
{
  "id": 20,
  "command": "analyzeSeriesBatch",
  "fileId": "...",
  "series": [
    {
      "id": "file_0_0",
      "groupIndex": 0,
      "x": [0, 1, 2],
      "y": [1e-9, 1e-8, 1e-7],
      "legendValue": 1.0
    }
  ],
  "sourceFile": {
    "curveType": "transfer",
    "xAxisRole": "vg",
    "supportsSs": true
  },
  "metrics": ["gm", "ss", "ssFitAuto", "baseCurrent"]
}
```

Return:

```json
{
  "fileId": "...",
  "series": {
    "file_0_0": {
      "gm": [{ "x": 0, "y": null }, { "x": 1, "y": 1e-8 }],
      "ss": [{ "x": 0, "y": null }, { "x": 1, "y": 230 }],
      "ssFitAuto": {
        "strict": { "ok": true, "ss": 120 },
        "suggested": { "ok": true, "ss": 130 }
      }
    }
  }
}
```

### Porting Order

1. `computeSubthresholdSwingFitAuto`
2. `computeCentralDerivative`
3. `computeSubthresholdSwing`
4. `computeBaseCurrentMetrics`
5. `computeLegendDerivativeSeries` if a legend-derivative UI path is re-enabled

`computeSubthresholdSwingFitAuto` should be the main optimization target. It performs window enumeration, linear fit, R2, decade span, and slope stability calculations. Rust should reduce both loop overhead and object allocation pressure.

### TypeScript Integration

Target files:

- `src/features/device-analysis/analysis/useAnalysisFileCache.ts`
- `src/features/device-analysis/analysis/lib/analysisMath.ts`
- `src/features/device-analysis/analysis/lib/deviceAnalysisMetrics.ts`

Strategy:

- Try `analyzeSeriesBatch` from `useAnalysisFileCache.ts`.
- When Rust succeeds, fill `gmByMode`, `ssDiagnosticsBySeriesId`, `baseMetricsBySeriesId`, and `ssAutoBySeriesId` from the result.
- Keep the existing TypeScript calculation path as fallback.

### Acceptance Criteria

- First entry into the analysis page is smoother on large datasets.
- Switching active files is smoother when many series are present.
- SS auto window selection matches the TypeScript baseline.
- `analysisMath.test.mjs` and `deviceAnalysisMetrics.test.mjs` pass.
- Large series batches do not block the UI main thread.

## GPU Assessment

GPU acceleration should remain an exploration path, not the near-term mainline. The current hotspots are mostly:

- file parsing
- rules and classification
- single-cell and row-range reads
- medium-sized one-dimensional scans
- branch-heavy window search

These are better suited to Rust CPU code. GPU transfer overhead, setup cost, and branch divergence would likely erase most gains.

GPU may be worth exploring later for:

- batched derivatives across many series
- interpolation of many curves onto a shared X grid
- heatmap, density map, or large visualization preprocessing

Any GPU work should be isolated from Phase 1 to Phase 3 acceptance.

## Implementation Checklist

Phase 1:

- [x] Add `previewMeta` to the Rust engine.
- [x] Add `readCell` to the Rust engine.
- [x] Add `readCells` to the Rust engine.
- [x] Add matching IPC channels in `desktop/ipc-channels.ts`.
- [x] Add handlers in `desktop/main.ts`.
- [x] Expose bridge methods in `desktop/preload.ts`.
- [x] Prefer Rust for TypeScript worker cell reads.
- [x] Keep PapaParse fallback.
- [x] Add or update preview / import tests.

Phase 2:

- [x] Port `extractDeviceAnalysisCurveMetadata`.
- [x] Port `classifyDeviceAnalysisCurve`.
- [x] Port `inferMetadataGroupShapeFromRows`.
- [x] Port `inferDeviceAnalysisAutoExtraction`.
- [x] Add `verify-rust-auto-extraction-compat.mjs`.
- [x] Use Rust inference inside `processFileAuto`.

Phase 3:

- [x] Port `computeCentralDerivative`.
- [x] Port `computeSubthresholdSwing`.
- [x] Port `computeBaseCurrentMetrics` auto mode.
- [x] Port `computeSubthresholdSwingFitAuto`.
- [x] Leave `computeLegendDerivativeSeries` on the TypeScript path; it has no current UI call site.
- [x] Add `analyzeSeriesBatch` IPC.
- [x] Integrate Rust gm, SS diagnostics, Ion/Ioff auto metrics, and SS auto batch analysis in `useAnalysisFileCache.ts`.
- [x] Add 293K `verify:rust-ss-auto` AB check.
- [x] Extend `bench:phase3` with Rust SS auto projected analysis timing.

## Verification Commands

Common validation:

```powershell
npm run test:unit
npm run typecheck
npm run verify:rust-auto-extraction
npm run verify:rust-ss-auto
npm run bench:phase3
```

Rust converter build:

```powershell
npm run build:rust-xls-converter
```

Existing Rust compatibility check:

```powershell
node scripts/verify-rust-xls-compat.mjs
```

Preview benchmark:

```powershell
node scripts/bench-rust-engine-preview.mjs
```

Import benchmark:

```powershell
node scripts/bench-device-analysis-import.mjs
```

## Risks

- JavaScript and Rust number formatting may diverge for legend labels, axis labels, or error messages.
- Ported classification reasons may affect UI text or tests if compared too strictly.
- `analyzeSeriesBatch` may become limited by JSON serialization for large arrays.
- Keeping `Vec<Vec<String>>` for compatibility means very large files may still have high memory peaks.

## Mitigations

- Use golden tests for user-visible behavior.
- Start with JSON payloads for simplicity, then consider temporary binary files or shared buffers if Phase 3 payload size becomes a bottleneck.
- Keep TypeScript fallback paths until Rust compatibility is proven.
- Ship and validate one phase at a time.

## Recommended First Task

Start with the smallest useful Phase 1 loop:

1. Add `readCell` and `readCells` to the Rust engine.
2. Expose the matching Electron bridge methods.
3. Prefer Rust for group size and legend cell reads in `deviceAnalysis.worker.ts`.
4. Keep the existing TypeScript fallback.
5. Run `npm run test:unit`, `npm run typecheck`, and `node scripts/bench-rust-engine-preview.mjs`.

This gives an immediate reduction in repeated PapaParse work and prepares the path for moving the rest of `processFile` into Rust.
