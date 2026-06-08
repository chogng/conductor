# Session 模型契约

这份文档是 session 数据模型的实现契约。后续 session 代码应该先按这个模型设计；旧输入格式必须在边界处转换后再进入 `SessionSnapshot`。

一个 canonical `SessionModel` 足够覆盖整个 session。它不是一个扁平大对象，而是一个根聚合：每个导入文件拥有一个 `FileRecord`，这个文件后续完整生命周期都落在这个 record 下面。

## Plan

| 步骤 | 目标 |
| --- | --- |
| 1 | 用 `SessionModel` 表达整个 session 领域状态。 |
| 2 | 用 `FileRecord` 拥有单个文件的 raw import payload、分类、模板输出、base series、base curves、derived curves、metrics 和 cache。 |
| 3 | 长期模型中不再使用 `metadata`、`cleanedData`、`analysisResults`、`calculatedDataByKey` 这类桶名；它们只能作为迁移 adapter 存在。 |
| 4 | 模板清洗产出直接写成具体字段：`axis`、`xGroups`、`seriesById`、`seriesOrder`、`domain`、`templateRun`。 |
| 5 | 可绘制曲线按 generation 和 family 写入 `curvesByKey`：IV/CV/CF/PV/IT 这类 base families、gm/SS/threshold fit/subthreshold fit 这类 derived families、second derivative 这类 second-derived families；inspector / parameter 标量结果写入 `metricsByKey`，`metricsBySeriesId` 只作为索引。 |
| 6 | Session 主工作对象写入 `activeTarget`；view-local selections、preview、loading、颜色、隐藏、UI cache、模板表单草稿和参数面板方法写入 `viewState`。 |
| 7 | `SessionSnapshot` 不保留 legacy bucket；旧名字只能出现在外部迁移 adapter 或 deprecated API 参数边界。 |

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

`FileRecord` 是长期 owner。一个文件产生的值，除非是纯 UI 状态，否则都应该能从这个文件的 record 到达。

`CurveKey` 的作用域在 `FileRecord` 内。第三段是 mode key：IV base curves 使用 `transfer` 或 `output`；IT base curves 使用 `ItCurveMode`；其它 base curves、derived curves 和 second-derived curves 使用 `default`。

Base curve family 含义：

| Family | 含义 |
| --- | --- |
| `iv` | Current-voltage。 |
| `cv` | Capacitance-voltage。 |
| `cf` | Capacitance-frequency。 |
| `pv` | Power-voltage 或 polarization-voltage，取决于业务场景。 |
| `it` | Current-time。 |

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

`RawRecord` 拥有单个文件未经处理的 import payload：文件事实加原始 table 或 sheet 内容。它不拥有 axis labels、cleaned series、curves 或 metrics。

文件 bytes 一旦被解析成 table 或 sheet，未经处理的 cell rows 就属于 `raw.tablesById[sheetId].rowStore`。如果 rows 不常驻内存，`rowStore` 保存外部 locator，而不是复制 rows arrays。

### Assessment

```ts
type CurveAssessment = {
  baseFamily: BaseCurveFamily | null;
  baseFamilyConfidence?: "high" | "medium" | "low";
  baseFamilyReasons?: string[];
};
```

`CurveAssessment` 只表达当前对文件或表的 base curve family 判断。导入时可以从文件名、headers 或用户标签得到初始判断，模板处理后可以 refine。Base 表示派生链的根曲线，不表示 raw input。例如 IV 是 base family，transfer 和 output 是 IV mode，写在 `BaseCandidateRecord`、`BaseCurveRecord` 和 base curve lineage 上，不写进 assessment。IT modes 也遵守同样规则，通过 `itMode` 表达，不写进 `CurveAssessment.baseFamily`。

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

`TableRecord` 描述可选择的原始 table 或 sheet。Row cache、loading flag、preview request id 都是 view state，不是 table 数据。

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

`BaseCandidateRecord` 保存模板前的 base curve candidates。模板处理前不一定已经有稳定 `SeriesId`；candidate 身份是 `CandidateId`，通常来自 file/sheet/column/group 证据。如果 import 或浮层标签 UI 能提前提出最终 series 身份，写入 `proposedSeriesId`。它不是最终 cleaned 事实数据。模板处理可以复用 `proposedSeriesId`，但最终 numeric arrays 仍然属于 `seriesById`。

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

