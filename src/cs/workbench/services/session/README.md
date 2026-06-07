# Session Model Contract

This document is the implementation standard for the session data model. Future
session code should be shaped by this model first, then mapped to existing
compatibility fields only at the `SessionService` boundary.

One canonical `SessionModel` is enough for the whole session. That does not mean
one flat object with every field on it. It means one root aggregate where each
imported file has one `FileRecord`, and every stage writes to a named child
record of that file.

## Execution Standard

When session model code changes, the change must either follow this contract or
update this contract first with the new owner, fields, lifecycle, and
invalidation rule.

| Question | Required answer |
| --- | --- |
| Which object owns the field? | `SessionModel`, one `FileRecord`, or a named child record of that `FileRecord`. |
| Which stage produced the data? | Source, assessment, table source, template run, cleaned data, curve data, metric data, cache, selection, or view state. |
| Is this domain data or view state? | Domain data belongs under `FileRecord`; UI-only state belongs under `SessionViewState`. |
| Is this selection or preview? | Persist selection. Preview is a view reaction to selection. |
| What invalidates this value? | Every cleaned record, curve, metric, cache, and view model must have a clear upstream dependency. |

## Canonical Types

These names are the target vocabulary for code. Keep them stable unless the
model contract is updated first.

```ts
type FileId = string;
type SheetId = string;
type SeriesId = string;
type CurveKind = "iv" | "gm" | "ss" | "vth" | "secondDerivative" | string;
type CurveKey = `${CurveKind}:${SeriesId}`;

type SessionModel = {
  version: 1;
  filesById: Record<FileId, FileRecord>;
  fileOrder: FileId[];
  selection: SessionSelection;
  viewState: SessionViewState;
};

type FileRecord = {
  id: FileId;
  source: SourceRecord;
  assessment: CurveAssessment;
  tableSourcesById: Record<SheetId, TableSourceRecord>;
  template: TemplateState;
  cleaned: CleanedState;
  curves: CurveStore;
  metrics: MetricStore;
  analysisCache: AnalysisCacheState;
};

type SourceRecord = {
  fileId: FileId;
  fileName: string;
  file?: File | unknown;
  size?: number;
  lastModified?: number;
  sourceKey?: string;
  relativePath?: string | null;
  sourcePath?: string | null;
  normalizedCsvPath?: string | null;
};

type CurveAssessment = {
  curveType: string;
  curveTypeConfidence?: "high" | "medium" | "low";
  curveTypeNeedsTemplate?: boolean;
  curveTypeReasons?: string[];
  xAxisRole?: "vg" | "vd" | null;
  xAxisRoleSource?: "filename" | "title" | "label" | "metadata" | "shape" | null;
  supportsSs?: boolean;
};

type TableSourceRecord = {
  fileId: FileId;
  sheetId: SheetId;
  sheetName?: string | null;
  sourceKey: string;
  rowCount: number;
  columnCount: number;
  maxCellLengths: number[];
};

type TemplateState =
  | { status: "none" }
  | { status: "draft"; config: TemplateConfigRecord }
  | { status: "applied"; run: TemplateRunRecord };

type TemplateRunRecord = {
  selection: { kind: "auto" } | { kind: "template"; templateId: string };
  config: TemplateConfigRecord;
  configFingerprint: string;
  mode: "auto" | "manual" | "rule";
  appliedAt: number;
  warnings: string[];
  errors: string[];
};

type TemplateConfigRecord = {
  name?: string;
  xDataStart: string;
  xDataEnd: string;
  xSegmentationMode: "auto" | "points" | "segments";
  xSegmentCount: string;
  xPointsPerGroup: string;
  xUnit: string;
  yLegendStart: string;
  yLegendCount: string;
  yLegendStep: string;
  yLegendTarget: "auto" | "yColumn" | "group";
  yUnit: string;
  stopOnError: boolean;
  bottomTitle: string;
  leftTitle: string;
  legendPrefix: string;
  yColumns: number[];
};

type CleanedState =
  | { status: "empty" }
  | { status: "ready"; record: CleanedRecord }
  | { status: "stale"; record: CleanedRecord; reason: string };

type CleanedRecord = {
  fileId: FileId;
  axis: AxisRecord;
  domain?: { x?: [number, number]; y?: [number, number] };
  xGroups: number[][];
  sampledPoints?: number | null;
  seriesById: Record<SeriesId, SeriesRecord>;
  seriesOrder: SeriesId[];
};

type AxisRecord = {
  x: { label?: string; role?: string; unit?: string };
  y: { label?: string; role?: string; unit?: string; scale?: "linear" | "log" };
};

type SeriesRecord = {
  id: SeriesId;
  name?: string;
  legendValue?: string;
  groupIndex: number;
  yCol?: number;
  y: number[];
  labelOverride?: string;
};

type CurveStore = {
  byKey: Record<CurveKey, CurveRecord>;
};

type CurveRecord = {
  fileId: FileId;
  seriesId: SeriesId;
  curveKind: CurveKind;
  source: CurveSource;
  points: CurvePoint[];
  domain?: { x?: [number, number]; y?: [number, number] };
  signature: string;
};

type CurveSource =
  | { kind: "cleaned"; fileId: FileId; seriesId: SeriesId }
  | { kind: "curve"; fileId: FileId; seriesId: SeriesId; curveKind: CurveKind; signature: string };

type CurvePoint = {
  x: number;
  y: number;
  yPositive?: number | null;
  yAbsPositive?: number | null;
};

type MetricStore = {
  bySeriesId: Record<SeriesId, MetricRecord>;
  inputsBySeriesId: Record<SeriesId, MetricInputRecord>;
};

type MetricInputRecord = {
  ionX?: string;
  ioffX?: string;
  ssRange?: { x1: unknown; x2: unknown };
};

type MetricRecord = {
  seriesId: SeriesId;
  sourceSignatures: string[];
  current?: CurrentMetricRecord;
  derivative?: DerivativeMetricRecord;
  threshold?: ThresholdMetricRecord;
  subthreshold?: SubthresholdMetricRecord;
};

type CurrentMetricRecord = {
  method: "auto" | "manual" | "unavailable";
  ion: number | null;
  xAtIon: number | null;
  ioff: number | null;
  xAtIoff: number | null;
  ionIoff: number | null;
  candidateWindows: CurrentWindowRecord[];
  ionWindow?: CurrentWindowRecord | null;
  ioffWindow?: CurrentWindowRecord | null;
};

type CurrentWindowRecord = {
  key: "lowEnd" | "highEnd" | "maxCurrent" | "minCurrent" | "zeroBias" | "manualIon" | "manualIoff";
  label: string;
  current: number | null;
  x: number | null;
  x1: number | null;
  x2: number | null;
  targetX: number | null;
  pointCount: number;
};

type DerivativeMetricRecord = {
  kind: "gm" | "gds";
  maxAbs: number | null;
  xAtMaxAbs: number | null;
};

type ThresholdMetricRecord = {
  vth: number | null;
  electron?: number | null;
  hole?: number | null;
  fitQuality?: string;
};

type SubthresholdMetricRecord = {
  ss: number | null;
  confidence: "high" | "low" | "fail" | string;
  xAtSs: number | null;
  method: "auto" | "manual";
};

type AnalysisCacheState =
  | { status: "empty" }
  | { status: "ready"; record: AnalysisCacheRecord }
  | { status: "pruned"; record: Partial<AnalysisCacheRecord>; reason: string };

type AnalysisCacheRecord = {
  fileId: FileId;
  touchedAt?: number;
  estimatedBytes?: number;
  series?: Record<SeriesId, {
    baseCurrent?: unknown;
    gm?: unknown;
    ss?: unknown;
    ssFitAuto?: unknown;
  }>;
};

type SessionSelection = {
  fileId: FileId | null;
  sheetId: SheetId | null;
  seriesId?: SeriesId | null;
  curveKind?: CurveKind | null;
  cell?: { rowIndex: number; colIndex: number } | null;
  range?: { startRow: number; endRow: number; startCol: number; endCol: number } | null;
};

type SessionViewState = {
  table?: {
    loading?: boolean;
    sourceKey?: string | null;
    rowCacheVersion?: number;
  };
  curves?: Record<CurveKey, { color?: string; hidden?: boolean }>;
};
```

