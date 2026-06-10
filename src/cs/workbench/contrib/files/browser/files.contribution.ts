/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";
import { WorkbenchViewContainers } from "src/cs/workbench/common/workbenchViewContainers";
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  type IViewsRegistry,
} from "src/cs/workbench/common/views";
import "src/cs/workbench/contrib/files/browser/explorerCommands";
import { FilesPaneHost } from "src/cs/workbench/contrib/files/browser/filesPaneHost";
import { ExplorerViewId } from "src/cs/workbench/services/explorer/common/explorer";

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
const container = viewContainersRegistry.get(WorkbenchViewContainers.files);

if (container) {
  viewsRegistry.registerViews([{
    id: ExplorerViewId,
    name: localize("files.explorerSection", "Explorer"),
    ctorDescriptor: new SyncDescriptor(FilesPaneHost),
    hideByDefault: false,
    order: 0,
  }], container);
}
