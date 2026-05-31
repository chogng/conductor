import { Disposable } from "src/cs/base/common/lifecycle";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { DataContributionId } from "src/cs/workbench/contrib/data/common/data";

export class DataContribution extends Disposable implements IWorkbenchContribution {}

registerWorkbenchContribution2(DataContributionId, DataContribution, WorkbenchPhase.AfterRestored);
