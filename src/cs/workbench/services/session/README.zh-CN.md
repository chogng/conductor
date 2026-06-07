# Session 模型契约

这份文档是 session 数据模型的实现标准。后续 session 代码应先按这个模型设计，再只在 `SessionService` 边界映射到现有兼容字段。

一个 canonical `SessionModel` 足够支撑整个 session。这里不是说把所有字段拍平成一个大对象，而是说只有一个根聚合：每个导入文件有一个 `FileRecord`，后续每个阶段都写入这个文件下职责明确的子 record。

## 执行标准

修改 session model 代码时，要么遵守这份契约，要么先更新这份契约，把新的 owner、字段、生命周期和失效规则写清楚。

| 问题 | 必须回答 |
| --- | --- |
| 字段由哪个对象拥有？ | `SessionModel`、某个 `FileRecord`，或这个 `FileRecord` 下具名的子 record。 |
| 数据由哪个阶段产生？ | Source、assessment、table source、template run、cleaned data、curve data、metric data、cache、selection 或 view state。 |
| 这是领域数据还是 view state？ | 领域数据放在 `FileRecord` 下；纯 UI 状态放在 `SessionViewState`。 |
| 这是 selection 还是 preview？ | 持久化 selection。Preview 是 view 对 selection 的反应。 |
| 什么会让这个值失效？ | 每个 cleaned record、curve、metric、cache 和 view model 都必须有明确上游依赖。 |

## Canonical Types

这些名字是目标代码词汇。除非先更新模型契约，否则不要随意改名。

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

## 阶段命名

| 阶段 | 数据对象 | 必要身份 | 含义 |
| --- | --- | --- | --- |
| Import source | `SourceRecord` | `fileId` | 清洗前的原始文件事实。 |
| Assess curve | `CurveAssessment` | `fileId` | 早期曲线类型和 x-axis role 分类。 |
| Table source | `TableSourceRecord` | `fileId + sheetId` | 可选择的原始表格/sheet 源。选中它可以触发预览。 |
| Template run | `TemplateRunRecord` | `fileId + configFingerprint` | 产出 cleaned data 的模板和 extraction run。 |
| Cleaned data | `CleanedRecord` | `fileId` | 模板清洗后的科学源数据。 |
| Series data | `SeriesRecord` | `fileId + seriesId` | 一条 cleaned source series；派生曲线和 metrics 保留这个 id。 |
| Curve data | `CurveRecord` | `fileId + seriesId + curveKind` | IV/gm/SS/Vth 等可绘制 source 或 derived curve points。 |
| Metric data | `MetricRecord` | `fileId + seriesId` | 从 cleaned data 和 curves 派生的 inspector/parameter values。 |
| Analysis cache | `AnalysisCacheRecord` | `fileId` | 可选计算缓存；永远不是 source of truth。 |
| Selection | `SessionSelection` | selected ids | 当前用户焦点。它可以驱动 preview，但不命名为 preview。 |
| View state | `SessionViewState` | view-local keys | UI-only caches、colors、hidden flags、loading、scroll、reveal。 |

## 流程

| 步骤 | 输入 | 写入 | 失效 |
| --- | --- | --- | --- |
| 导入 source | File picker、folder scan、workspace watcher。 | `FileRecord.source`、初始 `assessment`、可选 `tableSourcesById`。 | 此时没有下游。 |
| 选择 file 或 sheet | 用户选择。 | `SessionSelection.fileId`、`SessionSelection.sheetId`。 | 只让 table row requests 和 view caches 失效。 |
| 分类或重命名 series | Import assessment、浮层标签 UI、用户 label edit。 | `assessment`、`SeriesRecord.labelOverride`。 | Template suggestion、chart legend text、metric row labels。 |
| 应用模板 | `SourceRecord`、selected table source rows、template config。 | `template`、`cleaned`、可选 `analysisCache`。 | 旧 cleaned data 派生出的 `curves`、`metrics`、inspector views、exports。 |
| 一次计算 | `CleanedRecord`。 | IV/gm/SS/Vth 对应的 `CurveRecord`。 | 消费旧 curve signatures 的 metrics 和 second-pass curves。 |
| Metric 计算 | `CleanedRecord`、`CurveStore`、`MetricInputRecord`。 | `metrics.bySeriesId`。 | Parameter / inspector read models 和 exports。 |
| 二次计算 | 被选中的 first-pass `CurveRecord`。 | 另一条明确的 `CurveRecord`，`curveKind: "secondDerivative"` 或 feature-specific kind。 | 只让这条二次曲线的 consumers 失效。 |
| 渲染 table/chart/parameters | `SessionModel` snapshot。 | 只写 `SessionViewState`。 | 不影响 domain data。 |

