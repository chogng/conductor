# Session Model Contract

This document is the implementation contract for the session data model.
Future session code should be designed from this model first. Legacy input
formats must be translated at the boundary before entering `SessionSnapshot`.

One canonical `SessionModel` is enough for the whole session. It is not a flat
object. It is one root aggregate where each imported file owns its full
lifecycle through one `FileRecord`.

## Plan

| Step | Goal |
| --- | --- |
| 1 | Make `SessionModel` the single model for session domain state. |
| 2 | Make `FileRecord` the owner of one file's raw import payload, classification, template output, base series, base curves, derived curves, metrics, and cache. |
| 3 | Remove long-term model buckets named `metadata`, `cleanedData`, `analysisResults`, or `calculatedDataByKey`. Those names can exist only as migration adapters. |
| 4 | Store template-cleaned output as concrete fields: `axis`, `xGroups`, `seriesById`, `seriesOrder`, `domain`, and `templateRun`. |
| 5 | Store drawable curves by generation and family in `curvesByKey`: base families such as IV/CV/CF/PV/IT, derived families such as gm/SS/threshold fit/subthreshold fit, and second-derived families such as second derivative. Store scalar inspector/parameter output in `metricsByKey`; use `metricsBySeriesId` only as an index. |
| 6 | Store the session main work object in `activeTarget`. Store view-local selections, preview/loading/colors/hidden/cache UI state, template form drafts, and parameter-panel methods in `viewState`. |
| 7 | Do not keep legacy buckets in `SessionSnapshot`. Legacy names may appear only in external migration adapters or deprecated API parameters. |

## Canonical Model

```ts
type FileId = string;
type SheetId = string;
type SeriesId = string;
type CandidateId = string & { readonly __brand: "CandidateId" };
type CacheKey = string & { readonly __brand: "CacheKey" };

type CurveGeneration = "base" | "derived" | "secondDerived";
type BaseCurveFamily = "iv" | "cv" | "cf" | "pv" | "it";
type IvCurveMode = "transfer" | "output";
type ItCurveMode =
  | "stability"
  | "transient"
  | "retention"
  | "biasStress"
  | "photoResponse"
  | "generic";
type DerivedCurveFamily =
| "gm"
  | "localSs"
  | "thresholdFit"
  | "subthresholdFit";
type SecondDerivedCurveFamily = "secondDerivative";
type CurveFamily = BaseCurveFamily | DerivedCurveFamily | SecondDerivedCurveFamily;
type BaseCurveKey = `base:${BaseCurveFamily}:${IvCurveMode | ItCurveMode | "default"}:${SeriesId}`;
type DerivedCurveKey = `derived:${DerivedCurveFamily}:default:${SeriesId}`;
type SecondDerivedCurveKey = `secondDerived:${SecondDerivedCurveFamily}:default:${SeriesId}`;
type CurveKey =
  | BaseCurveKey
  | DerivedCurveKey
  | SecondDerivedCurveKey;
type MetricFamily =
  | "current"
  | "derivative"
  | "threshold"
  | "subthreshold";
type MetricKey = `${MetricFamily}:${SeriesId}:${string}`;

type SessionModel = {
  version: 1;
  filesById: Record<FileId, FileRecord>;
  fileOrder: FileId[];
  activeTarget: SessionTarget;
  viewState: SessionViewState;
};

type FileRecord = {
  id: FileId;

  raw: RawRecord;
  assessment: CurveAssessment;
  baseCandidatesById: Record<CandidateId, BaseCandidateRecord>;
  baseCandidateOrder: CandidateId[];

  templateRun?: TemplateRunRecord;

  axis?: AxisRecord;
  axisBySheetId?: Record<SheetId, AxisRecord>;
  axisBySeriesId?: Record<SeriesId, AxisRecord>;
  xGroups: number[][];
  seriesById: Record<SeriesId, SeriesRecord>;
  seriesOrder: SeriesId[];
  domain?: DomainRecord;

  curvesByKey: Record<CurveKey, CurveRecord>;
  metricsByKey: Record<MetricKey, MetricRecord>;
  metricsBySeriesId?: Record<SeriesId, MetricKey[]>;
  metricInputsByKey?: Record<MetricKey, MetricInputRecord>;

  calculationCache?: CalculationCacheRecord;
};
```

`FileRecord` is the long-term owner. A value produced from a file should be
reachable from that file's record unless it is pure UI state.

`CurveKey` is scoped by `FileRecord`. Its third segment is the mode key: IV base
curves use `transfer` or `output`; IT base curves use `ItCurveMode`; other base
curves, derived curves, and second-derived curves use `default`.

Base curve family meanings:

