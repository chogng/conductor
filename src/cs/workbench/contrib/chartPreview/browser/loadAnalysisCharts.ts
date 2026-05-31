type AnalysisChartsModule = typeof import("./analysisCharts");

let analysisChartsModulePromise: Promise<AnalysisChartsModule> | null = null;

export const loadAnalysisCharts = (): Promise<AnalysisChartsModule> => {
  if (!analysisChartsModulePromise) {
    analysisChartsModulePromise = import("./analysisCharts");
  }

  return analysisChartsModulePromise!;
};
