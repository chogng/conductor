# Session Model Contract

This document defines the target session data model. The target model starts
from `SessionModel` and `FileRecord`, not from the current top-level state
collections. Those current collections are legacy storage compatibility only;
they are listed later so migration code can quarantine them at the session
service boundary.

The core rule is: one imported file becomes one `FileRecord`, and every later
stage writes into that record under a named responsibility. Do not spread one
file's source, cleaned series, curve metadata, calculated curves, metrics, and
view state across unrelated owners.

## Execution Standard

This document is an implementation standard, not background notes. When session
model code changes, the change must either follow this contract or update this
contract first with the new owner, lifecycle, and invalidation rule.

Use this standard in code reviews:

| Question | Required answer |
| --- | --- |
| Which object owns the field? | A field must belong to `SessionModel`, one `FileRecord`, or a named child object of that `FileRecord`. |
| Is this domain data or view state? | Domain data goes under the file model. UI-only state goes under `SessionViewState`. |
| Is this selection or preview? | Persist selection. Preview is a view reaction to selection. |
| What invalidates this value? | Every cleaned record, curve, metric, cache, and view model must have a clear upstream dependency. |
| Is this legacy compatibility? | Legacy storage collections are mapped at `SessionService`; new feature code must not use their names as domain vocabulary. |

## Model Graph

```ts
type SessionModel = {
  filesById: Record<string, FileRecord>;
  fileOrder: string[];
  selection: SessionSelection;
  viewState: SessionViewState;
};

type FileRecord = {
  id: string;
  source: SourceRecord;
  assessment: CurveAssessment;
  sheetsById: Record<string, SheetRecord>;
  template?: TemplateRunRecord;
  cleaned?: CleanedRecord;
  curves: CurveStore;
  metrics: MetricStore;
  analysisCache?: AnalysisCacheRecord;
};
```

`SessionModel` is the only durable object the workbench should treat as the
current data table. `FileRecord` is the unit of lineage. If code cannot answer
"which `FileRecord` owns this field?", the field is probably in the wrong
place.

## Core Objects

| Object | Responsibility | Core properties | Must not own |
| --- | --- | --- | --- |
| `SessionModel` | The current data workspace. | `filesById`, `fileOrder`, `selection`, `viewState`. | Raw `File` parsing details, curve points, metric algorithms. |
| `FileRecord` | One imported file across its full lifecycle. | `id`, `source`, `assessment`, `sheetsById`, `template`, `cleaned`, `curves`, `metrics`, `analysisCache`. | UI-only selection or scroll state. |
| `SourceRecord` | Raw import facts. | `fileId`, `file`, `fileName`, `size`, `lastModified`, `sourceKey`, `relativePath`, `sourcePath`, `normalizedCsvPath`. | Cleaned arrays, calculated curves, user-visible metric rows. |
| `SheetRecord` | A previewable table source inside a file. | `fileId`, `sheetId`, `sheetName`, `sourceKey`, `rowCount`, `columnCount`, `maxCellLengths`. | Row cache ownership or template result data. |
| `CurveAssessment` | Early curve classification before and after template cleanup. | `curveType`, `curveTypeConfidence`, `curveTypeNeedsTemplate`, `curveTypeReasons`, `xAxisRole`, `xAxisRoleSource`, `supportsSs`. | Numeric curve points or derived metrics. |
| `TemplateRunRecord` | The template choice and extraction run that produced `cleaned`. | `selection`, `configFingerprint`, `templateId`, `mode`, `appliedAt`, `warnings`, `errors`. | Cleaned series data or preview selection state. |
| `CleanedRecord` | Template-cleaned scientific source data. | `fileId`, `axis`, `domain`, `xGroups`, `seriesById`, `seriesOrder`, `sampledPoints`. | Raw browser `File`, chart color, hidden state. |
| `SeriesRecord` | One cleaned source series. | `id`, `name`, `legendValue`, `groupIndex`, `yCol`, `y`, `labelOverride`. | Derived gm/SS/Vth points or per-curve visual state. |
| `CurveStore` | Drawable source and derived curves for a file. | `byKey`, where key is `curveKind + seriesId`; each `CurveRecord` has `fileId`, `seriesId`, `curveKind`, `points`, `domain`, `signature`, `source`. | File-level axis meaning or user metric inputs. |
| `MetricStore` | Per-series calculation/inspector values. | `bySeriesId`; each `MetricRecord` may contain `ion`, `ioff`, `ionIoff`, `gmMaxAbs`, `vth`, `ss`, confidence, windows, and method metadata. | Raw points, template config, chart-only state. |
| `AnalysisCacheRecord` | Optional heavy cached computation output. | `fileId`, `touchedAt`, `estimatedBytes`, compatible per-series cache such as `baseCurrent`, `gm`, `ss`, `ssFitAuto`. | The canonical cleaned model; cache may be pruned at any time. |
| `SessionSelection` | Current user selection. | `fileId`, `sheetId`, `seriesId`, `curveKind`, `cell`, `range`. | The word `preview`. Selection may cause preview, but preview is a view behavior. |
| `SessionViewState` | Pure UI state. | Table row cache refs, expanded ids, hidden curves, colors, scroll/reveal state, loading status. | Scientific metadata, calculated values, or source file identity. |

