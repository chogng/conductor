/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { logPerf, startPerf } from "src/cs/workbench/common/perf";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  IStorageService,
  StorageScope,
  StorageTarget,
} from "src/cs/platform/storage/common/storage";
import {
  createCalculatedDataForFileRecord,
  getCalculatedDataFromRecords,
  type CalculatedData,
} from "src/cs/workbench/services/calculation/common/calculationReadModel";
import { isPlotType } from "src/cs/workbench/services/plot/common/plot";
import {
  IPlotService,
  PlotTypes,
  type PlotAxis,
  type PlotAxisTitleContext,
  type PlotCalculatedDataCacheChangeEvent,
  type PlotCalculatedDataInput,
  type PlotCalculatedDataPrefetchPriority,
  type PlotDisplayModel,
  type PlotDisplayModelCacheChangeEvent,
  type PlotDisplayModelInput,
  type PlotFileAxisSettings,
  type PlotLegendModel,
  type PlotMainRenderModelInput,
  type PlotPaneDisplayModel,
  type PlotState,
  type PlotType,
} from "src/cs/workbench/services/plot/common/plot";
import type { PlotMainRenderModel } from "src/cs/workbench/services/plot/common/plotModel";
import { createPlotMainRenderModel } from "src/cs/workbench/services/plot/browser/plotRenderModel";
import {
  calculatePlotDataInWorker,
  calculatePlotDisplayModelInWorker,
  type PlotDisplayModelWorkerLane,
} from "src/cs/workbench/services/plot/browser/plotCalculatedDataWorkerClient";
import {
  createPlotInspectorDisplayModelFromCalculatedData,
  createPlotDisplayModelFromCalculatedData,
  getPlotAxisTitleStateKey,
} from "src/cs/workbench/services/plot/browser/plotDisplayModel";
import {
  normalizeXUnit,
  normalizeYUnit,
  type XUnit,
  type YUnit,
} from "src/cs/workbench/services/plot/common/units";
import type {
  CurveKey,
  FileId,
  FileRecord,
  SeriesId,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
  ISessionService,
  type SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";
import { ISettingsService } from "src/cs/workbench/services/settings/common/settings";
import {
  getFileAxisSettingsByFileId,
  type FileAxisSettingsOverrides,
  type FileAxisSettingsByFileId,
} from "src/cs/workbench/services/session/browser/fileSemanticsSync";
import { hasFileRecordBaseCurves } from "src/cs/workbench/services/session/common/sessionRecordProjection";

const PLOT_AXIS_STORAGE_KEYS = {
  xUnitByFileId: "plot.xUnitByFileId",
  yScaleByFileId: "plot.yScaleByFileId",
  yUnitByFileId: "plot.yUnitByFileId",
} as const;

const CALCULATED_DATA_PREFETCH_PRIORITY_ORDER: Readonly<Record<PlotCalculatedDataPrefetchPriority, number>> = {
  active: 0,
  hover: 1,
  visible: 2,
  recent: 3,
  nearby: 4,
  idle: 5,
};
const CALCULATED_DATA_PREFETCH_BATCH_LIMIT = 4;
const CALCULATED_DATA_PREFETCH_FRAME_BUDGET_MS = 6;
const PLOT_PREFETCH_MAX_IN_FLIGHT = 2;
const PLOT_BACKGROUND_PREFETCH_MAX_IN_FLIGHT = 1;
const PLOT_DISPLAY_MODEL_CACHE_LIMIT = 240;
const PLOT_DISPLAY_MODEL_CACHE_HARD_LIMIT = 320;
const PLOT_INSPECTOR_DISPLAY_MODEL_CACHE_LIMIT = 48;
const PLOT_DISPLAY_MODEL_CACHE_RETENTION_ORDER: Readonly<Record<PlotCalculatedDataPrefetchPriority, number>> = {
  idle: 0,
  nearby: 1,
  recent: 2,
  visible: 3,
  hover: 4,
  active: 5,
};

type PlotDisplayModelPrefetchStage = "chart" | "inspector";

type PlotDisplayModelCacheEntry = {
  readonly model: PlotDisplayModel;
  lastUsed: number;
  retentionPriority: PlotCalculatedDataPrefetchPriority;
};

type PlotInspectorDisplayModelCacheEntry = {
  readonly model: PlotPaneDisplayModel;
  lastUsed: number;
};

type QueuedCalculatedDataPrefetch = {
  readonly fileId: FileId;
  readonly plotType: PlotType;
  readonly priority: PlotCalculatedDataPrefetchPriority;
};

type QueuedPlotDisplayModelPrefetch = {
  readonly fileId: FileId;
  readonly hiddenLegendKeys: readonly string[];
  readonly legendLabels: Readonly<Record<string, string>>;
  readonly plotType: PlotType;
  readonly priority: PlotCalculatedDataPrefetchPriority;
  readonly stage: PlotDisplayModelPrefetchStage;
  readonly workerLane?: PlotDisplayModelWorkerLane;
};

type PlotDisplayModelPrefetchResult = {
  readonly calculatedDataReady?: boolean;
  readonly calculatedDataWarmed?: boolean;
  readonly cacheHit?: boolean;
  readonly fileId?: FileId;
  readonly immediate?: boolean;
  readonly inFlight?: boolean;
  readonly missingCalculatedDataFileId?: FileId;
  readonly plotType?: PlotType;
  readonly queued?: boolean;
  readonly result: string;
  readonly stage?: PlotDisplayModelPrefetchStage;
};

type ResolvedPlotDisplayModelInput = PlotDisplayModelInput & {
  readonly fileId: FileId;
  readonly hiddenLegendKeys: readonly SeriesId[];
  readonly legendLabels: Readonly<Record<SeriesId, string>>;
  readonly plotType: PlotType;
};

type InFlightPlotPrefetch = {
  readonly lane?: PlotDisplayModelWorkerLane;
  readonly priority: PlotCalculatedDataPrefetchPriority;
  readonly requestId: number;
};

type PlotCacheChangeMap = Map<FileId, Set<PlotType>>;

type PlotStateUpdateOptions = {
  readonly afterStateAssigned?: () => void;
  readonly clearDisplayModelCache?: boolean;
};

type LegendDisplayModelInputByPlotType = ReadonlyMap<PlotType, PlotDisplayModelInput>;

export class PlotService extends Disposable implements IPlotService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeCalculatedDataCacheEmitter = this._register(new Emitter<PlotCalculatedDataCacheChangeEvent>());
  public readonly onDidChangeCalculatedDataCache = this.onDidChangeCalculatedDataCacheEmitter.event;
  private readonly onDidChangePlotDisplayModelCacheEmitter = this._register(new Emitter<PlotDisplayModelCacheChangeEvent>());
  public readonly onDidChangePlotDisplayModelCache = this.onDidChangePlotDisplayModelCacheEmitter.event;
  private readonly onDidChangePlotStateEmitter = this._register(new Emitter<PlotState>());
  public readonly onDidChangePlotState = this.onDidChangePlotStateEmitter.event;

  private state: PlotState = {
    axisTitleOverridesByKey: {},
    activePlotType: "iv",
    hiddenLegendKeysByPlotKey: {},
    legendLabelsByFileId: {},
  };
  private readonly calculatedDataCacheByFile = new WeakMap<FileRecord, Partial<Record<PlotType, CalculatedData>>>();
  private readonly calculatedDataCacheKeys = new Set<string>();
  private readonly unavailableCalculatedDataCacheKeys = new Set<string>();
  private readonly queuedCalculatedDataPrefetchByKey = new Map<string, QueuedCalculatedDataPrefetch>();
  private readonly inFlightCalculatedDataPrefetchByKey = new Map<string, InFlightPlotPrefetch>();
  private cancelQueuedCalculatedDataPrefetch: (() => void) | null = null;
  private calculatedDataPrefetchGeneration = 0;
  private nextCalculatedDataWorkerRequestId = 1;
  private readonly plotDisplayModelCacheByKey = new Map<string, PlotDisplayModelCacheEntry>();
  private plotDisplayModelCacheUse = 0;
  private readonly plotInspectorDisplayModelCacheByKey = new Map<string, PlotInspectorDisplayModelCacheEntry>();
  private plotInspectorDisplayModelCacheUse = 0;
  private readonly queuedPlotDisplayModelPrefetchByKey = new Map<string, QueuedPlotDisplayModelPrefetch>();
  private readonly inFlightPlotDisplayModelPrefetchByKey = new Map<string, InFlightPlotPrefetch>();
  private cancelQueuedPlotDisplayModelPrefetch: (() => void) | null = null;
  private plotDisplayModelPrefetchGeneration = 0;
  private nextPlotDisplayModelWorkerRequestId = 1;

  constructor(
    @ISessionService private readonly sessionService: ISessionService,
    @ISettingsService private readonly settingsService: ISettingsService,
    @IStorageService private readonly storageService: IStorageService,
  ) {
    super();

    this._register(this.sessionService.onDidChangeSession(event => {
      this.invalidatePlotModelsForSessionChange(event);
    }));
    this._register(this.settingsService.onDidChangeConductorSettings(() => {
      this.clearPlotDisplayModelCache();
      this.clearQueuedPlotDisplayModelPrefetch();
      this.onDidChangePlotStateEmitter.fire(this.state);
    }));
    this._register({ dispose: () => this.cancelScheduledCalculatedDataPrefetch() });
    this._register({ dispose: () => this.cancelScheduledPlotDisplayModelPrefetch() });
  }

  public getState(): PlotState {
    return this.state;
  }

  public getCachedCalculatedData(input: PlotCalculatedDataInput): CalculatedData | null {
    const snapshot = this.resolveSnapshot(input.snapshot);
    if (!snapshot) {
      return null;
    }

    const plotType = input.plotType && isPlotType(input.plotType)
      ? input.plotType
      : this.state.activePlotType;
    const normalizedFileId = normalizeStateKey(input.fileId);
    const file = normalizedFileId
      ? snapshot.filesById[normalizedFileId] ?? null
      : resolveCalculatedDataFile(snapshot, input.fileId);
    return file ? this.calculatedDataCacheByFile.get(file)?.[plotType] ?? null : null;
  }

  public getCachedPlotLegendModel(input: PlotCalculatedDataInput): PlotLegendModel | null {
    return this.createPlotLegendModel(this.getCachedCalculatedData(input));
  }

  public getCachedPlotDisplayModel(input: PlotDisplayModelInput): PlotDisplayModel | null {
    const snapshot = this.resolveSnapshot(input.snapshot);
    const calculatedData = this.getCachedCalculatedData({
      fileId: input.fileId,
      plotType: input.plotType,
      snapshot: snapshot ?? undefined,
    });
    if (!calculatedData) {
      return null;
    }

    const resolvedInput = this.resolvePlotDisplayModelInput(input, calculatedData);
    if (!resolvedInput) {
      return null;
    }

    const key = this.getPlotDisplayModelCacheKey(
      calculatedData,
      resolvedInput,
    );
    const cached = this.getCachedPlotDisplayModelForKey(key);
    if (!cached) {
      return null;
    }

    return {
      ...cached,
      inspector: this.getCachedPlotInspectorDisplayModelForKey(key),
    };
  }

  public getCachedPlotInspectorDisplayModel(input: PlotDisplayModelInput): PlotPaneDisplayModel | null {
    const snapshot = this.resolveSnapshot(input.snapshot);
    const calculatedData = this.getCachedCalculatedData({
      fileId: input.fileId,
      plotType: input.plotType,
      snapshot: snapshot ?? undefined,
    });
    if (!calculatedData) {
      return null;
    }

    const resolvedInput = this.resolvePlotDisplayModelInput(input, calculatedData);
    if (!resolvedInput) {
      return null;
    }

    return this.getCachedPlotInspectorDisplayModelForKey(this.getPlotDisplayModelCacheKey(
      calculatedData,
      resolvedInput,
    ));
  }

  public getCalculatedData(input: PlotCalculatedDataInput): CalculatedData | null {
    const snapshot = this.resolveSnapshot(input.snapshot);
    if (!snapshot) {
      return null;
    }

    const plotType = input.plotType && isPlotType(input.plotType)
      ? input.plotType
      : this.state.activePlotType;
    const endPerf = startPerf("plotService.getCalculatedData", {
      fileId: input.fileId ?? null,
      fileCount: Object.keys(snapshot.filesById).length,
      plotType,
      sessionVersion: snapshot.sessionVersion,
    });
    const file = resolveCalculatedDataFile(snapshot, input.fileId);
    if (file) {
      if (!hasFileRecordBaseCurves(file)) {
        endPerf({
          cacheHit: false,
          resolvedFileId: file.id,
          resultPointsCount: 0,
          source: "fileRecordUnavailable",
        });
        return null;
      }

      const cacheHit = Boolean(this.calculatedDataCacheByFile.get(file)?.[plotType]);
      const calculatedData = this.getCalculatedDataForFileRecord(file, plotType);
      endPerf({
        cacheHit,
        resolvedFileId: file.id,
        resultPointsCount: calculatedData.pointsCount,
        source: "fileRecord",
      });
      return calculatedData;
    }

    const calculatedData = getCalculatedDataFromRecords(
      snapshot.filesById,
      snapshot.fileOrder,
      plotType,
      input.fileId,
    );
    endPerf({
      resultPointsCount: calculatedData?.pointsCount ?? 0,
      source: "recordsFallback",
    });
    return calculatedData;
  }

  public getLegendLabels(fileId: FileId): Readonly<Record<SeriesId, string>> {
    const normalizedFileId = normalizeStateKey(fileId);
    return normalizedFileId
      ? this.state.legendLabelsByFileId[normalizedFileId] ?? {}
      : {};
  }

  public getHiddenLegendKeys(
    fileId: FileId,
    plotType: PlotType,
    liveLegendKeys: readonly SeriesId[],
  ): readonly SeriesId[] {
    const key = getPlotLegendStateKey(fileId, plotType);
    if (!key) {
      return [];
    }

    const liveKeys = new Set(normalizeUniqueStringList(liveLegendKeys));
    return this.getStoredHiddenLegendKeys(fileId, plotType)
      .filter(legendKey => liveKeys.has(legendKey));
  }

  private getStoredHiddenLegendKeys(
    fileId: FileId,
    plotType: PlotType,
  ): readonly SeriesId[] {
    const key = getPlotLegendStateKey(fileId, plotType);
    return key ? this.state.hiddenLegendKeysByPlotKey[key] ?? [] : [];
  }

  public getPlotLegendModel(input: PlotCalculatedDataInput): PlotLegendModel | null {
    return this.createPlotLegendModel(this.getCalculatedData(input));
  }

  private createPlotLegendModel(calculatedData: CalculatedData | null): PlotLegendModel | null {
    const fileId = String(calculatedData?.source.fileId ?? "").trim();
    if (!calculatedData || !fileId || !calculatedData.seriesList.length) {
      return null;
    }

    return {
      fileId,
      plotType: calculatedData.kind as PlotType,
      seriesList: createPlotMainRenderModel(calculatedData).seriesList,
    };
  }

  private resolvePlotDisplayModelInput(
    input: PlotDisplayModelInput,
    calculatedData?: CalculatedData | null,
  ): ResolvedPlotDisplayModelInput | null {
    const fileId = normalizeStateKey(calculatedData?.source.fileId) || normalizeStateKey(input.fileId);
    const plotType = isPlotType(calculatedData?.kind)
      ? calculatedData.kind
      : input.plotType && isPlotType(input.plotType)
        ? input.plotType
        : this.state.activePlotType;
    if (!fileId || !isPlotType(plotType)) {
      return null;
    }

    return {
      ...input,
      fileId,
      hiddenLegendKeys: input.hiddenLegendKeys !== undefined
        ? normalizeUniqueStringList(input.hiddenLegendKeys)
        : this.getStoredHiddenLegendKeys(fileId, plotType),
      legendLabels: input.legendLabels !== undefined
        ? normalizeLegendLabelMap(input.legendLabels)
        : this.getLegendLabels(fileId),
      plotType,
    };
  }

  public getPlotDisplayModel(input: PlotDisplayModelInput): PlotDisplayModel | null {
    const snapshot = this.resolveSnapshot(input.snapshot);
    const calculatedData = this.getCalculatedData({
      fileId: input.fileId,
      plotType: input.plotType,
      snapshot: snapshot ?? undefined,
    });
    const resolvedInput = this.resolvePlotDisplayModelInput(input, calculatedData);
    const model = resolvedInput
      ? this.createPlotDisplayModel(calculatedData, resolvedInput, snapshot ?? undefined)
      : null;
    if (model && calculatedData && resolvedInput) {
      this.cachePlotDisplayModel(calculatedData, resolvedInput, model);
      if (model.inspector) {
        this.cachePlotInspectorDisplayModel(calculatedData, resolvedInput, model.inspector);
      }
    }
    return model;
  }

  private createPlotDisplayModel(
    calculatedData: CalculatedData | null,
    input: PlotDisplayModelInput,
    snapshot: SessionSnapshot | undefined,
    includeInspector = true,
  ): PlotDisplayModel | null {
    const fileId = String(calculatedData?.source.fileId ?? "").trim();
    if (!calculatedData || !fileId) {
      return null;
    }

    const axisSettings = snapshot ? this.getAxisSettings(snapshot) : undefined;
    return createPlotDisplayModelFromCalculatedData({
      axisSettings,
      axisTitleOverridesByKey: this.state.axisTitleOverridesByKey,
      calculatedData,
      hiddenLegendKeys: input.hiddenLegendKeys,
      includeInspector,
      legendLabels: input.legendLabels,
    });
  }

  private createPlotInspectorDisplayModel(
    calculatedData: CalculatedData | null,
    input: PlotDisplayModelInput,
    snapshot: SessionSnapshot | undefined,
  ): PlotPaneDisplayModel | null {
    const fileId = String(calculatedData?.source.fileId ?? "").trim();
    if (!calculatedData || !fileId) {
      return null;
    }

    const axisSettings = snapshot ? this.getAxisSettings(snapshot) : undefined;
    return createPlotInspectorDisplayModelFromCalculatedData({
      axisSettings,
      axisTitleOverridesByKey: this.state.axisTitleOverridesByKey,
      calculatedData,
      hiddenLegendKeys: input.hiddenLegendKeys,
      legendLabels: input.legendLabels,
    });
  }

  public getPlotMainRenderModel(input: PlotMainRenderModelInput): PlotMainRenderModel | null {
    const calculatedData = this.getCalculatedData(input);
    return calculatedData ? createPlotMainRenderModel(calculatedData) : null;
  }

  public cancelQueuedPlotInspectorDisplayModelPrefetch(): void {
    this.clearQueuedInspectorDisplayModelPrefetchExcept(null);
    if (!this.queuedPlotDisplayModelPrefetchByKey.size) {
      this.cancelScheduledPlotDisplayModelPrefetch();
    }
  }

  public prefetchCalculatedData(
    fileIds: readonly FileId[],
    priority: PlotCalculatedDataPrefetchPriority,
    plotType = this.state.activePlotType,
  ): void {
    const normalizedPlotType = isPlotType(plotType) ? plotType : this.state.activePlotType;
    for (const fileId of fileIds) {
      const normalizedFileId = normalizeStateKey(fileId);
      if (!normalizedFileId) {
        continue;
      }

      const key = getCalculatedDataPrefetchKey(normalizedFileId, normalizedPlotType);
      if (this.hasCompletedCalculatedDataPrefetch(key)) {
        this.queuedCalculatedDataPrefetchByKey.delete(key);
        continue;
      }

      const inFlight = this.inFlightCalculatedDataPrefetchByKey.get(key);
      if (inFlight) {
        if (
          CALCULATED_DATA_PREFETCH_PRIORITY_ORDER[priority] <
          CALCULATED_DATA_PREFETCH_PRIORITY_ORDER[inFlight.priority]
        ) {
          this.inFlightCalculatedDataPrefetchByKey.set(key, {
            ...inFlight,
            priority,
          });
        }
        this.queuedCalculatedDataPrefetchByKey.delete(key);
        continue;
      }

      const queued = this.queuedCalculatedDataPrefetchByKey.get(key);
      if (
        !queued ||
        CALCULATED_DATA_PREFETCH_PRIORITY_ORDER[priority] <
          CALCULATED_DATA_PREFETCH_PRIORITY_ORDER[queued.priority]
      ) {
        this.queuedCalculatedDataPrefetchByKey.set(key, {
          fileId: normalizedFileId,
          plotType: normalizedPlotType,
          priority,
        });
      }
    }

    this.scheduleCalculatedDataPrefetch();
  }

  public prefetchPlotDisplayModel(
    input: PlotDisplayModelInput,
    priority: PlotCalculatedDataPrefetchPriority,
  ): void {
    const endPerf = startPerf("plotService.prefetchPlotDisplayModel", {
      fileId: input.fileId ?? null,
      priority,
      requestedPlotType: input.plotType ?? null,
    });
    const snapshot = this.resolveSnapshot(input.snapshot);
    if (!snapshot) {
      endPerf({ result: "noSnapshot" });
      return;
    }

    const request = this.createChartDisplayModelPrefetchRequest(input, priority);
    if (!request) {
      endPerf({ result: "noFileId" });
      return;
    }

    const result = this.prefetchChartDisplayModelRequest(request, snapshot);
    if (result.missingCalculatedDataFileId && result.plotType) {
      this.prefetchCalculatedData([result.missingCalculatedDataFileId], priority, result.plotType);
    }
    if (result.queued) {
      this.schedulePlotDisplayModelPrefetch();
    }
    endPerf({
      ...result,
      queueLength: this.queuedPlotDisplayModelPrefetchByKey.size,
      requestedPriority: priority,
    });
  }

  public prefetchPlotDisplayModels(
    inputs: readonly PlotDisplayModelInput[],
    priority: PlotCalculatedDataPrefetchPriority,
  ): void {
    const endPerf = startPerf("plotService.prefetchPlotDisplayModels", {
      inputCount: inputs.length,
      priority,
    });
    const defaultSnapshot = this.resolveSnapshot(undefined);
    const seenKeys = new Set<string>();
    const missingCalculatedFileIdsByPlotType = new Map<PlotType, Set<FileId>>();
    const resultCounts = new Map<string, number>();
    let calculatedDataReadyCount = 0;
    let calculatedDataWarmedCount = 0;
    let cacheHitCount = 0;
    let duplicateCount = 0;
    let inFlightCount = 0;
    let noFileIdCount = 0;
    let noSnapshotCount = 0;
    let queuedCount = 0;
    let requestCount = 0;
    let shouldSchedulePlotDisplayPrefetch = false;

    for (const input of inputs) {
      const snapshot = this.resolveSnapshot(input.snapshot ?? defaultSnapshot ?? undefined);
      if (!snapshot) {
        noSnapshotCount += 1;
        incrementCount(resultCounts, "noSnapshot");
        continue;
      }

      const request = this.createChartDisplayModelPrefetchRequest(input, priority);
      if (!request) {
        noFileIdCount += 1;
        incrementCount(resultCounts, "noFileId");
        continue;
      }

      const key = getQueuedPlotDisplayModelPrefetchKey(request);
      if (seenKeys.has(key)) {
        duplicateCount += 1;
        incrementCount(resultCounts, "duplicate");
        continue;
      }
      seenKeys.add(key);
      requestCount += 1;

      const result = this.prefetchChartDisplayModelRequest(request, snapshot);
      incrementCount(resultCounts, result.result);
      if (result.calculatedDataReady) {
        calculatedDataReadyCount += 1;
      }
      if (result.calculatedDataWarmed) {
        calculatedDataWarmedCount += 1;
      }
      if (result.cacheHit) {
        cacheHitCount += 1;
      }
      if (result.inFlight) {
        inFlightCount += 1;
      }
      if (result.queued) {
        queuedCount += 1;
        shouldSchedulePlotDisplayPrefetch = true;
      }
      if (result.missingCalculatedDataFileId && result.plotType) {
        let fileIds = missingCalculatedFileIdsByPlotType.get(result.plotType);
        if (!fileIds) {
          fileIds = new Set<FileId>();
          missingCalculatedFileIdsByPlotType.set(result.plotType, fileIds);
        }
        fileIds.add(result.missingCalculatedDataFileId);
      }
    }

    let missingCalculatedDataCount = 0;
    for (const [plotType, fileIds] of missingCalculatedFileIdsByPlotType) {
      const missingFileIds = [...fileIds];
      missingCalculatedDataCount += missingFileIds.length;
      this.prefetchCalculatedData(missingFileIds, priority, plotType);
    }
    if (shouldSchedulePlotDisplayPrefetch) {
      this.schedulePlotDisplayModelPrefetch();
    }

    endPerf({
      calculatedDataReadyCount,
      calculatedDataWarmedCount,
      cacheHitCount,
      duplicateCount,
      inFlightCount,
      missingCalculatedDataCount,
      noFileIdCount,
      noSnapshotCount,
      queueLength: this.queuedPlotDisplayModelPrefetchByKey.size,
      queuedCount,
      requestCount,
      result: requestCount ? "completed" : "empty",
      resultReasons: serializeCountMap(resultCounts),
    });
  }

  private createChartDisplayModelPrefetchRequest(
    input: PlotDisplayModelInput,
    priority: PlotCalculatedDataPrefetchPriority,
  ): QueuedPlotDisplayModelPrefetch | null {
    const fileId = normalizeStateKey(input.fileId);
    if (!fileId) {
      return null;
    }
    const plotType = input.plotType && isPlotType(input.plotType)
      ? input.plotType
      : this.state.activePlotType;

    return {
      fileId,
      hiddenLegendKeys: input.hiddenLegendKeys !== undefined
        ? normalizeUniqueStringList(input.hiddenLegendKeys)
        : this.getStoredHiddenLegendKeys(fileId, plotType),
      legendLabels: input.legendLabels !== undefined
        ? normalizeLegendLabelMap(input.legendLabels)
        : this.getLegendLabels(fileId),
      plotType,
      priority,
      stage: "chart",
    };
  }

  private prefetchChartDisplayModelRequest(
    request: QueuedPlotDisplayModelPrefetch,
    snapshot: SessionSnapshot,
  ): PlotDisplayModelPrefetchResult {
    let calculatedData = this.getCachedCalculatedData({
      fileId: request.fileId,
      plotType: request.plotType,
      snapshot,
    });
    let calculatedDataWarmed = false;
    if (!calculatedData && this.isCalculatedDataUnavailable(request.fileId, request.plotType)) {
      return {
        fileId: request.fileId,
        plotType: request.plotType,
        result: "calculatedDataUnavailable",
        stage: request.stage,
      };
    }
    if (!calculatedData && isInteractivePlotPrefetchPriority(request.priority)) {
      calculatedData = this.getCalculatedData({
        fileId: request.fileId,
        plotType: request.plotType,
        snapshot,
      });
      calculatedDataWarmed = Boolean(calculatedData);
    }

    const cachedDisplayModel = calculatedData
      ? this.getCachedPlotDisplayModelForKey(
        this.getPlotDisplayModelCacheKey(calculatedData, request),
        request.priority,
      )
      : null;
    if (cachedDisplayModel) {
      return {
        cacheHit: true,
        calculatedDataReady: true,
        calculatedDataWarmed,
        fileId: request.fileId,
        plotType: request.plotType,
        result: "chartCacheHit",
        stage: request.stage,
      };
    }
    if (
      calculatedData &&
      this.tryCacheImmediateInteractiveChartDisplayModel(request, calculatedData, snapshot)
    ) {
      return {
        calculatedDataReady: true,
        calculatedDataWarmed,
        fileId: request.fileId,
        immediate: true,
        plotType: request.plotType,
        queued: false,
        result: "chartCached",
        stage: request.stage,
      };
    }

    const key = getQueuedPlotDisplayModelPrefetchKey(request);
    const calculatedDataCacheKey = calculatedData
      ? this.getPlotDisplayModelPrefetchKey(calculatedData, request)
      : null;
    const inFlight = calculatedDataCacheKey
      ? this.inFlightPlotDisplayModelPrefetchByKey.get(calculatedDataCacheKey)
      : undefined;
    if (inFlight) {
      if (
        CALCULATED_DATA_PREFETCH_PRIORITY_ORDER[request.priority] <
        CALCULATED_DATA_PREFETCH_PRIORITY_ORDER[inFlight.priority]
      ) {
        this.inFlightPlotDisplayModelPrefetchByKey.set(calculatedDataCacheKey!, {
          ...inFlight,
          priority: request.priority,
        });
      }
      this.queuedPlotDisplayModelPrefetchByKey.delete(key);
      return {
        calculatedDataReady: Boolean(calculatedData),
        fileId: request.fileId,
        inFlight: true,
        plotType: request.plotType,
        result: "inFlightPromoted",
        stage: request.stage,
      };
    }

    const queued = this.queuedPlotDisplayModelPrefetchByKey.get(key);
    if (
      !queued ||
      CALCULATED_DATA_PREFETCH_PRIORITY_ORDER[request.priority] <
        CALCULATED_DATA_PREFETCH_PRIORITY_ORDER[queued.priority]
    ) {
      this.queuedPlotDisplayModelPrefetchByKey.set(key, request);
    }

    return {
      calculatedDataReady: Boolean(calculatedData),
      calculatedDataWarmed,
      fileId: request.fileId,
      missingCalculatedDataFileId: calculatedData ? undefined : request.fileId,
      plotType: request.plotType,
      queued: true,
      result: "queued",
      stage: request.stage,
    };
  }

  public prefetchPlotInspectorDisplayModel(
    input: PlotDisplayModelInput,
    priority: PlotCalculatedDataPrefetchPriority,
  ): void {
    const endPerf = startPerf("plotService.prefetchPlotInspectorDisplayModel", {
      fileId: input.fileId ?? null,
      priority,
      requestedPlotType: input.plotType ?? null,
    });
    const snapshot = this.resolveSnapshot(input.snapshot);
    if (!snapshot) {
      endPerf({ result: "noSnapshot" });
      return;
    }

    const plotType = input.plotType && isPlotType(input.plotType)
      ? input.plotType
      : this.state.activePlotType;
    const fileId = normalizeStateKey(input.fileId);
    if (!fileId) {
      endPerf({ result: "noFileId" });
      return;
    }
    const resolvedInput = this.resolvePlotDisplayModelInput({
      ...input,
      fileId,
      plotType,
    });
    if (!resolvedInput) {
      endPerf({ result: "noFileId" });
      return;
    }

    let calculatedData = this.getCachedCalculatedData({
      fileId,
      plotType,
      snapshot,
    });
    let calculatedDataWarmed = false;
    if (!calculatedData && this.isCalculatedDataUnavailable(fileId, plotType)) {
      endPerf({
        plotType,
        result: "calculatedDataUnavailable",
      });
      return;
    }
    if (!calculatedData && isInteractivePlotPrefetchPriority(priority)) {
      calculatedData = this.getCalculatedData({
        fileId,
        plotType,
        snapshot,
      });
      calculatedDataWarmed = Boolean(calculatedData);
    }

    const cachedInspector = calculatedData ? this.getCachedPlotInspectorDisplayModel({
      fileId,
      hiddenLegendKeys: resolvedInput.hiddenLegendKeys,
      legendLabels: resolvedInput.legendLabels,
      plotType,
      snapshot,
    }) : null;
    if (cachedInspector) {
      endPerf({
        cacheHit: true,
        calculatedDataWarmed,
        plotType,
        result: "inspectorCacheHit",
      });
      return;
    }

    const request: QueuedPlotDisplayModelPrefetch = {
      fileId,
      hiddenLegendKeys: [...resolvedInput.hiddenLegendKeys],
      legendLabels: { ...resolvedInput.legendLabels },
      plotType,
      priority: getInspectorPlotDisplayModelPrefetchPriority(priority),
      stage: "inspector",
      workerLane: priority === "active" ? "detail" : undefined,
    };
    const key = getQueuedPlotDisplayModelPrefetchKey(request);
    if (priority === "active") {
      this.clearQueuedInspectorDisplayModelPrefetchExcept(key);
    }
    const calculatedDataCacheKey = calculatedData
      ? this.getPlotDisplayModelPrefetchKey(calculatedData, request)
      : null;
    const inFlight = calculatedDataCacheKey
      ? this.inFlightPlotDisplayModelPrefetchByKey.get(calculatedDataCacheKey)
      : undefined;
    if (inFlight) {
      if (
        CALCULATED_DATA_PREFETCH_PRIORITY_ORDER[request.priority] <
        CALCULATED_DATA_PREFETCH_PRIORITY_ORDER[inFlight.priority]
      ) {
        this.inFlightPlotDisplayModelPrefetchByKey.set(calculatedDataCacheKey!, {
          ...inFlight,
          priority: request.priority,
        });
      }
      this.queuedPlotDisplayModelPrefetchByKey.delete(key);
      endPerf({
        inFlight: true,
        plotType,
        result: "inFlightPromoted",
        requestedPriority: priority,
        stage: request.stage,
      });
      return;
    }

    const queued = this.queuedPlotDisplayModelPrefetchByKey.get(key);
    if (
      !queued ||
      CALCULATED_DATA_PREFETCH_PRIORITY_ORDER[request.priority] <
        CALCULATED_DATA_PREFETCH_PRIORITY_ORDER[queued.priority]
    ) {
      this.queuedPlotDisplayModelPrefetchByKey.set(key, request);
    }

    if (!calculatedData) {
      this.prefetchCalculatedData([fileId], priority, plotType);
    }
    this.schedulePlotDisplayModelPrefetch();
    endPerf({
      calculatedDataReady: Boolean(calculatedData),
      calculatedDataWarmed,
      plotType,
      queueLength: this.queuedPlotDisplayModelPrefetchByKey.size,
      result: "queued",
      requestedPriority: priority,
      stage: request.stage,
    });
  }

  public setAxisTitleOverride(
    context: PlotAxisTitleContext,
    title: string,
    defaultTitle: string,
  ): void {
    const key = getPlotAxisTitleStateKey(context);
    if (!key) {
      return;
    }

    const normalizedTitle = title.trim();
    const nextOverrides = {
      ...this.state.axisTitleOverridesByKey,
    };
    if (!normalizedTitle || normalizedTitle === defaultTitle) {
      delete nextOverrides[key];
    } else {
      nextOverrides[key] = normalizedTitle;
    }

    this.updateState({
      axisTitleOverridesByKey: nextOverrides,
    });
  }

  public setActivePlotType(plotType: PlotType): void {
    if (!isPlotType(plotType) || this.state.activePlotType === plotType) {
      return;
    }

    this.clearQueuedCalculatedDataPrefetch();
    this.clearQueuedPlotDisplayModelPrefetch();
    this.state = {
      ...this.state,
      activePlotType: plotType,
    };
    this.onDidChangePlotStateEmitter.fire(this.state);
  }

  public async setAxisUnit(
    fileId: FileId,
    axis: PlotAxis,
    unit: XUnit | YUnit,
  ): Promise<void> {
    const normalizedFileId = normalizeStateKey(fileId);
    if (!normalizedFileId) {
      return;
    }

    if (axis === "x") {
      const normalizedUnit = normalizeXUnit(unit);
      if (!normalizedUnit) {
        return;
      }

      const current = this.getStoredAxisSettings().xUnitByFileId ?? {};
      if (current[normalizedFileId] === normalizedUnit) {
        return;
      }

      this.storeAxisSettings(PLOT_AXIS_STORAGE_KEYS.xUnitByFileId, {
        ...current,
        [normalizedFileId]: normalizedUnit,
      });
      this.clearPlotDisplayModelCache();
      this.clearQueuedPlotDisplayModelPrefetch();
      this.onDidChangePlotStateEmitter.fire(this.state);
      return;
    }

    const normalizedUnit = normalizeYUnit(unit);
    if (!normalizedUnit) {
      return;
    }

    const current = this.getStoredAxisSettings().yUnitByFileId ?? {};
    if (current[normalizedFileId] === normalizedUnit) {
      return;
    }

    this.storeAxisSettings(PLOT_AXIS_STORAGE_KEYS.yUnitByFileId, {
      ...current,
      [normalizedFileId]: normalizedUnit,
    });
    this.clearPlotDisplayModelCache();
    this.clearQueuedPlotDisplayModelPrefetch();
    this.onDidChangePlotStateEmitter.fire(this.state);
  }

  public async setYScale(
    fileId: FileId,
    scale: "linear" | "log",
  ): Promise<void> {
    const normalizedFileId = normalizeStateKey(fileId);
    if (!normalizedFileId) {
      return;
    }

    const normalizedScale = scale === "log" ? "log" : "linear";
    const current = this.getStoredAxisSettings().yScaleByFileId ?? {};
    if (current[normalizedFileId] === normalizedScale) {
      return;
    }

    this.storeAxisSettings(PLOT_AXIS_STORAGE_KEYS.yScaleByFileId, {
      ...current,
      [normalizedFileId]: normalizedScale,
    });
    this.clearPlotDisplayModelCache();
    this.clearQueuedPlotDisplayModelPrefetch();
    this.onDidChangePlotStateEmitter.fire(this.state);
  }

  public setLegendLabel(
    fileId: FileId,
    seriesId: SeriesId,
    label: string | null,
  ): void {
    const normalizedFileId = normalizeStateKey(fileId);
    const normalizedSeriesId = normalizeStateKey(seriesId);
    if (!normalizedFileId || !normalizedSeriesId) {
      return;
    }

    const normalizedLabel = String(label ?? "").trim();
    const currentLabels = this.state.legendLabelsByFileId[normalizedFileId] ?? {};
    if ((currentLabels[normalizedSeriesId] ?? "") === normalizedLabel) {
      return;
    }

    const previousLegendInputs = this.createCurrentLegendDisplayModelInputs(normalizedFileId);
    const nextLabels = { ...currentLabels };
    if (normalizedLabel) {
      nextLabels[normalizedSeriesId] = normalizedLabel;
    } else {
      delete nextLabels[normalizedSeriesId];
    }

    const legendLabelsByFileId = {
      ...this.state.legendLabelsByFileId,
      [normalizedFileId]: nextLabels,
    };
    if (Object.keys(nextLabels).length === 0) {
      delete legendLabelsByFileId[normalizedFileId];
    }

    this.updateState({
      legendLabelsByFileId,
    }, {
      afterStateAssigned: () => this.cacheCurrentLegendDisplayModels(normalizedFileId, previousLegendInputs),
      clearDisplayModelCache: false,
    });
  }

  public toggleHiddenLegendKey(
    fileId: FileId,
    plotType: PlotType,
    seriesId: SeriesId,
    liveLegendKeys: readonly SeriesId[],
  ): void {
    const key = getPlotLegendStateKey(fileId, plotType);
    const normalizedFileId = normalizeStateKey(fileId);
    const normalizedSeriesId = normalizeStateKey(seriesId);
    if (!key || !normalizedFileId || !normalizedSeriesId) {
      return;
    }

    const liveKeys = normalizeUniqueStringList(liveLegendKeys);
    if (!liveKeys.includes(normalizedSeriesId)) {
      return;
    }

    const current = this.getHiddenLegendKeys(fileId, plotType, liveKeys);
    const previousLegendInput: PlotDisplayModelInput = {
      fileId: normalizedFileId,
      hiddenLegendKeys: current,
      legendLabels: this.getLegendLabels(normalizedFileId),
      plotType,
    };
    const next = current.includes(normalizedSeriesId)
      ? current.filter(item => item !== normalizedSeriesId)
      : [...current, normalizedSeriesId];
    const hiddenLegendKeysByPlotKey = {
      ...this.state.hiddenLegendKeysByPlotKey,
    };
    if (next.length) {
      hiddenLegendKeysByPlotKey[key] = next;
    } else {
      delete hiddenLegendKeysByPlotKey[key];
    }

    this.updateState({
      hiddenLegendKeysByPlotKey,
    }, {
      afterStateAssigned: () => this.cacheCurrentLegendDisplayModel(normalizedFileId, plotType, previousLegendInput),
      clearDisplayModelCache: false,
    });
  }

  private updateState(updates: Partial<PlotState>, options: PlotStateUpdateOptions = {}): void {
    const nextState = {
      ...this.state,
      ...updates,
    };
    if (
      this.state.activePlotType === nextState.activePlotType &&
      areRecordMapsEqual(this.state.axisTitleOverridesByKey, nextState.axisTitleOverridesByKey) &&
      areStringArrayMapsEqual(this.state.hiddenLegendKeysByPlotKey, nextState.hiddenLegendKeysByPlotKey) &&
      areNestedRecordMapsEqual(this.state.legendLabelsByFileId, nextState.legendLabelsByFileId)
    ) {
      return;
    }

    this.state = nextState;
    if (options.clearDisplayModelCache !== false) {
      this.clearPlotDisplayModelCache();
      this.clearQueuedPlotDisplayModelPrefetch();
    }
    options.afterStateAssigned?.();
    this.onDidChangePlotStateEmitter.fire(nextState);
  }

  private createCurrentLegendDisplayModelInputs(fileId: FileId): LegendDisplayModelInputByPlotType {
    const normalizedFileId = normalizeStateKey(fileId);
    const inputs = new Map<PlotType, PlotDisplayModelInput>();
    if (!normalizedFileId) {
      return inputs;
    }

    for (const plotType of PlotTypes) {
      inputs.set(plotType, {
        fileId: normalizedFileId,
        hiddenLegendKeys: this.getStoredHiddenLegendKeys(normalizedFileId, plotType),
        legendLabels: this.getLegendLabels(normalizedFileId),
        plotType,
      });
    }
    return inputs;
  }

  private cacheCurrentLegendDisplayModels(
    fileId: FileId,
    previousInputs: LegendDisplayModelInputByPlotType,
  ): void {
    for (const plotType of PlotTypes) {
      this.cacheCurrentLegendDisplayModel(fileId, plotType, previousInputs.get(plotType));
    }
  }

  private cacheCurrentLegendDisplayModel(
    fileId: FileId,
    plotType: PlotType,
    previousInput: PlotDisplayModelInput | undefined,
  ): void {
    const normalizedFileId = normalizeStateKey(fileId);
    if (!normalizedFileId || !isPlotType(plotType)) {
      return;
    }

    const snapshot = this.resolveSnapshot(undefined);
    if (!snapshot) {
      return;
    }

    const calculatedData = this.getCachedCalculatedData({
      fileId: normalizedFileId,
      plotType,
      snapshot,
    });
    if (!calculatedData) {
      return;
    }

    const resolvedInput = this.resolvePlotDisplayModelInput({
      fileId: normalizedFileId,
      plotType,
    }, calculatedData);
    if (!resolvedInput) {
      return;
    }

    const model = this.createPlotDisplayModel(calculatedData, resolvedInput, snapshot, false);
    if (!model) {
      return;
    }

    this.cachePlotDisplayModel(calculatedData, resolvedInput, model);
    if (
      previousInput &&
      this.getCachedPlotInspectorDisplayModelForKey(this.getPlotDisplayModelCacheKey(calculatedData, previousInput))
    ) {
      const inspectorModel = this.createPlotInspectorDisplayModel(calculatedData, resolvedInput, snapshot);
      if (inspectorModel) {
        this.cachePlotInspectorDisplayModel(calculatedData, resolvedInput, inspectorModel);
      }
    }
  }

  private invalidatePlotModelsForSessionChange(event: SessionChangeEvent): void {
    if (!shouldInvalidatePlotModelsForSessionChange(event)) {
      return;
    }

    const affectedFileIds = getAffectedPlotFileIds(event);
    if (shouldFullyInvalidatePlotModelsForSessionChange(event, affectedFileIds)) {
      this.calculatedDataCacheKeys.clear();
      this.unavailableCalculatedDataCacheKeys.clear();
      this.clearPlotDisplayModelCache();
      this.clearQueuedCalculatedDataPrefetch();
      this.clearQueuedPlotDisplayModelPrefetch();
      this.onDidChangePlotStateEmitter.fire(this.state);
      return;
    }

    this.clearPlotModelsForFileIds(affectedFileIds);
  }

  private clearPlotModelsForFileIds(fileIds: ReadonlySet<FileId>): void {
    if (!fileIds.size) {
      return;
    }

    const calculatedDataChanges: PlotCacheChangeMap = new Map();
    const plotDisplayModelChanges: PlotCacheChangeMap = new Map();

    for (const key of [...this.calculatedDataCacheKeys]) {
      const keyContext = getCalculatedDataPrefetchContext(key);
      if (keyContext && fileIds.has(keyContext.fileId)) {
        this.calculatedDataCacheKeys.delete(key);
        addPlotCacheChange(calculatedDataChanges, keyContext);
      }
    }
    for (const key of [...this.unavailableCalculatedDataCacheKeys]) {
      const keyContext = getCalculatedDataPrefetchContext(key);
      if (keyContext && fileIds.has(keyContext.fileId)) {
        this.unavailableCalculatedDataCacheKeys.delete(key);
        addPlotCacheChange(calculatedDataChanges, keyContext);
      }
    }
    for (const [key, request] of [...this.queuedCalculatedDataPrefetchByKey]) {
      if (fileIds.has(request.fileId)) {
        this.queuedCalculatedDataPrefetchByKey.delete(key);
        addPlotCacheChange(calculatedDataChanges, request);
      }
    }
    for (const key of [...this.inFlightCalculatedDataPrefetchByKey.keys()]) {
      const keyContext = getCalculatedDataPrefetchContext(key);
      if (keyContext && fileIds.has(keyContext.fileId)) {
        this.inFlightCalculatedDataPrefetchByKey.delete(key);
        addPlotCacheChange(calculatedDataChanges, keyContext);
      }
    }
    for (const key of [...this.plotDisplayModelCacheByKey.keys()]) {
      const keyContext = getPlotDisplayModelContextFromKey(key);
      if (keyContext && fileIds.has(keyContext.fileId)) {
        this.plotDisplayModelCacheByKey.delete(key);
        addPlotCacheChange(plotDisplayModelChanges, keyContext);
      }
    }
    for (const key of [...this.plotInspectorDisplayModelCacheByKey.keys()]) {
      const keyContext = getPlotDisplayModelContextFromKey(key);
      if (keyContext && fileIds.has(keyContext.fileId)) {
        this.plotInspectorDisplayModelCacheByKey.delete(key);
        addPlotCacheChange(plotDisplayModelChanges, keyContext);
      }
    }
    for (const [key, request] of [...this.queuedPlotDisplayModelPrefetchByKey]) {
      if (fileIds.has(request.fileId)) {
        this.queuedPlotDisplayModelPrefetchByKey.delete(key);
        addPlotCacheChange(plotDisplayModelChanges, request);
      }
    }
    for (const key of [...this.inFlightPlotDisplayModelPrefetchByKey.keys()]) {
      const keyContext = getPlotDisplayModelContextFromKey(key);
      if (keyContext && fileIds.has(keyContext.fileId)) {
        this.inFlightPlotDisplayModelPrefetchByKey.delete(key);
        addPlotCacheChange(plotDisplayModelChanges, keyContext);
      }
    }

    if (!this.queuedCalculatedDataPrefetchByKey.size) {
      this.cancelScheduledCalculatedDataPrefetch();
    }
    if (!this.queuedPlotDisplayModelPrefetchByKey.size) {
      this.cancelScheduledPlotDisplayModelPrefetch();
    }

    this.fireCalculatedDataCacheChanges(calculatedDataChanges);
    this.firePlotDisplayModelCacheChanges(plotDisplayModelChanges);
  }

  private fireCalculatedDataCacheChanges(changes: PlotCacheChangeMap): void {
    for (const [fileId, plotTypes] of changes) {
      for (const plotType of plotTypes) {
        this.onDidChangeCalculatedDataCacheEmitter.fire({ fileId, plotType });
      }
    }
  }

  private firePlotDisplayModelCacheChanges(changes: PlotCacheChangeMap): void {
    for (const [fileId, plotTypes] of changes) {
      for (const plotType of plotTypes) {
        this.onDidChangePlotDisplayModelCacheEmitter.fire({ fileId, plotType });
      }
    }
  }

  private getCalculatedDataForFileRecord(file: FileRecord, plotType: PlotType): CalculatedData {
    const cachedByPlotType = this.calculatedDataCacheByFile.get(file);
    const cached = cachedByPlotType?.[plotType];
    if (cached) {
      return cached;
    }

    const calculatedData = createCalculatedDataForFileRecord({ file, plotType });
    return this.cacheCalculatedDataForFileRecord(file, plotType, calculatedData);
  }

  private cacheCalculatedDataForFileRecord(
    file: FileRecord,
    plotType: PlotType,
    calculatedData: CalculatedData,
  ): CalculatedData {
    const cachedByPlotType = this.calculatedDataCacheByFile.get(file);
    const cached = cachedByPlotType?.[plotType];
    if (cached) {
      return cached;
    }

    this.calculatedDataCacheByFile.set(file, {
      ...cachedByPlotType,
      [plotType]: calculatedData,
    });
    const key = getCalculatedDataPrefetchKey(file.id, plotType);
    this.unavailableCalculatedDataCacheKeys.delete(key);
    this.calculatedDataCacheKeys.add(key);
    this.onDidChangeCalculatedDataCacheEmitter.fire({
      fileId: file.id,
      plotType,
    });
    this.schedulePlotDisplayModelPrefetch();
    return calculatedData;
  }

  private scheduleCalculatedDataPrefetch(): void {
    if (this.cancelQueuedCalculatedDataPrefetch || !this.queuedCalculatedDataPrefetchByKey.size) {
      return;
    }

    const run = (): void => {
      this.cancelQueuedCalculatedDataPrefetch = null;
      this.flushQueuedCalculatedDataPrefetch();
    };
    if (typeof globalThis.requestAnimationFrame === "function") {
      const cancelAnimationFrame = globalThis.cancelAnimationFrame;
      const handle = globalThis.requestAnimationFrame(run);
      this.cancelQueuedCalculatedDataPrefetch = () => {
        cancelAnimationFrame?.(handle);
      };
      return;
    }

    const handle = globalThis.setTimeout(run, 0);
    this.cancelQueuedCalculatedDataPrefetch = () => {
      globalThis.clearTimeout(handle);
    };
  }

  private cancelScheduledCalculatedDataPrefetch(): void {
    this.cancelQueuedCalculatedDataPrefetch?.();
    this.cancelQueuedCalculatedDataPrefetch = null;
  }

  private clearQueuedCalculatedDataPrefetch(): void {
    this.calculatedDataPrefetchGeneration += 1;
    this.queuedCalculatedDataPrefetchByKey.clear();
    this.inFlightCalculatedDataPrefetchByKey.clear();
    this.cancelScheduledCalculatedDataPrefetch();
  }

  private flushQueuedCalculatedDataPrefetch(): void {
    const snapshot = this.resolveSnapshot(undefined);
    if (!snapshot) {
      this.queuedCalculatedDataPrefetchByKey.clear();
      return;
    }

    const startedAt = Date.now();
    let blockedOnCapacity = false;
    let processed = 0;
    while (
      this.queuedCalculatedDataPrefetchByKey.size &&
      processed < CALCULATED_DATA_PREFETCH_BATCH_LIMIT
    ) {
      const next = this.dequeueNextCalculatedDataPrefetch();
      if (!next) {
        break;
      }

      if (!this.canStartPlotPrefetch(next.priority)) {
        this.queuedCalculatedDataPrefetchByKey.set(
          getCalculatedDataPrefetchKey(next.fileId, next.plotType),
          next,
        );
        blockedOnCapacity = true;
        break;
      }

      const file = snapshot.filesById[next.fileId];
      if (file) {
        this.prefetchCalculatedDataForFileRecord(file, next.plotType, snapshot.sessionVersion, next.priority);
      }
      processed += 1;

      if (Date.now() - startedAt >= CALCULATED_DATA_PREFETCH_FRAME_BUDGET_MS) {
        break;
      }
    }

    if (this.queuedCalculatedDataPrefetchByKey.size && !blockedOnCapacity) {
      this.scheduleCalculatedDataPrefetch();
    }
  }

  private prefetchCalculatedDataForFileRecord(
    file: FileRecord,
    plotType: PlotType,
    sessionVersion: number,
    priority: PlotCalculatedDataPrefetchPriority,
  ): void {
    const key = getCalculatedDataPrefetchKey(file.id, plotType);
    if (
      this.hasCompletedCalculatedDataPrefetch(key) ||
      this.inFlightCalculatedDataPrefetchByKey.has(key)
    ) {
      return;
    }

    const generation = this.calculatedDataPrefetchGeneration;
    const requestId = this.nextCalculatedDataWorkerRequestId++;
    this.inFlightCalculatedDataPrefetchByKey.set(key, {
      priority,
      requestId,
    });
    void calculatePlotDataInWorker({
      file,
      plotType,
      priority,
      requestId,
      sessionVersion,
    }).then((result) => {
      this.deleteInFlightCalculatedDataPrefetch(key, requestId);
      if (generation !== this.calculatedDataPrefetchGeneration) {
        this.schedulePlotDisplayModelPrefetch();
        this.scheduleCalculatedDataPrefetch();
        return;
      }

      const snapshot = this.resolveSnapshot(undefined);
      const currentFile = snapshot?.filesById[file.id] ?? null;
      if (currentFile !== file) {
        this.schedulePlotDisplayModelPrefetch();
        this.scheduleCalculatedDataPrefetch();
        return;
      }

      if (!result) {
        if (hasFileRecordBaseCurves(currentFile) && !this.calculatedDataCacheKeys.has(key)) {
          this.getCalculatedDataForFileRecord(currentFile, plotType);
        } else {
          this.markCalculatedDataUnavailable(currentFile.id, plotType);
        }
        this.schedulePlotDisplayModelPrefetch();
        this.scheduleCalculatedDataPrefetch();
        return;
      }

      if (
        result.requestId !== requestId ||
        result.sessionVersion !== sessionVersion ||
        result.fileId !== file.id ||
        result.plotType !== plotType
      ) {
        this.schedulePlotDisplayModelPrefetch();
        this.scheduleCalculatedDataPrefetch();
        return;
      }

      if (!result.calculatedData) {
        if (hasFileRecordBaseCurves(currentFile) && !this.calculatedDataCacheKeys.has(key)) {
          this.getCalculatedDataForFileRecord(currentFile, result.plotType);
        } else {
          this.markCalculatedDataUnavailable(currentFile.id, result.plotType);
        }
        this.schedulePlotDisplayModelPrefetch();
        this.scheduleCalculatedDataPrefetch();
        return;
      }

      if (currentFile) {
        this.cacheCalculatedDataForFileRecord(currentFile, result.plotType, result.calculatedData);
      }
      this.schedulePlotDisplayModelPrefetch();
      this.scheduleCalculatedDataPrefetch();
    });
  }

  private dequeueNextCalculatedDataPrefetch(): QueuedCalculatedDataPrefetch | null {
    let nextKey: string | null = null;
    let nextPrefetch: QueuedCalculatedDataPrefetch | null = null;
    let nextPriority = Number.POSITIVE_INFINITY;
    for (const [key, prefetch] of this.queuedCalculatedDataPrefetchByKey) {
      const order = CALCULATED_DATA_PREFETCH_PRIORITY_ORDER[prefetch.priority];
      if (order < nextPriority) {
        nextKey = key;
        nextPrefetch = prefetch;
        nextPriority = order;
      }
    }

    if (nextKey) {
      this.queuedCalculatedDataPrefetchByKey.delete(nextKey);
    }
    return nextPrefetch;
  }

  private schedulePlotDisplayModelPrefetch(): void {
    if (this.cancelQueuedPlotDisplayModelPrefetch || !this.queuedPlotDisplayModelPrefetchByKey.size) {
      return;
    }

    const run = (): void => {
      this.cancelQueuedPlotDisplayModelPrefetch = null;
      this.flushQueuedPlotDisplayModelPrefetch();
    };
    if (typeof globalThis.requestAnimationFrame === "function") {
      const cancelAnimationFrame = globalThis.cancelAnimationFrame;
      const handle = globalThis.requestAnimationFrame(run);
      this.cancelQueuedPlotDisplayModelPrefetch = () => {
        cancelAnimationFrame?.(handle);
      };
      return;
    }

    const handle = globalThis.setTimeout(run, 0);
    this.cancelQueuedPlotDisplayModelPrefetch = () => {
      globalThis.clearTimeout(handle);
    };
  }

  private cancelScheduledPlotDisplayModelPrefetch(): void {
    this.cancelQueuedPlotDisplayModelPrefetch?.();
    this.cancelQueuedPlotDisplayModelPrefetch = null;
  }

  private clearPlotDisplayModelCache(): void {
    this.plotDisplayModelCacheByKey.clear();
    this.plotDisplayModelCacheUse = 0;
    this.plotInspectorDisplayModelCacheByKey.clear();
    this.plotInspectorDisplayModelCacheUse = 0;
  }

  private clearQueuedPlotDisplayModelPrefetch(): void {
    this.plotDisplayModelPrefetchGeneration += 1;
    this.queuedPlotDisplayModelPrefetchByKey.clear();
    this.inFlightPlotDisplayModelPrefetchByKey.clear();
    this.cancelScheduledPlotDisplayModelPrefetch();
  }

  private flushQueuedPlotDisplayModelPrefetch(): void {
    const snapshot = this.resolveSnapshot(undefined);
    if (!snapshot) {
      this.queuedPlotDisplayModelPrefetchByKey.clear();
      return;
    }

    const startedAt = Date.now();
    let blockedOnCalculatedData = false;
    let blockedOnCapacity = false;
    let processed = 0;
    while (
      this.queuedPlotDisplayModelPrefetchByKey.size &&
      processed < CALCULATED_DATA_PREFETCH_BATCH_LIMIT
    ) {
      const next = this.dequeueNextPlotDisplayModelPrefetch();
      if (!next) {
        break;
      }

      if (!this.canStartPlotPrefetch(next.priority, next.workerLane)) {
        this.queuedPlotDisplayModelPrefetchByKey.set(
          getQueuedPlotDisplayModelPrefetchKey(next),
          next,
        );
        blockedOnCapacity = true;
        break;
      }

      const calculatedData = this.getCachedCalculatedData({
        fileId: next.fileId,
        plotType: next.plotType,
        snapshot,
      });
      if (!calculatedData && this.isCalculatedDataUnavailable(next.fileId, next.plotType)) {
        processed += 1;
        continue;
      }
      if (!calculatedData) {
        this.queuedPlotDisplayModelPrefetchByKey.set(
          getQueuedPlotDisplayModelPrefetchKey(next),
          next,
        );
        this.prefetchCalculatedData([next.fileId], next.priority, next.plotType);
        blockedOnCalculatedData = true;
        break;
      }

      if (this.tryCacheImmediateInteractiveChartDisplayModel(next, calculatedData, snapshot)) {
        processed += 1;
        continue;
      }

      this.prefetchPlotDisplayModelForCalculatedData(
        next,
        calculatedData,
        snapshot,
      );
      processed += 1;

      if (Date.now() - startedAt >= CALCULATED_DATA_PREFETCH_FRAME_BUDGET_MS) {
        break;
      }
    }

    if (this.queuedPlotDisplayModelPrefetchByKey.size && !blockedOnCalculatedData && !blockedOnCapacity) {
      this.schedulePlotDisplayModelPrefetch();
    }
  }

  private queuePlotDisplayModelPrefetch(
    request: QueuedPlotDisplayModelPrefetch,
  ): void {
    const key = getQueuedPlotDisplayModelPrefetchKey(request);
    const queued = this.queuedPlotDisplayModelPrefetchByKey.get(key);
    if (
      !queued ||
      CALCULATED_DATA_PREFETCH_PRIORITY_ORDER[request.priority] <
        CALCULATED_DATA_PREFETCH_PRIORITY_ORDER[queued.priority]
    ) {
      this.queuedPlotDisplayModelPrefetchByKey.set(key, request);
    }
    this.schedulePlotDisplayModelPrefetch();
  }

  private clearQueuedInspectorDisplayModelPrefetchExcept(nextKey: string | null): void {
    let cleared = 0;
    for (const [key, request] of [...this.queuedPlotDisplayModelPrefetchByKey]) {
      if (key !== nextKey && request.stage === "inspector") {
        this.queuedPlotDisplayModelPrefetchByKey.delete(key);
        cleared += 1;
      }
    }

    if (cleared) {
      logPerf("plotService.clearQueuedInspectorDisplayModel", {
        cleared,
        queueLength: this.queuedPlotDisplayModelPrefetchByKey.size,
      });
    }
  }

  private tryCacheImmediateInteractiveChartDisplayModel(
    request: QueuedPlotDisplayModelPrefetch,
    calculatedData: CalculatedData,
    snapshot: SessionSnapshot,
  ): boolean {
    if (!isInteractivePlotPrefetchPriority(request.priority) || request.stage !== "chart") {
      return false;
    }

    const model = this.createPlotDisplayModel(
      calculatedData,
      request,
      snapshot,
      false,
    );
    if (!model) {
      return false;
    }

    this.cachePlotDisplayModel(calculatedData, request, model);
    return true;
  }

  private prefetchPlotDisplayModelForCalculatedData(
    request: QueuedPlotDisplayModelPrefetch,
    calculatedData: CalculatedData,
    snapshot: SessionSnapshot,
  ): void {
    if (request.stage === "inspector") {
      this.prefetchPlotInspectorDisplayModelForCalculatedData(
        request,
        calculatedData,
        snapshot,
      );
      return;
    }

    const cacheKey = this.getPlotDisplayModelCacheKey(calculatedData, request);
    const prefetchKey = this.getPlotDisplayModelPrefetchKey(calculatedData, request);
    const cached = this.getCachedPlotDisplayModelForKey(cacheKey, request.priority);
    if (
      cached ||
      this.inFlightPlotDisplayModelPrefetchByKey.has(prefetchKey)
    ) {
      return;
    }

    const generation = this.plotDisplayModelPrefetchGeneration;
    const requestId = this.nextPlotDisplayModelWorkerRequestId++;
    this.inFlightPlotDisplayModelPrefetchByKey.set(prefetchKey, {
      lane: request.workerLane,
      priority: request.priority,
      requestId,
    });
    void calculatePlotDisplayModelInWorker({
      axisSettings: this.getAxisSettings(snapshot),
      axisTitleOverridesByKey: this.state.axisTitleOverridesByKey,
      calculatedData,
      fileId: request.fileId,
      hiddenLegendKeys: request.hiddenLegendKeys,
      includeInspector: false,
      legendLabels: request.legendLabels,
      plotType: request.plotType,
      priority: request.priority,
      requestId,
      sessionVersion: snapshot.sessionVersion,
      workerLane: request.workerLane,
    }).then((result) => {
      this.deleteInFlightPlotDisplayModelPrefetch(prefetchKey, requestId);
      if (generation !== this.plotDisplayModelPrefetchGeneration) {
        this.scheduleCalculatedDataPrefetch();
        this.schedulePlotDisplayModelPrefetch();
        return;
      }

      const currentSnapshot = this.resolveSnapshot(undefined);
      const requestedFile = snapshot.filesById[request.fileId] ?? null;
      const currentFile = currentSnapshot?.filesById[request.fileId] ?? null;
      if (!currentSnapshot || currentFile !== requestedFile) {
        this.scheduleCalculatedDataPrefetch();
        this.schedulePlotDisplayModelPrefetch();
        return;
      }

      if (!result || !result.displayModel) {
        const model = this.createPlotDisplayModel(
          calculatedData,
          request,
          currentSnapshot,
          false,
        );
        if (model) {
          this.cachePlotDisplayModel(calculatedData, request, model);
        }
        this.scheduleCalculatedDataPrefetch();
        this.schedulePlotDisplayModelPrefetch();
        return;
      }

      if (
        result.requestId !== requestId ||
        result.sessionVersion !== snapshot.sessionVersion ||
        result.fileId !== request.fileId ||
        result.plotType !== request.plotType
      ) {
        this.scheduleCalculatedDataPrefetch();
        this.schedulePlotDisplayModelPrefetch();
        return;
      }

      this.cachePlotDisplayModel(calculatedData, request, result.displayModel);
      this.scheduleCalculatedDataPrefetch();
      this.schedulePlotDisplayModelPrefetch();
    });
  }

  private prefetchPlotInspectorDisplayModelForCalculatedData(
    request: QueuedPlotDisplayModelPrefetch,
    calculatedData: CalculatedData,
    snapshot: SessionSnapshot,
  ): void {
    const cacheKey = this.getPlotDisplayModelCacheKey(calculatedData, request);
    const prefetchKey = this.getPlotDisplayModelPrefetchKey(calculatedData, request);
    const cached = this.getCachedPlotInspectorDisplayModelForKey(cacheKey);
    if (
      cached ||
      this.inFlightPlotDisplayModelPrefetchByKey.has(prefetchKey)
    ) {
      return;
    }

    const generation = this.plotDisplayModelPrefetchGeneration;
    const requestId = this.nextPlotDisplayModelWorkerRequestId++;
    this.inFlightPlotDisplayModelPrefetchByKey.set(prefetchKey, {
      lane: request.workerLane,
      priority: request.priority,
      requestId,
    });
    void calculatePlotDisplayModelInWorker({
      axisSettings: this.getAxisSettings(snapshot),
      axisTitleOverridesByKey: this.state.axisTitleOverridesByKey,
      calculatedData,
      fileId: request.fileId,
      hiddenLegendKeys: request.hiddenLegendKeys,
      includeInspector: true,
      legendLabels: request.legendLabels,
      plotType: request.plotType,
      priority: request.priority,
      requestId,
      sessionVersion: snapshot.sessionVersion,
      workerLane: request.workerLane,
    }).then((result) => {
      this.deleteInFlightPlotDisplayModelPrefetch(prefetchKey, requestId);
      if (generation !== this.plotDisplayModelPrefetchGeneration) {
        this.scheduleCalculatedDataPrefetch();
        this.schedulePlotDisplayModelPrefetch();
        return;
      }

      const currentSnapshot = this.resolveSnapshot(undefined);
      const requestedFile = snapshot.filesById[request.fileId] ?? null;
      const currentFile = currentSnapshot?.filesById[request.fileId] ?? null;
      if (!currentSnapshot || currentFile !== requestedFile) {
        this.scheduleCalculatedDataPrefetch();
        this.schedulePlotDisplayModelPrefetch();
        return;
      }

      const inspectorModel = result?.displayModel?.inspector ??
        this.createPlotInspectorDisplayModel(
          calculatedData,
          request,
          currentSnapshot,
        );
      if (
        result &&
        (
          result.requestId !== requestId ||
          result.sessionVersion !== snapshot.sessionVersion ||
          result.fileId !== request.fileId ||
          result.plotType !== request.plotType
        )
      ) {
        this.scheduleCalculatedDataPrefetch();
        this.schedulePlotDisplayModelPrefetch();
        return;
      }

      if (inspectorModel) {
        this.cachePlotInspectorDisplayModel(calculatedData, request, inspectorModel);
      }
      this.scheduleCalculatedDataPrefetch();
      this.schedulePlotDisplayModelPrefetch();
    });
  }

  private dequeueNextPlotDisplayModelPrefetch(): QueuedPlotDisplayModelPrefetch | null {
    let nextKey: string | null = null;
    let nextPrefetch: QueuedPlotDisplayModelPrefetch | null = null;
    let nextPriority = Number.POSITIVE_INFINITY;
    for (const [key, prefetch] of this.queuedPlotDisplayModelPrefetchByKey) {
      const order = getPlotDisplayModelPrefetchOrder(prefetch);
      if (order < nextPriority) {
        nextKey = key;
        nextPrefetch = prefetch;
        nextPriority = order;
      }
    }

    if (nextKey) {
      this.queuedPlotDisplayModelPrefetchByKey.delete(nextKey);
    }
    return nextPrefetch;
  }

  private hasCompletedCalculatedDataPrefetch(key: string): boolean {
    return this.calculatedDataCacheKeys.has(key) ||
      this.unavailableCalculatedDataCacheKeys.has(key);
  }

  private isCalculatedDataUnavailable(fileId: FileId, plotType: PlotType): boolean {
    return this.unavailableCalculatedDataCacheKeys.has(getCalculatedDataPrefetchKey(fileId, plotType));
  }

  private markCalculatedDataUnavailable(fileId: FileId, plotType: PlotType): void {
    const key = getCalculatedDataPrefetchKey(fileId, plotType);
    if (this.unavailableCalculatedDataCacheKeys.has(key)) {
      return;
    }

    this.unavailableCalculatedDataCacheKeys.add(key);
    this.onDidChangeCalculatedDataCacheEmitter.fire({ fileId, plotType });
  }

  private deleteInFlightCalculatedDataPrefetch(key: string, requestId: number): void {
    if (this.inFlightCalculatedDataPrefetchByKey.get(key)?.requestId === requestId) {
      this.inFlightCalculatedDataPrefetchByKey.delete(key);
    }
  }

  private deleteInFlightPlotDisplayModelPrefetch(key: string, requestId: number): void {
    if (this.inFlightPlotDisplayModelPrefetchByKey.get(key)?.requestId === requestId) {
      this.inFlightPlotDisplayModelPrefetchByKey.delete(key);
    }
  }

  private canStartPlotPrefetch(
    priority: PlotCalculatedDataPrefetchPriority,
    workerLane?: PlotDisplayModelWorkerLane,
  ): boolean {
    if (workerLane === "detail") {
      return this.getDetailInFlightPlotPrefetchCount() < 1 &&
        this.getNonDetailInFlightPlotPrefetchCount() < PLOT_PREFETCH_MAX_IN_FLIGHT;
    }

    if (this.getNonDetailInFlightPlotPrefetchCount() >= PLOT_PREFETCH_MAX_IN_FLIGHT) {
      return false;
    }

    if (isInteractivePlotPrefetchPriority(priority)) {
      return true;
    }

    return this.getBackgroundInFlightPlotPrefetchCount() < PLOT_BACKGROUND_PREFETCH_MAX_IN_FLIGHT;
  }

  private getNonDetailInFlightPlotPrefetchCount(): number {
    let count = this.inFlightCalculatedDataPrefetchByKey.size;
    for (const inFlight of this.inFlightPlotDisplayModelPrefetchByKey.values()) {
      if (inFlight.lane !== "detail") {
        count += 1;
      }
    }
    return count;
  }

  private getDetailInFlightPlotPrefetchCount(): number {
    let count = 0;
    for (const inFlight of this.inFlightPlotDisplayModelPrefetchByKey.values()) {
      if (inFlight.lane === "detail") {
        count += 1;
      }
    }
    return count;
  }

  private getBackgroundInFlightPlotPrefetchCount(): number {
    let count = 0;
    for (const inFlight of this.inFlightCalculatedDataPrefetchByKey.values()) {
      if (!isInteractivePlotPrefetchPriority(inFlight.priority)) {
        count += 1;
      }
    }
    for (const inFlight of this.inFlightPlotDisplayModelPrefetchByKey.values()) {
      if (inFlight.lane !== "detail" && !isInteractivePlotPrefetchPriority(inFlight.priority)) {
        count += 1;
      }
    }
    return count;
  }

  private cachePlotDisplayModel(
    calculatedData: CalculatedData,
    input: PlotDisplayModelInput,
    model: PlotDisplayModel,
  ): PlotDisplayModel {
    const key = this.getPlotDisplayModelCacheKey(calculatedData, input);
    const retentionPriority = getPlotDisplayModelCacheRetentionPriority(input);
    const chartModel = model.inspector
      ? { ...model, inspector: null }
      : model;
    const cachedEntry = this.plotDisplayModelCacheByKey.get(key);
    const cached = cachedEntry?.model;
    if (cached) {
      const previousRetentionPriority = cachedEntry.retentionPriority;
      this.touchPlotDisplayModelCacheEntry(cachedEntry, retentionPriority);
      logPerf("plotService.cachePlotDisplayModel", {
        cacheSize: this.plotDisplayModelCacheByKey.size,
        fileId: chartModel.fileId,
        hardLimit: PLOT_DISPLAY_MODEL_CACHE_HARD_LIMIT,
        hasInspector: false,
        limit: PLOT_DISPLAY_MODEL_CACHE_LIMIT,
        plotType: chartModel.plotType,
        previousRetentionPriority,
        result: cachedEntry.retentionPriority === previousRetentionPriority ? "kept" : "upgraded",
        retentionPriority: cachedEntry.retentionPriority,
        signature: calculatedData.signature,
      });
      return cached;
    }

    this.plotDisplayModelCacheByKey.set(key, {
      lastUsed: ++this.plotDisplayModelCacheUse,
      model: chartModel,
      retentionPriority,
    });
    this.trimPlotDisplayModelCache();
    this.onDidChangePlotDisplayModelCacheEmitter.fire({
      fileId: chartModel.fileId,
      pane: "chart",
      plotType: chartModel.plotType,
    });
    logPerf("plotService.cachePlotDisplayModel", {
      cacheSize: this.plotDisplayModelCacheByKey.size,
      fileId: chartModel.fileId,
      hardLimit: PLOT_DISPLAY_MODEL_CACHE_HARD_LIMIT,
      hasInspector: false,
      limit: PLOT_DISPLAY_MODEL_CACHE_LIMIT,
      plotType: chartModel.plotType,
      retentionPriority,
      result: "created",
      signature: calculatedData.signature,
    });
    return chartModel;
  }

  private cachePlotInspectorDisplayModel(
    calculatedData: CalculatedData,
    input: PlotDisplayModelInput,
    model: PlotPaneDisplayModel,
  ): PlotPaneDisplayModel {
    const key = this.getPlotDisplayModelCacheKey(calculatedData, input);
    const fileId = normalizeStateKey(calculatedData.source.fileId);
    if (!fileId || !isPlotType(calculatedData.kind)) {
      return model;
    }
    const cachedEntry = this.plotInspectorDisplayModelCacheByKey.get(key);
    if (cachedEntry) {
      cachedEntry.lastUsed = ++this.plotInspectorDisplayModelCacheUse;
      logPerf("plotService.cachePlotInspectorDisplayModel", {
        cacheSize: this.plotInspectorDisplayModelCacheByKey.size,
        fileId,
        limit: PLOT_INSPECTOR_DISPLAY_MODEL_CACHE_LIMIT,
        plotType: calculatedData.kind,
        result: "kept",
        signature: calculatedData.signature,
      });
      return cachedEntry.model;
    }

    this.plotInspectorDisplayModelCacheByKey.set(key, {
      lastUsed: ++this.plotInspectorDisplayModelCacheUse,
      model,
    });
    this.trimPlotInspectorDisplayModelCache();
    this.onDidChangePlotDisplayModelCacheEmitter.fire({
      fileId,
      pane: "inspector",
      plotType: calculatedData.kind,
    });
    logPerf("plotService.cachePlotInspectorDisplayModel", {
      cacheSize: this.plotInspectorDisplayModelCacheByKey.size,
      fileId,
      limit: PLOT_INSPECTOR_DISPLAY_MODEL_CACHE_LIMIT,
      plotType: calculatedData.kind,
      result: "created",
      signature: calculatedData.signature,
    });
    return model;
  }

  private getCachedPlotDisplayModelForKey(
    key: string,
    retentionPriority: PlotCalculatedDataPrefetchPriority = "active",
  ): PlotDisplayModel | null {
    const cached = this.plotDisplayModelCacheByKey.get(key);
    if (!cached) {
      return null;
    }

    this.touchPlotDisplayModelCacheEntry(cached, retentionPriority);
    return cached.model;
  }

  private touchPlotDisplayModelCacheEntry(
    entry: PlotDisplayModelCacheEntry,
    retentionPriority: PlotCalculatedDataPrefetchPriority,
  ): void {
    entry.lastUsed = ++this.plotDisplayModelCacheUse;
    if (
      PLOT_DISPLAY_MODEL_CACHE_RETENTION_ORDER[retentionPriority] >
      PLOT_DISPLAY_MODEL_CACHE_RETENTION_ORDER[entry.retentionPriority]
    ) {
      entry.retentionPriority = retentionPriority;
    }
  }

  private getCachedPlotInspectorDisplayModelForKey(key: string): PlotPaneDisplayModel | null {
    const cached = this.plotInspectorDisplayModelCacheByKey.get(key);
    if (!cached) {
      return null;
    }

    cached.lastUsed = ++this.plotInspectorDisplayModelCacheUse;
    return cached.model;
  }

  private trimPlotDisplayModelCache(): void {
    if (this.plotDisplayModelCacheByKey.size <= PLOT_DISPLAY_MODEL_CACHE_LIMIT) {
      return;
    }

    let trimmed = 0;
    const trimmedRetentionPriorities = new Map<string, number>();
    while (this.plotDisplayModelCacheByKey.size > PLOT_DISPLAY_MODEL_CACHE_LIMIT) {
      const allowInteractiveTrim = this.plotDisplayModelCacheByKey.size > PLOT_DISPLAY_MODEL_CACHE_HARD_LIMIT;
      let oldestKey: string | null = null;
      let oldestLastUsed = Number.POSITIVE_INFINITY;
      let oldestRetentionOrder = Number.POSITIVE_INFINITY;
      for (const [key, entry] of this.plotDisplayModelCacheByKey) {
        if (!allowInteractiveTrim && !isBackgroundPlotDisplayModelCacheRetention(entry.retentionPriority)) {
          continue;
        }
        const retentionOrder = PLOT_DISPLAY_MODEL_CACHE_RETENTION_ORDER[entry.retentionPriority];
        if (
          retentionOrder < oldestRetentionOrder ||
          (retentionOrder === oldestRetentionOrder && entry.lastUsed < oldestLastUsed)
        ) {
          oldestKey = key;
          oldestLastUsed = entry.lastUsed;
          oldestRetentionOrder = retentionOrder;
        }
      }

      if (!oldestKey) {
        break;
      }

      const oldestEntry = this.plotDisplayModelCacheByKey.get(oldestKey);
      if (oldestEntry) {
        incrementCount(trimmedRetentionPriorities, oldestEntry.retentionPriority);
      }
      this.plotDisplayModelCacheByKey.delete(oldestKey);
      trimmed += 1;
    }

    if (trimmed) {
      const trimmedIdle = readCount(trimmedRetentionPriorities, "idle");
      const trimmedNearby = readCount(trimmedRetentionPriorities, "nearby");
      const trimmedRecent = readCount(trimmedRetentionPriorities, "recent");
      logPerf("plotService.trimPlotDisplayModelCache", {
        cacheSize: this.plotDisplayModelCacheByKey.size,
        hardLimit: PLOT_DISPLAY_MODEL_CACHE_HARD_LIMIT,
        limit: PLOT_DISPLAY_MODEL_CACHE_LIMIT,
        trimmed,
        trimmedActive: readCount(trimmedRetentionPriorities, "active"),
        trimmedBackground: trimmedIdle + trimmedNearby,
        trimmedHover: readCount(trimmedRetentionPriorities, "hover"),
        trimmedIdle,
        trimmedNearby,
        trimmedProtected: trimmed - trimmedIdle - trimmedNearby,
        trimmedRecent,
        trimmedRetentionPriorities: serializeCountMap(trimmedRetentionPriorities),
        trimmedVisible: readCount(trimmedRetentionPriorities, "visible"),
      });
    }
  }

  private trimPlotInspectorDisplayModelCache(): void {
    if (this.plotInspectorDisplayModelCacheByKey.size <= PLOT_INSPECTOR_DISPLAY_MODEL_CACHE_LIMIT) {
      return;
    }

    let trimmed = 0;
    while (this.plotInspectorDisplayModelCacheByKey.size > PLOT_INSPECTOR_DISPLAY_MODEL_CACHE_LIMIT) {
      let oldestKey: string | null = null;
      let oldestLastUsed = Number.POSITIVE_INFINITY;
      for (const [key, entry] of this.plotInspectorDisplayModelCacheByKey) {
        if (entry.lastUsed < oldestLastUsed) {
          oldestKey = key;
          oldestLastUsed = entry.lastUsed;
        }
      }

      if (!oldestKey) {
        break;
      }

      this.plotInspectorDisplayModelCacheByKey.delete(oldestKey);
      trimmed += 1;
    }

    if (trimmed) {
      logPerf("plotService.trimPlotInspectorDisplayModelCache", {
        cacheSize: this.plotInspectorDisplayModelCacheByKey.size,
        limit: PLOT_INSPECTOR_DISPLAY_MODEL_CACHE_LIMIT,
        trimmed,
      });
    }
  }

  private getPlotDisplayModelCacheKey(
    calculatedData: CalculatedData,
    input: PlotDisplayModelInput,
  ): string {
    return [
      calculatedData.source.fileId,
      calculatedData.kind,
      calculatedData.signature,
      stableStringList(input.hiddenLegendKeys ?? []),
      stableRecordKey(input.legendLabels ?? {}),
    ].join("|");
  }

  private getPlotDisplayModelPrefetchKey(
    calculatedData: CalculatedData,
    input: PlotDisplayModelInput & { readonly stage: PlotDisplayModelPrefetchStage },
  ): string {
    return [
      this.getPlotDisplayModelCacheKey(calculatedData, input),
      input.stage,
    ].join("|");
  }

  private resolveSnapshot(snapshot: SessionSnapshot | undefined): SessionSnapshot | null {
    return snapshot ?? this.sessionService?.getSnapshot() ?? null;
  }

  public getFileAxisSettings(snapshot: SessionSnapshot): PlotFileAxisSettings {
    return this.getAxisSettings(snapshot);
  }

  private getAxisSettings(snapshot: SessionSnapshot): FileAxisSettingsByFileId {
    return getFileAxisSettingsByFileId({
      axisSettings: this.getStoredAxisSettings(),
      snapshot,
    });
  }

  private getStoredAxisSettings(): FileAxisSettingsOverrides {
    return {
      xUnitByFileId: {
        ...readLegacyStringMap(this.settingsService.getConductorSettings()?.xUnitByFileId),
        ...this.storageService.getObject<Record<string, string>>(
          PLOT_AXIS_STORAGE_KEYS.xUnitByFileId,
          StorageScope.PROFILE,
          {},
        ),
      },
      yScaleByFileId: {
        ...readLegacyStringMap(this.settingsService.getConductorSettings()?.yScaleByFileId),
        ...this.storageService.getObject<Record<string, string>>(
          PLOT_AXIS_STORAGE_KEYS.yScaleByFileId,
          StorageScope.PROFILE,
          {},
        ),
      },
      yUnitByFileId: {
        ...readLegacyStringMap(this.settingsService.getConductorSettings()?.yUnitByFileId),
        ...this.storageService.getObject<Record<string, string>>(
          PLOT_AXIS_STORAGE_KEYS.yUnitByFileId,
          StorageScope.PROFILE,
          {},
        ),
      },
    };
  }

  private storeAxisSettings(key: string, value: Record<string, string>): void {
    this.storageService.store(key, value, StorageScope.PROFILE, StorageTarget.USER);
  }
}

