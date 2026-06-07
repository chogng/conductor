// Browser implementation of the session data table. This is the only mutable
// owner for imported files, calculated curves, and metadata in the workbench.
// Keep metadata updates here so chart, calculation, parameters, and export read
// one session snapshot instead of synchronizing through a second service.
import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type {
  AnalysisResultsByFileId,
  CleanedEntry,
  CleanedSeries,
  PreviewFile,
  PreviewRowsRequest,
  SessionFile,
} from "src/cs/workbench/contrib/session/common/sessionTypes";
import type { CalculatedDataByKey } from "src/cs/workbench/contrib/calculation/common/calculatedData";
import type { TemplateSelectionsByFileId } from "src/cs/workbench/contrib/template/common/templateSelection";
import {
  createEmptyMetadataState,
  getCurveKey,
  type CurveData,
  type CurveKey,
  type CurveViewState,
  type FileMetadata,
  type FileMetadataUpdate,
  type MetadataState,
} from "src/cs/workbench/services/metadata/common/metadata";
import {
  ISessionService,
  type IonIoffManualTargetsByFileId,
  type IonIoffMethod,
  type MutableState,
  type PreviewStatus,
  type SessionContextValue,
  type SessionSnapshot,
  type SsManualRanges,
  type SsMethod,
  type StateSetter,
  type TemplateConfig,
  type TemplateMode,
  type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";

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

export class SessionService extends Disposable implements ISessionServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeSessionEmitter = this._register(new Emitter<void>());
  public readonly onDidChangeSession = this.onDidChangeSessionEmitter.event;

  private snapshot: SessionSnapshot = {
    sourceFiles: [],
    selectedPreviewFileId: null,
    selectedPreviewSheetId: null,
    cleanedData: [],
    calculatedDataByKey: {},
    metadata: createEmptyMetadataState(),
    analysisResults: {},
    templateMode: "select",
    selectedTemplateId: null,
    fileTemplateSelectionsByFileId: {},
    templateConfig: createTemplateConfig(),
    previewFile: null,
    previewStatus: createPreviewStatus(),
    ionIoffMethod: "auto",
    ionIoffManualTargetsByFileId: {},
    ssMethod: "auto",
    ssShowFitLine: true,
    ssManualRanges: {},
  };

  private batchDepth = 0;
  private hasPendingChange = false;

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
  readonly setFileTemplateSelectionsByFileId: StateSetter<TemplateSelectionsByFileId> =
    (value) => this.update("fileTemplateSelectionsByFileId", value);
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
  readonly setSsShowFitLine: StateSetter<boolean> = (value) =>
    this.update("ssShowFitLine", value);
  readonly setSsManualRanges: StateSetter<SsManualRanges> = (value) =>
    this.update("ssManualRanges", value);

  public subscribe = (listener: () => void): (() => void) => {
    const disposable = this.onDidChangeSession(listener);
    return () => disposable.dispose();
  };

  public getSnapshot = (): SessionSnapshot => {
    return this.snapshot;
  };

  public batch = (callback: () => void): void => {
    this.batchDepth += 1;
    try {
      callback();
    } finally {
      this.batchDepth -= 1;
      if (this.batchDepth === 0 && this.hasPendingChange) {
        this.hasPendingChange = false;
        this.emitChange();
      }
    }
  };

  public createContextValue(snapshot: SessionSnapshot): SessionContextValue {
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
      setFileTemplateSelectionsByFileId: this.setFileTemplateSelectionsByFileId,
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
      setSsShowFitLine: this.setSsShowFitLine,
      setSsManualRanges: this.setSsManualRanges,
    };
  }

  public getFileMetadata(fileId: string): FileMetadata | undefined {
    return this.snapshot.metadata.filesById[normalizeId(fileId)];
  }

  public setFileMetadata(metadata: FileMetadata): void {
    const normalized = normalizeFileMetadata(metadata);
    if (!normalized) {
      return;
    }

    const current = this.snapshot.metadata.filesById[normalized.fileId];
    if (isSameFileMetadata(current, normalized)) {
      return;
    }

    this.updateMetadata({
      ...this.snapshot.metadata,
      filesById: {
        ...this.snapshot.metadata.filesById,
        [normalized.fileId]: normalized,
      },
    });
  }

  public updateFileMetadata(fileId: string, updates: FileMetadataUpdate): void {
    const normalizedFileId = normalizeId(fileId);
    if (!normalizedFileId) {
      return;
    }

    const current = this.snapshot.metadata.filesById[normalizedFileId];
    if (!current) {
      return;
    }

    this.setFileMetadata({
      ...current,
      ...updates,
      fileId: current.fileId,
      x: {
        ...current.x,
        ...updates.x,
      },
      y: {
        ...current.y,
        ...updates.y,
      },
    });
  }

  public getCurveData(key: CurveKey): CurveData | undefined {
    const normalizedKey = normalizeKey(key);
    return normalizedKey
      ? this.snapshot.metadata.curvesByKey[getCurveKey(normalizedKey)]
      : undefined;
  }

  public setCurveData(data: CurveData): void {
    const normalized = normalizeData(data);
    if (!normalized) {
      return;
    }

    const id = getCurveKey(normalized);
    const current = this.snapshot.metadata.curvesByKey[id];
    if (isSameData(current, normalized)) {
      return;
    }

    this.updateMetadata({
      ...this.snapshot.metadata,
      curvesByKey: {
        ...this.snapshot.metadata.curvesByKey,
        [id]: normalized,
      },
    });
  }

  public getCurveViewState(key: CurveKey): CurveViewState {
    const normalizedKey = normalizeKey(key);
    return normalizedKey
      ? this.snapshot.metadata.curveViewStateByKey[getCurveKey(normalizedKey)] ?? {}
      : {};
  }

  public updateCurveViewState(key: CurveKey, updates: CurveViewState): void {
    const normalizedKey = normalizeKey(key);
    if (!normalizedKey) {
      return;
    }

    const id = getCurveKey(normalizedKey);
    const current = this.snapshot.metadata.curveViewStateByKey[id] ?? {};
    const next: CurveViewState = {
      ...current,
      ...updates,
    };
    if (isSameViewState(current, next)) {
      return;
    }

    this.updateMetadata({
      ...this.snapshot.metadata,
      curveViewStateByKey: {
        ...this.snapshot.metadata.curveViewStateByKey,
        [id]: next,
      },
    });
  }

  public getSeriesLabel(fileId: string, seriesId: string): string | undefined {
    const normalizedFileId = normalizeId(fileId);
    const normalizedSeriesId = normalizeId(seriesId);
    if (!normalizedFileId || !normalizedSeriesId) {
      return undefined;
    }

    return this.snapshot.metadata.seriesLabelsByFileId[normalizedFileId]?.[normalizedSeriesId];
  }

  public getSeriesLabels(fileId: string): Readonly<Record<string, string>> {
    const normalizedFileId = normalizeId(fileId);
    return normalizedFileId
      ? this.snapshot.metadata.seriesLabelsByFileId[normalizedFileId] ?? {}
      : {};
  }

  public setSeriesLabel(fileId: string, seriesId: string, label: string | null): void {
    const normalizedFileId = normalizeId(fileId);
    const normalizedSeriesId = normalizeId(seriesId);
    if (!normalizedFileId || !normalizedSeriesId) {
      return;
    }

    const normalizedLabel = normalizeOptionalText(label) ?? "";
    const current = this.snapshot.metadata.seriesLabelsByFileId[normalizedFileId] ?? {};
    if ((current[normalizedSeriesId] ?? "") === normalizedLabel) {
      return;
    }

    const nextLabels = { ...current };
    if (normalizedLabel) {
      nextLabels[normalizedSeriesId] = normalizedLabel;
    } else {
      delete nextLabels[normalizedSeriesId];
    }

    const seriesLabelsByFileId = { ...this.snapshot.metadata.seriesLabelsByFileId };
    if (Object.keys(nextLabels).length) {
      seriesLabelsByFileId[normalizedFileId] = nextLabels;
    } else {
      delete seriesLabelsByFileId[normalizedFileId];
    }

    this.updateMetadata({
      ...this.snapshot.metadata,
      seriesLabelsByFileId,
    });
  }

  public resolveSeriesLabel(
    file: CleanedEntry | null | undefined,
    series: CleanedSeries | null | undefined,
    index: number,
  ): string {
    const override = this.getSeriesLabel(
      normalizeId(file?.fileId),
      normalizeId(series?.id),
    );
    if (override) {
      return override;
    }

    const legendValue = normalizeOptionalText(series?.legendValue);
    if (legendValue) {
      return legendValue;
    }

    const name = normalizeOptionalText(series?.name);
    return name ?? `Series ${index + 1}`;
  }

  public pruneSeriesLabels(files: readonly CleanedEntry[]): void {
    const liveFileIds = new Set(
      files
        .map((file) => normalizeId(file.fileId))
        .filter((fileId): fileId is string => Boolean(fileId)),
    );
    const liveSeriesIdsByFileId = new Map<string, Set<string>>();
    for (const file of files) {
      const fileId = normalizeId(file.fileId);
      if (!fileId) {
        continue;
      }

      liveSeriesIdsByFileId.set(fileId, new Set(
        (Array.isArray(file.series) ? file.series : [])
          .map((series) => normalizeId(series.id))
          .filter((seriesId): seriesId is string => Boolean(seriesId)),
      ));
    }

    let changed = false;
    const nextSeriesLabelsByFileId: Record<string, Record<string, string>> = {};
    for (const [fileId, labels] of Object.entries(this.snapshot.metadata.seriesLabelsByFileId)) {
      if (!liveFileIds.has(fileId)) {
        changed = true;
        continue;
      }

      const liveSeriesIds = liveSeriesIdsByFileId.get(fileId) ?? new Set<string>();
      const nextLabels = filterRecord(labels, (seriesId) => liveSeriesIds.has(seriesId));
      changed ||= nextLabels !== labels;
      if (Object.keys(nextLabels).length) {
        nextSeriesLabelsByFileId[fileId] = nextLabels;
      } else {
        changed = true;
      }
    }

    if (!changed) {
      return;
    }

    this.updateMetadata({
      ...this.snapshot.metadata,
      seriesLabelsByFileId: nextSeriesLabelsByFileId,
    });
  }

  public clearCurve(key: CurveKey): void {
    const normalizedKey = normalizeKey(key);
    if (!normalizedKey) {
      return;
    }

    const id = getCurveKey(normalizedKey);
    if (
      !this.snapshot.metadata.curvesByKey[id] &&
      !this.snapshot.metadata.curveViewStateByKey[id]
    ) {
      return;
    }

    const curvesByKey = { ...this.snapshot.metadata.curvesByKey };
    const curveViewStateByKey = { ...this.snapshot.metadata.curveViewStateByKey };
    delete curvesByKey[id];
    delete curveViewStateByKey[id];
    this.updateMetadata({
      ...this.snapshot.metadata,
      curveViewStateByKey,
      curvesByKey,
    });
  }

  public pruneMetadata(fileIds: readonly string[], curveKeys: readonly CurveKey[]): void {
    const liveFileIds = new Set(fileIds.map(normalizeId).filter((fileId): fileId is string => Boolean(fileId)));
    const liveCurveIds = new Set(
      curveKeys
        .map(normalizeKey)
        .filter((key): key is CurveKey => Boolean(key))
        .map(getCurveKey),
    );
    const nextFilesById = filterRecord(this.snapshot.metadata.filesById, (fileId) => liveFileIds.has(fileId));
    const nextCurvesByKey = filterRecord(this.snapshot.metadata.curvesByKey, (key, curve) =>
      liveFileIds.has(curve.fileId) && liveCurveIds.has(key)
    );
    const nextCurveViewStateByKey = filterRecord(this.snapshot.metadata.curveViewStateByKey, (key) =>
      liveCurveIds.has(key)
    );
    const nextSeriesLabelsByFileId = filterRecord(this.snapshot.metadata.seriesLabelsByFileId, (fileId) =>
      liveFileIds.has(fileId)
    );

    if (
      nextFilesById === this.snapshot.metadata.filesById &&
      nextCurvesByKey === this.snapshot.metadata.curvesByKey &&
      nextCurveViewStateByKey === this.snapshot.metadata.curveViewStateByKey &&
      nextSeriesLabelsByFileId === this.snapshot.metadata.seriesLabelsByFileId
    ) {
      return;
    }

    this.updateMetadata({
      curveViewStateByKey: nextCurveViewStateByKey,
      curvesByKey: nextCurvesByKey,
      filesById: nextFilesById,
      seriesLabelsByFileId: nextSeriesLabelsByFileId,
    });
  }

  private updateMetadata(metadata: MetadataState): void {
    this.update("metadata", metadata);
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
    if (this.batchDepth > 0) {
      this.hasPendingChange = true;
      return;
    }

    this.emitChange();
  }

  public emitChange = (): void => {
    this.onDidChangeSessionEmitter.fire();
  };
}