## Object Fields

| Object | Field | Meaning |
| --- | --- | --- |
| `SourceRecord` | `fileId` | Stable id created when the file enters the session. All later stages link back to it. |
| `SourceRecord` | `sourceKey` | Stable source identity from name/size/mtime/path, used to detect external changes and cache preview work. |
| `SourceRecord` | `normalizedCsvPath` | Path to a converted CSV when the source was Excel or needed normalization. |
| `CurveAssessment` | `curveType` | Classification such as transfer, output, cv, cf, pv, unknown, or a future domain kind. |
| `CurveAssessment` | `xAxisRole` | Scientific x-axis role such as `vg` or `vd`; this should guide template, metrics, and labels. |
| `CleanedRecord` | `axis` | Cleaned axis labels, roles, units, and y scale. This replaces vague file-level `metadata`. |
| `CleanedRecord` | `xGroups` | Cleaned x arrays. A `SeriesRecord.groupIndex` selects the matching x group. |
| `SeriesRecord` | `id` | Stable source series id. Derived IV/gm/SS/Vth curves must preserve this lineage. |
| `SeriesRecord` | `legendValue` | Template-derived legend label, for example a bias value. |
| `CurveRecord` | `curveKind` | `iv`, `gm`, `ss`, `vth`, `secondDerivative`, or another explicit curve kind. |
| `CurveRecord` | `source` | The immediate input of the curve, for example cleaned source points or a first-pass gm curve. |
| `CurveRecord` | `signature` | Hash/version of the numeric points and semantic inputs. Downstream caches compare this. |
| `MetricRecord` | `current` | Ion/Ioff values, x positions, ratio, method, and candidate windows. |
| `MetricRecord` | `derivative` | gm or gds extrema and x positions. |
| `MetricRecord` | `threshold` | Vth values, branch labels, fit quality, and source curve signature. |
| `MetricRecord` | `subthreshold` | SS value, confidence, x range, fit metadata, and manual/auto method. |
| `SessionSelection` | `fileId` | Selected file. If the table displays it, that is table behavior, not a separate preview selection. |
| `SessionSelection` | `sheetId` | Selected sheet/source inside the file. |
| `SessionSelection` | `seriesId` | Selected cleaned source series, if any. |
| `SessionSelection` | `curveKind` | Selected curve kind for chart/inspector workflows. |

## Flow

| Step | Input | Writes | Invalidates |
| --- | --- | --- | --- |
| Import source | File picker, folder scan, workspace watcher. | `FileRecord.source`, initial `assessment`, optional `sheetsById`. | Nothing downstream exists yet. |
| Select file or sheet | User selection. | `SessionSelection.fileId`, `SessionSelection.sheetId`. | Table row requests and view caches only. |
| Classify or relabel series | Import assessment, floating label UI, user label edit. | `assessment`, `SeriesRecord.labelOverride`. | Template suggestion, chart legend text, metric row labels. |
| Apply template | `SourceRecord`, selected sheet rows, `TemplateRunRecord` config. | `template`, `cleaned`, `analysisCache` if produced. | `curves`, `metrics`, inspector views, exports derived from previous cleaned data. |
| First calculation | `CleanedRecord`. | `curves.byKey` for IV/gm/SS/Vth and signatures. | Metrics and second-pass curves that consumed older curve signatures. |
| Metric calculation | `CleanedRecord`, first-pass curves, manual metric inputs. | `metrics.bySeriesId`. | Parameter/inspector read models and exports. |
| Second calculation | A selected first-pass `CurveRecord`. | Another explicit `CurveRecord` with `curveKind: "secondDerivative"` or a feature-specific kind. | Only consumers of that second-pass curve. |
| Render table/chart/parameters | `SessionModel` snapshot. | `SessionViewState` only. | No domain data. |

