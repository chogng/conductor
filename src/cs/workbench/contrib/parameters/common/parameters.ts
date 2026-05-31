export const ParametersContributionId = "workbench.contrib.parameters";

export const ParametersViewId = "workbench.parameters";

export interface IParametersService<
  TRcAnalysisOptions = unknown,
  TRcAnalysisResult = unknown,
> {
  runRcAnalysis(options: TRcAnalysisOptions): Promise<TRcAnalysisResult>;
}
