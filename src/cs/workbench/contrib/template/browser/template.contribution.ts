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
import { TemplateAuxiliaryBarViewPane } from "src/cs/workbench/contrib/template/browser/templateAuxiliaryBarViewPane";
import { TemplateAuxiliaryBarViewId } from "src/cs/workbench/services/template/common/template";

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
const container = viewContainersRegistry.get(WorkbenchViewContainers.auxiliarybar);

if (container) {
  viewsRegistry.registerViews([{
    id: TemplateAuxiliaryBarViewId,
    name: localize("template_management_title", "Template Management"),
    ctorDescriptor: new SyncDescriptor(TemplateAuxiliaryBarViewPane),
    hideByDefault: false,
    order: 0,
  }], container);
}