export const shouldInvalidatePlotModelsForSessionChange = (
  event: SessionChangeEvent,
): boolean => {
	  switch (event.reason) {
	    case "sliceRunChanged":
	      return true;
    case "curvesChanged":
      return hasPlotBaseCurveChange(event);
    case "filesRemoved":
    case "sessionCleared":
      return true;
    case "rawTablesChanged":
    case "tableFactsChanged":
    case "reviewChanged":
    case "calculatedRecordsChanged":
    case "metricsChanged":
    case "metricInputsChanged":
    case "fileMetadataChanged":
      return false;
  }
};

const hasPlotBaseCurveChange = (event: SessionChangeEvent): boolean => {
  const curveKeys = event.curveKeys ?? [];
  return curveKeys.length === 0 || curveKeys.some(isBaseCurveKey);
};

const isBaseCurveKey = (curveKey: CurveKey): boolean =>
  curveKey.startsWith("base:");

const shouldFullyInvalidatePlotModelsForSessionChange = (
  event: SessionChangeEvent,
  affectedFileIds: ReadonlySet<FileId>,
): boolean =>
  event.reason === "filesRemoved" ||
  event.reason === "sessionCleared" ||
  affectedFileIds.size === 0;

const getAffectedPlotFileIds = (event: SessionChangeEvent): ReadonlySet<FileId> =>
  new Set((event.fileIds ?? [])
    .map(fileId => normalizeStateKey(fileId))
    .filter((fileId): fileId is FileId => Boolean(fileId)));