| Family | Meaning |
| --- | --- |
| `iv` | Current-voltage. |
| `cv` | Capacitance-voltage. |
| `cf` | Capacitance-frequency. |
| `pv` | Power-voltage or polarization-voltage, depending on the business workflow. |
| `it` | Current-time. |

## Record Fields

### Raw

```ts
type RawRecord = {
  fileId: FileId;
  fileName: string;
  file?: File | unknown;
  size?: number;
  lastModified?: number;
  rawKey?: string;
  relativePath?: string | null;
  filePath?: string | null;
  normalizedCsvPath?: string | null;
  tablesById: Record<SheetId, TableRecord>;
  tableOrder: SheetId[];
};
```

`RawRecord` owns the unprocessed import payload for one file: file facts plus
raw table or sheet content. It does not own axis labels, cleaned series, curves,
or metrics.

Once file bytes are parsed into a table or sheet, the unprocessed cell rows
belong to `raw.tablesById[sheetId].rowStore`. If rows stay outside memory,
`rowStore` stores the external locator instead of duplicating row arrays.

### Assessment

```ts
type CurveAssessment = {
  baseFamily: BaseCurveFamily | null;
  baseFamilyConfidence?: "high" | "medium" | "low";
  baseFamilyReasons?: string[];
};
```

`CurveAssessment` records only the current interpretation of the file or table's
base curve family. Import can seed it from filename, headers, or user tagging;
template processing may refine it. Base means the root curve in the derivation
tree, not raw input. For example, IV is the base family, while transfer and
output are IV modes stored on `BaseCandidateRecord`, `BaseCurveRecord`, and
base curve lineage. IT modes follow the same rule through `itMode`; they are not
stored in `CurveAssessment.baseFamily`.

### Table

```ts
type TableRecord = {
  fileId: FileId;
  sheetId: SheetId;
  sheetName?: string | null;
  tableKey: string;
  rowStore?: TableRowStoreRecord;
  rowCount: number;
  columnCount: number;
  maxCellLengths: number[];
};

type TableRowStoreRecord =
  | { kind: "memory"; rows: readonly TableRowRecord[] }
  | { kind: "external"; tableKey: string; normalizedCsvPath?: string | null };

type TableRowRecord = readonly unknown[];
```

`TableRecord` describes selectable raw tables or sheets. Row caches, loading
flags, and preview request ids are view state, not table data.

### Base Candidates

```ts
type BaseCandidateRecord = {
  candidateId: CandidateId;
  proposedSeriesId?: SeriesId;
  fileId: FileId;
  sheetId: SheetId;
  baseFamily: BaseCurveFamily | null;
  ivMode?: IvCurveMode | null;
  itMode?: ItCurveMode | null;
  xColumn?: number | null;
  yColumn?: number | null;
  groupIndex?: number | null;
  rawPoints?: readonly RawCurvePointRecord[];
  evidence?: string[];
};

type RawCurvePointRecord = {
  x: unknown;
  y: unknown;
  rowIndex?: number;
  columnIndex?: number;
};
```

`BaseCandidateRecord` stores pre-template base curve candidates. Before template
processing, stable `SeriesId` may not exist; the candidate identity is
`CandidateId`, usually derived from file/sheet/column/group evidence. If import
or floating label UI can propose the final series identity, store it in
`proposedSeriesId`. It is not the final cleaned fact record. Template processing
may reuse `proposedSeriesId`, but final numeric arrays still belong to
`seriesById`.

### Template Run

```ts
type TemplateRunRecord = {
  selection: { kind: "auto" } | { kind: "template"; templateId: string };
  config: TemplateConfigRecord;
  input?: TemplateInputRecord;
  configFingerprint: string;
  mode: "auto" | "manual" | "rule";
  appliedAt: number;
  warnings: string[];
  errors: string[];
};

type TemplateConfigRecord = {
  name?: string;
  xDataStart: number;
  xDataEnd: number;
  xSegmentationMode: "auto" | "points" | "segments";
  xSegmentCount?: number;
  xPointsPerGroup?: number;
  xUnit?: string;
  yLegendStart?: number;
  yLegendCount?: number;
  yLegendStep?: number;
  yLegendTarget: "auto" | "yColumn" | "group";
  yUnit?: string;
  stopOnError: boolean;
  bottomTitle?: string;
  leftTitle?: string;
  legendPrefix?: string;
  yColumns: number[];
};

type TemplateFormState = {
  name: string;
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

type TemplateSelectionRecord =
  | { kind: "auto" }
  | { kind: "template"; templateId: string };

type TemplateInputRecord = {
  xRange?: TableRangeRef;
  yRanges?: TableRangeRef[];
};

type TableRangeRef = {
  fileId: FileId;
  sheetId: SheetId;
  range: RangeRef;
};
```

