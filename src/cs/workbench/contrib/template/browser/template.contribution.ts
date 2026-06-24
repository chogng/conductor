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
import { registerTemplateCommands } from "src/cs/workbench/contrib/template/browser/templateCommands";
import { TemplateViewId } from "src/cs/workbench/contrib/template/common/template";
import { TemplateViewPane } from "src/cs/workbench/contrib/template/browser/templateViewlet";

registerTemplateCommands();

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
const container = viewContainersRegistry.get(WorkbenchViewContainers.auxiliarybar);

if (container) {
  viewsRegistry.registerViews([{
    id: TemplateViewId,
    name: localize("template.management.title", "Template Management"),
    ctorDescriptor: new SyncDescriptor(TemplateViewPane),
    hideByDefault: false,
    order: 0,
  }], container);
}
