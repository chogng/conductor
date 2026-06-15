/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  IStorageService,
  StorageScope,
  StorageTarget,
} from "src/cs/platform/storage/common/storage";
import {
  createCalculatedPlotsByKeyFromRecords,
  createSecondCalculatedData,
  getCalculatedData as getCalculatedDataFromMap,
  type CalculatedData,
} from "src/cs/workbench/services/calculation/common/calculationReadModel";
import { isPlotType } from "src/cs/workbench/services/plot/common/plot";
import {
  IPlotService,
  type PlotAxis,
  type PlotAxisTitleContext,
  type PlotCalculatedDataInput,
  type PlotDisplayModel,
  type PlotDisplayModelInput,
  type PlotFileAxisSettings,
  type PlotLegendModel,
  type PlotMainRenderModelInput,
  type PlotState,
  type PlotType,
} from "src/cs/workbench/services/plot/common/plot";
import type { PlotMainRenderModel } from "src/cs/workbench/services/plot/common/plotModel";
import { resolveLabelWithUnit } from "src/cs/workbench/services/plot/common/plotAxisLabels";
import { createPlotMainRenderModel } from "src/cs/workbench/services/plot/browser/plotRenderModel";
import { filterCalculatedDataSeries } from "src/cs/workbench/services/plot/common/plotSeriesVisibility";
import {
  getXUnitMeta,
  getYUnitMeta,
  normalizeXUnit,
  normalizeYUnit,
  type XUnit,
  type YUnit,
} from "src/cs/workbench/services/plot/common/units";
import type {
  FileId,
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

const PLOT_AXIS_STORAGE_KEYS = {
  xUnitByFileId: "plot.xUnitByFileId",
  yScaleByFileId: "plot.yScaleByFileId",
  yUnitByFileId: "plot.yUnitByFileId",
} as const;

export class PlotService extends Disposable implements IPlotService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangePlotStateEmitter = this._register(new Emitter<PlotState>());
  public readonly onDidChangePlotState = this.onDidChangePlotStateEmitter.event;

  private state: PlotState = {
    axisTitleOverridesByKey: {},
    activePlotType: "iv",
    legendLabelsByFileId: {},
  };

  constructor(
    @ISessionService private readonly sessionService: ISessionService,
    @ISettingsService private readonly settingsService: ISettingsService,
    @IStorageService private readonly storageService: IStorageService,
  ) {
    super();

    this._register(this.sessionService.onDidChangeSession(event => {
      if (shouldInvalidatePlotModelsForSessionChange(event)) {
        this.onDidChangePlotStateEmitter.fire(this.state);
      }
    }));
    this._register(this.settingsService.onDidChangeConductorSettings(() => {
      this.onDidChangePlotStateEmitter.fire(this.state);
    }));
  }

  public getState(): PlotState {
    return this.state;
  }

  public getCalculatedData(input: PlotCalculatedDataInput): CalculatedData | null {
    const snapshot = this.resolveSnapshot(input.snapshot);
    if (!snapshot) {
      return null;
    }

    const plotType = input.plotType && isPlotType(input.plotType)
      ? input.plotType
      : this.state.activePlotType;
    const calculatedPlotsByKey = createCalculatedPlotsByKeyFromRecords(
      snapshot.filesById,
      snapshot.fileOrder,
    );
    return getCalculatedDataFromMap(
      calculatedPlotsByKey,
      plotType,
      input.fileId,
    );
  }

  public getLegendLabels(fileId: FileId): Readonly<Record<SeriesId, string>> {
    const normalizedFileId = normalizeStateKey(fileId);
    return normalizedFileId
      ? this.state.legendLabelsByFileId[normalizedFileId] ?? {}
      : {};
  }

  public getPlotLegendModel(input: PlotCalculatedDataInput): PlotLegendModel | null {
    const calculatedData = this.getCalculatedData(input);
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
    const fileId = String(calculatedData?.source.fileId ?? "").trim();
    if (!calculatedData || !fileId) {
      return null;
    }

    const chartData = applyLegendLabels(
      filterCalculatedDataSeries(calculatedData, input.hiddenLegendKeys ?? []),
      input.legendLabels ?? {},
    );
    const axisSettings = snapshot ? this.getAxisSettings(snapshot) : undefined;
    const displayUnits = resolveDisplayUnits(chartData, axisSettings);
    const yScaleMode = resolveYScale(chartData, axisSettings);
    const inspectorData = createSecondCalculatedData(
      filterCalculatedDataSeries(chartData, input.hiddenLegendKeys ?? []),
    );
    const inspectorYUnitLabel = displayUnits.yUnit
      ? `d(${displayUnits.yUnit})/dx`
      : undefined;

    const chartXTitleContext = createAxisTitleContext({
      axis: "x",
      fileId,
      pane: "chart",
      plotType: chartData.kind as PlotType,
    });
    const chartYTitleContext = createAxisTitleContext({
      axis: "y",
      fileId,
      pane: "chart",
      plotType: chartData.kind as PlotType,
    });
    const inspectorXTitleContext = createAxisTitleContext({
      axis: "x",
      fileId,
      pane: "inspector",
      plotType: chartData.kind as PlotType,
    });
    const inspectorYTitleContext = createAxisTitleContext({
      axis: "y",
      fileId,
      pane: "inspector",
      plotType: chartData.kind as PlotType,
    });
    const chartDefaultXAxisTitle = resolveLabelWithUnit(
      chartData.activeFile?.xLabel,
      displayUnits.xUnit,
      "X",
    );
    const chartDefaultYAxisTitle = resolveLabelWithUnit(
      chartData.activeFile?.yLabel,
      displayUnits.yUnit ?? chartData.yUnitLabel,
      "Y",
    );
    const inspectorDefaultXAxisTitle = resolveLabelWithUnit(
      inspectorData.activeFile?.xLabel,
      displayUnits.xUnit,
      "X",
    );
    const inspectorDefaultYAxisTitle = resolveLabelWithUnit(
      inspectorData.activeFile?.yLabel,
      inspectorYUnitLabel ?? inspectorData.yUnitLabel,
      "Y",
    );

    return {
      chart: {
        defaultXAxisTitle: chartDefaultXAxisTitle,
        defaultYAxisTitle: chartDefaultYAxisTitle,
        model: createPlotMainRenderModel(chartData),
        plotXFactor: displayUnits.xFactor,
        plotXUnitLabel: displayUnits.xUnit,
        plotYFactor: displayUnits.yFactor,
        plotYUnitLabel: displayUnits.yUnit,
        xAxisTitle: this.getAxisTitle(chartXTitleContext, chartDefaultXAxisTitle),
        xAxisTitleContext: chartXTitleContext,
        yAxisTitle: this.getAxisTitle(chartYTitleContext, chartDefaultYAxisTitle),
        yAxisTitleContext: chartYTitleContext,
        yScaleMode,
      },
      fileId,
      inspector: {
        defaultXAxisTitle: inspectorDefaultXAxisTitle,
        defaultYAxisTitle: inspectorDefaultYAxisTitle,
        model: createPlotMainRenderModel(inspectorData),
        plotXFactor: displayUnits.xFactor,
        plotXUnitLabel: displayUnits.xUnit,
        plotYFactor: displayUnits.yFactor,
        plotYUnitLabel: inspectorYUnitLabel,
        xAxisTitle: this.getAxisTitle(inspectorXTitleContext, inspectorDefaultXAxisTitle),
        xAxisTitleContext: inspectorXTitleContext,
        yAxisTitle: this.getAxisTitle(inspectorYTitleContext, inspectorDefaultYAxisTitle),
        yAxisTitleContext: inspectorYTitleContext,
        yScaleMode,
      },
      plotType: chartData.kind as PlotType,
      unitControl: createUnitControlModel(chartData, axisSettings),
    };
  }

  public getPlotMainRenderModel(input: PlotMainRenderModelInput): PlotMainRenderModel | null {
    const calculatedData = this.getCalculatedData(input);
    return calculatedData ? createPlotMainRenderModel(calculatedData) : null;
  }

  public setAxisTitleOverride(
    context: PlotAxisTitleContext,
    title: string,
    defaultTitle: string,
  ): void {
    const key = getAxisTitleStateKey(context);
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
    this.onDidChangePlotStateEmitter.fire(nextState);
  }

  private getAxisTitle(context: PlotAxisTitleContext, defaultTitle: string): string {
    return this.state.axisTitleOverridesByKey[getAxisTitleStateKey(context)] ?? defaultTitle;
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
    case "filesRemoved":
    case "sessionCleared":
      return true;
    case "rawTablesChanged":
    case "assessmentChanged":
    case "metricInputsChanged":
      return false;
  }
};

