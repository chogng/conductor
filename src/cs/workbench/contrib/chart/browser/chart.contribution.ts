/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { ContextKeyExpr } from "src/cs/platform/contextkey/common/contextkey";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";
import { ViewPaneContainer } from "src/cs/workbench/browser/parts/views/viewPaneContainer";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { ActivePanelViewContainerContext } from "src/cs/workbench/common/contextkeys";
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  ViewContainerLocation,
  type IViewsRegistry,
} from "src/cs/workbench/common/views";
import {
  ChartContributionId,
  ChartViewContainerId,
  ChartViewId,
} from "src/cs/workbench/services/chart/common/chart";
import { registerChartCommands } from "src/cs/workbench/contrib/chart/browser/chartCommands";
import ChartViewPane from "src/cs/workbench/contrib/chart/browser/chartViewPane";
import "src/cs/workbench/contrib/chart/browser/chartExplorerSelection";

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
const chartContainer = viewContainersRegistry.registerViewContainer({
  id: ChartViewContainerId,
  title: localize("workbench.views.chart", "Chart"),
  ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [{
    className: "workbench-part-view-pane-container",
    id: ChartViewContainerId,
    renderHeader: false,
    title: localize("workbench.views.chart", "Chart"),
  }]),
}, ViewContainerLocation.Panel, { isDefault: true, doNotRegisterOpenCommand: true });

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

  chartViewRegistered = true;
  viewsRegistry.registerViews([{
    id: ChartViewId,
    name: localize("chart.title", "Chart"),
    ctorDescriptor: new SyncDescriptor(ChartViewPane),
    hideByDefault: false,
    order: 10,
    when: ContextKeyExpr.and(
      ActivePanelViewContainerContext.isEqualTo(ChartViewContainerId),
    ),
  }], chartContainer);
}

registerWorkbenchContribution2(ChartContributionId, ChartContribution, WorkbenchPhase.BlockStartup);