## Stage Names

| Stage | Data object | Required identity | What it means |
| --- | --- | --- | --- |
| Import source | `SourceRecord` | `fileId` | Raw file facts before any cleaning. |
| Assess curve | `CurveAssessment` | `fileId` | Early curve type and x-axis role classification. |
| Table source | `TableSourceRecord` | `fileId + sheetId` | A selectable raw table/sheet source. Selection may preview it. |
| Template run | `TemplateRunRecord` | `fileId + configFingerprint` | The template and extraction run that produced cleaned data. |
| Cleaned data | `CleanedRecord` | `fileId` | Scientific source data after template cleanup. |
| Series data | `SeriesRecord` | `fileId + seriesId` | One cleaned source series; derived curves and metrics preserve this id. |
| Curve data | `CurveRecord` | `fileId + seriesId + curveKind` | Drawable source or derived curve points such as IV/gm/SS/Vth. |
| Metric data | `MetricRecord` | `fileId + seriesId` | Inspector/parameter values derived from cleaned data and curves. |
| Analysis cache | `AnalysisCacheRecord` | `fileId` | Optional computation cache; never the source of truth. |
| Selection | `SessionSelection` | selected ids | Current user focus. It can drive preview but is not named preview. |
| View state | `SessionViewState` | view-local keys | UI-only caches, colors, hidden flags, loading, scroll, reveal. |