const createAxisTitleContext = (
  context: PlotAxisTitleContext,
): PlotAxisTitleContext => context;

const getAxisTitleStateKey = (context: PlotAxisTitleContext): string =>
  [
    context.fileId,
    context.plotType,
    context.pane,
    context.axis,
  ].join(":");

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

const resolveDisplayUnits = (
  data: CalculatedData,
  axisSettings: FileAxisSettingsByFileId | undefined,
): {
  readonly xFactor: number;
  readonly xUnit: string | undefined;
  readonly yFactor: number;
  readonly yUnit: string | undefined;
} => {
  const fileId = String(data.source.fileId ?? "").trim();
  const sourceXUnit = normalizeXUnit(data.xUnitLabel, "V") || "V";
  const sourceYUnit = normalizeYUnit(data.yUnitLabel);
  const xUnit = normalizeXUnit(
    fileId ? axisSettings?.xUnitByFileId?.[fileId] : undefined,
    sourceXUnit,
  ) || sourceXUnit;
  const yUnit = sourceYUnit
    ? normalizeYUnit(
        fileId ? axisSettings?.yUnitByFileId?.[fileId] : undefined,
        sourceYUnit,
      ) || sourceYUnit
    : undefined;

  return {
    xFactor: getXUnitMeta(xUnit).factor,
    xUnit,
    yFactor: yUnit ? getYUnitMeta(yUnit).factor : 1,
    yUnit,
  };
};

