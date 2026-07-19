/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  createSecondCalculatedData,
  type CalculatedData,
} from "src/cs/workbench/services/calculation/common/calculationReadModel";
import {
  type PlotAxisTitleContext,
  type PlotDisplayModel,
  type PlotFileAxisSettings,
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

export type CreatePlotDisplayModelInput = {
  readonly axisSettings?: PlotFileAxisSettings;
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
    fileId: parts.fileId,
    pane: "chart",
    plotType: parts.chartData.kind as PlotType,
    resource: parts.resource,
    sheetId: parts.sheetId,
  });
  const chartYTitleContext = createAxisTitleContext({
    axis: "y",
    fileId: parts.fileId,
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
    fileId: parts.fileId,
    inspector: input.includeInspector === false
      ? null
      : createInspectorDisplayModel({
        axisTitleOverridesByKey: input.axisTitleOverridesByKey,
        chartData: parts.chartData,
        displayUnits: parts.displayUnits,
        fileId: parts.fileId,
        colorSeriesList: parts.colorSeriesList,
        resource: parts.resource,
        sheetId: parts.sheetId,
        yScaleMode: parts.yScaleMode,
      }),
    plotType: parts.chartData.kind as PlotType,
    resource: parts.resource,
    sheetId: parts.sheetId,
    unitControl: createUnitControlModel(parts.chartData, input.axisSettings),
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
    fileId: parts.fileId,
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
  readonly fileId: string;
  readonly resource?: PlotDisplayModel["resource"];
  readonly sheetId?: PlotDisplayModel["sheetId"];
  readonly yScaleMode: "linear" | "log";
} | null => {
  const calculatedData = input.calculatedData;
  const fileId = String(calculatedData?.source.fileId ?? "").trim();
  if (!calculatedData || !fileId) {
    return null;
  }

  const hiddenLegendKeys = input.hiddenLegendKeys ?? [];
  const chartData = applyLegendLabels(
    filterCalculatedDataSeries(calculatedData, hiddenLegendKeys),
    input.legendLabels ?? {},
  );
  const displayUnits = resolveDisplayUnits(chartData, input.axisSettings);
  const yScaleMode = resolveYScale(chartData, input.axisSettings);
  return {
    chartData,
    colorSeriesList: calculatedData.seriesList,
    displayUnits,
    fileId,
    resource: calculatedData.source.resource ?? null,
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
  fileId,
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
  readonly fileId: string;
  readonly resource?: PlotDisplayModel["resource"];
  readonly sheetId?: PlotDisplayModel["sheetId"];
  readonly yScaleMode: "linear" | "log";
}): PlotDisplayModel["inspector"] => {
  const inspectorData = createSecondCalculatedData(chartData);
  const inspectorYUnitLabel = displayUnits.yUnit
    ? `d(${displayUnits.yUnit})/dx`
    : undefined;
  const inspectorXTitleContext = createAxisTitleContext({
    axis: "x",
    fileId,
    pane: "inspector",
    plotType: chartData.kind as PlotType,
    resource,
    sheetId,
  });
  const inspectorYTitleContext = createAxisTitleContext({
    axis: "y",
    fileId,
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
  axisSettings: PlotFileAxisSettings | undefined,
): {
  readonly xFactor: number;
  readonly xUnit: string | undefined;
  readonly yFactor: number;
  readonly yUnit: string | undefined;
} => {
  const fileId = String(data.source.fileId ?? "").trim();
  const sourceXUnit = normalizeXUnit(data.xUnitLabel, "V") || "V";
  const sourceYUnit = normalizeYUnit(data.yUnitLabel);
  const xUnit = normalizeXUnitForFamily(
    fileId ? axisSettings?.xUnitByFileId?.[fileId] : undefined,
    sourceXUnit,
  ) || sourceXUnit;
  const yUnit = sourceYUnit
    ? normalizeYUnitForFamily(
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
  axisSettings: PlotFileAxisSettings | undefined,
): PlotDisplayModel["unitControl"] => {
  const fileId = String(data.source.fileId ?? "").trim();
  if (!fileId) {
    return null;
  }

  const sourceXUnit = normalizeXUnit(data.activeFile?.xUnit, "V") || "V";
  const displayYUnit = normalizeYUnit(data.yUnitLabel);
  return {
    fileId,
    xUnit: normalizeXUnitForFamily(axisSettings?.xUnitByFileId?.[fileId], sourceXUnit) || sourceXUnit,
    xUnitOptions: getXUnitValuesForFamily(sourceXUnit),
    yScale: resolveYScale(data, axisSettings),
    yUnit: displayYUnit
      ? normalizeYUnitForFamily(axisSettings?.yUnitByFileId?.[fileId], displayYUnit) || displayYUnit
      : null,
    yUnitOptions: displayYUnit ? getYUnitValuesForFamily(displayYUnit) : [],
  };
};

const getPlotAxisTitleIdentityKey = (
  context: PlotAxisTitleContext,
): string => {
  const resource = getResourceKey(context.resource);
  if (!resource) {
    return context.fileId;
  }

  const sheetId = String(context.sheetId ?? "").trim();
  return sheetId ? `${resource}\u0000${sheetId}` : resource;
};

const getResourceKey = (resource: unknown): string => {
  const text = getResourceString(resource);
  if (text) {
    return text.replace(/\\/g, "/");
  }

  const components = resource as {
    readonly authority?: unknown;
    readonly fragment?: unknown;
    readonly path?: unknown;
    readonly query?: unknown;
    readonly scheme?: unknown;
  } | null | undefined;
  const path = String(components?.path ?? "").trim();
  if (!path) {
    return "";
  }

  const scheme = String(components?.scheme ?? "").trim();
  const authority = String(components?.authority ?? "").trim();
  const query = String(components?.query ?? "").trim();
  const fragment = String(components?.fragment ?? "").trim();
  if (scheme === "file") {
    return [
      "file://",
      authority,
      path,
      query ? `?${query}` : "",
      fragment ? `#${fragment}` : "",
    ].join("").replace(/\\/g, "/");
  }

  return [
    scheme ? `${scheme}:` : "",
    authority ? `//${authority}` : "",
    path,
    query ? `?${query}` : "",
    fragment ? `#${fragment}` : "",
  ].join("").replace(/\\/g, "/");
};

const getResourceString = (resource: unknown): string => {
  const toString = (resource as { readonly toString?: unknown } | null | undefined)?.toString;
  if (typeof toString !== "function") {
    return "";
  }

  const text = String(toString.call(resource) ?? "").trim();
  return text === "[object Object]" ? "" : text;
};

const resolveYScale = (
  data: CalculatedData,
  axisSettings: PlotFileAxisSettings | undefined,
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
