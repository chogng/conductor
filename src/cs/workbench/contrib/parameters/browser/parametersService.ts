import {
  runRcAnalysis,
  type RunRcAnalysisOptions,
  type RunRcAnalysisResult,
} from "src/cs/workbench/contrib/parameters/browser/parametersController";
import type { IParametersService } from "src/cs/workbench/contrib/parameters/common/parameters";

export class BrowserParametersService
  implements IParametersService<RunRcAnalysisOptions, RunRcAnalysisResult>
{
  runRcAnalysis(options: RunRcAnalysisOptions): Promise<RunRcAnalysisResult> {
    return runRcAnalysis(options);
  }
}
