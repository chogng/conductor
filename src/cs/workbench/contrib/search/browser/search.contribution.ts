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
import {
  ActiveAuxiliaryBarViewContext,
  ActiveWorkbenchMainPartContext,
} from "src/cs/workbench/browser/contextkeys";
import { WorkbenchViewContainers } from "src/cs/workbench/common/workbenchViewContainers";
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  type IViewsRegistry,
} from "src/cs/workbench/common/views";
import { registerSearchCommands } from "src/cs/workbench/contrib/search/browser/searchCommands";
import { SearchViewPane } from "src/cs/workbench/contrib/search/browser/searchViewPane";
import {
  SearchContributionId,
  SearchViewId,
} from "src/cs/workbench/services/search/common/search";

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

  const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
  const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
  const container = viewContainersRegistry.get(WorkbenchViewContainers.search);
  if (!container) {
    return;
  }

  searchViewRegistered = true;
  viewsRegistry.registerViews([{
    id: SearchViewId,
    name: localize("chart.views.search", "Search"),
    ctorDescriptor: new SyncDescriptor(SearchViewPane),
    order: 5,
    when: ContextKeyExpr.and(
      ActiveWorkbenchMainPartContext.isEqualTo("chart"),
      ActiveAuxiliaryBarViewContext.isEqualTo("search"),
    ),
  }], container);
}

registerWorkbenchContribution2(SearchContributionId, SearchContribution, WorkbenchPhase.BlockStartup);
