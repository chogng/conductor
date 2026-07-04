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
  ActiveWorkbenchMainPartContext,
} from "src/cs/workbench/browser/contextkeys";
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  ViewContainerLocation,
  type IViewsRegistry,
} from "src/cs/workbench/common/views";
import { registerOriginCommands } from "src/cs/workbench/contrib/origin/browser/originCommands";
import { OriginSettingsViewPane } from "src/cs/workbench/contrib/origin/browser/originSettingsViewPane";
import {
  OriginContributionId,
  OriginExportSettingsViewContainerId,
  OriginExportSettingsViewId,
} from "src/cs/workbench/services/origin/common/origin";

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
const originContainer = viewContainersRegistry.registerViewContainer({
  id: OriginExportSettingsViewContainerId,
  title: localize("origin.curveSettings.title", "Origin Settings"),
  ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [{
    actionViewItemProvider: createAuxiliaryBarActionViewItem,
    className: "workbench-part-view-pane-container",
    id: OriginExportSettingsViewContainerId,
    renderHeader: true,
    title: localize("origin.curveSettings.title", "Origin Settings"),
  }]),
}, ViewContainerLocation.AuxiliaryBar, { isDefault: true, doNotRegisterOpenCommand: true });

export class OriginContribution extends Disposable implements IWorkbenchContribution {
  public constructor() {
    super();

    registerOriginView();
    this._register(registerOriginCommands());
  }
}

let originViewRegistered = false;

function registerOriginView(): void {
  if (originViewRegistered) {
    return;
  }

  originViewRegistered = true;
  viewsRegistry.registerViews([{
    id: OriginExportSettingsViewId,
    name: localize("origin.curveSettings.title", "Origin Settings"),
    ctorDescriptor: new SyncDescriptor(OriginSettingsViewPane),
    order: 30,
    when: ContextKeyExpr.and(
      ActiveWorkbenchMainPartContext.isEqualTo("chart"),
      ActiveAuxiliaryBarViewContext.isEqualTo("settings"),
    ),
  }], originContainer);
}

registerWorkbenchContribution2(OriginContributionId, OriginContribution, WorkbenchPhase.BlockStartup);
