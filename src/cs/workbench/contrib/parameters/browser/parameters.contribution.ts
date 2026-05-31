import { Disposable } from "src/cs/base/common/lifecycle";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { ParametersContributionId } from "src/cs/workbench/contrib/parameters/common/parameters";

export class ParametersContribution extends Disposable implements IWorkbenchContribution {}

registerWorkbenchContribution2(ParametersContributionId, ParametersContribution, WorkbenchPhase.AfterRestored);
