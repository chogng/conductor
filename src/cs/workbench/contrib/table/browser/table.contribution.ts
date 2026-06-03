import { Disposable, MutableDisposable } from "src/cs/base/common/lifecycle";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import { TableContributionId } from "src/cs/workbench/contrib/table/common/table";
import TableViewPane, {
  type TableViewPaneProps,
} from "src/cs/workbench/contrib/table/browser/tableViewPane";

import "src/cs/workbench/contrib/table/browser/media/tableView.css";

export class TableContribution extends Disposable implements IWorkbenchContribution {
  private readonly pane = this._register(new MutableDisposable<TableViewPane>());

  public get element(): HTMLElement | null {
    return this.pane.current?.element ?? null;
  }

  public get view(): TableViewPane | null {
    return this.pane.current ?? null;
  }

  public update(props: TableViewPaneProps): void {
    if (!this.pane.current) {
      this.pane.current = new TableViewPane(props);
      return;
    }

    this.pane.current.update(props);
  }
}

registerWorkbenchContribution2(TableContributionId, TableContribution, WorkbenchPhase.AfterRestored);