## 现有字段映射

当前代码仍然有顶层兼容字段。不要把这些名字作为新代码的模型词汇。它们只在 `SessionService` 边界映射到 canonical objects。

| 当前字段 | Canonical owner |
| --- | --- |
| `sourceFiles[]` | `FileRecord.source` 和初始 `FileRecord.assessment` |
| `selectedPreviewFileId` | `SessionSelection.fileId` |
| `selectedPreviewSheetId` | `SessionSelection.sheetId` |
| `previewFile` | `FileRecord.tableSourcesById[sheetId]` 加 `SessionViewState.table` |
| `cleanedData[]` | `FileRecord.cleaned` |
| `metadata.filesById` | `CleanedRecord.axis` 和 file-level semantic fields |
| `metadata.curvesByKey` | `FileRecord.curves.byKey` |
| `metadata.seriesLabelsByFileId` | `SeriesRecord.labelOverride` |
| `metadata.curveViewStateByKey` | `SessionViewState.curves` |
| `calculatedDataByKey` | `FileRecord.curves` |
| `analysisResults` | `FileRecord.analysisCache` 或 `FileRecord.metrics`；cache 和最终 metrics 必须分开 |
| `ionIoffManualTargetsByFileId` | `MetricStore.inputsBySeriesId` |
| `ssManualRanges` | `MetricStore.inputsBySeriesId` |

## 规则

| 规则 | 必须遵守的行为 |
| --- | --- |
| 一个根模型 | Workbench 应该能从一个 `SessionModel` 回答当前 session state。 |
| 一个导入文件一个对象 | 一个文件的 source、assessment、cleaned data、curves、metrics 和 cache 必须能从同一个 `FileRecord` 到达。 |
| 一条 id 链 | 下游数据保留 `fileId`，series/curve 数据继续保留 `seriesId` 和 `curveKind`。 |
| Selection 不是 preview | 使用 `selection.fileId` 和 `selection.sheetId`。Preview 是 table 对 selection 的反应。 |
| View state 不是科学数据 | Colors、hidden flags、scroll、loading、row caches、reveal targets 都留在 `SessionViewState`。 |
| Metrics 是 records，不是 table cells | Ion/Ioff/gm/Vth/SS/inspector values 属于 `MetricRecord`；UI tables 只是 read models。 |
| Cache 可丢弃 | `analysisCache` 可以加速重算，但正确性不能依赖它存在。 |
| 按依赖失效 | Template changes 让 cleaned descendants 失效；curve signature changes 让 metrics 和 second-pass curves 失效；view changes 不让 domain data 失效。 |

## 验收清单

| 检查项 | 通过条件 |
| --- | --- |
| 对象边界 | 新增或迁移字段放在最小 owning object 下，通常是 `FileRecord` 或它的子 record。 |
| 命名 | 字段名表达领域 owner 和生产阶段，不用 preview 命名，除非字段确实是 view state。 |
| 血缘 | Cleaned data、curves、metrics、cache entries 都能追溯到 `fileId`，需要时还能追溯到 `seriesId` 和 `curveKind`。 |
| 失效 | Patch 说明或实现 source、template、curve signature、metric input、selection 变化时哪些数据被清理或重算。 |
| 兼容 | 现有兼容写入要么保留在 `SessionService` 后面，要么迁移到 canonical owner。 |
| Views | Table/chart/parameter views 只消费 model snapshots，并只写 `SessionViewState` 或明确的用户输入。 |

