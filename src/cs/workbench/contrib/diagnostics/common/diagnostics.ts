export const DiagnosticsContributionId = "workbench.contrib.diagnostics";

export const DiagnosticsViewId = "workbench.diagnostics";

export interface IDiagnosticsService {
  touchAnalysisCacheSourceFile(file: unknown): void;
}
