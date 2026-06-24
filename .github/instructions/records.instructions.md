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
| `FileRecord` | `ISessionService` | import, assessment, slice, calculation, metric commits | Owns one imported file/workbook lifecycle. |
| `RawRecord` | `ISessionService` | file conversion commit | Raw file facts and `rawTablesById`; no assessment/template/plot semantics. |
| `RawTableRecord` | `ISessionService` | `fileConverter.ts` | Physical rows/source/health/template eligibility. Use `rawTableId`; keep failed rows unavailable. |
| `RawTableSourceRecord` | converter/session | CSV, Excel sheet, clipboard, manual, unknown | Source provenance only, not measurement semantics. |
| `RawTableRowsRecord` | converter/session | inline, normalized CSV, unavailable | Large rows should use artifact/path references. |
| `RawTableAssessmentRecord` | Assessment/RawTableEvidence + Session | `IAssessmentService` | Tied to raw table version, assessment rule version, and schema profile version; stores structure, column profiles, semantic candidates, groups, blocks, legacy evidence decision, and diagnostics. |
| `RawTableTemplateResolutionRecord` | Template Resolution bridge + Session | `ITemplateResolutionService` | Migration record tied to assessment signature, recipe fingerprint, and legacy template catalog version; stores candidate summaries/compatibility data for Review. |
| `RawTableReviewRecord` | Review + Session | `IReviewService` | Tied to evidence signature, Recipe fingerprint, UserTemplate/saved-template fingerprint, review engine version, and review policy version; stores candidates, reviews, and `ReviewDecision`. |
| `MeasurementGroupRecord` | Assessment + Session | assessment | Group/device labels and ordered block ids. |
| `MeasurementBlockRecord` | Assessment + Session | assessment | Measurement family/mode/source ranges/column roles. |
| `SliceRun` | Slice + Session | slice execution | Executed template snapshot, source assessment signature, input ranges, output series ids, output curve keys, warnings, and errors. |
| `SeriesRecord` | Slice/calculation + Session | slice or curve commit | Series metadata and raw/block provenance. |
| `CurveRecord` | Slice/calculation + Session | slice/calculation commit | Base/derived curve points, lineage, domain, signature. |
| `MetricRecord` | Parameters/calculation + Session | metric commit | Scalar/structured metric value with input signatures. |
| `MetricInputRecord` | Parameters + Session | user/manual metric input | Canonical user input affecting metric computation. |

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
| `TemplateState` | `ITemplateViewStateService` | service-local view state | selected-template/form/editor view interactions |
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
| `UserTemplateSnapshot` | `IUserTemplateService` | service-local snapshot | native user-template store version, scope versions, and effective fingerprint. |
| `SearchQuery` / `SearchResult` | `ISearchService` | service state/model | query/options/session/plot index |
| `ExportState` / `ExportPlan` | `IExportService` | service state/derived plan | export options/session/plot changes |
| `ParametersState` / `ParameterRowModel` | `IParametersService` | service state/model | metrics, manual inputs, selected file/plot context |
| `SchemaProfile` | schema profile source / Assessment consumer | service-local or external profile evidence, not Session canonical | exact schema fingerprint, confirmed count, conflict count |

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

- `RawTableEvidence` is the clean evidence shape produced from
  `RawTableAssessmentRecord`; it contains structure, column profiles, layout
  candidates, semantic candidates, blocks, and source metadata only.
- Do not call raw-table evidence `RecipeEvidence`. Recipe consumes evidence but
  does not own it.
- `MeasurementBlockRecord.family` stores measurement family (`iv`, `cv`, `cf`,
  `pv`, `it`, `unknown`), not plot transfer/output labels.
- `ivMode` is valid only for IV blocks; `itMode` is valid only for IT blocks.
- Raw table structure keeps physical header row, unit row, data region, block
  region, and schema fingerprint evidence without measurement-family semantics.
- `BlockRegion.kind` distinguishes a single table region from conservative
  repeated-header regions with the same exact schema fingerprint.
- Column profiles keep neutral column kind and numeric-stat evidence.
- Layout candidates keep shape-only binding drafts such as simple XY,
  shared-X multi-Y, pairwise XY, grouped sweep, wide matrix, time series,
  repeated block, and metadata preamble layouts. They are suitable for UI
  prefill and review, not for automatic calculation by themselves.
- Semantic candidates keep role/unit candidates, confidence, evidence sources,
  confirmation state, and display-scale suggestions.
- Column refs keep raw column, header text, role, unit, source range, confidence.
- Assessment decisions keep ready/inferred/review/unknown/failed state,
  automatic-apply allowance, confidence, and gating reasons.