const resolveCalculatedDataFile = (
  snapshot: SessionSnapshot,
  fileId?: string | null,
): FileRecord | null => {
  const normalizedFileId = normalizeStateKey(fileId);
  if (normalizedFileId) {
    const file = snapshot.filesById[normalizedFileId];
    return file && hasFileRecordChartData(file) ? file : null;
  }

  for (const orderedFileId of uniqueStrings([
    ...snapshot.fileOrder,
    ...Object.keys(snapshot.filesById),
  ])) {
    const file = snapshot.filesById[orderedFileId];
    if (file && hasFileRecordChartData(file)) {
      return file;
    }
  }

  return null;
};

const hasFileRecordChartData = (file: FileRecord): boolean =>
  Object.values(file.curvesByKey).some(curve => curve.curveGeneration === "base");

const uniqueStrings = <T extends string>(values: readonly T[]): T[] => {
  const result: T[] = [];
  const seen = new Set<T>();
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }
  return result;
};

const getCalculatedDataPrefetchKey = (fileId: FileId, plotType: PlotType): string =>
  `${plotType}:${fileId}`;

const getCalculatedDataPrefetchContext = (
  key: string,
): { readonly fileId: FileId; readonly plotType: PlotType } | null => {
  const separatorIndex = key.indexOf(":");
  const plotType = separatorIndex >= 0 ? key.slice(0, separatorIndex) : "";
  if (!isPlotType(plotType)) {
    return null;
  }

  const fileId = normalizeStateKey(separatorIndex >= 0 ? key.slice(separatorIndex + 1) : key);
  return fileId ? { fileId, plotType } : null;
};

