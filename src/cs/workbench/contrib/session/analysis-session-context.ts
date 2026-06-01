import type {
  PreviewFile,
  PreviewRowsRequest,
  ProcessedEntry,
  RawDataEntry,
} from "src/cs/workbench/common/deviceAnalysis/sharedTypes";

export type MutableState<T> = {
  current: T;
};

export type TemplateMode = "select" | "save";
export type PreviewStatusState = "idle" | "loading" | "ready" | "error";
export type SsMethod = "auto" | "manual";

export type TemplateConfig = {
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
  fileNameMatchCaseSensitive: boolean;
  bottomTitle: string;
  leftTitle: string;
  legendPrefix: string;
  fileNameVgKeywords: string;
  fileNameVdKeywords: string;
  yColumns: number[];
};

export type PreviewStatus = {
  state: PreviewStatusState;
  message: string;
};

export type IonIoffMethod = "auto" | "manual";

export type IonIoffManualTargets = {
  ionX: string;
  ioffX: string;
};

export type IonIoffManualTargetsBySeriesId = Record<
  string,
  IonIoffManualTargets
>;

export type IonIoffManualTargetsByFileId = Record<
  string,
  IonIoffManualTargetsBySeriesId
>;

export type SsManualRange = {
  x1: unknown;
  x2: unknown;
};

export type SsManualRanges = Record<string, Record<string, SsManualRange>>;

export type StateSetter<T> = (value: T | ((previous: T) => T)) => void;

export type SessionContextValue = {
  rawData: RawDataEntry[];
  setRawData: StateSetter<RawDataEntry[]>;
  selectedPreviewFileId: string | null;
  setSelectedPreviewFileId: StateSetter<string | null>;
  processedData: ProcessedEntry[];
  setProcessedData: StateSetter<ProcessedEntry[]>;
  templateMode: TemplateMode;
  setTemplateMode: StateSetter<TemplateMode>;
  selectedTemplateId: string | null;
  setSelectedTemplateId: StateSetter<string | null>;
  templateConfig: TemplateConfig;
  setTemplateConfig: StateSetter<TemplateConfig>;
  previewFile: PreviewFile | null;
  setPreviewFile: StateSetter<PreviewFile | null>;
  previewStatus: PreviewStatus;
  setPreviewStatus: StateSetter<PreviewStatus>;
  previewWorkerRef: MutableState<Worker | null>;
  previewRequestIdRef: MutableState<number>;
  previewRowsRequestIdRef: MutableState<number>;
  previewRowsRequestsRef: MutableState<Map<number, PreviewRowsRequest>>;
  previewRowsCacheByFileIdRef: MutableState<
    Map<string, Map<number, unknown[]>>
  >;
  previewLoadedChunksByFileIdRef: MutableState<Map<string, Set<number>>>;
  previewRowsCacheRef: MutableState<Map<number, unknown[]>>;
  previewLoadedChunksRef: MutableState<Set<number>>;
  previewCacheFileIdRef: MutableState<string | null>;
  previewCacheFileLruRef: MutableState<Set<string>>;
  ionIoffMethod: IonIoffMethod;
  setIonIoffMethod: StateSetter<IonIoffMethod>;
  ionIoffManualTargetsByFileId: IonIoffManualTargetsByFileId;
  setIonIoffManualTargetsByFileId: StateSetter<IonIoffManualTargetsByFileId>;
  ssMethod: SsMethod;
  setSsMethod: StateSetter<SsMethod>;
  ssDiagnosticsEnabled: boolean;
  setSsDiagnosticsEnabled: StateSetter<boolean>;
  vthDiagnosticsEnabled: boolean;
  setVthDiagnosticsEnabled: StateSetter<boolean>;
  gmDiagnosticsEnabled: boolean;
  setGmDiagnosticsEnabled: StateSetter<boolean>;
  ssShowFitLine: boolean;
  setSsShowFitLine: StateSetter<boolean>;
  ssManualRanges: SsManualRanges;
  setSsManualRanges: StateSetter<SsManualRanges>;
};
