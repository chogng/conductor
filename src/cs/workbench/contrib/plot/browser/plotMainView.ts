import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  type OriginPlotOptions,
} from "src/cs/workbench/contrib/origin/common/originPlotOptions";
import {
  DEFAULT_PLOT_AXIS_SETTINGS,
  normalizePlotAxisSettings,
  type PlotAxisSettings,
} from "src/cs/workbench/contrib/plot/common/plotAxisSettings";
import {
  createPlotMainChart,
  type PlotMainChartProps,
} from "src/cs/workbench/contrib/plot/browser/plotMainChart";
import type { PlotMainRenderModel } from "src/cs/workbench/contrib/plot/browser/plotMainRenderModel";
import type { PlotType } from "src/cs/workbench/contrib/plot/common/plot";

export type PlotMainViewProps = {
  readonly model: PlotMainRenderModel;
  readonly onXAxisLabelChange?: (nextLabel: string) => void;
  readonly onYAxisLabelChange?: (nextLabel: string) => void;
  readonly originOpenPlotOptions?: OriginPlotOptions;
  readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly legendLabels?: Readonly<Record<string, string>>;
  readonly plotType: PlotType;
  readonly xAxisLabelOverride?: string;
  readonly yAxisLabelOverride?: string;
};

export type PlotMainView = {
  readonly element: HTMLElement;
  readonly model: PlotMainRenderModel;
  readonly dispose: () => void;
};

export const createPlotMainChartProps = ({
  model,
  onXAxisLabelChange,
  onYAxisLabelChange,
  originOpenPlotOptions = DEFAULT_ORIGIN_PLOT_OPTIONS,
  plotAxisSettings,
  legendLabels,
  plotType,
  xAxisLabelOverride,
  yAxisLabelOverride,
}: PlotMainViewProps): PlotMainChartProps => {
  const axisSettings = normalizePlotAxisSettings(
    plotAxisSettings,
    DEFAULT_PLOT_AXIS_SETTINGS,
  );
  return {
    axisLabels: model.axisLabels,
    curveLineWidth: Number(originOpenPlotOptions.lineWidth) || DEFAULT_ORIGIN_PLOT_OPTIONS.lineWidth,
    curvePlotType: Number(originOpenPlotOptions.type ?? DEFAULT_ORIGIN_PLOT_OPTIONS.type),
    effectiveYScale: "linear",
    focusedSeriesColor: "#2563eb",
    highlightOverlays: [],
    plotType,
    plotXFactor: 1,
    plotXUnitLabel: model.xUnitLabel,
    plotYFactor: 1,
    plotYUnitLabel: model.yUnitLabel,
    showGrid: axisSettings.showGrid,
    showMajorTicks: axisSettings.showMajorTicks,
    showMinorTicks: axisSettings.showMinorTicks,
    minorTickCount: axisSettings.minorTickCount === "" ? undefined : axisSettings.minorTickCount,
    onXAxisLabelChange,
    onYAxisLabelChange,
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
    yScaleMode: "linear",
  };
};

export const createPlotMainView = (props: PlotMainViewProps): PlotMainView => {
  const element = createPlotMainChart(createPlotMainChartProps(props));

  return {
    dispose: () => element.dispose(),
    element,
    model: props.model,
  };
};