const normalizeFileMetadata = (metadata: FileMetadata): FileMetadata | null => {
  const fileId = normalizeId(metadata.fileId);
  if (!fileId) {
    return null;
  }

  return {
    ...metadata,
    fileId,
    kind: normalizeOptionalText(metadata.kind) ?? "unknown",
    sourceFileName: normalizeOptionalText(metadata.sourceFileName),
    templateId: normalizeOptionalText(metadata.templateId),
    x: normalizeAxisMetadata(metadata.x),
    y: {
      ...normalizeAxisMetadata(metadata.y),
      scale: metadata.y.scale === "log" ? "log" : "linear",
    },
  };
};

const normalizeData = (data: CurveData): CurveData | null => {
  const key = normalizeKey(data);
  if (!key) {
    return null;
  }

  return {
    ...data,
    ...key,
    points: data.points.filter((point) =>
      Number.isFinite(Number(point.x)) &&
      Number.isFinite(Number(point.y)),
    ),
    signature: normalizeOptionalText(data.signature),
  };
};

const normalizeAxisMetadata = (metadata: { readonly label?: string; readonly role?: string; readonly unit?: string }): {
  readonly label?: string;
  readonly role?: string;
  readonly unit?: string;
} => {
  const label = normalizeOptionalText(metadata.label);
  const role = normalizeOptionalText(metadata.role);
  const unit = normalizeOptionalText(metadata.unit);
  return {
    ...(label ? { label } : {}),
    ...(role ? { role } : {}),
    ...(unit ? { unit } : {}),
  };
};

