import { Disposable, MutableDisposable } from "src/cs/base/common/lifecycle";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { ExportViewPane, type ExportViewPaneOptions } from "src/cs/workbench/contrib/export/browser/exportViewPane";
import { ExportContributionId } from "src/cs/workbench/contrib/export/common/export";

import "src/cs/workbench/contrib/export/browser/media/export.css";

export class ExportContribution extends Disposable implements IWorkbenchContribution {
  private readonly pane = this._register(new MutableDisposable<ExportViewPane>());
  private readonly paneElement = document.createElement("div");

  public get element(): HTMLElement {
    return this.paneElement;
  }

  public render(options: ExportViewPaneOptions): void {
    if (!this.pane.current) {
      this.pane.current = new ExportViewPane(this.paneElement);
    }

    this.pane.current.render(options);
  }
}

registerWorkbenchContribution2(ExportContributionId, ExportContribution, WorkbenchPhase.AfterRestored);