`TemplateRunRecord` explains how the concrete fields below were produced. It
does not contain the produced series or curves. `TemplateConfigRecord` is a
canonical run config: numeric fields are parsed numbers, not raw UI input
strings. `TemplateFormState` may keep form strings while the user is editing,
but it belongs to view/form state and must be parsed before writing
`TemplateRunRecord.config`.

`TemplateInputRecord` captures explicit user inputs that became part of a
template run. A dragged table range does not enter the domain model while the
user is merely selecting cells. It becomes domain input only when the user
executes a command such as "use this range as x data", "use this range as y
data", or "apply template".

### Template Output Fields

Template processing writes directly to concrete file fields. Do not wrap these
fields in a vague long-term bucket.

```ts
type AxisRecord = {
  x: { label?: string; role?: string; unit?: string };
  y: { label?: string; role?: string; unit?: string; scale?: "linear" | "log" };
};

type DomainRecord = {
  x?: [number, number];
  y?: [number, number];
  yPositive?: [number, number];
  yAbsPositive?: [number, number];
  yLog10Abs?: [number, number];
};

type SeriesRecord = {
  fileId: FileId;
  sheetId?: SheetId;
  id: SeriesId;
  name?: string;
  legendValue?: string;
  groupIndex: number;
  yCol?: number;
  y: number[];
  labelOverride?: string;
};
```

`FileRecord.axis` is only the default axis for the current template output. If a
file contains multiple sheets, or one sheet mixes base curve families such as IV
and IT, use narrower axis overrides:

| Owner | Use |
| --- | --- |
| `axis` | Default axis for the current template output. |
| `axisBySheetId[sheetId]` | Sheet-level override when sheets in one file have different axis semantics. |
| `axisBySeriesId[seriesId]` | Series-level override when one sheet contains mixed curve families or modes. |

Axis resolution order is `axisBySeriesId[seriesId]`, then
`axisBySheetId[sheetId]`, then `axis`.

Template output fields:

| Field | Meaning |
| --- | --- |
| `axis` | Default scientific labels, units, roles, and y scale for the current template output. |
| `axisBySheetId` | Optional sheet-level axis overrides for multi-sheet files. |
| `axisBySeriesId` | Optional series-level axis overrides for mixed curve families inside one sheet. |
| `xGroups` | Cleaned x arrays. `SeriesRecord.groupIndex` selects the matching group. |
| `seriesById` | Cleaned base series keyed by stable `seriesId`; each series preserves `fileId` and optional `sheetId`. |
| `seriesOrder` | Display and processing order for series. |
| `domain` | Optional finite domains for raw x/y and any materialized y channels. |

### Curves

Curve names must preserve three different concepts:

| Concept | Field | Examples | Meaning |
| --- | --- | --- | --- |
| Generation | `curveGeneration` | `base`, `derived`, `secondDerived` | Whether the curve is the derivation root, a first calculation, or a second calculation. |
| Family | `curveFamily` | base: IV/CV/CF/PV/IT; derived: gm/local SS/threshold fit/subthreshold fit; second-derived: second derivative | The scientific curve family. |
| IV mode | `ivMode` | `transfer`, `output` | Only valid when `curveFamily` is `iv`. Transfer and output are IV modes, not curve families. |
| IT mode | `itMode` | `stability`, `transient`, `retention`, `biasStress`, `photoResponse`, `generic` | Only valid when `curveFamily` is `it`. |

