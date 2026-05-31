import { Disposable } from "src/cs/base/common/lifecycle";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { PreviewContributionId } from "src/cs/workbench/contrib/preview/common/preview";

export class PreviewContribution extends Disposable implements IWorkbenchContribution {}

registerWorkbenchContribution2(PreviewContributionId, PreviewContribution, WorkbenchPhase.AfterRestored);