`TemplateRunRecord` 解释下面这些具体字段是怎么产生的，但不包含产出的 series 或 curves。`TemplateConfigRecord` 是 canonical run config：数值字段是解析后的 number，不是 UI 原始输入字符串。`TemplateFormState` 可以在用户编辑时保留表单字符串，但它属于 view/form state，写入 `TemplateRunRecord.config` 前必须解析。

`TemplateInputRecord` 保存已经被用户命令确认、并参与 template run 的显式输入。用户只是拖选 table range 时，它不进入 domain model；只有执行 "use this range as x data"、"use this range as y data" 或 "apply template" 这类命令后，它才进入 domain input。

### Template Output Fields

模板处理直接写入具体 file fields。不要把这些字段长期包进含糊的大桶。

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

`FileRecord.axis` 只表示当前 template output 的默认 axis。如果一个文件包含多个 sheet，或者一个 sheet 混合了 IV、IT 这类不同 base curve families，就使用更窄的 axis override：

| Owner | 用途 |
| --- | --- |
| `axis` | 当前 template output 的默认 axis。 |
| `axisBySheetId[sheetId]` | 同一文件里不同 sheet 有不同 axis 语义时使用。 |
| `axisBySeriesId[seriesId]` | 同一 sheet 内混合不同曲线族或 mode 时使用。 |

Axis 解析顺序是 `axisBySeriesId[seriesId]`，再到 `axisBySheetId[sheetId]`，最后回退到 `axis`。

模板输出字段：

| 字段 | 含义 |
| --- | --- |
| `axis` | 当前 template output 的默认科学 labels、units、roles 和 y scale。 |
| `axisBySheetId` | 多 sheet 文件的可选 sheet-level axis overrides。 |
| `axisBySeriesId` | 同一 sheet 混合曲线族时的可选 series-level axis overrides。 |
| `xGroups` | 清洗后的 x arrays。`SeriesRecord.groupIndex` 选择匹配的 group。 |
| `seriesById` | 用稳定 `seriesId` 索引的 cleaned base series；每条 series 保留 `fileId` 和可选 `sheetId`。 |
| `seriesOrder` | Series 的显示和处理顺序。 |
| `domain` | raw x/y 和已 materialize y channels 的可选 finite domains。 |

### Curves

曲线命名必须分清三个概念：

| 概念 | 字段 | 示例 | 含义 |
| --- | --- | --- | --- |
| Generation | `curveGeneration` | `base`、`derived`、`secondDerived` | 曲线是派生链的根、一次计算结果，还是二次计算结果。 |
| Family | `curveFamily` | base: IV/CV/CF/PV/IT；derived: gm/local SS/threshold fit/subthreshold fit；second-derived: second derivative | 科学意义上的曲线族。 |
| IV mode | `ivMode` | `transfer`、`output` | 只在 `curveFamily` 为 `iv` 时有效。Transfer 和 output 是 IV mode，不是 curve family。 |
| IT mode | `itMode` | `stability`、`transient`、`retention`、`biasStress`、`photoResponse`、`generic` | 只在 `curveFamily` 为 `it` 时有效。 |

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

`curvesByKey` 保存所有可绘制曲线。曲线必须保留 `fileId`、`seriesId`、`curveGeneration`、`curveFamily`、可选 `ivMode`/`itMode`、lineage、`points`、可选 `channels` 和 `signature`。

`CurvePoint` 保持最小结构，只表达一个 x/y sample。正电流、绝对电流、log10 绝对电流这类派生显示或分析通道属于 `CurveRecord.channels`。Channel arrays 必须和 `points` 按 index 对齐，并且只在这条曲线确实需要该表示时存在。不要把 `yAbsPositive` 这类 IV 专用字段塞进所有 `CurvePoint`，否则 CV/CF/PV/IT 和 fit curves 都会背上错误语义。

`DomainRecord` 遵守同样规则。`domain.y` 是原始 y range。Log scale 或绝对电流显示应该使用 `domain.yPositive`、`domain.yAbsPositive` 或 `domain.yLog10Abs`，前提是对应 channel 存在；不要重新扫 points，也不要误用可能包含 0 或负值的 y domain。

