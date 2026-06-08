/*
 * Session owns the current workbench data table. Canonical facts live in
 * filesById/fileOrder, activeTarget, and viewState.
 */
import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { CalculatedPlotsByKey } from "src/cs/workbench/contrib/calculation/common/calculatedData";
import type {
  ProcessedEntry,
  ProcessedSeries,
  PreviewFile,
  PreviewRowsRequest,
  SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";
import type { TemplateSelectionsByFileId } from "src/cs/workbench/contrib/template/common/templateSelection";
import type {
  CurveData,
  CurveKey,
  CurveViewState,
  FileSemantics,
  FileSemanticsUpdate,
} from "src/cs/workbench/services/session/common/fileSemantics";
import type {
  FileId,
  FileRecord,
  IonIoffMethod,
  MetricInputRecord,
  MetricKey,
  SessionTarget,
  SessionViewState,
  SsMethod,
  TablePreviewStatusRecord,
  TableSelection,
  TemplateFormState,
  TemplateMode,
} from "src/cs/workbench/services/session/common/sessionModel";

export const ISessionService = createDecorator<ISessionService>("sessionService");

export type MutableState<T> = {
  current: T;
};

export type { IonIoffMethod, SsMethod, TemplateFormState, TemplateMode };

export type PreviewStatus = TablePreviewStatusRecord;

export type StateSetter<T> = (value: T | ((previous: T) => T)) => void;

export type CommitProcessedFileOptions = {
  readonly activeFileId?: unknown;
  readonly appliedTemplateConfig?: unknown;
};

export type SessionSnapshot = {
  readonly version: 1;
  readonly filesById: Record<FileId, FileRecord>;
  readonly fileOrder: FileId[];
  readonly activeTarget: SessionTarget;
  readonly viewState: SessionViewState;
};

export type SessionContextSnapshot = Pick<
  SessionSnapshot,
  | "version"
  | "filesById"
  | "fileOrder"
  | "activeTarget"
  | "viewState"
>;

export type SessionContextValue = SessionContextSnapshot & {
  setActiveTarget: StateSetter<SessionTarget>;
  setTableSelection: StateSetter<TableSelection | undefined>;
  setViewState: StateSetter<SessionViewState>;
  addRawFiles(files: readonly SessionFile[]): void;
  replaceRawFiles(files: readonly SessionFile[]): void;
  removeFiles(fileIds: readonly string[]): void;
  clearSessionData(): void;
  replaceCalculatedCurves(plotsByKey: CalculatedPlotsByKey): void;
  commitProcessedFile(
    file: ProcessedEntry | null | undefined,
    options?: CommitProcessedFileOptions,
  ): void;
  resetProcessedData(): void;
  setTemplateMode: StateSetter<TemplateMode>;
  setSelectedTemplateId: StateSetter<string | null>;
  setFileTemplateSelectionsByFileId: StateSetter<TemplateSelectionsByFileId>;
  setTemplateFormState: StateSetter<TemplateFormState>;
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
  setSsMethod: StateSetter<SsMethod>;
  setSsShowFitLine: StateSetter<boolean>;
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

  readonly setActiveTarget: StateSetter<SessionTarget>;
  readonly setTableSelection: StateSetter<TableSelection | undefined>;
  readonly setViewState: StateSetter<SessionViewState>;
  readonly setTemplateMode: StateSetter<TemplateMode>;
  readonly setSelectedTemplateId: StateSetter<string | null>;
  readonly setFileTemplateSelectionsByFileId: StateSetter<TemplateSelectionsByFileId>;
  readonly setTemplateFormState: StateSetter<TemplateFormState>;
  readonly setPreviewFile: StateSetter<PreviewFile | null>;
  readonly setPreviewStatus: StateSetter<PreviewStatus>;
  readonly setIonIoffMethod: StateSetter<IonIoffMethod>;
  readonly setMetricInput: (input: MetricInputRecord) => void;
  readonly clearMetricInput: (fileId: string, metricKey: MetricKey) => void;
  readonly setSsMethod: StateSetter<SsMethod>;
  readonly setSsShowFitLine: StateSetter<boolean>;

  batch(callback: () => void): void;
  addRawFiles(files: readonly SessionFile[]): void;
  clearCurve(key: CurveKey): void;
  clearSessionData(): void;
  createContextValue(snapshot: SessionSnapshot): SessionContextValue;
  emitChange(): void;
  getCurveData(key: CurveKey): CurveData | undefined;
  getCurveViewState(key: CurveKey): CurveViewState;
  getFileSemantics(fileId: string): FileSemantics | undefined;
  getSeriesLabel(fileId: string, seriesId: string): string | undefined;
  getSeriesLabels(fileId: string): Readonly<Record<string, string>>;
  getSnapshot(): SessionSnapshot;
  pruneFileSemantics(fileIds: readonly string[], curveKeys: readonly CurveKey[]): void;
  pruneSeriesLabels(files: readonly ProcessedEntry[]): void;
  pruneSeriesLabelsByRecords(
    filesById: Readonly<Record<FileId, FileRecord>>,
    fileOrder: readonly FileId[],
  ): void;
  removeFiles(fileIds: readonly string[]): void;
  replaceCalculatedCurves(plotsByKey: CalculatedPlotsByKey): void;
  replaceRawFiles(files: readonly SessionFile[]): void;
  resolveSeriesLabel(
    file: ProcessedEntry | null | undefined,
    series: ProcessedSeries | null | undefined,
    index: number,
  ): string;
  commitProcessedFile(
    file: ProcessedEntry | null | undefined,
    options?: CommitProcessedFileOptions,
  ): void;
  resetProcessedData(): void;
  setCurveData(data: CurveData): void;
  setFileSemantics(semantics: FileSemantics): void;
  setSeriesLabel(fileId: string, seriesId: string, label: string | null): void;
  subscribe(listener: () => void): () => void;
  updateCurveViewState(key: CurveKey, updates: CurveViewState): void;
  updateFileSemantics(fileId: string, updates: FileSemanticsUpdate): void;
}





