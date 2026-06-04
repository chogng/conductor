import type {
  AnalysisResultsByFileId,
  PreviewFile,
  PreviewRowsRequest,
  CleanedEntry,
  SessionFile,
} from "src/cs/workbench/contrib/session/common/sessionTypes";
import type { CalculatedDataByKey } from "src/cs/workbench/contrib/calculation/common/calculatedData";
import type {
  IonIoffManualTargetsByFileId,
  IonIoffMethod,
  MutableState,
  PreviewStatus,
  SessionContextValue,
  SsManualRanges,
  SsMethod,
  StateSetter,
  TemplateConfig,
  TemplateMode,
} from "src/cs/workbench/contrib/session/browser/sessionContext";

type SessionSnapshot = {
  readonly sourceFiles: SessionFile[];
  readonly selectedPreviewFileId: string | null;
  readonly selectedPreviewSheetId: string | null;
  readonly cleanedData: CleanedEntry[];
  readonly calculatedDataByKey: CalculatedDataByKey;
  readonly analysisResults: AnalysisResultsByFileId;
  readonly templateMode: TemplateMode;
  readonly selectedTemplateId: string | null;
  readonly templateConfig: TemplateConfig;
  readonly previewFile: PreviewFile | null;
  readonly previewStatus: PreviewStatus;
  readonly ionIoffMethod: IonIoffMethod;
  readonly ionIoffManualTargetsByFileId: IonIoffManualTargetsByFileId;
  readonly ssMethod: SsMethod;
  readonly ssDiagnosticsEnabled: boolean;
  readonly vthDiagnosticsEnabled: boolean;
  readonly gmDiagnosticsEnabled: boolean;
  readonly ssShowFitLine: boolean;
  readonly ssManualRanges: SsManualRanges;
};

const createRef = <T,>(current: T): MutableState<T> => ({ current });

