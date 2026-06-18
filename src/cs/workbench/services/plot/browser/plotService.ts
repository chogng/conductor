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
  type PlotState,
  type PlotType,
} from "src/cs/workbench/services/plot/common/plot";
import type { PlotMainRenderModel } from "src/cs/workbench/services/plot/common/plotModel";
import { createPlotMainRenderModel } from "src/cs/workbench/services/plot/browser/plotRenderModel";
import {
  calculatePlotDataInWorker,
  calculatePlotDisplayModelInWorker,
} from "src/cs/workbench/services/plot/browser/plotCalculatedDataWorkerClient";
import {
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
  nearby: 3,
  idle: 4,
};
const CALCULATED_DATA_PREFETCH_BATCH_LIMIT = 4;
const CALCULATED_DATA_PREFETCH_FRAME_BUDGET_MS = 6;
const PLOT_PREFETCH_MAX_IN_FLIGHT = 2;
const PLOT_BACKGROUND_PREFETCH_MAX_IN_FLIGHT = 1;

type PlotDisplayModelPrefetchStage = "chart" | "full";

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
};

type InFlightPlotPrefetch = {
  readonly priority: PlotCalculatedDataPrefetchPriority;
  readonly requestId: number;
};

type PlotCacheChangeMap = Map<FileId, Set<PlotType>>;

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
  private readonly plotDisplayModelCacheByKey = new Map<string, PlotDisplayModel>();
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

    return this.plotDisplayModelCacheByKey.get(this.getPlotDisplayModelCacheKey(
      calculatedData,
      input,
    )) ?? null;
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

  public getPlotDisplayModel(input: PlotDisplayModelInput): PlotDisplayModel | null {
    const snapshot = this.resolveSnapshot(input.snapshot);
    const calculatedData = this.getCalculatedData({
      fileId: input.fileId,
      plotType: input.plotType,
      snapshot: snapshot ?? undefined,
    });
    const model = this.createPlotDisplayModel(calculatedData, input, snapshot ?? undefined);
    if (model && calculatedData) {
      this.cachePlotDisplayModel(calculatedData, input, model);
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

  public getPlotMainRenderModel(input: PlotMainRenderModelInput): PlotMainRenderModel | null {
    const calculatedData = this.getCalculatedData(input);
    return calculatedData ? createPlotMainRenderModel(calculatedData) : null;
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

    const plotType = input.plotType && isPlotType(input.plotType)
      ? input.plotType
      : this.state.activePlotType;
    const fileId = normalizeStateKey(input.fileId);
    if (!fileId) {
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
    const cachedDisplayModel = calculatedData ? this.getCachedPlotDisplayModel({
      fileId,
      hiddenLegendKeys: input.hiddenLegendKeys,
      legendLabels: input.legendLabels,
      plotType,
      snapshot,
    }) : null;
    if (cachedDisplayModel?.inspector) {
      endPerf({
        cacheHit: true,
        calculatedDataWarmed,
        plotType,
        result: "fullCacheHit",
      });
      return;
    }
    const stage: PlotDisplayModelPrefetchStage = cachedDisplayModel ? "full" : "chart";
    const request: QueuedPlotDisplayModelPrefetch = {
      fileId,
      hiddenLegendKeys: [...(input.hiddenLegendKeys ?? [])],
      legendLabels: { ...(input.legendLabels ?? {}) },
      plotType,
      priority,
      stage,
    };
    if (
      calculatedData &&
      this.tryCacheImmediateInteractiveChartDisplayModel(request, calculatedData, snapshot)
    ) {
      endPerf({
        calculatedDataWarmed,
        immediate: true,
        plotType,
        result: "chartCached",
        stage,
      });
      return;
    }

    const key = getQueuedPlotDisplayModelPrefetchKey(request);
    const calculatedDataCacheKey = calculatedData
      ? this.getPlotDisplayModelPrefetchKey(calculatedData, {
        ...input,
        stage,
      })
      : null;
    const inFlight = calculatedDataCacheKey
      ? this.inFlightPlotDisplayModelPrefetchByKey.get(calculatedDataCacheKey)
      : undefined;
    if (inFlight) {
      if (
        CALCULATED_DATA_PREFETCH_PRIORITY_ORDER[priority] <
        CALCULATED_DATA_PREFETCH_PRIORITY_ORDER[inFlight.priority]
      ) {
        this.inFlightPlotDisplayModelPrefetchByKey.set(calculatedDataCacheKey!, {
          ...inFlight,
          priority,
        });
      }
      this.queuedPlotDisplayModelPrefetchByKey.delete(key);
      endPerf({
        inFlight: true,
        plotType,
        result: "inFlightPromoted",
        stage,
      });
      return;
    }

    const queued = this.queuedPlotDisplayModelPrefetchByKey.get(key);
    if (
      !queued ||
      CALCULATED_DATA_PREFETCH_PRIORITY_ORDER[priority] <
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
      stage,
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
    this.updateState({
      activePlotType: plotType,
    });
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
    });
  }

  private updateState(updates: Partial<PlotState>): void {
    const nextState = {
      ...this.state,
      ...updates,
    };
    if (
      this.state.activePlotType === nextState.activePlotType &&
      areRecordMapsEqual(this.state.axisTitleOverridesByKey, nextState.axisTitleOverridesByKey) &&
      areNestedRecordMapsEqual(this.state.legendLabelsByFileId, nextState.legendLabelsByFileId)
    ) {
      return;
    }

    this.state = nextState;
    this.clearPlotDisplayModelCache();
    this.clearQueuedPlotDisplayModelPrefetch();
    this.onDidChangePlotStateEmitter.fire(nextState);
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

      if (!this.canStartPlotPrefetch(next.priority)) {
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

    const cached = this.cachePlotDisplayModel(calculatedData, request, model);
    this.scheduleFullPlotDisplayModelPrefetchIfNeeded(request, cached);
    return true;
  }

  private prefetchPlotDisplayModelForCalculatedData(
    request: QueuedPlotDisplayModelPrefetch,
    calculatedData: CalculatedData,
    snapshot: SessionSnapshot,
  ): void {
    const cacheKey = this.getPlotDisplayModelCacheKey(calculatedData, request);
    const prefetchKey = this.getPlotDisplayModelPrefetchKey(calculatedData, request);
    const cached = this.plotDisplayModelCacheByKey.get(cacheKey);
    if (
      (cached && (request.stage === "chart" || cached.inspector)) ||
      this.inFlightPlotDisplayModelPrefetchByKey.has(prefetchKey)
    ) {
      return;
    }

    const generation = this.plotDisplayModelPrefetchGeneration;
    const requestId = this.nextPlotDisplayModelWorkerRequestId++;
    this.inFlightPlotDisplayModelPrefetchByKey.set(prefetchKey, {
      priority: request.priority,
      requestId,
    });
    void calculatePlotDisplayModelInWorker({
      axisSettings: this.getAxisSettings(snapshot),
      axisTitleOverridesByKey: this.state.axisTitleOverridesByKey,
      calculatedData,
      fileId: request.fileId,
      hiddenLegendKeys: request.hiddenLegendKeys,
      includeInspector: request.stage === "full",
      legendLabels: request.legendLabels,
      plotType: request.plotType,
      requestId,
      sessionVersion: snapshot.sessionVersion,
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
          request.stage === "full",
        );
        if (model) {
          this.cachePlotDisplayModel(calculatedData, request, model);
          this.scheduleFullPlotDisplayModelPrefetchIfNeeded(request, model);
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
      this.scheduleFullPlotDisplayModelPrefetchIfNeeded(request, result.displayModel);
      this.scheduleCalculatedDataPrefetch();
      this.schedulePlotDisplayModelPrefetch();
    });
  }

  private scheduleFullPlotDisplayModelPrefetchIfNeeded(
    request: QueuedPlotDisplayModelPrefetch,
    model: PlotDisplayModel,
  ): void {
    if (request.stage !== "chart" || model.inspector) {
      return;
    }

    this.queuePlotDisplayModelPrefetch({
      fileId: request.fileId,
      hiddenLegendKeys: request.hiddenLegendKeys,
      legendLabels: request.legendLabels,
      plotType: request.plotType,
      priority: request.priority,
      stage: "full",
    });
  }

  private dequeueNextPlotDisplayModelPrefetch(): QueuedPlotDisplayModelPrefetch | null {
    let nextKey: string | null = null;
    let nextPrefetch: QueuedPlotDisplayModelPrefetch | null = null;
    let nextPriority = Number.POSITIVE_INFINITY;
    for (const [key, prefetch] of this.queuedPlotDisplayModelPrefetchByKey) {
      const order = CALCULATED_DATA_PREFETCH_PRIORITY_ORDER[prefetch.priority];
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

  private canStartPlotPrefetch(priority: PlotCalculatedDataPrefetchPriority): boolean {
    if (this.getTotalInFlightPlotPrefetchCount() >= PLOT_PREFETCH_MAX_IN_FLIGHT) {
      return false;
    }

    if (isInteractivePlotPrefetchPriority(priority)) {
      return true;
    }

    return this.getBackgroundInFlightPlotPrefetchCount() < PLOT_BACKGROUND_PREFETCH_MAX_IN_FLIGHT;
  }

  private getTotalInFlightPlotPrefetchCount(): number {
    return this.inFlightCalculatedDataPrefetchByKey.size + this.inFlightPlotDisplayModelPrefetchByKey.size;
  }

  private getBackgroundInFlightPlotPrefetchCount(): number {
    let count = 0;
    for (const inFlight of this.inFlightCalculatedDataPrefetchByKey.values()) {
      if (!isInteractivePlotPrefetchPriority(inFlight.priority)) {
        count += 1;
      }
    }
    for (const inFlight of this.inFlightPlotDisplayModelPrefetchByKey.values()) {
      if (!isInteractivePlotPrefetchPriority(inFlight.priority)) {
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
    const cached = this.plotDisplayModelCacheByKey.get(key);
    if (cached) {
      if (cached.inspector || !model.inspector) {
        logPerf("plotService.cachePlotDisplayModel", {
          fileId: model.fileId,
          hasInspector: Boolean(model.inspector),
          plotType: model.plotType,
          result: "kept",
          signature: calculatedData.signature,
        });
        return cached;
      }

      this.plotDisplayModelCacheByKey.set(key, model);
      this.onDidChangePlotDisplayModelCacheEmitter.fire({
        fileId: model.fileId,
        plotType: model.plotType,
      });
      logPerf("plotService.cachePlotDisplayModel", {
        fileId: model.fileId,
        hasInspector: Boolean(model.inspector),
        plotType: model.plotType,
        result: "upgraded",
        signature: calculatedData.signature,
      });
      return model;
    }

    this.plotDisplayModelCacheByKey.set(key, model);
    this.onDidChangePlotDisplayModelCacheEmitter.fire({
      fileId: model.fileId,
      plotType: model.plotType,
    });
    logPerf("plotService.cachePlotDisplayModel", {
      fileId: model.fileId,
      hasInspector: Boolean(model.inspector),
      plotType: model.plotType,
      result: "created",
      signature: calculatedData.signature,
    });
    return model;
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
    case "templateRunChanged":
    case "curvesChanged":
    case "metricsChanged":
    case "calculatedRecordsChanged":
    case "filesRemoved":
    case "sessionCleared":
      return true;
    case "rawTablesChanged":
    case "assessmentChanged":
    case "metricInputsChanged":
    case "fileMetadataChanged":
      return false;
  }
};

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

const isInteractivePlotPrefetchPriority = (priority: PlotCalculatedDataPrefetchPriority): boolean =>
  priority === "active" || priority === "hover";

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

const normalizeStateKey = (value: unknown): string =>
  String(value ?? "").trim();

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
