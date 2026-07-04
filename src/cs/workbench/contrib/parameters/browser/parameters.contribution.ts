/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";
import { ContextKeyExpr } from "src/cs/platform/contextkey/common/contextkey";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import {
  ActiveAuxiliaryBarViewContext,
  ActiveWorkbenchMainPartContext,
} from "src/cs/workbench/browser/contextkeys";
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  type IViewsRegistry,
} from "src/cs/workbench/common/views";
import { registerParametersCommands } from "src/cs/workbench/contrib/parameters/browser/parametersCommands";
import { ParametersViewPane } from "src/cs/workbench/contrib/parameters/browser/parametersViewPane";
import {
  ParametersContributionId,
  ParametersViewContainerId,
  ParametersViewId,
} from "src/cs/workbench/services/parameters/common/parameters";

export class ParametersContribution extends Disposable implements IWorkbenchContribution {
  public constructor() {
    super();

    registerParametersView();
    this._register(registerParametersCommands());
  }
}

let parametersViewRegistered = false;

function registerParametersView(): void {
  if (parametersViewRegistered) {
    return;
  }

  const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
  const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
  const container = viewContainersRegistry.get(ParametersViewContainerId);
  if (!container) {
    return;
  }

  parametersViewRegistered = true;
  viewsRegistry.registerViews([{
    id: ParametersViewId,
    name: localize("chart.views.parameters", "Parameters"),
    ctorDescriptor: new SyncDescriptor(ParametersViewPane),
    order: 20,
    when: ContextKeyExpr.and(
      ActiveWorkbenchMainPartContext.isEqualTo("chart"),
      ActiveAuxiliaryBarViewContext.isEqualTo("parameters"),
    ),
  }], container);
}

registerWorkbenchContribution2(ParametersContributionId, ParametersContribution, WorkbenchPhase.BlockStartup);
