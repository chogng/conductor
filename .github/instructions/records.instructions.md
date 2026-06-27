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
| `FileRecord` | `ISessionService` | import, slice, calculation, metric commits | Owns one imported file/workbook lifecycle in the remaining raw-table ledger. |
| `RawRecord` | `ISessionService` | raw-table import commit | Raw file facts and `rawTablesById`; no table-model/template/plot semantics. |
| `RawTableRecord` | `ISessionService` | Session import commit | Physical rows/source/health/template eligibility. Use `rawTableId`; keep failed rows unavailable. |
| `RawTableSourceRecord` | files/session | CSV, Excel sheet, clipboard, manual, unknown | Source provenance only, not measurement semantics. |
| `RawTableRowsRecord` | files/session | inline, normalized CSV, unavailable | Large rows should use artifact/path references. |
| `SliceRun` | Slice + Session | slice execution | Executed template snapshot, source signature, input ranges, output series ids, output curve keys, warnings, and errors. |
| `SeriesRecord` | Slice/calculation + Session | slice or curve commit | Series metadata and raw/block provenance. |
| `CurveRecord` | Slice/calculation + Session | slice/calculation commit | Base/derived curve points, lineage, domain, signature. |
| `MetricRecord` | Parameters/calculation + Session | metric commit | Scalar/structured metric value with input signatures. |
| `MetricInputRecord` | Parameters + Session | user/manual metric input | Canonical user input affecting metric computation. |

Session must not store URI/editor input models, format support-check results,
preview rows, watch/reload state, model caches, active resource/view input, or
view state such as selection, scroll, popovers, draft forms, search query,
export dialog state, thumbnail caches, worker refs, or row caches.

## Raw Data Provenance

Use `RawTableRangeRef` for anything that points back to source cells:
table-model blocks, columns, diagnostics, search results, parameters, export
provenance, and template inputs.

`RangeRef` is physical zero-based inclusive coordinates:
`startRow`, `endRow`, `startCol`, `endCol`.

`RawTableRangeRef` adds `fileId`, `rawTableId`, and `range`.

## File Import Records

| Type | Owner | Notes |
| --- | --- | --- |
| `FileImportInput` | files source workflow | Sources plus import options. Do not turn options into Explorer UI state. |
| `FileImportResult` | files source/import helpers; Session import commits | Contains imported files and diagnostics. Not the entire Explorer add-data workflow result. |
| `ImportedFileRecord` | files source/import helpers; Session import commits | `id`, `name`, `kind`, `raw`. One workbook should produce one imported file with one raw table per sheet when this migration ledger is used. |
| `FileImportDiagnostic` | files workflow | Import warnings/errors only; not IV/CV table-model classification. |

Import records must not encode measurement blocks, curve types, plot
series, template decisions, or table-model confidence.

## Service-Local State

| State/model | Owner | Storage | Invalidation |
| --- | --- | --- | --- |
| Table editor/input model | table editor/model owner | service-local URI/input model, not a Session record | resource change, reload, close/dispose, cache invalidation |
| `ColumnDisplayProfile` | `TableViewModel` / `ITableService` | derived view/service state | raw source version, numeric display mode, cache clear |
| `TemplateState` | `ITemplateViewStateService` | service-local view state | selected-template/form/editor view interactions |
| `PlotState` | `IPlotService` | service state/settings-backed pieces | plot setting changes |
| `PlotRenderModel` | `IPlotService` | derived model/cache | source curve keys, settings, visibility/focus, signatures |
| `ThumbnailPreviewState` | `IThumbnailPreviewService` | service-local cache state | Session/Plot cache changes, preview request priority |
| `ChartState` | `IChartService` | chart shell state | chart UI actions |
| `ChartViewInput` | `IChartService` | service-local snapshot | source owner changes; event announces snapshot changed only |
| `TableState` | `ITableService` | service state | source, row cache, selection/highlight/reveal changes |
| `TableSelection` | active `TableWidget` + `ITableService` snapshot | service-local | widget interaction or external reveal/select |
| `TableColumnWidth` | `ITableService` + storage | workspace view state | table sheet key or explicit width reset |
| `ExplorerState` | `IExplorerService` | service state | Explorer selection/layout/expansion/source workflow changes |
| `ExplorerResource` / `ExplorerFileEntry` | Explorer view input | derived view input | resource/source workflow plus template/chart display state; semantic decoration comes from Review providers |
| `UserTemplateSnapshot` | `IUserTemplateService` | service-local snapshot | native user-template store version, scope versions, and effective fingerprint. |
| `SearchQuery` / `SearchResult` | `ISearchService` | service state/model | query/options/session/plot index |
| `ExportState` / `ExportPlan` | `IExportService` | service state/derived plan | export options/session/plot changes |
| `ParametersState` / `ParameterRowModel` | `IParametersService` | service state/model | metrics, manual inputs, selected file/plot context |
| `SchemaProfile` | schema profile source / table-model consumer | service-local or external profile evidence, not Session canonical | exact schema fingerprint, confirmed count, conflict count |