```ts
type BaseCurveRecord = {
  fileId: FileId;
  seriesId: SeriesId;
  curveGeneration: "base";
  curveFamily: BaseCurveFamily;
  ivMode?: IvCurveMode | null;
  itMode?: ItCurveMode | null;
  lineage: Extract<CurveLineage, { curveGeneration: "base" }>;
  points: CurvePoint[];
  channels?: CurveChannelsRecord;
  domain?: DomainRecord;
  signature: string;
};

type DerivedCurveRecord = {
  fileId: FileId;
  seriesId: SeriesId;
  curveGeneration: "derived";
  curveFamily: DerivedCurveFamily;
  ivMode?: never;
  itMode?: never;
  lineage: Extract<CurveLineage, { curveGeneration: "derived" }>;
  points: CurvePoint[];
  channels?: CurveChannelsRecord;
  domain?: DomainRecord;
  signature: string;
};

type SecondDerivedCurveRecord = {
  fileId: FileId;
  seriesId: SeriesId;
  curveGeneration: "secondDerived";
  curveFamily: SecondDerivedCurveFamily;
  ivMode?: never;
  itMode?: never;
  lineage: Extract<CurveLineage, { curveGeneration: "secondDerived" }>;
  points: CurvePoint[];
  channels?: CurveChannelsRecord;
  domain?: DomainRecord;
  signature: string;
};

type CurveRecord =
  | BaseCurveRecord
  | DerivedCurveRecord
  | SecondDerivedCurveRecord;

type CurveLineage =
  | {
      curveGeneration: "base";
      baseFamily: BaseCurveFamily;
      ivMode?: IvCurveMode | null;
      itMode?: ItCurveMode | null;
      baseSeries: { fileId: FileId; seriesId: SeriesId };
    }
  | {
      curveGeneration: "derived";
      derivedFamily: DerivedCurveFamily;
      inputCurve: CurveRef;
    }
  | {
      curveGeneration: "secondDerived";
      secondDerivedFamily: SecondDerivedCurveFamily;
      inputCurve: CurveRef;
    };

type CurveRef = {
  fileId: FileId;
  seriesId: SeriesId;
  curveKey: CurveKey;
  signature: string;
};

type CurvePoint = {
  x: number;
  y: number;
};

type CurveChannelsRecord = {
  yPositive?: number[];
  yAbsPositive?: number[];
  yLog10Abs?: number[];
};
```

`curvesByKey` stores every drawable curve. A curve always preserves `fileId`,
`seriesId`, `curveGeneration`, `curveFamily`, optional `ivMode`/`itMode`,
lineage, `points`, optional `channels`, and `signature`.

`CurvePoint` stays minimal: one x/y sample. Derived display or analysis channels
such as positive current, absolute current, or log10 absolute current belong to
`CurveRecord.channels`. Channel arrays must align by index with `points` and
are only present when the curve needs that representation. Do not add IV-specific
fields such as `yAbsPositive` to every `CurvePoint`, because CV/CF/PV/IT and fit
curves do not all share that semantic.

`DomainRecord` follows the same rule. `domain.y` is the raw y range. Log-scale
or absolute-current displays should use `domain.yPositive`,
`domain.yAbsPositive`, or `domain.yLog10Abs` when the matching channel exists,
instead of rescanning points or reusing a y range that may contain zero or
negative values.

Base curves are materialized from `SeriesRecord` and use base families such as
IV/CV/CF/PV/IT. IV transfer/output is represented as `curveFamily: "iv"` plus
`ivMode: "transfer"` or `"output"`. IT mode is represented as
`curveFamily: "it"` plus `itMode`. gm, local SS curves, threshold fit lines,
and subthreshold fit lines are derived curve families with an `inputCurve` that
points back to their input curve. Subthreshold swing itself is a scalar metric,
usually in mV/dec. Vth and SS scalar values are not curve families: Vth belongs
to `ThresholdMetricValueRecord.vth`, and SS belongs to
`SubthresholdMetricValueRecord.ss`. Second derivative is a
second-derived curve family with an `inputCurve` that points back to the derived
curve it consumed. `DerivedCurveRecord` and `SecondDerivedCurveRecord` use
`ivMode?: never` and `itMode?: never` so base-family modes cannot leak into
derived generations.

### Metrics

```ts
type MetricInputRecord = {
  metricKey: MetricKey;
  fileId: FileId;
  seriesId: SeriesId;
  source: "auto" | "manual";
  range?: {
    x1?: number | null;
    x2?: number | null;
  };
  targets?: Record<string, number | null>;
  configSignature?: string;
};

type BaseMetricRecord = {
  key: MetricKey;
  fileId: FileId;
  seriesId: SeriesId;
  metricFamily: MetricFamily;
  contextKey: string;
  inputCurves: CurveRef[];
  inputSignatures: string[];
  algorithm?: { id: string; version?: string };
};

type CurrentMetricRecord = BaseMetricRecord & {
  metricFamily: "current";
  value: CurrentMetricValueRecord;
};

type DerivativeMetricRecord = BaseMetricRecord & {
  metricFamily: "derivative";
  value: DerivativeMetricValueRecord;
};

type ThresholdMetricRecord = BaseMetricRecord & {
  metricFamily: "threshold";
  value: ThresholdMetricValueRecord;
};

type SubthresholdMetricRecord = BaseMetricRecord & {
  metricFamily: "subthreshold";
  value: SubthresholdMetricValueRecord;
};

type MetricRecord =
  | CurrentMetricRecord
  | DerivativeMetricRecord
  | ThresholdMetricRecord
  | SubthresholdMetricRecord;

type CurrentMetricValueRecord = {
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

type DerivativeMetricValueRecord = {
  kind: "gm" | "gds";
  maxAbs: number | null;
  xAtMaxAbs: number | null;
};

type ThresholdMetricValueRecord = {
  vth: number | null;
  electron?: number | null;
  hole?: number | null;
  fitQuality?: "good" | "weak" | "failed" | "unavailable";
};

type SubthresholdMetricValueRecord = {
  ss: number | null;
  confidence: "high" | "low" | "fail";
  xAtSs: number | null;
  method: "auto" | "manual";
};
```

