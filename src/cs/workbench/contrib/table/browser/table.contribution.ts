/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { ContextKeyExpr } from "src/cs/platform/contextkey/common/contextkey";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";
import { ViewPaneContainer } from "src/cs/workbench/browser/parts/views/viewPaneContainer";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import { ActivePanelViewContainerContext } from "src/cs/workbench/common/contextkeys";
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  ViewContainerLocation,
  type IViewsRegistry,
} from "src/cs/workbench/common/views";
import {
  TableContributionId,
  TableViewContainerId,
  TableViewId,
} from "src/cs/workbench/contrib/table/common/table";
import TableViewPane from "src/cs/workbench/contrib/table/browser/tableViewPane";
import { registerTableActions } from "src/cs/workbench/contrib/table/browser/tableActions";
import "src/cs/workbench/contrib/table/browser/tableReviewDecorationsProvider";
import "src/cs/workbench/contrib/table/browser/tableTemplateDecorationsProvider";

import "src/cs/workbench/contrib/table/browser/media/tableView.css";

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
const tableContainer = viewContainersRegistry.registerViewContainer({
  id: TableViewContainerId,
  title: localize("workbench.views.table", "Table"),
  ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [{
    className: "workbench-part-view-pane-container",
    id: TableViewContainerId,
    renderHeader: false,
    title: localize("workbench.views.table", "Table"),
  }]),
}, ViewContainerLocation.Panel, { isDefault: true, doNotRegisterOpenCommand: true });

export class TableContribution extends Disposable implements IWorkbenchContribution {
  public constructor() {
    super();
    registerTableView();
    this._register(registerTableActions());
  }
}

let tableViewRegistered = false;

function registerTableView(): void {
  if (tableViewRegistered) {
    return;
  }

  tableViewRegistered = true;
  viewsRegistry.registerViews([{
    id: TableViewId,
    name: localize("table.ariaLabel", "Table"),
    ctorDescriptor: new SyncDescriptor(TableViewPane),
    hideByDefault: false,
    order: 0,
    when: ContextKeyExpr.and(
      ActivePanelViewContainerContext.isEqualTo(TableViewContainerId),
    ),
  }], tableContainer);
}

registerWorkbenchContribution2(TableContributionId, TableContribution, WorkbenchPhase.BlockStartup);
