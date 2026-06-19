---
description: Record and state ownership catalog for Conductor services. Use when adding or changing canonical records, service state, view models, or command targets.
applyTo: 'src/cs/workbench/services/**,src/cs/workbench/contrib/**,src/cs/platform/files/**'
---
# Records and State

A `Record` is a stable business fact that can be stored in or reconstructed
from Session. A `State` is owned by a service/view and describes current
behavior or UI/service condition. A `Model` is a derived projection for
rendering or execution.

When adding or changing a shared type, document owner, producer, consumers,
canonical/service-local status, invalidation, and provenance refs. Do not stop
at the type name.

## Checklist

| Question | Required answer |
| --- | --- |
| Owner | Which service mutates it? |
| Producer | Which workflow creates it? |
| Consumers | Which services/views read it? |
| Storage | Session canonical, service-local, view-local, or derived only? |
| Invalidation | Which version/signature/settings invalidate it? |
| Provenance | Does it reference raw data via `RawTableRangeRef`, `MeasurementBlockId`, `CurveKey`, `MetricKey`, etc.? |

## Canonical Session Records

| Record | Owner | Producer | Invalidation / notes |
| --- | --- | --- | --- |
| `SessionModel` | `ISessionService` | session commits | Canonical root: `schemaVersion`, `sessionVersion`, `filesById`, `fileOrder`. |
| `FileRecord` | `ISessionService` | import, assessment, template, calculation, metric commits | Owns one imported file/workbook lifecycle. |
| `RawRecord` | `ISessionService` | file conversion commit | Raw file facts and `rawTablesById`; no assessment/template/plot semantics. |
| `RawTableRecord` | `ISessionService` | `fileConverter.ts` | Physical rows/source/health/template eligibility. Use `rawTableId`; keep failed rows unavailable. |
| `RawTableSourceRecord` | converter/session | CSV, Excel sheet, clipboard, manual, unknown | Source provenance only, not measurement semantics. |
| `RawTableRowsRecord` | converter/session | inline, normalized CSV, unavailable | Large rows should use artifact/path references. |
| `RawTableAssessmentRecord` | Assessment + Session | `IAssessmentService` | Tied to raw table version; stores groups, blocks, diagnostics. |
| `MeasurementGroupRecord` | Assessment + Session | assessment | Group/device labels and ordered block ids. |
| `MeasurementBlockRecord` | Assessment + Session | assessment | Measurement family/mode/source ranges/column roles. |
| `SeriesRecord` | Template/calculation + Session | template or curve commit | Series metadata and raw/block provenance. |
| `CurveRecord` | Template/calculation + Session | template/calculation commit | Base/derived curve points, lineage, domain, signature. |
| `MetricRecord` | Parameters/calculation + Session | metric commit | Scalar/structured metric value with input signatures. |
| `MetricInputRecord` | Parameters + Session | user/manual metric input | Canonical user input affecting metric computation. |
| `TemplateRunRecord` | Template + Session | template apply commit | Effective config, input refs, output series/curve ids, fingerprint. |

Session must not store view state such as selection, scroll, popovers, draft
forms, search query, export dialog state, thumbnail caches, worker refs, or row
caches.

## Raw Data Provenance

Use `RawTableRangeRef` for anything that points back to source cells:
assessment blocks, columns, diagnostics, search results, parameters, export
provenance, and template inputs.

`RangeRef` is physical zero-based inclusive coordinates:
`startRow`, `endRow`, `startCol`, `endCol`.

`RawTableRangeRef` adds `fileId`, `rawTableId`, and `range`.

## File Conversion Records

| Type | Owner | Notes |
| --- | --- | --- |
| `FileImportInput` | files source workflow | Sources plus conversion options. Do not turn options into Explorer UI state. |
| `FileConversionResult` | `fileConverter.ts` output; Session commits | Contains converted files and diagnostics. Not the entire Explorer add-data workflow result. |
| `ImportedFileRecord` | converter output; Session commits | `id`, `name`, `kind`, `raw`. One Excel workbook should produce one imported file with one raw table per sheet. |
| `FileImportDiagnostic` | converter/files workflow | Import warnings/errors only; not IV/CV assessment. |

Conversion records must not encode measurement blocks, curve types, plot
series, template decisions, or assessment confidence.

## Service-Local State