`metricsByKey` stores inspector/parameter values by metric context. A single
`seriesId` may have several metric records: current metrics from a base IV
transfer curve, derivative metrics from a gm curve, subthreshold metrics from a
manual range, and threshold metrics from different algorithm versions.

`metricsBySeriesId` is only an optional index from a series to its metric keys.
It must not own metric values. UI parameter tables are read models built from
`metricsByKey`, not durable state.

`MetricKey` is scoped by `FileRecord`. Its first segment is the closed
`MetricFamily`; its last segment is a deterministic context key such as an input
curve key, manual range id, or algorithm-version key.

### Calculation Cache

```ts
type CalculationCacheRecord = {
  fileId: FileId;
  touchedAt?: number;
  estimatedBytes?: number;
  entriesByKey: Record<CacheKey, CalculationCacheEntry>;
};

type CalculationCacheEntry = {
  inputSignatures: string[];
  kind: "baseCurrent" | "gm" | "localSs" | "ssFitAuto";
  value: unknown;
};
```

`calculationCache` stores reusable calculation internals only. It is optional
and disposable. Correctness must not depend on it. Cache values may be `unknown`,
but each entry still needs a stable `CacheKey`, a closed `kind`, and
`inputSignatures` so stale entries can be invalidated and the cache does not
become another `analysisResults` bucket.

Current session cache keys are scoped by calculation kind and series:
`baseCurrent:${seriesId}`, `gm:${seriesId}`, `localSs:${seriesId}`, and
`ssFitAuto:${seriesId}`. Do not store a whole file-level calculation payload in
a single entry. If an external processor returns an older packed payload, the
session adapter may read it as migration input, but the canonical model must
write it as keyed calculation entries.

### Targets And View State

```ts
type SessionTarget =
  | { kind: "none" }
  | { kind: "file"; fileId: FileId }
  | { kind: "sheet"; fileId: FileId; sheetId: SheetId }
  | { kind: "series"; fileId: FileId; seriesId: SeriesId }
  | { kind: "curve"; fileId: FileId; curveKey: CurveKey };

type TableSelection =
  | { kind: "cell"; fileId: FileId; sheetId: SheetId; cell: CellRef }
  | { kind: "range"; fileId: FileId; sheetId: SheetId; range: RangeRef };

type CommandTarget =
  | { kind: "file"; fileId: FileId }
  | { kind: "sheet"; fileId: FileId; sheetId: SheetId }
  | { kind: "series"; fileId: FileId; seriesId: SeriesId }
  | { kind: "curve"; fileId: FileId; curveKey: CurveKey }
  | { kind: "tableRange"; fileId: FileId; sheetId: SheetId; range: RangeRef };

type CellRef = {
  rowIndex: number;
  colIndex: number;
};

type RangeRef = {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
};

type SessionViewState = {
  table?: {
    loading?: boolean;
    tableKey?: string | null;
    rowCacheVersion?: number;
    previewFile?: PreviewFile | null;
    previewStatus?: TablePreviewStatusRecord;
    selection?: TableSelection;
  };
  chart?: {
    activeCurveKey?: CurveKey | null;
    selectedCurveKeys?: CurveKey[];
    hoveredCurveKey?: CurveKey | null;
  };
  template?: {
    mode?: TemplateMode;
    selectedTemplateId?: string | null;
    selectionsByFileId?: Record<FileId, TemplateSelectionRecord>;
    formState?: TemplateFormState;
  };
  parameters?: {
    ionIoffMethod?: IonIoffMethod;
    ssMethod?: SsMethod;
    ssShowFitLine?: boolean;
  };
  curves?: Record<CurveKey, { color?: string; hidden?: boolean }>;
};

type TablePreviewStatusRecord = {
  state: "idle" | "loading" | "ready";
  message: string;
};
```

`activeTarget` is the session main work object. It stores only file, sheet,
series, or curve focus. `selection` means a view-local selection, such as
`viewState.table.selection`; it is not the session work object. Preview is a view
behavior caused by the active target or local view state and must not be encoded
into field names.

`SessionContextValue` must not flatten `viewState.template` or
`viewState.parameters` back into top-level read fields. Consumers read these
with small helpers such as `getTemplateFormStateFromViewState(...)` and write
through the session service setters.

