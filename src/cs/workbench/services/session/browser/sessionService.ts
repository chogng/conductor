// Browser implementation of the session data table. This is the only mutable
// owner for imported files, calculated curves, and file semantics in the workbench.
// Keep file semantics updates here so chart, calculation, parameters, and export read
// one session snapshot instead of synchronizing through a second service.
import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type {
  ProcessedEntry,
  ProcessedSeries,
  PreviewFile,
  PreviewRowsRequest,
  SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";
import type { CalculatedPlotsByKey } from "src/cs/workbench/contrib/calculation/common/calculatedData";
import type {
  TemplateSelection,
  TemplateSelectionsByFileId,
} from "src/cs/workbench/contrib/template/common/templateSelection";
import {
  type CurveData,
  type CurveKey,
  type CurveKind,
  type CurveViewState,
  type FileSemantics,
  type FileSemanticsUpdate,
} from "src/cs/workbench/services/session/common/fileSemantics";
import {
  createEmptySessionViewState,
  createFileTarget,
  createNoneTarget,
  createSheetTarget,
  getIonIoffMethodFromViewState,
  getSelectedTemplateIdFromViewState,
  getSsMethodFromViewState,
  getSsShowFitLineFromViewState,
  getTemplateFormStateFromViewState,
  getTemplateModeFromViewState,
  getTemplateSelectionsFromViewState,
  isSameSessionTarget,
  type CurveKey as SessionCurveKey,
  type CurveRecord,
  type FileId,
  type FileRecord,
  type MetricInputRecord,
  type MetricKey,
  type SessionTarget,
  type SessionViewState,
  type TableSelection,
  type TemplateSelectionsByFileIdRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
  createCanonicalCurveKeyFromCurveKey,
  createRawFilesFromRecords,
  mergeCurveDataIntoRecords,
  mergeFileSemanticsIntoRecords,
  mergeProcessedFileIntoRecords,
  mergeRawFilesIntoRecords,
  pruneCurveDataRecords,
  removeCurveDataFromRecords,
  replaceCalculatedCurvesInRecords,
  resetProcessedRecords,
} from "src/cs/workbench/services/session/common/sessionModelAdapter";
import {
  ISessionService,
  type IonIoffMethod,
  type CommitProcessedFileOptions,
  type MutableState,
  type PreviewStatus,
  type SessionContextValue,
  type SessionSnapshot,
  type SsMethod,
  type StateSetter,
  type TemplateFormState,
  type TemplateMode,
  type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";

const createRef = <T,>(current: T): MutableState<T> => ({ current });

const createPreviewStatus = (): PreviewStatus => ({
  state: "idle",
  message: "",
});

const normalizePreviewStatus = (status: PreviewStatus): PreviewStatus => ({
  state: status.state === "loading" || status.state === "ready" ? status.state : "idle",
  message: String(status.message ?? ""),
});

const CURVE_KIND_VALUES = new Set<CurveKind>([
  "iv",
  "gm",
  "ss",
  "vth",
  "localSs",
  "thresholdFit",
  "subthresholdFit",
  "secondDerivative",
  "cv",
  "cf",
  "pv",
  "it",
  "transfer",
  "output",
  "unknown",
]);

const normalizeCurveKind = (value: unknown): CurveKind => {
  const text = normalizeOptionalText(value);
  return text && CURVE_KIND_VALUES.has(text as CurveKind)
    ? text as CurveKind
    : "unknown";
};

const isSamePreviewStatus = (
  current: PreviewStatus,
  next: PreviewStatus,
): boolean => current.state === next.state && current.message === next.message;

const isDefaultPreviewStatus = (status: PreviewStatus): boolean =>
  status.state === "idle" && status.message === "";

const resolveNext = <T,>(value: T | ((previous: T) => T), previous: T): T =>
  typeof value === "function"
    ? (value as (previous: T) => T)(previous)
    : value;

type TemplateViewState = NonNullable<SessionViewState["template"]>;
type ParametersViewState = NonNullable<SessionViewState["parameters"]>;

const updateTemplateViewState = (
  viewState: SessionViewState,
  updates: TemplateViewState,
): SessionViewState => ({
  ...viewState,
  template: {
    ...viewState.template,
    ...updates,
  },
});

const updateParametersViewState = (
  viewState: SessionViewState,
  updates: ParametersViewState,
): SessionViewState => ({
  ...viewState,
  parameters: {
    ...viewState.parameters,
    ...updates,
  },
});

const updateTemplateSelectionsInViewState = (
  viewState: SessionViewState,
  selectionsByFileId: TemplateSelectionsByFileIdRecord,
): SessionViewState =>
  updateTemplateViewState(viewState, { selectionsByFileId });

const createDataResetViewState = (
  viewState: SessionViewState,
): SessionViewState => {
  const hasTemplateSelections = Boolean(viewState.template?.selectionsByFileId);
  if (!viewState.table && !viewState.chart && !viewState.curves && !hasTemplateSelections) {
    return viewState;
  }

  const next: SessionViewState = {};
  if (viewState.template) {
    const { selectionsByFileId, ...template } = viewState.template;
    if (Object.keys(template).length > 0) {
      next.template = template;
    }
  }
  if (viewState.parameters && Object.keys(viewState.parameters).length > 0) {
    next.parameters = viewState.parameters;
  }

  return next;
};

const removeTemplateSelectionsFromViewState = (
  viewState: SessionViewState,
  removedFileIds: ReadonlySet<string>,
): SessionViewState => {
  const previous = getTemplateSelectionsFromViewState(viewState);
  const next = filterRecord(previous, (fileId) => !removedFileIds.has(fileId));
  return next === previous
    ? viewState
    : updateTemplateSelectionsInViewState(viewState, next);
};

export class SessionService extends Disposable implements ISessionServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeSessionEmitter = this._register(new Emitter<void>());
  public readonly onDidChangeSession = this.onDidChangeSessionEmitter.event;

  private snapshot: SessionSnapshot = {
    version: 1,
    filesById: {},
    fileOrder: [],
    activeTarget: createNoneTarget(),
    viewState: createEmptySessionViewState(),
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

  readonly setActiveTarget: StateSetter<SessionTarget> = (value) => {
    const next = normalizeSessionTarget(resolveNext(value, this.snapshot.activeTarget));
    this.updateActiveTarget(next);
  };
  readonly setTableSelection: StateSetter<TableSelection | undefined> = (value) => {
    this.setViewState((previous) => {
      const currentSelection = previous.table?.selection;
      const nextSelection = resolveNext(value, currentSelection);
      if (Object.is(currentSelection, nextSelection)) {
        return previous;
      }

      const table = { ...previous.table };
      if (nextSelection) {
        table.selection = nextSelection;
      } else {
        delete table.selection;
      }

      return {
        ...previous,
        table,
      };
    });
  };
  readonly setViewState: StateSetter<SessionViewState> = (value) =>
    this.update("viewState", value);
  readonly setTemplateMode: StateSetter<TemplateMode> = (value) => {
    this.setViewState((previous) => {
      const current = getTemplateModeFromViewState(previous);
      const next = resolveNext(value, current);
      return current === next
        ? previous
        : updateTemplateViewState(previous, { mode: next });
    });
  };
  readonly setSelectedTemplateId: StateSetter<string | null> = (value) => {
    this.setViewState((previous) => {
      const current = getSelectedTemplateIdFromViewState(previous);
      const next = resolveNext(value, current);
      return current === next
        ? previous
        : updateTemplateViewState(previous, { selectedTemplateId: next });
    });
  };
  readonly setFileTemplateSelectionsByFileId: StateSetter<TemplateSelectionsByFileId> =
    (value) => {
      const previous = getTemplateSelectionsFromViewState(this.snapshot.viewState);
      const next = resolveNext(value, previous);
      if (Object.is(previous, next)) {
        return;
      }

      this.replaceSnapshot({
        ...this.snapshot,
        viewState: updateTemplateSelectionsInViewState(this.snapshot.viewState, next),
        filesById: applyTemplateSelectionsToRecords(this.snapshot.filesById, next),
      });
    };
  readonly setTemplateFormState: StateSetter<TemplateFormState> = (value) => {
    this.setViewState((previous) => {
      const current = getTemplateFormStateFromViewState(previous);
      const next = resolveNext(value, current);
      return Object.is(current, next)
        ? previous
        : updateTemplateViewState(previous, { formState: next });
    });
  };
  readonly setPreviewFile: StateSetter<PreviewFile | null> = (value) => {
    this.setViewState((previous) => {
      const current = previous.table?.previewFile ?? null;
      const next = resolveNext(value, current);
      if (Object.is(current, next)) {
        return previous;
      }

      const table = { ...previous.table };
      if (next) {
        table.previewFile = next;
      } else {
        delete table.previewFile;
      }

      return {
        ...previous,
        table,
      };
    });
  };
  readonly setPreviewStatus: StateSetter<PreviewStatus> = (value) => {
    this.setViewState((previous) => {
      const current = previous.table?.previewStatus ?? createPreviewStatus();
      const next = normalizePreviewStatus(resolveNext(value, current));
      if (isSamePreviewStatus(current, next)) {
        return previous;
      }

      const table = { ...previous.table };
      if (isDefaultPreviewStatus(next)) {
        delete table.previewStatus;
      } else {
        table.previewStatus = next;
      }

      return {
        ...previous,
        table,
      };
    });
  };
  readonly setIonIoffMethod: StateSetter<IonIoffMethod> = (value) => {
    this.setViewState((previous) => {
      const current = getIonIoffMethodFromViewState(previous);
      const next = resolveNext(value, current);
      return current === next
        ? previous
        : updateParametersViewState(previous, { ionIoffMethod: next });
    });
  };
  readonly setMetricInput = (input: MetricInputRecord): void => {
    const normalized = normalizeMetricInput(input);
    if (!normalized) {
      return;
    }

    const file = this.snapshot.filesById[normalized.fileId];
    if (!file) {
      return;
    }

    const current = file.metricInputsByKey?.[normalized.metricKey];
    if (isSameMetricInput(current, normalized)) {
      return;
    }

    this.replaceSnapshot({
      ...this.snapshot,
      filesById: {
        ...this.snapshot.filesById,
        [normalized.fileId]: {
          ...file,
          metricInputsByKey: {
            ...file.metricInputsByKey,
            [normalized.metricKey]: normalized,
          },
        },
      },
    });
  };
  readonly clearMetricInput = (fileId: string, metricKey: MetricKey): void => {
    const normalizedFileId = normalizeId(fileId);
    const normalizedMetricKey = normalizeMetricKey(metricKey);
    const file = normalizedFileId ? this.snapshot.filesById[normalizedFileId] : undefined;
    if (!file || !normalizedMetricKey || !file.metricInputsByKey?.[normalizedMetricKey]) {
      return;
    }

    const metricInputsByKey = { ...file.metricInputsByKey };
    delete metricInputsByKey[normalizedMetricKey];
    this.replaceSnapshot({
      ...this.snapshot,
      filesById: {
        ...this.snapshot.filesById,
        [normalizedFileId]: {
          ...file,
          metricInputsByKey: Object.keys(metricInputsByKey).length
            ? metricInputsByKey
            : undefined,
        },
      },
    });
  };
  readonly setSsMethod: StateSetter<SsMethod> = (value) => {
    this.setViewState((previous) => {
      const current = getSsMethodFromViewState(previous);
      const next = resolveNext(value, current);
      return current === next
        ? previous
        : updateParametersViewState(previous, { ssMethod: next });
    });
  };
  readonly setSsShowFitLine: StateSetter<boolean> = (value) => {
    this.setViewState((previous) => {
      const current = getSsShowFitLineFromViewState(previous);
      const next = resolveNext(value, current);
      return current === next
        ? previous
        : updateParametersViewState(previous, { ssShowFitLine: next });
    });
  };

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
      version: snapshot.version,
      filesById: snapshot.filesById,
      fileOrder: snapshot.fileOrder,
      activeTarget: snapshot.activeTarget,
      viewState: snapshot.viewState,
      setActiveTarget: this.setActiveTarget,
      setTableSelection: this.setTableSelection,
      setViewState: this.setViewState,
      addRawFiles: this.addRawFiles,
      replaceRawFiles: this.replaceRawFiles,
      removeFiles: this.removeFiles,
      clearSessionData: this.clearSessionData,
      replaceCalculatedCurves: this.replaceCalculatedCurves,
      commitProcessedFile: this.commitProcessedFile,
      resetProcessedData: this.resetProcessedData,
      setTemplateMode: this.setTemplateMode,
      setSelectedTemplateId: this.setSelectedTemplateId,
      setFileTemplateSelectionsByFileId: this.setFileTemplateSelectionsByFileId,
      setTemplateFormState: this.setTemplateFormState,
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
      setSsMethod: this.setSsMethod,
      setSsShowFitLine: this.setSsShowFitLine,
    };
  }

  public addRawFiles = (files: readonly SessionFile[]): void => {
    const nextFiles = normalizeSessionFiles(files);
    if (!nextFiles.length) {
      return;
    }

    const nextRecords = mergeRawFilesIntoRecords(
      this.snapshot.filesById,
      this.snapshot.fileOrder,
      nextFiles,
    );
    this.replaceSnapshot({
      ...this.snapshot,
      ...nextRecords,
    });
  };

  public replaceRawFiles = (files: readonly SessionFile[]): void => {
    const nextRecords = mergeRawFilesIntoRecords({}, [], normalizeSessionFiles(files));
    this.replaceSnapshot({
      ...this.snapshot,
      ...nextRecords,
      activeTarget: createNoneTarget(),
      viewState: createDataResetViewState(this.snapshot.viewState),
    });
  };

  public removeFiles = (fileIds: readonly string[]): void => {
    const removedFileIds = normalizeFileIdSet(fileIds);
    if (!removedFileIds.size) {
      return;
    }

    const nextFilesById = filterRecord(
      this.snapshot.filesById,
      (fileId) => !removedFileIds.has(fileId),
    );
    const nextFileOrder = this.snapshot.fileOrder.filter((fileId) =>
      !removedFileIds.has(fileId)
    );
    const nextViewState = removeTemplateSelectionsFromViewState(
      this.snapshot.viewState,
      removedFileIds,
    );
    const nextActiveTarget = shouldClearActiveTarget(
      this.snapshot.activeTarget,
      removedFileIds,
    )
      ? createNoneTarget()
      : this.snapshot.activeTarget;

    if (
      nextFilesById === this.snapshot.filesById &&
      nextFileOrder === this.snapshot.fileOrder &&
      nextViewState === this.snapshot.viewState &&
      nextActiveTarget === this.snapshot.activeTarget
    ) {
      return;
    }

    this.replaceSnapshot({
      ...this.snapshot,
      filesById: nextFilesById,
      fileOrder: nextFileOrder,
      activeTarget: nextActiveTarget,
      viewState: nextViewState,
    });
  };

  public clearSessionData = (): void => {
    const nextViewState = createDataResetViewState(this.snapshot.viewState);
    if (
      Object.keys(this.snapshot.filesById).length === 0 &&
      this.snapshot.fileOrder.length === 0 &&
      isSameSessionTarget(this.snapshot.activeTarget, createNoneTarget()) &&
      nextViewState === this.snapshot.viewState
    ) {
      return;
    }

    this.replaceSnapshot({
      ...this.snapshot,
      filesById: {},
      fileOrder: [],
      activeTarget: createNoneTarget(),
      viewState: nextViewState,
    });
  };

  public replaceCalculatedCurves = (
    plotsByKey: CalculatedPlotsByKey,
  ): void => {
    const nextRecords = replaceCalculatedCurvesInRecords(
      this.snapshot.filesById,
      this.snapshot.fileOrder,
      plotsByKey,
    );
    this.replaceSnapshot({
      ...this.snapshot,
      ...nextRecords,
    });
  };

  public resetProcessedData = (): void => {
    if (
      this.snapshot.fileOrder.every((fileId) => {
        const file = this.snapshot.filesById[fileId];
        return !file ||
          file.seriesOrder.length === 0 &&
            Object.keys(file.curvesByKey).every((key) =>
              file.curvesByKey[key as SessionCurveKey]?.curveGeneration !== "base"
            ) &&
            Object.keys(file.metricsByKey).length === 0 &&
            !file.calculationCache &&
            !file.templateRun;
      })
    ) {
      return;
    }

    const nextRecords = resetProcessedRecords(
      this.snapshot.filesById,
      this.snapshot.fileOrder,
    );
    this.replaceSnapshot({
      ...this.snapshot,
      ...nextRecords,
    });
  };

  public commitProcessedFile = (
    file: ProcessedEntry | null | undefined,
    options: CommitProcessedFileOptions = {},
  ): void => {
    if (!file || typeof file !== "object") {
      return;
    }

    const normalizedFileId = normalizeId(file.fileId);
    if (!normalizedFileId) {
      return;
    }

    const nextRecords = mergeProcessedFileIntoRecords(
      this.snapshot.filesById,
      this.snapshot.fileOrder,
      file,
      this.snapshot,
      options,
    );
    this.replaceSnapshot({
      ...this.snapshot,
      ...nextRecords,
    });
  };

  public getFileSemantics(fileId: string): FileSemantics | undefined {
    const normalizedFileId = normalizeId(fileId);
    if (!normalizedFileId) {
      return undefined;
    }

    const record = this.snapshot.filesById[normalizedFileId];
    return record ? createFileSemanticsFromRecord(record) : undefined;
  }

  public setFileSemantics(semantics: FileSemantics): void {
    const normalized = normalizeFileSemantics(semantics);
    if (!normalized) {
      return;
    }

    const current = this.getFileSemantics(normalized.fileId);
    if (isSameFileSemantics(current, normalized)) {
      return;
    }

    const nextRecords = mergeFileSemanticsIntoRecords(
      this.snapshot.filesById,
      this.snapshot.fileOrder,
      normalized,
    );
    this.replaceSnapshot({
      ...this.snapshot,
      ...nextRecords,
    });
  }

  public updateFileSemantics(fileId: string, updates: FileSemanticsUpdate): void {
    const normalizedFileId = normalizeId(fileId);
    if (!normalizedFileId) {
      return;
    }

    const current = this.getFileSemantics(normalizedFileId);
    if (!current) {
      return;
    }

    this.setFileSemantics({
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
    if (!normalizedKey) {
      return undefined;
    }

    const canonicalKey = createCanonicalCurveKeyFromCurveKey(normalizedKey);
    const record = canonicalKey
      ? this.snapshot.filesById[normalizedKey.fileId]?.curvesByKey[canonicalKey]
      : undefined;
    return record ? createCurveDataFromRecord(normalizedKey, record) : undefined;
  }

  public setCurveData(data: CurveData): void {
    const normalized = normalizeData(data);
    if (!normalized) {
      return;
    }

    const current = this.getCurveData(normalized);
    if (isSameData(current, normalized)) {
      return;
    }

    const nextRecords = mergeCurveDataIntoRecords(
      this.snapshot.filesById,
      this.snapshot.fileOrder,
      normalized,
    );
    this.replaceSnapshot({
      ...this.snapshot,
      ...nextRecords,
    });
  }

  public getCurveViewState(key: CurveKey): CurveViewState {
    const normalizedKey = normalizeKey(key);
    if (!normalizedKey) {
      return {};
    }

    const canonicalKey = createCanonicalCurveKeyFromCurveKey(normalizedKey);
    if (canonicalKey) {
      const viewState = this.snapshot.viewState.curves?.[canonicalKey];
      if (viewState) {
        return viewState;
      }
    }

    return {};
  }

  public updateCurveViewState(key: CurveKey, updates: CurveViewState): void {
    const normalizedKey = normalizeKey(key);
    if (!normalizedKey) {
      return;
    }

    const current = this.getCurveViewState(normalizedKey);
    const next: CurveViewState = {
      ...current,
      ...updates,
    };
    if (isSameViewState(current, next)) {
      return;
    }

    const canonicalKey = createCanonicalCurveKeyFromCurveKey(normalizedKey);
    if (!canonicalKey) {
      return;
    }

    const nextViewState = canonicalKey
      ? {
          ...this.snapshot.viewState,
          curves: {
            ...this.snapshot.viewState.curves,
            [canonicalKey]: next,
          },
        }
      : this.snapshot.viewState;

    this.replaceSnapshot({
      ...this.snapshot,
      viewState: nextViewState,
    });
  }

  public getSeriesLabel(fileId: string, seriesId: string): string | undefined {
    const normalizedFileId = normalizeId(fileId);
    const normalizedSeriesId = normalizeId(seriesId);
    if (!normalizedFileId || !normalizedSeriesId) {
      return undefined;
    }

    return this.snapshot.filesById[normalizedFileId]
      ?.seriesById[normalizedSeriesId]
      ?.labelOverride;
  }

  public getSeriesLabels(fileId: string): Readonly<Record<string, string>> {
    const normalizedFileId = normalizeId(fileId);
    if (!normalizedFileId) {
      return {};
    }

    const labels: Record<string, string> = {};
    const file = this.snapshot.filesById[normalizedFileId];
    for (const [seriesId, series] of Object.entries(file?.seriesById ?? {})) {
      const label = normalizeOptionalText(series.labelOverride);
      if (label) {
        labels[seriesId] = label;
      }
    }
    return labels;
  }

  public setSeriesLabel(fileId: string, seriesId: string, label: string | null): void {
    const normalizedFileId = normalizeId(fileId);
    const normalizedSeriesId = normalizeId(seriesId);
    if (!normalizedFileId || !normalizedSeriesId) {
      return;
    }

    const normalizedLabel = normalizeOptionalText(label) ?? "";
    if ((this.getSeriesLabel(normalizedFileId, normalizedSeriesId) ?? "") === normalizedLabel) {
      return;
    }

    const nextFilesById = setSeriesLabelInRecords(
      this.snapshot.filesById,
      normalizedFileId,
      normalizedSeriesId,
      normalizedLabel,
    );
    if (nextFilesById === this.snapshot.filesById) {
      return;
    }

    this.replaceSnapshot({
      ...this.snapshot,
      filesById: nextFilesById,
    });
  }

  public resolveSeriesLabel(
    file: ProcessedEntry | null | undefined,
    series: ProcessedSeries | null | undefined,
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

  public pruneSeriesLabels(files: readonly ProcessedEntry[]): void {
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

    this.pruneSeriesLabelsByLiveSets(liveFileIds, liveSeriesIdsByFileId);
  }

  public pruneSeriesLabelsByRecords(
    filesById: Readonly<Record<FileId, FileRecord>>,
    fileOrder: readonly FileId[],
  ): void {
    const liveFileIds = new Set<string>();
    const liveSeriesIdsByFileId = new Map<string, Set<string>>();
    const seenFileIds = new Set<string>();
    const collectFile = (fileId: FileId): void => {
      const normalizedFileId = normalizeId(fileId);
      if (!normalizedFileId || seenFileIds.has(normalizedFileId)) {
        return;
      }
      seenFileIds.add(normalizedFileId);

      const file = filesById[normalizedFileId];
      if (!file) {
        return;
      }

      liveFileIds.add(normalizedFileId);
      liveSeriesIdsByFileId.set(normalizedFileId, new Set(
        file.seriesOrder
          .map((seriesId) => normalizeId(seriesId))
          .filter((seriesId): seriesId is string => Boolean(seriesId)),
      ));
    };

    for (const fileId of fileOrder) {
      collectFile(fileId);
    }
    for (const fileId of Object.keys(filesById)) {
      collectFile(fileId);
    }

    this.pruneSeriesLabelsByLiveSets(liveFileIds, liveSeriesIdsByFileId);
  }

  private pruneSeriesLabelsByLiveSets(
    liveFileIds: ReadonlySet<string>,
    liveSeriesIdsByFileId: ReadonlyMap<string, ReadonlySet<string>>,
  ): void {
    const nextFilesById = pruneSeriesLabelRecords(
      this.snapshot.filesById,
      liveFileIds,
      liveSeriesIdsByFileId,
    );
    if (nextFilesById === this.snapshot.filesById) {
      return;
    }

    this.replaceSnapshot({
      ...this.snapshot,
      filesById: nextFilesById,
    });
  }

  public clearCurve(key: CurveKey): void {
    const normalizedKey = normalizeKey(key);
    if (!normalizedKey) {
      return;
    }

    const canonicalKey = createCanonicalCurveKeyFromCurveKey(normalizedKey);
    const canonicalCurve = canonicalKey
      ? this.snapshot.filesById[normalizedKey.fileId]?.curvesByKey[canonicalKey]
      : undefined;
    const canonicalViewState = canonicalKey
      ? this.snapshot.viewState.curves?.[canonicalKey]
      : undefined;
    if (
      !canonicalCurve &&
      !canonicalViewState
    ) {
      return;
    }

    const nextRecords = removeCurveDataFromRecords(
      this.snapshot.filesById,
      this.snapshot.fileOrder,
      normalizedKey,
    );
    const nextViewCurves = canonicalKey
      ? { ...this.snapshot.viewState.curves }
      : this.snapshot.viewState.curves;
    if (canonicalKey && nextViewCurves) {
      delete nextViewCurves[canonicalKey];
    }

    this.replaceSnapshot({
      ...this.snapshot,
      ...nextRecords,
      viewState: canonicalKey
        ? {
            ...this.snapshot.viewState,
            curves: nextViewCurves,
          }
        : this.snapshot.viewState,
    });
  }

  public pruneFileSemantics(fileIds: readonly string[], curveKeys: readonly CurveKey[]): void {
    const liveFileIds = new Set(fileIds.map(normalizeId).filter((fileId): fileId is string => Boolean(fileId)));
    const liveCurveIds = new Set(
      curveKeys
        .map(normalizeKey)
        .filter((key): key is CurveKey => Boolean(key))
        .map(createCanonicalCurveKeyFromCurveKey)
        .filter((key): key is SessionCurveKey => Boolean(key)),
    );
    const curveRecords = pruneCurveDataRecords(
      this.snapshot.filesById,
      this.snapshot.fileOrder,
      liveFileIds,
      liveCurveIds,
    );
    const nextCanonicalFilesById = pruneSemanticsOnlyRecords(
      curveRecords.filesById,
      liveFileIds,
    );
    const nextViewState = pruneCurveViewState(
      this.snapshot.viewState,
      liveCurveIds,
    );

    if (
      nextCanonicalFilesById === this.snapshot.filesById &&
      nextViewState === this.snapshot.viewState
    ) {
      return;
    }

    this.replaceSnapshot({
      ...this.snapshot,
      filesById: nextCanonicalFilesById,
      fileOrder: this.snapshot.fileOrder.filter((fileId) => nextCanonicalFilesById[fileId]),
      viewState: nextViewState,
    });
  }

  private updateActiveTarget(activeTarget: SessionTarget): void {
    if (isSameSessionTarget(this.snapshot.activeTarget, activeTarget)) {
      return;
    }

    this.replaceSnapshot({
      ...this.snapshot,
      activeTarget,
    });
  }

  private update<K extends keyof SessionSnapshot>(
    key: K,
    value: SessionSnapshot[K] | ((previous: SessionSnapshot[K]) => SessionSnapshot[K]),
  ): void {
    const previous = this.snapshot[key];
    const next = resolveNext(value, previous);
    if (Object.is(previous, next)) return;

    this.replaceSnapshot({
      ...this.snapshot,
      [key]: next,
    });
  }

  private replaceSnapshot(snapshot: SessionSnapshot): void {
    this.snapshot = snapshot;
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

const normalizeFileSemantics = (semantics: FileSemantics): FileSemantics | null => {
  const fileId = normalizeId(semantics.fileId);
  if (!fileId) {
    return null;
  }

  return {
    ...semantics,
    fileId,
    kind: normalizeCurveKind(semantics.kind),
    sourceFileName: normalizeOptionalText(semantics.sourceFileName),
    templateId: normalizeOptionalText(semantics.templateId),
    x: normalizeAxisSemantics(semantics.x),
    y: {
      ...normalizeAxisSemantics(semantics.y),
      scale: semantics.y.scale === "log" ? "log" : "linear",
    },
  };
};

const normalizeSessionFiles = (
  files: readonly SessionFile[],
): SessionFile[] =>
  (Array.isArray(files) ? files : [])
    .filter((file): file is SessionFile =>
      Boolean(file) &&
      typeof file === "object" &&
      normalizeId(file.fileId).length > 0
    );

const normalizeFileIdSet = (fileIds: readonly string[]): Set<string> =>
  new Set(
    (Array.isArray(fileIds) ? fileIds : [])
      .map(normalizeId)
      .filter((fileId) => fileId.length > 0),
  );

const shouldClearActiveTarget = (
  target: SessionTarget,
  removedFileIds: ReadonlySet<string>,
): boolean => target.kind !== "none" && removedFileIds.has(target.fileId);

const normalizeMetricInput = (
  input: MetricInputRecord,
): MetricInputRecord | null => {
  const fileId = normalizeId(input.fileId);
  const seriesId = normalizeId(input.seriesId);
  const metricKey = normalizeMetricKey(input.metricKey);
  const source = input.source === "auto" || input.source === "manual"
    ? input.source
    : null;
  if (!fileId || !seriesId || !metricKey || !source) {
    return null;
  }

  const range = normalizeMetricInputRange(input.range);
  const targets = normalizeMetricInputTargets(input.targets);
  const configSignature = normalizeOptionalText(input.configSignature);
  return {
    metricKey,
    fileId,
    seriesId,
    source,
    ...(range ? { range } : {}),
    ...(targets ? { targets } : {}),
    ...(configSignature ? { configSignature } : {}),
  };
};

const normalizeMetricKey = (value: unknown): MetricKey | null => {
  const key = normalizeId(value);
  return key ? key as MetricKey : null;
};

const normalizeMetricInputRange = (
  range: MetricInputRecord["range"],
): MetricInputRecord["range"] | undefined =>
  range
    ? {
        x1: parseMetricInputNumber(range.x1),
        x2: parseMetricInputNumber(range.x2),
      }
    : undefined;

const normalizeMetricInputTargets = (
  targets: MetricInputRecord["targets"],
): MetricInputRecord["targets"] | undefined => {
  if (!targets) {
    return undefined;
  }

  const normalized: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(targets)) {
    const normalizedKey = normalizeId(key);
    if (normalizedKey) {
      normalized[normalizedKey] = parseMetricInputNumber(value);
    }
  }
  return Object.keys(normalized).length ? normalized : undefined;
};

const parseMetricInputNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const isSameMetricInput = (
  current: MetricInputRecord | undefined,
  next: MetricInputRecord,
): boolean =>
  Boolean(current) &&
  current?.metricKey === next.metricKey &&
  current?.fileId === next.fileId &&
  current?.seriesId === next.seriesId &&
  current?.source === next.source &&
  current?.configSignature === next.configSignature &&
  current?.range?.x1 === next.range?.x1 &&
  current?.range?.x2 === next.range?.x2 &&
  isSameNumberRecord(current?.targets, next.targets);

const isSameNumberRecord = (
  current: Record<string, number | null> | undefined,
  next: Record<string, number | null> | undefined,
): boolean => {
  const currentKeys = Object.keys(current ?? {});
  const nextKeys = Object.keys(next ?? {});
  if (currentKeys.length !== nextKeys.length) {
    return false;
  }

  return nextKeys.every((key) => current?.[key] === next?.[key]);
};

const setSeriesLabelInRecords = (
  filesById: Readonly<Record<FileId, FileRecord>>,
  fileId: string,
  seriesId: string,
  label: string,
): Record<FileId, FileRecord> => {
  const file = filesById[fileId];
  const series = file?.seriesById[seriesId];
  if (!file || !series) {
    return filesById as Record<FileId, FileRecord>;
  }

  if ((series.labelOverride ?? "") === label) {
    return filesById as Record<FileId, FileRecord>;
  }

  const nextSeries = label
    ? { ...series, labelOverride: label }
    : { ...series, labelOverride: undefined };
  return {
    ...filesById,
    [fileId]: {
      ...file,
      seriesById: {
        ...file.seriesById,
        [seriesId]: nextSeries,
      },
    },
  };
};

const pruneSeriesLabelRecords = (
  filesById: Readonly<Record<FileId, FileRecord>>,
  liveFileIds: ReadonlySet<string>,
  liveSeriesIdsByFileId: ReadonlyMap<string, ReadonlySet<string>>,
): Record<FileId, FileRecord> => {
  let changed = false;
  const nextFilesById: Record<FileId, FileRecord> = {};
  for (const [fileId, file] of Object.entries(filesById)) {
    const liveSeriesIds = liveSeriesIdsByFileId.get(fileId) ?? new Set<string>();
    let fileChanged = false;
    const nextSeriesById = { ...file.seriesById };
    for (const [seriesId, series] of Object.entries(file.seriesById)) {
      if (liveFileIds.has(fileId) && liveSeriesIds.has(seriesId)) {
        continue;
      }

      if (series.labelOverride !== undefined) {
        fileChanged = true;
        nextSeriesById[seriesId] = { ...series, labelOverride: undefined };
      }
    }

    changed ||= fileChanged;
    nextFilesById[fileId] = fileChanged
      ? {
          ...file,
          seriesById: nextSeriesById,
        }
      : file;
  }

  return changed ? nextFilesById : filesById as Record<FileId, FileRecord>;
};

const pruneCurveViewState = (
  viewState: SessionViewState,
  liveCurveKeys: ReadonlySet<SessionCurveKey>,
): SessionViewState => {
  if (!viewState.curves) {
    return viewState;
  }

  const curves = filterRecord(viewState.curves, (curveKey) =>
    liveCurveKeys.has(curveKey as SessionCurveKey)
  );
  return curves === viewState.curves
    ? viewState
    : {
        ...viewState,
        curves,
      };
};

const applyTemplateSelectionsToRecords = (
  filesById: Readonly<Record<FileId, FileRecord>>,
  selectionsByFileId: Readonly<Record<string, TemplateSelection>>,
): Record<FileId, FileRecord> => {
  let changed = false;
  const nextFilesById: Record<FileId, FileRecord> = {};
  for (const [fileId, file] of Object.entries(filesById)) {
    const templateRun = file.templateRun;
    if (!templateRun) {
      nextFilesById[fileId] = file;
      continue;
    }

    const selection = selectionsByFileId[fileId] ?? { kind: "auto" as const };
    if (
      templateRun.selection.kind === selection.kind &&
      (templateRun.selection.kind !== "template" ||
        selection.kind !== "template" ||
        templateRun.selection.templateId === selection.templateId)
    ) {
      nextFilesById[fileId] = file;
      continue;
    }

    changed = true;
    nextFilesById[fileId] = {
      ...file,
      templateRun: {
        ...templateRun,
        selection,
        mode: selection.kind === "auto" ? "auto" : "manual",
      },
    };
  }

  return changed ? nextFilesById : { ...filesById };
};

const createFileSemanticsFromRecord = (
  file: FileRecord,
  fallback?: FileSemantics,
): FileSemantics => ({
  fileId: file.id,
  kind: file.assessment.baseFamily ?? fallback?.kind ?? "unknown",
  sourceFileName: file.raw.fileName ?? fallback?.sourceFileName,
  templateId: file.templateRun?.selection.kind === "template"
    ? file.templateRun.selection.templateId
    : fallback?.templateId,
  x: {
    ...fallback?.x,
    ...file.axis?.x,
  },
  y: {
    ...fallback?.y,
    ...file.axis?.y,
    scale: file.axis?.y.scale ?? fallback?.y.scale ?? "linear",
  },
});

const createCurveDataFromRecord = (
  key: CurveKey,
  curve: CurveRecord,
): CurveData => ({
  curveKind: key.curveKind,
  fileId: curve.fileId,
  seriesId: curve.seriesId,
  points: curve.points,
  signature: curve.signature,
  xDomain: curve.domain?.x,
  yDomain: curve.domain?.y,
});

const pruneSemanticsOnlyRecords = (
  filesById: Readonly<Record<FileId, FileRecord>>,
  liveFileIds: ReadonlySet<string>,
): Record<FileId, FileRecord> => {
  let changed = false;
  const nextFilesById: Record<FileId, FileRecord> = {};
  for (const [fileId, file] of Object.entries(filesById)) {
    if (!liveFileIds.has(fileId) && isSemanticsOnlyRecord(file)) {
      changed = true;
      continue;
    }

    nextFilesById[fileId] = file;
  }

  return changed ? nextFilesById : filesById as Record<FileId, FileRecord>;
};

const isSemanticsOnlyRecord = (file: FileRecord): boolean =>
  !file.templateRun &&
  file.seriesOrder.length === 0 &&
  file.xGroups.length === 0 &&
  file.baseCandidateOrder.length === 0 &&
  !hasRawImportContent(file);

const hasRawImportContent = (file: FileRecord): boolean =>
  file.raw.file !== undefined ||
  Boolean(
    file.raw.filePath ||
    file.raw.normalizedCsvPath ||
    file.raw.rawKey ||
    file.raw.relativePath,
  ) ||
  hasRawTableContent(file);

const hasRawTableContent = (file: FileRecord): boolean =>
  Object.values(file.raw.tablesById).some((table) =>
    table.rowCount > 0 ||
    table.columnCount > 0 ||
    table.rowStore !== undefined ||
    table.sheetId !== file.id ||
    table.sheetName != null
  );

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

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

const normalizeAxisSemantics = (axis: { readonly label?: string; readonly role?: string; readonly unit?: string }): {
  readonly label?: string;
  readonly role?: string;
  readonly unit?: string;
} => {
  const label = normalizeOptionalText(axis.label);
  const role = normalizeOptionalText(axis.role);
  const unit = normalizeOptionalText(axis.unit);
  return {
    ...(label ? { label } : {}),
    ...(role ? { role } : {}),
    ...(unit ? { unit } : {}),
  };
};

const normalizeKey = (key: CurveKey): CurveKey | null => {
  const fileId = normalizeId(key.fileId);
  const curveKind = normalizeCurveKind(key.curveKind);
  const seriesId = normalizeId(key.seriesId);
  return fileId && seriesId ? { curveKind, fileId, seriesId } : null;
};

const normalizeSessionTarget = (target: SessionTarget): SessionTarget => {
  switch (target.kind) {
    case "none":
      return createNoneTarget();
    case "file": {
      const fileId = normalizeNullableId(target.fileId);
      return fileId ? createFileTarget(fileId) : createNoneTarget();
    }
    case "sheet": {
      const fileId = normalizeNullableId(target.fileId);
      const sheetId = normalizeNullableId(target.sheetId);
      return fileId && sheetId ? createSheetTarget(fileId, sheetId) : createNoneTarget();
    }
    case "series": {
      const fileId = normalizeNullableId(target.fileId);
      const seriesId = normalizeNullableId(target.seriesId);
      return fileId && seriesId
        ? { kind: "series", fileId, seriesId }
        : createNoneTarget();
    }
    case "curve": {
      const fileId = normalizeNullableId(target.fileId);
      const curveKey = normalizeNullableId(target.curveKey);
      return fileId && curveKey
        ? { kind: "curve", fileId, curveKey: curveKey as SessionCurveKey }
        : createNoneTarget();
    }
  }
};

const normalizeNullableId = (value: unknown): string | null =>
  normalizeOptionalText(value) ?? null;

const normalizeId = (value: unknown): string => String(value ?? "").trim();

const normalizeOptionalText = (value: unknown): string | undefined => {
  const text = String(value ?? "").trim();
  return text || undefined;
};

const isSameFileSemantics = (
  current: FileSemantics | undefined,
  next: FileSemantics,
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






