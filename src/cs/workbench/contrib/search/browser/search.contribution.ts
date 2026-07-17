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
import { registerSearchCommands } from "src/cs/workbench/contrib/search/browser/searchCommands";
import { SearchViewPane } from "src/cs/workbench/contrib/search/browser/searchViewPane";
import {
  SearchContributionId,
  SearchViewContainerId,
  SearchViewId,
} from "src/cs/workbench/services/search/common/search";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
const searchContainer = viewContainersRegistry.registerViewContainer({
  id: SearchViewContainerId,
  title: localize("chart.views.search", "Search"),
  icon: LxIcon.search,
  order: 0,
  parentViewContainerId: ChartViewContainerId,
  ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [{
    actionViewItemProvider: createAuxiliaryBarActionViewItem,
    className: "workbench-part-view-pane-container",
    id: SearchViewContainerId,
    renderHeader: true,
    title: localize("chart.views.search", "Search"),
  }]),
}, ViewContainerLocation.AuxiliaryBar, { doNotRegisterOpenCommand: true });

export class SearchContribution extends Disposable implements IWorkbenchContribution {
  public constructor() {
    super();

    registerSearchView();
    this._register(registerSearchCommands());
  }
}

let searchViewRegistered = false;

function registerSearchView(): void {
  if (searchViewRegistered) {
    return;
  }

  searchViewRegistered = true;
  viewsRegistry.registerViews([{
    id: SearchViewId,
    name: localize("chart.views.search", "Search"),
    ctorDescriptor: new SyncDescriptor(SearchViewPane),
    order: 5,
  }], searchContainer);
}

registerWorkbenchContribution2(SearchContributionId, SearchContribution, WorkbenchPhase.BlockStartup);
