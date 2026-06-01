import type { MutableRef } from "src/cs/base/common/ref";
import type {
  PreviewFile,
  PreviewRowsRequest,
  ProcessedEntry,
  RawDataEntry,
} from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import type {
  IonIoffManualTargetsByFileId,
  IonIoffMethod,
  PreviewStatus,
  SessionContextValue,
  SsManualRanges,
  SsMethod,
  StateSetter,
  TemplateConfig,
  TemplateMode,
} from "src/cs/workbench/contrib/session/analysis-session-context";

type SessionSnapshot = {
  readonly rawData: RawDataEntry[];
  readonly selectedPreviewFileId: string | null;
  readonly processedData: ProcessedEntry[];
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

const createRef = <T,>(current: T): MutableRef<T> => ({ current });

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
  fileNameMatchCaseSensitive: false,
  bottomTitle: "",
  leftTitle: "",
  legendPrefix: "",
  fileNameVgKeywords: "",
  fileNameVdKeywords: "",
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
    rawData: [],
    selectedPreviewFileId: null,
    processedData: [],
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

  readonly setRawData: StateSetter<RawDataEntry[]> = (value) =>
    this.update("rawData", value);
  readonly setSelectedPreviewFileId: StateSetter<string | null> = (value) =>
    this.update("selectedPreviewFileId", value);
  readonly setProcessedData: StateSetter<ProcessedEntry[]> = (value) =>
    this.update("processedData", value);
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
      setRawData: this.setRawData,
      setSelectedPreviewFileId: this.setSelectedPreviewFileId,
      setProcessedData: this.setProcessedData,
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
