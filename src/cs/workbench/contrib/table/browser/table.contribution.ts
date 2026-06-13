/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { ContextKeyExpr } from "src/cs/platform/contextkey/common/contextkey";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import { WorkbenchViewContainers } from "src/cs/workbench/common/workbenchViewContainers";
import { ActiveWorkbenchMainPartContext } from "src/cs/workbench/browser/contextkeys";
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  type IViewsRegistry,
} from "src/cs/workbench/common/views";
import {
  TableContributionId,
  TableViewId,
} from "src/cs/workbench/services/table/common/table";
import TableViewPane from "src/cs/workbench/contrib/table/browser/tableViewPane";
import { registerTableCommands } from "src/cs/workbench/contrib/table/browser/tableCommands";

import "src/cs/workbench/contrib/table/browser/media/tableView.css";

export class TableContribution extends Disposable implements IWorkbenchContribution {
  public constructor() {
    super();
    registerTableView();
    this._register(registerTableCommands());
  }
}

let tableViewRegistered = false;

function registerTableView(): void {
  if (tableViewRegistered) {
    return;
  }

  const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
  const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
  const container = viewContainersRegistry.get(WorkbenchViewContainers.main);
  if (!container) {
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
      ActiveWorkbenchMainPartContext.isEqualTo("table"),
    ),
  }], container);
}

registerWorkbenchContribution2(TableContributionId, TableContribution, WorkbenchPhase.BlockStartup);
