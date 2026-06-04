import type {
  AnalysisResultsByFileId,
  PreviewFile,
  PreviewRowsRequest,
  CleanedEntry,
  SessionFile,
} from "src/cs/workbench/contrib/session/common/sessionTypes";
import type { CalculatedDataByKey } from "src/cs/workbench/contrib/calculation/common/calculatedData";

export type MutableState<T> = {
  current: T;
};

export type TemplateMode = "select" | "save";
export type PreviewStatusState = "idle" | "loading" | "ready";
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
  bottomTitle: string;
  leftTitle: string;
  legendPrefix: string;
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
  sourceFiles: SessionFile[];
  setSourceFiles: StateSetter<SessionFile[]>;
  selectedPreviewFileId: string | null;
  selectedPreviewSheetId: string | null;
  setSelectedPreviewFileId: StateSetter<string | null>;
  setSelectedPreviewSheetId: StateSetter<string | null>;
  cleanedData: CleanedEntry[];
  setCleanedData: StateSetter<CleanedEntry[]>;
  calculatedDataByKey: CalculatedDataByKey;
  setCalculatedDataByKey: StateSetter<CalculatedDataByKey>;
  analysisResults: AnalysisResultsByFileId;
  setAnalysisResults: StateSetter<AnalysisResultsByFileId>;
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
  ssShowFitLine: boolean;
  setSsShowFitLine: StateSetter<boolean>;
  ssManualRanges: SsManualRanges;
  setSsManualRanges: StateSetter<SsManualRanges>;
};