Base curves 从 `SeriesRecord` materialize，使用 IV/CV/CF/PV/IT 这类 base families。IV transfer/output 表达为 `curveFamily: "iv"` 加 `ivMode: "transfer"` 或 `"output"`。IT mode 表达为 `curveFamily: "it"` 加 `itMode`。gm、local SS curve、threshold fit line、subthreshold fit line 是 derived curve families，它们的 `inputCurve` 指回被消费的输入曲线。Subthreshold swing 本身是标量 metric，单位通常是 mV/dec。Vth 和 SS 标量值不是 curve family：Vth 属于 `ThresholdMetricValueRecord.vth`，SS 属于 `SubthresholdMetricValueRecord.ss`。Second derivative 是 second-derived curve family，它的 `inputCurve` 指回被消费的 derived curve。`DerivedCurveRecord` 和 `SecondDerivedCurveRecord` 使用 `ivMode?: never` 和 `itMode?: never`，避免 base-family modes 泄漏到 derived generations。

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

`metricsByKey` 按 metric context 保存 inspector / parameter values。同一个 `seriesId` 可以有多条 metric records：base IV transfer 曲线上的 current metrics、gm 曲线上的 derivative metrics、手动区间得到的 subthreshold metrics、不同算法版本得到的 threshold metrics。

`metricsBySeriesId` 只是从 series 到 metric keys 的可选索引，不拥有 metric values。UI parameter table 是从 `metricsByKey` 生成的 read model，不是 durable state。

`MetricKey` 在 `FileRecord` 内部作用域下唯一。第一段是封闭的 `MetricFamily`；最后一段是 deterministic context key，例如 input curve key、manual range id 或 algorithm-version key。

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

`calculationCache` 只保存可复用的计算中间态。它是可选且可丢弃的，正确性不能依赖它存在。Cache value 可以是 `unknown`，但每条 entry 仍然必须有稳定 `CacheKey`、封闭的 `kind` 和 `inputSignatures`，这样才能失效旧 cache，也不会变成另一个 `analysisResults` 大桶。

当前 session cache key 按计算类型和 series 分层：`baseCurrent:${seriesId}`、`gm:${seriesId}`、`localSs:${seriesId}`、`ssFitAuto:${seriesId}`。不要把整个文件级计算 payload 塞进单条 entry。如果外部处理器仍返回旧的打包 payload，session adapter 可以把它当迁移输入读取，但 canonical model 必须写成这些 keyed calculation entries。

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

`activeTarget` 是 session 主工作对象，只保存 file、sheet、series 或 curve 焦点。`selection` 只表示 view-local selection，例如 `viewState.table.selection`；它不是 session 工作对象。Preview 是 active target 或局部 view state 引发的 view 行为，不能写进字段名。

`SessionContextValue` 不能再把 `viewState.template` 或 `viewState.parameters` 摊平成顶层只读字段。消费者用 `getTemplateFormStateFromViewState(...)` 这类小 helper 读取，用 session service setter 写入。

命令执行时应该解析 `CommandTarget` 或 context target，而不是让 command 直接读取多个状态桶：

1. 优先使用 command、context menu、右键传入的显式参数。
2. 其次使用 `activeTarget`。
3. 再其次使用局部 UI state，例如 `viewState.table.selection` 或 `viewState.chart.activeCurveKey`。
4. 没有稳定 target 时返回 `null`。

```ts
function resolveCommandTarget(
  session: SessionModel,
  explicit?: Partial<CommandTarget>
): CommandTarget | null;
```

## Data Placement

代码拿到数据以后，按 owner 和科学含义归位，不按产生它的阶段归位。

