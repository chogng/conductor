/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";
import { ContextKeyExpr } from "src/cs/platform/contextkey/common/contextkey";
import { createAuxiliaryBarActionViewItem } from "src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarPart";
import { ViewPaneContainer } from "src/cs/workbench/browser/parts/views/viewPaneContainer";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import {
  ActiveAuxiliaryBarViewContext,
  ActivePanelViewContainerContext,
} from "src/cs/workbench/common/contextkeys";
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  ViewContainerLocation,
  type IViewsRegistry,
} from "src/cs/workbench/common/views";
import { registerParametersCommands } from "src/cs/workbench/contrib/parameters/browser/parametersCommands";
import { ParametersViewPane } from "src/cs/workbench/contrib/parameters/browser/parametersViewPane";
import {
  ParametersContributionId,
  ParametersViewContainerId,
  ParametersViewId,
} from "src/cs/workbench/services/parameters/common/parameters";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
const parametersContainer = viewContainersRegistry.registerViewContainer({
  id: ParametersViewContainerId,
  title: localize("chart.views.parameters", "Parameters"),
  ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [{
    actionViewItemProvider: createAuxiliaryBarActionViewItem,
    className: "workbench-part-view-pane-container",
    id: ParametersViewContainerId,
    renderHeader: true,
    title: localize("chart.views.parameters", "Parameters"),
  }]),
}, ViewContainerLocation.AuxiliaryBar, { isDefault: true, doNotRegisterOpenCommand: true });

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

  parametersViewRegistered = true;
  viewsRegistry.registerViews([{
    id: ParametersViewId,
    name: localize("chart.views.parameters", "Parameters"),
    ctorDescriptor: new SyncDescriptor(ParametersViewPane),
    order: 20,
    when: ContextKeyExpr.and(
      ActivePanelViewContainerContext.isEqualTo(ChartViewContainerId),
      ActiveAuxiliaryBarViewContext.isEqualTo("parameters"),
    ),
  }], parametersContainer);
}

registerWorkbenchContribution2(ParametersContributionId, ParametersContribution, WorkbenchPhase.BlockStartup);