Service-local view input events should not carry the full snapshot as the data
path. Consumers subscribe, then call `getState()`, `getViewInput()`, or
`getPaneInput()`.

`TableSource` is a service-local open target, not a Session record. `resource`
is the primary file -> table open identity, following the upstream file ->
editor shape. Explorer file actions keep `fileId`; Explorer visible-row
disambiguation uses `itemKey`, and Session raw read projections use canonical
`tableKey` when a migration-ledger raw-table sheet needs a stable table key. Neither
replaces the URI identity for resource opens.

## Domain Field Rules

### Raw tables

- `RawRecord` contains source facts and `rawTablesById` / `rawTableOrder`.
- `RawTableRecord` contains source, row storage, row/column counts, health,
  max display lengths, and template eligibility.
- Decode/parse failures stay as health/unavailable row records; they do not
  become normal rows.

### Table Projection Evidence

- Table projection evidence is a pure content/review value, not a Session
  ledger record. It may contain structure, column profiles, layout candidates,
  semantic candidates, groups, blocks, diagnostics, and source metadata.
- Primary consumer path is optional `ReviewEvidence.tableProjection`. Review
  candidate derivation combines Recipe/UserTemplate snapshots with URI/content
  evidence.
- Do not call content evidence `RecipeEvidence`. Recipe is fixed rules; Review
  combines rules with URI/content evidence.
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
- Projection evidence does not store Recipe fingerprints, Template/UserTemplate
  catalog versions, review candidates, reviewed templates, selected Template
  snapshots, decision state, confidence gates, or auto-apply flags. Review owns
  candidate building, review, and application decisions.
- Diagnostics keep severity, code, message, source range, and related group/block ids.
  Parser `fatal` diagnostics may be projected into review evidence for blocking
  Review hard gates; recoverable parser errors remain non-fatal diagnostics and
  should only affect parse-health scoring.

### Schema profiles

- `SchemaProfile` stores user-confirmed bindings for one exact raw-table schema
  fingerprint; it is projection/review input, not Session canonical output.
- `SchemaProfileService` owns profile-scope storage and versioned snapshots;
  Session does not store profile records.
- User confirmation of role/unit bindings enters through
  `SchemaProfileService.confirmProfile(...)`; callers provide confirmed columns
  and current column profiles, and the schema profile owner persists a
  service-local exact-fingerprint profile snapshot.
- `SchemaProfileBinding.selector` may use column index, normalized header, or
  both. When both are present, both must match the profiled column.
- Only confirmed, conflict-free, exact fingerprint matches may produce
  `schemaProfile` semantic candidate evidence. Such profiles may unlock
  automatic calculation only when their confirmed x/y role-unit bindings
  unambiguously identify a supported measurement family. No fuzzy profile match
  may unlock automatic calculation.

### Template

- `Template` is a pure executable data-structure spec produced only after
  Review accepts a `ReviewCandidate` interpretation or manual input. It
  describes source hints, table structure, layout, blocks, fields, measurement,
  and defaults. It is not persisted in Session outside SliceRun snapshots
  and must not be partitioned into table-model/slicing/binding/apply
  sub-templates.
