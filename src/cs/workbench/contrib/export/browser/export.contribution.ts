import { Disposable } from "src/cs/base/common/lifecycle";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { ExportContributionId } from "src/cs/workbench/contrib/export/common/export";

export class ExportContribution extends Disposable implements IWorkbenchContribution {}

registerWorkbenchContribution2(ExportContributionId, ExportContribution, WorkbenchPhase.AfterRestored);
