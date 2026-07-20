/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { logPerf, startPerf } from "src/cs/workbench/common/perf";
import {
  IStorageService,
  StorageScope,
  StorageTarget,
} from "src/cs/platform/storage/common/storage";
import {
  createCalculatedDataForCalculationResourceResult,
  type CalculatedData,
} from "src/cs/workbench/services/calculation/common/calculationReadModel";
import {
  ICalculationService,
  type ICalculationService as ICalculationServiceType,
} from "src/cs/workbench/services/calculation/common/calculation";
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
  type PlotAxisOverrides,
  type PlotLegendModel,
  type PlotPaneDisplayModel,
  type PlotRenderModel,
  type PlotState,
  type PlotTarget,
  type PlotType,
} from "src/cs/workbench/services/plot/common/plot";
import { createPlotMainRenderModel } from "src/cs/workbench/services/plot/browser/plotRenderModel";
import {
  PlotCalculatedDataWorkerClient,
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
import type { SeriesId } from "src/cs/workbench/services/calculation/common/calculationRecords";

const PLOT_AXIS_OVERRIDES_STORAGE_KEY = "plot.axisOverrides";

type StoredPlotAxisOverrides = PlotAxisOverrides & PlotTarget;

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

type QueuedPlotDisplayModelPrefetch = {
  readonly hiddenLegendKeys: readonly string[];
  readonly legendLabels: Readonly<Record<string, string>>;
  readonly plotType: PlotType;
  readonly priority: PlotCalculatedDataPrefetchPriority;
  readonly resource: URI;
  readonly stage: PlotDisplayModelPrefetchStage;
  readonly sheetId?: string | null;
  readonly workerLane?: PlotDisplayModelWorkerLane;
};

type PlotDisplayModelPrefetchResult = {
  readonly calculatedDataReady?: boolean;
  readonly calculatedDataWarmed?: boolean;
  readonly cacheHit?: boolean;
  readonly immediate?: boolean;
  readonly inFlight?: boolean;
  readonly missingCalculatedData?: PlotTarget;
  readonly plotType?: PlotType;
  readonly queued?: boolean;
  readonly result: string;
  readonly stage?: PlotDisplayModelPrefetchStage;
};

type ResolvedPlotDisplayModelInput = PlotDisplayModelInput & {
  readonly hiddenLegendKeys: readonly SeriesId[];
  readonly legendLabels: Readonly<Record<SeriesId, string>>;
  readonly plotType: PlotType;
};

type InFlightPlotPrefetch = {
  readonly lane?: PlotDisplayModelWorkerLane;
  readonly priority: PlotCalculatedDataPrefetchPriority;
  readonly requestId: number;
};

type PlotCacheChangeMap = Map<string, Set<PlotType>>;
type PlotCacheResourceMap = ReadonlyMap<string, PlotTarget>;

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
    legendLabels: {},
  };
  private readonly calculatedDataCacheKeys = new Set<string>();
  private readonly calculatedDataCache = new Map<string, CalculatedData>();
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
    private readonly calculatedDataWorkerClient: PlotCalculatedDataWorkerClient,
    @IStorageService private readonly storageService: IStorageService,
    @ICalculationService private readonly calculationService: ICalculationServiceType,
  ) {
    super();

    this._register(this.calculatedDataWorkerClient);
    this._register(this.calculationService.onDidChangeResourceCalculationResult(resource => {
      this.invalidatePlotModelsForResourceChange(resource.resource, resource.sheetId);
    }));
    this._register({ dispose: () => this.cancelScheduledPlotDisplayModelPrefetch() });
  }

  public getState(): PlotState {
    return this.state;
  }

  public getCachedCalculatedData(input: PlotCalculatedDataInput): CalculatedData | null {
    return this.getCachedCalculatedDataForInput(input);
  }

  public getCachedPlotRenderModel(input: PlotCalculatedDataInput): PlotRenderModel | null {
    const calculatedData = this.getCachedCalculatedDataForInput(input);
    return calculatedData
      ? {
          ...createPlotMainRenderModel(calculatedData),
          signature: calculatedData.signature,
        }
      : null;
  }

  private getCachedCalculatedDataForInput(
    input: PlotCalculatedDataInput,
  ): CalculatedData | null {
    const plotType = input.plotType && isPlotType(input.plotType)
      ? input.plotType
      : this.state.activePlotType;
    return this.getCachedCalculatedDataForResource(getPlot(input), plotType);
  }

  public getCachedPlotLegendModel(input: PlotCalculatedDataInput): PlotLegendModel | null {
    return this.createPlotLegendModel(this.getCachedCalculatedData(input));
  }

  public getCachedPlotDisplayModel(input: PlotDisplayModelInput): PlotDisplayModel | null {
    const calculatedData = this.getCachedCalculatedDataForInput({
      plotType: input.plotType,
      resource: input.resource,
      sheetId: input.sheetId,
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
    const calculatedData = this.getCachedCalculatedDataForInput({
      plotType: input.plotType,
      resource: input.resource,
      sheetId: input.sheetId,
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
    return this.getCalculatedDataForInput(input);
  }

  private getCalculatedDataForInput(
    input: PlotCalculatedDataInput,
  ): CalculatedData | null {
    const plotType = input.plotType && isPlotType(input.plotType)
      ? input.plotType
      : this.state.activePlotType;
    const calculatedData = this.getCalculatedDataForResource(input, plotType);
    logPerf("plotService.getCalculatedData", {
      id: getPlot(input),
      plotType,
      resultPointsCount: calculatedData?.pointsCount ?? 0,
      source: "calculationResource",
    });
    return calculatedData;
  }

  private requestCalculatedDataForInput(
    input: PlotCalculatedDataInput,
  ): CalculatedData | null {
    const calculatedData = this.getCalculatedDataForInput(input);
    if (!calculatedData) {
      this.calculationService.prioritizeResource(input.resource, input.sheetId);
    }
    return calculatedData;
  }

  public getLegendLabels(target: PlotTarget): Readonly<Record<SeriesId, string>> {
    const key = getPlotTargetStateKey(target);
    return key
      ? this.state.legendLabels[key] ?? {}
      : {};
  }

  public getHiddenLegendKeys(
    target: PlotTarget,
    plotType: PlotType,
    liveLegendKeys: readonly SeriesId[],
  ): readonly SeriesId[] {
    const key = getPlotLegendStateKey(target, plotType);
    if (!key) {
      return [];
    }

    const liveKeys = new Set(normalizeUniqueStringList(liveLegendKeys));
    return this.getStoredHiddenLegendKeys(target, plotType)
      .filter(legendKey => liveKeys.has(legendKey));
  }

  private getStoredHiddenLegendKeys(
    target: PlotTarget,
    plotType: PlotType,
  ): readonly SeriesId[] {
    const key = getPlotLegendStateKey(target, plotType);
    return key ? this.state.hiddenLegendKeysByPlotKey[key] ?? [] : [];
  }

  public getPlotLegendModel(input: PlotCalculatedDataInput): PlotLegendModel | null {
    return this.createPlotLegendModel(this.getCalculatedData(input));
  }

  private createPlotLegendModel(calculatedData: CalculatedData | null): PlotLegendModel | null {
    const resource = calculatedData?.source.resource;
    if (!calculatedData || !resource || !calculatedData.seriesList.length) {
      return null;
    }

    return {
      plotType: calculatedData.kind as PlotType,
      resource,
      seriesList: createPlotMainRenderModel(calculatedData).seriesList,
      sheetId: calculatedData.source.sheetId ?? null,
    };
  }

  private resolvePlotDisplayModelInput(
    input: PlotDisplayModelInput,
    calculatedData?: CalculatedData | null,
  ): ResolvedPlotDisplayModelInput | null {
    const id = getPlot(input);
    const plotType = isPlotType(calculatedData?.kind)
      ? calculatedData.kind
      : input.plotType && isPlotType(input.plotType)
        ? input.plotType
        : this.state.activePlotType;
    if (!id || !isPlotType(plotType)) {
      return null;
    }

    return {
      ...input,
      hiddenLegendKeys: input.hiddenLegendKeys !== undefined
        ? normalizeUniqueStringList(input.hiddenLegendKeys)
        : this.getStoredHiddenLegendKeys(input, plotType),
      legendLabels: input.legendLabels !== undefined
        ? normalizeLegendLabelMap(input.legendLabels)
        : this.getLegendLabels(input),
      plotType,
    };
  }

  public getPlotDisplayModel(input: PlotDisplayModelInput): PlotDisplayModel | null {
    const calculatedData = this.getCalculatedDataForInput({
      plotType: input.plotType,
      resource: input.resource,
      sheetId: input.sheetId,
    });
    const resolvedInput = this.resolvePlotDisplayModelInput(input, calculatedData);
    const model = resolvedInput
      ? this.createPlotDisplayModel(calculatedData, resolvedInput)
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
    includeInspector = true,
  ): PlotDisplayModel | null {
    if (!calculatedData?.source.resource) {
      return null;
    }

    const axisOverrides = this.resolveAxisOverrides({
      resource: calculatedData.source.resource,
      sheetId: calculatedData.source.sheetId,
    });
    return createPlotDisplayModelFromCalculatedData({
      axisOverrides,
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
  ): PlotPaneDisplayModel | null {
    if (!calculatedData?.source.resource) {
      return null;
    }

    const axisOverrides = this.resolveAxisOverrides({
      resource: calculatedData.source.resource,
      sheetId: calculatedData.source.sheetId,
    });
    return createPlotInspectorDisplayModelFromCalculatedData({
      axisOverrides,
      axisTitleOverridesByKey: this.state.axisTitleOverridesByKey,
      calculatedData,
      hiddenLegendKeys: input.hiddenLegendKeys,
      legendLabels: input.legendLabels,
    });
  }

  public getPlotRenderModel(input: PlotCalculatedDataInput): PlotRenderModel | null {
    const calculatedData = this.getCalculatedData(input);
    return calculatedData
      ? {
          ...createPlotMainRenderModel(calculatedData),
          signature: calculatedData.signature,
        }
      : null;
  }

  public cancelQueuedPlotInspectorDisplayModelPrefetch(): void {
    this.clearQueuedInspectorDisplayModelPrefetchExcept(null);
    if (!this.queuedPlotDisplayModelPrefetchByKey.size) {
      this.cancelScheduledPlotDisplayModelPrefetch();
    }
  }

  public prefetchPlotDisplayModel(
    input: PlotDisplayModelInput,
    priority: PlotCalculatedDataPrefetchPriority,
  ): void {
    const endPerf = startPerf("plotService.prefetchPlotDisplayModel", {
      id: getPlot(input),
      priority,
      requestedPlotType: input.plotType ?? null,
    });
    const request = this.createChartDisplayModelPrefetchRequest(input, priority);
    const result = this.prefetchChartDisplayModelRequest(request);
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
    const seenKeys = new Set<string>();
    const missingCalculatedByPlotType = new Map<PlotType, Set<string>>();
    const resultCounts = new Map<string, number>();
    let calculatedDataReadyCount = 0;
    let calculatedDataWarmedCount = 0;
    let cacheHitCount = 0;
    let duplicateCount = 0;
    let inFlightCount = 0;
    let queuedCount = 0;
    let requestCount = 0;
    let shouldSchedulePlotDisplayPrefetch = false;

    for (const input of inputs) {
      const request = this.createChartDisplayModelPrefetchRequest(input, priority);
      const key = getQueuedPlotDisplayModelPrefetchKey(request);
      if (seenKeys.has(key)) {
        duplicateCount += 1;
        incrementCount(resultCounts, "duplicate");
        continue;
      }
      seenKeys.add(key);
      requestCount += 1;

      const result = this.prefetchChartDisplayModelRequest(request);
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
      if (result.missingCalculatedData && result.plotType) {
        const id = getPlot(result.missingCalculatedData);
        let ids = missingCalculatedByPlotType.get(result.plotType);
        if (!ids) {
          ids = new Set<string>();
          missingCalculatedByPlotType.set(result.plotType, ids);
        }
        ids.add(id);
      }
    }

    const missingCalculatedDataCount = [...missingCalculatedByPlotType.values()]
      .reduce((count, ids) => count + ids.size, 0);
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
  ): QueuedPlotDisplayModelPrefetch {
    const id = getPlot(input);
    const plotType = input.plotType && isPlotType(input.plotType)
      ? input.plotType
      : this.state.activePlotType;

    return {
      hiddenLegendKeys: input.hiddenLegendKeys !== undefined
        ? normalizeUniqueStringList(input.hiddenLegendKeys)
        : this.getStoredHiddenLegendKeys(input, plotType),
      legendLabels: input.legendLabels !== undefined
        ? normalizeLegendLabelMap(input.legendLabels)
        : this.getLegendLabels(input),
      plotType,
      priority,
      resource: input.resource,
      stage: "chart",
      sheetId: input.sheetId,
    };
  }

  private prefetchChartDisplayModelRequest(
    request: QueuedPlotDisplayModelPrefetch,
  ): PlotDisplayModelPrefetchResult {
    let calculatedData = this.getCachedCalculatedDataForInput({
      plotType: request.plotType,
      resource: request.resource,
      sheetId: request.sheetId,
    });
    let calculatedDataWarmed = false;
    if (!calculatedData) {
      calculatedData = this.requestCalculatedDataForInput({
        plotType: request.plotType,
        resource: request.resource,
        sheetId: request.sheetId,
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
        plotType: request.plotType,
        result: "chartCacheHit",
        stage: request.stage,
      };
    }
    if (
      calculatedData &&
      this.tryCacheImmediateInteractiveChartDisplayModel(request, calculatedData)
    ) {
      return {
        calculatedDataReady: true,
        calculatedDataWarmed,
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
      missingCalculatedData: calculatedData ? undefined : request,
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
      id: getPlot(input),
      priority,
      requestedPlotType: input.plotType ?? null,
    });
    const plotType = input.plotType && isPlotType(input.plotType)
      ? input.plotType
      : this.state.activePlotType;
    const id = getPlot(input);
    const resolvedInput = this.resolvePlotDisplayModelInput({
      ...input,
      plotType,
    });
    if (!resolvedInput) {
      endPerf({ result: "noResource" });
      return;
    }

    let calculatedData = this.getCachedCalculatedDataForInput({
      plotType,
      resource: input.resource,
      sheetId: input.sheetId,
    });
    let calculatedDataWarmed = false;
    if (!calculatedData) {
      calculatedData = this.requestCalculatedDataForInput({
        plotType,
        resource: input.resource,
        sheetId: input.sheetId,
      });
      calculatedDataWarmed = Boolean(calculatedData);
    }

    const cachedInspector = calculatedData
      ? this.getCachedPlotInspectorDisplayModelForKey(
        this.getPlotDisplayModelCacheKey(calculatedData, resolvedInput),
      )
      : null;
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
      hiddenLegendKeys: [...resolvedInput.hiddenLegendKeys],
      legendLabels: { ...resolvedInput.legendLabels },
      plotType,
      priority: getInspectorPlotDisplayModelPrefetchPriority(priority),
      resource: input.resource,
      stage: "inspector",
      sheetId: input.sheetId,
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

    this.clearQueuedPlotDisplayModelPrefetch();
    this.state = {
      ...this.state,
      activePlotType: plotType,
    };
    this.onDidChangePlotStateEmitter.fire(this.state);
  }

  public async setAxisUnit(
    target: PlotTarget,
    axis: PlotAxis,
    unit: XUnit | YUnit,
  ): Promise<void> {
    const current = this.resolveAxisOverrides(target);

    if (axis === "x") {
      const normalizedUnit = normalizeXUnit(unit);
      if (!normalizedUnit) {
        return;
      }

      if (current.xUnit === normalizedUnit) {
        return;
      }

      this.storeAxisOverrides(target, {
        ...current,
        xUnit: normalizedUnit,
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

    if (current.yUnit === normalizedUnit) {
      return;
    }

    this.storeAxisOverrides(target, {
      ...current,
      yUnit: normalizedUnit,
    });
    this.clearPlotDisplayModelCache();
    this.clearQueuedPlotDisplayModelPrefetch();
    this.onDidChangePlotStateEmitter.fire(this.state);
  }

  public async setYScale(
    target: PlotTarget,
    scale: "linear" | "log",
  ): Promise<void> {
    const current = this.resolveAxisOverrides(target);

    const normalizedScale = scale === "log" ? "log" : "linear";
    if (current.yScale === normalizedScale) {
      return;
    }

    this.storeAxisOverrides(target, {
      ...current,
      yScale: normalizedScale,
    });
    this.clearPlotDisplayModelCache();
    this.clearQueuedPlotDisplayModelPrefetch();
    this.onDidChangePlotStateEmitter.fire(this.state);
  }

  public setLegendLabel(
    target: PlotTarget,
    seriesId: SeriesId,
    label: string | null,
  ): void {
    const id = getPlot(target);
    const normalizedSeriesId = normalizeStateKey(seriesId);
    if (!normalizedSeriesId) {
      return;
    }

    const normalizedLabel = String(label ?? "").trim();
    const currentLabels = this.state.legendLabels[id] ?? {};
    if ((currentLabels[normalizedSeriesId] ?? "") === normalizedLabel) {
      return;
    }

    const previousLegendInputs = this.createCurrentLegendDisplayModelInputs(target);
    const nextLabels = { ...currentLabels };
    if (normalizedLabel) {
      nextLabels[normalizedSeriesId] = normalizedLabel;
    } else {
      delete nextLabels[normalizedSeriesId];
    }

    const legendLabels = {
      ...this.state.legendLabels,
      [id]: nextLabels,
    };
    if (Object.keys(nextLabels).length === 0) {
      delete legendLabels[id];
    }

    this.updateState({
      legendLabels,
    }, {
      afterStateAssigned: () => this.cacheCurrentLegendDisplayModels(target, previousLegendInputs),
      clearDisplayModelCache: false,
    });
  }

  public toggleHiddenLegendKey(
    target: PlotTarget,
    plotType: PlotType,
    seriesId: SeriesId,
    liveLegendKeys: readonly SeriesId[],
  ): void {
    const key = getPlotLegendStateKey(target, plotType);
    const normalizedSeriesId = normalizeStateKey(seriesId);
    if (!key || !normalizedSeriesId) {
      return;
    }

    const liveKeys = normalizeUniqueStringList(liveLegendKeys);
    if (!liveKeys.includes(normalizedSeriesId)) {
      return;
    }

    const current = this.getHiddenLegendKeys(target, plotType, liveKeys);
    const previousLegendInput: PlotDisplayModelInput = {
      hiddenLegendKeys: current,
      legendLabels: this.getLegendLabels(target),
      plotType,
      resource: target.resource,
      sheetId: target.sheetId,
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
      afterStateAssigned: () => this.cacheCurrentLegendDisplayModel(target, plotType, previousLegendInput),
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
      areNestedRecordMapsEqual(this.state.legendLabels, nextState.legendLabels)
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

  private createCurrentLegendDisplayModelInputs(target: PlotTarget): LegendDisplayModelInputByPlotType {
    const inputs = new Map<PlotType, PlotDisplayModelInput>();

    for (const plotType of PlotTypes) {
      inputs.set(plotType, {
        hiddenLegendKeys: this.getStoredHiddenLegendKeys(target, plotType),
        legendLabels: this.getLegendLabels(target),
        plotType,
        resource: target.resource,
        sheetId: target.sheetId,
      });
    }
    return inputs;
  }

  private cacheCurrentLegendDisplayModels(
    target: PlotTarget,
    previousInputs: LegendDisplayModelInputByPlotType,
  ): void {
    for (const plotType of PlotTypes) {
      this.cacheCurrentLegendDisplayModel(target, plotType, previousInputs.get(plotType));
    }
  }

  private cacheCurrentLegendDisplayModel(
    target: PlotTarget,
    plotType: PlotType,
    previousInput: PlotDisplayModelInput | undefined,
  ): void {
    if (!isPlotType(plotType)) {
      return;
    }

    const calculatedData = this.getCachedCalculatedDataForInput({
      plotType,
      resource: target.resource,
      sheetId: target.sheetId,
    });
    if (!calculatedData) {
      return;
    }

    const resolvedInput = this.resolvePlotDisplayModelInput({
      plotType,
      resource: target.resource,
      sheetId: target.sheetId,
    }, calculatedData);
    if (!resolvedInput) {
      return;
    }

    const model = this.createPlotDisplayModel(calculatedData, resolvedInput, false);
    if (!model) {
      return;
    }

    this.cachePlotDisplayModel(calculatedData, resolvedInput, model);
    if (
      previousInput &&
      this.getCachedPlotInspectorDisplayModelForKey(this.getPlotDisplayModelCacheKey(calculatedData, previousInput))
    ) {
      const inspectorModel = this.createPlotInspectorDisplayModel(calculatedData, resolvedInput);
      if (inspectorModel) {
        this.cachePlotInspectorDisplayModel(calculatedData, resolvedInput, inspectorModel);
      }
    }
  }

  private invalidatePlotModelsForResourceChange(resource: URI, sheetId?: string | null): void {
    const id = getPlot({ resource, sheetId });
    this.clearPlotModels(
      new Set([id]),
      new Map([[id, { resource, sheetId: sheetId ?? null }]]),
    );
  }

  private clearPlotModels(
    ids: ReadonlySet<string>,
    resources: PlotCacheResourceMap = new Map(),
  ): void {
    if (!ids.size) {
      return;
    }

    const calculatedDataChanges: PlotCacheChangeMap = new Map();
    const plotDisplayModelChanges: PlotCacheChangeMap = new Map();

    for (const key of [...this.calculatedDataCacheKeys]) {
      const keyContext = getCalculatedDataPrefetchContext(key);
      if (keyContext && ids.has(keyContext.id)) {
        this.calculatedDataCacheKeys.delete(key);
        this.calculatedDataCache.delete(key);
        addPlotCacheChange(calculatedDataChanges, keyContext);
      }
    }
    for (const key of [...this.calculatedDataCache.keys()]) {
      const keyContext = getCalculatedDataPrefetchContext(key);
      if (keyContext && ids.has(keyContext.id)) {
        this.calculatedDataCache.delete(key);
        addPlotCacheChange(calculatedDataChanges, keyContext);
      }
    }
    for (const key of [...this.plotDisplayModelCacheByKey.keys()]) {
      const keyContext = getPlotDisplayModelContextFromKey(key);
      if (keyContext && ids.has(keyContext.id)) {
        this.plotDisplayModelCacheByKey.delete(key);
        addPlotCacheChange(plotDisplayModelChanges, keyContext);
      }
    }
    for (const key of [...this.plotInspectorDisplayModelCacheByKey.keys()]) {
      const keyContext = getPlotDisplayModelContextFromKey(key);
      if (keyContext && ids.has(keyContext.id)) {
        this.plotInspectorDisplayModelCacheByKey.delete(key);
        addPlotCacheChange(plotDisplayModelChanges, keyContext);
      }
    }
    for (const key of [...this.inFlightPlotDisplayModelPrefetchByKey.keys()]) {
      const keyContext = getPlotDisplayModelContextFromKey(key);
      if (keyContext && ids.has(keyContext.id)) {
        this.inFlightPlotDisplayModelPrefetchByKey.delete(key);
        addPlotCacheChange(plotDisplayModelChanges, keyContext);
      }
    }

    if (!this.queuedPlotDisplayModelPrefetchByKey.size) {
      this.cancelScheduledPlotDisplayModelPrefetch();
    }

    this.fireCalculatedDataCacheChanges(calculatedDataChanges, resources);
    this.firePlotDisplayModelCacheChanges(plotDisplayModelChanges, resources);
    this.schedulePlotDisplayModelPrefetch();
  }

  private fireCalculatedDataCacheChanges(
    changes: PlotCacheChangeMap,
    resources: PlotCacheResourceMap = new Map(),
  ): void {
    for (const [id, plotTypes] of changes) {
      const resource = resources.get(id);
      if (!resource) {
        continue;
      }
      for (const plotType of plotTypes) {
        this.onDidChangeCalculatedDataCacheEmitter.fire(
          createPlotCalculatedDataCacheChangeEvent(plotType, resource),
        );
      }
    }
  }

  private firePlotDisplayModelCacheChanges(
    changes: PlotCacheChangeMap,
    resources: PlotCacheResourceMap = new Map(),
  ): void {
    for (const [id, plotTypes] of changes) {
      const resource = resources.get(id);
      if (!resource) {
        continue;
      }
      for (const plotType of plotTypes) {
        this.onDidChangePlotDisplayModelCacheEmitter.fire(
          createPlotDisplayModelCacheChangeEvent(plotType, resource),
        );
      }
    }
  }

  private getCachedCalculatedDataForResource(id: string, plotType: PlotType): CalculatedData | null {
    const normalizedId = normalizeStateKey(id);
    if (!normalizedId) {
      return null;
    }

    return this.calculatedDataCache.get(getCalculatedDataPrefetchKey(normalizedId, plotType)) ?? null;
  }

  private getCalculatedDataForResource(input: PlotCalculatedDataInput, plotType: PlotType): CalculatedData | null {
    const result = this.calculationService.getResourceResult(input.resource, input.sheetId);
    if (!result) {
      return null;
    }

    const id = getPlot(result);

    const key = getCalculatedDataPrefetchKey(id, plotType);
    const cached = this.calculatedDataCache.get(key);
    if (cached) {
      return cached;
    }

    const endPerf = startPerf("plotService.createCalculatedData", {
      curveCount: Object.keys(result.curvesByKey).length,
      plotType,
      resource: result.resource.toString(),
      sheetId: result.sheetId ?? null,
      sourcePointCount: Object.values(result.curvesByKey).reduce(
        (total, curve) => total + curve.points.length,
        0,
      ),
    });
    const calculatedData = createCalculatedDataForCalculationResourceResult({
      plotType,
      result,
    });
    endPerf({
      resultPointCount: calculatedData.pointsCount,
      resultSeriesCount: calculatedData.seriesList.length,
    });
    return this.cacheCalculatedDataForResource(
      id,
      plotType,
      calculatedData,
      { resource: result.resource, sheetId: result.sheetId ?? null },
    );
  }

  private cacheCalculatedDataForResource(
    id: string,
    plotType: PlotType,
    calculatedData: CalculatedData,
    resource: PlotTarget,
  ): CalculatedData {
    const key = getCalculatedDataPrefetchKey(id, plotType);
    const cached = this.calculatedDataCache.get(key);
    if (cached) {
      return cached;
    }

    this.calculatedDataCache.set(key, calculatedData);
    this.calculatedDataCacheKeys.add(key);
    this.onDidChangeCalculatedDataCacheEmitter.fire(
      createPlotCalculatedDataCacheChangeEvent(plotType, resource),
    );
    this.schedulePlotDisplayModelPrefetch();
    return calculatedData;
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

      let calculatedData = this.getCachedCalculatedDataForInput({
        plotType: next.plotType,
        resource: next.resource,
        sheetId: next.sheetId,
      });
      if (!calculatedData) {
        calculatedData = this.requestCalculatedDataForInput({
          plotType: next.plotType,
          resource: next.resource,
          sheetId: next.sheetId,
        });
      }
      if (!calculatedData) {
        this.queuedPlotDisplayModelPrefetchByKey.set(
          getQueuedPlotDisplayModelPrefetchKey(next),
          next,
        );
        blockedOnCalculatedData = true;
        break;
      }

      if (this.tryCacheImmediateInteractiveChartDisplayModel(next, calculatedData)) {
        processed += 1;
        continue;
      }

      this.prefetchPlotDisplayModelForCalculatedData(
        next,
        calculatedData,
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
  ): boolean {
    if (!isInteractivePlotPrefetchPriority(request.priority) || request.stage !== "chart") {
      return false;
    }

    const model = this.createPlotDisplayModel(
      calculatedData,
      request,
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
  ): void {
    if (request.stage === "inspector") {
      this.prefetchPlotInspectorDisplayModelForCalculatedData(
        request,
        calculatedData,
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
    void this.calculatedDataWorkerClient.calculateDisplayModel({
      axisOverrides: this.resolveAxisOverrides(request),
      axisTitleOverridesByKey: this.state.axisTitleOverridesByKey,
      calculatedData,
      hiddenLegendKeys: request.hiddenLegendKeys,
      includeInspector: false,
      legendLabels: request.legendLabels,
      plotType: request.plotType,
      priority: request.priority,
      requestId,
      dataVersion: generation,
      workerLane: request.workerLane,
    }).then((result) => {
      this.deleteInFlightPlotDisplayModelPrefetch(prefetchKey, requestId);
      if (generation !== this.plotDisplayModelPrefetchGeneration) {
        this.schedulePlotDisplayModelPrefetch();
        return;
      }

      if (!this.isCalculatedDataCurrentForResource(request, calculatedData)) {
        this.schedulePlotDisplayModelPrefetch();
        return;
      }

      if (!result || !result.displayModel) {
        const model = this.createPlotDisplayModel(
          calculatedData,
          request,
          false,
        );
        if (model) {
          this.cachePlotDisplayModel(calculatedData, request, model);
        }
        this.schedulePlotDisplayModelPrefetch();
        return;
      }

      if (
        result.requestId !== requestId ||
        result.dataVersion !== generation ||
        result.plotType !== request.plotType
      ) {
        this.schedulePlotDisplayModelPrefetch();
        return;
      }

      this.cachePlotDisplayModel(calculatedData, request, result.displayModel);
      this.schedulePlotDisplayModelPrefetch();
    });
  }

  private prefetchPlotInspectorDisplayModelForCalculatedData(
    request: QueuedPlotDisplayModelPrefetch,
    calculatedData: CalculatedData,
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
    void this.calculatedDataWorkerClient.calculateDisplayModel({
      axisOverrides: this.resolveAxisOverrides(request),
      axisTitleOverridesByKey: this.state.axisTitleOverridesByKey,
      calculatedData,
      hiddenLegendKeys: request.hiddenLegendKeys,
      includeInspector: true,
      legendLabels: request.legendLabels,
      plotType: request.plotType,
      priority: request.priority,
      requestId,
      dataVersion: generation,
      workerLane: request.workerLane,
    }).then((result) => {
      this.deleteInFlightPlotDisplayModelPrefetch(prefetchKey, requestId);
      if (generation !== this.plotDisplayModelPrefetchGeneration) {
        this.schedulePlotDisplayModelPrefetch();
        return;
      }

      if (!this.isCalculatedDataCurrentForResource(request, calculatedData)) {
        this.schedulePlotDisplayModelPrefetch();
        return;
      }

      const inspectorModel = result?.displayModel?.inspector ??
        this.createPlotInspectorDisplayModel(
          calculatedData,
          request,
        );
      if (
        result &&
        (
          result.requestId !== requestId ||
          result.dataVersion !== generation ||
          result.plotType !== request.plotType
        )
      ) {
        this.schedulePlotDisplayModelPrefetch();
        return;
      }

      if (inspectorModel) {
        this.cachePlotInspectorDisplayModel(calculatedData, request, inspectorModel);
      }
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
    let count = 0;
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
        hardLimit: PLOT_DISPLAY_MODEL_CACHE_HARD_LIMIT,
        hasInspector: false,
        limit: PLOT_DISPLAY_MODEL_CACHE_LIMIT,
        plotType: chartModel.plotType,
        previousRetentionPriority,
        result: cachedEntry.retentionPriority === previousRetentionPriority ? "kept" : "upgraded",
        retentionPriority: cachedEntry.retentionPriority,
        id: getPlot(chartModel),
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
    this.onDidChangePlotDisplayModelCacheEmitter.fire(
      createPlotDisplayModelCacheChangeEvent(
        chartModel.plotType,
        { resource: input.resource, sheetId: input.sheetId ?? null },
        "chart",
      ),
    );
    logPerf("plotService.cachePlotDisplayModel", {
      cacheSize: this.plotDisplayModelCacheByKey.size,
      hardLimit: PLOT_DISPLAY_MODEL_CACHE_HARD_LIMIT,
      hasInspector: false,
      limit: PLOT_DISPLAY_MODEL_CACHE_LIMIT,
      plotType: chartModel.plotType,
      retentionPriority,
      result: "created",
      id: getPlot(chartModel),
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
    const resource = calculatedData.source.resource;
    if (!resource || !isPlotType(calculatedData.kind)) {
      return model;
    }
    const id = getPlot({ resource, sheetId: calculatedData.source.sheetId });
    const cachedEntry = this.plotInspectorDisplayModelCacheByKey.get(key);
    if (cachedEntry) {
      cachedEntry.lastUsed = ++this.plotInspectorDisplayModelCacheUse;
      logPerf("plotService.cachePlotInspectorDisplayModel", {
        cacheSize: this.plotInspectorDisplayModelCacheByKey.size,
        limit: PLOT_INSPECTOR_DISPLAY_MODEL_CACHE_LIMIT,
        plotType: calculatedData.kind,
        result: "kept",
        id,
        signature: calculatedData.signature,
      });
      return cachedEntry.model;
    }

    this.plotInspectorDisplayModelCacheByKey.set(key, {
      lastUsed: ++this.plotInspectorDisplayModelCacheUse,
      model,
    });
    this.trimPlotInspectorDisplayModelCache();
    this.onDidChangePlotDisplayModelCacheEmitter.fire(
      createPlotDisplayModelCacheChangeEvent(
        calculatedData.kind,
        { resource: input.resource, sheetId: input.sheetId ?? null },
        "inspector",
      ),
    );
    logPerf("plotService.cachePlotInspectorDisplayModel", {
      cacheSize: this.plotInspectorDisplayModelCacheByKey.size,
      limit: PLOT_INSPECTOR_DISPLAY_MODEL_CACHE_LIMIT,
      plotType: calculatedData.kind,
      result: "created",
      id,
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
      calculatedData.source.resource
        ? getPlot({
          resource: calculatedData.source.resource,
          sheetId: calculatedData.source.sheetId,
        })
        : "",
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

  private isCalculatedDataCurrentForResource(
    request: QueuedPlotDisplayModelPrefetch,
    calculatedData: CalculatedData,
  ): boolean {
    const result = this.calculationService.getResourceResult(
      request.resource,
      request.sheetId,
    );
    if (!result) {
      return false;
    }

    if (!isSamePlotTarget(result, request)) {
      return false;
    }

    return createCalculatedDataForCalculationResourceResult({
      plotType: request.plotType,
      result,
    }).signature === calculatedData.signature;
  }


  public getAxisOverrides(target: PlotTarget): PlotAxisOverrides {
    return this.resolveAxisOverrides(target);
  }

  private resolveAxisOverrides(target: PlotTarget): PlotAxisOverrides {
    const match = this.getStoredAxisOverrides().find(candidate => isSamePlotTarget(candidate, target));
    return match
      ? {
          xUnit: match.xUnit,
          yScale: match.yScale,
          yUnit: match.yUnit,
        }
      : {};
  }

  private getStoredAxisOverrides(): readonly StoredPlotAxisOverrides[] {
    const stored = this.storageService.getObject<readonly unknown[]>(
      PLOT_AXIS_OVERRIDES_STORAGE_KEY,
      StorageScope.PROFILE,
      [],
    );
    return stored.flatMap(createStoredPlotAxisOverrides);
  }

  private storeAxisOverrides(target: PlotTarget, value: PlotAxisOverrides): void {
    const settings = this.getStoredAxisOverrides().filter(candidate => !isSamePlotTarget(candidate, target));
    this.storageService.store(
      PLOT_AXIS_OVERRIDES_STORAGE_KEY,
      [...settings, { ...value, resource: target.resource, sheetId: target.sheetId ?? null }],
      StorageScope.PROFILE,
      StorageTarget.USER,
    );
  }
}

const getCalculatedDataPrefetchKey = (id: string, plotType: PlotType): string =>
  `${plotType}:${id}`;

const getCalculatedDataPrefetchContext = (
  key: string,
): { readonly plotType: PlotType; readonly id: string } | null => {
  const separatorIndex = key.indexOf(":");
  const plotType = separatorIndex >= 0 ? key.slice(0, separatorIndex) : "";
  if (!isPlotType(plotType)) {
    return null;
  }

  const id = normalizeStateKey(separatorIndex >= 0 ? key.slice(separatorIndex + 1) : key);
  return id ? { plotType, id } : null;
};

const getPlotDisplayModelContextFromKey = (
  key: string,
): { readonly plotType: PlotType; readonly id: string } | null => {
  const [idRaw, plotTypeRaw] = key.split("|");
  const id = normalizeStateKey(idRaw);
  return id && isPlotType(plotTypeRaw)
    ? { plotType: plotTypeRaw, id }
    : null;
};

const getPlotLegendStateKey = (
  target: PlotTarget,
  plotType: PlotType,
): string | null => {
  const stateKey = getPlotTargetStateKey(target);
  return stateKey && isPlotType(plotType)
    ? `${stateKey}:${plotType}`
    : null;
};

const getPlotTargetStateKey = (
  target: PlotTarget,
): string => getPlot(target);

const getPlot = (
  input: Pick<PlotCalculatedDataInput, "resource" | "sheetId">,
): string => {
  const resource = URI.revive(input.resource).toString();
  const sheetId = String(input.sheetId ?? "").trim();
  return sheetId ? `${resource}\u0000${sheetId}` : resource;
};

const addPlotCacheChange = (
  changes: PlotCacheChangeMap,
  context: { readonly plotType: PlotType; readonly id: string },
): void => {
  const id = normalizeStateKey(context.id);
  const plotType = context.plotType;
  if (!id || !isPlotType(plotType)) {
    return;
  }

  let plotTypes = changes.get(id);
  if (!plotTypes) {
    plotTypes = new Set();
    changes.set(id, plotTypes);
  }
  plotTypes.add(plotType);
};

const createPlotCalculatedDataCacheChangeEvent = (
  plotType: PlotType,
  resource: PlotTarget,
): PlotCalculatedDataCacheChangeEvent => ({
  plotType,
  resource: resource.resource,
  sheetId: resource.sheetId ?? null,
});

const createPlotDisplayModelCacheChangeEvent = (
  plotType: PlotType,
  resource: PlotTarget,
  pane?: PlotDisplayModelCacheChangeEvent["pane"],
): PlotDisplayModelCacheChangeEvent => ({
  resource: resource.resource,
  sheetId: resource.sheetId ?? null,
  ...(pane ? { pane } : {}),
  plotType,
});

const createStoredPlotAxisOverrides = (value: unknown): readonly StoredPlotAxisOverrides[] => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const candidate = value as Record<string, unknown>;
  if (!candidate.resource) {
    return [];
  }
  const yScale = candidate.yScale === "linear" || candidate.yScale === "log"
    ? candidate.yScale
    : undefined;
  return [{
    resource: URI.revive(candidate.resource as URI),
    sheetId: typeof candidate.sheetId === "string" ? candidate.sheetId : null,
    xUnit: typeof candidate.xUnit === "string" ? candidate.xUnit : undefined,
    yScale,
    yUnit: typeof candidate.yUnit === "string" ? candidate.yUnit : undefined,
  }];
};

const isSamePlotTarget = (left: PlotTarget, right: PlotTarget): boolean =>
  URI.revive(left.resource).toString() === URI.revive(right.resource).toString() &&
  String(left.sheetId ?? "") === String(right.sheetId ?? "");

const getQueuedPlotDisplayModelPrefetchKey = (
  input: Pick<QueuedPlotDisplayModelPrefetch, "hiddenLegendKeys" | "legendLabels" | "plotType" | "resource" | "sheetId" | "stage">,
): string =>
  [
    getPlot(input),
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