- Review consumes `ReviewCandidate` values. Slice consumes reviewed
  Template snapshots. Neither Slice nor Template rebuilds Recipe or
  URI/content evidence.
- `TemplateEditorConfig` owns manual extraction configuration such as
  data rows, segmentation, legend target, units, titles, y columns, and
  stop-on-error. It may be adapted into a canonical `Template` snapshot, but it
  is not Session canonical data.
- `TemplateEditorRecord` owns editable user-template data, not canonical
  measurement structure.
- `TemplateState` owns Template UI selected-template/form editor state through
  `ITemplateViewStateService`; it is not session canonical data and does not
  store per-file slicing selections.

### Review

- `ReviewResult` is the Review-owned result fact for template usability
  and system-application recommendation. URI-backed latest results are held by
  `IReviewService` cache/state and associated with URI identity:
  `resource` plus optional `contentHash` / `sourceVersion` and optional
  `sheetId`. Do not expose a separate public result target.
- URI-backed latest review results stay in `IReviewService` cache/state.
- Review results store URI/content provenance, the candidate interpretation
  signature, Recipe fingerprint, UserTemplate catalog fingerprint, ranked
  candidate summaries, per-candidate reviews, and `ReviewDecision`.
- `ReviewResult` records the review target identity when available
  (`resource`, optional `contentHash`, optional `sheetId`), `modelVersion`,
  `sourceVersion`, `evidenceFingerprint`, candidate summaries, per-candidate
  factors/findings, decision, and the selected `reviewedTemplate` only when
  ready.
- `ReviewDecision.kind === "ready"` carries the selected
  `ReviewedTemplate.template` snapshot; that snapshot must be executable even
  if the source Recipe or UserTemplate changes later.
- `ReviewDecision.application.kind` is the only system-application gate. Do not
  duplicate it as `autoSliceAllowed`, `applyRecommendation`, or a separate
  selected-template field.
- `ReviewedTemplate.source` records provenance only. Manual/system/user command
  execution sources belong to `SliceRequest.trigger`.

### Slice

- `SliceRun` is the canonical fact for executing a concrete `Template`.
- `SliceRequest` is the intended single raw-table execution input. `enqueueAuto`
  may remain as the automatic review-decision adapter; manual execution must
  enter Slice through reviewed `SliceRequest` values, not a `runWithTemplate`
  service API.
- `SliceUriRequest` is the URI-backed execution input. Its target is
  `resource` plus optional `sheetId`; it must not be converted into a public or
  common synthetic raw-table identity.
- `SlicePlan` carries either a migration-ledger raw-table target or a URI target. Its
  input ranges preserve the same target provenance.
- `SliceRun.template` is the executed snapshot from a reviewed automatic
  template or manual input.
- `SliceRun.sourceTableModelSignature` ties automatic runs to the table model
  and review records used to submit the request.
- `SliceCommit` atomically commits the `SliceRun`, produced `SeriesRecord`
  values, and produced base `CurveRecord` values through Session.
- `SliceUriResult` is Slice service-local state for URI-backed execution. It
  stores `SliceUriRun`, URI series, and URI curves, and must not be committed
  through Session as a compatibility bridge.
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
- `TableSelection` is interaction state for the currently open table, not
  Session data. Its cells/ranges carry coordinates and optional `sheetId` only;
  they must not carry Explorer `fileId`, raw-table id, source key, or derived
  sheet key.
- `ExplorerState` owns layout, selected file id, expanded folders, folder order,
  source workflow status, error, and drag state.
- `ExplorerFileEntry` is derived view input for rendering; source/chart/template
  fields are display facts, not source preparation output. Semantic Explorer
  decoration comes from Review providers, not fields on `ExplorerFileEntry`.

## Do Not

- Do not expose private owner state as mutable public API.
- Do not put service/view state in `SessionModel`.
- Do not store raw rows in plot/template/search/export records when a source ref is enough.
- Do not add duplicate field catalogs to module instruction files; link here and add only module-specific invalidation notes.
- Do not create behavior methods on records/targets.
- Do not add generic `createdAt`, diagnostics, or cache-key fields unless a real caller needs them.
