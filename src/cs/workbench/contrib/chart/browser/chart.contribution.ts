import { Disposable } from "src/cs/base/common/lifecycle";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { ChartContributionId } from "src/cs/workbench/contrib/chart/common/chart";

import "src/cs/workbench/contrib/chart/browser/media/chart.css";

export class ChartContribution extends Disposable implements IWorkbenchContribution {}

registerWorkbenchContribution2(ChartContributionId, ChartContribution, WorkbenchPhase.AfterRestored);
