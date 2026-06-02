import { Disposable } from "src/cs/base/common/lifecycle";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { ChartContributionId } from "src/cs/workbench/contrib/chart/common/chart";

export class ChartContribution extends Disposable implements IWorkbenchContribution {}

registerWorkbenchContribution2(ChartContributionId, ChartContribution, WorkbenchPhase.AfterRestored);
