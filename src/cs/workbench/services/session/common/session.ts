/*
 * Session owns the current workbench data table. Source files, cleaned files,
 * calculated curves, metadata, preview state, and template state all live here
 * so chart, parameters, export, and template code do not keep parallel copies.
 *
 * Metadata is a table inside the session. File metadata is keyed by fileId, and
 * curve data/view state is keyed by fileId + curveKind + seriesId. Do not add a
 * second metadata service that stores another copy of this state.
 */
import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { CalculatedDataByKey } from "src/cs/workbench/contrib/calculation/common/calculatedData";
import type {
  AnalysisResultsByFileId,
  CleanedEntry,
  CleanedSeries,
  PreviewFile,
  PreviewRowsRequest,
  SessionFile,
} from "src/cs/workbench/contrib/session/common/sessionTypes";
import type { TemplateSelectionsByFileId } from "src/cs/workbench/contrib/template/common/templateSelection";
import type {
  CurveData,
  CurveKey,
  CurveViewState,
  FileMetadata,
  FileMetadataUpdate,
  MetadataState,
} from "src/cs/workbench/services/metadata/common/metadata";

export const ISessionService = createDecorator<ISessionService>("sessionService");

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

export type SessionSnapshot = {
  readonly sourceFiles: SessionFile[];
  readonly selectedPreviewFileId: string | null;
  readonly selectedPreviewSheetId: string | null;
  readonly cleanedData: CleanedEntry[];
  readonly calculatedDataByKey: CalculatedDataByKey;
  readonly metadata: MetadataState;
  readonly analysisResults: AnalysisResultsByFileId;
  readonly templateMode: TemplateMode;
  readonly selectedTemplateId: string | null;
  readonly fileTemplateSelectionsByFileId: TemplateSelectionsByFileId;
  readonly templateConfig: TemplateConfig;
  readonly previewFile: PreviewFile | null;
  readonly previewStatus: PreviewStatus;
  readonly ionIoffMethod: IonIoffMethod;
  readonly ionIoffManualTargetsByFileId: IonIoffManualTargetsByFileId;
  readonly ssMethod: SsMethod;
  readonly ssShowFitLine: boolean;
  readonly ssManualRanges: SsManualRanges;
};

export type SessionContextValue = SessionSnapshot & {
  setSourceFiles: StateSetter<SessionFile[]>;
  setSelectedPreviewFileId: StateSetter<string | null>;
  setSelectedPreviewSheetId: StateSetter<string | null>;
  setCleanedData: StateSetter<CleanedEntry[]>;
  setCalculatedDataByKey: StateSetter<CalculatedDataByKey>;
  setAnalysisResults: StateSetter<AnalysisResultsByFileId>;
  setTemplateMode: StateSetter<TemplateMode>;
  setSelectedTemplateId: StateSetter<string | null>;
  setFileTemplateSelectionsByFileId: StateSetter<TemplateSelectionsByFileId>;
  setTemplateConfig: StateSetter<TemplateConfig>;
  setPreviewFile: StateSetter<PreviewFile | null>;
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
  setIonIoffMethod: StateSetter<IonIoffMethod>;
  setIonIoffManualTargetsByFileId: StateSetter<IonIoffManualTargetsByFileId>;
  setSsMethod: StateSetter<SsMethod>;
  setSsShowFitLine: StateSetter<boolean>;
  setSsManualRanges: StateSetter<SsManualRanges>;
};

export interface ISessionService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeSession: Event<void>;

  readonly previewWorkerRef: MutableState<Worker | null>;
  readonly previewRequestIdRef: MutableState<number>;
  readonly previewRowsRequestIdRef: MutableState<number>;
  readonly previewRowsRequestsRef: MutableState<Map<number, PreviewRowsRequest>>;
  readonly previewRowsCacheByFileIdRef: MutableState<Map<string, Map<number, unknown[]>>>;
  readonly previewLoadedChunksByFileIdRef: MutableState<Map<string, Set<number>>>;
  readonly previewRowsCacheRef: MutableState<Map<number, unknown[]>>;
  readonly previewLoadedChunksRef: MutableState<Set<number>>;
  readonly previewCacheFileIdRef: MutableState<string | null>;
  readonly previewCacheFileLruRef: MutableState<Set<string>>;

  readonly setSourceFiles: StateSetter<SessionFile[]>;
  readonly setSelectedPreviewFileId: StateSetter<string | null>;
  readonly setSelectedPreviewSheetId: StateSetter<string | null>;
  readonly setCleanedData: StateSetter<CleanedEntry[]>;
  readonly setCalculatedDataByKey: StateSetter<CalculatedDataByKey>;
  readonly setAnalysisResults: StateSetter<AnalysisResultsByFileId>;
  readonly setTemplateMode: StateSetter<TemplateMode>;
  readonly setSelectedTemplateId: StateSetter<string | null>;
  readonly setFileTemplateSelectionsByFileId: StateSetter<TemplateSelectionsByFileId>;
  readonly setTemplateConfig: StateSetter<TemplateConfig>;
  readonly setPreviewFile: StateSetter<PreviewFile | null>;
  readonly setPreviewStatus: StateSetter<PreviewStatus>;
  readonly setIonIoffMethod: StateSetter<IonIoffMethod>;
  readonly setIonIoffManualTargetsByFileId: StateSetter<IonIoffManualTargetsByFileId>;
  readonly setSsMethod: StateSetter<SsMethod>;
  readonly setSsShowFitLine: StateSetter<boolean>;
  readonly setSsManualRanges: StateSetter<SsManualRanges>;

  batch(callback: () => void): void;
  clearCurve(key: CurveKey): void;
  createContextValue(snapshot: SessionSnapshot): SessionContextValue;
  emitChange(): void;
  getCurveData(key: CurveKey): CurveData | undefined;
  getCurveViewState(key: CurveKey): CurveViewState;
  getFileMetadata(fileId: string): FileMetadata | undefined;
  getSeriesLabel(fileId: string, seriesId: string): string | undefined;
  getSeriesLabels(fileId: string): Readonly<Record<string, string>>;
  getSnapshot(): SessionSnapshot;
  pruneMetadata(fileIds: readonly string[], curveKeys: readonly CurveKey[]): void;
  pruneSeriesLabels(files: readonly CleanedEntry[]): void;
  resolveSeriesLabel(
    file: CleanedEntry | null | undefined,
    series: CleanedSeries | null | undefined,
    index: number,
  ): string;
  setCurveData(data: CurveData): void;
  setFileMetadata(metadata: FileMetadata): void;
  setSeriesLabel(fileId: string, seriesId: string, label: string | null): void;
  subscribe(listener: () => void): () => void;
  updateCurveViewState(key: CurveKey, updates: CurveViewState): void;
  updateFileMetadata(fileId: string, updates: FileMetadataUpdate): void;
}