const normalizeKey = (key: CurveKey): CurveKey | null => {
  const fileId = normalizeId(key.fileId);
  const curveKind = normalizeOptionalText(key.curveKind) ?? "unknown";
  const seriesId = normalizeId(key.seriesId);
  return fileId && seriesId ? { curveKind, fileId, seriesId } : null;
};

const normalizeId = (value: unknown): string => String(value ?? "").trim();

const normalizeOptionalText = (value: unknown): string | undefined => {
  const text = String(value ?? "").trim();
  return text || undefined;
};

const isSameFileMetadata = (
  current: FileMetadata | undefined,
  next: FileMetadata,
): boolean =>
  Boolean(current) &&
  current?.kind === next.kind &&
  current?.sourceFileName === next.sourceFileName &&
  current?.templateId === next.templateId &&
  current?.x.label === next.x.label &&
  current?.x.role === next.x.role &&
  current?.x.unit === next.x.unit &&
  current?.y.label === next.y.label &&
  current?.y.role === next.y.role &&
  current?.y.scale === next.y.scale &&
  current?.y.unit === next.y.unit;

const isSameData = (
  current: CurveData | undefined,
  next: CurveData,
): boolean =>
  Boolean(current?.signature) &&
  current?.signature === next.signature;

const isSameViewState = (
  current: CurveViewState,
  next: CurveViewState,
): boolean =>
  current.color === next.color &&
  current.hidden === next.hidden;

const filterRecord = <T,>(
  record: Record<string, T>,
  predicate: (key: string, value: T) => boolean,
  mapValue?: (key: string, value: T) => T,
): Record<string, T> => {
  let changed = false;
  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    if (predicate(key, value)) {
      const nextValue = mapValue ? mapValue(key, value) : value;
      next[key] = nextValue;
      changed ||= nextValue !== value;
    } else {
      changed = true;
    }
  }
  return changed ? next : record;
};

registerSingleton(ISessionService, SessionService, InstantiationType.Delayed);