Command execution should resolve a `CommandTarget` or context target instead of
reading several state buckets directly:

1. Use explicit command, context menu, or right-click arguments first.
2. Fall back to `activeTarget`.
3. Fall back to local UI state such as `viewState.table.selection` or
   `viewState.chart.activeCurveKey`.
4. Return `null` when no stable target can be resolved.

```ts
function resolveCommandTarget(
  session: SessionModel,
  explicit?: Partial<CommandTarget>
): CommandTarget | null;
```

## Data Placement

When code receives data, place it by owner and scientific meaning, not by the
stage that produced it.

| Data received | Write to | Notes |
| --- | --- | --- |
| Imported file identity, name, size, path, normalized CSV path | `filesById[fileId].raw` | Raw import owner. No axis, cleaned series, curves, metrics, or UI state. |
| Raw table/sheet identity and dimensions | `filesById[fileId].raw.tablesById[sheetId]` | `TableRecord` owns sheet/table facts such as `rowCount`, `columnCount`, and `maxCellLengths`. |
| Raw table rows or row locator | `filesById[fileId].raw.tablesById[sheetId].rowStore` | Use `kind: "memory"` for in-memory rows and `kind: "external"` for converted CSV or streamed storage. Preview row caches still belong to `viewState`. |
| Import or floating-label curve classification | `filesById[fileId].assessment` and `baseCandidatesById[candidateId]` | File/table-level base family belongs to `assessment`; per-candidate IV/IT mode belongs to `BaseCandidateRecord`. |
| Pre-template curve candidate | `filesById[fileId].baseCandidatesById[candidateId]` and `baseCandidateOrder` | Holds raw, uncleaned candidate points and column/group evidence. It may have `proposedSeriesId`, but it is not final cleaned series data. |
| Template form draft input | `viewState.template.formState` or local form state | Keeps raw UI strings while editing. It is not canonical template config. |
| Current template mode, selected template id, and pre-apply per-file template overrides | `viewState.template` | These are UI/command inputs until apply writes `FileRecord.templateRun`. |
| Template range input accepted by a command | `filesById[fileId].templateRun.input` | A table range enters domain only after a command such as "use this range as x data" or "apply template". |
| Template selection/config/run result | `filesById[fileId].templateRun` | Explains how template output was produced. `TemplateConfigRecord` stores parsed numbers and optional units; `TemplateInputRecord` stores explicit table range inputs; it does not store output arrays. |
| Template axis labels, units, roles, scale | `filesById[fileId].axis`, `axisBySheetId[sheetId]`, or `axisBySeriesId[seriesId]` | `axis` is only the default for the current template output. Use sheet-level or series-level overrides when one file contains multiple sheets or mixed curve families. |
| Template-cleaned x arrays | `filesById[fileId].xGroups` | `SeriesRecord.groupIndex` selects the x group. |
| Template-cleaned base y arrays and legends | `filesById[fileId].seriesById[seriesId]` and `seriesOrder` | Reuse `BaseCandidateRecord.proposedSeriesId` when present and valid; otherwise create a stable `seriesId`. Each `SeriesRecord` writes `fileId` and selected `sheetId` when known. |
| Finite data domain | `filesById[fileId].domain` or `CurveRecord.domain` | File domain belongs to cleaned base data; curve domain belongs to a specific drawable curve. Channel domains such as `yLog10Abs` support log/absolute displays without rescanning points. |
| User-edited series label | `filesById[fileId].seriesById[seriesId].labelOverride` | Label overrides are domain data because export/chart/parameters reuse them. |
| Drawable base curve points, e.g. IV/CV/CF/PV/IT transfer/output | `filesById[fileId].curvesByKey[curveKey]` with `curveGeneration: "base"` | These are materialized from `seriesById` and keep base family plus optional IV/IT mode lineage. |
| Drawable derived curve points, e.g. gm, local SS curve, threshold fit line, subthreshold fit line | `filesById[fileId].curvesByKey[curveKey]` with `curveGeneration: "derived"` | Keep `inputCurve` with signature pointing back to the curve consumed. Vth and SS scalar values are metrics, not curves. |
| Drawable second-derived curve points, e.g. second derivative | `filesById[fileId].curvesByKey[curveKey]` with `curveGeneration: "secondDerived"` | Keep `inputCurve` with signature pointing back to the derived curve consumed. |
| Inspector/parameter scalar values, e.g. Ion/Ioff, gm max, `threshold.vth`, `subthreshold.ss`, fit quality | `filesById[fileId].metricsByKey[metricKey]` plus optional `metricsBySeriesId[seriesId]` index | Scalar results are metrics, not curves. One series may have multiple metric contexts. |
| Manual metric inputs, e.g. Ion/Ioff targets or SS range | `filesById[fileId].metricInputsByKey[metricKey]` | Inputs are kept separate from computed metric values and scoped to the same metric context. |
| Parameter panel method toggles, e.g. current auto/manual mode, SS auto/manual mode, and fit-line visibility | `viewState.parameters` | UI state and defaults for commands. Manual numeric ranges or targets still belong to `metricInputsByKey`. |
| Reusable but disposable computation internals | `filesById[fileId].calculationCache.entriesByKey[cacheKey]` | Cache may be pruned without changing scientific correctness, but each entry still has `kind` and `inputSignatures`. |
| Session main work object, e.g. file, sheet, series, or curve | `activeTarget` | Domain-level active target. It is not named preview or selection. |
| Local table cell or range selection | `viewState.table.selection` | Table UI state. Commands may use it through `CommandTarget` resolution. |
| Loading state, preview row cache versions, chart active/selected/hovered curves, chart colors, hidden flags, template drafts, and parameter-panel toggles | `viewState` | UI-only state. It must not affect scientific results until a command writes explicit domain data. |

