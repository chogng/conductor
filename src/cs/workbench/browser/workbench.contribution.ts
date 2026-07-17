/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { Workbench } from "src/cs/workbench/browser/workbench";
import { RESET_LAYOUT_STATE_COMMAND_ID } from "src/cs/workbench/browser/actions/layoutCommands";
import "src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarActions";
import "src/cs/workbench/browser/parts/sidebar/sidebarActions";
import { hideWorkbenchSplash } from "src/cs/workbench/browser/parts/splash/partsSplash";
import {
  CommandsRegistry,
} from "src/cs/platform/commands/common/commands";
import {
  IInstantiationService,
  type IInstantiationService as IInstantiationServiceType,
} from "src/cs/platform/instantiation/common/instantiation";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";

export const WorkbenchContributionId = "workbench.browser.workbench";

const markBootUiReady = (source: string) => {
  hideWorkbenchSplash();
  window.__CONDUCTOR_BOOT_MARK_UI_READY__?.(source);
};

export class WorkbenchContribution extends Disposable implements IWorkbenchContribution {
  private readonly workbench: Workbench;

  constructor(
    @IInstantiationService instantiationService: IInstantiationServiceType,
  ) {
    super();

    const root = document.getElementById("root");
    if (!root) {
      throw new Error('Root element with id "root" was not found.');
    }

    this.workbench = this._register(new Workbench(root, {
      instantiationService,
      onDidRenderInitialWorkbench: () => markBootUiReady("workbench"),
    }));
    this._register(CommandsRegistry.registerCommand({
      id: RESET_LAYOUT_STATE_COMMAND_ID,
      handler: () => this.workbench.resetLayoutState(),
      metadata: {
        description: localize("workbench.commands.resetLayoutState", "Reset workbench layout state"),
      },
    }));
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