const getPlotDisplayModelContextFromKey = (
  key: string,
): { readonly fileId: FileId; readonly plotType: PlotType } | null => {
  const [fileIdRaw, plotTypeRaw] = key.split("|");
  const fileId = normalizeStateKey(fileIdRaw);
  return fileId && isPlotType(plotTypeRaw)
    ? { fileId, plotType: plotTypeRaw }
    : null;
};

const getPlotLegendStateKey = (
  fileId: FileId,
  plotType: PlotType,
): string | null => {
  const normalizedFileId = normalizeStateKey(fileId);
  return normalizedFileId && isPlotType(plotType)
    ? `${normalizedFileId}:${plotType}`
    : null;
};

const addPlotCacheChange = (
  changes: PlotCacheChangeMap,
  context: { readonly fileId: FileId; readonly plotType: PlotType },
): void => {
  const fileId = normalizeStateKey(context.fileId);
  const plotType = context.plotType;
  if (!fileId || !isPlotType(plotType)) {
    return;
  }

  let plotTypes = changes.get(fileId);
  if (!plotTypes) {
    plotTypes = new Set();
    changes.set(fileId, plotTypes);
  }
  plotTypes.add(plotType);
};

const getQueuedPlotDisplayModelPrefetchKey = (
  input: Pick<QueuedPlotDisplayModelPrefetch, "fileId" | "hiddenLegendKeys" | "legendLabels" | "plotType" | "stage">,
): string =>
  [
    input.fileId,
    input.plotType,
    input.stage,
    stableStringList(input.hiddenLegendKeys),
    stableRecordKey(input.legendLabels),
  ].join("|");