| 拿到的数据 | 写入字段 | 说明 |
| --- | --- | --- |
| 导入文件身份、文件名、大小、路径、normalized CSV path | `filesById[fileId].raw` | Raw import owner。不放 axis、cleaned series、curves、metrics 或 UI state。 |
| 原始 table/sheet 身份和尺寸 | `filesById[fileId].raw.tablesById[sheetId]` | `TableRecord` 拥有 `rowCount`、`columnCount`、`maxCellLengths` 这类 table facts。 |
| 原始 table rows 或 rows locator | `filesById[fileId].raw.tablesById[sheetId].rowStore` | 内存 rows 用 `kind: "memory"`；转换后的 CSV 或流式存储用 `kind: "external"`。Preview row caches 仍然属于 `viewState`。 |
| Import 或浮层标签得到的曲线分类 | `filesById[fileId].assessment` 和 `baseCandidatesById[candidateId]` | 文件/表级 base family 属于 `assessment`；单个 candidate 的 IV/IT mode 属于 `BaseCandidateRecord`。 |
| 模板前曲线候选 | `filesById[fileId].baseCandidatesById[candidateId]` 和 `baseCandidateOrder` | 保存未经清洗的候选点、列/group 证据。它可以有 `proposedSeriesId`，但不是最终 cleaned series data。 |
| 模板表单草稿输入 | `viewState.template.formState` 或 local form state | 用户编辑时保留 UI 原始字符串。它不是 canonical template config。 |
| 当前模板模式、选中的模板 id、apply 前的 per-file 模板覆盖 | `viewState.template` | 这些只是 UI/command inputs；只有 apply 后才写入 `FileRecord.templateRun`。 |
| 被命令确认的模板 range input | `filesById[fileId].templateRun.input` | Table range 只有在 "use this range as x data" 或 "apply template" 这类命令后才进入 domain。 |
| 模板选择、配置、运行记录 | `filesById[fileId].templateRun` | 解释模板输出怎么产生。`TemplateConfigRecord` 保存解析后的 numbers 和可选 units；`TemplateInputRecord` 保存显式 table range inputs；不保存输出数组。 |
| 模板得到的 axis labels、units、roles、scale | `filesById[fileId].axis`、`axisBySheetId[sheetId]` 或 `axisBySeriesId[seriesId]` | `axis` 只是当前 template output 的默认值；一个文件有多 sheet 或混合曲线族时，使用 sheet-level 或 series-level override。 |
| 模板清洗后的 x arrays | `filesById[fileId].xGroups` | `SeriesRecord.groupIndex` 选择对应 x group。 |
| 模板清洗后的 base y arrays 和 legends | `filesById[fileId].seriesById[seriesId]` 和 `seriesOrder` | `BaseCandidateRecord.proposedSeriesId` 存在且有效时复用；否则创建稳定 `seriesId`。每条 `SeriesRecord` 写入 `fileId`，已知 sheet 时写入 `sheetId`。 |
| 有限数据 domain | `filesById[fileId].domain` 或 `CurveRecord.domain` | File domain 属于 cleaned base data；curve domain 属于某条可绘制曲线。`yLog10Abs` 这类 channel domain 支持 log/absolute 显示，不需要重新扫 points。 |
| 用户编辑的 series label | `filesById[fileId].seriesById[seriesId].labelOverride` | Label override 是 domain data，因为 export、chart、parameters 都会复用。 |
| 可绘制 base curve points，例如 IV/CV/CF/PV/IT transfer/output | `filesById[fileId].curvesByKey[curveKey]`，`curveGeneration: "base"` | 从 `seriesById` materialize，保留 base family 和可选 IV/IT mode lineage。 |
| 可绘制 derived curve points，例如 gm、local SS curve、threshold fit line、subthreshold fit line | `filesById[fileId].curvesByKey[curveKey]`，`curveGeneration: "derived"` | `inputCurve` 和 signature 指回被消费的输入曲线。Vth 和 SS 标量值是 metrics，不是 curves。 |
| 可绘制 second-derived curve points，例如 second derivative | `filesById[fileId].curvesByKey[curveKey]`，`curveGeneration: "secondDerived"` | `inputCurve` 和 signature 指回被消费的 derived curve。 |
| Inspector / parameter 标量值，例如 Ion/Ioff、gm max、`threshold.vth`、`subthreshold.ss`、fit quality | `filesById[fileId].metricsByKey[metricKey]` 加可选 `metricsBySeriesId[seriesId]` 索引 | 标量结果是 metrics，不是 curves。同一个 series 可以有多个 metric contexts。 |
| 手动 metric inputs，例如 Ion/Ioff targets 或 SS range | `filesById[fileId].metricInputsByKey[metricKey]` | 用户输入和计算结果分开保存，并归属同一个 metric context。 |
| 参数面板方法开关，例如 current auto/manual、SS auto/manual、fit line visibility | `viewState.parameters` | 属于 UI state 和命令默认值。手动数值 range 或 targets 仍然写入 `metricInputsByKey`。 |
| 可复用但可丢弃的计算中间态 | `filesById[fileId].calculationCache.entriesByKey[cacheKey]` | Cache 可以被 prune，不影响科学正确性，但每条 entry 仍然要有 `kind` 和 `inputSignatures`。 |
| Session 主工作对象，例如 file、sheet、series 或 curve | `activeTarget` | Domain-level active target，字段名不写 preview 或 selection。 |
| 表格局部 cell 或 range selection | `viewState.table.selection` | Table UI state。命令可以通过 `CommandTarget` 解析使用它。 |
| Loading state、preview row cache versions、chart active/selected/hovered curves、chart colors、hidden flags、模板草稿、参数面板开关 | `viewState` | UI-only state；只有命令明确写入 domain data 后才影响科学结果。 |

## Lifecycle Writes

