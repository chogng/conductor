/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { ContextKeyExpr } from "src/cs/platform/contextkey/common/contextkey";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { ActiveWorkbenchMainPartContext } from "src/cs/workbench/browser/contextkeys";
import { WorkbenchViewContainers } from "src/cs/workbench/common/workbenchViewContainers";
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  type IViewsRegistry,
} from "src/cs/workbench/common/views";
import {
  ChartContributionId,
  ChartViewId,
} from "src/cs/workbench/services/chart/common/chart";
import { registerChartCommands } from "src/cs/workbench/contrib/chart/browser/chartCommands";
import ChartViewPane from "src/cs/workbench/contrib/chart/browser/chartViewPane";

export class ChartContribution extends Disposable implements IWorkbenchContribution {
  public constructor() {
    super();

    registerChartView();
    this._register(registerChartCommands());
  }
}

let chartViewRegistered = false;

function registerChartView(): void {
  if (chartViewRegistered) {
    return;
  }

  const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
  const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
  const container = viewContainersRegistry.get(WorkbenchViewContainers.main);
  if (!container) {
    return;
  }

  chartViewRegistered = true;
  viewsRegistry.registerViews([{
    id: ChartViewId,
    name: localize("chart.title", "Chart"),
    ctorDescriptor: new SyncDescriptor(ChartViewPane),
    hideByDefault: false,
    order: 10,
    when: ContextKeyExpr.and(
      ActiveWorkbenchMainPartContext.isEqualTo("chart"),
    ),
  }], container);
}

registerWorkbenchContribution2(ChartContributionId, ChartContribution, WorkbenchPhase.BlockStartup);
