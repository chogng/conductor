/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";
import { createSidebarActionViewItem } from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import { ViewPaneContainer } from "src/cs/workbench/browser/parts/views/viewPaneContainer";
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  ViewContainerLocation,
  type IViewsRegistry,
} from "src/cs/workbench/common/views";
import "src/cs/workbench/contrib/files/browser/fileActions.contribution";
import "src/cs/workbench/contrib/files/browser/views/explorerDecorationsProvider";
import { ExplorerViewPane } from "src/cs/workbench/contrib/files/browser/explorerViewlet";
import {
  ExplorerViewContainerId,
  ExplorerViewId,
} from "src/cs/workbench/contrib/files/browser/files";

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
const container = viewContainersRegistry.registerViewContainer({
  id: ExplorerViewContainerId,
  title: localize("workbench.views.files", "Files"),
  ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [{
    actionViewItemProvider: createSidebarActionViewItem,
    className: "workbench-part-view-pane-container",
    id: ExplorerViewContainerId,
    renderHeader: true,
    title: localize("workbench.views.files", "Files"),
  }]),
}, ViewContainerLocation.Sidebar, { isDefault: true, doNotRegisterOpenCommand: true });

viewsRegistry.registerViews([{
  id: ExplorerViewId,
  name: localize("files.explorerSection", "Explorer"),
  ctorDescriptor: new SyncDescriptor(ExplorerViewPane),
  hideByDefault: false,
  order: 0,
}], container);
