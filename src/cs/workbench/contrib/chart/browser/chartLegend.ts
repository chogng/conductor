import { localize } from "src/cs/nls";
import type { AnalysisPanelProps } from "src/cs/workbench/contrib/chart/browser/analysisPanel";
import { getCalculatedData, type CalculatedSeries } from "src/cs/workbench/contrib/calculation/common/calculatedData";
import { createMainPlotLegend } from "src/cs/workbench/contrib/plot/browser/mainPlotCanvas";
import type { PlotType } from "src/cs/workbench/contrib/plot/common/plot";
import {
  DEFAULT_PLOT_AXIS_SETTINGS,
  normalizePlotAxisSettings,
} from "src/cs/workbench/contrib/plot/common/plotAxisSettings";

export type LegendContext = {
  readonly fileId: string;
  readonly plotType: PlotType;
  readonly seriesList: CalculatedSeries[];
};

export const getLegendContext = (
  props: AnalysisPanelProps,
  plotType: PlotType,
): LegendContext | null => {
  const calculatedData = getCalculatedData(
    props.calculatedDataByKey,
    plotType,
    props.activeFileId,
  );
  if (!calculatedData?.seriesList.length) {
    return null;
  }

  return {
    fileId: String(calculatedData.source.fileId ?? ""),
    plotType,
    seriesList: calculatedData.seriesList,
  };
};

export const isSameLegendContext = (
  left: LegendContext,
  right: LegendContext,
): boolean =>
  left.fileId === right.fileId &&
  left.plotType === right.plotType &&
  left.seriesList === right.seriesList;

export const createLegendPopover = (
  props: AnalysisPanelProps,
  context: LegendContext,
  options: {
    readonly hiddenLegendKeys?: readonly string[];
    readonly onToggleLegendItem?: (legendKey: string) => void;
  } = {},
): HTMLElement => {
  const axisSettings = normalizePlotAxisSettings(
    props.plotAxisSettings,
    DEFAULT_PLOT_AXIS_SETTINGS,
  );
  const legend = createMainPlotLegend({
    hiddenLegendKeys: options.hiddenLegendKeys,
    legendFontSize: axisSettings.legendFontSize === "" ? undefined : axisSettings.legendFontSize,
    onToggleLegendItem: options.onToggleLegendItem,
    seriesList: context.seriesList,
  });
  legend.setAttribute("role", "dialog");
  legend.setAttribute("aria-label", localize("chart_legend_heading", "Legend"));
  return legend;
};
