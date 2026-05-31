import { scheduleAtNextAnimationFrame } from "src/cs/base/browser/dom";
import { Disposable } from "src/cs/base/common/lifecycle";
import { Workbench } from "src/cs/workbench/browser/workbench";
import { markBootUiReady } from "src/cs/workbench/browser/workbenchBoot";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";

export const WorkbenchContributionId = "workbench.browser.workbench";

export class WorkbenchContribution extends Disposable implements IWorkbenchContribution {
  private readonly workbench: Workbench;

  constructor() {
    super();

    const root = document.getElementById("root");
    if (!root) {
      throw new Error('Root element with id "root" was not found.');
    }

    this.workbench = this._register(new Workbench(root));
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

import "src/cs/workbench/browser/media/workbenchPart.css";
import "src/cs/workbench/contrib/import/browser/media/importerViewlet.css";
import "src/cs/workbench/contrib/onboarding/onboarding.css";
