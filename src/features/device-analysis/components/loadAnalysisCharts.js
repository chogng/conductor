let analysisChartsModulePromise = null;

export const loadAnalysisCharts = () => {
  if (!analysisChartsModulePromise) {
    analysisChartsModulePromise = import("./AnalysisCharts");
  }

  return analysisChartsModulePromise;
};