## Legacy Quarantine

These names describe the current storage shape, not the model we want. Do not
introduce new code that treats them as conceptual owners. During migration they
may exist behind `SessionService`, but every read/write should be explained in
terms of the target owner.

| Legacy field | Target owner | Quarantine rule |
| --- | --- | --- |
| `sourceFiles[]` | `FileRecord.source` plus initial `assessment` | This is currently a mixed raw/import/assessment object. Treat it as import compatibility only. |
| `selectedPreviewFileId` | `SessionSelection.fileId` | Rename conceptually. Selection causes preview; preview should not be in the domain field name. |
| `selectedPreviewSheetId` | `SessionSelection.sheetId` | Same rule as file selection. |
| `previewFile` | `FileRecord.sheetsById[sheetId]` plus `SessionViewState.table` | Dimensions belong to sheet/table source; row caches and loading are view state. |
| `cleanedData[]` | `FileRecord.cleaned` | Should be normalized by `fileId`, not treated as an unrelated top-level array. |
| `metadata.filesById` | `CleanedRecord.axis` and file semantic fields | Split vague metadata into typed axis/template/source semantics. |
| `metadata.curvesByKey` | `FileRecord.curves.byKey` | Curves belong under the file whose source series they derive from. |
| `metadata.seriesLabelsByFileId` | `SeriesRecord.labelOverride` | Label override is source series state, not global metadata. |
| `metadata.curveViewStateByKey` | `SessionViewState.curves` | Color and hidden are visual state. |
| `calculatedDataByKey` | `FileRecord.curves` | It is a curve store/read model, not a separate top-level domain table. |
| `analysisResults` | `FileRecord.analysisCache` or `FileRecord.metrics` | The name is ambiguous. Cache and final metric records must be separated before new code consumes them. |
| `ionIoffManualTargetsByFileId` | Metric input state under `MetricStore` or a metric settings object | Manual inputs are not final metric values. |
| `ssManualRanges` | Metric input state under `MetricStore` or a metric settings object | Same rule as current targets. |

## Rules

| Rule | Required behavior |
| --- | --- |
| One object per imported file | A file's source, assessment, cleaned data, curves, metrics, and cache must be reachable from one `FileRecord`. |
| Selection is not preview | Use `selection.fileId` and `selection.sheetId`. Preview is the table's reaction to selection. |
| View state is not science | Colors, hidden flags, scroll, loading, row caches, and reveal targets stay in `SessionViewState`. |
| Curves preserve lineage | Every `CurveRecord` must carry `fileId`, `seriesId`, `curveKind`, `source`, and `signature`. |
| Metrics are records, not table cells | Ion/Ioff/gm/Vth/SS/inspector values belong to `MetricRecord`; UI tables are read models. |
| Cache is disposable | `analysisCache` can speed up recalculation, but correctness must not depend on its presence. |
| Invalidate by dependency | Template changes invalidate cleaned descendants; curve signature changes invalidate metrics and second-pass curves; view changes invalidate no domain data. |
| Avoid vague buckets | Do not add new top-level objects named `metadata`, `data`, `result`, `cache`, or `state` unless their owner and lifecycle are explicit. |
| Service boundary owns compatibility | While legacy fields exist, `SessionService` should be the only place that maps between them and the target model. |

## Acceptance Checklist

Before a session-model change is accepted:

| Check | Pass condition |
| --- | --- |
| Object boundary | New or moved fields are placed under the smallest owning object, usually `FileRecord` or one of its child records. |
| Naming | Field names describe domain ownership. They do not encode a view behavior such as preview unless the field is truly view state. |
| Lineage | Cleaned data, curves, metrics, and cache entries can trace back to `fileId` and, when applicable, `seriesId` and `curveKind`. |
| Invalidation | The patch states or implements what is cleared or recomputed when source, template, curve signature, metric input, or selection changes. |
| Compatibility | Existing legacy storage writes are either preserved behind `SessionService` or intentionally migrated to a target owner. Do not expose legacy bucket names in new feature APIs. |
| Views | Table/chart/parameter views consume model snapshots and write only `SessionViewState` or explicit user inputs. |
