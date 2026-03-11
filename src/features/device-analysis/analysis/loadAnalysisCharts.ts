type AnalysisChartsModule = typeof import("./components/AnalysisCharts");

let analysisChartsModulePromise: Promise<AnalysisChartsModule> | null = null;

export const loadAnalysisCharts = (): Promise<AnalysisChartsModule> => {
  if (!analysisChartsModulePromise) {
    analysisChartsModulePromise = import("./components/AnalysisCharts");
  }

  return analysisChartsModulePromise!;
};