现在没有“按阶段命名的数据对象”。阶段只是一种生命周期动作：在 canonical model 上写入、覆盖、失效或丢弃具名字段。

| 触发 | 写入或覆盖 | 失效或丢弃 | 保留 |
| --- | --- | --- | --- |
| Import file | 创建或替换 `FileRecord.raw`；初始化 `assessment`。 | 丢弃同一 `fileId` 下旧的 `FileRecord`。 | `fileId` 作为文件 owner 身份。 |
| Assess base curve | 更新 `assessment.baseFamily`、`baseFamilyConfidence` 和 `baseFamilyReasons`。 | 让 template suggestions 失效；丢弃 family 已不匹配的 base curves。 | Raw file facts 和 tables。 |
| Select table | 把 `activeTarget` 设置为 `{ kind: "sheet", fileId, sheetId }`。 | 丢弃 `viewState.table` 里的 table row request cache 和 loading state。 | File data、series、curves、metrics。 |
| Apply template | 覆盖 `templateRun`、`axis`、`axisBySheetId`、`axisBySeriesId`、`xGroups`、`seriesById`、`seriesOrder` 和 `domain`。 | 丢弃从旧 template output 派生出的 base curves、derived curves、second-derived curves、metrics 和 calculation cache。 | `raw`、`assessment` 和稳定 `fileId`。 |
| Materialize base curves | 创建或覆盖 `curveGeneration: "base"` 的 `curvesByKey` entries。 | 丢弃消费旧 base curve signatures 的 derived curves、second-derived curves 和 metrics。 | `seriesId`、base family、可选 IV/IT mode 和 base curve lineage。 |
| Calculate derived curves | 创建或覆盖 gm、local SS curve、threshold fit line、subthreshold fit line 这类 `curveGeneration: "derived"` 的 `curvesByKey` entries。 | 丢弃消费旧 derived curve signatures 的 second-derived curves 和 metrics。 | Input curve reference 和 signature。 |
| Calculate metrics | 创建或覆盖 `metricsByKey` 里的 inspector / parameter 标量 records，并更新可选 `metricsBySeriesId` 索引。 | 丢弃基于旧 metric values 的 inspector read models 和 exports。 | Base 与 derived curve records，以及同一 `metricKey` 下的 metric input records。 |
| Calculate second-derived curves | 创建或覆盖 `curveGeneration: "secondDerived"` 的 `curvesByKey` entries。 | 只丢弃这条 second-derived curve 的 consumers。 | Input derived curve reference 和 signature。 |
| Render UI | 只更新 `viewState`。 | 不丢弃 domain data。 | 完整的 `SessionModel` domain state。 |

## Legacy Migration Map

Legacy 字段名不属于 `SessionSnapshot`。如果必须接受旧持久化格式或 deprecated API，在边界处转换，并立即写入下面的 canonical owner。

| 旧字段或 deprecated 字段 | Canonical owner |
| --- | --- |
| `sourceFiles[]` | `FileRecord.raw` 和初始 `FileRecord.assessment` |
| 当前 `iv`、`transfer`、`output`、`it`、`stability`、`gm`、`vth`、`ss` 等 curve type 字符串 | 文件/表级 base-family 分类写入 `CurveAssessment.baseFamily`；模板前 candidate mode 写入 `BaseCandidateRecord.ivMode/itMode`；可绘制曲线写入 `CurveRecord.curveGeneration/curveFamily/ivMode/itMode`；Vth/SS 标量字符串写入 `metricsByKey` |
| `selectedPreviewFileId` | 当前 `SessionTarget` variant 上的 `activeTarget.fileId` |
| `selectedPreviewSheetId` | `sheet` target variant 上的 `activeTarget.sheetId` 或 `viewState.table.selection.sheetId` |
| `previewFile` | `FileRecord.raw.tablesById[sheetId]` 加 `SessionViewState.table` |
| `cleanedData[]` | `FileRecord` 下的 `axis`、`axisBySheetId`、`axisBySeriesId`、`xGroups`、`seriesById`、`seriesOrder`、`domain`、`templateRun` |
| `metadata.filesById` | `FileRecord.axis`、`axisBySheetId`、`axisBySeriesId` 和 file semantic fields |
| `metadata.curvesByKey` | `FileRecord.curvesByKey` |
| `metadata.seriesLabelsByFileId` | `SeriesRecord.labelOverride` |
| `metadata.curveViewStateByKey` | `SessionViewState.curves` |
| `calculatedDataByKey` | `FileRecord.curvesByKey`，并明确 base / derived / second-derived generation |
| `analysisResults` | `FileRecord.calculationCache` 或 `FileRecord.metricsByKey`；cache 和最终 metrics 必须分开 |
| `ionIoffManualTargetsByFileId` | 按 current metric context 写入 `FileRecord.metricInputsByKey` |
| `ssManualRanges` | 按 subthreshold metric context 写入 `FileRecord.metricInputsByKey` |

