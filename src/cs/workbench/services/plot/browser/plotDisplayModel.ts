/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  createSecondCalculatedData,
  type CalculatedData,
} from "src/cs/workbench/services/calculation/common/calculationReadModel";
import { createCalculationResourceId } from "src/cs/workbench/services/calculation/common/calculation";
import {
  type PlotAxisTitleContext,
  type PlotAxisOverrides,
  type PlotDisplayModel,
  type PlotPaneDisplayModel,
  type PlotType,
} from "src/cs/workbench/services/plot/common/plot";
import { resolveAxisTitleLabel } from "src/cs/workbench/services/plot/common/plotAxisLabels";
import { filterCalculatedDataSeries } from "src/cs/workbench/services/plot/common/plotSeriesVisibility";
import type { PlotMainSeries } from "src/cs/workbench/services/plot/common/plotModel";
import { createPlotMainRenderModel } from "src/cs/workbench/services/plot/browser/plotRenderModel";
import {
  getYUnitValuesForFamily,
  getXUnitValuesForFamily,
  getXUnitMeta,
  getYUnitMeta,
  normalizeXUnit,
  normalizeXUnitForFamily,
  normalizeYUnit,
  normalizeYUnitForFamily,
} from "src/cs/workbench/services/plot/common/units";

type CreatePlotDisplayModelInput = {
  readonly axisOverrides?: PlotAxisOverrides;
  readonly axisTitleOverridesByKey?: Readonly<Record<string, string>>;
  readonly calculatedData: CalculatedData | null;
  readonly hiddenLegendKeys?: readonly string[];
  readonly includeInspector?: boolean;
  readonly legendLabels?: Readonly<Record<string, string>>;
};

export const createPlotDisplayModelFromCalculatedData = (
  input: CreatePlotDisplayModelInput,
): PlotDisplayModel | null => {
  const parts = createPlotDisplayModelParts(input);
  if (!parts) {
    return null;
  }

  const chartXTitleContext = createAxisTitleContext({
    axis: "x",
    pane: "chart",
    plotType: parts.chartData.kind as PlotType,
    resource: parts.resource,
    sheetId: parts.sheetId,
  });
  const chartYTitleContext = createAxisTitleContext({
    axis: "y",
    pane: "chart",
    plotType: parts.chartData.kind as PlotType,
    resource: parts.resource,
    sheetId: parts.sheetId,
  });
  const chartDefaultXAxisTitle = resolveAxisTitleLabel(
    parts.chartData.activeFile?.xLabel,
    "X",
  );
  const chartDefaultYAxisTitle = resolveAxisTitleLabel(
    parts.chartData.activeFile?.yLabel,
    "Y",
  );

  return {
    chart: {
      defaultXAxisTitle: chartDefaultXAxisTitle,
      defaultYAxisTitle: chartDefaultYAxisTitle,
      model: createPlotMainRenderModel(parts.chartData, parts.colorSeriesList),
      plotXFactor: parts.displayUnits.xFactor,
      plotXUnitLabel: parts.displayUnits.xUnit,
      plotYFactor: parts.displayUnits.yFactor,
      plotYUnitLabel: parts.displayUnits.yUnit,
      xAxisTitle: getAxisTitle(input.axisTitleOverridesByKey, chartXTitleContext, chartDefaultXAxisTitle),
      xAxisTitleContext: chartXTitleContext,
      yAxisTitle: getAxisTitle(input.axisTitleOverridesByKey, chartYTitleContext, chartDefaultYAxisTitle),
      yAxisTitleContext: chartYTitleContext,
      yScaleMode: parts.yScaleMode,
    },
    inspector: input.includeInspector === false
      ? null
      : createInspectorDisplayModel({
        axisTitleOverridesByKey: input.axisTitleOverridesByKey,
        chartData: parts.chartData,
        displayUnits: parts.displayUnits,
        colorSeriesList: parts.colorSeriesList,
        resource: parts.resource,
        sheetId: parts.sheetId,
        yScaleMode: parts.yScaleMode,
      }),
    plotType: parts.chartData.kind as PlotType,
    resource: parts.resource,
    sheetId: parts.sheetId,
    unitControl: createUnitControlModel(parts.chartData, input.axisOverrides),
  };
};

export const createPlotInspectorDisplayModelFromCalculatedData = (
  input: CreatePlotDisplayModelInput,
): PlotPaneDisplayModel | null => {
  const parts = createPlotDisplayModelParts(input);
  if (!parts) {
    return null;
  }

  return createInspectorDisplayModel({
    axisTitleOverridesByKey: input.axisTitleOverridesByKey,
    chartData: parts.chartData,
    colorSeriesList: parts.colorSeriesList,
    displayUnits: parts.displayUnits,
    resource: parts.resource,
    sheetId: parts.sheetId,
    yScaleMode: parts.yScaleMode,
  });
};

const createPlotDisplayModelParts = (
  input: CreatePlotDisplayModelInput,
): {
  readonly chartData: CalculatedData;
  readonly colorSeriesList: readonly PlotMainSeries[];
  readonly displayUnits: {
    readonly xFactor: number;
    readonly xUnit: string | undefined;
    readonly yFactor: number;
    readonly yUnit: string | undefined;
  };
  readonly resource: PlotDisplayModel["resource"];
  readonly sheetId?: PlotDisplayModel["sheetId"];
  readonly yScaleMode: "linear" | "log";
} | null => {
  const calculatedData = input.calculatedData;
  const resource = calculatedData?.source.resource;
  if (!calculatedData || !resource) {
    return null;
  }

  const hiddenLegendKeys = input.hiddenLegendKeys ?? [];
  const chartData = applyLegendLabels(
    filterCalculatedDataSeries(calculatedData, hiddenLegendKeys),
    input.legendLabels ?? {},
  );
  const displayUnits = resolveDisplayUnits(chartData, input.axisOverrides);
  const yScaleMode = resolveYScale(chartData, input.axisOverrides);
  return {
    chartData,
    colorSeriesList: calculatedData.seriesList,
    displayUnits,
    resource,
    sheetId: calculatedData.source.sheetId ?? null,
    yScaleMode,
  };
};

