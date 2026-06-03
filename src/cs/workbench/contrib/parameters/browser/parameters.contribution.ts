import { Disposable, MutableDisposable } from "src/cs/base/common/lifecycle";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { ParametersViewPane } from "src/cs/workbench/contrib/parameters/browser/parametersViewPane";
import type { ParametersViewOptions } from "src/cs/workbench/contrib/parameters/browser/parametersView";
import { ParametersContributionId } from "src/cs/workbench/contrib/parameters/common/parameters";

export class ParametersContribution extends Disposable implements IWorkbenchContribution {
  private readonly pane = this._register(new MutableDisposable<ParametersViewPane>());
  private readonly paneElement = document.createElement("div");

  public get element(): HTMLElement {
    return this.paneElement;
  }

  public renderParameters(options: ParametersViewOptions): void {
    if (!this.pane.current) {
      this.pane.current = new ParametersViewPane(this.paneElement);
    }

    this.pane.current.renderParameters(options);
  }
}

registerWorkbenchContribution2(ParametersContributionId, ParametersContribution, WorkbenchPhase.AfterRestored);
