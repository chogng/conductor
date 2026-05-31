import { Disposable } from "src/cs/base/common/lifecycle";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { ChartPreviewContributionId } from "src/cs/workbench/contrib/chartPreview/common/chartPreview";

export class ChartPreviewContribution extends Disposable implements IWorkbenchContribution {}

registerWorkbenchContribution2(ChartPreviewContributionId, ChartPreviewContribution, WorkbenchPhase.AfterRestored);