## 规则

| 规则 | 必须遵守的行为 |
| --- | --- |
| 一个根模型 | 整个 session 由一个 `SessionModel` 表达。 |
| 一个文件 owner | 一个导入文件对应一个 `FileRecord`。 |
| Raw 拥有初始输入 | 最开始未经处理的文件事实和 cell rows 都属于 `FileRecord.raw`；不要新增名为 `origin` 的 canonical 字段。 |
| 不要含糊大桶 | 不新增长期 owner 名为 `metadata`、`cleanedData`、`result` 或 `data`。 |
| 封闭 union | Canonical taxonomy union 不能以 `string` 收尾；新增 family、mode、generation、confidence 或 cache state 必须先更新这份契约。 |
| 稳定身份 | 下游 records 保留 `fileId`；series records 保留 `seriesId`；curve records 保留 `seriesId`、`curveGeneration`、`curveFamily`、可选 `ivMode`/`itMode` 和 input lineage。 |
| Family 不是 mode | IV/CV/CF/PV/IT 是 base families；transfer/output 是 IV modes；gm、local SS、threshold fit、subthreshold fit 是 derived families；second derivative 是 second-derived。 |
| Target 不是 preview | 使用 `activeTarget` 表达 session 主工作对象；preview 是 view 行为，不写进 target 字段名。 |
| Selection 是 view-local | `selection` 命名只用于 view-local state，例如 `viewState.table.selection`。`activeTarget` 是 session-level domain focus。 |
| Commands 解析 target | 命令操作 resolved `CommandTarget` 或 context target，不直接操作每个 view-state bucket。 |
| Range 通过命令进入 domain | 拖选 cell/range 时只写 `viewState.table.selection`。只有命令把它写入 `TemplateInputRecord` 或其它明确用户输入记录时，它才是 domain data。 |
| View state 不是科学数据 | Colors、hidden flags、loading、row caches、scroll、reveal state 和 template form 原始字符串都留在 `viewState` 或 local form state。 |
| Canonical config 必须已解析 | `TemplateRunRecord.config` 保存解析后的 numeric values 和可选 units。UI strings 属于 `TemplateFormState`，不属于长期 config。 |
| Curves 不是标量 metrics | gm curve points、local SS curve points、Vth fit lines、SS fit lines、log(Id)-Vg curves 属于 `CurveRecord`；Ion/Ioff、gm max、`threshold.vth`、`subthreshold.ss`、fit summaries 和选中的 parameter values 属于 `metricsByKey[metricKey]`。 |
| Cache 可丢弃 | `calculationCache` 可以被 prune，不影响科学正确性，但它仍然使用带 `kind` 和 `inputSignatures` 的 keyed entries；它不是杂物式 analysis bucket。 |
| 按依赖失效 | Template changes 让 axis/series/base curves/derived curves/metrics 失效；base curve signature changes 让 derived curves 和 metrics 失效；derived curve signature changes 让 second-derived curves 和 metrics 失效；view changes 不让 domain data 失效。 |

## 验收清单

| 检查项 | 通过条件 |
| --- | --- |
| Owner | 每个新增字段属于 `SessionModel`、`FileRecord` 或具名 child record。 |
| Name | 名字表达数据的领域角色，而不是实现大桶。 |
| Identity | 文件数据有 `fileId`；series 数据有 `seriesId`；curve 数据有 `curveGeneration`、`curveFamily`、可选 `ivMode`/`itMode` 和 lineage。 |
| Taxonomy | Base family、IV mode、IT mode、derived family、second-derived family 不存进同一个未限定字段。 |
| Closed union | 新的 canonical union values 必须显式列出；patch 不添加 `| string` fallback。 |
| Lifecycle | Patch 说明字段什么时候写入、覆盖、失效或丢弃。 |
| Invalidation | Patch 说明 raw input、template output、curve signature、metric input、active target 或 view-local selection 变化时清理或重算什么。 |
| Compatibility | Legacy fields 只在 `SessionService` 适配，或被明确迁移。 |
| Views | Views 只消费 snapshots，并只写 `viewState` 或明确用户输入。 |
