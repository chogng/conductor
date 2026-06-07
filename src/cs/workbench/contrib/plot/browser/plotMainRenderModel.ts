import type { PlotMainSeries } from "src/cs/workbench/contrib/plot/browser/plotMainChart";

export type PlotMainRenderModel = {
  readonly activeFile: Partial<{
    fileId: string;
    fileName: string;
    xLabel: string;
    yLabel: string;
  }> | null;
  readonly pointsCount: number;
  readonly seriesList: PlotMainSeries[];
  readonly xDomain: [number, number];
  readonly xUnitLabel: string;
  readonly yDomain: [number, number];
  readonly yUnitLabel: string;
};
