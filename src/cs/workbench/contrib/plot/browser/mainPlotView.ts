import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  type OriginPlotOptions,
} from "src/cs/workbench/contrib/origin/common/originPlotOptions";
import {
  DEFAULT_PLOT_AXIS_SETTINGS,
  normalizePlotAxisSettings,
  type PlotAxisSettings,
} from "src/cs/workbench/contrib/plot/common/plotAxisSettings";
import { createMainPlotCanvas } from "src/cs/workbench/contrib/plot/browser/mainPlotCanvas";
import type { MainPlotRenderModel } from "src/cs/workbench/contrib/plot/browser/mainPlotRenderModel";
import type { PlotType } from "src/cs/workbench/contrib/plot/common/plot";

export type MainPlotViewProps = {
  readonly model: MainPlotRenderModel;
  readonly originOpenPlotOptions?: OriginPlotOptions;
  readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly plotType: PlotType;
};

export type MainPlotView = {
  readonly element: HTMLElement;
  readonly model: MainPlotRenderModel;
};

export const createMainPlotView = ({
  model,
  originOpenPlotOptions = DEFAULT_ORIGIN_PLOT_OPTIONS,
  plotAxisSettings,
  plotType,
}: MainPlotViewProps): MainPlotView => {
  const axisSettings = normalizePlotAxisSettings(
    plotAxisSettings,
    DEFAULT_PLOT_AXIS_SETTINGS,
  );
  return {
    element: createMainPlotCanvas({
      activeFile: model.activeFile,
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
      tickLabelFontSize: axisSettings.tickLabelFontSize === "" ? undefined : axisSettings.tickLabelFontSize,
      axisTitleFontSize: axisSettings.axisTitleFontSize === "" ? undefined : axisSettings.axisTitleFontSize,
      legendFontSize: axisSettings.legendFontSize === "" ? undefined : axisSettings.legendFontSize,
      seriesList: model.seriesList,
      ssOverlayStyle: {
        fill: "#2563eb",
        fillOpacity: 0.08,
        stroke: "#2563eb",
        strokeOpacity: 0.8,
      },
      xDomain: model.xDomain,
      xLabelInterval: 1,
      xTickDigits: 4,
      yDomain: model.yDomain,
      yScaleMode: "linear",
    }),
    model,
  };
};

export {
  createMainPlotInspectorView,
  type MainPlotInspectorProps,
} from "src/cs/workbench/contrib/plot/browser/mainPlotInspectorView";
export { createMainPlotLocatorView } from "src/cs/workbench/contrib/plot/browser/mainPlotLocatorView";
