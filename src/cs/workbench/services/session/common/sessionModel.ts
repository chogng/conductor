import type { SliceRun, SliceRunId } from "src/cs/workbench/services/slice/common/slice";

export type FileId = string;
export type SheetId = string;
export type SeriesId = string;
export type CacheKey = string;
export type FileKind = "csv" | "excel" | "unknown";

export type CurveGeneration = "base" | "derived" | "secondDerived";
export type BaseCurveFamily = "iv" | "cv" | "cf" | "pv" | "it";
export type IvCurveMode = "transfer" | "output";
export type ItCurveMode =
  | "stability"
  | "transient"
  | "retention"
  | "biasStress"
  | "photoResponse"
  | "generic";
export type DerivedCurveFamily =
  | "gm"
  | "localSs"
  | "thresholdFit"
  | "subthresholdFit";
export type SecondDerivedCurveFamily = "secondDerivative";
export type CurveFamily =
  | BaseCurveFamily
  | DerivedCurveFamily
  | SecondDerivedCurveFamily;
export type BaseCurveKey =
  `base:${BaseCurveFamily}:${IvCurveMode | ItCurveMode | "default"}:${SeriesId}`;
export type DerivedCurveKey = `derived:${DerivedCurveFamily}:default:${SeriesId}`;
export type SecondDerivedCurveKey =
  `secondDerived:${SecondDerivedCurveFamily}:default:${SeriesId}`;
export type CurveKey = BaseCurveKey | DerivedCurveKey | SecondDerivedCurveKey;

export type MetricFamily =
  | "current"
  | "derivative"
  | "threshold"
  | "subthreshold";
export type MetricKey = `${MetricFamily}:${SeriesId}:${string}`;

export type TemplateSelectionRecord =
  | { kind: "auto" }
  | { kind: "saved"; templateId: string };

export type SessionModel = {
  schemaVersion: 1;
  sessionVersion: number;
  filesById: Record<FileId, FileRecord>;
  fileOrder: FileId[];
};

export type FileRecord = {
  id: FileId;
  name: string;
  kind: FileKind;
  raw: RawRecord;
  rawTableVersionsById: Record<SheetId, number>;
  sliceRunsById?: Record<SliceRunId, SliceRun>;
  latestSliceRunId?: SliceRunId;
  seriesById: Record<SeriesId, SeriesRecord>;
  seriesOrder: SeriesId[];
  curvesByKey: Record<string, CurveRecord>;
  metricsByKey: Record<string, MetricRecord>;
  metricsBySeriesId?: Record<SeriesId, MetricKey[]>;
  metricInputsByKey?: Record<string, MetricInputRecord>;
  calculationCache?: CalculationCacheRecord;
};

export type RawRecord = {
  fileId: FileId;
  fileName: string;
  file?: unknown;
  size?: number;
  lastModified?: number;
  rawKey?: string;
  relativePath?: string | null;
  filePath?: string | null;
  normalizedCsvPath?: string | null;
  tablesById: Record<SheetId, TableRecord>;
  tableOrder: SheetId[];
};

export type RawTableSourceRecord =
  | {
      readonly kind: "csv";
      readonly originalPath?: string | null;
    }
  | {
      readonly kind: "excelSheet";
      readonly sheetIndex: number;
      readonly sheetName?: string | null;
      readonly originalPath?: string | null;
    }
  | {
      readonly kind: "unknown";
    };

export type RawTableHealthState =
  | "ok"
  | "suspect"
  | "decodeFailed"
  | "parseFailed"
  | "unsupported"
  | "empty";

export type TemplateEligibility =
  | "eligible"
  | "notEligible"
  | "needsUserAction";

export type RawTableHealthRecord = {
  readonly state: RawTableHealthState;
  readonly message: string;
  readonly decode?: {
    readonly encoding?: string;
    readonly confidence: number;
    readonly replacementCharRatio: number;
    readonly controlCharRatio: number;
    readonly binaryLike: boolean;
    readonly reason?: string;
  };
};

export type RawTableRowsRecord =
  | {
      readonly kind: "inline";
      readonly values: readonly (readonly string[])[];
    }
  | {
      readonly kind: "normalizedCsv";
      readonly normalizedCsvPath: string;
      readonly formatVersion: number;
    }
  | {
      readonly kind: "unavailable";
      readonly reason: string;
    };

export type RawTableRecord = {
  readonly fileId: string;
  readonly rawTableId: string;
  readonly source: RawTableSourceRecord;
  readonly rows: RawTableRowsRecord;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly maxCellLengths?: readonly number[];
  readonly health?: RawTableHealthRecord;
  readonly templateEligibility?: TemplateEligibility;
};

