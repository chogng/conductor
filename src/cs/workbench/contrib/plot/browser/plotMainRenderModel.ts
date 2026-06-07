// Builds the normalized render model consumed by the plot main view.
import type { PlotMainSeries } from "src/cs/workbench/contrib/plot/browser/plotMainChart";

export type PlotMainAxisLabels = {
  readonly [key: string]: unknown;
  readonly xLabel?: unknown;
  readonly yLabel?: unknown;
};

export type PlotMainRenderModel = {
  readonly axisLabels: PlotMainAxisLabels | null;
  readonly pointsCount: number;
  readonly seriesList: PlotMainSeries[];
  readonly xDomain: [number, number];
  readonly xUnitLabel: string;
  readonly yDomain: [number, number];
  readonly yUnitLabel: string;
};

export const createPlotMainRenderModel = (source: {
  readonly activeFile?: PlotMainAxisLabels | null;
  readonly pointsCount: number;
  readonly seriesList: PlotMainSeries[];
  readonly xDomain: [number, number];
  readonly xUnitLabel: string;
  readonly yDomain: [number, number];
  readonly yUnitLabel: string;
}): PlotMainRenderModel => ({
  axisLabels: source.activeFile
    ? {
        xLabel: source.activeFile.xLabel,
        yLabel: source.activeFile.yLabel,
      }
    : null,
  pointsCount: source.pointsCount,
  seriesList: source.seriesList,
  xDomain: source.xDomain,
  xUnitLabel: source.xUnitLabel,
  yDomain: source.yDomain,
  yUnitLabel: source.yUnitLabel,
});
