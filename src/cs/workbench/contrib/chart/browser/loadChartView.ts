type ChartViewModule = typeof import("./chartView");

let chartViewModulePromise: Promise<ChartViewModule> | null = null;

export const loadChartView = (): Promise<ChartViewModule> => {
  if (!chartViewModulePromise) {
    chartViewModulePromise = import("./chartView");
  }

  return chartViewModulePromise;
};
