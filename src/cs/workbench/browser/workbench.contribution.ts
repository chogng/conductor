import { scheduleAtNextAnimationFrame } from "src/cs/base/browser/dom";
import { Disposable } from "src/cs/base/common/lifecycle";
import { Workbench } from "src/cs/workbench/browser/workbench";
import { markBootUiReady } from "src/cs/workbench/browser/workbenchBoot";
import {
  IFileDialogService,
  type IFileDialogService as IFileDialogServiceType,
} from "src/cs/platform/dialogs/common/dialogs";
import {
  IFileService,
  type IFileService as IFileServiceType,
} from "src/cs/platform/files/common/files";
import {
  IPathService,
  type IPathService as IPathServiceType,
} from "src/cs/workbench/services/path/common/pathService";
import {
  IAnalysisFileService,
  type IAnalysisFileService as IAnalysisFileServiceType,
} from "src/cs/workbench/services/analysisFile/common/analysisFile";
import {
  IContextMenuService,
  type IContextMenuService as IContextMenuServiceType,
} from "src/cs/platform/contextview/browser/contextView";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import {
  ITableService,
  type ITableService as ITableServiceType,
} from "src/cs/workbench/contrib/table/common/tableService";

export const WorkbenchContributionId = "workbench.browser.workbench";

export class WorkbenchContribution extends Disposable implements IWorkbenchContribution {
  private readonly workbench: Workbench;

  constructor(
    @ITableService tableService: ITableServiceType,
    @IAnalysisFileService analysisFileService: IAnalysisFileServiceType,
    @IFileService filesService: IFileServiceType,
    @IFileDialogService dialogsService: IFileDialogServiceType,
    @IContextMenuService contextMenuService: IContextMenuServiceType,
    @IPathService pathService: IPathServiceType,
  ) {
    super();

    const root = document.getElementById("root");
    if (!root) {
      throw new Error('Root element with id "root" was not found.');
    }

    this.workbench = this._register(new Workbench(root, {
      analysisFileService,
      dialogsService,
      contextMenuService,
      filesService,
      pathService,
      tableService,
    }));
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
