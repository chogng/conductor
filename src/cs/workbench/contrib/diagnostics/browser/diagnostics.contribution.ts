import { Disposable } from "src/cs/base/common/lifecycle";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { DiagnosticsContributionId } from "src/cs/workbench/contrib/diagnostics/common/diagnostics";

export class DiagnosticsContribution extends Disposable implements IWorkbenchContribution {}

registerWorkbenchContribution2(DiagnosticsContributionId, DiagnosticsContribution, WorkbenchPhase.AfterRestored);
