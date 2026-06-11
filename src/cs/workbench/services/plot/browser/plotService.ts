/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  createCalculatedPlotsByKeyFromRecords,
  createSecondCalculatedData,
  getCalculatedData as getCalculatedDataFromMap,
  type CalculatedData,
} from "src/cs/workbench/services/calculation/common/calculatedData";
import { isPlotType } from "src/cs/workbench/services/plot/common/plot";
import {
  IPlotService,
  type PlotAxisTitleContext,
  type IPlotService as IPlotServiceType,
  type PlotAxisSettingsByFileId,
  type PlotCalculatedDataInput,
  type PlotDisplayModel,
  type PlotDisplayModelInput,
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
} from "src/cs/workbench/services/plot/common/units";
import type {
  FileId,
  SeriesId,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
  ISessionService,
  type ISessionService as ISessionServiceType,
  type SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";

export class PlotService extends Disposable implements IPlotServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangePlotStateEmitter = this._register(new Emitter<PlotState>());
  public readonly onDidChangePlotState = this.onDidChangePlotStateEmitter.event;

  private state: PlotState = {
    axisTitleOverridesByKey: {},
    activePlotType: "iv",
    legendLabelsByFileId: {},
  };

  constructor(
    @ISessionService private readonly sessionService: ISessionServiceType,
  ) {
    super();

    this._register(this.sessionService.onDidChangeSession(event => {
      if (shouldInvalidatePlotModelsForSessionChange(event)) {
        this.onDidChangePlotStateEmitter.fire(this.state);
      }
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
    const calculatedData = this.getCalculatedData(input);
    const fileId = String(calculatedData?.source.fileId ?? "").trim();
    if (!calculatedData || !fileId) {
      return null;
    }

    const chartData = applyLegendLabels(
      filterCalculatedDataSeries(calculatedData, input.hiddenLegendKeys ?? []),
      input.legendLabels ?? {},
    );
    const displayUnits = resolveDisplayUnits(chartData, input.axisSettings);
    const yScaleMode = resolveYScale(chartData, input.axisSettings);
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
      unitControl: createUnitControlModel(chartData, input.axisSettings),
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

const resolveDisplayUnits = (
  data: CalculatedData,
  axisSettings: PlotAxisSettingsByFileId | undefined,
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
  axisSettings: PlotAxisSettingsByFileId | undefined,
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
  axisSettings: PlotAxisSettingsByFileId | undefined,
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
