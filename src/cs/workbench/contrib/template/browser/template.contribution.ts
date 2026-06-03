import { Disposable } from "src/cs/base/common/lifecycle";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { TemplateContributionId } from "src/cs/workbench/contrib/template/common/template";

import "src/cs/workbench/contrib/template/browser/templateApplyService";
import "src/cs/workbench/contrib/template/browser/templateService";

export class TemplateContribution extends Disposable implements IWorkbenchContribution {}

registerWorkbenchContribution2(TemplateContributionId, TemplateContribution, WorkbenchPhase.AfterRestored);
