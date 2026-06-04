import type { MainPlotSeries } from "src/cs/workbench/contrib/plot/browser/mainPlotCanvas";

export type MainPlotRenderModel = {
  readonly activeFile: Partial<{
    fileId: string;
    fileName: string;
    xLabel: string;
    yLabel: string;
  }> | null;
  readonly pointsCount: number;
  readonly seriesList: MainPlotSeries[];
  readonly xDomain: [number, number];
  readonly xUnitLabel: string;
  readonly yDomain: [number, number];
  readonly yUnitLabel: string;
};
