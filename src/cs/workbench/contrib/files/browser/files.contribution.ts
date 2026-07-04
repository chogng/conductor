/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  type IViewsRegistry,
} from "src/cs/workbench/common/views";
import "src/cs/workbench/contrib/files/browser/fileActions.contribution";
import { ExplorerViewPane } from "src/cs/workbench/contrib/files/browser/explorerViewlet";
import {
  ExplorerViewContainerId,
  ExplorerViewId,
} from "src/cs/workbench/contrib/files/browser/files";

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
const container = viewContainersRegistry.get(ExplorerViewContainerId);

if (container) {
  viewsRegistry.registerViews([{
    id: ExplorerViewId,
    name: localize("files.explorerSection", "Explorer"),
    ctorDescriptor: new SyncDescriptor(ExplorerViewPane),
    hideByDefault: false,
    order: 0,
  }], container);
}
