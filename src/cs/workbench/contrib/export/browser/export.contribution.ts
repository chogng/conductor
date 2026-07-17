/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { LxIcon } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";
import { createAuxiliaryBarActionViewItem } from "src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarPart";
import { ViewPaneContainer } from "src/cs/workbench/browser/parts/views/viewPaneContainer";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  ViewContainerLocation,
  type IViewsRegistry,
} from "src/cs/workbench/common/views";
import { registerExportCommands } from "src/cs/workbench/contrib/export/browser/exportCommands";
import { ExportViewPane } from "src/cs/workbench/contrib/export/browser/exportViewPane";
import {
  ExportContributionId,
  ExportViewContainerId,
  ExportViewId,
} from "src/cs/workbench/services/export/common/export";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
const exportContainer = viewContainersRegistry.registerViewContainer({
  id: ExportViewContainerId,
  title: localize("chart.views.export", "Export"),
  icon: LxIcon.origin,
  order: 10,
  parentViewContainerId: ChartViewContainerId,
  ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [{
    actionViewItemProvider: createAuxiliaryBarActionViewItem,
    className: "workbench-part-view-pane-container",
    id: ExportViewContainerId,
    renderHeader: true,
    title: localize("chart.views.export", "Export"),
  }]),
}, ViewContainerLocation.AuxiliaryBar, { isDefault: true, doNotRegisterOpenCommand: true });

export class ExportContribution extends Disposable implements IWorkbenchContribution {
  public constructor() {
    super();

    registerExportView();
    this._register(registerExportCommands());
  }
}

let exportViewRegistered = false;

function registerExportView(): void {
  if (exportViewRegistered) {
    return;
  }

  exportViewRegistered = true;
  viewsRegistry.registerViews([{
    id: ExportViewId,
    name: localize("chart.views.export", "Export"),
    ctorDescriptor: new SyncDescriptor(ExportViewPane),
    order: 10,
  }], exportContainer);
}

registerWorkbenchContribution2(ExportContributionId, ExportContribution, WorkbenchPhase.BlockStartup);