- `RawTableAssessmentRecord.schemaProfileVersion` records the profile snapshot
  used for semantic evidence; profile changes make older assessments stale.
- Assessment records do not store Recipe fingerprints, Template/UserTemplate
  catalog versions, Template candidates, reviewed templates, or selected
  Template snapshots. Review owns candidate review and application decisions.
- Session raw-file read entries may project assessment schema fingerprints,
  column profiles, semantic candidates, blocks, layout candidates, and
  decisions for template planning or UI review; they remain derived read
  models, not duplicate owners.
- Diagnostics keep severity, code, message, source range, and related group/block ids.

### Schema profiles

- `SchemaProfile` stores user-confirmed bindings for one exact raw-table schema
  fingerprint; it is evidence consumed by Assessment, not assessment output.
- `SchemaProfileService` owns profile-scope storage and versioned snapshots;
  Session does not store profile records.
- User confirmation of role/unit bindings enters through
  `SchemaProfileService.confirmProfile(...)`; callers provide confirmed columns
  and Assessment-owned column profiles, and the schema profile owner persists a
  service-local exact-fingerprint profile snapshot.
- `SchemaProfileBinding.selector` may use column index, normalized header, or
  both. When both are present, both must match the profiled column.
- Only confirmed, conflict-free, exact fingerprint matches may produce
  `schemaProfile` semantic candidate evidence. Such profiles may unlock
  automatic calculation only when their confirmed x/y role-unit bindings
  unambiguously identify a supported measurement family. No fuzzy profile match
  may unlock automatic calculation.

### Template

- `Template` is a pure data-structure spec. It describes source hints, table
  structure, layout, blocks, fields, measurement, and defaults. It is not
  persisted in Session and must not be partitioned into assessment/slicing/
  binding/apply sub-templates.
- Assessment, slicing, and binding engines consume the same full
  `Template` and interpret the fields they own.
- `TemplateApplyConfig` owns legacy/manual extraction configuration such as
  data rows, segmentation, legend target, units, titles, y columns, and
  stop-on-error. It may be adapted into a canonical `Template` snapshot, but it
  is not Session canonical data.
- `TemplateApplyPresetRecord` owns saved user apply-preset data, not canonical
  measurement structure.
- `TemplateState` owns Template UI selected-template/form editor state through
  `ITemplateViewStateService`; it is not session canonical data and does not
  store per-file slicing selections.

### Review

- `RawTableReviewRecord` is the canonical audit fact for template usability and
  system-application recommendation for one raw table.
- Review records store the evidence signature, Recipe fingerprint,
  UserTemplate catalog fingerprint, ranked candidate
  summaries, per-candidate reviews, `ReviewDecision`, and creation time.
- `ReviewDecision.kind === "ready"` carries the selected
  `ReviewedTemplate.template` snapshot; that snapshot must be executable even
  if the source Recipe or UserTemplate changes later.
- `ReviewDecision.application.kind` is the only system-application gate. Do not
  duplicate it as `autoSliceAllowed`, `applyRecommendation`, or a separate
  selected-template field.
- `ReviewedTemplate.source` records provenance only. Manual/system/user command
  execution sources belong to `SliceRequest.trigger`.

### Template Resolution Bridge

- `RawTableTemplateResolutionRecord` is a migration bridge fact for automatic
  Template candidate derivation for one raw table.
- Resolution records store `sourceAssessmentSignature`, `recipeFingerprint`,
  `templateCatalogVersion` sourced from `UserTemplateSnapshot.version`, ranked
  `templateCandidates`, diagnostics, and `resolvedAt`.
- Resolution records do not store selected Template snapshots or application
  decisions. Review owns selected `ReviewedTemplate` snapshots.
- Resolution records do not store raw rows, Assessment blocks duplicated as
  owners, Review policy output, Slice queue state, or Slice output.

### Slice

- `SliceRun` is the canonical fact for executing a concrete `Template`.
- `SliceRequest` is the intended single execution input. During migration,
  legacy `enqueueAuto` / `runWithTemplate` APIs may remain as adapters only.
- `SliceRun.template` is the executed snapshot from a reviewed automatic
  template or manual input.
- `SliceRun.sourceAssessmentSignature` ties automatic runs to the evidence and
  review facts used to submit the request.
- `SliceCommit` atomically commits the `SliceRun`, produced `SeriesRecord`
  values, and produced base `CurveRecord` values through Session.
- Session read projections derive chart axis titles and units from the latest
  `SliceRun.template`.

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