export const getPlotAxisTitleStateKey = (context: PlotAxisTitleContext): string =>
  [
    getPlotAxisTitleIdentityKey(context),
    context.plotType,
    context.pane,
    context.axis,
  ].join(":");

const createAxisTitleContext = (
  context: PlotAxisTitleContext,
): PlotAxisTitleContext => context;

const getAxisTitle = (
  axisTitleOverridesByKey: Readonly<Record<string, string>> | undefined,
  context: PlotAxisTitleContext,
  defaultTitle: string,
): string => axisTitleOverridesByKey?.[getPlotAxisTitleStateKey(context)] ?? defaultTitle;

const createInspectorDisplayModel = ({
  axisTitleOverridesByKey,
  chartData,
  colorSeriesList,
  displayUnits,
  resource,
  sheetId,
  yScaleMode,
}: {
  readonly axisTitleOverridesByKey: Readonly<Record<string, string>> | undefined;
  readonly chartData: CalculatedData;
  readonly colorSeriesList: readonly PlotMainSeries[];
  readonly displayUnits: {
    readonly xFactor: number;
    readonly xUnit: string | undefined;
    readonly yFactor: number;
    readonly yUnit: string | undefined;
  };
  readonly resource: PlotDisplayModel["resource"];
  readonly sheetId?: PlotDisplayModel["sheetId"];
  readonly yScaleMode: "linear" | "log";
}): PlotDisplayModel["inspector"] => {
  const inspectorData = createSecondCalculatedData(chartData);
  const inspectorYUnitLabel = displayUnits.yUnit
    ? `d(${displayUnits.yUnit})/dx`
    : undefined;
  const inspectorXTitleContext = createAxisTitleContext({
    axis: "x",
    pane: "inspector",
    plotType: chartData.kind as PlotType,
    resource,
    sheetId,
  });
  const inspectorYTitleContext = createAxisTitleContext({
    axis: "y",
    pane: "inspector",
    plotType: chartData.kind as PlotType,
    resource,
    sheetId,
  });
  const inspectorDefaultXAxisTitle = resolveAxisTitleLabel(
    inspectorData.activeFile?.xLabel,
    "X",
  );
  const inspectorDefaultYAxisTitle = resolveAxisTitleLabel(
    inspectorData.activeFile?.yLabel,
    "Y",
  );

  return {
    defaultXAxisTitle: inspectorDefaultXAxisTitle,
    defaultYAxisTitle: inspectorDefaultYAxisTitle,
    model: createPlotMainRenderModel(inspectorData, colorSeriesList),
    plotXFactor: displayUnits.xFactor,
    plotXUnitLabel: displayUnits.xUnit,
    plotYFactor: displayUnits.yFactor,
    plotYUnitLabel: inspectorYUnitLabel,
    xAxisTitle: getAxisTitle(axisTitleOverridesByKey, inspectorXTitleContext, inspectorDefaultXAxisTitle),
    xAxisTitleContext: inspectorXTitleContext,
    yAxisTitle: getAxisTitle(axisTitleOverridesByKey, inspectorYTitleContext, inspectorDefaultYAxisTitle),
    yAxisTitleContext: inspectorYTitleContext,
    yScaleMode,
  };
};

const resolveDisplayUnits = (
  data: CalculatedData,
  axisOverrides: PlotAxisOverrides | undefined,
): {
  readonly xFactor: number;
  readonly xUnit: string | undefined;
  readonly yFactor: number;
  readonly yUnit: string | undefined;
} => {
  const sourceXUnit = normalizeXUnit(data.xUnitLabel, "V") || "V";
  const sourceYUnit = normalizeYUnit(data.yUnitLabel);
  const xUnit = normalizeXUnitForFamily(
    axisOverrides?.xUnit,
    sourceXUnit,
  ) || sourceXUnit;
  const yUnit = sourceYUnit
    ? normalizeYUnitForFamily(
        axisOverrides?.yUnit,
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
  axisOverrides: PlotAxisOverrides | undefined,
): PlotDisplayModel["unitControl"] => {
  const resource = data.source.resource;
  if (!resource) {
    return null;
  }

  const sourceXUnit = normalizeXUnit(data.activeFile?.xUnit, "V") || "V";
  const displayYUnit = normalizeYUnit(data.yUnitLabel);
  return {
    resource,
    sheetId: data.source.sheetId ?? null,
    xUnit: normalizeXUnitForFamily(axisOverrides?.xUnit, sourceXUnit) || sourceXUnit,
    xUnitOptions: getXUnitValuesForFamily(sourceXUnit),
    yScale: resolveYScale(data, axisOverrides),
    yUnit: displayYUnit
      ? normalizeYUnitForFamily(axisOverrides?.yUnit, displayYUnit) || displayYUnit
      : null,
    yUnitOptions: displayYUnit ? getYUnitValuesForFamily(displayYUnit) : [],
  };
};

const getPlotAxisTitleIdentityKey = (
  context: PlotAxisTitleContext,
): string => createCalculationResourceId(context.resource, context.sheetId);

const resolveYScale = (
  data: CalculatedData,
  axisOverrides: PlotAxisOverrides | undefined,
): "linear" | "log" => {
  return axisOverrides?.yScale === "log" ? "log" : "linear";
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
