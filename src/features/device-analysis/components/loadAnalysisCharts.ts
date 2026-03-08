type AnalysisChartsModule = typeof import("./AnalysisCharts");

let analysisChartsModulePromise: Promise<AnalysisChartsModule> | null = null;

export const loadAnalysisCharts = (): Promise<AnalysisChartsModule> => {
  if (!analysisChartsModulePromise) {
    analysisChartsModulePromise = import("./AnalysisCharts");
  }

  return analysisChartsModulePromise!;
};
