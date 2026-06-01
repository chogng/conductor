import { scheduleAtNextAnimationFrame } from "src/cs/base/browser/dom";
import { Disposable } from "src/cs/base/common/lifecycle";
import { Workbench } from "src/cs/workbench/browser/workbench";
import { markBootUiReady } from "src/cs/workbench/browser/workbenchBoot";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import {
  ITableService,
  type ITableService as ITableServiceType,
} from "src/cs/workbench/services/table/common/table";
import {
  ICommandService,
  type ICommandService as ICommandServiceType,
} from "src/cs/workbench/services/commands/common/commands";

export const WorkbenchContributionId = "workbench.browser.workbench";

export class WorkbenchContribution extends Disposable implements IWorkbenchContribution {
  private readonly workbench: Workbench;

  constructor(
    @ITableService tableService: ITableServiceType,
    @ICommandService commandService: ICommandServiceType,
  ) {
    super();

    const root = document.getElementById("root");
    if (!root) {
      throw new Error('Root element with id "root" was not found.');
    }

    this.workbench = this._register(new Workbench(root, { commandService, tableService }));
    this._register(
      scheduleAtNextAnimationFrame(window, () => {
        markBootUiReady("workbench");
      }),
    );
  }

  public get contentElement(): HTMLElement {
    return this.workbench.contentElement;
  }
}

registerWorkbenchContribution2(
  WorkbenchContributionId,
  WorkbenchContribution,
  WorkbenchPhase.BlockStartup,
);

import "src/cs/workbench/contrib/import/browser/media/importerViewlet.css";