const createUnitControlModel = (
  data: CalculatedData,
  axisSettings: FileAxisSettingsByFileId | undefined,
): PlotDisplayModel["unitControl"] => {
  const fileId = String(data.source.fileId ?? "").trim();
  if (!fileId) {
    return null;
  }

  const sourceXUnit = normalizeXUnit(data.activeFile?.xUnit, "V") || "V";
  const sourceYUnit = normalizeYUnit(data.activeFile?.yUnit, "A") || "A";
  return {
    fileId,
    xUnit: normalizeXUnit(axisSettings?.xUnitByFileId?.[fileId], sourceXUnit) || sourceXUnit,
    yScale: resolveYScale(data, axisSettings),
    yUnit: normalizeYUnit(axisSettings?.yUnitByFileId?.[fileId], sourceYUnit) || sourceYUnit,
  };
};

const resolveYScale = (
  data: CalculatedData,
  axisSettings: FileAxisSettingsByFileId | undefined,
): "linear" | "log" => {
  const fileId = String(data.source.fileId ?? "").trim();
  return fileId && axisSettings?.yScaleByFileId?.[fileId] === "log" ? "log" : "linear";
};

const applyLegendLabels = (
  data: CalculatedData,
  legendLabels: Readonly<Record<string, string>>,
): CalculatedData => {
  const labels = Object.keys(legendLabels);
  if (!labels.length) {
    return data;
  }

  return {
    ...data,
    seriesList: data.seriesList.map((series) => ({
      ...series,
      name: legendLabels[series.id] ?? series.name,
    })),
  };
};

registerSingleton(IPlotService, PlotService, InstantiationType.Delayed);