const getInspectorPlotDisplayModelPrefetchPriority = (
  priority: PlotCalculatedDataPrefetchPriority,
): PlotCalculatedDataPrefetchPriority => {
  switch (priority) {
    case "active":
      return "active";
    case "hover":
    case "visible":
      return "nearby";
    case "recent":
      return "nearby";
    case "nearby":
    case "idle":
      return "idle";
  }
};

const getPlotDisplayModelPrefetchOrder = (
  prefetch: QueuedPlotDisplayModelPrefetch,
): number =>
  CALCULATED_DATA_PREFETCH_PRIORITY_ORDER[prefetch.priority] * 2 +
  (prefetch.stage === "inspector" ? 1 : 0);

const getPlotDisplayModelCacheRetentionPriority = (
  input: PlotDisplayModelInput,
): PlotCalculatedDataPrefetchPriority => {
  const priority = (input as { readonly priority?: PlotCalculatedDataPrefetchPriority }).priority;
  return priority ?? "active";
};

const stableStringList = (values: readonly string[]): string =>
  [...new Set(values.map(normalizeStateKey).filter(Boolean))]
    .sort()
    .join(",");

const stableRecordKey = (record: Readonly<Record<string, string>>): string =>
  Object.entries(record)
    .map(([key, value]) => [normalizeStateKey(key), String(value ?? "")] as const)
    .filter(([key]) => Boolean(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join(",");

const incrementCount = (counts: Map<string, number>, key: string): void => {
  counts.set(key, (counts.get(key) ?? 0) + 1);
};

const readCount = (counts: ReadonlyMap<string, number>, key: string): number =>
  counts.get(key) ?? 0;

const serializeCountMap = (counts: ReadonlyMap<string, number>): string =>
  [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `${key}:${count}`)
    .join(",");

const isInteractivePlotPrefetchPriority = (priority: PlotCalculatedDataPrefetchPriority): boolean =>
  priority === "active" || priority === "hover";

const isBackgroundPlotDisplayModelCacheRetention = (
  priority: PlotCalculatedDataPrefetchPriority,
): boolean =>
  priority === "idle" || priority === "nearby";

const areRecordMapsEqual = (
  first: Readonly<Record<string, string>>,
  second: Readonly<Record<string, string>>,
): boolean => {
  const firstKeys = Object.keys(first).sort();
  const secondKeys = Object.keys(second).sort();
  return firstKeys.length === secondKeys.length &&
    firstKeys.every((key, index) =>
      key === secondKeys[index] && first[key] === second[key],
    );
};

const areNestedRecordMapsEqual = (
  first: Readonly<Record<string, Readonly<Record<string, string>>>>,
  second: Readonly<Record<string, Readonly<Record<string, string>>>>,
): boolean => {
  const firstKeys = Object.keys(first).sort();
  const secondKeys = Object.keys(second).sort();
  return firstKeys.length === secondKeys.length &&
    firstKeys.every((key, index) =>
      key === secondKeys[index] &&
      areRecordMapsEqual(first[key] ?? {}, second[key] ?? {})
    );
};

const areStringArraysEqual = (
  first: readonly string[],
  second: readonly string[],
): boolean =>
  first.length === second.length &&
  first.every((value, index) => value === second[index]);

const areStringArrayMapsEqual = (
  first: Readonly<Record<string, readonly string[]>>,
  second: Readonly<Record<string, readonly string[]>>,
): boolean => {
  const firstKeys = Object.keys(first).sort();
  const secondKeys = Object.keys(second).sort();
  return areStringArraysEqual(firstKeys, secondKeys) &&
    firstKeys.every(key => areStringArraysEqual(first[key] ?? [], second[key] ?? []));
};

const normalizeStateKey = (value: unknown): string =>
  String(value ?? "").trim();

const normalizeUniqueStringList = (values: readonly unknown[]): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeStateKey(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }
  return result;
};

const normalizeLegendLabelMap = (
  labels: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> => {
  const result: Record<string, string> = {};
  for (const [key, label] of Object.entries(labels)) {
    const normalizedKey = normalizeStateKey(key);
    const normalizedLabel = String(label ?? "").trim();
    if (normalizedKey && normalizedLabel) {
      result[normalizedKey] = normalizedLabel;
    }
  }
  return result;
};

const readLegacyStringMap = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = normalizeStateKey(key);
    if (normalizedKey && typeof item === "string") {
      result[normalizedKey] = item;
    }
  }
  return result;
};

registerSingleton(IPlotService, PlotService, InstantiationType.Delayed);
