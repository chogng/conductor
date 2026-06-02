import { Disposable } from "src/cs/base/common/lifecycle";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { ChartViewContributionId } from "src/cs/workbench/contrib/chartPreview/common/chartView";

export class ChartViewContribution extends Disposable implements IWorkbenchContribution {}

registerWorkbenchContribution2(ChartViewContributionId, ChartViewContribution, WorkbenchPhase.AfterRestored);