## Lifecycle Writes

There are no stage-named data objects. A stage is only a lifecycle operation
that writes, overwrites, invalidates, or discards named fields on the canonical
model.

| Trigger | Writes or overwrites | Invalidates or discards | Preserves |
| --- | --- | --- | --- |
| Import file | Creates or replaces `FileRecord.raw`; seeds `assessment`. | Discards any previous `FileRecord` with the same `fileId`. | `fileId` as the file owner identity. |
| Assess base curve | Updates `assessment.baseFamily`, `baseFamilyConfidence`, and `baseFamilyReasons`. | Invalidates template suggestions and any base curves whose family no longer matches. | Raw file facts and tables. |
| Select table | Sets `activeTarget` to `{ kind: "sheet", fileId, sheetId }`. | Discards table row request cache and loading state in `viewState.table`. | File data, series, curves, metrics. |
| Apply template | Overwrites `templateRun`, `axis`, `axisBySheetId`, `axisBySeriesId`, `xGroups`, `seriesById`, `seriesOrder`, and `domain`. | Discards base curves, derived curves, second-derived curves, metrics, and calculation cache produced from the old template output. | `raw`, `assessment`, and stable `fileId`. |
| Materialize base curves | Creates or overwrites `curvesByKey` entries with `curveGeneration: "base"`. | Discards derived curves, second-derived curves, and metrics that consumed older base curve signatures. | `seriesId`, base family, optional IV/IT mode, and base curve lineage. |
| Calculate derived curves | Creates or overwrites `curvesByKey` entries with `curveGeneration: "derived"` for gm, local SS curves, threshold fit lines, or subthreshold fit lines. | Discards second-derived curves and metrics that consumed older derived curve signatures. | Input curve reference and signature. |
| Calculate metrics | Creates or overwrites scalar inspector/parameter records in `metricsByKey` and updates the optional `metricsBySeriesId` index. | Discards stale inspector read models and exports derived from older metric values. | Base and derived curve records plus metric input records for the same `metricKey`. |
| Calculate second-derived curves | Creates or overwrites `curvesByKey` entries with `curveGeneration: "secondDerived"`. | Discards only consumers of that second-derived curve. | Input derived curve reference and signature. |
| Render UI | Updates `viewState` only. | Discards no domain data. | Full `SessionModel` domain state. |

## Legacy Migration Map

Legacy field names are not part of `SessionSnapshot`. If an old persisted
format or deprecated API must be accepted, translate it at the boundary and
write the canonical owners below immediately.

