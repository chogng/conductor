import { Disposable } from "src/cs/base/common/lifecycle";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { PlotContributionId } from "src/cs/workbench/contrib/plot/common/plot";

import "src/cs/workbench/contrib/plot/browser/media/plot.css";

export class PlotContribution extends Disposable implements IWorkbenchContribution {}

registerWorkbenchContribution2(PlotContributionId, PlotContribution, WorkbenchPhase.AfterRestored);