export type TableRecord = {
  fileId: FileId;
  sheetId: SheetId;
  sheetName?: string | null;
  tableKey: string;
  rowStore?: TableRowStoreRecord;
  rowCount: number;
  columnCount: number;
  maxCellLengths: number[];
  health?: RawTableHealthRecord;
  templateEligibility?: TemplateEligibility;
};

export type TableRowStoreRecord =
  | { kind: "memory"; rows: readonly TableRowRecord[] }
  | { kind: "external"; tableKey: string; normalizedCsvPath?: string | null };

export type TableRowRecord = readonly unknown[];

export const getLatestSliceRunRecord = (
  file: Pick<FileRecord, "latestSliceRunId" | "sliceRunsById">,
): SliceRun | undefined => {
  const sliceRunId = file.latestSliceRunId;
  return sliceRunId ? file.sliceRunsById?.[sliceRunId] : undefined;
};

export type TableRangeRef = {
  fileId: FileId;
  sheetId: SheetId;
  range: RangeRef;
};

export type RawTableRef = {
  readonly fileId: FileId;
  readonly rawTableId: SheetId;
};

export type DomainRecord = {
  x?: [number, number];
  y?: [number, number];
  yPositive?: [number, number];
  yAbsPositive?: [number, number];
  yLog10Abs?: [number, number];
};

export type SeriesRecord = {
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

export type BaseCurveRecord = {
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

export type DerivedCurveRecord = {
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

export type SecondDerivedCurveRecord = {
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

export type CurveRecord =
  | BaseCurveRecord
  | DerivedCurveRecord
  | SecondDerivedCurveRecord;

export type CurveLineage =
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

export type CurveRef = {
  fileId: FileId;
  seriesId: SeriesId;
  curveKey: CurveKey;
  signature: string;
};

export type CurvePoint = {
  x: number;
  y: number;
};

export type CurveChannelsRecord = {
  yPositive?: number[];
  yAbsPositive?: number[];
  yLog10Abs?: number[];
};

export type MetricInputRecord = {
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

export type BaseMetricRecord = {
  key: MetricKey;
  fileId: FileId;
  seriesId: SeriesId;
  metricFamily: MetricFamily;
  contextKey: string;
  inputCurves: CurveRef[];
  inputSignatures: string[];
  algorithm?: { id: string; version?: string };
};

export type CurrentMetricRecord = BaseMetricRecord & {
  metricFamily: "current";
  value: CurrentMetricValueRecord;
};

export type DerivativeMetricRecord = BaseMetricRecord & {
  metricFamily: "derivative";
  value: DerivativeMetricValueRecord;
};

export type ThresholdMetricRecord = BaseMetricRecord & {
  metricFamily: "threshold";
  value: ThresholdMetricValueRecord;
};

export type SubthresholdMetricRecord = BaseMetricRecord & {
  metricFamily: "subthreshold";
  value: SubthresholdMetricValueRecord;
};

export type MetricRecord =
  | CurrentMetricRecord
  | DerivativeMetricRecord
  | ThresholdMetricRecord
  | SubthresholdMetricRecord;

export type CurrentMetricValueRecord = {
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

export type CurrentWindowRecord = {
  key: "lowEnd" | "highEnd" | "maxCurrent" | "minCurrent" | "zeroBias" | "manualIon" | "manualIoff";
  label: string;
  current: number | null;
  x: number | null;
  x1: number | null;
  x2: number | null;
  targetX: number | null;
  pointCount: number;
};

export type DerivativeMetricValueRecord = {
  kind: "gm" | "gds";
  maxAbs: number | null;
  xAtMaxAbs: number | null;
};

export type ThresholdMetricValueRecord = {
  vth: number | null;
  electron?: number | null;
  hole?: number | null;
  fitQuality?: "good" | "weak" | "failed" | "unavailable";
};

export type SubthresholdMetricValueRecord = {
  ss: number | null;
  confidence: "high" | "low" | "fail";
  xAtSs: number | null;
  method: "auto" | "manual";
};

export type CalculationCacheRecord = {
  fileId: FileId;
  touchedAt?: number;
  estimatedBytes?: number;
  entriesByKey: Record<CacheKey, CalculationCacheEntry>;
};

export type CalculationCacheEntry = {
  inputSignatures: string[];
  kind: "baseCurrent" | "gm" | "localSs" | "ssFitAuto";
  value: unknown;
};

export type RangeRef = {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
};

export const createEmptySessionModel = (): SessionModel => ({
  schemaVersion: 1,
  sessionVersion: 0,
  filesById: {},
  fileOrder: [],
});