## Flow

| Step | Input | Writes | Invalidates |
| --- | --- | --- | --- |
| Import source | File picker, folder scan, workspace watcher. | `FileRecord.source`, initial `assessment`, optional `tableSourcesById`. | Nothing downstream exists yet. |
| Select file or sheet | User selection. | `SessionSelection.fileId`, `SessionSelection.sheetId`. | Table row requests and view caches only. |
| Classify or relabel series | Import assessment, floating label UI, user label edit. | `assessment`, `SeriesRecord.labelOverride`. | Template suggestion, chart legend text, metric row labels. |
| Apply template | `SourceRecord`, selected table source rows, template config. | `template`, `cleaned`, optional `analysisCache`. | Existing `curves`, `metrics`, inspector views, exports derived from older cleaned data. |
| First calculation | `CleanedRecord`. | `CurveRecord` entries for IV/gm/SS/Vth. | Metrics and second-pass curves that consumed older curve signatures. |
| Metric calculation | `CleanedRecord`, `CurveStore`, `MetricInputRecord`. | `metrics.bySeriesId`. | Parameter/inspector read models and exports. |
| Second calculation | A selected first-pass `CurveRecord`. | Another explicit `CurveRecord` with `curveKind: "secondDerivative"` or a feature-specific kind. | Only consumers of that second-pass curve. |
| Render table/chart/parameters | `SessionModel` snapshot. | `SessionViewState` only. | No domain data. |

## Legacy Mapping

The current code still has top-level compatibility fields. Do not use these
names as the model vocabulary for new code. Map them to the canonical objects at
the `SessionService` boundary.

| Current field | Canonical owner |
| --- | --- |
| `sourceFiles[]` | `FileRecord.source` and initial `FileRecord.assessment` |
| `selectedPreviewFileId` | `SessionSelection.fileId` |
| `selectedPreviewSheetId` | `SessionSelection.sheetId` |
| `previewFile` | `FileRecord.tableSourcesById[sheetId]` plus `SessionViewState.table` |
| `cleanedData[]` | `FileRecord.cleaned` |
| `metadata.filesById` | `CleanedRecord.axis` and file-level semantic fields |
| `metadata.curvesByKey` | `FileRecord.curves.byKey` |
| `metadata.seriesLabelsByFileId` | `SeriesRecord.labelOverride` |
| `metadata.curveViewStateByKey` | `SessionViewState.curves` |
| `calculatedDataByKey` | `FileRecord.curves` |
| `analysisResults` | `FileRecord.analysisCache` or `FileRecord.metrics`; cache and final metrics must be separated |
| `ionIoffManualTargetsByFileId` | `MetricStore.inputsBySeriesId` |
| `ssManualRanges` | `MetricStore.inputsBySeriesId` |

## Rules

| Rule | Required behavior |
| --- | --- |
| One root model | The workbench should be able to answer the session state from one `SessionModel`. |
| One record per imported file | A file's source, assessment, cleaned data, curves, metrics, and cache must be reachable from one `FileRecord`. |
| One id chain | Downstream data preserves `fileId`, and series/curve data preserves `seriesId` and `curveKind`. |
| Selection is not preview | Use `selection.fileId` and `selection.sheetId`. Preview is the table's reaction to selection. |
| View state is not science | Colors, hidden flags, scroll, loading, row caches, and reveal targets stay in `SessionViewState`. |
| Metrics are records, not table cells | Ion/Ioff/gm/Vth/SS/inspector values belong to `MetricRecord`; UI tables are read models. |
| Cache is disposable | `analysisCache` can speed up recalculation, but correctness must not depend on it. |
| Invalidate by dependency | Template changes invalidate cleaned descendants; curve signature changes invalidate metrics and second-pass curves; view changes invalidate no domain data. |

## Acceptance Checklist

| Check | Pass condition |
| --- | --- |
| Object boundary | New or moved fields are placed under the smallest owning object, usually `FileRecord` or one of its child records. |
| Naming | Field names describe domain ownership and production stage. They do not encode preview unless the field is truly view state. |
| Lineage | Cleaned data, curves, metrics, and cache entries trace back to `fileId`, and when applicable to `seriesId` and `curveKind`. |
| Invalidation | The patch states or implements what is cleared or recomputed when source, template, curve signature, metric input, or selection changes. |
| Compatibility | Existing compatibility writes are either preserved behind `SessionService` or migrated to a canonical owner. |
| Views | Table/chart/parameter views consume model snapshots and write only `SessionViewState` or explicit user inputs. |

