import { Disposable } from "src/cs/base/common/lifecycle";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import { TableContributionId } from "src/cs/workbench/contrib/table/common/table";

export class TableContribution extends Disposable implements IWorkbenchContribution {}

registerWorkbenchContribution2(TableContributionId, TableContribution, WorkbenchPhase.AfterRestored);
