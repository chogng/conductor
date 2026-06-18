/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// Adapts plot render data and settings into the main chart view props.
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  type OriginPlotOptions,
} from "src/cs/workbench/services/origin/common/originPlotOptions";
import {
  createPlotMainChart,
  type PlotMainChartDrawStrategy,
  type PlotMainChartProps,
} from "src/cs/workbench/contrib/plot/browser/plotMainChart";
import type { PlotType } from "src/cs/workbench/services/plot/common/plot";
import type { PlotMainRenderModel } from "src/cs/workbench/services/plot/common/plotModel";
import {
  DEFAULT_PLOT_AXIS_SETTINGS,
  normalizePlotAxisSettings,
  type PlotAxisSettings,
} from "src/cs/workbench/services/plot/common/plotSettings";

export type PlotMainViewProps = {
  readonly drawStrategy?: PlotMainChartDrawStrategy;
  readonly model: PlotMainRenderModel;
  readonly onXAxisLabelChange?: (nextLabel: string) => void;
  readonly onYAxisLabelChange?: (nextLabel: string) => void;
  readonly originOpenPlotOptions?: OriginPlotOptions;
  readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly legendLabels?: Readonly<Record<string, string>>;
  readonly plotXFactor?: number;
  readonly plotXUnitLabel?: string;
  readonly plotYFactor?: number;
  readonly plotYUnitLabel?: string;
  readonly plotType: PlotType;
  readonly renderSignature?: string;
  readonly xAxisLabelOverride?: string;
  readonly yAxisLabelOverride?: string;
  readonly yScaleMode?: "linear" | "log";
};

export type PlotMainView = {
  readonly element: HTMLElement;
  readonly model: PlotMainRenderModel;
  readonly dispose: () => void;
  readonly editAxisTitle: (axis: "x" | "y") => boolean;
};

export const createPlotMainChartProps = ({
  drawStrategy,
  model,
  onXAxisLabelChange,
  onYAxisLabelChange,
  originOpenPlotOptions = DEFAULT_ORIGIN_PLOT_OPTIONS,
  plotAxisSettings,
  legendLabels,
  plotXFactor = 1,
  plotXUnitLabel,
  plotYFactor = 1,
  plotYUnitLabel,
  plotType,
  renderSignature,
  xAxisLabelOverride,
  yAxisLabelOverride,
  yScaleMode = "linear",
}: PlotMainViewProps): PlotMainChartProps => {
  const axisSettings = normalizePlotAxisSettings(
    plotAxisSettings,
    DEFAULT_PLOT_AXIS_SETTINGS,
  );
  return {
    axisLabels: model.axisLabels,
    curveLineWidth: Number(originOpenPlotOptions.lineWidth) || DEFAULT_ORIGIN_PLOT_OPTIONS.lineWidth,
    curvePlotType: Number(originOpenPlotOptions.type ?? DEFAULT_ORIGIN_PLOT_OPTIONS.type),
    curveSymbolShape: Number(originOpenPlotOptions.symbolShape ?? DEFAULT_ORIGIN_PLOT_OPTIONS.symbolShape),
    drawStrategy,
    effectiveYScale: yScaleMode,
    focusedSeriesColor: "#2563eb",
    highlightOverlays: [],
    plotType,
    plotXFactor,
    plotXUnitLabel: plotXUnitLabel ?? model.xUnitLabel,
    plotYFactor,
    plotYUnitLabel: plotYUnitLabel ?? model.yUnitLabel,
    showGrid: axisSettings.showGrid,
    showMajorTicks: axisSettings.showMajorTicks,
    showMinorTicks: axisSettings.showMinorTicks,
    minorTickCount: axisSettings.minorTickCount === "" ? undefined : axisSettings.minorTickCount,
    onXAxisLabelChange,
    onYAxisLabelChange,
    renderSignature,
    tickLabelFontSize: axisSettings.tickLabelFontSize === "" ? undefined : axisSettings.tickLabelFontSize,
    axisTitleFontSize: axisSettings.axisTitleFontSize === "" ? undefined : axisSettings.axisTitleFontSize,
    legendLabels,
    seriesList: model.seriesList,
    ssOverlayStyle: {
      fill: "#2563eb",
      fillOpacity: 0.08,
      stroke: "#2563eb",
      strokeOpacity: 0.8,
    },
    xDomain: model.xDomain,
    xAxisLabelOverride,
    xLabelInterval: 1,
    xTickDigits: 4,
    yDomain: model.yDomain,
    yAxisLabelOverride,
    yScaleMode,
  };
};

export const createPlotMainView = (props: PlotMainViewProps): PlotMainView => {
  const element = createPlotMainChart(createPlotMainChartProps(props));

  return {
    dispose: () => element.dispose(),
    editAxisTitle: (axis) => element.editAxisTitle(axis),
    element,
    model: props.model,
  };
};