| State/model | Owner | Storage | Invalidation |
| --- | --- | --- | --- |
| `ColumnDisplayProfile` | `TableModel` / `ITableService` | derived view/service state | raw source version, numeric display mode, cache clear |
| `TemplateState` | `ITemplateService` | service-local | template persistence, form/editor/apply view interactions |
| `TemplateApplyWorkflowInput` | `ITemplateApplyWorkflowService` | service-local workflow input | session/read-model, Explorer selection, pending import, Template state |
| `PlotState` | `IPlotService` | service state/settings-backed pieces | plot setting changes |
| `PlotRenderModel` | `IPlotService` | derived model/cache | source curve keys, settings, visibility/focus, signatures |
| `ThumbnailPreviewState` | `IThumbnailPreviewService` | service-local cache state | Session/Plot cache changes, preview request priority |
| `ChartState` | `IChartService` | chart shell state | chart UI actions |
| `ChartViewInput` | `IChartService` | service-local snapshot | source owner changes; event announces snapshot changed only |
| `TableState` | `ITableService` | service state | source, row cache, selection/highlight/reveal changes |
| `TableSelection` | active `TableWidget` + `ITableService` snapshot | service-local | widget interaction or external reveal/select |
| `TableColumnWidth` | `ITableService` + storage | workspace view state | table source key or explicit width reset |
| `ExplorerState` | `IExplorerService` | service state | Explorer selection/layout/expansion/source workflow changes |
| `ExplorerResource` / `ExplorerFileEntry` | Explorer projection | derived view input | session, source workflow, badge/template/chart state projections |
| `TemplateApplyFileState` | template apply workflow | service-local projection | processing queue/run updates |
| `SearchQuery` / `SearchResult` | `ISearchService` | service state/model | query/options/session/plot index |
| `ExportState` / `ExportPlan` | `IExportService` | service state/derived plan | export options/session/plot changes |
| `ParametersState` / `ParameterRowModel` | `IParametersService` | service state/model | metrics, manual inputs, selected file/plot context |

Service-local view input events should not carry the full snapshot as the data
path. Consumers subscribe, then call `getState()`, `getViewInput()`, or
`getPaneInput()`.

## Domain Field Rules

### Raw tables

- `RawRecord` contains source facts and `rawTablesById` / `rawTableOrder`.
- `RawTableRecord` contains source, row storage, row/column counts, health,
  max display lengths, and template eligibility.
- Decode/parse failures stay as health/unavailable row records; they do not
  become normal rows.

### Assessment

- `MeasurementBlockRecord.family` stores measurement family (`iv`, `cv`, `cf`,
  `pv`, `it`, `unknown`), not plot transfer/output labels.
- `ivMode` is valid only for IV blocks; `itMode` is valid only for IT blocks.
- Column refs keep raw column, header text, role, unit, source range, confidence.
- Diagnostics keep severity, code, message, source range, and related group/block ids.

### Template

- `TemplateConfig` owns extraction configuration such as data rows, segmentation,
  legend target, units, titles, y columns, and stop-on-error.
- `TemplateState` owns editor/apply UI state; it is not session canonical data.
- `TemplateRunRecord` owns effective config, selection, source inputs, outputs,
  fingerprint, mode, warnings, and errors.

### Plot/calculation

- `CalculatedData`, `CalculatedSeries`, and `CalculatedPoint` are derived
  calculation results, not canonical session records.
- `PlotRenderModel` is display-ready and should include file id, plot type,
  series list, axis model, source curve keys, point count, signature, diagnostics.
- `PlotSeriesModel` is display-focused: label, visible/focused state,
  downsampled points, raw point count, source range.
- Axis/unit/scale choices are mutated through `IPlotService`; persistence lives
  in settings unless a canonical record is intentionally introduced.

### Thumbnail

- `ThumbnailPreviewState.kind` is preview lifecycle (`idle`, `loading`,
  `rawReady`, `ready`, `fastReady`, `error` as supported by code).
- Ready states carry a Plot-provided preview model/signature.
- Thumbnail state is never Session canonical.

### Chart/table/explorer

- `ChartViewInput` is a chart service snapshot; consumers reread it from
  `IChartService`.
- `TableSource` is a pure open target, not raw rows or behavior.
- `TableSelection` is interaction state, not Session data.
- `ExplorerState` owns layout, selected file id, expanded folders, folder order,
  source workflow status, error, and drag state.
- `ExplorerFileEntry` is a projection for rendering; badge/chart/template fields
  are display facts, not conversion output.

## Do Not

- Do not expose private owner state as mutable public API.
- Do not put service/view state in `SessionModel`.
- Do not store raw rows in plot/template/search/export records when a source ref is enough.
- Do not add duplicate field catalogs to module instruction files; link here and add only module-specific invalidation notes.
- Do not create behavior methods on records/targets.
- Do not add generic `createdAt`, diagnostics, or cache-key fields unless a real caller needs them.