| Former or deprecated field | Canonical owner |
| --- | --- |
| `sourceFiles[]` | `FileRecord.raw` and initial `FileRecord.assessment` |
| current curve type strings such as `iv`, `transfer`, `output`, `it`, `stability`, `gm`, `vth`, `ss` | `CurveAssessment.baseFamily` for file/table base-family classification; `BaseCandidateRecord.ivMode/itMode` for pre-template candidate modes; drawable curve strings map to `CurveRecord.curveGeneration/curveFamily/ivMode/itMode`; Vth/SS scalar strings map to `metricsByKey` |
| `selectedPreviewFileId` | `activeTarget.fileId` on the active `SessionTarget` variant |
| `selectedPreviewSheetId` | `activeTarget.sheetId` on the `sheet` target variant or `viewState.table.selection.sheetId` |
| `previewFile` | `FileRecord.raw.tablesById[sheetId]` plus `SessionViewState.table` |
| `cleanedData[]` | `axis`, `axisBySheetId`, `axisBySeriesId`, `xGroups`, `seriesById`, `seriesOrder`, `domain`, `templateRun` under `FileRecord` |
| `metadata.filesById` | `FileRecord.axis`, `axisBySheetId`, `axisBySeriesId`, and file semantic fields |
| `metadata.curvesByKey` | `FileRecord.curvesByKey` |
| `metadata.seriesLabelsByFileId` | `SeriesRecord.labelOverride` |
| `metadata.curveViewStateByKey` | `SessionViewState.curves` |
| `calculatedDataByKey` | `FileRecord.curvesByKey`, with base/derived/second-derived generation made explicit |
| `analysisResults` | `FileRecord.calculationCache` or `FileRecord.metricsByKey`; cache and final metrics must be separated |
| `ionIoffManualTargetsByFileId` | `FileRecord.metricInputsByKey` keyed by current metric context |
| `ssManualRanges` | `FileRecord.metricInputsByKey` keyed by subthreshold metric context |

## Rules

| Rule | Required behavior |
| --- | --- |
| One root model | The whole session is represented by one `SessionModel`. |
| One file owner | One imported file maps to one `FileRecord`. |
| Raw owns initial input | The first unprocessed file facts and cell rows belong to `FileRecord.raw`; do not add a canonical field named `origin`. |
| No vague buckets | Do not introduce long-term owners named `metadata`, `cleanedData`, `result`, or `data`. |
| Closed unions | Canonical taxonomy unions must not end with `string`; adding a family, mode, generation, confidence, or cache state requires updating this contract. |
| Stable identity | Downstream records preserve `fileId`; series records preserve `seriesId`; curve records preserve `seriesId`, `curveGeneration`, `curveFamily`, optional `ivMode`/`itMode`, and input lineage. |
| Family is not mode | IV/CV/CF/PV/IT are base families. Transfer/output are IV modes. gm, local SS, threshold fit, and subthreshold fit are derived families. Second derivative is second-derived. |
| Target is not preview | Use `activeTarget` for the session main work object; preview is view behavior. Do not encode preview into target field names. |
| Selection is view-local | `selection` names belong to view-local state such as `viewState.table.selection`. `activeTarget` is the session-level domain focus. |
| Commands resolve targets | Commands operate on a resolved `CommandTarget` or context target, not directly on every view-state bucket. |
| Range becomes domain by command | A dragged cell/range remains `viewState.table.selection`. It becomes domain data only when a command writes it to `TemplateInputRecord` or another explicit user-input record. |
| View state is not science | Colors, hidden flags, loading, row caches, scroll, reveal state, and raw template form strings stay in `viewState` or local form state. |
| Canonical config is parsed | `TemplateRunRecord.config` stores parsed numeric values and optional units. UI strings belong to `TemplateFormState`, not the long-term config. |
| Curves are not scalar metrics | gm curve points, local SS curve points, Vth fit lines, SS fit lines, and log(Id)-Vg curves belong to `CurveRecord`; scalar inspector values such as Ion/Ioff, gm max, `threshold.vth`, `subthreshold.ss`, fit summaries, and selected parameter values belong to `metricsByKey[metricKey]`. |
| Cache is disposable | `calculationCache` may be pruned without changing scientific correctness, but it still uses keyed entries with `kind` and `inputSignatures`; it is not a miscellaneous analysis bucket. |
| Invalidate by dependency | Template changes invalidate axis/series/base curves/derived curves/metrics; base curve signature changes invalidate derived curves and metrics; derived curve signature changes invalidate second-derived curves and metrics; view changes invalidate no domain data. |

## Acceptance Checklist

| Check | Pass condition |
| --- | --- |
| Owner | Every new field belongs to `SessionModel`, `FileRecord`, or a named child record. |
| Name | The name describes the data's domain role, not an implementation bucket. |
| Identity | File data has `fileId`; series data has `seriesId`; curve data has `curveGeneration`, `curveFamily`, optional `ivMode`/`itMode`, and lineage. |
| Taxonomy | Base family, IV mode, IT mode, derived family, and second-derived family are not stored in the same unqualified field. |
| Closed union | New canonical union values are explicitly listed; patches do not add `| string` fallbacks. |
| Lifecycle | The patch states when fields are written, overwritten, invalidated, or discarded. |
| Invalidation | The patch states what is cleared or recomputed when raw input, template output, curve signature, metric input, active target, or view-local selection changes. |
| Compatibility | Legacy fields are only adapted at `SessionService` or intentionally migrated. |
| Views | Views consume snapshots and write only `viewState` or explicit user inputs. |
