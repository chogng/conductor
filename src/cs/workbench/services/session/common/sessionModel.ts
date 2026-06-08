import type { PreviewFile } from "src/cs/workbench/services/session/common/sessionTypes";

export type FileId = string;
export type SheetId = string;
export type SeriesId = string;
export type CandidateId = string & { readonly __brand: "CandidateId" };
export type CacheKey = string & { readonly __brand: "CacheKey" };

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
export type TemplateMode = "select" | "save";
export type IonIoffMethod = "auto" | "manual";
export type SsMethod = "auto" | "manual";

export type TemplateSelectionRecord =
  | { kind: "auto" }
  | { kind: "template"; templateId: string };

export type TemplateSelectionsByFileIdRecord = Record<FileId, TemplateSelectionRecord>;

export type TemplateFormState = {
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

export type SessionModel = {
  version: 1;
  filesById: Record<FileId, FileRecord>;
  fileOrder: FileId[];
  activeTarget: SessionTarget;
  viewState: SessionViewState;
};

export type FileRecord = {
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

export type CurveAssessment = {
  baseFamily: BaseCurveFamily | null;
  baseFamilyConfidence?: "high" | "medium" | "low";
  baseFamilyReasons?: string[];
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
};

export type TableRowStoreRecord =
  | { kind: "memory"; rows: readonly TableRowRecord[] }
  | { kind: "external"; tableKey: string; normalizedCsvPath?: string | null };

export type TableRowRecord = readonly unknown[];

export type BaseCandidateRecord = {
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

export type RawCurvePointRecord = {
  x: unknown;
  y: unknown;
  rowIndex?: number;
};

export type TemplateRunRecord = {
  selection: TemplateSelectionRecord;
  config: TemplateConfigRecord;
  input?: TemplateInputRecord;
  configFingerprint: string;
  mode: "auto" | "manual" | "rule";
  appliedAt: number;
  warnings: string[];
  errors: string[];
};

export type TemplateConfigRecord = {
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

export type TemplateInputRecord = {
  xRange?: TableRangeRef;
  yRanges?: TableRangeRef[];
};

export type TableRangeRef = {
  fileId: FileId;
  sheetId: SheetId;
  range: RangeRef;
};

export type AxisRecord = {
  x: { label?: string; role?: string; unit?: string };
  y: { label?: string; role?: string; unit?: string; scale?: "linear" | "log" };
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

export type SessionTarget =
  | { kind: "none" }
  | { kind: "file"; fileId: FileId }
  | { kind: "sheet"; fileId: FileId; sheetId: SheetId }
  | { kind: "series"; fileId: FileId; seriesId: SeriesId }
  | { kind: "curve"; fileId: FileId; curveKey: CurveKey };

export type TableSelection =
  | { kind: "cell"; fileId: FileId; sheetId: SheetId; cell: CellRef }
  | { kind: "range"; fileId: FileId; sheetId: SheetId; range: RangeRef };

export type CommandTarget =
  | { kind: "file"; fileId: FileId }
  | { kind: "sheet"; fileId: FileId; sheetId: SheetId }
  | { kind: "series"; fileId: FileId; seriesId: SeriesId }
  | { kind: "curve"; fileId: FileId; curveKey: CurveKey }
  | { kind: "tableRange"; fileId: FileId; sheetId: SheetId; range: RangeRef };

export type CellRef = {
  rowIndex: number;
  colIndex: number;
};

export type RangeRef = {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
};

export type SessionViewState = {
  table?: {
    loading?: boolean;
    tableKey?: string | null;
    rowCacheVersion?: number;
    previewFile?: PreviewFile | null;
    previewStatus?: TablePreviewStatusRecord;
    selection?: TableSelection;
  };
  template?: {
    mode?: TemplateMode;
    selectedTemplateId?: string | null;
    selectionsByFileId?: TemplateSelectionsByFileIdRecord;
    formState?: TemplateFormState;
  };
  parameters?: {
    ionIoffMethod?: IonIoffMethod;
    ssMethod?: SsMethod;
    ssShowFitLine?: boolean;
  };
  chart?: {
    activeCurveKey?: CurveKey | null;
    selectedCurveKeys?: CurveKey[];
    hoveredCurveKey?: CurveKey | null;
  };
  curves?: Record<CurveKey, { color?: string; hidden?: boolean }>;
};

export type TablePreviewStatusRecord = {
  state: "idle" | "loading" | "ready";
  message: string;
};

export const createEmptySessionViewState = (): SessionViewState => ({});

export const createDefaultTemplateFormState = (): TemplateFormState => ({
  name: "",
  xDataStart: "",
  xDataEnd: "",
  xSegmentationMode: "auto",
  xSegmentCount: "",
  xPointsPerGroup: "",
  xUnit: "V",
  yLegendStart: "",
  yLegendCount: "",
  yLegendStep: "",
  yLegendTarget: "auto",
  yUnit: "A",
  stopOnError: false,
  bottomTitle: "",
  leftTitle: "",
  legendPrefix: "",
  yColumns: [],
});

export const getTemplateModeFromViewState = (
  viewState: SessionViewState,
): TemplateMode => viewState.template?.mode ?? "select";

export const getSelectedTemplateIdFromViewState = (
  viewState: SessionViewState,
): string | null => viewState.template?.selectedTemplateId ?? null;

export const getTemplateSelectionsFromViewState = (
  viewState: SessionViewState,
): TemplateSelectionsByFileIdRecord =>
  viewState.template?.selectionsByFileId ?? {};

export const getTemplateFormStateFromViewState = (
  viewState: SessionViewState,
): TemplateFormState =>
  viewState.template?.formState ?? createDefaultTemplateFormState();

export const getIonIoffMethodFromViewState = (
  viewState: SessionViewState,
): IonIoffMethod => viewState.parameters?.ionIoffMethod ?? "auto";

export const getSsMethodFromViewState = (
  viewState: SessionViewState,
): SsMethod => viewState.parameters?.ssMethod ?? "auto";

export const getSsShowFitLineFromViewState = (
  viewState: SessionViewState,
): boolean => viewState.parameters?.ssShowFitLine ?? true;

export const createEmptySessionModel = (): SessionModel => ({
  version: 1,
  filesById: {},
  fileOrder: [],
  activeTarget: { kind: "none" },
  viewState: createEmptySessionViewState(),
});

export const createNoneTarget = (): SessionTarget => ({ kind: "none" });

export const createFileTarget = (fileId: FileId): SessionTarget => ({
  kind: "file",
  fileId,
});

export const createSheetTarget = (
  fileId: FileId,
  sheetId: SheetId,
): SessionTarget => ({
  kind: "sheet",
  fileId,
  sheetId,
});

export const resolveFileIdFromTarget = (
  target: SessionTarget,
): FileId | null => target.kind === "none" ? null : target.fileId;

export const resolveSheetIdFromTarget = (
  target: SessionTarget,
): SheetId | null => target.kind === "sheet" ? target.sheetId : null;

export const isSameSessionTarget = (
  first: SessionTarget,
  second: SessionTarget,
): boolean => {
  if (first.kind !== second.kind) {
    return false;
  }

  switch (first.kind) {
    case "none":
      return true;
    case "file":
      return second.kind === "file" && first.fileId === second.fileId;
    case "sheet":
      return second.kind === "sheet" &&
        first.fileId === second.fileId &&
        first.sheetId === second.sheetId;
    case "series":
      return second.kind === "series" &&
        first.fileId === second.fileId &&
        first.seriesId === second.seriesId;
    case "curve":
      return second.kind === "curve" &&
        first.fileId === second.fileId &&
        first.curveKey === second.curveKey;
  }
};