const createTemplateConfig = (): TemplateConfig => ({
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

const createPreviewStatus = (): PreviewStatus => ({
  state: "idle",
  message: "",
});

const resolveNext = <T,>(value: T | ((previous: T) => T), previous: T): T =>
  typeof value === "function"
    ? (value as (previous: T) => T)(previous)
    : value;

export class SessionModel {
  private snapshot: SessionSnapshot = {
    sourceFiles: [],
    selectedPreviewFileId: null,
    selectedPreviewSheetId: null,
    cleanedData: [],
    calculatedDataByKey: {},
    analysisResults: {},
    templateMode: "select",
    selectedTemplateId: null,
    templateConfig: createTemplateConfig(),
    previewFile: null,
    previewStatus: createPreviewStatus(),
    ionIoffMethod: "auto",
    ionIoffManualTargetsByFileId: {},
    ssMethod: "auto",
    ssDiagnosticsEnabled: false,
    vthDiagnosticsEnabled: false,
    gmDiagnosticsEnabled: false,
    ssShowFitLine: true,
    ssManualRanges: {},
  };

  private readonly listeners = new Set<() => void>();

  readonly previewWorkerRef = createRef<Worker | null>(null);
  readonly previewRequestIdRef = createRef(0);
  readonly previewRowsRequestIdRef = createRef(0);
  readonly previewRowsRequestsRef = createRef(new Map<number, PreviewRowsRequest>());
  readonly previewRowsCacheByFileIdRef = createRef(
    new Map<string, Map<number, unknown[]>>(),
  );
  readonly previewLoadedChunksByFileIdRef = createRef(new Map<string, Set<number>>());
  readonly previewRowsCacheRef = createRef(new Map<number, unknown[]>());
  readonly previewLoadedChunksRef = createRef(new Set<number>());
  readonly previewCacheFileIdRef = createRef<string | null>(null);
  readonly previewCacheFileLruRef = createRef(new Set<string>());

  readonly setSourceFiles: StateSetter<SessionFile[]> = (value) =>
    this.update("sourceFiles", value);
  readonly setSelectedPreviewFileId: StateSetter<string | null> = (value) =>
    this.update("selectedPreviewFileId", value);
  readonly setSelectedPreviewSheetId: StateSetter<string | null> = (value) =>
    this.update("selectedPreviewSheetId", value);
  readonly setCleanedData: StateSetter<CleanedEntry[]> = (value) =>
    this.update("cleanedData", value);
  readonly setCalculatedDataByKey: StateSetter<CalculatedDataByKey> = (value) =>
    this.update("calculatedDataByKey", value);
  readonly setAnalysisResults: StateSetter<AnalysisResultsByFileId> = (value) =>
    this.update("analysisResults", value);
  readonly setTemplateMode: StateSetter<TemplateMode> = (value) =>
    this.update("templateMode", value);
  readonly setSelectedTemplateId: StateSetter<string | null> = (value) =>
    this.update("selectedTemplateId", value);
  readonly setTemplateConfig: StateSetter<TemplateConfig> = (value) =>
    this.update("templateConfig", value);
  readonly setPreviewFile: StateSetter<PreviewFile | null> = (value) =>
    this.update("previewFile", value);
  readonly setPreviewStatus: StateSetter<PreviewStatus> = (value) =>
    this.update("previewStatus", value);
  readonly setIonIoffMethod: StateSetter<IonIoffMethod> = (value) =>
    this.update("ionIoffMethod", value);
  readonly setIonIoffManualTargetsByFileId: StateSetter<IonIoffManualTargetsByFileId> =
    (value) => this.update("ionIoffManualTargetsByFileId", value);
  readonly setSsMethod: StateSetter<SsMethod> = (value) =>
    this.update("ssMethod", value);
  readonly setSsDiagnosticsEnabled: StateSetter<boolean> = (value) =>
    this.update("ssDiagnosticsEnabled", value);
  readonly setVthDiagnosticsEnabled: StateSetter<boolean> = (value) =>
    this.update("vthDiagnosticsEnabled", value);
  readonly setGmDiagnosticsEnabled: StateSetter<boolean> = (value) =>
    this.update("gmDiagnosticsEnabled", value);
  readonly setSsShowFitLine: StateSetter<boolean> = (value) =>
    this.update("ssShowFitLine", value);
  readonly setSsManualRanges: StateSetter<SsManualRanges> = (value) =>
    this.update("ssManualRanges", value);

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): SessionSnapshot => this.snapshot;

  createContextValue(snapshot: SessionSnapshot): SessionContextValue {
    return {
      ...snapshot,
      setSourceFiles: this.setSourceFiles,
      setSelectedPreviewFileId: this.setSelectedPreviewFileId,
      setSelectedPreviewSheetId: this.setSelectedPreviewSheetId,
      setCleanedData: this.setCleanedData,
      setCalculatedDataByKey: this.setCalculatedDataByKey,
      setAnalysisResults: this.setAnalysisResults,
      setTemplateMode: this.setTemplateMode,
      setSelectedTemplateId: this.setSelectedTemplateId,
      setTemplateConfig: this.setTemplateConfig,
      setPreviewFile: this.setPreviewFile,
      setPreviewStatus: this.setPreviewStatus,
      previewWorkerRef: this.previewWorkerRef,
      previewRequestIdRef: this.previewRequestIdRef,
      previewRowsRequestIdRef: this.previewRowsRequestIdRef,
      previewRowsRequestsRef: this.previewRowsRequestsRef,
      previewRowsCacheByFileIdRef: this.previewRowsCacheByFileIdRef,
      previewLoadedChunksByFileIdRef: this.previewLoadedChunksByFileIdRef,
      previewRowsCacheRef: this.previewRowsCacheRef,
      previewLoadedChunksRef: this.previewLoadedChunksRef,
      previewCacheFileIdRef: this.previewCacheFileIdRef,
      previewCacheFileLruRef: this.previewCacheFileLruRef,
      setIonIoffMethod: this.setIonIoffMethod,
      setIonIoffManualTargetsByFileId: this.setIonIoffManualTargetsByFileId,
      setSsMethod: this.setSsMethod,
      setSsDiagnosticsEnabled: this.setSsDiagnosticsEnabled,
      setVthDiagnosticsEnabled: this.setVthDiagnosticsEnabled,
      setGmDiagnosticsEnabled: this.setGmDiagnosticsEnabled,
      setSsShowFitLine: this.setSsShowFitLine,
      setSsManualRanges: this.setSsManualRanges,
    };
  }

  private update<K extends keyof SessionSnapshot>(
    key: K,
    value: SessionSnapshot[K] | ((previous: SessionSnapshot[K]) => SessionSnapshot[K]),
  ): void {
    const previous = this.snapshot[key];
    const next = resolveNext(value, previous);
    if (Object.is(previous, next)) return;

    this.snapshot = {
      ...this.snapshot,
      [key]: next,
    };
    this.emitChange();
  }

  public emitChange(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
